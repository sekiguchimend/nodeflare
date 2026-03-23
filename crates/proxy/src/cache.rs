use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{Mutex, RwLock};
use tokio::sync::broadcast;

/// Cache entry with TTL
struct CacheEntry {
    response_body: Vec<u8>,
    status: u16,
    headers: Vec<(String, String)>,
    created_at: Instant,
}

/// In-flight request tracker for coalescing
struct InFlightRequest {
    tx: broadcast::Sender<Arc<CacheEntry>>,
}

/// Request Coalescing + Caching layer
///
/// This provides two optimizations:
/// 1. Request Coalescing (singleflight): If multiple identical requests come in
///    while one is being processed, they all wait for and share the same result
/// 2. TTL Cache: Results are cached for a configurable duration
pub struct RequestCache {
    /// Cached responses with TTL
    cache: RwLock<HashMap<u64, CacheEntry>>,
    /// Currently in-flight requests (for coalescing)
    in_flight: Mutex<HashMap<u64, InFlightRequest>>,
    /// Cache TTL
    ttl: Duration,
    /// Maximum cache entries
    max_entries: usize,
}

impl RequestCache {
    pub fn new(ttl_secs: u64, max_entries: usize) -> Self {
        Self {
            cache: RwLock::new(HashMap::new()),
            in_flight: Mutex::new(HashMap::new()),
            ttl: Duration::from_secs(ttl_secs),
            max_entries,
        }
    }

    /// Generate cache key from server endpoint + request body
    fn cache_key(endpoint: &str, body: &[u8]) -> u64 {
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        endpoint.hash(&mut hasher);
        body.hash(&mut hasher);
        hasher.finish()
    }

    /// Try to get cached response
    pub async fn get(&self, endpoint: &str, body: &[u8]) -> Option<CachedResponse> {
        let key = Self::cache_key(endpoint, body);
        let cache = self.cache.read().await;

        if let Some(entry) = cache.get(&key) {
            // Check if still valid
            if entry.created_at.elapsed() < self.ttl {
                return Some(CachedResponse {
                    body: entry.response_body.clone(),
                    status: entry.status,
                    headers: entry.headers.clone(),
                });
            }
        }
        None
    }

    /// Execute request with coalescing
    ///
    /// Returns:
    /// - Ok(Some(response)) if we got a cached/coalesced result
    /// - Ok(None) if caller should execute the request (and then call `complete`)
    pub async fn try_coalesce(&self, endpoint: &str, body: &[u8]) -> CoalesceResult {
        let key = Self::cache_key(endpoint, body);

        // First check cache
        {
            let cache = self.cache.read().await;
            if let Some(entry) = cache.get(&key) {
                if entry.created_at.elapsed() < self.ttl {
                    tracing::debug!("Cache hit for request");
                    return CoalesceResult::Cached(CachedResponse {
                        body: entry.response_body.clone(),
                        status: entry.status,
                        headers: entry.headers.clone(),
                    });
                }
            }
        }

        // Check if request is in-flight
        let mut in_flight = self.in_flight.lock().await;

        if let Some(existing) = in_flight.get(&key) {
            // Another request is in progress, subscribe to its result
            let mut rx = existing.tx.subscribe();
            drop(in_flight); // Release lock while waiting

            tracing::debug!("Coalescing request - waiting for in-flight result");

            match rx.recv().await {
                Ok(entry) => {
                    return CoalesceResult::Coalesced(CachedResponse {
                        body: entry.response_body.clone(),
                        status: entry.status,
                        headers: entry.headers.clone(),
                    });
                }
                Err(_) => {
                    // Sender dropped without sending, caller should retry
                    return CoalesceResult::Execute(RequestHandle { key });
                }
            }
        }

        // No cache, no in-flight - this request will execute
        let (tx, _) = broadcast::channel(1);
        in_flight.insert(key, InFlightRequest { tx });

        tracing::debug!("No cache/in-flight - executing request");
        CoalesceResult::Execute(RequestHandle { key })
    }

