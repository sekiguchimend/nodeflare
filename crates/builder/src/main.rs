use anyhow::Result;
use apalis::prelude::*;
use apalis_redis::RedisStorage;
use mcp_auth::CryptoService;
use mcp_common::{types::LogStream, AppConfig, EventPublisher};
use mcp_db::{DeploymentRepository, NotificationSettingsRepository, SecretRepository, ServerRepository, UpdateDeployment, UserRepository, WorkspaceRepository};
use mcp_email::EmailService;
use mcp_github::GitHubApp;
use mcp_queue::{BuildJob, DeployJob, JobQueue};
use std::sync::Arc;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod docker;
mod flyio;

/// Send deployment notification email to workspace owner
async fn send_deploy_notification(
    ctx: &BuilderContext,
    server_id: uuid::Uuid,
    success: bool,
    error_message: Option<&str>,
) {
    let email_service = match &ctx.email {
        Some(s) => s,
        None => return,
    };

    // Get server -> workspace -> owner user
    let server = match ServerRepository::find_by_id(&ctx.db, server_id).await {
        Ok(Some(s)) => s,
        _ => return,
    };

    let workspace = match WorkspaceRepository::find_by_id(&ctx.db, server.workspace_id).await {
        Ok(Some(w)) => w,
        _ => return,
    };

    let owner = match UserRepository::find_by_id(&ctx.db, workspace.owner_id).await {
        Ok(Some(u)) => u,
        _ => return,
    };

    // Check notification settings
    let settings = match NotificationSettingsRepository::get_or_create(&ctx.db, owner.id).await {
        Ok(s) => s,
        _ => return,
    };

    let app_url = std::env::var("APP_URL").unwrap_or_else(|_| "https://mcpcloud.dev".to_string());

    if success && settings.email_deploy_success {
        let deploy_url = format!("{}/dashboard/servers/{}", app_url, server_id);
        if let Err(e) = email_service.send_deploy_success(&owner.email, &server.name, &deploy_url).await {
            tracing::error!("Failed to send deploy success email: {}", e);
        }
    } else if !success && settings.email_deploy_failure {
        let logs_url = format!("{}/dashboard/servers/{}/logs", app_url, server_id);
        let error_msg = error_message.unwrap_or("Unknown error");
        if let Err(e) = email_service.send_deploy_failure(&owner.email, &server.name, error_msg, &logs_url).await {
            tracing::error!("Failed to send deploy failure email: {}", e);
        }
    }
}

struct BuilderContext {
    config: AppConfig,
    db: mcp_db::DbPool,
    docker: bollard::Docker,
    job_queue: JobQueue,
    crypto: CryptoService,
    github: Option<GitHubApp>,
    events: EventPublisher,
    email: Option<EmailService>,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "mcp_builder=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = AppConfig::from_env()?;
    tracing::info!("Starting MCP Cloud Builder Worker");

    let db_pool = mcp_db::create_pool(&config).await?;
    let docker = bollard::Docker::connect_with_local_defaults()?;
    let job_queue = JobQueue::connect(&config.redis.url).await?;

    // Create crypto service for decrypting secrets
    let crypto = CryptoService::from_hex(
        &std::env::var("ENCRYPTION_KEY").expect("ENCRYPTION_KEY must be set"),
    )
    .expect("Invalid encryption key");

    // Create GitHub App client (optional - may not have valid credentials in dev)
    let github = GitHubApp::new(&config).ok();
    if github.is_some() {
        tracing::info!("GitHub App initialized");
    } else {
        tracing::warn!("GitHub App not configured - will use public repos only");
    }

    // Create event publisher for real-time WebSocket updates
    let events = EventPublisher::new(&config.redis.url);

    // Create email service (optional)
    let email = match EmailService::from_env() {
        Ok(service) => {
            tracing::info!("Resend email service initialized");
            Some(service)
        }
        Err(e) => {
            tracing::warn!("Email service not configured: {} - email notifications disabled", e);
            None
        }
    };

    let context = Arc::new(BuilderContext {
        config: config.clone(),
        db: db_pool,
        docker,
        job_queue,
        crypto,
        github,
        events,
        email,
    });

    // Connect to Redis for job queue
    let redis_url = &config.redis.url;
    let redis_client = redis::Client::open(redis_url.as_str())?;
    let redis_conn = redis::aio::ConnectionManager::new(redis_client).await?;

