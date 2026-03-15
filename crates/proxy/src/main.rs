use anyhow::Result;
use axum::{
    body::Body,
    extract::{Host, State},
    http::{Request, StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::any,
    Router,
};
use fred::interfaces::ClientLike;
use mcp_common::AppConfig;
use mcp_db::{ApiKeyRepository, McpServer, ServerRepository, ToolRepository};
use std::sync::Arc;
use std::time::Instant;
use tokio::net::TcpListener;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod auth;
mod rate_limit;

pub struct ProxyState {
    pub config: AppConfig,
    pub db: mcp_db::DbPool,
    pub redis: fred::prelude::RedisClient,
    pub http_client: reqwest::Client,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "mcp_proxy=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = AppConfig::from_env()?;
    tracing::info!("Starting MCP Cloud Proxy Gateway");

    let db_pool = mcp_db::create_pool(&config).await?;

    let redis_config = fred::types::RedisConfig::from_url(&config.redis.url)?;
    let redis = fred::prelude::RedisClient::new(redis_config, None, None, None);
    redis.connect();
    redis.wait_for_connect().await?;

    let http_client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()?;

    let state = Arc::new(ProxyState {
        config: config.clone(),
        db: db_pool,
        redis,
        http_client,
    });

    let app = Router::new()
        .route("/health", any(health_check))
        // Subdomain-based routing: {slug}.mcp.cloud/* -> MCP server
        .fallback(any(proxy_handler))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = format!("{}:{}", config.server.host, config.server.proxy_port);
    let listener = TcpListener::bind(&addr).await?;
    tracing::info!("Proxy gateway listening on {}", addr);

    axum::serve(listener, app).await?;

    Ok(())
}

async fn health_check() -> &'static str {
    "ok"
}

async fn proxy_handler(
    State(state): State<Arc<ProxyState>>,
    Host(host): Host,
    uri: Uri,
    request: Request<Body>,
) -> Result<Response, ProxyError> {
    let start = Instant::now();

    // 1. Extract server slug from subdomain
    // e.g., "my-server.mcp.cloud" -> "my-server"
    let server_slug = extract_subdomain(&host, &state.config.server.proxy_base_domain)?;

    // 2. Extract and validate API key
    let api_key = auth::extract_api_key(&request)?;
    let api_key_record = auth::validate_api_key(&state, &api_key).await?;

    // 3. Resolve server by slug
    let server = resolve_server(&state, &server_slug).await?;

    // Verify API key has access to this server
    if let Some(key_server_id) = api_key_record.server_id {
        if key_server_id != server.id {
            return Err(ProxyError::Forbidden("API key not valid for this server".into()));
        }
    }

    // 4. Check rate limit
    rate_limit::check(&state, &api_key_record, &server).await?;

    // 5. Forward request to MCP server
    let endpoint_url = server
        .endpoint_url
        .as_ref()
        .ok_or_else(|| ProxyError::ServiceUnavailable("Server not deployed".into()))?;

    let path = uri.path();
    let query = uri.query().map(|q| format!("?{}", q)).unwrap_or_default();
    let target_url = format!("{}{}{}", endpoint_url, path, query);

    let (response, tool_name) = forward_request(&state, &target_url, request).await?;

    // 6. Log request (async, don't block)
    let duration_ms = start.elapsed().as_millis() as i32;
    let server_id = server.id;
    let api_key_id = api_key_record.id;
    let status = if response.status().is_success() {
        "success"
    } else {
        "error"
    };

    let db = state.db.clone();
    tokio::spawn(async move {
        let _ = mcp_db::RequestLogRepository::create(
            &db,
            mcp_db::CreateRequestLog {
                server_id,
                tool_name,
                api_key_id: Some(api_key_id),
                client_info: None,
                request_body: None,
                response_status: status.to_string(),
                error_message: None,
                duration_ms,
            },
        )
        .await;
    });

    Ok(response)
}

async fn resolve_server(state: &ProxyState, slug: &str) -> Result<McpServer, ProxyError> {
    ServerRepository::find_by_endpoint_slug(&state.db, slug)
        .await
        .map_err(|e| ProxyError::Internal(e.to_string()))?
        .ok_or_else(|| ProxyError::NotFound("Server not found".into()))
}

