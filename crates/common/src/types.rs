use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

// ============================================================================
// Enums
// ============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Runtime {
    Node,
    Python,
    Docker,
}

impl Default for Runtime {
    fn default() -> Self {
        Self::Node
    }
}

impl std::fmt::Display for Runtime {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Runtime::Node => write!(f, "node"),
            Runtime::Python => write!(f, "python"),
            Runtime::Docker => write!(f, "docker"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Visibility {
    Private,
    Team,
    Public,
}

impl Default for Visibility {
    fn default() -> Self {
        Self::Private
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ServerStatus {
    Inactive,
    Building,
    Deploying,
    Running,
    Failed,
    Stopped,
}

impl Default for ServerStatus {
    fn default() -> Self {
        Self::Inactive
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DeploymentStatus {
    Pending,
    Building,
    Pushing,
    Deploying,
    Succeeded,
    Failed,
    Cancelled,
}

impl Default for DeploymentStatus {
    fn default() -> Self {
        Self::Pending
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WorkspaceRole {
    Owner,
    Admin,
    Member,
    Viewer,
}

impl Default for WorkspaceRole {
    fn default() -> Self {
        Self::Member
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Plan {
    Free,
    Pro,
    Team,
    Enterprise,
}

impl Default for Plan {
    fn default() -> Self {
        Self::Free
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ToolPermissionLevel {
    Normal,
    Elevated,
    Dangerous,
}

impl Default for ToolPermissionLevel {
    fn default() -> Self {
        Self::Normal
    }
}

// ============================================================================
// Request DTOs
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct CreateWorkspaceRequest {
    #[validate(length(min = 1, max = 255))]
    pub name: String,
    #[validate(length(min = 1, max = 63), custom(function = "validate_slug"))]
    pub slug: String,
}

fn validate_slug(slug: &str) -> Result<(), validator::ValidationError> {
    if SLUG_REGEX.is_match(slug) {
        Ok(())
    } else {
        Err(validator::ValidationError::new("invalid_slug"))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct CreateServerRequest {
    #[validate(length(min = 1, max = 255))]
    pub name: String,
    #[validate(length(min = 1, max = 63))]
    pub slug: String,
    pub description: Option<String>,
    #[validate(length(min = 1, max = 255))]
    pub github_repo: String,
    pub github_branch: Option<String>,
    pub github_installation_id: Option<i64>,
    pub runtime: Option<Runtime>,
    pub visibility: Option<Visibility>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct UpdateServerRequest {
    #[validate(length(min = 1, max = 255))]
    pub name: Option<String>,
    pub description: Option<String>,
    pub github_branch: Option<String>,
    pub visibility: Option<Visibility>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct CreateApiKeyRequest {
    #[validate(length(min = 1, max = 255))]
    pub name: String,
    pub server_id: Option<Uuid>,
    pub scopes: Option<Vec<String>>,
    pub expires_in_days: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
pub struct UpdateToolRequest {
    pub enabled: Option<bool>,
    pub permission_level: Option<ToolPermissionLevel>,
    pub rate_limit_per_minute: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SetSecretRequest {
    pub key: String,
    pub value: String,
}

// ============================================================================
// Response DTOs
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserResponse {
    pub id: Uuid,
    pub email: String,
    pub name: String,
    pub avatar_url: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceResponse {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub plan: Plan,
    pub role: WorkspaceRole,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerResponse {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub github_repo: String,
    pub github_branch: String,
    pub runtime: Runtime,
    pub visibility: Visibility,
    pub status: ServerStatus,
    pub endpoint_url: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeploymentResponse {
    pub id: Uuid,
    pub server_id: Uuid,
    pub version: i32,
    pub commit_sha: String,
    pub status: DeploymentStatus,
    pub error_message: Option<String>,
    pub started_at: DateTime<Utc>,
    pub finished_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResponse {
    pub id: Uuid,
    pub server_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub input_schema: Option<serde_json::Value>,
    pub enabled: bool,
    pub permission_level: ToolPermissionLevel,
    pub rate_limit_per_minute: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiKeyResponse {
    pub id: Uuid,
    pub name: String,
    pub key_prefix: String,
    pub scopes: Vec<String>,
    pub server_id: Option<Uuid>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub expires_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiKeyCreatedResponse {
    pub id: Uuid,
    pub name: String,
    pub key: String, // Full key, only shown once
    pub key_prefix: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecretResponse {
    pub key: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestLogResponse {
    pub id: Uuid,
    pub server_id: Uuid,
    pub tool_name: Option<String>,
    pub response_status: String,
    pub duration_ms: i32,
    pub created_at: DateTime<Utc>,
}

// ============================================================================
// Auth
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub token_type: String,
    pub expires_in: i64,
    pub user: UserResponse,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefreshTokenRequest {
    pub refresh_token: String,
}

// ============================================================================
// Pagination
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginationParams {
    pub page: Option<u32>,
    pub per_page: Option<u32>,
}

impl Default for PaginationParams {
    fn default() -> Self {
        Self {
            page: Some(1),
            per_page: Some(20),
        }
    }
}

impl PaginationParams {
    pub fn offset(&self) -> u32 {
        let page = self.page.unwrap_or(1).max(1);
        let per_page = self.per_page.unwrap_or(20);
        (page - 1) * per_page
    }

    pub fn limit(&self) -> u32 {
        self.per_page.unwrap_or(20).min(100)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginatedResponse<T> {
    pub data: Vec<T>,
    pub pagination: PaginationMeta,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaginationMeta {
    pub page: u32,
    pub per_page: u32,
    pub total: u64,
    pub total_pages: u32,
}

// ============================================================================
// Slug validation regex
// ============================================================================

use once_cell::sync::Lazy;
use regex::Regex;

pub static SLUG_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$").unwrap()
});