    let storage = RedisStorage::<BuildJob>::new_with_config(
        redis_conn.clone(),
        apalis_redis::Config::default(),
    );
    let deploy_storage = RedisStorage::<DeployJob>::new_with_config(
        redis_conn,
        apalis_redis::Config::default(),
    );

    tracing::info!("Connected to job queue");

    // Create workers
    let build_worker = WorkerBuilder::new("build-worker")
        .data(context.clone())
        .backend(storage)
        .build_fn(handle_build_job);

    let deploy_worker = WorkerBuilder::new("deploy-worker")
        .data(context.clone())
        .backend(deploy_storage)
        .build_fn(handle_deploy_job);

    // Run workers
    Monitor::new()
        .register(build_worker)
        .register(deploy_worker)
        .run()
        .await?;

    Ok(())
}

async fn handle_build_job(job: BuildJob, ctx: Data<Arc<BuilderContext>>) -> Result<(), Error> {
    tracing::info!("Processing build job: {:?}", job.deployment_id);

    // Update deployment status to building
    DeploymentRepository::update(
        &ctx.db,
        job.deployment_id,
        UpdateDeployment {
            status: Some(mcp_common::types::DeploymentStatus::Building),
            ..Default::default()
        },
    )
    .await
    .map_err(|e| Error::Failed(Arc::new(e.into())))?;

    // Publish building status via WebSocket
    ctx.events
        .publish_deployment_status(
            job.deployment_id,
            job.server_id,
            mcp_common::types::DeploymentStatus::Building,
            None,
            Some(10),
        )
        .await
        .ok();

    // Parse owner/repo from github_repo
    let parts: Vec<&str> = job.github_repo.split('/').collect();
    if parts.len() != 2 {
        let err_msg = format!("Invalid github_repo format: {}", job.github_repo);
        DeploymentRepository::update(
            &ctx.db,
            job.deployment_id,
            UpdateDeployment {
                status: Some(mcp_common::types::DeploymentStatus::Failed),
                error_message: Some(err_msg.clone()),
                finished_at: Some(chrono::Utc::now()),
                ..Default::default()
            },
        )
        .await
        .ok();
        return Err(Error::Failed(Arc::new(anyhow::anyhow!(err_msg).into())));
    }
    let (owner, repo) = (parts[0], parts[1]);

    let image_tag = format!("mcp-cloud/{}", job.server_id);

    // Helper to log and publish to WebSocket
    let publish_log = |ctx: &BuilderContext, deployment_id: uuid::Uuid, msg: &str| {
        let events = ctx.events.clone();
        let msg = msg.to_string();
        async move {
            events.publish_build_log(deployment_id, &msg, LogStream::Stdout).await.ok();
        }
    };

    // Try to download tarball via GitHub App, fallback to git clone for public repos
    let build_result = if let (Some(github), Some(installation_id)) = (&ctx.github, job.github_installation_id) {
        let log_msg = "Downloading source from GitHub...";
        DeploymentRepository::append_log(&ctx.db, job.deployment_id, log_msg).await.ok();
        ctx.events.publish_build_log(job.deployment_id, log_msg, LogStream::Stdout).await.ok();

        match github.download_tarball(installation_id, owner, repo, &job.github_branch).await {
            Ok(tarball) => {
                let log_msg = format!("Downloaded {} bytes, building image...", tarball.len());
                DeploymentRepository::append_log(&ctx.db, job.deployment_id, &log_msg).await.ok();
                ctx.events.publish_build_log(job.deployment_id, &log_msg, LogStream::Stdout).await.ok();
                docker::build_image_from_tarball(&ctx.docker, &tarball, &job, &image_tag).await
            }
            Err(e) => {
                tracing::warn!("GitHub App download failed, falling back to git clone: {}", e);
                let log_msg = "Falling back to git clone...";
                DeploymentRepository::append_log(&ctx.db, job.deployment_id, log_msg).await.ok();
                ctx.events.publish_build_log(job.deployment_id, log_msg, LogStream::Stdout).await.ok();
                docker::build_image(&ctx.docker, &job, &image_tag).await
            }
        }
    } else {
        // No GitHub App or no installation ID - use git clone for public repos
        let log_msg = "Cloning public repository...";
        DeploymentRepository::append_log(&ctx.db, job.deployment_id, log_msg).await.ok();
        ctx.events.publish_build_log(job.deployment_id, log_msg, LogStream::Stdout).await.ok();
        docker::build_image(&ctx.docker, &job, &image_tag).await
    };

    match build_result {
        Ok(_) => {
            let log_msg = "Build successful!";
            DeploymentRepository::append_log(&ctx.db, job.deployment_id, log_msg).await.ok();
            ctx.events.publish_build_log(job.deployment_id, log_msg, LogStream::Stdout).await.ok();

            // Update to pushing status
            DeploymentRepository::update(
                &ctx.db,
                job.deployment_id,
                UpdateDeployment {
                    status: Some(mcp_common::types::DeploymentStatus::Pushing),
                    ..Default::default()
                },
            )
            .await
            .ok();

            // Publish pushing status
            ctx.events
                .publish_deployment_status(
                    job.deployment_id,
                    job.server_id,
                    mcp_common::types::DeploymentStatus::Pushing,
                    None,
                    Some(60),
                )
                .await
                .ok();

            // Push to Fly.io registry
            let app_name = format!("mcp-{}", job.server_id.to_string().split('-').next().unwrap());
            let registry_url = format!("registry.fly.io/{}", app_name);

            let log_msg = format!("Pushing image to {}...", registry_url);
            DeploymentRepository::append_log(&ctx.db, job.deployment_id, &log_msg).await.ok();
            ctx.events.publish_build_log(job.deployment_id, &log_msg, LogStream::Stdout).await.ok();

            match docker::push_image(&ctx.docker, &image_tag, &registry_url).await {
                Ok(full_image_url) => {
                    let log_msg = "Push successful! Queuing deploy job...";
                    DeploymentRepository::append_log(&ctx.db, job.deployment_id, log_msg).await.ok();
                    ctx.events.publish_build_log(job.deployment_id, log_msg, LogStream::Stdout).await.ok();

                    // Get secrets for this server and decrypt them
                    let encrypted_secrets = SecretRepository::list_by_server(&ctx.db, job.server_id)
                        .await
                        .unwrap_or_default();

                    let secrets: Vec<mcp_queue::SecretEnv> = encrypted_secrets
                        .into_iter()
                        .filter_map(|secret| {
                            ctx.crypto
                                .decrypt(&secret.encrypted_value, &secret.nonce)
                                .ok()
                                .and_then(|bytes| String::from_utf8(bytes).ok())
                                .map(|value| mcp_queue::SecretEnv {
                                    key: secret.key,
                                    value,
                                })
                        })
                        .collect();

                    // Enqueue deploy job
                    let deploy_job = DeployJob {
                        deployment_id: job.deployment_id,
                        server_id: job.server_id,
                        image_url: full_image_url,
                        secrets,
                        region: job.region.clone(),
                    };

                    if let Err(e) = ctx.job_queue.push_deploy_job(deploy_job).await {
                        tracing::error!("Failed to enqueue deploy job: {}", e);
                        DeploymentRepository::update(
                            &ctx.db,
                            job.deployment_id,
                            UpdateDeployment {
                                status: Some(mcp_common::types::DeploymentStatus::Failed),
                                error_message: Some(format!("Failed to queue deploy: {}", e)),
                                finished_at: Some(chrono::Utc::now()),
                                ..Default::default()
                            },
                        )
                        .await
                        .ok();
                    } else {
                        tracing::info!("Deploy job enqueued for deployment {}", job.deployment_id);
                    }
                }
                Err(e) => {
                    tracing::error!("Push failed: {}", e);
                    let error_msg = format!("Push failed: {}", e);

                    DeploymentRepository::update(
                        &ctx.db,
                        job.deployment_id,
                        UpdateDeployment {
                            status: Some(mcp_common::types::DeploymentStatus::Failed),
                            error_message: Some(error_msg.clone()),
                            finished_at: Some(chrono::Utc::now()),
                            ..Default::default()
                        },
                    )
                    .await
                    .ok();

                    // Publish failed status
                    ctx.events
                        .publish_deployment_status(
                            job.deployment_id,
                            job.server_id,
                            mcp_common::types::DeploymentStatus::Failed,
                            Some(error_msg.clone()),
                            Some(100),
                        )
                        .await
                        .ok();
                    ctx.events.publish_build_log(job.deployment_id, &error_msg, LogStream::Stderr).await.ok();

                    ServerRepository::update_status(
                        &ctx.db,
                        job.server_id,
                        mcp_common::types::ServerStatus::Failed,
                        None,
                    )
                    .await
                    .ok();
                }
            }
        }
        Err(e) => {
            tracing::error!("Build failed: {}", e);
            let error_msg = e.to_string();

            DeploymentRepository::update(
                &ctx.db,
                job.deployment_id,
                UpdateDeployment {
                    status: Some(mcp_common::types::DeploymentStatus::Failed),
                    error_message: Some(error_msg.clone()),
                    finished_at: Some(chrono::Utc::now()),
                    ..Default::default()
                },
            )
            .await
            .ok();

            // Publish failed status
            ctx.events
                .publish_deployment_status(
                    job.deployment_id,
                    job.server_id,
                    mcp_common::types::DeploymentStatus::Failed,
                    Some(error_msg.clone()),
                    Some(100),
                )
                .await
                .ok();
            ctx.events.publish_build_log(job.deployment_id, &error_msg, LogStream::Stderr).await.ok();

            ServerRepository::update_status(
                &ctx.db,
                job.server_id,
                mcp_common::types::ServerStatus::Failed,
                None,
            )
            .await
            .ok();
        }
    }

    Ok(())
}

