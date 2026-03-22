use chrono::{DateTime, Utc};
use mcp_common::types::{Runtime, ServerStatus, Visibility};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct McpServer {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub github_repo: String,
    pub github_branch: String,
    pub github_installation_id: Option<i64>,
    pub runtime: String,
    pub visibility: String,
    pub status: String,
    pub endpoint_url: Option<String>,
    pub rate_limit_per_minute: Option<i32>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl McpServer {
    pub fn runtime(&self) -> Runtime {
        match self.runtime.as_str() {
            "node" => Runtime::Node,
            "python" => Runtime::Python,
            "go" => Runtime::Go,
            "rust" => Runtime::Rust,
            "docker" => Runtime::Docker,
            _ => Runtime::Node,
        }
    }

    pub fn visibility(&self) -> Visibility {
        match self.visibility.as_str() {
            "team" => Visibility::Team,
            "public" => Visibility::Public,
            _ => Visibility::Private,
        }
    }

    pub fn status(&self) -> ServerStatus {
        match self.status.as_str() {
            "building" => ServerStatus::Building,
            "deploying" => ServerStatus::Deploying,
            "running" => ServerStatus::Running,
            "failed" => ServerStatus::Failed,
            "stopped" => ServerStatus::Stopped,
            _ => ServerStatus::Inactive,
        }
    }

    pub fn is_running(&self) -> bool {
        self.status == "running"
    }
}

#[derive(Debug, Clone)]
pub struct CreateServer {
    pub workspace_id: Uuid,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub github_repo: String,
    pub github_branch: String,
    pub github_installation_id: Option<i64>,
    pub runtime: Runtime,
    pub visibility: Visibility,
}

#[derive(Debug, Clone, Default)]
pub struct UpdateServer {
    pub name: Option<String>,
    pub description: Option<String>,
    pub github_branch: Option<String>,
    pub visibility: Option<Visibility>,
    pub status: Option<ServerStatus>,
    pub endpoint_url: Option<String>,
}
