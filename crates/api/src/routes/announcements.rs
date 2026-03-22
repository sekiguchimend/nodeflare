use axum::{
    extract::{Query, State},
    Json,
};
use mcp_db::{models::Announcement, repositories::AnnouncementRepository};
use serde::Deserialize;
use std::sync::Arc;

use crate::{error::AppError, state::AppState};

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    #[serde(default = "default_limit")]
    pub limit: i64,
}

fn default_limit() -> i64 {
    10
}

/// List active announcements (public endpoint, no auth required)
pub async fn list(
    State(state): State<Arc<AppState>>,
    Query(query): Query<ListQuery>,
) -> Result<Json<Vec<Announcement>>, AppError> {
    let announcements = AnnouncementRepository::list_active(&state.db, query.limit)
        .await
        .map_err(|e| {
            tracing::error!("Failed to fetch announcements: {}", e);
            AppError::internal("Failed to fetch announcements")
        })?;

    Ok(Json(announcements))
}
