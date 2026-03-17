use fred::prelude::RedisClient;
use mcp_auth::{CryptoService, JwtService};
use mcp_billing::{BillingService, WebhookHandler};
use mcp_common::AppConfig;
use mcp_db::DbPool;
use mcp_github::GitHubApp;
use mcp_queue::JobQueue;

use crate::ws_manager::WsManager;

pub struct AppState {
    pub config: AppConfig,
    pub db: DbPool,
    pub redis: RedisClient,
    pub jwt: JwtService,
    pub crypto: CryptoService,
    pub job_queue: JobQueue,
    pub github: Option<GitHubApp>,
    pub ws_manager: WsManager,
    pub billing: Option<BillingService>,
    pub webhook_handler: Option<WebhookHandler>,
}

impl AppState {
    pub fn new(
        config: AppConfig,
        db: DbPool,
        redis: RedisClient,
        job_queue: JobQueue,
        github: Option<GitHubApp>,
    ) -> Self {
        let jwt = JwtService::new(&config);

        // In production, use a proper key from config
        let crypto = CryptoService::from_hex(
            &std::env::var("ENCRYPTION_KEY")
                .unwrap_or_else(|_| CryptoService::generate_key()),
        )
        .expect("Invalid encryption key");

        let ws_manager = WsManager::new();

        // Initialize Stripe billing (optional)
        let (billing, webhook_handler) = match (
            std::env::var("STRIPE_SECRET_KEY"),
            std::env::var("STRIPE_WEBHOOK_SECRET"),
        ) {
            (Ok(secret_key), Ok(webhook_secret)) => {
                let base_url = std::env::var("APP_URL")
                    .unwrap_or_else(|_| "http://localhost:3000".to_string());
                let billing = BillingService::new(&secret_key, &base_url);
                let webhook = WebhookHandler::new(&webhook_secret, db.clone());
                tracing::info!("Stripe billing initialized");
                (Some(billing), Some(webhook))
            }
            _ => {
                tracing::warn!("Stripe not configured - billing features disabled");
                (None, None)
            }
        };

        Self {
            config,
            db,
            redis,
            jwt,
            crypto,
            job_queue,
            github,
            ws_manager,
            billing,
            webhook_handler,
        }
    }
}
