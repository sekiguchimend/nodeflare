use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use mcp_db::{
    models::{CreateDeployWebhook, DeployWebhook, UpdateDeployWebhook},
    repositories::{DeployWebhookRepository, ServerRepository, WorkspaceRepository},
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::{error::AppError, extractors::AuthUser, state::AppState};

#[derive(Debug, Serialize)]
pub struct WebhookResponse {
    pub id: String,
    pub name: String,
    pub webhook_url: String,
    pub webhook_type: String,
    pub events: Vec<String>,
    pub is_active: bool,
    pub last_triggered_at: Option<String>,
    pub last_status: Option<String>,
    pub created_at: String,
}

impl From<DeployWebhook> for WebhookResponse {
    fn from(w: DeployWebhook) -> Self {
        Self {
            id: w.id.to_string(),
            name: w.name,
            webhook_url: w.webhook_url,
            webhook_type: w.webhook_type,
            events: w.events,
            is_active: w.is_active,
            last_triggered_at: w.last_triggered_at.map(|t| t.to_rfc3339()),
            last_status: w.last_status,
            created_at: w.created_at.to_rfc3339(),
        }
    }
}

/// List webhooks for a server
pub async fn list(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path((workspace_id, server_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<Vec<WebhookResponse>>, AppError> {
    // Verify user has access to workspace
    WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to get workspace member: {}", e);
            AppError::internal("Failed to verify access")
        })?
        .ok_or_else(|| AppError::forbidden("Access denied"))?;

    // Verify server belongs to workspace
    let server = ServerRepository::find_by_id(&state.db, server_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to get server: {}", e);
            AppError::internal("Failed to get server")
        })?
        .ok_or_else(|| AppError::not_found("Server not found"))?;

    if server.workspace_id != workspace_id {
        return Err(AppError::not_found("Server not found"));
    }

    let webhooks = DeployWebhookRepository::list_by_server(&state.db, server_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to list webhooks: {}", e);
            AppError::internal("Failed to list webhooks")
        })?;

    Ok(Json(webhooks.into_iter().map(WebhookResponse::from).collect()))
}

#[derive(Debug, Deserialize)]
pub struct CreateWebhookRequest {
    pub name: String,
    pub webhook_url: String,
    pub webhook_type: String,
    pub events: Vec<String>,
    pub secret: Option<String>,
}

/// Create a new webhook
pub async fn create(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path((workspace_id, server_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<CreateWebhookRequest>,
) -> Result<Json<WebhookResponse>, AppError> {
    // Verify user has access to workspace (admin or owner)
    let member = WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to get workspace member: {}", e);
            AppError::internal("Failed to verify access")
        })?
        .ok_or_else(|| AppError::forbidden("Access denied"))?;

    if !matches!(member.role(), mcp_common::types::WorkspaceRole::Owner | mcp_common::types::WorkspaceRole::Admin) {
        return Err(AppError::forbidden("Only owners and admins can manage webhooks"));
    }

    // Verify server belongs to workspace
    let server = ServerRepository::find_by_id(&state.db, server_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to get server: {}", e);
            AppError::internal("Failed to get server")
        })?
        .ok_or_else(|| AppError::not_found("Server not found"))?;

    if server.workspace_id != workspace_id {
        return Err(AppError::not_found("Server not found"));
    }

    // Validate webhook URL
    if !body.webhook_url.starts_with("https://") {
        return Err(AppError::bad_request("INVALID_URL", "Webhook URL must use HTTPS"));
    }

    // Validate events
    let valid_events = ["deploy_success", "deploy_failure", "deploy_started"];
    for event in &body.events {
        if !valid_events.contains(&event.as_str()) {
            return Err(AppError::bad_request("INVALID_EVENT", &format!("Invalid event: {}", event)));
        }
    }

    let webhook = DeployWebhookRepository::create(
        &state.db,
        CreateDeployWebhook {
            server_id,
            name: body.name,
            webhook_url: body.webhook_url,
            webhook_type: body.webhook_type,
            events: body.events,
            secret: body.secret,
        },
    )
    .await
    .map_err(|e| {
        tracing::error!("Failed to create webhook: {}", e);
        AppError::internal("Failed to create webhook")
    })?;

    Ok(Json(WebhookResponse::from(webhook)))
}

#[derive(Debug, Deserialize)]
pub struct UpdateWebhookRequest {
    pub name: Option<String>,
    pub webhook_url: Option<String>,
    pub events: Option<Vec<String>>,
    pub secret: Option<String>,
    pub is_active: Option<bool>,
}

