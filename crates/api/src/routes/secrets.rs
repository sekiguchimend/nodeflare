use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use mcp_common::types::{SecretResponse, SetSecretRequest};
use mcp_db::{CreateSecret, SecretRepository, ServerRepository, WorkspaceRepository};
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
) -> Result<Json<Vec<SecretResponse>>, (StatusCode, String)> {
    WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Not a member".to_string()))?;

    // Verify server belongs to workspace
    verify_server_ownership(&state, workspace_id, server_id).await?;

    let secrets = SecretRepository::list_by_server(&state.db, server_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let response: Vec<SecretResponse> = secrets
        .into_iter()
        .map(|s| SecretResponse {
            key: s.key,
            created_at: s.created_at,
            updated_at: s.updated_at,
        })
        .collect();

    Ok(Json(response))
}

pub async fn set(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path((workspace_id, server_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<SetSecretRequest>,
) -> Result<Json<SecretResponse>, (StatusCode, String)> {
    let member = WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Not a member".to_string()))?;

    if matches!(member.role(), mcp_common::types::WorkspaceRole::Viewer) {
        return Err((StatusCode::FORBIDDEN, "Insufficient permissions".to_string()));
    }

    // Verify server belongs to workspace
    verify_server_ownership(&state, workspace_id, server_id).await?;

    // Encrypt the value
    let (encrypted_value, nonce) = state
        .crypto
        .encrypt_string(&body.value)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let secret = SecretRepository::upsert(
        &state.db,
        CreateSecret {
            server_id,
            key: body.key,
            encrypted_value,
            nonce,
        },
    )
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(SecretResponse {
        key: secret.key,
        created_at: secret.created_at,
        updated_at: secret.updated_at,
    }))
}

pub async fn delete(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path((workspace_id, server_id, key)): Path<(Uuid, Uuid, String)>,
) -> Result<StatusCode, (StatusCode, String)> {
    let member = WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Not a member".to_string()))?;

    if matches!(member.role(), mcp_common::types::WorkspaceRole::Viewer) {
        return Err((StatusCode::FORBIDDEN, "Insufficient permissions".to_string()));
    }

    // Verify server belongs to workspace
    verify_server_ownership(&state, workspace_id, server_id).await?;

    SecretRepository::delete_by_key(&state.db, server_id, &key)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(StatusCode::NO_CONTENT)
}
