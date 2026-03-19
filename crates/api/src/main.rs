use anyhow::Result;
use axum::{routing::get, Router};
use fred::interfaces::ClientLike;
use mcp_common::AppConfig;
use std::{net::SocketAddr, sync::Arc};
use tokio::net::TcpListener;
use tower_http::{
    compression::CompressionLayer,
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod error;
mod extractors;
mod middleware;
mod redis_subscriber;
mod routes;
mod state;
mod ws_manager;

use state::AppState;

#[tokio::main]
async fn main() -> Result<()> {
    // Install rustls crypto provider (required for TLS connections)
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("Failed to install rustls crypto provider");

    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "mcp_api=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load configuration
    let config = AppConfig::from_env()?;
    tracing::info!("Starting MCP Cloud API server");

    // Create database pool
    let db_pool = mcp_db::create_pool(&config).await?;

    // Run migrations
    mcp_db::run_migrations(&db_pool).await?;

    // Create Redis client
    let redis_config = fred::types::RedisConfig::from_url(&config.redis.url)?;
    let redis = fred::prelude::RedisClient::new(redis_config, None, None, None);
    redis.connect();
    redis.wait_for_connect().await?;
    tracing::info!("Connected to Redis");

    // Create job queue for background tasks
    let job_queue = mcp_queue::JobQueue::connect(&config.redis.url).await?;
    tracing::info!("Connected to job queue");

    // Create GitHub App client (optional)
    let github = mcp_github::GitHubApp::new(&config).ok();
    if github.is_some() {
        tracing::info!("GitHub App initialized");
    } else {
        tracing::warn!("GitHub App not configured - private repos will not be accessible");
    }

    // Create app state
    let state = Arc::new(AppState::new(config.clone(), db_pool, redis, job_queue, github));

    // Start Redis subscriber for WebSocket events
    redis_subscriber::start_redis_subscriber(
        &config.redis.url,
        Arc::new(state.ws_manager.clone()),
    )
    .await;
    tracing::info!("Redis subscriber started for WebSocket events");

    // Build router
    let app = create_router(state);

    // Start server
    let addr = format!("{}:{}", config.server.host, config.server.port);
    let listener = TcpListener::bind(&addr).await?;
    tracing::info!("API server listening on {}", addr);

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;

    Ok(())
}

fn create_router(state: Arc<AppState>) -> Router {
    // CORS configuration
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        // Health check
        .route("/health", get(routes::health::health_check))
        .route("/ready", get(routes::health::readiness_check))
        // API v1
        .nest("/api/v1", routes::api_router())
        // WebSocket endpoints
        .nest("/ws", routes::ws_router())
        // OpenAPI docs
        .merge(routes::openapi::openapi_router())
        // Middleware
        .layer(TraceLayer::new_for_http())
        .layer(CompressionLayer::new())
        .layer(cors)
        .with_state(state)
}
