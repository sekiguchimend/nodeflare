use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ApiKey {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub server_id: Option<Uuid>,
    pub name: String,
    pub key_prefix: String,
    pub key_hash: String,
    pub scopes: serde_json::Value,
    pub last_used_at: Option<DateTime<Utc>>,
    pub expires_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

impl ApiKey {
    pub fn scopes(&self) -> Vec<String> {
        serde_json::from_value(self.scopes.clone()).unwrap_or_default()
    }

    pub fn has_scope(&self, scope: &str) -> bool {
        let scopes = self.scopes();
        scopes.contains(&scope.to_string()) || scopes.contains(&"*".to_string())
    }

    pub fn is_expired(&self) -> bool {
        if let Some(expires_at) = self.expires_at {
            expires_at < Utc::now()
        } else {
            false
        }
    }
}

#[derive(Debug, Clone)]
pub struct CreateApiKey {
    pub workspace_id: Uuid,
    pub server_id: Option<Uuid>,
    pub name: String,
    pub key_prefix: String,
    pub key_hash: String,
    pub scopes: Vec<String>,
    pub expires_at: Option<DateTime<Utc>>,
}