    /// Complete a request and cache the result
    pub async fn complete(
        &self,
        handle: RequestHandle,
        response_body: Vec<u8>,
        status: u16,
        headers: Vec<(String, String)>,
    ) {
        let entry = Arc::new(CacheEntry {
            response_body,
            status,
            headers,
            created_at: Instant::now(),
        });

        // Notify waiting requests
        {
            let mut in_flight = self.in_flight.lock().await;
            if let Some(req) = in_flight.remove(&handle.key) {
                // Ignore send errors (no receivers)
                let _ = req.tx.send(entry.clone());
            }
        }

        // Store in cache
        {
            let mut cache = self.cache.write().await;

            // Evict old entries if at capacity
            if cache.len() >= self.max_entries {
                self.evict_expired(&mut cache).await;

                // If still at capacity, remove oldest
                if cache.len() >= self.max_entries {
                    if let Some(oldest_key) = cache
                        .iter()
                        .min_by_key(|(_, v)| v.created_at)
                        .map(|(k, _)| *k)
                    {
                        cache.remove(&oldest_key);
                    }
                }
            }

            cache.insert(handle.key, CacheEntry {
                response_body: entry.response_body.clone(),
                status: entry.status,
                headers: entry.headers.clone(),
                created_at: entry.created_at,
            });
        }
    }

    /// Cancel an in-flight request (on error)
    pub async fn cancel(&self, handle: RequestHandle) {
        let mut in_flight = self.in_flight.lock().await;
        in_flight.remove(&handle.key);
        // Dropping the sender will cause receivers to get an error
    }

    /// Remove expired entries
    async fn evict_expired(&self, cache: &mut HashMap<u64, CacheEntry>) {
        cache.retain(|_, entry| entry.created_at.elapsed() < self.ttl);
    }

    /// Get cache statistics
    pub async fn stats(&self) -> CacheStats {
        let cache = self.cache.read().await;
        let in_flight = self.in_flight.lock().await;

        CacheStats {
            cached_entries: cache.len(),
            in_flight_requests: in_flight.len(),
        }
    }
}

/// Handle returned when a request should be executed
pub struct RequestHandle {
    key: u64,
}

/// Result of trying to coalesce a request
pub enum CoalesceResult {
    /// Found in cache
    Cached(CachedResponse),
    /// Another identical request is in-flight, we waited and got the result
    Coalesced(CachedResponse),
    /// No cache/in-flight, caller should execute and then call `complete`
    Execute(RequestHandle),
}

/// Cached response data
#[derive(Clone)]
pub struct CachedResponse {
    pub body: Vec<u8>,
    pub status: u16,
    pub headers: Vec<(String, String)>,
}

/// Cache statistics
pub struct CacheStats {
    pub cached_entries: usize,
    pub in_flight_requests: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_cache_hit() {
        let cache = RequestCache::new(60, 100);
        let endpoint = "http://example.com/api";
        let body = b"test body";

        // First request - should execute
        let result = cache.try_coalesce(endpoint, body).await;
        let handle = match result {
            CoalesceResult::Execute(h) => h,
            _ => panic!("Expected Execute"),
        };

        // Complete the request
        cache.complete(handle, b"response".to_vec(), 200, vec![]).await;

        // Second request - should be cached
        let result = cache.try_coalesce(endpoint, body).await;
        match result {
            CoalesceResult::Cached(resp) => {
                assert_eq!(resp.body, b"response");
                assert_eq!(resp.status, 200);
            }
            _ => panic!("Expected Cached"),
        }
    }

    #[tokio::test]
    async fn test_coalescing() {
        let cache = Arc::new(RequestCache::new(60, 100));
        let endpoint = "http://example.com/api";
        let body = b"test body";

        // Start first request
        let cache1 = cache.clone();
        let result1 = cache1.try_coalesce(endpoint, body).await;
        let handle = match result1 {
            CoalesceResult::Execute(h) => h,
            _ => panic!("Expected Execute for first request"),
        };

        // Start second request concurrently - should coalesce
        let cache2 = cache.clone();
        let endpoint2 = endpoint.to_string();
        let body2 = body.to_vec();
        let join_handle = tokio::spawn(async move {
            cache2.try_coalesce(&endpoint2, &body2).await
        });

        // Small delay to ensure second request is waiting
        tokio::time::sleep(Duration::from_millis(10)).await;

        // Complete first request
        cache.complete(handle, b"shared response".to_vec(), 200, vec![]).await;

        // Second request should get coalesced result
        let result2 = join_handle.await.unwrap();
        match result2 {
            CoalesceResult::Coalesced(resp) => {
                assert_eq!(resp.body, b"shared response");
            }
            _ => panic!("Expected Coalesced for second request"),
        }
    }
}
