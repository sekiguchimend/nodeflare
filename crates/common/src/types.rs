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
    Go,
    Rust,
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
            Runtime::Go => write!(f, "go"),
            Runtime::Rust => write!(f, "rust"),
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
// API Key Scopes
// ============================================================================

/// MCP API Key Scope definitions
///
/// Scope format: `{resource}:{action}` or `{resource}:{action}:{target}`
///
/// Examples:
/// - `*` - Full access (all permissions)
/// - `tools:*` - All tool operations
/// - `tools:list` - List available tools
/// - `tools:call` - Call any tool
/// - `tools:call:get_weather` - Call only the `get_weather` tool
/// - `resources:*` - All resource operations
/// - `resources:list` - List resources
/// - `resources:read` - Read resources
/// - `prompts:*` - All prompt operations
/// - `prompts:list` - List prompts
/// - `prompts:get` - Get prompt content
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Scope {
    /// Full access to everything
    All,
    /// All tool operations
    ToolsAll,
    /// List available tools
    ToolsList,
    /// Call any tool
    ToolsCall,
    /// Call a specific tool only
    ToolsCallSpecific(String),
    /// All resource operations
    ResourcesAll,
    /// List resources
    ResourcesList,
    /// Read resources
    ResourcesRead,
    /// Read a specific resource only
    ResourcesReadSpecific(String),
    /// All prompt operations
    PromptsAll,
    /// List prompts
    PromptsList,
    /// Get prompt content
    PromptsGet,
    /// Get a specific prompt only
    PromptsGetSpecific(String),
}

impl Scope {
    /// Parse a scope string into a Scope enum
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "*" => Some(Scope::All),
            "tools:*" => Some(Scope::ToolsAll),
            "tools:list" => Some(Scope::ToolsList),
            "tools:call" => Some(Scope::ToolsCall),
            "resources:*" => Some(Scope::ResourcesAll),
            "resources:list" => Some(Scope::ResourcesList),
            "resources:read" => Some(Scope::ResourcesRead),
            "prompts:*" => Some(Scope::PromptsAll),
            "prompts:list" => Some(Scope::PromptsList),
            "prompts:get" => Some(Scope::PromptsGet),
            _ => {
                // Check for specific target scopes
                if let Some(tool_name) = s.strip_prefix("tools:call:") {
                    Some(Scope::ToolsCallSpecific(tool_name.to_string()))
                } else if let Some(resource_uri) = s.strip_prefix("resources:read:") {
                    Some(Scope::ResourcesReadSpecific(resource_uri.to_string()))
                } else if let Some(prompt_name) = s.strip_prefix("prompts:get:") {
                    Some(Scope::PromptsGetSpecific(prompt_name.to_string()))
                } else {
                    None
                }
            }
        }
    }

    /// Convert scope to string representation
    pub fn as_str(&self) -> String {
        match self {
            Scope::All => "*".to_string(),
            Scope::ToolsAll => "tools:*".to_string(),
            Scope::ToolsList => "tools:list".to_string(),
            Scope::ToolsCall => "tools:call".to_string(),
            Scope::ToolsCallSpecific(name) => format!("tools:call:{}", name),
            Scope::ResourcesAll => "resources:*".to_string(),
            Scope::ResourcesList => "resources:list".to_string(),
            Scope::ResourcesRead => "resources:read".to_string(),
            Scope::ResourcesReadSpecific(uri) => format!("resources:read:{}", uri),
            Scope::PromptsAll => "prompts:*".to_string(),
            Scope::PromptsList => "prompts:list".to_string(),
            Scope::PromptsGet => "prompts:get".to_string(),
            Scope::PromptsGetSpecific(name) => format!("prompts:get:{}", name),
        }
    }
}

/// MCP method to required scope mapping
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum McpMethod {
    ToolsList,
    ToolsCall,
    ResourcesList,
    ResourcesRead,
    PromptsList,
    PromptsGet,
    Unknown,
}

impl McpMethod {
    /// Parse MCP JSON-RPC method string
    pub fn parse(method: &str) -> Self {
        match method {
            "tools/list" => McpMethod::ToolsList,
            "tools/call" => McpMethod::ToolsCall,
            "resources/list" => McpMethod::ResourcesList,
            "resources/read" => McpMethod::ResourcesRead,
            "prompts/list" => McpMethod::PromptsList,
            "prompts/get" => McpMethod::PromptsGet,
            _ => McpMethod::Unknown,
        }
    }
}

/// Scope checker for API key authorization
pub struct ScopeChecker {
    scopes: Vec<Scope>,
}

impl ScopeChecker {
    /// Create a new scope checker from a list of scope strings
    pub fn new(scope_strings: &[String]) -> Self {
        let scopes: Vec<Scope> = scope_strings
            .iter()
            .filter_map(|s| Scope::parse(s))
            .collect();
        Self { scopes }
    }

