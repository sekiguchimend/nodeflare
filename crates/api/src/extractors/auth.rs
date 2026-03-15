use async_trait::async_trait;
use axum::{
    extract::{FromRef, FromRequestParts},
    http::{header::AUTHORIZATION, request::Parts, StatusCode},
};
use std::sync::Arc;
use uuid::Uuid;

use crate::state::AppState;

pub struct AuthUser {
    pub user_id: Uuid,
    pub workspace_id: Option<Uuid>,
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

        // Get Authorization header
        let auth_header = parts
            .headers
            .get(AUTHORIZATION)
            .and_then(|h| h.to_str().ok())
            .ok_or((StatusCode::UNAUTHORIZED, "Missing authorization header"))?;

        // Extract Bearer token
        let token = auth_header
            .strip_prefix("Bearer ")
            .ok_or((StatusCode::UNAUTHORIZED, "Invalid authorization header format"))?;

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
