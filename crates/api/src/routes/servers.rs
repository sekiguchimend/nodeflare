use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use mcp_common::types::{CreateServerRequest, PaginationParams, ServerResponse, UpdateServerRequest};
use mcp_db::{CreateServer, ServerRepository, UpdateServer, WorkspaceRepository};
use serde_json::json;
use std::sync::Arc;
use uuid::Uuid;

use crate::error::AppError;
use crate::extractors::AuthUser;
use crate::state::AppState;

#[derive(serde::Deserialize)]
pub struct ServerPath {
    pub workspace_id: Uuid,
    pub server_id: Uuid,
}

/// List all servers across all workspaces the user has access to
pub async fn list_all(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
) -> Result<Json<Vec<ServerResponse>>, (StatusCode, String)> {
    // Get all workspaces the user is a member of
    let workspaces = WorkspaceRepository::list_by_user(&state.db, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut all_servers = Vec::new();

    for workspace in workspaces {
        let servers = ServerRepository::list_by_workspace(&state.db, workspace.id, 100, 0)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        for s in servers {
            let runtime = s.runtime();
            let visibility = s.visibility();
            let status = s.status();
            all_servers.push(ServerResponse {
                id: s.id,
                workspace_id: s.workspace_id,
                name: s.name,
                slug: s.slug,
                description: s.description,
                github_repo: s.github_repo,
                github_branch: s.github_branch,
                runtime,
                visibility,
                status,
                endpoint_url: s.endpoint_url,
                created_at: s.created_at,
                updated_at: s.updated_at,
            });
        }
    }

    Ok(Json(all_servers))
}

pub async fn list(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(workspace_id): Path<Uuid>,
    Query(pagination): Query<PaginationParams>,
) -> Result<Json<Vec<ServerResponse>>, (StatusCode, String)> {
    // Check membership
    WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Not a member of this workspace".to_string()))?;

    let servers = ServerRepository::list_by_workspace(
        &state.db,
        workspace_id,
        pagination.limit() as i64,
        pagination.offset() as i64,
    )
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let response: Vec<ServerResponse> = servers
        .into_iter()
        .map(|s| {
            let runtime = s.runtime();
            let visibility = s.visibility();
            let status = s.status();
            ServerResponse {
                id: s.id,
                workspace_id: s.workspace_id,
                name: s.name,
                slug: s.slug,
                description: s.description,
                github_repo: s.github_repo,
                github_branch: s.github_branch,
                runtime,
                visibility,
                status,
                endpoint_url: s.endpoint_url,
                created_at: s.created_at,
                updated_at: s.updated_at,
            }
        })
        .collect();

    Ok(Json(response))
}

pub async fn create(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(workspace_id): Path<Uuid>,
    Json(body): Json<CreateServerRequest>,
) -> Result<Json<ServerResponse>, AppError> {
    // Validate runtime
    let runtime = body.runtime.clone().unwrap_or_default();
    if !matches!(runtime,
        mcp_common::types::Runtime::Node |
        mcp_common::types::Runtime::Python |
        mcp_common::types::Runtime::Go |
        mcp_common::types::Runtime::Rust |
        mcp_common::types::Runtime::Docker
    ) {
        return Err(AppError::bad_request(
            "INVALID_RUNTIME",
            &format!("Unsupported runtime: {:?}. Supported runtimes are: node, python, go, rust, docker", runtime),
        ).with_details(json!({
            "provided_runtime": format!("{:?}", runtime),
            "supported_runtimes": ["node", "python", "go", "rust", "docker"]
        })));
    }

    // Check membership and permission
    let member = WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(|e| {
            tracing::error!("Database error checking workspace membership: {}", e);
            AppError::internal("Failed to verify workspace membership")
        })?
        .ok_or_else(|| AppError::forbidden("You are not a member of this workspace"))?;

    if matches!(member.role(), mcp_common::types::WorkspaceRole::Viewer) {
        return Err(AppError::forbidden("Viewers cannot create servers. You need Editor or Admin role."));
    }

    // Check if slug is already taken
    if let Some(existing) = ServerRepository::find_by_slug(&state.db, workspace_id, &body.slug)
        .await
        .map_err(|e| {
            tracing::error!("Database error checking slug: {}", e);
            AppError::internal("Failed to check server slug availability")
        })?
    {
        return Err(AppError::conflict(
            "SLUG_ALREADY_EXISTS",
            &format!("A server with slug '{}' already exists in this workspace", body.slug),
        ).with_details(json!({
            "conflicting_slug": body.slug,
            "existing_server_name": existing.name,
            "suggestion": format!("{}-2", body.slug)
        })));
    }

    // Validate GitHub repo format
    let repo_parts: Vec<&str> = body.github_repo.split('/').collect();
    if repo_parts.len() != 2 {
        return Err(AppError::bad_request(
            "INVALID_GITHUB_REPO",
            "GitHub repository must be in format 'owner/repo'",
        ).with_details(json!({
            "provided_repo": body.github_repo,
            "expected_format": "owner/repo",
            "example": "octocat/my-mcp-server"
        })));
    }
    let (owner, repo) = (repo_parts[0], repo_parts[1]);
    let branch = body.github_branch.clone().unwrap_or_else(|| "main".to_string());

    // Validate MCP repository structure
    if let (Some(github), Some(installation_id)) = (&state.github, body.github_installation_id) {
        let runtime_str = match &runtime {
            mcp_common::types::Runtime::Node => "node",
            mcp_common::types::Runtime::Python => "python",
            mcp_common::types::Runtime::Go => "go",
            mcp_common::types::Runtime::Rust => "rust",
            mcp_common::types::Runtime::Docker => "docker",
        };

        match github.validate_mcp_repository(
            installation_id,
            owner,
            repo,
            &branch,
            Some(runtime_str),
        ).await {
            Ok(validation) => {
                if !validation.is_valid {
                    return Err(AppError::bad_request(
                        "INVALID_MCP_REPOSITORY",
                        "Repository does not appear to be a valid MCP server",
                    ).with_details(json!({
                        "errors": validation.errors,
                        "warnings": validation.warnings,
                        "detected_runtime": validation.detected_runtime,
                        "expected_runtime": runtime_str,
                        "help": "Make sure your repository contains package.json (Node.js) or requirements.txt/pyproject.toml (Python) with MCP SDK dependencies"
                    })));
                }

                // Log warnings if any
                for warning in &validation.warnings {
                    tracing::warn!("MCP validation warning for {}/{}: {}", owner, repo, warning);
                }
            }
            Err(e) => {
                tracing::warn!("Failed to validate MCP repository: {}", e);
                // Don't block creation, just log warning
            }
        }
    }

    let server = ServerRepository::create(
        &state.db,
        CreateServer {
            workspace_id,
            name: body.name.clone(),
            slug: body.slug.clone(),
            description: body.description.clone(),
            github_repo: body.github_repo.clone(),
            github_branch: body.github_branch.clone().unwrap_or_else(|| "main".to_string()),
            github_installation_id: body.github_installation_id,
            runtime,
            visibility: body.visibility.clone().unwrap_or_default(),
        },
    )
    .await
    .map_err(|e| {
        tracing::error!("Failed to create server: {}", e);
        let error_msg = e.to_string();

        // Parse specific database errors
        if error_msg.contains("duplicate key") {
            if error_msg.contains("slug") {
                return AppError::conflict(
                    "SLUG_ALREADY_EXISTS",
                    &format!("A server with slug '{}' already exists", body.slug),
                );
            }
            return AppError::conflict("DUPLICATE_ENTRY", "A server with these details already exists");
        }

        AppError::internal("Failed to create server. Please try again.")
    })?;

    let runtime = server.runtime();
    let visibility = server.visibility();
    let status = server.status();
    Ok(Json(ServerResponse {
        id: server.id,
        workspace_id: server.workspace_id,
        name: server.name,
        slug: server.slug,
        description: server.description,
        github_repo: server.github_repo,
        github_branch: server.github_branch,
        runtime,
        visibility,
        status,
        endpoint_url: server.endpoint_url,
        created_at: server.created_at,
        updated_at: server.updated_at,
    }))
}

pub async fn get(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(path): Path<ServerPath>,
) -> Result<Json<ServerResponse>, (StatusCode, String)> {
    // Check membership
    WorkspaceRepository::get_member(&state.db, path.workspace_id, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Not a member of this workspace".to_string()))?;

    let server = ServerRepository::find_by_id(&state.db, path.server_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Server not found".to_string()))?;

    if server.workspace_id != path.workspace_id {
        return Err((StatusCode::NOT_FOUND, "Server not found".to_string()));
    }

    let runtime = server.runtime();
    let visibility = server.visibility();
    let status = server.status();
    Ok(Json(ServerResponse {
        id: server.id,
        workspace_id: server.workspace_id,
        name: server.name,
        slug: server.slug,
        description: server.description,
        github_repo: server.github_repo,
        github_branch: server.github_branch,
        runtime,
        visibility,
        status,
        endpoint_url: server.endpoint_url,
        created_at: server.created_at,
        updated_at: server.updated_at,
    }))
}

pub async fn update(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(path): Path<ServerPath>,
    Json(body): Json<UpdateServerRequest>,
) -> Result<Json<ServerResponse>, (StatusCode, String)> {
    // Check membership and permission
    let member = WorkspaceRepository::get_member(&state.db, path.workspace_id, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Not a member of this workspace".to_string()))?;

    if matches!(member.role(), mcp_common::types::WorkspaceRole::Viewer) {
        return Err((StatusCode::FORBIDDEN, "Insufficient permissions".to_string()));
    }

    // Verify server belongs to this workspace
    let existing = ServerRepository::find_by_id(&state.db, path.server_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Server not found".to_string()))?;

    if existing.workspace_id != path.workspace_id {
        return Err((StatusCode::NOT_FOUND, "Server not found".to_string()));
    }

    let server = ServerRepository::update(
        &state.db,
        path.server_id,
        UpdateServer {
            name: body.name,
            description: body.description,
            github_branch: body.github_branch,
            visibility: body.visibility,
            status: None,
            endpoint_url: None,
        },
    )
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let runtime = server.runtime();
    let visibility = server.visibility();
    let status = server.status();
    Ok(Json(ServerResponse {
        id: server.id,
        workspace_id: server.workspace_id,
        name: server.name,
        slug: server.slug,
        description: server.description,
        github_repo: server.github_repo,
        github_branch: server.github_branch,
        runtime,
        visibility,
        status,
        endpoint_url: server.endpoint_url,
        created_at: server.created_at,
        updated_at: server.updated_at,
    }))
}

pub async fn delete(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(path): Path<ServerPath>,
) -> Result<StatusCode, (StatusCode, String)> {
    // Check membership and permission (only owner/admin can delete)
    let member = WorkspaceRepository::get_member(&state.db, path.workspace_id, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Not a member of this workspace".to_string()))?;

    if !matches!(member.role(), mcp_common::types::WorkspaceRole::Owner | mcp_common::types::WorkspaceRole::Admin) {
        return Err((StatusCode::FORBIDDEN, "Insufficient permissions".to_string()));
    }

    // Verify server belongs to this workspace
    let existing = ServerRepository::find_by_id(&state.db, path.server_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Server not found".to_string()))?;

    if existing.workspace_id != path.workspace_id {
        return Err((StatusCode::NOT_FOUND, "Server not found".to_string()));
    }

    ServerRepository::delete(&state.db, path.server_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn deploy(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(path): Path<ServerPath>,
) -> Result<Json<mcp_common::types::DeploymentResponse>, (StatusCode, String)> {
    // Check membership and permission
    let member = WorkspaceRepository::get_member(&state.db, path.workspace_id, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Not a member of this workspace".to_string()))?;

    if matches!(member.role(), mcp_common::types::WorkspaceRole::Viewer) {
        return Err((StatusCode::FORBIDDEN, "Insufficient permissions".to_string()));
    }

    // Get server
    let server = ServerRepository::find_by_id(&state.db, path.server_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Server not found".to_string()))?;

    if server.workspace_id != path.workspace_id {
        return Err((StatusCode::NOT_FOUND, "Server not found".to_string()));
    }

    // Parse owner/repo from github_repo
    let parts: Vec<&str> = server.github_repo.split('/').collect();
    if parts.len() != 2 {
        return Err((StatusCode::BAD_REQUEST, "Invalid github_repo format".to_string()));
    }
    let (owner, repo) = (parts[0], parts[1]);

    // Get latest commit SHA from GitHub
    let commit_sha = if let (Some(github), Some(installation_id)) = (&state.github, server.github_installation_id) {
        match github.get_latest_commit(installation_id, owner, repo, &server.github_branch).await {
            Ok(commit) => commit.sha,
            Err(e) => {
                tracing::warn!("Failed to get commit SHA from GitHub: {}, using HEAD", e);
                "HEAD".to_string()
            }
        }
    } else {
        // No GitHub App - try to get commit via public API
        let client = reqwest::Client::new();
        let url = format!(
            "https://api.github.com/repos/{}/{}/commits/{}",
            owner, repo, server.github_branch
        );
        match client
            .get(&url)
            .header("User-Agent", "MCP-Cloud")
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                #[derive(serde::Deserialize)]
                struct CommitResponse { sha: String }
                resp.json::<CommitResponse>()
                    .await
                    .map(|c| c.sha)
                    .unwrap_or_else(|_| "HEAD".to_string())
            }
            _ => "HEAD".to_string(),
        }
    };

    // Create deployment record
    let deployment = mcp_db::DeploymentRepository::create(
        &state.db,
        mcp_db::CreateDeployment {
            server_id: path.server_id,
            commit_sha: commit_sha.clone(),
            deployed_by: Some(auth_user.user_id),
        },
    )
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Update server status
    ServerRepository::update_status(&state.db, path.server_id, mcp_common::types::ServerStatus::Building, None)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Enqueue build job
    let build_job = mcp_queue::BuildJob {
        deployment_id: deployment.id,
        server_id: server.id,
        github_repo: server.github_repo.clone(),
        github_branch: server.github_branch.clone(),
        commit_sha: deployment.commit_sha.clone(),
        runtime: server.runtime.clone(),
        github_installation_id: server.github_installation_id,
    };

    state
        .job_queue
        .push_build_job(build_job)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to enqueue build job: {}", e)))?;

    tracing::info!("Build job enqueued for deployment {}", deployment.id);

    let status = deployment.status();
    Ok(Json(mcp_common::types::DeploymentResponse {
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

pub async fn stop(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(path): Path<ServerPath>,
) -> Result<Json<ServerResponse>, (StatusCode, String)> {
    // Check membership and permission
    let member = WorkspaceRepository::get_member(&state.db, path.workspace_id, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Not a member of this workspace".to_string()))?;

    if matches!(member.role(), mcp_common::types::WorkspaceRole::Viewer) {
        return Err((StatusCode::FORBIDDEN, "Insufficient permissions".to_string()));
    }

    // Verify server belongs to workspace
    let server = ServerRepository::find_by_id(&state.db, path.server_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Server not found".to_string()))?;

    if server.workspace_id != path.workspace_id {
        return Err((StatusCode::NOT_FOUND, "Server not found".to_string()));
    }

    if !server.is_running() {
        return Err((StatusCode::BAD_REQUEST, "Server is not running".to_string()));
    }

    // Update server status to stopped
    ServerRepository::update_status(
        &state.db,
        path.server_id,
        mcp_common::types::ServerStatus::Stopped,
        None,
    )
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Get updated server
    let server = ServerRepository::find_by_id(&state.db, path.server_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Server not found".to_string()))?;

    let runtime = server.runtime();
    let visibility = server.visibility();
    let status = server.status();
    Ok(Json(ServerResponse {
        id: server.id,
        workspace_id: server.workspace_id,
        name: server.name,
        slug: server.slug,
        description: server.description,
        github_repo: server.github_repo,
        github_branch: server.github_branch,
        runtime,
        visibility,
        status,
        endpoint_url: server.endpoint_url,
        created_at: server.created_at,
        updated_at: server.updated_at,
    }))
}

pub async fn restart(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(path): Path<ServerPath>,
) -> Result<Json<mcp_common::types::DeploymentResponse>, (StatusCode, String)> {
    // Check membership and permission
    let member = WorkspaceRepository::get_member(&state.db, path.workspace_id, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Not a member of this workspace".to_string()))?;

    if matches!(member.role(), mcp_common::types::WorkspaceRole::Viewer) {
        return Err((StatusCode::FORBIDDEN, "Insufficient permissions".to_string()));
    }

    // Verify server belongs to workspace
    let server = ServerRepository::find_by_id(&state.db, path.server_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Server not found".to_string()))?;

    if server.workspace_id != path.workspace_id {
        return Err((StatusCode::NOT_FOUND, "Server not found".to_string()));
    }

    // For restart, we trigger a new deployment
    // This reuses the deploy logic
    deploy(State(state), auth_user, Path(path)).await
}
