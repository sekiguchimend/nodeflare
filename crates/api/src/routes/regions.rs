use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use mcp_common::types::WorkspaceRole;
use mcp_db::{
    CreateServerRegion, RegionStatus, ServerRegionRepository, ServerRepository,
    WorkspaceRepository,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::extractors::AuthUser;
use crate::state::AppState;

/// Response for adding a region
#[derive(Debug, Serialize)]
#[serde(tag = "type")]
pub enum AddRegionResponse {
    /// Region added successfully (existing subscription updated)
    #[serde(rename = "added")]
    Added { region: RegionResponse },
    /// Checkout required (first region, needs subscription)
    #[serde(rename = "checkout_required")]
    CheckoutRequired { checkout_url: String },
}

/// Region info for responses
#[derive(Debug, Serialize)]
pub struct RegionResponse {
    pub region: String,
    pub is_primary: bool,
    pub status: String,
    pub endpoint_url: Option<String>,
    pub machine_id: Option<String>,
}

/// List all regions for a server
pub async fn list(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path((workspace_id, server_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<Vec<RegionResponse>>, (StatusCode, String)> {
    // Verify membership
    WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Not a member".to_string()))?;

    // Verify server belongs to workspace
    let server = ServerRepository::find_by_id(&state.db, server_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Server not found".to_string()))?;

    if server.workspace_id != workspace_id {
        return Err((StatusCode::NOT_FOUND, "Server not found".to_string()));
    }

    let regions = ServerRegionRepository::list_by_server(&state.db, server_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let response: Vec<RegionResponse> = regions
        .into_iter()
        .map(|r| RegionResponse {
            region: r.region,
            is_primary: r.is_primary,
            status: r.status,
            endpoint_url: r.endpoint_url,
            machine_id: r.machine_id,
        })
        .collect();

    Ok(Json(response))
}

#[derive(Debug, Deserialize)]
pub struct AddRegionRequest {
    pub region: String,
}

/// Add a new region to a server (triggers deployment to that region)
/// This always requires Stripe Checkout confirmation before adding
pub async fn add(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path((workspace_id, server_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<AddRegionRequest>,
) -> Result<Json<AddRegionResponse>, (StatusCode, String)> {
    // Verify membership and permission
    let member = WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Not a member".to_string()))?;

    if matches!(member.role(), WorkspaceRole::Viewer) {
        return Err((
            StatusCode::FORBIDDEN,
            "Insufficient permissions".to_string(),
        ));
    }

    // Validate region code
    let valid_regions = [
        "nrt", "sin", "hkg", "syd", "iad", "sjc", "lax", "sea", "ams", "fra", "lhr",
    ];
    if !valid_regions.contains(&body.region.as_str()) {
        return Err((StatusCode::BAD_REQUEST, "Invalid region code".to_string()));
    }

    // Get workspace for billing info
    let workspace = WorkspaceRepository::find_by_id(&state.db, workspace_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Workspace not found".to_string()))?;

    // Verify server belongs to workspace
    let server = ServerRepository::find_by_id(&state.db, server_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Server not found".to_string()))?;

    if server.workspace_id != workspace_id {
        return Err((StatusCode::NOT_FOUND, "Server not found".to_string()));
    }

    // Check if region already exists
    let existing =
        ServerRegionRepository::find_by_server_and_region(&state.db, server_id, &body.region)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if existing.is_some() {
        return Err((
            StatusCode::CONFLICT,
            "Region already exists for this server".to_string(),
        ));
    }

    let billing = state.billing.as_ref()
        .ok_or((StatusCode::SERVICE_UNAVAILABLE, "Billing service not configured".to_string()))?;

    let customer_id = workspace.stripe_customer_id.as_ref()
        .ok_or((StatusCode::BAD_REQUEST, "No billing account. Please set up billing first.".to_string()))?;

    // Check if workspace already has a region subscription
    // If yes, just increment quantity and add region directly
    // If no, redirect to checkout for first-time subscription
    if let Some(region_subscription_item_id) = &workspace.stripe_region_subscription_item_id {
        // Existing subscription - increment quantity and add region directly
        billing
            .add_region_billing(
                "", // subscription_id not needed when we have item_id
                Some(region_subscription_item_id),
            )
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Billing error: {}", e)))?;

        // Create the region record
        let region = ServerRegionRepository::create(
            &state.db,
            CreateServerRegion {
                server_id,
                region: body.region.clone(),
                is_primary: false,
            },
        )
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        tracing::info!(
            "Added region {} to server {} (workspace {}) - subscription quantity incremented",
            body.region,
            server_id,
            workspace_id
        );

        Ok(Json(AddRegionResponse::Added {
            region: RegionResponse {
                region: region.region,
                is_primary: region.is_primary,
                status: region.status,
                endpoint_url: region.endpoint_url,
                machine_id: region.machine_id,
            },
        }))
    } else {
        // No existing region subscription - redirect to checkout
        let session = billing
            .create_region_checkout_session_with_metadata(
                customer_id,
                workspace_id,
                server_id,
                &body.region,
            )
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Billing error: {}", e)))?;

        let checkout_url = session.url
            .ok_or((StatusCode::INTERNAL_SERVER_ERROR, "No checkout URL returned".to_string()))?;

        tracing::info!(
            "Created region checkout session for workspace {} server {} region {} (first region)",
            workspace_id,
            server_id,
            body.region
        );

        Ok(Json(AddRegionResponse::CheckoutRequired { checkout_url }))
    }
}

/// Remove a region from a server
/// This also handles Stripe billing - decrements or removes the region subscription item
pub async fn remove(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path((workspace_id, server_id, region_code)): Path<(Uuid, Uuid, String)>,
) -> Result<StatusCode, (StatusCode, String)> {
    // Verify membership and permission
    let member = WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Not a member".to_string()))?;

    if matches!(member.role(), WorkspaceRole::Viewer) {
        return Err((
            StatusCode::FORBIDDEN,
            "Insufficient permissions".to_string(),
        ));
    }

    // Get workspace for billing info
    let workspace = WorkspaceRepository::find_by_id(&state.db, workspace_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Workspace not found".to_string()))?;

    // Verify server belongs to workspace
    let server = ServerRepository::find_by_id(&state.db, server_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Server not found".to_string()))?;

    if server.workspace_id != workspace_id {
        return Err((StatusCode::NOT_FOUND, "Server not found".to_string()));
    }

    // Check if trying to delete primary region
    let region =
        ServerRegionRepository::find_by_server_and_region(&state.db, server_id, &region_code)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
            .ok_or((StatusCode::NOT_FOUND, "Region not found".to_string()))?;

    if region.is_primary {
        return Err((
            StatusCode::BAD_REQUEST,
            "Cannot delete primary region".to_string(),
        ));
    }

    // Handle Stripe billing - decrement region count
    if let Some(billing) = state.billing.as_ref() {
        if let Some(region_item_id) = &workspace.stripe_region_subscription_item_id {
            let updated_item_id = billing
                .remove_region_billing(region_item_id)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Billing error: {}", e)))?;

            // If subscription item was deleted, clear it from workspace
            if updated_item_id.is_none() {
                WorkspaceRepository::update_region_subscription_item(&state.db, workspace_id, None)
                    .await
                    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

                tracing::info!(
                    "Removed region subscription item from workspace {} (no more additional regions)",
                    workspace_id
                );
            }
        }
    }

    // TODO: Stop and delete the machine in Fly.io before removing from DB

    // Delete the region record
    let deleted = ServerRegionRepository::delete(&state.db, server_id, &region_code)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if !deleted {
        return Err((StatusCode::NOT_FOUND, "Region not found".to_string()));
    }

    tracing::info!(
        "Removed region {} from server {} (workspace {})",
        region_code,
        server_id,
        workspace_id
    );

    Ok(StatusCode::NO_CONTENT)
}

/// Get estimated monthly cost for additional regions
#[derive(Debug, Serialize)]
pub struct RegionCostEstimate {
    pub additional_regions: i64,
    pub price_per_region_jpy: i64,
    pub estimated_monthly_jpy: i64,
}

pub async fn estimate_cost(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(workspace_id): Path<Uuid>,
) -> Result<Json<RegionCostEstimate>, (StatusCode, String)> {
    // Verify membership
    WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Not a member".to_string()))?;

    let additional_regions =
        ServerRegionRepository::count_workspace_additional_regions(&state.db, workspace_id)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Price per region: ¥300/month (approximately $2)
    let price_per_region_jpy = 300;
    let estimated_monthly_jpy = additional_regions * price_per_region_jpy;

    Ok(Json(RegionCostEstimate {
        additional_regions,
        price_per_region_jpy,
        estimated_monthly_jpy,
    }))
}

/// Deploy a server to all configured regions
pub async fn deploy_all_regions(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path((workspace_id, server_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, (StatusCode, String)> {
    // Verify membership and permission
    let member = WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Not a member".to_string()))?;

    if matches!(member.role(), WorkspaceRole::Viewer) {
        return Err((
            StatusCode::FORBIDDEN,
            "Insufficient permissions".to_string(),
        ));
    }

    // Verify server belongs to workspace
    let server = ServerRepository::find_by_id(&state.db, server_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Server not found".to_string()))?;

    if server.workspace_id != workspace_id {
        return Err((StatusCode::NOT_FOUND, "Server not found".to_string()));
    }

    // Get all regions for the server
    let regions = ServerRegionRepository::list_by_server(&state.db, server_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Set all regions to deploying status
    for region in &regions {
        ServerRegionRepository::update_status(
            &state.db,
            server_id,
            &region.region,
            RegionStatus::Deploying,
        )
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }

    // TODO: Enqueue deploy jobs for each region

    tracing::info!(
        "Initiated deployment to {} regions for server {}",
        regions.len(),
        server_id
    );

    Ok(StatusCode::ACCEPTED)
}
