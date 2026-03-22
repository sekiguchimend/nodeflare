use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Redirect},
    Json,
};
use mcp_auth::GitHubOAuth;
use mcp_common::types::{AuthResponse, RefreshTokenRequest, UserResponse};
use mcp_db::{UserRepository, WorkspaceRepository};
use serde::Deserialize;
use std::sync::Arc;

use crate::extractors::AuthUser;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct GitHubCallbackQuery {
    pub code: String,
    pub state: Option<String>,
}

pub async fn github_login(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let redirect_url = format!(
        "{}://{}:{}/api/v1/auth/github/callback",
        if state.config.is_production() { "https" } else { "http" },
        state.config.server.host,
        state.config.server.port
    );

    match GitHubOAuth::new(&state.config, &redirect_url) {
        Ok(oauth) => {
            let (auth_url, _csrf_token) = oauth.get_authorization_url();
            // In production, store csrf_token in session
            Redirect::temporary(&auth_url).into_response()
        }
        Err(e) => {
            tracing::error!("Failed to create GitHub OAuth client: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "OAuth configuration error").into_response()
        }
    }
}

pub async fn github_callback(
    State(state): State<Arc<AppState>>,
    Query(query): Query<GitHubCallbackQuery>,
) -> Result<Redirect, (StatusCode, String)> {
    let redirect_url = format!(
        "{}://{}:{}/api/v1/auth/github/callback",
        if state.config.is_production() { "https" } else { "http" },
        state.config.server.host,
        state.config.server.port
    );

    let oauth = GitHubOAuth::new(&state.config, &redirect_url)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Exchange code for access token
    let access_token = oauth
        .exchange_code(&query.code)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    // Get user info from GitHub
    let github_user = oauth
        .get_user(&access_token)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    // Upsert user in database
    let user = UserRepository::upsert_from_github(
        &state.db,
        github_user.id,
        &github_user.email.unwrap_or_default(),
        &github_user.name.unwrap_or(github_user.login),
        github_user.avatar_url.as_deref(),
    )
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Encrypt and store GitHub access token
    let (encrypted_token, nonce) = state
        .crypto
        .encrypt_string(&access_token)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    UserRepository::update_github_token(&state.db, user.id, &encrypted_token, &nonce)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Check if user has any workspaces, if not create a personal one
    let workspaces = WorkspaceRepository::list_by_user(&state.db, user.id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let workspace_id = if workspaces.is_empty() {
        // Create personal workspace
        let ws = WorkspaceRepository::create(
            &state.db,
            mcp_db::CreateWorkspace {
                name: format!("{}'s Workspace", user.name),
                slug: format!("user-{}", user.id.to_string().split('-').next().unwrap()),
                owner_id: user.id,
            },
        )
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        Some(ws.id)
    } else {
        Some(workspaces[0].id)
    };

    // Generate JWT
    let access_token = state
        .jwt
        .generate_token(user.id, workspace_id)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Generate refresh token
    let refresh = mcp_auth::jwt::RefreshToken::generate(
        user.id,
        state.config.auth.refresh_token_expiration_days,
    );

    // Store refresh token hash in database
    sqlx::query(
        "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    )
    .bind(user.id)
    .bind(refresh.hash())
    .bind(refresh.expires_at)
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Redirect to frontend with tokens
    let frontend_callback_url = format!(
        "{}/auth/callback?access_token={}&refresh_token={}&expires_in={}",
        state.config.server.frontend_url,
        access_token,
        refresh.token,
        state.config.auth.jwt_expiration_hours * 3600
    );

    Ok(Redirect::temporary(&frontend_callback_url))
}

pub async fn refresh_token(
    State(state): State<Arc<AppState>>,
    Json(body): Json<RefreshTokenRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
    let token_hash = mcp_auth::jwt::hash_token(&body.refresh_token);

    // Find refresh token
    let record: Option<(uuid::Uuid, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
        "SELECT user_id, expires_at FROM refresh_tokens WHERE token_hash = $1",
    )
    .bind(&token_hash)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let (user_id, expires_at) = record.ok_or((StatusCode::UNAUTHORIZED, "Invalid refresh token".to_string()))?;

    // Check expiration
    if expires_at < chrono::Utc::now() {
        // Delete expired token
        sqlx::query("DELETE FROM refresh_tokens WHERE token_hash = $1")
            .bind(&token_hash)
            .execute(&state.db)
            .await
            .ok();
        return Err((StatusCode::UNAUTHORIZED, "Refresh token expired".to_string()));
    }

    // Get user
    let user = UserRepository::find_by_id(&state.db, user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "User not found".to_string()))?;

    // Get user's workspaces
    let workspaces = WorkspaceRepository::list_by_user(&state.db, user.id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let workspace_id = workspaces.first().map(|w| w.id);

    // Generate new tokens
    let new_access_token = state
        .jwt
        .generate_token(user.id, workspace_id)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let new_refresh = mcp_auth::jwt::RefreshToken::generate(
        user.id,
        state.config.auth.refresh_token_expiration_days,
    );

    // Delete old refresh token and insert new one
    sqlx::query("DELETE FROM refresh_tokens WHERE token_hash = $1")
        .bind(&token_hash)
        .execute(&state.db)
        .await
        .ok();

    sqlx::query(
        "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    )
    .bind(user.id)
    .bind(new_refresh.hash())
    .bind(new_refresh.expires_at)
    .execute(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(AuthResponse {
        access_token: new_access_token,
        refresh_token: new_refresh.token,
        token_type: "Bearer".to_string(),
        expires_in: state.config.auth.jwt_expiration_hours * 3600,
        user: UserResponse {
            id: user.id,
            email: user.email,
            name: user.name,
            avatar_url: user.avatar_url,
            created_at: user.created_at,
        },
    }))
}

pub async fn get_current_user(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
) -> Result<Json<UserResponse>, (StatusCode, String)> {
    let user = UserRepository::find_by_id(&state.db, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "User not found".to_string()))?;

    Ok(Json(UserResponse {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
        created_at: user.created_at,
    }))
}

#[derive(Debug, Deserialize)]
pub struct UpdateProfileRequest {
    pub name: Option<String>,
}

pub async fn update_profile(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Json(body): Json<UpdateProfileRequest>,
) -> Result<Json<UserResponse>, (StatusCode, String)> {
    let user = UserRepository::find_by_id(&state.db, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "User not found".to_string()))?;

    let name = body.name.unwrap_or(user.name.clone());

    if name.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Name cannot be empty".to_string()));
    }

    if name.len() > 100 {
        return Err((StatusCode::BAD_REQUEST, "Name too long".to_string()));
    }

    let updated_user = UserRepository::update_name(&state.db, auth_user.user_id, &name)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(UserResponse {
        id: updated_user.id,
        email: updated_user.email,
        name: updated_user.name,
        avatar_url: updated_user.avatar_url,
        created_at: updated_user.created_at,
    }))
}

pub async fn delete_account(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
) -> Result<StatusCode, (StatusCode, String)> {
    // Get all workspaces where user is owner
    let owned_workspaces = WorkspaceRepository::list_owned_by_user(&state.db, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Delete owned workspaces and all their resources (servers, deployments, etc.)
    for workspace in owned_workspaces {
        WorkspaceRepository::delete(&state.db, workspace.id)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }

    // Remove user from other workspaces where they are a member
    let member_workspaces = WorkspaceRepository::list_by_user(&state.db, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    for workspace in member_workspaces {
        WorkspaceRepository::remove_member(&state.db, workspace.id, auth_user.user_id)
            .await
            .ok(); // Ignore errors - best effort cleanup
    }

    // Delete refresh tokens
    sqlx::query("DELETE FROM refresh_tokens WHERE user_id = $1")
        .bind(auth_user.user_id)
        .execute(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Delete user
    UserRepository::delete(&state.db, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    tracing::info!("User {} deleted their account", auth_user.user_id);

    Ok(StatusCode::NO_CONTENT)
}
