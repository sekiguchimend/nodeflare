use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::Datelike;
use mcp_billing::Plan as BillingPlan;
use mcp_common::types::{CreateServerRequest, PaginationParams, ServerResponse, UpdateServerRequest};
use mcp_db::{CreateServer, ServerRepository, UpdateServer, WorkspaceRepository};
use serde_json::json;
use std::sync::Arc;
use uuid::Uuid;

use crate::error::AppError;
use crate::extractors::{workspace, AuthUser};
use crate::state::AppState;

#[derive(serde::Deserialize)]
pub struct ServerPath {
    pub workspace_id: Uuid,
    pub server_id: Uuid,
}

/// List all servers across all workspaces the user has access to
pub async fn list_all(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
) -> Result<Json<Vec<ServerResponse>>, AppError> {
    // Use single JOIN query to prevent N+1 problem
    let servers = ServerRepository::list_all_by_user(&state.db, auth_user.user_id)
        .await?;

    let response: Vec<ServerResponse> = servers
        .into_iter()
        .map(|s| {
            let runtime = s.runtime();
            let visibility = s.visibility();
            let access_mode = s.access_mode();
            let status = s.status();
            ServerResponse {
                id: s.id,
                workspace_id: s.workspace_id,
                name: s.name,
                slug: s.slug,
                description: s.description,
                github_repo: s.github_repo,
                github_branch: s.github_branch,
                runtime,
                visibility,
                access_mode,
                status,
                endpoint_url: s.endpoint_url,
                region: s.region,
                root_directory: s.root_directory,
                created_at: s.created_at,
                updated_at: s.updated_at,
            }
        })
        .collect();

    Ok(Json(response))
}

pub async fn list(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(workspace_id): Path<Uuid>,
    Query(pagination): Query<PaginationParams>,
) -> Result<Json<Vec<ServerResponse>>, AppError> {
    // Check membership
    workspace::require_member(&state.db, workspace_id, auth_user.user_id).await?;

    let servers = ServerRepository::list_by_workspace(
        &state.db,
        workspace_id,
        pagination.limit() as i64,
        pagination.offset() as i64,
    )
    .await?;

    let response: Vec<ServerResponse> = servers
        .into_iter()
        .map(|s| {
            let runtime = s.runtime();
            let visibility = s.visibility();
            let access_mode = s.access_mode();
            let status = s.status();
            ServerResponse {
                id: s.id,
                workspace_id: s.workspace_id,
                name: s.name,
                slug: s.slug,
                description: s.description,
                github_repo: s.github_repo,
                github_branch: s.github_branch,
                runtime,
                visibility,
                access_mode,
                status,
                endpoint_url: s.endpoint_url,
                region: s.region,
                root_directory: s.root_directory,
                created_at: s.created_at,
                updated_at: s.updated_at,
            }
        })
        .collect();

    Ok(Json(response))
}

