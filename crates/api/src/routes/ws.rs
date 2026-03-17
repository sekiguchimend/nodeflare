use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    response::IntoResponse,
    http::StatusCode,
};
use futures::{SinkExt, StreamExt};
use mcp_common::types::WsMessage;
use mcp_db::{DeploymentRepository, ServerRepository, WorkspaceRepository};
use serde::Deserialize;
use std::sync::Arc;
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::state::AppState;

/// Query parameters for WebSocket authentication
#[derive(Debug, Deserialize)]
pub struct WsAuthQuery {
    pub token: String,
}

/// WebSocket handler for deployment status updates
pub async fn deployment_ws(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
    Path(deployment_id): Path<Uuid>,
    Query(auth): Query<WsAuthQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Verify JWT token
    let claims = state
        .jwt
        .verify_token(&auth.token)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Invalid token".to_string()))?;

    let user_id = claims
        .user_id()
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Invalid token".to_string()))?;

    // Verify deployment exists and user has access
    let deployment = DeploymentRepository::find_by_id(&state.db, deployment_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Deployment not found".to_string()))?;

    let server = ServerRepository::find_by_id(&state.db, deployment.server_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Server not found".to_string()))?;

    // Verify user has access to the workspace
    WorkspaceRepository::get_member(&state.db, server.workspace_id, user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Access denied".to_string()))?;

    // Subscribe to deployment updates
    let channel = format!("deployment:{}", deployment_id);
    let rx = state.ws_manager.subscribe(&channel).await;

    Ok(ws.on_upgrade(move |socket| handle_deployment_socket(socket, rx, deployment_id)))
}

/// WebSocket handler for server logs streaming
pub async fn server_logs_ws(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
    Path((workspace_id, server_id)): Path<(Uuid, Uuid)>,
    Query(auth): Query<WsAuthQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Verify JWT token
    let claims = state
        .jwt
        .verify_token(&auth.token)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Invalid token".to_string()))?;

    let user_id = claims
        .user_id()
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Invalid token".to_string()))?;

    // Verify server exists and belongs to workspace
    let server = ServerRepository::find_by_id(&state.db, server_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Server not found".to_string()))?;

    if server.workspace_id != workspace_id {
        return Err((StatusCode::NOT_FOUND, "Server not found".to_string()));
    }

    // Verify user has access to the workspace
    WorkspaceRepository::get_member(&state.db, workspace_id, user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Access denied".to_string()))?;

    // Subscribe to server logs
    let channel = format!("server:{}:logs", server_id);
    let rx = state.ws_manager.subscribe(&channel).await;

    Ok(ws.on_upgrade(move |socket| handle_logs_socket(socket, rx, server_id)))
}

/// WebSocket handler for build logs streaming
pub async fn build_logs_ws(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
    Path(deployment_id): Path<Uuid>,
    Query(auth): Query<WsAuthQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Verify JWT token
    let claims = state
        .jwt
        .verify_token(&auth.token)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Invalid token".to_string()))?;

    let user_id = claims
        .user_id()
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Invalid token".to_string()))?;

    // Verify deployment exists and user has access
    let deployment = DeploymentRepository::find_by_id(&state.db, deployment_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Deployment not found".to_string()))?;

    let server = ServerRepository::find_by_id(&state.db, deployment.server_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Server not found".to_string()))?;

    // Verify user has access to the workspace
    WorkspaceRepository::get_member(&state.db, server.workspace_id, user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Access denied".to_string()))?;

    // Subscribe to build logs
    let channel = format!("deployment:{}:logs", deployment_id);
    let rx = state.ws_manager.subscribe(&channel).await;

    Ok(ws.on_upgrade(move |socket| handle_build_logs_socket(socket, rx, deployment_id)))
}

/// Handle deployment status WebSocket connection
async fn handle_deployment_socket(
    socket: WebSocket,
    mut rx: broadcast::Receiver<WsMessage>,
    deployment_id: Uuid,
) {
    let (mut sender, mut receiver) = socket.split();

    // Spawn task to send messages from broadcast channel to WebSocket
    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            let json = match serde_json::to_string(&msg) {
                Ok(j) => j,
                Err(e) => {
                    tracing::error!("Failed to serialize WebSocket message: {}", e);
                    continue;
                }
            };

            if sender.send(Message::Text(json)).await.is_err() {
                break;
            }
        }
    });

    // Spawn task to handle incoming messages (ping/pong)
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Ping(_) => {
                    // Pong is handled automatically by axum
                    tracing::debug!("Received ping for deployment {}", deployment_id);
                }
                Message::Close(_) => {
                    break;
                }
                Message::Text(text) => {
                    // Handle client messages (e.g., ping)
                    if let Ok(ws_msg) = serde_json::from_str::<WsMessage>(&text) {
                        match ws_msg {
                            WsMessage::Ping => {
                                tracing::debug!("Received app-level ping for deployment {}", deployment_id);
                            }
                            _ => {}
                        }
                    }
                }
                _ => {}
            }
        }
    });

    // Wait for either task to complete
    tokio::select! {
        _ = &mut send_task => {
            recv_task.abort();
        }
        _ = &mut recv_task => {
            send_task.abort();
        }
    }

    tracing::info!("WebSocket connection closed for deployment {}", deployment_id);
}

/// Handle server logs WebSocket connection
async fn handle_logs_socket(
    socket: WebSocket,
    mut rx: broadcast::Receiver<WsMessage>,
    server_id: Uuid,
) {
    let (mut sender, mut receiver) = socket.split();

    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            let json = match serde_json::to_string(&msg) {
                Ok(j) => j,
                Err(e) => {
                    tracing::error!("Failed to serialize WebSocket message: {}", e);
                    continue;
                }
            };

            if sender.send(Message::Text(json)).await.is_err() {
                break;
            }
        }
    });

    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    tokio::select! {
        _ = &mut send_task => recv_task.abort(),
        _ = &mut recv_task => send_task.abort(),
    }

    tracing::info!("WebSocket connection closed for server logs {}", server_id);
}

/// Handle build logs WebSocket connection
async fn handle_build_logs_socket(
    socket: WebSocket,
    mut rx: broadcast::Receiver<WsMessage>,
    deployment_id: Uuid,
) {
    let (mut sender, mut receiver) = socket.split();

    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            let json = match serde_json::to_string(&msg) {
                Ok(j) => j,
                Err(e) => {
                    tracing::error!("Failed to serialize WebSocket message: {}", e);
                    continue;
                }
            };

            if sender.send(Message::Text(json)).await.is_err() {
                break;
            }
        }
    });

    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    tokio::select! {
        _ = &mut send_task => recv_task.abort(),
        _ = &mut recv_task => send_task.abort(),
    }

    tracing::info!("WebSocket connection closed for build logs {}", deployment_id);
}
