use anyhow;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use mcp_db::{ServerRegionRepository, ServerRepository, WorkspaceRepository};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::error::{db_error, internal_error};
use crate::extractors::AuthUser;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct ExecRequest {
    pub command: Vec<String>,
    #[serde(default = "default_timeout")]
    pub timeout: u32,
    /// Optional region code to execute on. If not specified, uses primary region.
    pub region: Option<String>,
}

fn default_timeout() -> u32 {
    30
}

#[derive(Debug, Serialize)]
pub struct ExecResponseBody {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

/// Execute a command on an MCP server
pub async fn exec_command(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path((workspace_id, server_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<ExecRequest>,
) -> Result<Json<ExecResponseBody>, (StatusCode, String)> {
    // Verify user is owner/admin
    let member = WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(db_error)?
        .ok_or((StatusCode::FORBIDDEN, "Not a member".to_string()))?;

    if !matches!(
        member.role(),
        mcp_common::types::WorkspaceRole::Owner | mcp_common::types::WorkspaceRole::Admin
    ) {
        return Err((
            StatusCode::FORBIDDEN,
            "Only owners and admins can execute commands".to_string(),
        ));
    }

    // Get server
    let server = ServerRepository::find_by_id(&state.db, server_id)
        .await
        .map_err(db_error)?
        .ok_or((StatusCode::NOT_FOUND, "Server not found".to_string()))?;

    if server.workspace_id != workspace_id {
        return Err((StatusCode::NOT_FOUND, "Server not found".to_string()));
    }

    // Get target region's machine ID
    let target_region = if let Some(region_code) = &body.region {
        // Use specified region
        ServerRegionRepository::find_by_server_and_region(&state.db, server_id, region_code)
            .await
            .map_err(db_error)?
            .ok_or((StatusCode::NOT_FOUND, format!("Region '{}' not found", region_code)))?
    } else {
        // Use primary region
        ServerRegionRepository::find_primary(&state.db, server_id)
            .await
            .map_err(db_error)?
            .ok_or((StatusCode::BAD_REQUEST, "No primary region configured".to_string()))?
    };

    let machine_id = target_region
        .machine_id
        .ok_or((StatusCode::BAD_REQUEST, "Server not deployed in this region".to_string()))?;

    // Get Fly.io runtime
    let fly_runtime = state.fly_runtime.as_ref().ok_or((
        StatusCode::SERVICE_UNAVAILABLE,
        "Fly.io runtime not configured".to_string(),
    ))?;

    // Execute command
    let result = fly_runtime
        .exec(&machine_id, body.command, body.timeout)
        .await
        .map_err(|e: anyhow::Error| internal_error("Command execution failed", e))?;

    Ok(Json(ExecResponseBody {
        stdout: result.stdout,
        stderr: result.stderr,
        exit_code: result.exit_code,
    }))
}