pub async fn create(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(workspace_id): Path<Uuid>,
    Json(body): Json<CreateServerRequest>,
) -> Result<Json<ServerResponse>, AppError> {
    // SECURITY: Validate input using validator crate
    use validator::Validate;
    if let Err(validation_errors) = body.validate() {
        let error_messages: Vec<String> = validation_errors
            .field_errors()
            .iter()
            .flat_map(|(field, errors)| {
                errors.iter().map(move |e| {
                    format!("{}: {}", field, e.message.as_ref().map(|m| m.to_string()).unwrap_or_else(|| e.code.to_string()))
                })
            })
            .collect();
        return Err(AppError::bad_request(
            "VALIDATION_ERROR",
            &error_messages.join(", "),
        ).with_details(json!({
            "errors": error_messages
        })));
    }

    // Validate runtime
    let runtime = body.runtime.clone().unwrap_or_default();
    if !matches!(runtime,
        mcp_common::types::Runtime::Node |
        mcp_common::types::Runtime::Python |
        mcp_common::types::Runtime::Go |
        mcp_common::types::Runtime::Rust |
        mcp_common::types::Runtime::Docker
    ) {
        return Err(AppError::bad_request(
            "INVALID_RUNTIME",
            &format!("Unsupported runtime: {:?}. Supported runtimes are: node, python, go, rust, docker", runtime),
        ).with_details(json!({
            "provided_runtime": format!("{:?}", runtime),
            "supported_runtimes": ["node", "python", "go", "rust", "docker"]
        })));
    }

    // Check membership and write permission
    workspace::require_write_access(&state.db, workspace_id, auth_user.user_id).await?;

    // Get workspace to check plan limits
    let workspace = WorkspaceRepository::find_by_id(&state.db, workspace_id)
        .await
        .map_err(|e| {
            tracing::error!("Database error fetching workspace: {}", e);
            AppError::internal("Failed to fetch workspace")
        })?
        .ok_or_else(|| AppError::not_found("Workspace not found"))?;

    // Check plan limits for server count
    let billing_plan = match workspace.plan.as_str() {
        "pro" => BillingPlan::Pro,
        "team" => BillingPlan::Team,
        "enterprise" => BillingPlan::Enterprise,
        _ => BillingPlan::Free,
    };
    let limits = billing_plan.limits();

    let current_server_count = ServerRepository::count_by_workspace(&state.db, workspace_id)
        .await
        .map_err(|e| {
            tracing::error!("Database error counting servers: {}", e);
            AppError::internal("Failed to check server count")
        })?;

    if current_server_count >= limits.max_servers as i64 {
        return Err(AppError::payment_required(
            "SERVER_LIMIT_REACHED",
            &format!(
                "You have reached the maximum number of servers ({}) for your {} plan. Please upgrade to create more servers.",
                limits.max_servers,
                workspace.plan
            ),
        ).with_details(json!({
            "current_count": current_server_count,
            "max_allowed": limits.max_servers,
            "plan": workspace.plan,
            "upgrade_url": "/dashboard/billing"
        })));
    }

    // Check if slug is already taken
    if let Some(existing) = ServerRepository::find_by_slug(&state.db, workspace_id, &body.slug)
        .await
        .map_err(|e| {
            tracing::error!("Database error checking slug: {}", e);
            AppError::internal("Failed to check server slug availability")
        })?
    {
        return Err(AppError::conflict(
            "SLUG_ALREADY_EXISTS",
            &format!("A server with slug '{}' already exists in this workspace", body.slug),
        ).with_details(json!({
            "conflicting_slug": body.slug,
            "existing_server_name": existing.name,
            "suggestion": format!("{}-2", body.slug)
        })));
    }

    // Validate GitHub repo format
    let repo_parts: Vec<&str> = body.github_repo.split('/').collect();
    if repo_parts.len() != 2 {
        return Err(AppError::bad_request(
            "INVALID_GITHUB_REPO",
            "GitHub repository must be in format 'owner/repo'",
        ).with_details(json!({
            "provided_repo": body.github_repo,
            "expected_format": "owner/repo",
            "example": "octocat/my-mcp-server"
        })));
    }
    let (owner, repo) = (repo_parts[0], repo_parts[1]);
    let branch = body.github_branch.clone().unwrap_or_else(|| "main".to_string());

    // Validate MCP repository structure
    if let (Some(github), Some(installation_id)) = (&state.github, body.github_installation_id) {
        let runtime_str = match &runtime {
            mcp_common::types::Runtime::Node => "node",
            mcp_common::types::Runtime::Python => "python",
            mcp_common::types::Runtime::Go => "go",
            mcp_common::types::Runtime::Rust => "rust",
            mcp_common::types::Runtime::Docker => "docker",
        };

        match github.validate_mcp_repository(
            installation_id,
            owner,
            repo,
            &branch,
            Some(runtime_str),
        ).await {
            Ok(validation) => {
                if !validation.is_valid {
                    return Err(AppError::bad_request(
                        "INVALID_MCP_REPOSITORY",
                        "Repository does not appear to be a valid MCP server",
                    ).with_details(json!({
                        "errors": validation.errors,
                        "warnings": validation.warnings,
                        "detected_runtime": validation.detected_runtime,
                        "expected_runtime": runtime_str,
                        "help": "Make sure your repository contains package.json (Node.js) or requirements.txt/pyproject.toml (Python) with MCP SDK dependencies"
                    })));
                }

                // Log warnings if any
                for warning in &validation.warnings {
                    tracing::warn!("MCP validation warning for {}/{}: {}", owner, repo, warning);
                }
            }
            Err(e) => {
                tracing::warn!("Failed to validate MCP repository: {}", e);
                // Don't block creation, just log warning
            }
        }
    }

    let server = ServerRepository::create(
        &state.db,
        CreateServer {
            workspace_id,
            name: body.name.clone(),
            slug: body.slug.clone(),
            description: body.description.clone(),
            github_repo: body.github_repo.clone(),
            github_branch: body.github_branch.clone().unwrap_or_else(|| "main".to_string()),
            github_installation_id: body.github_installation_id,
            runtime,
            visibility: body.visibility.clone().unwrap_or_default(),
            access_mode: body.access_mode.clone().unwrap_or_default(),
            region: body.region.clone().unwrap_or_else(|| "nrt".to_string()),
            root_directory: body.root_directory.clone().unwrap_or_default(),
        },
    )
    .await
    .map_err(|e| {
        tracing::error!("Failed to create server: {}", e);
        let error_msg = e.to_string();

        // Parse specific database errors
        if error_msg.contains("duplicate key") {
            if error_msg.contains("slug") {
                return AppError::conflict(
                    "SLUG_ALREADY_EXISTS",
                    &format!("A server with slug '{}' already exists", body.slug),
                );
            }
            return AppError::conflict("DUPLICATE_ENTRY", "A server with these details already exists");
        }

        AppError::internal("Failed to create server. Please try again.")
    })?;

    let runtime = server.runtime();
    let visibility = server.visibility();
    let access_mode = server.access_mode();
    let status = server.status();
    Ok(Json(ServerResponse {
        id: server.id,
        workspace_id: server.workspace_id,
        name: server.name,
        slug: server.slug,
        description: server.description,
        github_repo: server.github_repo,
        github_branch: server.github_branch,
        runtime,
        visibility,
        access_mode,
        status,
        endpoint_url: server.endpoint_url,
        region: server.region,
        root_directory: server.root_directory,
        created_at: server.created_at,
        updated_at: server.updated_at,
    }))
}

