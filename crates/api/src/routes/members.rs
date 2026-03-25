use axum::{
    extract::{Path, State},
    Json,
};
use mcp_billing::Plan as BillingPlan;
use mcp_common::types::WorkspaceRole;
use mcp_db::{UserRepository, WorkspaceRepository};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::error::AppError;
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
) -> Result<Json<Vec<MemberResponse>>, AppError> {
    // Check membership
    WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await?
        .ok_or_else(|| AppError::forbidden("Not a member of this workspace"))?;

    // Use JOIN query to prevent N+1 problem
    let members = WorkspaceRepository::list_members_with_users(&state.db, workspace_id)
        .await?;

    let response: Vec<MemberResponse> = members
        .into_iter()
        .map(|m| {
            let role = m.role();
            MemberResponse {
                user_id: m.user_id,
                email: m.email,
                name: m.name,
                avatar_url: m.avatar_url,
                role,
            }
        })
        .collect();

    Ok(Json(response))
}

pub async fn add(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(workspace_id): Path<Uuid>,
    Json(body): Json<AddMemberRequest>,
) -> Result<Json<MemberResponse>, AppError> {
    // Check membership and permission (only owner/admin can add members)
    let member = WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await?
        .ok_or_else(|| AppError::forbidden("Not a member of this workspace"))?;

    if !matches!(member.role(), WorkspaceRole::Owner | WorkspaceRole::Admin) {
        return Err(AppError::forbidden("Insufficient permissions"));
    }

    // Get workspace to check plan limits
    let workspace = WorkspaceRepository::find_by_id(&state.db, workspace_id)
        .await?
        .ok_or_else(|| AppError::not_found("Workspace"))?;

    // Get plan limits
    let billing_plan = match workspace.plan.as_str() {
        "pro" => BillingPlan::Pro,
        "team" => BillingPlan::Team,
        "enterprise" => BillingPlan::Enterprise,
        _ => BillingPlan::Free,
    };
    let limits = billing_plan.limits();

    // Count current members
    let current_members = WorkspaceRepository::list_members(&state.db, workspace_id).await?;

    // Check member limit
    if current_members.len() >= limits.max_team_members as usize {
        return Err(AppError::payment_required(
            "MEMBER_LIMIT_REACHED",
            &format!(
                "Your {} plan allows up to {} team members. Please upgrade to add more.",
                billing_plan, limits.max_team_members
            ),
        ));
    }

    // Find user by email
    let user = UserRepository::find_by_email(&state.db, &body.email)
        .await?
        .ok_or_else(|| AppError::not_found("User"))?;

    // Check if already a member
    if WorkspaceRepository::get_member(&state.db, workspace_id, user.id)
        .await?
        .is_some()
    {
        return Err(AppError::conflict("ALREADY_MEMBER", "User is already a member"));
    }

    let role = body.role.unwrap_or(WorkspaceRole::Member);

    // Can't add someone as owner
    if matches!(role, WorkspaceRole::Owner) {
        return Err(AppError::bad_request("INVALID_ROLE", "Cannot add member as owner"));
    }

    let new_member = WorkspaceRepository::add_member(&state.db, workspace_id, user.id, role)
        .await?;

    // Send invitation email (non-blocking)
    if let Some(ref email_service) = state.email {
        let inviter = UserRepository::find_by_id(&state.db, auth_user.user_id)
            .await
            .ok()
            .flatten();
        let inviter_name = inviter.map(|u| u.name).unwrap_or_else(|| "Someone".to_string());
        let workspace_name = workspace.name.clone();
        let user_email = user.email.clone();
        let email_service = email_service.clone();
        let app_url = std::env::var("APP_URL").unwrap_or_else(|_| "https://mcpcloud.dev".to_string());
        let invite_url = format!("{}/dashboard?workspace={}", app_url, workspace_id);

        tokio::spawn(async move {
            if let Err(e) = email_service
                .send_team_invite(&user_email, &inviter_name, &workspace_name, &invite_url)
                .await
            {
                tracing::error!("Failed to send team invite email: {}", e);
            }
        });
    }

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
) -> Result<Json<MemberResponse>, AppError> {
    // Check membership and permission (only owner can change roles)
    let member = WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await?
        .ok_or_else(|| AppError::forbidden("Not a member of this workspace"))?;

    if !matches!(member.role(), WorkspaceRole::Owner) {
        return Err(AppError::forbidden("Only owner can change roles"));
    }

    // Can't change your own role
    if auth_user.user_id == user_id {
        return Err(AppError::bad_request("INVALID_OPERATION", "Cannot change your own role"));
    }

    // Can't set someone as owner
    if matches!(body.role, WorkspaceRole::Owner) {
        return Err(AppError::bad_request("INVALID_ROLE", "Cannot set member as owner"));
    }

    // Check target user is a member
    let target_member = WorkspaceRepository::get_member(&state.db, workspace_id, user_id)
        .await?
        .ok_or_else(|| AppError::not_found("Member"))?;

    // Can't change owner's role
    if matches!(target_member.role(), WorkspaceRole::Owner) {
        return Err(AppError::bad_request("INVALID_OPERATION", "Cannot change owner's role"));
    }

    // Update role atomically to prevent race conditions
    let updated_member = WorkspaceRepository::update_member_role(&state.db, workspace_id, user_id, body.role)
        .await?
        .ok_or_else(|| AppError::not_found("Member"))?;

    let user = UserRepository::find_by_id(&state.db, user_id)
        .await?
        .ok_or_else(|| AppError::not_found("User"))?;

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
) -> Result<axum::http::StatusCode, AppError> {
    // Check membership and permission
    let member = WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await?
        .ok_or_else(|| AppError::forbidden("Not a member of this workspace"))?;

    // Owner/Admin can remove others, anyone can remove themselves
    let is_self = auth_user.user_id == user_id;
    if !is_self && !matches!(member.role(), WorkspaceRole::Owner | WorkspaceRole::Admin) {
        return Err(AppError::forbidden("Insufficient permissions"));
    }

    // Get target member
    let target_member = WorkspaceRepository::get_member(&state.db, workspace_id, user_id)
        .await?
        .ok_or_else(|| AppError::not_found("Member"))?;

    // Can't remove the owner
    if matches!(target_member.role(), WorkspaceRole::Owner) {
        return Err(AppError::bad_request("INVALID_OPERATION", "Cannot remove workspace owner"));
    }

    WorkspaceRepository::remove_member(&state.db, workspace_id, user_id).await?;

    Ok(axum::http::StatusCode::NO_CONTENT)
}