/// Extract tool name from MCP JSON-RPC request body
fn extract_tool_name(body: &[u8]) -> Option<String> {
    // Try to parse as JSON-RPC request
    if let Ok(json) = serde_json::from_slice::<serde_json::Value>(body) {
        // Check if it's a tools/call method
        if let Some(method) = json.get("method").and_then(|m| m.as_str()) {
            if method == "tools/call" {
                // Extract tool name from params.name
                return json
                    .get("params")
                    .and_then(|p| p.get("name"))
                    .and_then(|n| n.as_str())
                    .map(String::from);
            }
        }
    }
    None
}

async fn forward_request(
    state: &ProxyState,
    target_url: &str,
    request: Request<Body>,
) -> Result<(Response, Option<String>), ProxyError> {
    let method = request.method().clone();
    let headers = request.headers().clone();

    // Read body
    let body_bytes = axum::body::to_bytes(request.into_body(), 10 * 1024 * 1024)
        .await
        .map_err(|e| ProxyError::BadRequest(format!("Failed to read body: {}", e)))?;

    // Extract tool name from request body
    let tool_name = extract_tool_name(&body_bytes);

    // Build outgoing request
    let mut req_builder = state.http_client.request(method, target_url);

    // Copy relevant headers
    for (name, value) in headers.iter() {
        if name != "host" && name != "authorization" {
            req_builder = req_builder.header(name, value);
        }
    }

    req_builder = req_builder.body(body_bytes);

    // Send request
    let response = req_builder
        .send()
        .await
        .map_err(|e| ProxyError::ServiceUnavailable(format!("Upstream error: {}", e)))?;

    // Convert response
    let status = response.status();
    let headers = response.headers().clone();
    let body = response
        .bytes()
        .await
        .map_err(|e| ProxyError::Internal(format!("Failed to read response: {}", e)))?;

    let mut builder = Response::builder().status(status);
    for (name, value) in headers.iter() {
        builder = builder.header(name, value);
    }

    let response = builder
        .body(Body::from(body))
        .map_err(|e| ProxyError::Internal(e.to_string()))?;

    Ok((response, tool_name))
}

/// Extract server slug from subdomain
/// e.g., "my-server.mcp.cloud" with base "mcp.cloud" -> "my-server"
/// e.g., "my-server.localhost:8081" with base "localhost:8081" -> "my-server"
fn extract_subdomain(host: &str, base_domain: &str) -> Result<String, ProxyError> {
    // Remove port from host if present for comparison
    let host_without_port = host.split(':').next().unwrap_or(host);
    let base_without_port = base_domain.split(':').next().unwrap_or(base_domain);

    // Check if this is a subdomain of the base domain
    if let Some(subdomain) = host_without_port.strip_suffix(&format!(".{}", base_without_port)) {
        if subdomain.is_empty() || subdomain.contains('.') {
            return Err(ProxyError::BadRequest("Invalid subdomain format".into()));
        }
        Ok(subdomain.to_string())
    } else if host_without_port == base_without_port {
        // Direct access to base domain (e.g., mcp.cloud without subdomain)
        Err(ProxyError::BadRequest(
            "No server specified. Use {server-slug}.{base-domain}".into(),
        ))
    } else {
        Err(ProxyError::BadRequest(format!(
            "Invalid host: expected *.{}",
            base_domain
        )))
    }
}

#[derive(Debug)]
enum ProxyError {
    Unauthorized(String),
    Forbidden(String),
    NotFound(String),
    BadRequest(String),
    RateLimitExceeded,
    ServiceUnavailable(String),
    Internal(String),
}

impl IntoResponse for ProxyError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            ProxyError::Unauthorized(m) => (StatusCode::UNAUTHORIZED, m),
            ProxyError::Forbidden(m) => (StatusCode::FORBIDDEN, m),
            ProxyError::NotFound(m) => (StatusCode::NOT_FOUND, m),
            ProxyError::BadRequest(m) => (StatusCode::BAD_REQUEST, m),
            ProxyError::RateLimitExceeded => {
                (StatusCode::TOO_MANY_REQUESTS, "Rate limit exceeded".to_string())
            }
            ProxyError::ServiceUnavailable(m) => (StatusCode::SERVICE_UNAVAILABLE, m),
            ProxyError::Internal(m) => (StatusCode::INTERNAL_SERVER_ERROR, m),
        };

        let body = serde_json::json!({
            "error": {
                "code": status.as_u16(),
                "message": message
            }
        });

        (status, axum::Json(body)).into_response()
    }
}