pub async fn get(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(path): Path<ServerPath>,
) -> Result<Json<ServerResponse>, AppError> {
    // Check membership
    workspace::require_member(&state.db, path.workspace_id, auth_user.user_id).await?;

    let server = ServerRepository::find_by_id(&state.db, path.server_id)
        .await?
        .ok_or_else(|| AppError::not_found("Server"))?;

    if server.workspace_id != path.workspace_id {
        return Err(AppError::not_found("Server"));
    }

    let runtime = server.runtime();
    let visibility = server.visibility();
    let access_mode = server.access_mode();
    let status = server.status();
    Ok(Json(ServerResponse {
        id: server.id,
        workspace_id: server.workspace_id,
        name: server.name,
        slug: server.slug,
        description: server.description,
        github_repo: server.github_repo,
        github_branch: server.github_branch,
        runtime,
        visibility,
        access_mode,
        status,
        endpoint_url: server.endpoint_url,
        region: server.region,
        root_directory: server.root_directory,
        created_at: server.created_at,
        updated_at: server.updated_at,
    }))
}

pub async fn update(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(path): Path<ServerPath>,
    Json(body): Json<UpdateServerRequest>,
) -> Result<Json<ServerResponse>, AppError> {
    // Check membership and write permission
    workspace::require_write_access(&state.db, path.workspace_id, auth_user.user_id).await?;

    // Verify server belongs to this workspace
    let existing = ServerRepository::find_by_id(&state.db, path.server_id)
        .await?
        .ok_or_else(|| AppError::not_found("Server"))?;

    if existing.workspace_id != path.workspace_id {
        return Err(AppError::not_found("Server"));
    }

    let server = ServerRepository::update(
        &state.db,
        path.server_id,
        UpdateServer {
            name: body.name,
            description: body.description,
            github_branch: body.github_branch,
            visibility: body.visibility,
            access_mode: body.access_mode,
            status: None,
            endpoint_url: None,
            region: body.region,
            root_directory: body.root_directory,
        },
    )
    .await?;

    let runtime = server.runtime();
    let visibility = server.visibility();
    let access_mode = server.access_mode();
    let status = server.status();
    Ok(Json(ServerResponse {
        id: server.id,
        workspace_id: server.workspace_id,
        name: server.name,
        slug: server.slug,
        description: server.description,
        github_repo: server.github_repo,
        github_branch: server.github_branch,
        runtime,
        visibility,
        access_mode,
        status,
        endpoint_url: server.endpoint_url,
        region: server.region,
        root_directory: server.root_directory,
        created_at: server.created_at,
        updated_at: server.updated_at,
    }))
}