async fn handle_deploy_job(job: DeployJob, ctx: Data<Arc<BuilderContext>>) -> Result<(), Error> {
    tracing::info!("Processing deploy job: {:?}", job.deployment_id);

    // Update deployment status
    DeploymentRepository::update(
        &ctx.db,
        job.deployment_id,
        UpdateDeployment {
            status: Some(mcp_common::types::DeploymentStatus::Deploying),
            ..Default::default()
        },
    )
    .await
    .map_err(|e| Error::Failed(Arc::new(e.into())))?;

    // Publish deploying status
    ctx.events
        .publish_deployment_status(
            job.deployment_id,
            job.server_id,
            mcp_common::types::DeploymentStatus::Deploying,
            None,
            Some(80),
        )
        .await
        .ok();

    // Deploy to Fly.io
    match flyio::deploy(&ctx.config, &job).await {
        Ok(endpoint_url) => {
            DeploymentRepository::update(
                &ctx.db,
                job.deployment_id,
                UpdateDeployment {
                    status: Some(mcp_common::types::DeploymentStatus::Succeeded),
                    finished_at: Some(chrono::Utc::now()),
                    ..Default::default()
                },
            )
            .await
            .ok();

            // Publish succeeded status
            ctx.events
                .publish_deployment_status(
                    job.deployment_id,
                    job.server_id,
                    mcp_common::types::DeploymentStatus::Succeeded,
                    None,
                    Some(100),
                )
                .await
                .ok();

            ServerRepository::update_status(
                &ctx.db,
                job.server_id,
                mcp_common::types::ServerStatus::Running,
                Some(&endpoint_url),
            )
            .await
            .ok();

            // Send success email notification
            send_deploy_notification(&ctx, job.server_id, true, None).await;
        }
        Err(e) => {
            tracing::error!("Deploy failed: {}", e);
            let error_msg = e.to_string();

            DeploymentRepository::update(
                &ctx.db,
                job.deployment_id,
                UpdateDeployment {
                    status: Some(mcp_common::types::DeploymentStatus::Failed),
                    error_message: Some(error_msg.clone()),
                    finished_at: Some(chrono::Utc::now()),
                    ..Default::default()
                },
            )
            .await
            .ok();

            // Publish failed status
            ctx.events
                .publish_deployment_status(
                    job.deployment_id,
                    job.server_id,
                    mcp_common::types::DeploymentStatus::Failed,
                    Some(error_msg.clone()),
                    Some(100),
                )
                .await
                .ok();

            ServerRepository::update_status(
                &ctx.db,
                job.server_id,
                mcp_common::types::ServerStatus::Failed,
                None,
            )
            .await
            .ok();

            // Send failure email notification
            send_deploy_notification(&ctx, job.server_id, false, Some(&error_msg)).await;
        }
    }

    Ok(())
}
