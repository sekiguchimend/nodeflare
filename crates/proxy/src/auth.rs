use axum::{body::Body, http::Request};
use mcp_auth::ApiKeyService;
use mcp_db::{ApiKey, ApiKeyRepository};

use crate::rate_limit::{
    clear_api_key_failed_attempts, get_api_key_lockout_remaining, is_api_key_locked_out,
    record_api_key_failed_attempt,
};
use crate::{ProxyError, ProxyState};

pub fn extract_api_key(request: &Request<Body>) -> Result<String, ProxyError> {
    // Check Authorization header first
    if let Some(auth_header) = request.headers().get("authorization") {
        let auth_str = auth_header
            .to_str()
            .map_err(|_| ProxyError::Unauthorized("Invalid authorization header".into()))?;

        if let Some(key) = auth_str.strip_prefix("Bearer ") {
            return Ok(key.to_string());
        }
    }

    // Check X-API-Key header
    if let Some(api_key_header) = request.headers().get("x-api-key") {
        let key = api_key_header
            .to_str()
            .map_err(|_| ProxyError::Unauthorized("Invalid API key header".into()))?;
        return Ok(key.to_string());
    }

    // NOTE: Query parameter API key support removed for security reasons.
    // API keys in URLs are logged in access logs, browser history, and proxies.
    // Use Authorization header (Bearer) or X-API-Key header instead.

    Err(ProxyError::Unauthorized("Missing API key. Use Authorization header or X-API-Key header.".into()))
}

pub async fn validate_api_key(
    state: &ProxyState,
    api_key: &str,
    client_ip: &str,
) -> Result<ApiKey, ProxyError> {
    // Check if IP is locked out due to brute force
    if is_api_key_locked_out(state, client_ip).await {
        let remaining = get_api_key_lockout_remaining(state, client_ip)
            .await
            .unwrap_or(0);
        return Err(ProxyError::Unauthorized(format!(
            "Too many failed attempts. Please try again in {} seconds.",
            remaining
        )));
    }

    // Validate format
    if !ApiKeyService::is_valid_format(api_key) {
        record_api_key_failed_attempt(state, client_ip).await;
        return Err(ProxyError::Unauthorized("Invalid API key format".into()));
    }

    // Hash and lookup
    let key_hash = ApiKeyService::hash_key(api_key);

    let api_key_record = match ApiKeyRepository::find_by_hash(&state.db, &key_hash).await {
        Ok(Some(record)) => record,
        Ok(None) => {
            record_api_key_failed_attempt(state, client_ip).await;
            return Err(ProxyError::Unauthorized("Invalid API key".into()));
        }
        Err(e) => return Err(ProxyError::Internal(e.to_string())),
    };

    // Check expiration
    if api_key_record.is_expired() {
        record_api_key_failed_attempt(state, client_ip).await;
        return Err(ProxyError::Unauthorized("API key expired".into()));
    }

    // Clear failed attempts on success
    clear_api_key_failed_attempts(state, client_ip).await;

    // Update last used (async, don't block)
    let db = state.db.clone();
    let key_id = api_key_record.id;
    tokio::spawn(async move {
        let _ = ApiKeyRepository::update_last_used(&db, key_id).await;
    });

    Ok(api_key_record)
}