    /// Check if the API key has permission for an MCP method
    pub fn is_allowed(&self, method: McpMethod, target: Option<&str>) -> bool {
        // If no valid scopes, deny by default
        if self.scopes.is_empty() {
            return false;
        }

        for scope in &self.scopes {
            match scope {
                // Wildcard allows everything
                Scope::All => return true,

                // Tools scopes
                Scope::ToolsAll => {
                    if matches!(method, McpMethod::ToolsList | McpMethod::ToolsCall) {
                        return true;
                    }
                }
                Scope::ToolsList => {
                    if matches!(method, McpMethod::ToolsList) {
                        return true;
                    }
                }
                Scope::ToolsCall => {
                    if matches!(method, McpMethod::ToolsCall) {
                        return true;
                    }
                }
                Scope::ToolsCallSpecific(allowed_tool) => {
                    if matches!(method, McpMethod::ToolsCall) {
                        if let Some(tool_name) = target {
                            if tool_name == allowed_tool {
                                return true;
                            }
                        }
                    }
                }

                // Resources scopes
                Scope::ResourcesAll => {
                    if matches!(method, McpMethod::ResourcesList | McpMethod::ResourcesRead) {
                        return true;
                    }
                }
                Scope::ResourcesList => {
                    if matches!(method, McpMethod::ResourcesList) {
                        return true;
                    }
                }
                Scope::ResourcesRead => {
                    if matches!(method, McpMethod::ResourcesRead) {
                        return true;
                    }
                }
                Scope::ResourcesReadSpecific(allowed_uri) => {
                    if matches!(method, McpMethod::ResourcesRead) {
                        if let Some(uri) = target {
                            if uri == allowed_uri {
                                return true;
                            }
                        }
                    }
                }

                // Prompts scopes
                Scope::PromptsAll => {
                    if matches!(method, McpMethod::PromptsList | McpMethod::PromptsGet) {
                        return true;
                    }
                }
                Scope::PromptsList => {
                    if matches!(method, McpMethod::PromptsList) {
                        return true;
                    }
                }
                Scope::PromptsGet => {
                    if matches!(method, McpMethod::PromptsGet) {
                        return true;
                    }
                }
                Scope::PromptsGetSpecific(allowed_prompt) => {
                    if matches!(method, McpMethod::PromptsGet) {
                        if let Some(prompt_name) = target {
                            if prompt_name == allowed_prompt {
                                return true;
                            }
                        }
                    }
                }
            }
        }

        false
    }

    /// Check if the API key has any valid scopes
    pub fn has_any_scope(&self) -> bool {
        !self.scopes.is_empty()
    }

    /// Get list of available predefined scopes (for UI)
    pub fn predefined_scopes() -> Vec<(&'static str, &'static str)> {
        vec![
            ("*", "Full access - all permissions"),
            ("tools:*", "Tools - all operations"),
            ("tools:list", "Tools - list only"),
            ("tools:call", "Tools - execute any tool"),
            ("resources:*", "Resources - all operations"),
            ("resources:list", "Resources - list only"),
            ("resources:read", "Resources - read any"),
            ("prompts:*", "Prompts - all operations"),
            ("prompts:list", "Prompts - list only"),
            ("prompts:get", "Prompts - get any"),
        ]
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
// WebSocket Messages
// ============================================================================

/// WebSocket message types for real-time updates
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum WsMessage {
    /// Deployment status update
    DeploymentStatus(DeploymentStatusUpdate),
    /// Server status update
    ServerStatus(ServerStatusUpdate),
    /// Build log line
    BuildLog(BuildLogLine),
    /// Server log line
    ServerLog(ServerLogLine),
    /// Error message
    Error(WsError),
    /// Ping/Pong for connection keepalive
    Ping,
    Pong,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeploymentStatusUpdate {
    pub deployment_id: Uuid,
    pub server_id: Uuid,
    pub status: DeploymentStatus,
    pub error_message: Option<String>,
    pub progress: Option<u8>, // 0-100
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerStatusUpdate {
    pub server_id: Uuid,
    pub status: ServerStatus,
    pub endpoint_url: Option<String>,
    pub error_message: Option<String>,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildLogLine {
    pub deployment_id: Uuid,
    pub line: String,
    pub stream: LogStream,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerLogLine {
    pub server_id: Uuid,
    pub line: String,
    pub level: LogLevel,
    pub timestamp: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogStream {
    Stdout,
    Stderr,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsError {
    pub code: String,
    pub message: String,
}

// ============================================================================
// Slug validation regex
// ============================================================================

use once_cell::sync::Lazy;
use regex::Regex;

pub static SLUG_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$").unwrap()
});
