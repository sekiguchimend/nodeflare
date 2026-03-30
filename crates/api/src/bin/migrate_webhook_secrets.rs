//! Migration tool to encrypt existing plain-text webhook secrets
//!
//! This tool reads all deploy_webhooks with non-null `secret` column,
//! encrypts them using CryptoService, and stores the encrypted values.
//!
//! Usage:
//!   cargo run --bin migrate-webhook-secrets
//!
//! Environment variables:
//!   DATABASE_URL - PostgreSQL connection string
//!   ENCRYPTION_KEY - 32-byte hex-encoded encryption key (64 hex characters)
//!   JWT_SECRET - Required by AppConfig

use anyhow::{Context, Result};
use mcp_auth::CryptoService;
use mcp_common::AppConfig;
use sqlx::PgPool;
use std::env;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "migrate_webhook_secrets=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Starting webhook secret migration");

    // Load configuration
    let config = AppConfig::from_env().context("Failed to load configuration")?;

    // Get encryption key from environment
    let encryption_key = env::var("ENCRYPTION_KEY")
        .context("ENCRYPTION_KEY environment variable is required")?;

    // Create crypto service
    let crypto = CryptoService::from_hex(&encryption_key)
        .context("Failed to create crypto service - ENCRYPTION_KEY must be 64 hex characters (32 bytes)")?;

    // Create database pool
    let db_pool = mcp_db::create_pool(&config)
        .await
        .context("Failed to connect to database")?;

    // Run migration
    let migrated = migrate_webhook_secrets(&db_pool, &crypto).await?;

    tracing::info!("Migration complete. Migrated {} webhook secrets.", migrated);

    Ok(())
}

/// Migrate plain-text webhook secrets to encrypted format
async fn migrate_webhook_secrets(pool: &PgPool, crypto: &CryptoService) -> Result<usize> {
    // Find all webhooks with plain-text secrets that haven't been migrated yet
    let webhooks: Vec<WebhookToMigrate> = sqlx::query_as(
        r#"
        SELECT id, secret
        FROM deploy_webhooks
        WHERE secret IS NOT NULL
          AND secret != ''
          AND encrypted_secret IS NULL
        "#,
    )
    .fetch_all(pool)
    .await
    .context("Failed to fetch webhooks with plain-text secrets")?;

    let total = webhooks.len();
    tracing::info!("Found {} webhooks with plain-text secrets to migrate", total);

    let mut migrated = 0;
    let mut errors = 0;

    for webhook in webhooks {
        match migrate_single_webhook(pool, crypto, &webhook).await {
            Ok(()) => {
                migrated += 1;
                tracing::debug!("Migrated webhook {}", webhook.id);
            }
            Err(e) => {
                errors += 1;
                tracing::error!("Failed to migrate webhook {}: {}", webhook.id, e);
            }
        }
    }

    if errors > 0 {
        tracing::warn!(
            "Migration completed with {} errors out of {} webhooks",
            errors,
            total
        );
    }

    Ok(migrated)
}

/// Migrate a single webhook's secret
async fn migrate_single_webhook(
    pool: &PgPool,
    crypto: &CryptoService,
    webhook: &WebhookToMigrate,
) -> Result<()> {
    let secret = webhook
        .secret
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("Secret is None"))?;

    // Encrypt the secret
    let (encrypted_secret, nonce) = crypto
        .encrypt_string(secret)
        .context("Failed to encrypt secret")?;

    // Update the webhook with encrypted secret and clear plain-text
    sqlx::query(
        r#"
        UPDATE deploy_webhooks
        SET
            encrypted_secret = $2,
            secret_nonce = $3,
            secret = NULL,
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(webhook.id)
    .bind(&encrypted_secret)
    .bind(&nonce)
    .execute(pool)
    .await
    .context("Failed to update webhook")?;

    Ok(())
}

#[derive(sqlx::FromRow)]
struct WebhookToMigrate {
    id: uuid::Uuid,
    secret: Option<String>,
}
