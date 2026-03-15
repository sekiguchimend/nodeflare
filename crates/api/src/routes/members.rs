use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use mcp_common::types::WorkspaceRole;
use mcp_db::{UserRepository, WorkspaceRepository};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::extractors::AuthUser;
use crate::state::AppState;

#[derive(Debug, Serialize)]
pub struct MemberResponse {
    pub user_id: Uuid,
    pub email: String,
    pub name: String,
    pub avatar_url: Option<String>,
    pub role: WorkspaceRole,
}

#[derive(Debug, Deserialize)]
pub struct AddMemberRequest {
    pub email: String,
    pub role: Option<WorkspaceRole>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateMemberRequest {
    pub role: WorkspaceRole,
}

pub async fn list(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(workspace_id): Path<Uuid>,
) -> Result<Json<Vec<MemberResponse>>, (StatusCode, String)> {
    // Check membership
    WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Not a member of this workspace".to_string()))?;

    let members = WorkspaceRepository::list_members(&state.db, workspace_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut response = Vec::new();
    for member in members {
        if let Some(user) = UserRepository::find_by_id(&state.db, member.user_id)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        {
            response.push(MemberResponse {
                user_id: user.id,
                email: user.email,
                name: user.name,
                avatar_url: user.avatar_url,
                role: member.role(),
            });
        }
    }

    Ok(Json(response))
}

pub async fn add(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(workspace_id): Path<Uuid>,
    Json(body): Json<AddMemberRequest>,
) -> Result<Json<MemberResponse>, (StatusCode, String)> {
    // Check membership and permission (only owner/admin can add members)
    let member = WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Not a member of this workspace".to_string()))?;

    if !matches!(member.role(), WorkspaceRole::Owner | WorkspaceRole::Admin) {
        return Err((StatusCode::FORBIDDEN, "Insufficient permissions".to_string()));
    }

    // Find user by email
    let user = UserRepository::find_by_email(&state.db, &body.email)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "User not found".to_string()))?;

    // Check if already a member
    if WorkspaceRepository::get_member(&state.db, workspace_id, user.id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .is_some()
    {
        return Err((StatusCode::CONFLICT, "User is already a member".to_string()));
    }

    let role = body.role.unwrap_or(WorkspaceRole::Member);

    // Can't add someone as owner
    if matches!(role, WorkspaceRole::Owner) {
        return Err((StatusCode::BAD_REQUEST, "Cannot add member as owner".to_string()));
    }

    let new_member = WorkspaceRepository::add_member(&state.db, workspace_id, user.id, role)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(MemberResponse {
        user_id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
        role: new_member.role(),
    }))
}

pub async fn update(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path((workspace_id, user_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateMemberRequest>,
) -> Result<Json<MemberResponse>, (StatusCode, String)> {
    // Check membership and permission (only owner can change roles)
    let member = WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Not a member of this workspace".to_string()))?;

    if !matches!(member.role(), WorkspaceRole::Owner) {
        return Err((StatusCode::FORBIDDEN, "Only owner can change roles".to_string()));
    }

    // Can't change your own role
    if auth_user.user_id == user_id {
        return Err((StatusCode::BAD_REQUEST, "Cannot change your own role".to_string()));
    }

    // Can't set someone as owner
    if matches!(body.role, WorkspaceRole::Owner) {
        return Err((StatusCode::BAD_REQUEST, "Cannot set member as owner".to_string()));
    }

    // Check target user is a member
    let target_member = WorkspaceRepository::get_member(&state.db, workspace_id, user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Member not found".to_string()))?;

    // Can't change owner's role
    if matches!(target_member.role(), WorkspaceRole::Owner) {
        return Err((StatusCode::BAD_REQUEST, "Cannot change owner's role".to_string()));
    }

    // Remove and re-add with new role (simple approach)
    WorkspaceRepository::remove_member(&state.db, workspace_id, user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let updated_member = WorkspaceRepository::add_member(&state.db, workspace_id, user_id, body.role)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let user = UserRepository::find_by_id(&state.db, user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "User not found".to_string()))?;

    Ok(Json(MemberResponse {
        user_id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
        role: updated_member.role(),
    }))
}

pub async fn remove(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path((workspace_id, user_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, (StatusCode, String)> {
    // Check membership and permission
    let member = WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Not a member of this workspace".to_string()))?;

    // Owner/Admin can remove others, anyone can remove themselves
    let is_self = auth_user.user_id == user_id;
    if !is_self && !matches!(member.role(), WorkspaceRole::Owner | WorkspaceRole::Admin) {
        return Err((StatusCode::FORBIDDEN, "Insufficient permissions".to_string()));
    }

    // Get target member
    let target_member = WorkspaceRepository::get_member(&state.db, workspace_id, user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Member not found".to_string()))?;

    // Can't remove the owner
    if matches!(target_member.role(), WorkspaceRole::Owner) {
        return Err((StatusCode::BAD_REQUEST, "Cannot remove workspace owner".to_string()));
    }

    WorkspaceRepository::remove_member(&state.db, workspace_id, user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(StatusCode::NO_CONTENT)
}
