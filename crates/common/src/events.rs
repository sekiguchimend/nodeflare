use crate::types::{
    BuildLogLine, DeploymentStatus, DeploymentStatusUpdate, LogLevel, LogStream,
    ServerLogLine, WsMessage,
};
use chrono::Utc;
use uuid::Uuid;

/// Channel prefix for deployment status updates
pub const DEPLOYMENT_STATUS_CHANNEL: &str = "ws:deployment:";

/// Channel prefix for build logs
pub const BUILD_LOG_CHANNEL: &str = "ws:deployment:logs:";

/// Channel prefix for server logs
pub const SERVER_LOG_CHANNEL: &str = "ws:server:logs:";

/// Event publisher for sending real-time updates via Redis pub/sub
#[derive(Clone)]
pub struct EventPublisher {
    redis_url: String,
}

impl EventPublisher {
    pub fn new(redis_url: &str) -> Self {
        Self {
            redis_url: redis_url.to_string(),
        }
    }

    /// Publish a deployment status update
    pub async fn publish_deployment_status(
        &self,
        deployment_id: Uuid,
        server_id: Uuid,
        status: DeploymentStatus,
        error_message: Option<String>,
        progress: Option<u8>,
    ) -> Result<(), PublishError> {
        let message = WsMessage::DeploymentStatus(DeploymentStatusUpdate {
            deployment_id,
            server_id,
            status,
            error_message,
            progress,
            timestamp: Utc::now(),
        });

        let channel = format!("{}{}", DEPLOYMENT_STATUS_CHANNEL, deployment_id);
        self.publish(&channel, &message).await
    }

    /// Publish a build log line
    pub async fn publish_build_log(
        &self,
        deployment_id: Uuid,
        line: &str,
        stream: LogStream,
    ) -> Result<(), PublishError> {
        let message = WsMessage::BuildLog(BuildLogLine {
            deployment_id,
            line: line.to_string(),
            stream,
            timestamp: Utc::now(),
        });

        let channel = format!("{}{}", BUILD_LOG_CHANNEL, deployment_id);
        self.publish(&channel, &message).await
    }

    /// Publish a server log line
    pub async fn publish_server_log(
        &self,
        server_id: Uuid,
        line: &str,
        level: LogLevel,
    ) -> Result<(), PublishError> {
        let message = WsMessage::ServerLog(ServerLogLine {
            server_id,
            line: line.to_string(),
            level,
            timestamp: Utc::now(),
        });

        let channel = format!("{}{}", SERVER_LOG_CHANNEL, server_id);
        self.publish(&channel, &message).await
    }

    async fn publish(&self, channel: &str, message: &WsMessage) -> Result<(), PublishError> {
        let client = redis::Client::open(self.redis_url.as_str())
            .map_err(|e| PublishError::ConnectionError(e.to_string()))?;

        let mut conn = client
            .get_multiplexed_async_connection()
            .await
            .map_err(|e| PublishError::ConnectionError(e.to_string()))?;

        let json = serde_json::to_string(message)
            .map_err(|e| PublishError::SerializationError(e.to_string()))?;

        redis::cmd("PUBLISH")
            .arg(channel)
            .arg(json)
            .query_async::<i32>(&mut conn)
            .await
            .map_err(|e| PublishError::PublishError(e.to_string()))?;

        Ok(())
    }
}

#[derive(Debug, thiserror::Error)]
pub enum PublishError {
    #[error("Connection error: {0}")]
    ConnectionError(String),
    #[error("Serialization error: {0}")]
    SerializationError(String),
    #[error("Publish error: {0}")]
    PublishError(String),
}
