use crate::models::UserPreferences;
use mcp_common::Result;
use sqlx::PgPool;
use uuid::Uuid;

pub struct UserPreferencesRepository;

impl UserPreferencesRepository {
    pub async fn find_by_user_id(pool: &PgPool, user_id: Uuid) -> Result<Option<UserPreferences>> {
        let prefs = sqlx::query_as::<_, UserPreferences>(
            r#"
            SELECT user_id, sidebar_order, created_at, updated_at
            FROM user_preferences
            WHERE user_id = $1
            "#,
        )
        .bind(user_id)
        .fetch_optional(pool)
        .await?;

        Ok(prefs)
    }

    pub async fn upsert(pool: &PgPool, user_id: Uuid, sidebar_order: Vec<String>) -> Result<UserPreferences> {
        let prefs = sqlx::query_as::<_, UserPreferences>(
            r#"
            INSERT INTO user_preferences (user_id, sidebar_order)
            VALUES ($1, $2)
            ON CONFLICT (user_id) DO UPDATE SET
                sidebar_order = EXCLUDED.sidebar_order,
                updated_at = NOW()
            RETURNING user_id, sidebar_order, created_at, updated_at
            "#,
        )
        .bind(user_id)
        .bind(sqlx::types::Json(sidebar_order))
        .fetch_one(pool)
        .await?;

        Ok(prefs)
    }
}
