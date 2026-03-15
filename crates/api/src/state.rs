use fred::prelude::RedisClient;
use mcp_auth::{CryptoService, JwtService};
use mcp_common::AppConfig;
use mcp_db::DbPool;
use mcp_github::GitHubApp;
use mcp_queue::JobQueue;

pub struct AppState {
    pub config: AppConfig,
    pub db: DbPool,
    pub redis: RedisClient,
    pub jwt: JwtService,
    pub crypto: CryptoService,
    pub job_queue: JobQueue,
    pub github: Option<GitHubApp>,
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

        Self {
            config,
            db,
            redis,
            jwt,
            crypto,
            job_queue,
            github,
        }
    }
}