pub async fn delete(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(path): Path<ServerPath>,
) -> Result<StatusCode, AppError> {
    // Check membership and admin permission (only owner/admin can delete)
    workspace::require_admin(&state.db, path.workspace_id, auth_user.user_id).await?;

    // Verify server belongs to this workspace
    let existing = ServerRepository::find_by_id(&state.db, path.server_id)
        .await?
        .ok_or_else(|| AppError::not_found("Server"))?;

    if existing.workspace_id != path.workspace_id {
        return Err(AppError::not_found("Server"));
    }

    ServerRepository::delete(&state.db, path.server_id).await?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn deploy(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(path): Path<ServerPath>,
) -> Result<Json<mcp_common::types::DeploymentResponse>, AppError> {
    // Check membership and write permission
    workspace::require_write_access(&state.db, path.workspace_id, auth_user.user_id).await?;

    // Get workspace to check plan limits
    let workspace = WorkspaceRepository::find_by_id(&state.db, path.workspace_id)
        .await?
        .ok_or_else(|| AppError::not_found("Workspace"))?;

    // Check deployment limits for this month
    let billing_plan = match workspace.plan.as_str() {
        "pro" => BillingPlan::Pro,
        "team" => BillingPlan::Team,
        "enterprise" => BillingPlan::Enterprise,
        _ => BillingPlan::Free,
    };
    let limits = billing_plan.limits();

    // Get first day of current month
    let now = chrono::Utc::now();
    let month_start = chrono::NaiveDate::from_ymd_opt(now.year(), now.month(), 1)
        .and_then(|d| d.and_hms_opt(0, 0, 0))
        .map(|dt| dt.and_utc())
        .unwrap_or(now); // Fallback to now if date calculation fails (should never happen)

    let deployments_this_month = mcp_db::DeploymentRepository::count_by_workspace_since(
        &state.db,
        path.workspace_id,
        month_start,
    )
    .await?;

    if deployments_this_month >= limits.max_deployments_per_month as i64 {
        return Err(AppError::payment_required(
            "DEPLOYMENT_LIMIT_REACHED",
            &format!(
                "You have reached the maximum number of deployments ({}) for your {} plan this month. Please upgrade to deploy more.",
                limits.max_deployments_per_month,
                workspace.plan
            ),
        ).with_details(json!({
            "current_count": deployments_this_month,
            "max_allowed": limits.max_deployments_per_month,
            "plan": workspace.plan,
            "upgrade_url": "/dashboard/billing"
        })));
    }

    // Get server
    let server = ServerRepository::find_by_id(&state.db, path.server_id)
        .await?
        .ok_or_else(|| AppError::not_found("Server"))?;

    if server.workspace_id != path.workspace_id {
        return Err(AppError::not_found("Server"));
    }

    // Parse owner/repo from github_repo
    let parts: Vec<&str> = server.github_repo.split('/').collect();
    if parts.len() != 2 {
        return Err(AppError::bad_request("INVALID_GITHUB_REPO", "Invalid github_repo format"));
    }
    let (owner, repo) = (parts[0], parts[1]);

    // Get latest commit SHA from GitHub
    let commit_sha = if let (Some(github), Some(installation_id)) = (&state.github, server.github_installation_id) {
        match github.get_latest_commit(installation_id, owner, repo, &server.github_branch).await {
            Ok(commit) => commit.sha,
            Err(e) => {
                tracing::warn!("Failed to get commit SHA from GitHub: {}, using HEAD", e);
                "HEAD".to_string()
            }
        }
    } else {
        // No GitHub App - try to get commit via public API
        // SECURITY: Configure HTTP client with timeout and redirect policy
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .connect_timeout(std::time::Duration::from_secs(5))
            .redirect(reqwest::redirect::Policy::limited(3))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        let url = format!(
            "https://api.github.com/repos/{}/{}/commits/{}",
            owner, repo, server.github_branch
        );
        match client
            .get(&url)
            .header("User-Agent", "MCP-Cloud")
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                #[derive(serde::Deserialize)]
                struct CommitResponse { sha: String }
                resp.json::<CommitResponse>()
                    .await
                    .map(|c| c.sha)
                    .unwrap_or_else(|_| "HEAD".to_string())
            }
            _ => "HEAD".to_string(),
        }
    };

    // Create deployment record
    let deployment = mcp_db::DeploymentRepository::create(
        &state.db,
        mcp_db::CreateDeployment {
            server_id: path.server_id,
            commit_sha: commit_sha.clone(),
            deployed_by: Some(auth_user.user_id),
        },
    )
    .await?;

    // Update server status
    ServerRepository::update_status(&state.db, path.server_id, mcp_common::types::ServerStatus::Building, None)
        .await?;

    // Enqueue build job
    let build_job = mcp_queue::BuildJob {
        deployment_id: deployment.id,
        server_id: server.id,
        github_repo: server.github_repo.clone(),
        github_branch: server.github_branch.clone(),
        commit_sha: deployment.commit_sha.clone(),
        runtime: server.runtime.clone(),
        github_installation_id: server.github_installation_id,
        region: server.region.clone(),
    };

    state
        .job_queue
        .push_build_job(build_job)
        .await
        .map_err(|e| AppError::internal(&format!("Failed to enqueue build job: {}", e)))?;

    tracing::info!("Build job enqueued for deployment {}", deployment.id);

    let status = deployment.status();
    Ok(Json(mcp_common::types::DeploymentResponse {
        id: deployment.id,
        server_id: deployment.server_id,
        version: deployment.version,
        commit_sha: deployment.commit_sha,
        status,
        error_message: deployment.error_message,
        started_at: deployment.started_at,
        finished_at: deployment.finished_at,
    }))
}

