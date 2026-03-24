use async_trait::async_trait;
use axum::{
    extract::{FromRef, FromRequestParts},
    http::{header::AUTHORIZATION, header::COOKIE, request::Parts, StatusCode},
};
use std::sync::Arc;
use uuid::Uuid;

use crate::state::AppState;

pub struct AuthUser {
    pub user_id: Uuid,
    pub workspace_id: Option<Uuid>,
}

/// Extract token from Cookie header
fn extract_token_from_cookie(cookie_header: &str) -> Option<&str> {
    for cookie in cookie_header.split(';') {
        let cookie = cookie.trim();
        if let Some(token) = cookie.strip_prefix("access_token=") {
            return Some(token);
        }
    }
    None
}

#[async_trait]
impl<S> FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
    Arc<AppState>: FromRef<S>,
{
    type Rejection = (StatusCode, &'static str);

    async fn from_request_parts(
        parts: &mut Parts,
        state: &S,
    ) -> Result<Self, Self::Rejection> {
        let app_state = Arc::<AppState>::from_ref(state);

        // Try to get token from Authorization header first, then from Cookie
        let token = if let Some(auth_header) = parts
            .headers
            .get(AUTHORIZATION)
            .and_then(|h| h.to_str().ok())
        {
            // Extract Bearer token from Authorization header
            auth_header
                .strip_prefix("Bearer ")
                .ok_or((StatusCode::UNAUTHORIZED, "Invalid authorization header format"))?
        } else if let Some(cookie_header) = parts
            .headers
            .get(COOKIE)
            .and_then(|h| h.to_str().ok())
        {
            // Extract token from Cookie header
            extract_token_from_cookie(cookie_header)
                .ok_or((StatusCode::UNAUTHORIZED, "Missing access token in cookie"))?
        } else {
            return Err((StatusCode::UNAUTHORIZED, "Missing authorization"));
        };

        // Verify JWT
        let claims = app_state
            .jwt
            .verify_token(token)
            .map_err(|_| (StatusCode::UNAUTHORIZED, "Invalid or expired token"))?;

        let user_id = claims
            .user_id()
            .map_err(|_| (StatusCode::UNAUTHORIZED, "Invalid user ID in token"))?;

        Ok(AuthUser {
            user_id,
            workspace_id: claims.workspace_id(),
        })
    }
}
