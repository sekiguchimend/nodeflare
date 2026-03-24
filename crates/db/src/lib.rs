pub mod models;
pub mod repositories;

use mcp_common::AppConfig;
use sqlx::postgres::{PgPool, PgPoolOptions};
use std::time::Duration;

pub use models::*;
pub use repositories::*;

pub type DbPool = PgPool;

pub async fn create_pool(config: &AppConfig) -> anyhow::Result<DbPool> {
    let pool = PgPoolOptions::new()
        .max_connections(config.database.max_connections)
        .min_connections(config.database.min_connections)
        .acquire_timeout(Duration::from_secs(config.database.acquire_timeout_secs))
        .idle_timeout(Duration::from_secs(config.database.idle_timeout_secs))
        .connect(&config.database.url)
        .await?;

    tracing::info!(
        "Database connection pool established (max: {}, min: {})",
        config.database.max_connections,
        config.database.min_connections
    );

    Ok(pool)
}

pub async fn run_migrations(pool: &DbPool) -> anyhow::Result<()> {
    sqlx::migrate!("../../migrations")
        .run(pool)
        .await?;

    tracing::info!("Database migrations completed");

    Ok(())
}