pub async fn stop(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(path): Path<ServerPath>,
) -> Result<Json<ServerResponse>, AppError> {
    // Check membership and permission
    let member = WorkspaceRepository::get_member(&state.db, path.workspace_id, auth_user.user_id)
        .await?
        .ok_or_else(|| AppError::forbidden("Not a member of this workspace"))?;

    if matches!(member.role(), mcp_common::types::WorkspaceRole::Viewer) {
        return Err(AppError::forbidden("Insufficient permissions"));
    }

    // Verify server belongs to workspace
    let server = ServerRepository::find_by_id(&state.db, path.server_id)
        .await?
        .ok_or_else(|| AppError::not_found("Server"))?;

    if server.workspace_id != path.workspace_id {
        return Err(AppError::not_found("Server"));
    }

    if !server.is_running() {
        return Err(AppError::bad_request("SERVER_NOT_RUNNING", "Server is not running"));
    }

    // Update server status to stopped
    ServerRepository::update_status(
        &state.db,
        path.server_id,
        mcp_common::types::ServerStatus::Stopped,
        None,
    )
    .await?;

    // Get updated server
    let server = ServerRepository::find_by_id(&state.db, path.server_id)
        .await?
        .ok_or_else(|| AppError::not_found("Server"))?;

    let runtime = server.runtime();
    let visibility = server.visibility();
    let access_mode = server.access_mode();
    let status = server.status();
    Ok(Json(ServerResponse {
        id: server.id,
        workspace_id: server.workspace_id,
        name: server.name,
        slug: server.slug,
        description: server.description,
        github_repo: server.github_repo,
        github_branch: server.github_branch,
        runtime,
        visibility,
        access_mode,
        status,
        endpoint_url: server.endpoint_url,
        region: server.region,
        root_directory: server.root_directory,
        created_at: server.created_at,
        updated_at: server.updated_at,
    }))
}

pub async fn restart(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(path): Path<ServerPath>,
) -> Result<Json<mcp_common::types::DeploymentResponse>, AppError> {
    // Check membership and permission
    let member = WorkspaceRepository::get_member(&state.db, path.workspace_id, auth_user.user_id)
        .await?
        .ok_or_else(|| AppError::forbidden("Not a member of this workspace"))?;

    if matches!(member.role(), mcp_common::types::WorkspaceRole::Viewer) {
        return Err(AppError::forbidden("Insufficient permissions"));
    }

    // Verify server belongs to workspace
    let server = ServerRepository::find_by_id(&state.db, path.server_id)
        .await?
        .ok_or_else(|| AppError::not_found("Server"))?;

    if server.workspace_id != path.workspace_id {
        return Err(AppError::not_found("Server"));
    }

    // For restart, we trigger a new deployment
    // This reuses the deploy logic
    deploy(State(state), auth_user, Path(path)).await
}
