use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use mcp_auth::ApiKeyService;
use mcp_common::types::{ApiKeyCreatedResponse, ApiKeyResponse, CreateApiKeyRequest};
use mcp_db::{ApiKeyRepository, WorkspaceRepository};
use std::sync::Arc;
use uuid::Uuid;

use crate::extractors::AuthUser;
use crate::state::AppState;

pub async fn list(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(workspace_id): Path<Uuid>,
) -> Result<Json<Vec<ApiKeyResponse>>, (StatusCode, String)> {
    WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Not a member".to_string()))?;

    let keys = ApiKeyRepository::list_by_workspace(&state.db, workspace_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let response: Vec<ApiKeyResponse> = keys
        .into_iter()
        .map(|k| {
            let scopes = k.scopes();
            ApiKeyResponse {
                id: k.id,
                name: k.name,
                key_prefix: k.key_prefix,
                scopes,
                server_id: k.server_id,
                last_used_at: k.last_used_at,
                expires_at: k.expires_at,
                created_at: k.created_at,
            }
        })
        .collect();

    Ok(Json(response))
}

pub async fn create(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(workspace_id): Path<Uuid>,
    Json(body): Json<CreateApiKeyRequest>,
) -> Result<Json<ApiKeyCreatedResponse>, (StatusCode, String)> {
    let member = WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Not a member".to_string()))?;

    if matches!(member.role(), mcp_common::types::WorkspaceRole::Viewer) {
        return Err((StatusCode::FORBIDDEN, "Insufficient permissions".to_string()));
    }

    let (data, full_key) = ApiKeyService::create_api_key_data(
        workspace_id,
        body.server_id,
        body.name.clone(),
        body.scopes.unwrap_or_else(|| vec!["*".to_string()]),
        body.expires_in_days,
    );

    let key = ApiKeyRepository::create(&state.db, data)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(ApiKeyCreatedResponse {
        id: key.id,
        name: key.name,
        key: full_key,
        key_prefix: key.key_prefix,
        created_at: key.created_at,
    }))
}

pub async fn delete(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path((workspace_id, key_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, (StatusCode, String)> {
    let member = WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Not a member".to_string()))?;

    if matches!(member.role(), mcp_common::types::WorkspaceRole::Viewer) {
        return Err((StatusCode::FORBIDDEN, "Insufficient permissions".to_string()));
    }

    // Verify api key belongs to this workspace
    let existing = ApiKeyRepository::find_by_id(&state.db, key_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "API key not found".to_string()))?;

    if existing.workspace_id != workspace_id {
        return Err((StatusCode::NOT_FOUND, "API key not found".to_string()));
    }

    ApiKeyRepository::delete(&state.db, key_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(StatusCode::NO_CONTENT)
}
