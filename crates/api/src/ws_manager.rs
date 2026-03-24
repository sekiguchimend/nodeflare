use mcp_common::types::WsMessage;
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{broadcast, RwLock};

/// Default channel capacity for each subscription (configurable via WS_CHANNEL_CAPACITY env var)
fn default_channel_capacity() -> usize {
    std::env::var("WS_CHANNEL_CAPACITY")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(256)
}

/// Maximum connections per channel (configurable via WS_MAX_CONNECTIONS_PER_CHANNEL env var)
fn max_connections_per_channel() -> usize {
    std::env::var("WS_MAX_CONNECTIONS_PER_CHANNEL")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(1000)
}

/// Cleanup interval in seconds (configurable via WS_CLEANUP_INTERVAL_SECS env var)
fn cleanup_interval_secs() -> u64 {
    std::env::var("WS_CLEANUP_INTERVAL_SECS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(60)
}

/// Maximum total connections across all channels (configurable via WS_MAX_TOTAL_CONNECTIONS env var)
fn max_total_connections() -> usize {
    std::env::var("WS_MAX_TOTAL_CONNECTIONS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(10000)
}

/// WebSocket connection manager for handling real-time updates
///
/// Uses Redis pub/sub internally for multi-instance support
#[derive(Debug, Clone)]
pub struct WsManager {
    /// Active channels with their broadcast senders
    channels: Arc<RwLock<HashMap<String, broadcast::Sender<WsMessage>>>>,
    /// Total connection count across all channels
    total_connections: Arc<AtomicUsize>,
    /// Channel capacity setting
    channel_capacity: usize,
    /// Max connections per channel
    max_per_channel: usize,
    /// Max total connections across all channels
    max_total: usize,
}

impl WsManager {
    pub fn new() -> Self {
        Self {
            channels: Arc::new(RwLock::new(HashMap::new())),
            total_connections: Arc::new(AtomicUsize::new(0)),
            channel_capacity: default_channel_capacity(),
            max_per_channel: max_connections_per_channel(),
            max_total: max_total_connections(),
        }
    }

    /// Start background cleanup task
    pub fn start_cleanup_task(self: Arc<Self>) {
        let interval = Duration::from_secs(cleanup_interval_secs());
        tokio::spawn(async move {
            let mut interval_timer = tokio::time::interval(interval);
            loop {
                interval_timer.tick().await;
                self.cleanup_empty_channels().await;
                tracing::debug!(
                    "WsManager cleanup: {} channels, {} total connections",
                    self.channel_count().await,
                    self.total_connections.load(Ordering::Relaxed)
                );
            }
        });
    }

    /// Subscribe to a channel, creating it if it doesn't exist
    /// Returns error if channel or global connection limit is reached
    pub async fn subscribe(&self, channel: &str) -> Result<broadcast::Receiver<WsMessage>, SubscribeError> {
        // Check global connection limit first
        let current_total = self.total_connections.load(Ordering::Relaxed);
        if current_total >= self.max_total {
            return Err(SubscribeError::GlobalLimitReached);
        }

        let mut channels_guard = self.channels.write().await;

        if let Some(sender) = channels_guard.get(channel) {
            // Check connection limit per channel
            if sender.receiver_count() >= self.max_per_channel {
                return Err(SubscribeError::ChannelFull);
            }
            self.total_connections.fetch_add(1, Ordering::Relaxed);
            Ok(sender.subscribe())
        } else {
            let (tx, rx) = broadcast::channel(self.channel_capacity);
            channels_guard.insert(channel.to_string(), tx);
            self.total_connections.fetch_add(1, Ordering::Relaxed);
            Ok(rx)
        }
    }

    /// Decrement connection count when a subscriber disconnects
    pub fn on_disconnect(&self) {
        self.total_connections.fetch_sub(1, Ordering::Relaxed);
    }

    /// Get total connection count
    pub fn total_connection_count(&self) -> usize {
        self.total_connections.load(Ordering::Relaxed)
    }

    /// Broadcast a message to all subscribers of a channel
    pub async fn broadcast(&self, channel: &str, message: WsMessage) -> Result<usize, BroadcastError> {
        let channels_guard = self.channels.read().await;

        if let Some(sender) = channels_guard.get(channel) {
            match sender.send(message) {
                Ok(count) => Ok(count),
                Err(_) => Err(BroadcastError::NoSubscribers),
            }
        } else {
            Err(BroadcastError::ChannelNotFound)
        }
    }

    /// Broadcast a deployment status update
    pub async fn broadcast_deployment_status(
        &self,
        deployment_id: uuid::Uuid,
        message: WsMessage,
    ) {
        let channel = format!("deployment:{}", deployment_id);
        if let Err(e) = self.broadcast(&channel, message).await {
            tracing::debug!("Failed to broadcast deployment status: {:?}", e);
        }
    }

    /// Broadcast a build log line
    pub async fn broadcast_build_log(
        &self,
        deployment_id: uuid::Uuid,
        message: WsMessage,
    ) {
        let channel = format!("deployment:{}:logs", deployment_id);
        if let Err(e) = self.broadcast(&channel, message).await {
            tracing::debug!("Failed to broadcast build log: {:?}", e);
        }
    }

    /// Broadcast a server log line
    pub async fn broadcast_server_log(
        &self,
        server_id: uuid::Uuid,
        message: WsMessage,
    ) {
        let channel = format!("server:{}:logs", server_id);
        if let Err(e) = self.broadcast(&channel, message).await {
            tracing::debug!("Failed to broadcast server log: {:?}", e);
        }
    }

    /// Clean up empty channels (channels with no subscribers)
    pub async fn cleanup_empty_channels(&self) {
        let mut channels_guard = self.channels.write().await;
        channels_guard.retain(|_, sender| sender.receiver_count() > 0);
    }

    /// Get the number of active channels
    pub async fn channel_count(&self) -> usize {
        self.channels.read().await.len()
    }

    /// Get the number of subscribers for a specific channel
    pub async fn subscriber_count(&self, channel: &str) -> usize {
        let channels_guard = self.channels.read().await;
        channels_guard
            .get(channel)
            .map(|sender| sender.receiver_count())
            .unwrap_or(0)
    }
}

impl Default for WsManager {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, thiserror::Error)]
pub enum BroadcastError {
    #[error("Channel not found")]
    ChannelNotFound,
    #[error("No subscribers")]
    NoSubscribers,
}

#[derive(Debug, thiserror::Error)]
pub enum SubscribeError {
    #[error("Channel has reached maximum connections")]
    ChannelFull,
    #[error("Global connection limit reached")]
    GlobalLimitReached,
}
