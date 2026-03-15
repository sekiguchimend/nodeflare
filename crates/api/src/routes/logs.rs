use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::{Duration, Utc};
use mcp_common::types::{PaginationParams, RequestLogResponse};
use mcp_db::{RequestLogRepository, RequestLogStats, ServerRepository, ToolUsageStats, WorkspaceRepository};
use serde::Serialize;
use std::sync::Arc;
use uuid::Uuid;

use crate::extractors::AuthUser;
use crate::state::AppState;

/// Helper to verify server belongs to workspace
async fn verify_server_ownership(
    state: &AppState,
    workspace_id: Uuid,
    server_id: Uuid,
) -> Result<(), (StatusCode, String)> {
    let server = ServerRepository::find_by_id(&state.db, server_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Server not found".to_string()))?;

    if server.workspace_id != workspace_id {
        return Err((StatusCode::NOT_FOUND, "Server not found".to_string()));
    }
    Ok(())
}

pub async fn list(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path((workspace_id, server_id)): Path<(Uuid, Uuid)>,
    Query(pagination): Query<PaginationParams>,
) -> Result<Json<Vec<RequestLogResponse>>, (StatusCode, String)> {
    WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Not a member".to_string()))?;

    // Verify server belongs to workspace
    verify_server_ownership(&state, workspace_id, server_id).await?;

    let logs = RequestLogRepository::list_by_server(
        &state.db,
        server_id,
        pagination.limit() as i64,
        pagination.offset() as i64,
    )
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let response: Vec<RequestLogResponse> = logs
        .into_iter()
        .map(|l| RequestLogResponse {
            id: l.id,
            server_id: l.server_id,
            tool_name: l.tool_name,
            response_status: l.response_status,
            duration_ms: l.duration_ms,
            created_at: l.created_at,
        })
        .collect();

    Ok(Json(response))
}

#[derive(Serialize)]
pub struct ServerStatsResponse {
    pub stats: RequestLogStats,
    pub tool_usage: Vec<ToolUsageStats>,
}

pub async fn stats(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path((workspace_id, server_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<ServerStatsResponse>, (StatusCode, String)> {
    WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Not a member".to_string()))?;

    // Verify server belongs to workspace
    verify_server_ownership(&state, workspace_id, server_id).await?;

    let since = Utc::now() - Duration::days(7);

    let stats = RequestLogRepository::get_stats(&state.db, server_id, since)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let tool_usage = RequestLogRepository::get_tool_usage_stats(&state.db, server_id, since)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(ServerStatsResponse { stats, tool_usage }))
}
