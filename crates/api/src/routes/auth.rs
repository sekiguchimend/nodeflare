use axum::{
    extract::{ConnectInfo, Query, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Redirect, Response},
    Json,
};
use fred::interfaces::KeysInterface;
use mcp_auth::GitHubOAuth;
use mcp_common::types::{AuthResponse, RefreshTokenRequest, UserResponse};
use mcp_db::{UserRepository, WorkspaceRepository};
use serde::Deserialize;
use std::net::SocketAddr;
use std::sync::Arc;

use crate::extractors::AuthUser;
use crate::middleware::rate_limit::{
    clear_failed_attempts, get_lockout_remaining, is_ip_locked_out, record_failed_attempt,
};
use crate::state::AppState;

const CSRF_TOKEN_PREFIX: &str = "csrf:oauth:";
const CSRF_TOKEN_TTL_SECS: i64 = 600; // 10 minutes

#[derive(Debug, Deserialize)]
pub struct GitHubCallbackQuery {
    pub code: String,
    pub state: Option<String>,
}

pub async fn github_login(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let redirect_url = if state.config.github.redirect_uri.is_empty() {
        format!(
            "{}://{}:{}/api/v1/auth/github/callback",
            if state.config.is_production() { "https" } else { "http" },
            state.config.server.host,
            state.config.server.port
        )
    } else {
        state.config.github.redirect_uri.clone()
    };

    match GitHubOAuth::new(&state.config, &redirect_url) {
        Ok(oauth) => {
            let (auth_url, csrf_token) = oauth.get_authorization_url();

            // Store CSRF token in Redis with TTL for validation on callback
            let csrf_key = format!("{}{}", CSRF_TOKEN_PREFIX, csrf_token);
            if let Err(e) = state
                .redis
                .set::<(), _, _>(
                    &csrf_key,
                    "1",
                    Some(fred::types::Expiration::EX(CSRF_TOKEN_TTL_SECS)),
                    None,
                    false,
                )
                .await
            {
                tracing::error!("Failed to store CSRF token: {}", e);
                return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to initiate OAuth").into_response();
            }

            Redirect::temporary(&auth_url).into_response()
        }
        Err(e) => {
            tracing::error!("Failed to create GitHub OAuth client: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "OAuth configuration error").into_response()
        }
    }
}

const AUTH_BRUTE_FORCE_PREFIX: &str = "bf:auth:";

pub async fn github_callback(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Query(query): Query<GitHubCallbackQuery>,
) -> Result<Response, (StatusCode, String)> {
    let ip = addr.ip().to_string();

    // Check if IP is locked out due to brute force
    if is_ip_locked_out(&state.redis, &ip, AUTH_BRUTE_FORCE_PREFIX).await {
        let remaining = get_lockout_remaining(&state.redis, &ip, AUTH_BRUTE_FORCE_PREFIX)
            .await
            .unwrap_or(0);
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            format!(
                "Too many failed attempts. Please try again in {} seconds.",
                remaining
            ),
        ));
    }

    // Validate CSRF token (state parameter)
    let csrf_state = query.state.as_ref().ok_or_else(|| {
        // Record failed attempt for missing state
        let redis = state.redis.clone();
        let ip_clone = ip.clone();
        tokio::spawn(async move {
            record_failed_attempt(&redis, &ip_clone, AUTH_BRUTE_FORCE_PREFIX).await;
        });
        (StatusCode::BAD_REQUEST, "Missing state parameter".to_string())
    })?;

    let csrf_key = format!("{}{}", CSRF_TOKEN_PREFIX, csrf_state);
    let csrf_exists: Option<String> = state
        .redis
        .get(&csrf_key)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if csrf_exists.is_none() {
        // Record failed attempt for invalid/expired state
        record_failed_attempt(&state.redis, &ip, AUTH_BRUTE_FORCE_PREFIX).await;
        return Err((
            StatusCode::BAD_REQUEST,
            "Invalid or expired state parameter".to_string(),
        ));
    }

    // Delete used CSRF token (one-time use)
    let _ = state.redis.del::<(), _>(&csrf_key).await;

    let redirect_url = if state.config.github.redirect_uri.is_empty() {
        format!(
            "{}://{}:{}/api/v1/auth/github/callback",
            if state.config.is_production() { "https" } else { "http" },
            state.config.server.host,
            state.config.server.port
        )
    } else {
        state.config.github.redirect_uri.clone()
    };

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

    // Set tokens as HTTP-only secure cookies
    let is_production = state.config.is_production();
    let cookie_domain = extract_domain(&state.config.server.frontend_url);
    let access_token_max_age = state.config.auth.jwt_expiration_hours * 3600;
    let refresh_token_max_age = state.config.auth.refresh_token_expiration_days * 24 * 3600;

    let access_cookie = format!(
        "access_token={}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age={}{}",
        access_token,
        access_token_max_age,
        if is_production { format!("; Domain={}", cookie_domain) } else { String::new() }
    );

    let refresh_cookie = format!(
        "refresh_token={}; HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth/refresh; Max-Age={}{}",
        refresh.token,
        refresh_token_max_age,
        if is_production { format!("; Domain={}", cookie_domain) } else { String::new() }
    );

    // Clear failed attempts on successful login
    clear_failed_attempts(&state.redis, &ip, AUTH_BRUTE_FORCE_PREFIX).await;

    let frontend_callback_url = format!("{}/auth/callback", state.config.server.frontend_url);

    let mut headers = HeaderMap::new();
    headers.insert(
        header::SET_COOKIE,
        HeaderValue::from_str(&access_cookie).unwrap(),
    );
    headers.append(
        header::SET_COOKIE,
        HeaderValue::from_str(&refresh_cookie).unwrap(),
    );
    headers.insert(
        header::LOCATION,
        HeaderValue::from_str(&frontend_callback_url).unwrap(),
    );

    Ok((StatusCode::TEMPORARY_REDIRECT, headers, ()).into_response())
}

