use anyhow::Result;
use axum::{
    body::Body,
    extract::{Host, State},
    http::{Request, StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::any,
    Router,
};
use bytes::Bytes;
use fred::interfaces::ClientLike;
use mcp_common::{AppConfig, McpMethod};
use mcp_db::{ApiKey, McpServer, ServerRepository};
use std::sync::Arc;
use std::time::Instant;
use tokio::net::TcpListener;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod auth;
mod cache;
mod rate_limit;

use cache::{RequestCache, CoalesceResult};

pub struct ProxyState {
    pub config: AppConfig,
    pub db: mcp_db::DbPool,
    pub redis: fred::prelude::RedisClient,
    pub http_client: reqwest::Client,
    pub request_cache: RequestCache,
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

    // Request cache: 30 second TTL, max 10000 entries
    let request_cache = RequestCache::new(30, 10000);

    let state = Arc::new(ProxyState {
        config: config.clone(),
        db: db_pool,
        redis,
        http_client,
        request_cache,
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

    // 4. Check rate limit (per-minute)
    rate_limit::check(&state, &api_key_record, &server).await?;

    // 5. Check monthly quota based on workspace plan
    rate_limit::check_monthly_quota(&state, server.workspace_id).await?;

    // 6. Forward request to MCP server
    let endpoint_url = server
        .endpoint_url
        .as_ref()
        .ok_or_else(|| ProxyError::ServiceUnavailable("Server not deployed".into()))?;

    let path = uri.path();
    let query = uri.query().map(|q| format!("?{}", q)).unwrap_or_default();
    let target_url = format!("{}{}{}", endpoint_url, path, query);

    // 7. Forward request (includes scope check)
    let (response, mcp_info) = forward_request(&state, &target_url, request, &api_key_record).await?;

    // 8. Increment monthly counter on success (async, don't block response)
    if response.status().is_success() {
        let state_clone = state.clone();
        let workspace_id = server.workspace_id;
        tokio::spawn(async move {
            if let Err(e) = rate_limit::increment_monthly_counter(&state_clone, workspace_id).await {
                tracing::warn!("Failed to increment monthly counter: {}", e);
            }
        });
    }

    // 9. Log request (async, don't block)
    let duration_ms = start.elapsed().as_millis() as i32;
    let server_id = server.id;
    let api_key_id = api_key_record.id;
    let status = if response.status().is_success() {
        "success"
    } else {
        "error"
    };
    let tool_name = mcp_info.target.clone();

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

/// Extracted MCP request info for scope checking and logging
#[derive(Debug, Clone)]
struct McpRequestInfo {
    method: McpMethod,
    method_str: Option<String>,
    target: Option<String>,
}

/// Extract MCP method and target from JSON-RPC request body
fn extract_mcp_request_info(body: &[u8]) -> McpRequestInfo {
    let mut info = McpRequestInfo {
        method: McpMethod::Unknown,
        method_str: None,
        target: None,
    };

    if let Ok(json) = serde_json::from_slice::<serde_json::Value>(body) {
        if let Some(method_str) = json.get("method").and_then(|m| m.as_str()) {
            info.method_str = Some(method_str.to_string());
            info.method = McpMethod::parse(method_str);

            // Extract target based on method type
            match info.method {
                McpMethod::ToolsCall => {
                    // Extract tool name from params.name
                    info.target = json
                        .get("params")
                        .and_then(|p| p.get("name"))
                        .and_then(|n| n.as_str())
                        .map(String::from);
                }
                McpMethod::ResourcesRead => {
                    // Extract resource URI from params.uri
                    info.target = json
                        .get("params")
                        .and_then(|p| p.get("uri"))
                        .and_then(|u| u.as_str())
                        .map(String::from);
                }
                McpMethod::PromptsGet => {
                    // Extract prompt name from params.name
                    info.target = json
                        .get("params")
                        .and_then(|p| p.get("name"))
                        .and_then(|n| n.as_str())
                        .map(String::from);
                }
                _ => {}
            }
        }
    }

    info
}

/// Check if API key has permission for the MCP request
fn check_scope_permission(api_key: &ApiKey, mcp_info: &McpRequestInfo) -> Result<(), ProxyError> {
    // Unknown methods are allowed (forward compatibility)
    if matches!(mcp_info.method, McpMethod::Unknown) {
        return Ok(());
    }

    let allowed = api_key.is_method_allowed(mcp_info.method, mcp_info.target.as_deref());

    if allowed {
        Ok(())
    } else {
        let scope_needed = match mcp_info.method {
            McpMethod::ToolsList => "tools:list or tools:*",
            McpMethod::ToolsCall => {
                if let Some(ref tool) = mcp_info.target {
                    return Err(ProxyError::Forbidden(format!(
                        "API key lacks permission for tools:call:{} (need tools:call, tools:call:{}, or tools:*)",
                        tool, tool
                    )));
                }
                "tools:call or tools:*"
            }
            McpMethod::ResourcesList => "resources:list or resources:*",
            McpMethod::ResourcesRead => {
                if let Some(ref uri) = mcp_info.target {
                    return Err(ProxyError::Forbidden(format!(
                        "API key lacks permission for resources:read:{} (need resources:read, resources:read:{}, or resources:*)",
                        uri, uri
                    )));
                }
                "resources:read or resources:*"
            }
            McpMethod::PromptsList => "prompts:list or prompts:*",
            McpMethod::PromptsGet => {
                if let Some(ref name) = mcp_info.target {
                    return Err(ProxyError::Forbidden(format!(
                        "API key lacks permission for prompts:get:{} (need prompts:get, prompts:get:{}, or prompts:*)",
                        name, name
                    )));
                }
                "prompts:get or prompts:*"
            }
            McpMethod::Unknown => return Ok(()),
        };

        Err(ProxyError::Forbidden(format!(
            "API key lacks required scope: {}",
            scope_needed
        )))
    }
}

async fn forward_request(
    state: &ProxyState,
    target_url: &str,
    request: Request<Body>,
    api_key: &ApiKey,
) -> Result<(Response, McpRequestInfo), ProxyError> {
    let method = request.method().clone();
    let headers = request.headers().clone();

    // Read body
    let body_bytes = axum::body::to_bytes(request.into_body(), 10 * 1024 * 1024)
        .await
        .map_err(|e| ProxyError::BadRequest(format!("Failed to read body: {}", e)))?;

    // Extract MCP request info (method + target)
    let mcp_info = extract_mcp_request_info(&body_bytes);

    // Check scope permission before forwarding
    check_scope_permission(api_key, &mcp_info)?;

    // Only cache read-only MCP methods (list operations)
    let is_cacheable = matches!(
        mcp_info.method,
        McpMethod::ToolsList | McpMethod::ResourcesList | McpMethod::PromptsList
    );

    // Try request coalescing + caching for cacheable requests
    if is_cacheable {
        match state.request_cache.try_coalesce(target_url, &body_bytes).await {
            CoalesceResult::Cached(cached) => {
                tracing::debug!("Cache hit for {}", target_url);
                let response = build_response_from_cache(&cached)?;
                return Ok((response, mcp_info));
            }
            CoalesceResult::Coalesced(cached) => {
                tracing::debug!("Request coalesced for {}", target_url);
                let response = build_response_from_cache(&cached)?;
                return Ok((response, mcp_info));
            }
            CoalesceResult::Execute(handle) => {
                // Execute the request and cache the result
                match execute_upstream_request(state, target_url, method, &headers, body_bytes).await {
                    Ok((response_body, status, response_headers)) => {
                        // Cache successful responses only
                        if status >= 200 && status < 300 {
                            state.request_cache.complete(handle, response_body.clone(), status, response_headers.clone()).await;
                        } else {
                            state.request_cache.cancel(handle).await;
                        }

                        let response = build_response(status, &response_headers, response_body)?;
                        return Ok((response, mcp_info));
                    }
                    Err(e) => {
                        state.request_cache.cancel(handle).await;
                        return Err(e);
                    }
                }
            }
        }
    }

    // Non-cacheable requests: execute directly
    let (response_body, status, response_headers) =
        execute_upstream_request(state, target_url, method, &headers, body_bytes).await?;

    let response = build_response(status, &response_headers, response_body)?;
    Ok((response, mcp_info))
}

/// Build response from cached data
fn build_response_from_cache(cached: &cache::CachedResponse) -> Result<Response, ProxyError> {
    let mut builder = Response::builder().status(cached.status);
    for (name, value) in &cached.headers {
        builder = builder.header(name.as_str(), value.as_str());
    }
    builder
        .body(Body::from(cached.body.clone()))
        .map_err(|e| ProxyError::Internal(e.to_string()))
}

/// Build response from raw parts
fn build_response(status: u16, headers: &[(String, String)], body: Vec<u8>) -> Result<Response, ProxyError> {
    let mut builder = Response::builder().status(status);
    for (name, value) in headers {
        builder = builder.header(name.as_str(), value.as_str());
    }
    builder
        .body(Body::from(body))
        .map_err(|e| ProxyError::Internal(e.to_string()))
}

/// Execute request to upstream MCP server
async fn execute_upstream_request(
    state: &ProxyState,
    target_url: &str,
    method: axum::http::Method,
    headers: &axum::http::HeaderMap,
    body_bytes: Bytes,
) -> Result<(Vec<u8>, u16, Vec<(String, String)>), ProxyError> {
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
    let status = response.status().as_u16();
    let headers: Vec<(String, String)> = response
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();
    let body = response
        .bytes()
        .await
        .map_err(|e| ProxyError::Internal(format!("Failed to read response: {}", e)))?;

    Ok((body.to_vec(), status, headers))
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
pub enum ProxyError {
    Unauthorized(String),
    Forbidden(String),
    NotFound(String),
    BadRequest(String),
    RateLimitExceeded,
    QuotaExceeded(String),
    PaymentRequired(String),
    ServiceUnavailable(String),
    Internal(String),
}

impl std::fmt::Display for ProxyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ProxyError::Unauthorized(m) => write!(f, "Unauthorized: {}", m),
            ProxyError::Forbidden(m) => write!(f, "Forbidden: {}", m),
            ProxyError::NotFound(m) => write!(f, "Not found: {}", m),
            ProxyError::BadRequest(m) => write!(f, "Bad request: {}", m),
            ProxyError::RateLimitExceeded => write!(f, "Rate limit exceeded"),
            ProxyError::QuotaExceeded(m) => write!(f, "Quota exceeded: {}", m),
            ProxyError::PaymentRequired(m) => write!(f, "Payment required: {}", m),
            ProxyError::ServiceUnavailable(m) => write!(f, "Service unavailable: {}", m),
            ProxyError::Internal(m) => write!(f, "Internal error: {}", m),
        }
    }
}

impl IntoResponse for ProxyError {
    fn into_response(self) -> Response {
        let (status, message, error_code) = match self {
            ProxyError::Unauthorized(m) => (StatusCode::UNAUTHORIZED, m, "UNAUTHORIZED"),
            ProxyError::Forbidden(m) => (StatusCode::FORBIDDEN, m, "FORBIDDEN"),
            ProxyError::NotFound(m) => (StatusCode::NOT_FOUND, m, "NOT_FOUND"),
            ProxyError::BadRequest(m) => (StatusCode::BAD_REQUEST, m, "BAD_REQUEST"),
            ProxyError::RateLimitExceeded => {
                (StatusCode::TOO_MANY_REQUESTS, "Rate limit exceeded. Please slow down.".to_string(), "RATE_LIMIT_EXCEEDED")
            }
            ProxyError::QuotaExceeded(m) => {
                (StatusCode::TOO_MANY_REQUESTS, m, "MONTHLY_QUOTA_EXCEEDED")
            }
            ProxyError::PaymentRequired(m) => {
                (StatusCode::PAYMENT_REQUIRED, m, "PAYMENT_REQUIRED")
            }
            ProxyError::ServiceUnavailable(m) => (StatusCode::SERVICE_UNAVAILABLE, m, "SERVICE_UNAVAILABLE"),
            ProxyError::Internal(m) => (StatusCode::INTERNAL_SERVER_ERROR, m, "INTERNAL_ERROR"),
        };

        let body = serde_json::json!({
            "error": {
                "code": error_code,
                "status": status.as_u16(),
                "message": message
            }
        });

        (status, axum::Json(body)).into_response()
    }
}
