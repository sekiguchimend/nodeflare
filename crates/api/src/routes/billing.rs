use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use mcp_billing::{BillingService, Plan, WebhookHandler, PLANS};
use mcp_db::WorkspaceRepository;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::extractors::AuthUser;
use crate::state::AppState;

/// Get available plans
pub async fn list_plans() -> Json<Vec<PlanResponse>> {
    let plans: Vec<PlanResponse> = PLANS
        .iter()
        .map(|p| PlanResponse {
            plan: p.plan.to_string(),
            name: p.name.to_string(),
            description: p.description.to_string(),
            price_monthly_jpy: p.price_monthly_jpy,
            price_yearly_jpy: p.price_yearly_jpy,
            features: p.features.iter().map(|s| s.to_string()).collect(),
            limits: PlanLimitsResponse {
                max_servers: p.limits.max_servers,
                max_deployments_per_month: p.limits.max_deployments_per_month,
                max_requests_per_month: p.limits.max_requests_per_month,
                max_team_members: p.limits.max_team_members,
                log_retention_days: p.limits.log_retention_days,
                custom_domains: p.limits.custom_domains,
                priority_support: p.limits.priority_support,
                sso_enabled: p.limits.sso_enabled,
            },
        })
        .collect();

    Json(plans)
}

/// Get current subscription status for a workspace
pub async fn get_subscription(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(workspace_id): Path<Uuid>,
) -> Result<Json<SubscriptionResponse>, (StatusCode, String)> {
    // Verify user has access
    WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Not a member".to_string()))?;

    let workspace = WorkspaceRepository::find_by_id(&state.db, workspace_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Workspace not found".to_string()))?;

    // Get additional regions count from Stripe subscription items
    let mut additional_regions: u32 = 0;
    let mut cancel_at_period_end = false;
    let mut current_period_start: Option<i64> = None;

    if let (Some(billing), Some(subscription_id)) = (state.billing.as_ref(), workspace.stripe_subscription_id.as_ref()) {
        if let Ok(subscription) = billing.get_subscription(subscription_id).await {
            cancel_at_period_end = subscription.cancel_at_period_end;
            current_period_start = Some(subscription.current_period_start);

            // Check for region subscription items
            if let Some(region_price_id) = billing.region_price_id() {
                for item in &subscription.items.data {
                    if let Some(price) = &item.price {
                        if price.id.as_str() == region_price_id {
                            additional_regions = item.quantity.unwrap_or(0) as u32;
                        }
                    }
                }
            }
        }
    }

    Ok(Json(SubscriptionResponse {
        plan: workspace.plan.clone(),
        status: workspace.subscription_status.unwrap_or_else(|| "none".to_string()),
        stripe_customer_id: workspace.stripe_customer_id,
        stripe_subscription_id: workspace.stripe_subscription_id,
        current_period_start,
        current_period_end: workspace.current_period_end.map(|d| d.timestamp()),
        cancel_at_period_end,
        additional_regions,
    }))
}

/// Create a checkout session
pub async fn create_checkout(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(workspace_id): Path<Uuid>,
    Json(body): Json<CreateCheckoutRequest>,
) -> Result<Json<CheckoutResponse>, (StatusCode, String)> {
    // Validate plan is one of the allowed values (server-side validation)
    if !matches!(body.plan.as_str(), "pro" | "team" | "enterprise") {
        return Err((StatusCode::BAD_REQUEST, "Invalid plan. Must be one of: pro, team, enterprise".to_string()));
    }

    // Verify user is owner/admin
    let member = WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Not a member".to_string()))?;

    if !matches!(member.role(), mcp_common::types::WorkspaceRole::Owner | mcp_common::types::WorkspaceRole::Admin) {
        return Err((StatusCode::FORBIDDEN, "Only owners and admins can manage billing".to_string()));
    }

    let workspace = WorkspaceRepository::find_by_id(&state.db, workspace_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Workspace not found".to_string()))?;

    // Prevent duplicate subscriptions - check if already has active subscription
    if workspace.stripe_subscription_id.is_some() {
        return Err((StatusCode::CONFLICT, "Workspace already has an active subscription. Please cancel the existing subscription first or use the billing portal to change plans.".to_string()));
    }

    let billing = state.billing.as_ref()
        .ok_or((StatusCode::SERVICE_UNAVAILABLE, "Billing not configured".to_string()))?;

    // Get or create Stripe customer
    let customer_id = if let Some(id) = workspace.stripe_customer_id.clone() {
        id
    } else {
        // Get user info to create customer
        let user = mcp_db::UserRepository::find_by_id(&state.db, auth_user.user_id)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
            .ok_or((StatusCode::NOT_FOUND, "User not found".to_string()))?;

        let customer = billing
            .create_customer(&user.email, &user.name, auth_user.user_id)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        let customer_id = customer.id.to_string();

        // Save customer ID to workspace
        WorkspaceRepository::update_stripe_customer(&state.db, workspace_id, &customer_id)
            .await
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        customer_id
    };

    // Get price ID based on plan and interval (server-side only - never trust client price_id)
    let price_id = get_price_id(&body.plan, body.yearly)
        .ok_or((StatusCode::BAD_REQUEST, "Price not configured for this plan".to_string()))?;

    // Create checkout session
    let session = billing
        .create_checkout_session(&customer_id, &price_id, workspace_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(CheckoutResponse {
        checkout_url: session.url.unwrap_or_default(),
        session_id: session.id.to_string(),
    }))
}

/// Cancel subscription
pub async fn cancel_subscription(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(workspace_id): Path<Uuid>,
) -> Result<Json<CancelResponse>, (StatusCode, String)> {
    // Verify user is owner/admin
    let member = WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Not a member".to_string()))?;

    if !matches!(member.role(), mcp_common::types::WorkspaceRole::Owner | mcp_common::types::WorkspaceRole::Admin) {
        return Err((StatusCode::FORBIDDEN, "Only owners and admins can manage billing".to_string()));
    }

    let workspace = WorkspaceRepository::find_by_id(&state.db, workspace_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Workspace not found".to_string()))?;

    let subscription_id = workspace
        .stripe_subscription_id
        .ok_or((StatusCode::BAD_REQUEST, "No active subscription to cancel".to_string()))?;

    let billing = state.billing.as_ref()
        .ok_or((StatusCode::SERVICE_UNAVAILABLE, "Billing not configured".to_string()))?;

    // Cancel subscription in Stripe
    let subscription = billing
        .cancel_subscription(&subscription_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to cancel subscription: {}", e)))?;

    // The webhook will handle updating the database when Stripe confirms cancellation
    // But we can return the cancellation status immediately

    Ok(Json(CancelResponse {
        status: subscription.status.to_string(),
        cancel_at_period_end: subscription.cancel_at_period_end,
        current_period_end: Some(subscription.current_period_end),
    }))
}

/// Create a customer portal session
pub async fn create_portal_session(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(workspace_id): Path<Uuid>,
) -> Result<Json<PortalResponse>, (StatusCode, String)> {
    // Verify user is owner/admin
    let member = WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Not a member".to_string()))?;

    if !matches!(member.role(), mcp_common::types::WorkspaceRole::Owner | mcp_common::types::WorkspaceRole::Admin) {
        return Err((StatusCode::FORBIDDEN, "Only owners and admins can manage billing".to_string()));
    }

    let workspace = WorkspaceRepository::find_by_id(&state.db, workspace_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Workspace not found".to_string()))?;

    let customer_id = workspace
        .stripe_customer_id
        .ok_or((StatusCode::BAD_REQUEST, "No billing setup for this workspace".to_string()))?;

    let billing = state.billing.as_ref()
        .ok_or((StatusCode::SERVICE_UNAVAILABLE, "Billing not configured".to_string()))?;

    let session = billing
        .create_portal_session(&customer_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(PortalResponse {
        portal_url: session.url,
    }))
}

/// Handle Stripe webhooks
pub async fn handle_webhook(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: String,
) -> Result<StatusCode, (StatusCode, String)> {
    let signature = headers
        .get("stripe-signature")
        .and_then(|v| v.to_str().ok())
        .ok_or((StatusCode::BAD_REQUEST, "Missing signature".to_string()))?;

    let webhook_handler = state.webhook_handler.as_ref()
        .ok_or((StatusCode::SERVICE_UNAVAILABLE, "Webhook handler not configured".to_string()))?;

    let event = webhook_handler
        .verify_event(&body, signature)
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    webhook_handler
        .handle_event(event)
        .await
        .map_err(|e| {
            tracing::error!("Webhook handler error: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
        })?;

    Ok(StatusCode::OK)
}

// Helper function to get price ID
fn get_price_id(plan: &str, yearly: bool) -> Option<String> {
    let env_key = match (plan, yearly) {
        ("pro", false) => "STRIPE_PRICE_PRO_MONTHLY",
        ("pro", true) => "STRIPE_PRICE_PRO_YEARLY",
        ("team", false) => "STRIPE_PRICE_TEAM_MONTHLY",
        ("team", true) => "STRIPE_PRICE_TEAM_YEARLY",
        ("enterprise", false) => "STRIPE_PRICE_ENTERPRISE_MONTHLY",
        ("enterprise", true) => "STRIPE_PRICE_ENTERPRISE_YEARLY",
        _ => return None,
    };

    std::env::var(env_key).ok()
}

// Request/Response types
#[derive(Debug, Serialize)]
pub struct PlanResponse {
    pub plan: String,
    pub name: String,
    pub description: String,
    pub price_monthly_jpy: u32,
    pub price_yearly_jpy: u32,
    pub features: Vec<String>,
    pub limits: PlanLimitsResponse,
}

#[derive(Debug, Serialize)]
pub struct PlanLimitsResponse {
    pub max_servers: u32,
    pub max_deployments_per_month: u32,
    pub max_requests_per_month: u64,
    pub max_team_members: u32,
    pub log_retention_days: u32,
    pub custom_domains: bool,
    pub priority_support: bool,
    pub sso_enabled: bool,
}

#[derive(Debug, Serialize)]
pub struct SubscriptionResponse {
    pub plan: String,
    pub status: String,
    pub stripe_customer_id: Option<String>,
    pub stripe_subscription_id: Option<String>,
    pub current_period_start: Option<i64>,
    pub current_period_end: Option<i64>,
    pub cancel_at_period_end: bool,
    pub additional_regions: u32,
}

#[derive(Debug, Deserialize)]
pub struct CreateCheckoutRequest {
    pub plan: String,
    #[serde(default)]
    pub yearly: bool,
}

#[derive(Debug, Serialize)]
pub struct CheckoutResponse {
    pub checkout_url: String,
    pub session_id: String,
}

#[derive(Debug, Serialize)]
pub struct PortalResponse {
    pub portal_url: String,
}

#[derive(Debug, Serialize)]
pub struct CancelResponse {
    pub status: String,
    pub cancel_at_period_end: bool,
    pub current_period_end: Option<i64>,
}

/// Get billing settings for a workspace
pub async fn get_billing_settings(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(workspace_id): Path<Uuid>,
) -> Result<Json<BillingSettingsResponse>, (StatusCode, String)> {
    // Verify user has access
    WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Not a member".to_string()))?;

    let workspace = WorkspaceRepository::find_by_id(&state.db, workspace_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Workspace not found".to_string()))?;

    Ok(Json(BillingSettingsResponse {
        auto_email_invoices: workspace.auto_email_invoices.unwrap_or(true),
    }))
}

/// Update billing settings for a workspace
pub async fn update_billing_settings(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(workspace_id): Path<Uuid>,
    Json(body): Json<UpdateBillingSettingsRequest>,
) -> Result<Json<BillingSettingsResponse>, (StatusCode, String)> {
    // Verify user is owner/admin
    let member = WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Not a member".to_string()))?;

    if !matches!(member.role(), mcp_common::types::WorkspaceRole::Owner | mcp_common::types::WorkspaceRole::Admin) {
        return Err((StatusCode::FORBIDDEN, "Only owners and admins can manage billing settings".to_string()));
    }

    WorkspaceRepository::update_billing_settings(&state.db, workspace_id, body.auto_email_invoices)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(BillingSettingsResponse {
        auto_email_invoices: body.auto_email_invoices,
    }))
}

#[derive(Debug, Serialize)]
pub struct BillingSettingsResponse {
    pub auto_email_invoices: bool,
}

#[derive(Debug, Deserialize)]
pub struct UpdateBillingSettingsRequest {
    pub auto_email_invoices: bool,
}

#[derive(Debug, Serialize)]
pub struct InvoiceResponse {
    pub id: String,
    pub number: Option<String>,
    pub status: Option<String>,
    pub amount_due: i64,
    pub amount_paid: i64,
    pub currency: String,
    pub created: i64,
    pub hosted_invoice_url: Option<String>,
    pub invoice_pdf: Option<String>,
}

/// Get payment method for a workspace
pub async fn get_payment_method(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(workspace_id): Path<Uuid>,
) -> Result<Json<PaymentMethodResponse>, (StatusCode, String)> {
    // Verify user has access
    WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Not a member".to_string()))?;

    let workspace = WorkspaceRepository::find_by_id(&state.db, workspace_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Workspace not found".to_string()))?;

    let customer_id = match workspace.stripe_customer_id {
        Some(id) => id,
        None => return Ok(Json(PaymentMethodResponse { payment_method: None })),
    };

    let billing = state.billing.as_ref()
        .ok_or((StatusCode::SERVICE_UNAVAILABLE, "Billing not configured".to_string()))?;

    let customer = billing
        .get_customer(&customer_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Get default payment method from customer
    let payment_method = if let Some(default_source) = customer.default_source {
        // Try to get payment method details
        match default_source {
            stripe::Expandable::Id(id) => {
                // Just return the ID, frontend will show generic
                Some(PaymentMethodDetails {
                    brand: "card".to_string(),
                    last4: "****".to_string(),
                    exp_month: 0,
                    exp_year: 0,
                })
            }
            stripe::Expandable::Object(source) => {
                if let stripe::PaymentSource::Card(card) = *source {
                    Some(PaymentMethodDetails {
                        brand: card.brand.unwrap_or_default(),
                        last4: card.last4.unwrap_or_else(|| "****".to_string()),
                        exp_month: card.exp_month.unwrap_or(0) as u32,
                        exp_year: card.exp_year.unwrap_or(0) as u32,
                    })
                } else {
                    None
                }
            }
        }
    } else if let Some(invoice_settings) = customer.invoice_settings {
        // Try default payment method from invoice settings
        if let Some(pm) = invoice_settings.default_payment_method {
            match pm {
                stripe::Expandable::Id(_) => {
                    Some(PaymentMethodDetails {
                        brand: "card".to_string(),
                        last4: "****".to_string(),
                        exp_month: 0,
                        exp_year: 0,
                    })
                }
                stripe::Expandable::Object(pm_obj) => {
                    if let Some(card) = pm_obj.card {
                        Some(PaymentMethodDetails {
                            brand: card.brand.map(|b| b.to_string()).unwrap_or_else(|| "card".to_string()),
                            last4: card.last4.unwrap_or_else(|| "****".to_string()),
                            exp_month: card.exp_month as u32,
                            exp_year: card.exp_year as u32,
                        })
                    } else {
                        None
                    }
                }
            }
        } else {
            None
        }
    } else {
        None
    };

    Ok(Json(PaymentMethodResponse { payment_method }))
}

#[derive(Debug, Serialize)]
pub struct PaymentMethodResponse {
    pub payment_method: Option<PaymentMethodDetails>,
}

#[derive(Debug, Serialize)]
pub struct PaymentMethodDetails {
    pub brand: String,
    pub last4: String,
    pub exp_month: u32,
    pub exp_year: u32,
}

/// List invoices for a workspace
pub async fn list_invoices(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    Path(workspace_id): Path<Uuid>,
) -> Result<Json<Vec<InvoiceResponse>>, (StatusCode, String)> {
    // Verify user has access
    WorkspaceRepository::get_member(&state.db, workspace_id, auth_user.user_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::FORBIDDEN, "Not a member".to_string()))?;

    let workspace = WorkspaceRepository::find_by_id(&state.db, workspace_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Workspace not found".to_string()))?;

    let customer_id = workspace
        .stripe_customer_id
        .ok_or((StatusCode::NOT_FOUND, "No billing history for this workspace".to_string()))?;

    let billing = state.billing.as_ref()
        .ok_or((StatusCode::SERVICE_UNAVAILABLE, "Billing not configured".to_string()))?;

    let invoices = billing
        .list_invoices(&customer_id, 100)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let response: Vec<InvoiceResponse> = invoices
        .into_iter()
        .map(|inv| InvoiceResponse {
            id: inv.id.to_string(),
            number: inv.number,
            status: inv.status.map(|s| s.to_string()),
            amount_due: inv.amount_due.unwrap_or(0),
            amount_paid: inv.amount_paid.unwrap_or(0),
            currency: inv.currency.map(|c| c.to_string()).unwrap_or_else(|| "jpy".to_string()),
            created: inv.created.unwrap_or(0),
            hosted_invoice_url: inv.hosted_invoice_url,
            invoice_pdf: inv.invoice_pdf,
        })
        .collect();

    Ok(Json(response))
}
