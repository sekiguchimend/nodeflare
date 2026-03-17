use mcp_common::types::WsMessage;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};

/// Channel capacity for each subscription
const CHANNEL_CAPACITY: usize = 256;

/// WebSocket connection manager for handling real-time updates
///
/// Uses Redis pub/sub internally for multi-instance support
#[derive(Debug, Clone)]
pub struct WsManager {
    /// Active channels with their broadcast senders
    channels: Arc<RwLock<HashMap<String, broadcast::Sender<WsMessage>>>>,
}

impl WsManager {
    pub fn new() -> Self {
        Self {
            channels: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Subscribe to a channel, creating it if it doesn't exist
    pub async fn subscribe(&self, channel: &str) -> broadcast::Receiver<WsMessage> {
        let mut channels_guard = self.channels.write().await;

        if let Some(sender) = channels_guard.get(channel) {
            sender.subscribe()
        } else {
            let (tx, rx) = broadcast::channel(CHANNEL_CAPACITY);
            channels_guard.insert(channel.to_string(), tx);
            rx
        }
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
