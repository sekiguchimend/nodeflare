use crate::models::Announcement;
use mcp_common::Result;
use sqlx::PgPool;

pub struct AnnouncementRepository;

impl AnnouncementRepository {
    /// List active announcements that haven't expired
    pub async fn list_active(pool: &PgPool, limit: i64) -> Result<Vec<Announcement>> {
        let announcements = sqlx::query_as::<_, Announcement>(
            r#"
            SELECT id, title, content, type, is_active, published_at, expires_at, created_at, updated_at
            FROM announcements
            WHERE is_active = true
              AND (expires_at IS NULL OR expires_at > NOW())
            ORDER BY published_at DESC
            LIMIT $1
            "#,
        )
        .bind(limit)
        .fetch_all(pool)
        .await?;

        Ok(announcements)
    }

    /// List all announcements (for admin)
    pub async fn list_all(pool: &PgPool, limit: i64, offset: i64) -> Result<Vec<Announcement>> {
        let announcements = sqlx::query_as::<_, Announcement>(
            r#"
            SELECT id, title, content, type, is_active, published_at, expires_at, created_at, updated_at
            FROM announcements
            ORDER BY created_at DESC
            LIMIT $1 OFFSET $2
            "#,
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await?;

        Ok(announcements)
    }
}
