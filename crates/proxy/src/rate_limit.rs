use fred::interfaces::{KeysInterface, SortedSetsInterface};
use mcp_db::{ApiKey, McpServer};

use crate::{ProxyError, ProxyState};

const DEFAULT_RATE_LIMIT: i32 = 100; // requests per minute
const WINDOW_SIZE_SECONDS: i64 = 60;

pub async fn check(
    state: &ProxyState,
    api_key: &ApiKey,
    server: &McpServer,
) -> Result<(), ProxyError> {
    let key = format!("rate_limit:{}:{}", api_key.id, server.id);
    let now = chrono::Utc::now().timestamp();
    let window_start = now - WINDOW_SIZE_SECONDS;

    // Use Redis sorted set for sliding window rate limiting
    // Remove old entries
    let _: () = state
        .redis
        .zremrangebyscore(&key, f64::NEG_INFINITY, window_start as f64)
        .await
        .map_err(|e| ProxyError::Internal(format!("Redis error: {}", e)))?;

    // Count current requests in window
    let count: i64 = state
        .redis
        .zcount(&key, window_start as f64, f64::INFINITY)
        .await
        .map_err(|e| ProxyError::Internal(format!("Redis error: {}", e)))?;

    // Check limit - use server config or default
    let limit = server.rate_limit_per_minute.unwrap_or(DEFAULT_RATE_LIMIT) as i64;

    if count >= limit {
        return Err(ProxyError::RateLimitExceeded);
    }

    // Add current request
    let _: () = state
        .redis
        .zadd(
            &key,
            None,
            None,
            false,
            false,
            (now as f64, now.to_string().as_str()),
        )
        .await
        .map_err(|e| ProxyError::Internal(format!("Redis error: {}", e)))?;

    // Set TTL on the key
    let _: () = state
        .redis
        .expire(&key, WINDOW_SIZE_SECONDS * 2)
        .await
        .map_err(|e| ProxyError::Internal(format!("Redis error: {}", e)))?;

    Ok(())
}
