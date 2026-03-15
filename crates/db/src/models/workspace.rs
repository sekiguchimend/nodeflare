use chrono::{DateTime, Utc};
use mcp_common::types::{Plan, WorkspaceRole};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Workspace {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub plan: String,
    pub owner_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Workspace {
    pub fn plan(&self) -> Plan {
        match self.plan.as_str() {
            "pro" => Plan::Pro,
            "team" => Plan::Team,
            "enterprise" => Plan::Enterprise,
            _ => Plan::Free,
        }
    }
}

#[derive(Debug, Clone)]
pub struct CreateWorkspace {
    pub name: String,
    pub slug: String,
    pub owner_id: Uuid,
}

#[derive(Debug, Clone, Default)]
pub struct UpdateWorkspace {
    pub name: Option<String>,
    pub plan: Option<Plan>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct WorkspaceMember {
    pub workspace_id: Uuid,
    pub user_id: Uuid,
    pub role: String,
    pub created_at: DateTime<Utc>,
}

impl WorkspaceMember {
    pub fn role(&self) -> WorkspaceRole {
        match self.role.as_str() {
            "owner" => WorkspaceRole::Owner,
            "admin" => WorkspaceRole::Admin,
            "member" => WorkspaceRole::Member,
            "viewer" => WorkspaceRole::Viewer,
            _ => WorkspaceRole::Viewer,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct WorkspaceWithRole {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub plan: String,
    pub owner_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub role: String,
}

impl WorkspaceWithRole {
    pub fn plan(&self) -> Plan {
        match self.plan.as_str() {
            "pro" => Plan::Pro,
            "team" => Plan::Team,
            "enterprise" => Plan::Enterprise,
            _ => Plan::Free,
        }
    }

    pub fn role(&self) -> WorkspaceRole {
        match self.role.as_str() {
            "owner" => WorkspaceRole::Owner,
            "admin" => WorkspaceRole::Admin,
            "member" => WorkspaceRole::Member,
            "viewer" => WorkspaceRole::Viewer,
            _ => WorkspaceRole::Viewer,
        }
    }
}
