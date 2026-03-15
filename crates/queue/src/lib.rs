use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Build job - triggered when a deployment is requested
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildJob {
    pub deployment_id: Uuid,
    pub server_id: Uuid,
    pub github_repo: String,
    pub github_branch: String,
    pub commit_sha: String,
    pub runtime: String,
    /// GitHub App installation ID (None for public repos)
    pub github_installation_id: Option<i64>,
}

/// Deploy job - triggered after a successful build
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeployJob {
    pub deployment_id: Uuid,
    pub server_id: Uuid,
    pub image_url: String,
    pub secrets: Vec<SecretEnv>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecretEnv {
    pub key: String,
    pub value: String,
}

/// Cleanup job - for deleting old containers/resources
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanupJob {
    pub server_id: Uuid,
    pub container_id: String,
}

/// Log cleanup job - for removing old request logs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogCleanupJob {
    pub retention_days: i64,
}

/// Metrics collection job
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricsJob {
    pub server_id: Uuid,
}

// Re-export apalis types for convenience
pub use apalis::prelude::*;
pub use apalis_redis::RedisStorage;

/// Job queue client for pushing jobs to Redis
#[derive(Clone)]
pub struct JobQueue {
    build_storage: RedisStorage<BuildJob>,
    deploy_storage: RedisStorage<DeployJob>,
}

impl JobQueue {
    /// Connect to Redis and create job queue
    pub async fn connect(redis_url: &str) -> anyhow::Result<Self> {
        use apalis_redis::Config;

        let client = redis::Client::open(redis_url)?;
        let conn = redis::aio::ConnectionManager::new(client).await?;

        let build_storage = RedisStorage::new_with_config(conn.clone(), Config::default());
        let deploy_storage = RedisStorage::new_with_config(conn, Config::default());

        Ok(Self {
            build_storage,
            deploy_storage,
        })
    }

    /// Push a build job to the queue
    pub async fn push_build_job(&self, job: BuildJob) -> anyhow::Result<()> {
        use apalis::prelude::Storage;
        self.build_storage
            .clone()
            .push(job)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to push build job: {}", e))?;
        Ok(())
    }

    /// Push a deploy job to the queue
    pub async fn push_deploy_job(&self, job: DeployJob) -> anyhow::Result<()> {
        use apalis::prelude::Storage;
        self.deploy_storage
            .clone()
            .push(job)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to push deploy job: {}", e))?;
        Ok(())
    }
}