/// Update a webhook
pub async fn update(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path((workspace_id, server_id, webhook_id)): Path<(Uuid, Uuid, Uuid)>,
    Json(body): Json<UpdateWebhookRequest>,
) -> Result<Json<WebhookResponse>, AppError> {
    // Verify user has access to workspace (admin or owner)
    let member = WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to get workspace member: {}", e);
            AppError::internal("Failed to verify access")
        })?
        .ok_or_else(|| AppError::forbidden("Access denied"))?;

    if !matches!(member.role(), mcp_common::types::WorkspaceRole::Owner | mcp_common::types::WorkspaceRole::Admin) {
        return Err(AppError::forbidden("Only owners and admins can manage webhooks"));
    }

    // Verify webhook exists and belongs to the server
    let existing = DeployWebhookRepository::find_by_id(&state.db, webhook_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to get webhook: {}", e);
            AppError::internal("Failed to get webhook")
        })?
        .ok_or_else(|| AppError::not_found("Webhook not found"))?;

    if existing.server_id != server_id {
        return Err(AppError::not_found("Webhook not found"));
    }

    // Validate webhook URL if provided
    if let Some(ref url) = body.webhook_url {
        if !url.starts_with("https://") {
            return Err(AppError::bad_request("INVALID_URL", "Webhook URL must use HTTPS"));
        }
    }

    // Validate events if provided
    if let Some(ref events) = body.events {
        let valid_events = ["deploy_success", "deploy_failure", "deploy_started"];
        for event in events {
            if !valid_events.contains(&event.as_str()) {
                return Err(AppError::bad_request("INVALID_EVENT", &format!("Invalid event: {}", event)));
            }
        }
    }

    let webhook = DeployWebhookRepository::update(
        &state.db,
        webhook_id,
        UpdateDeployWebhook {
            name: body.name,
            webhook_url: body.webhook_url,
            events: body.events,
            secret: body.secret,
            is_active: body.is_active,
        },
    )
    .await
    .map_err(|e| {
        tracing::error!("Failed to update webhook: {}", e);
        AppError::internal("Failed to update webhook")
    })?
    .ok_or_else(|| AppError::not_found("Webhook not found"))?;

    Ok(Json(WebhookResponse::from(webhook)))
}

/// Delete a webhook
pub async fn delete(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path((workspace_id, server_id, webhook_id)): Path<(Uuid, Uuid, Uuid)>,
) -> Result<StatusCode, AppError> {
    // Verify user has access to workspace (admin or owner)
    let member = WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to get workspace member: {}", e);
            AppError::internal("Failed to verify access")
        })?
        .ok_or_else(|| AppError::forbidden("Access denied"))?;

    if !matches!(member.role(), mcp_common::types::WorkspaceRole::Owner | mcp_common::types::WorkspaceRole::Admin) {
        return Err(AppError::forbidden("Only owners and admins can manage webhooks"));
    }

    // Verify webhook exists and belongs to the server
    let existing = DeployWebhookRepository::find_by_id(&state.db, webhook_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to get webhook: {}", e);
            AppError::internal("Failed to get webhook")
        })?
        .ok_or_else(|| AppError::not_found("Webhook not found"))?;

    if existing.server_id != server_id {
        return Err(AppError::not_found("Webhook not found"));
    }

    DeployWebhookRepository::delete(&state.db, webhook_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to delete webhook: {}", e);
            AppError::internal("Failed to delete webhook")
        })?;

    Ok(StatusCode::NO_CONTENT)
}

#[derive(Debug, Deserialize)]
pub struct TestWebhookRequest {
    pub webhook_id: Uuid,
}

/// Test a webhook by sending a test payload
pub async fn test(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path((workspace_id, server_id, webhook_id)): Path<(Uuid, Uuid, Uuid)>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Verify user has access to workspace
    WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to get workspace member: {}", e);
            AppError::internal("Failed to verify access")
        })?
        .ok_or_else(|| AppError::forbidden("Access denied"))?;

    // Get webhook
    let webhook = DeployWebhookRepository::find_by_id(&state.db, webhook_id)
        .await
        .map_err(|e| {
            tracing::error!("Failed to get webhook: {}", e);
            AppError::internal("Failed to get webhook")
        })?
        .ok_or_else(|| AppError::not_found("Webhook not found"))?;

    if webhook.server_id != server_id {
        return Err(AppError::not_found("Webhook not found"));
    }

    // Send test payload
    let test_payload = serde_json::json!({
        "event": "test",
        "server_id": server_id.to_string(),
        "webhook_id": webhook_id.to_string(),
        "message": "This is a test webhook notification from NodeFlare",
        "timestamp": chrono::Utc::now().to_rfc3339(),
    });

    let client = reqwest::Client::new();
    let response = client
        .post(&webhook.webhook_url)
        .json(&test_payload)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await;

    match response {
        Ok(res) => {
            let status = res.status();
            DeployWebhookRepository::update_trigger_status(
                &state.db,
                webhook_id,
                if status.is_success() { "success" } else { "failure" },
            )
            .await
            .ok();

            Ok(Json(serde_json::json!({
                "success": status.is_success(),
                "status_code": status.as_u16(),
            })))
        }
        Err(e) => {
            DeployWebhookRepository::update_trigger_status(&state.db, webhook_id, "failure")
                .await
                .ok();

            Ok(Json(serde_json::json!({
                "success": false,
                "error": e.to_string(),
            })))
        }
    }
}
