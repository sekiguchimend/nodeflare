//! Redis-based caching for frequently accessed data
//!
//! Provides caching layer to reduce database queries for:
//! - Workspace plan information (used in limit checks)
//! - Member counts (used in member limit checks)

use fred::prelude::*;
use mcp_billing::Plan;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Cache TTL for workspace info (5 minutes)
const WORKSPACE_INFO_TTL_SECS: i64 = 300;

/// Cached workspace info for plan limit checks
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedWorkspaceInfo {
    pub name: String,
    pub plan: String,
    pub member_count: i32,
}

impl CachedWorkspaceInfo {
    pub fn billing_plan(&self) -> Plan {
        match self.plan.as_str() {
            "pro" => Plan::Pro,
            "team" => Plan::Team,
            "enterprise" => Plan::Enterprise,
            _ => Plan::Free,
        }
    }
}

/// API cache service for frequently accessed data
#[derive(Clone)]
pub struct ApiCache {
    client: RedisClient,
}

impl ApiCache {
    pub fn new(client: RedisClient) -> Self {
        Self { client }
    }

    /// Cache key for workspace info
    fn workspace_info_key(workspace_id: Uuid) -> String {
        format!("api:workspace:{}:info", workspace_id)
    }

    /// Get cached workspace info
    pub async fn get_workspace_info(&self, workspace_id: Uuid) -> Option<CachedWorkspaceInfo> {
        let cache_key = Self::workspace_info_key(workspace_id);

        let result: Option<String> = self.client.get(&cache_key).await.ok()?;

        result.and_then(|json| serde_json::from_str(&json).ok())
    }

    /// Cache workspace info
    pub async fn set_workspace_info(&self, workspace_id: Uuid, info: &CachedWorkspaceInfo) {
        let cache_key = Self::workspace_info_key(workspace_id);

        if let Ok(json) = serde_json::to_string(info) {
            let _: Result<(), _> = self
                .client
                .set(
                    &cache_key,
                    json,
                    Some(Expiration::EX(WORKSPACE_INFO_TTL_SECS)),
                    None,
                    false,
                )
                .await;
        }
    }

    /// Invalidate cached workspace info (call when workspace is updated)
    pub async fn invalidate_workspace_info(&self, workspace_id: Uuid) {
        let cache_key = Self::workspace_info_key(workspace_id);
        let _: Result<(), _> = self.client.del(&cache_key).await;
    }

    /// Update member count in cache (increment/decrement without full refresh)
    pub async fn update_member_count(&self, workspace_id: Uuid, delta: i32) {
        if let Some(mut info) = self.get_workspace_info(workspace_id).await {
            info.member_count = (info.member_count + delta).max(0);
            self.set_workspace_info(workspace_id, &info).await;
        }
    }
}
