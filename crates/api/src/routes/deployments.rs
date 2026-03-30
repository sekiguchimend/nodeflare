use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use mcp_common::types::{DeploymentResponse, DeploymentStatus, PaginationParams, WorkspaceRole};
use mcp_db::{CreateDeployment, DeploymentRepository, ServerRepository, WorkspaceRepository};
use std::sync::Arc;
use uuid::Uuid;

use crate::error::db_error;
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
        .map_err(db_error)?
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
) -> Result<Json<Vec<DeploymentResponse>>, (StatusCode, String)> {
    WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(db_error)?
        .ok_or((StatusCode::FORBIDDEN, "Not a member".to_string()))?;

    // Verify server belongs to workspace
    verify_server_ownership(&state, workspace_id, server_id).await?;

    let deployments = DeploymentRepository::list_by_server(
        &state.db,
        server_id,
        pagination.limit() as i64,
        pagination.offset() as i64,
    )
    .await
    .map_err(db_error)?;

    let response: Vec<DeploymentResponse> = deployments
        .into_iter()
        .map(|d| {
            let status = d.status();
            DeploymentResponse {
                id: d.id,
                server_id: d.server_id,
                version: d.version,
                commit_sha: d.commit_sha,
                status,
                error_message: d.error_message,
                started_at: d.started_at,
                finished_at: d.finished_at,
            }
        })
        .collect();

    Ok(Json(response))
}

pub async fn get(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path((workspace_id, server_id, deployment_id)): Path<(Uuid, Uuid, Uuid)>,
) -> Result<Json<DeploymentResponse>, (StatusCode, String)> {
    WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(db_error)?
        .ok_or((StatusCode::FORBIDDEN, "Not a member".to_string()))?;

    // Verify server belongs to workspace
    verify_server_ownership(&state, workspace_id, server_id).await?;

    let deployment = DeploymentRepository::find_by_id(&state.db, deployment_id)
        .await
        .map_err(db_error)?
        .ok_or((StatusCode::NOT_FOUND, "Deployment not found".to_string()))?;

    // Verify deployment belongs to the specified server (prevents IDOR)
    if deployment.server_id != server_id {
        return Err((StatusCode::NOT_FOUND, "Deployment not found".to_string()));
    }

    let status = deployment.status();
    Ok(Json(DeploymentResponse {
        id: deployment.id,
        server_id: deployment.server_id,
        version: deployment.version,
        commit_sha: deployment.commit_sha,
        status,
        error_message: deployment.error_message,
        started_at: deployment.started_at,
        finished_at: deployment.finished_at,
    }))
}

#[derive(serde::Serialize)]
pub struct DeploymentLogsResponse {
    pub logs: Option<String>,
}

pub async fn get_logs(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path((workspace_id, server_id, deployment_id)): Path<(Uuid, Uuid, Uuid)>,
) -> Result<Json<DeploymentLogsResponse>, (StatusCode, String)> {
    WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(db_error)?
        .ok_or((StatusCode::FORBIDDEN, "Not a member".to_string()))?;

    // Verify server belongs to workspace
    verify_server_ownership(&state, workspace_id, server_id).await?;

    let deployment = DeploymentRepository::find_by_id(&state.db, deployment_id)
        .await
        .map_err(db_error)?
        .ok_or((StatusCode::NOT_FOUND, "Deployment not found".to_string()))?;

    // Verify deployment belongs to the specified server (prevents IDOR)
    if deployment.server_id != server_id {
        return Err((StatusCode::NOT_FOUND, "Deployment not found".to_string()));
    }

    Ok(Json(DeploymentLogsResponse {
        logs: deployment.build_logs,
    }))
}

/// Rollback to a previous successful deployment
pub async fn rollback(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path((workspace_id, server_id, deployment_id)): Path<(Uuid, Uuid, Uuid)>,
) -> Result<Json<DeploymentResponse>, (StatusCode, String)> {
    // Check membership and permission
    let member = WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(db_error)?
        .ok_or((StatusCode::FORBIDDEN, "Not a member".to_string()))?;

    if matches!(member.role(), WorkspaceRole::Viewer) {
        return Err((StatusCode::FORBIDDEN, "Insufficient permissions".to_string()));
    }

    // Verify server belongs to workspace
    verify_server_ownership(&state, workspace_id, server_id).await?;

    // Get the deployment to rollback to
    let target_deployment = DeploymentRepository::find_by_id(&state.db, deployment_id)
        .await
        .map_err(db_error)?
        .ok_or((StatusCode::NOT_FOUND, "Deployment not found".to_string()))?;

    // Verify deployment belongs to this server
    if target_deployment.server_id != server_id {
        return Err((StatusCode::NOT_FOUND, "Deployment not found".to_string()));
    }

    // Only allow rollback to successful deployments
    if target_deployment.status() != DeploymentStatus::Succeeded {
        return Err((StatusCode::BAD_REQUEST, "Can only rollback to successful deployments".to_string()));
    }

    // Get server info
    let server = ServerRepository::find_by_id(&state.db, server_id)
        .await
        .map_err(db_error)?
        .ok_or((StatusCode::NOT_FOUND, "Server not found".to_string()))?;

    // Create new deployment with same commit SHA
    let deployment = DeploymentRepository::create(
        &state.db,
        CreateDeployment {
            server_id,
            commit_sha: target_deployment.commit_sha.clone(),
            deployed_by: Some(auth_user.user_id),
        },
    )
    .await
    .map_err(db_error)?;

    // Update server status to building
    ServerRepository::update_status(
        &state.db,
        server_id,
        mcp_common::types::ServerStatus::Building,
        None,
    )
    .await
    .map_err(db_error)?;

    // Enqueue build job
    let build_job = mcp_queue::BuildJob {
        deployment_id: deployment.id,
        server_id,
        github_repo: server.github_repo,
        github_branch: server.github_branch,
        commit_sha: target_deployment.commit_sha,
        runtime: server.runtime,
        github_installation_id: server.github_installation_id,
        region: server.region,
    };

    state
        .job_queue
        .push_build_job(build_job)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to enqueue build job: {}", e)))?;

    tracing::info!("Rollback build job enqueued for deployment {}", deployment.id);

    let status = deployment.status();
    Ok(Json(DeploymentResponse {
        id: deployment.id,
        server_id: deployment.server_id,
        version: deployment.version,
        commit_sha: deployment.commit_sha,
        status,
        error_message: deployment.error_message,
        started_at: deployment.started_at,
        finished_at: deployment.finished_at,
    }))
}
