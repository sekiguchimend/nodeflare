use chrono::Datelike;
use fred::interfaces::{KeysInterface, LuaInterface};
use mcp_billing::Plan;
use mcp_db::{ApiKey, McpServer, WorkspaceRepository};
use uuid::Uuid;

use crate::{ProxyError, ProxyState};

const DEFAULT_RATE_LIMIT: i32 = 100; // requests per minute
const WINDOW_SIZE_SECONDS: i64 = 60;

/// Lua script for atomic sliding window rate limiting
/// This prevents race conditions by performing all operations atomically
const RATE_LIMIT_SCRIPT: &str = r#"
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window_start = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])

-- Remove old entries
redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

-- Count current requests in window
local count = redis.call('ZCOUNT', key, window_start, '+inf')

-- Check if limit exceeded
if count >= limit then
    return -1
end

-- Add current request with unique member (timestamp + random suffix)
local member = now .. ':' .. math.random(1000000)
redis.call('ZADD', key, now, member)

-- Set TTL on the key
redis.call('EXPIRE', key, ttl)

return count + 1
"#;

pub async fn check(
    state: &ProxyState,
    api_key: &ApiKey,
    server: &McpServer,
) -> Result<(), ProxyError> {
    let key = format!("rate_limit:{}:{}", api_key.id, server.id);
    let now = chrono::Utc::now().timestamp();
    let window_start = now - WINDOW_SIZE_SECONDS;
    let limit = server.rate_limit_per_minute.unwrap_or(DEFAULT_RATE_LIMIT) as i64;
    let ttl = WINDOW_SIZE_SECONDS * 2;

    // Execute atomic rate limiting with Lua script
    let result: i64 = state
        .redis
        .eval(
            RATE_LIMIT_SCRIPT,
            &[key],
            &[
                now.to_string(),
                window_start.to_string(),
                limit.to_string(),
                ttl.to_string(),
            ],
        )
        .await
        .map_err(|e| ProxyError::Internal(format!("Redis error: {}", e)))?;

    if result < 0 {
        return Err(ProxyError::RateLimitExceeded);
    }

    Ok(())
}

/// Check monthly request quota based on workspace plan
pub async fn check_monthly_quota(
    state: &ProxyState,
    workspace_id: Uuid,
) -> Result<(), ProxyError> {
    // Get workspace to check plan
    let workspace = WorkspaceRepository::find_by_id(&state.db, workspace_id)
        .await
        .map_err(|e| ProxyError::Internal(format!("Database error: {}", e)))?
        .ok_or_else(|| ProxyError::Internal("Workspace not found".into()))?;

    // Check subscription status - block if past_due or cancelled
    if let Some(ref status) = workspace.subscription_status {
        if status == "past_due" || status == "unpaid" {
            return Err(ProxyError::PaymentRequired(
                "Your subscription payment is past due. Please update your payment method.".into()
            ));
        }
        if status == "cancelled" && workspace.plan != "free" {
            // If cancelled but not yet downgraded to free, check period end
            if let Some(period_end) = workspace.current_period_end {
                if chrono::Utc::now() > period_end {
                    return Err(ProxyError::PaymentRequired(
                        "Your subscription has expired. Please renew to continue.".into()
                    ));
                }
            }
        }
    }

    // Get plan limits
    let billing_plan = match workspace.plan.as_str() {
        "pro" => Plan::Pro,
        "team" => Plan::Team,
        "enterprise" => Plan::Enterprise,
        _ => Plan::Free,
    };
    let limits = billing_plan.limits();

    // Enterprise has unlimited requests
    if limits.max_requests_per_month == u64::MAX {
        return Ok(());
    }

    // Get current month key
    let now = chrono::Utc::now();
    let month_key = format!(
        "monthly_requests:{}:{:04}-{:02}",
        workspace_id,
        now.year(),
        now.month()
    );

    // Get current count from Redis
    let count: Option<i64> = state
        .redis
        .get(&month_key)
        .await
        .map_err(|e| ProxyError::Internal(format!("Redis error: {}", e)))?;

    let current_count = count.unwrap_or(0) as u64;

    if current_count >= limits.max_requests_per_month {
        return Err(ProxyError::QuotaExceeded(format!(
            "Monthly request quota exceeded ({}/{}). Please upgrade your plan.",
            current_count, limits.max_requests_per_month
        )));
    }

    Ok(())
}

/// Increment monthly request counter
pub async fn increment_monthly_counter(
    state: &ProxyState,
    workspace_id: Uuid,
) -> Result<(), ProxyError> {
    let now = chrono::Utc::now();
    let month_key = format!(
        "monthly_requests:{}:{:04}-{:02}",
        workspace_id,
        now.year(),
        now.month()
    );

    // Increment counter
    let _: i64 = state
        .redis
        .incr(&month_key)
        .await
        .map_err(|e| ProxyError::Internal(format!("Redis error: {}", e)))?;

    // Set TTL to expire after this month (add some buffer days)
    // Calculate days remaining in month + 5 days buffer
    let days_in_month = match now.month() {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => if now.year() % 4 == 0 && (now.year() % 100 != 0 || now.year() % 400 == 0) { 29 } else { 28 },
        _ => 31,
    };
    let ttl_seconds = ((days_in_month - now.day() + 5) as i64) * 24 * 60 * 60;

    let _: () = state
        .redis
        .expire(&month_key, ttl_seconds)
        .await
        .map_err(|e| ProxyError::Internal(format!("Redis error: {}", e)))?;

    Ok(())
}