/// Extract domain from URL for cookie domain setting
fn extract_domain(url: &str) -> String {
    url.trim_start_matches("https://")
        .trim_start_matches("http://")
        .split('/')
        .next()
        .unwrap_or("localhost")
        .split(':')
        .next()
        .unwrap_or("localhost")
        .to_string()
}

const REFRESH_BRUTE_FORCE_PREFIX: &str = "bf:refresh:";

pub async fn refresh_token(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Json(body): Json<RefreshTokenRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
    let ip = addr.ip().to_string();

    // Check if IP is locked out due to brute force
    if is_ip_locked_out(&state.redis, &ip, REFRESH_BRUTE_FORCE_PREFIX).await {
        let remaining = get_lockout_remaining(&state.redis, &ip, REFRESH_BRUTE_FORCE_PREFIX)
            .await
            .unwrap_or(0);
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            format!(
                "Too many failed attempts. Please try again in {} seconds.",
                remaining
            ),
        ));
    }

    let token_hash = mcp_auth::jwt::hash_token(&body.refresh_token);

    // Find refresh token
    let record: Option<(uuid::Uuid, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
        "SELECT user_id, expires_at FROM refresh_tokens WHERE token_hash = $1",
    )
    .bind(&token_hash)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let (user_id, expires_at) = record.ok_or_else(|| {
        // Record failed attempt for invalid token
        let redis = state.redis.clone();
        let ip_clone = ip.clone();
        tokio::spawn(async move {
            record_failed_attempt(&redis, &ip_clone, REFRESH_BRUTE_FORCE_PREFIX).await;
        });
        (StatusCode::UNAUTHORIZED, "Invalid refresh token".to_string())
    })?;

    // Check expiration
    if expires_at < chrono::Utc::now() {
        // Delete expired token
        sqlx::query("DELETE FROM refresh_tokens WHERE token_hash = $1")
            .bind(&token_hash)
            .execute(&state.db)
            .await
            .ok();
        // Record failed attempt for expired token
        record_failed_attempt(&state.redis, &ip, REFRESH_BRUTE_FORCE_PREFIX).await;
        return Err((StatusCode::UNAUTHORIZED, "Refresh token expired".to_string()));
    }

    // Clear failed attempts on successful token validation
    clear_failed_attempts(&state.redis, &ip, REFRESH_BRUTE_FORCE_PREFIX).await;

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

pub async fn logout(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
) -> impl IntoResponse {
    // Delete all refresh tokens for this user
    let _ = sqlx::query("DELETE FROM refresh_tokens WHERE user_id = $1")
        .bind(auth_user.user_id)
        .execute(&state.db)
        .await;

    tracing::info!("User {} logged out", auth_user.user_id);

    // Clear cookies by setting them with expired max-age
    let is_production = state.config.is_production();
    let cookie_domain = extract_domain(&state.config.server.frontend_url);

    let clear_access_cookie = format!(
        "access_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0{}",
        if is_production { format!("; Domain={}", cookie_domain) } else { String::new() }
    );

    let clear_refresh_cookie = format!(
        "refresh_token=; HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth/refresh; Max-Age=0{}",
        if is_production { format!("; Domain={}", cookie_domain) } else { String::new() }
    );

    let mut headers = HeaderMap::new();
    headers.insert(
        header::SET_COOKIE,
        HeaderValue::from_str(&clear_access_cookie).unwrap(),
    );
    headers.append(
        header::SET_COOKIE,
        HeaderValue::from_str(&clear_refresh_cookie).unwrap(),
    );

    (StatusCode::OK, headers, ())
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
