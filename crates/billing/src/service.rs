use anyhow::{anyhow, Result};
use stripe::{
    CheckoutSession, CheckoutSessionMode, Client, CreateCheckoutSession,
    CreateCheckoutSessionLineItems, CreateCustomer, CreateBillingPortalSession,
    Customer, CustomerId, Subscription, SubscriptionId,
    Invoice, ListInvoices,
    SubscriptionItem, SubscriptionItemId, CreateSubscriptionItem, UpdateSubscriptionItem,
    ListSubscriptionItems, PriceId,
};
use uuid::Uuid;

use crate::plans::{get_plan_by_price_id, Plan};

/// Price per additional region per month (in JPY)
pub const REGION_PRICE_JPY: i64 = 300;

/// Stripe billing service
#[derive(Clone)]
pub struct BillingService {
    client: Client,
    success_url: String,
    cancel_url: String,
    portal_return_url: String,
    region_price_id: Option<String>,
}

impl BillingService {
    pub fn new(api_key: &str, base_url: &str) -> Self {
        let client = Client::new(api_key);
        let region_price_id = std::env::var("STRIPE_PRICE_REGION").ok();

        Self {
            client,
            success_url: format!("{}/dashboard/billing/success", base_url),
            cancel_url: format!("{}/dashboard/billing/cancel", base_url),
            portal_return_url: format!("{}/dashboard/billing", base_url),
            region_price_id,
        }
    }

    /// Get the Stripe client for advanced operations
    pub fn client(&self) -> &Client {
        &self.client
    }

    /// Get the region price ID
    pub fn region_price_id(&self) -> Option<&str> {
        self.region_price_id.as_deref()
    }

    /// Create a new Stripe customer
    pub async fn create_customer(&self, email: &str, name: &str, user_id: Uuid) -> Result<Customer> {
        let mut params = CreateCustomer::new();
        params.email = Some(email);
        params.name = Some(name);
        params.metadata = Some(
            [("user_id".to_string(), user_id.to_string())]
                .into_iter()
                .collect(),
        );

        Customer::create(&self.client, params)
            .await
            .map_err(|e| anyhow!("Failed to create Stripe customer: {}", e))
    }

    /// Create a checkout session for subscription
    pub async fn create_checkout_session(
        &self,
        customer_id: &str,
        price_id: &str,
        workspace_id: Uuid,
    ) -> Result<CheckoutSession> {
        let customer_id: CustomerId = customer_id.parse().map_err(|_| anyhow!("Invalid customer ID"))?;
        let mut params = CreateCheckoutSession::new();
        params.customer = Some(customer_id);
        params.mode = Some(CheckoutSessionMode::Subscription);
        params.success_url = Some(&self.success_url);
        params.cancel_url = Some(&self.cancel_url);
        params.line_items = Some(vec![CreateCheckoutSessionLineItems {
            price: Some(price_id.to_string()),
            quantity: Some(1),
            ..Default::default()
        }]);
        params.metadata = Some(
            [("workspace_id".to_string(), workspace_id.to_string())]
                .into_iter()
                .collect(),
        );
        params.subscription_data = Some(stripe::CreateCheckoutSessionSubscriptionData {
            metadata: Some(
                [("workspace_id".to_string(), workspace_id.to_string())]
                    .into_iter()
                    .collect(),
            ),
            ..Default::default()
        });

        CheckoutSession::create(&self.client, params)
            .await
            .map_err(|e| anyhow!("Failed to create checkout session: {}", e))
    }

    /// Create a customer portal session for managing subscription
    pub async fn create_portal_session(&self, customer_id: &str) -> Result<stripe::BillingPortalSession> {
        let customer_id: CustomerId = customer_id.parse().map_err(|_| anyhow!("Invalid customer ID"))?;
        let mut params = CreateBillingPortalSession::new(customer_id);
        params.return_url = Some(&self.portal_return_url);

        stripe::BillingPortalSession::create(&self.client, params)
            .await
            .map_err(|e| anyhow!("Failed to create portal session: {}", e))
    }

    /// Get subscription details
    pub async fn get_subscription(&self, subscription_id: &str) -> Result<Subscription> {
        let id: SubscriptionId = subscription_id.parse().map_err(|_| anyhow!("Invalid subscription ID"))?;
        Subscription::retrieve(&self.client, &id, &[])
            .await
            .map_err(|e| anyhow!("Failed to get subscription: {}", e))
    }

    /// Cancel a subscription
    pub async fn cancel_subscription(&self, subscription_id: &str) -> Result<Subscription> {
        let id: SubscriptionId = subscription_id.parse().map_err(|_| anyhow!("Invalid subscription ID"))?;
        Subscription::cancel(&self.client, &id, stripe::CancelSubscription::default())
            .await
            .map_err(|e| anyhow!("Failed to cancel subscription: {}", e))
    }

    /// Get customer by ID
    pub async fn get_customer(&self, customer_id: &str) -> Result<Customer> {
        let id: CustomerId = customer_id.parse().map_err(|_| anyhow!("Invalid customer ID"))?;
        Customer::retrieve(&self.client, &id, &[])
            .await
            .map_err(|e| anyhow!("Failed to get customer: {}", e))
    }

    /// Get plan from subscription
    pub fn get_plan_from_subscription(&self, subscription: &Subscription) -> Plan {
        subscription
            .items
            .data
            .first()
            .and_then(|item| item.price.as_ref())
            .and_then(|price| price.id.as_str().parse().ok())
            .and_then(|price_id: String| get_plan_by_price_id(&price_id))
            .unwrap_or(Plan::Free)
    }

    /// List invoices for a customer
    pub async fn list_invoices(&self, customer_id: &str, limit: i64) -> Result<Vec<Invoice>> {
        let customer_id: CustomerId = customer_id.parse().map_err(|_| anyhow!("Invalid customer ID"))?;
        let mut params = ListInvoices::new();
        params.customer = Some(customer_id);
        params.limit = Some(limit as u64);

        Invoice::list(&self.client, &params)
            .await
            .map(|list| list.data)
            .map_err(|e| anyhow!("Failed to list invoices: {}", e))
    }

    /// Calculate estimated monthly cost for additional regions
    pub fn calculate_region_cost(additional_regions: i64) -> i64 {
        additional_regions * REGION_PRICE_JPY
    }

    // =========================================================================
    // Region Subscription Management
    // =========================================================================

    /// Add a region to billing (creates or updates subscription item)
    /// Returns the subscription item ID
    pub async fn add_region_billing(
        &self,
        subscription_id: &str,
        existing_item_id: Option<&str>,
    ) -> Result<String> {
        let region_price_id = self.region_price_id.as_ref()
            .ok_or_else(|| anyhow!("STRIPE_PRICE_REGION not configured"))?;

        if let Some(item_id) = existing_item_id {
            // Update existing subscription item - increment quantity
            let item_id: SubscriptionItemId = item_id.parse()
                .map_err(|_| anyhow!("Invalid subscription item ID"))?;

            // Get current quantity
            let item = SubscriptionItem::retrieve(&self.client, &item_id, &[])
                .await
                .map_err(|e| anyhow!("Failed to retrieve subscription item: {}", e))?;

            let current_quantity = item.quantity.unwrap_or(0);
            let new_quantity = current_quantity + 1;

            let mut params = UpdateSubscriptionItem::new();
            params.quantity = Some(new_quantity);

            let updated = SubscriptionItem::update(&self.client, &item_id, params)
                .await
                .map_err(|e| anyhow!("Failed to update subscription item: {}", e))?;

            tracing::info!(
                "Updated region subscription item {} quantity: {} -> {}",
                item_id.as_str(),
                current_quantity,
                new_quantity
            );

            Ok(updated.id.as_str().to_string())
        } else {
            // Create new subscription item
            let subscription_id: SubscriptionId = subscription_id.parse()
                .map_err(|_| anyhow!("Invalid subscription ID"))?;

            let price_id: PriceId = region_price_id.parse()
                .map_err(|_| anyhow!("Invalid region price ID"))?;

            let mut params = CreateSubscriptionItem::new(subscription_id);
            params.price = Some(price_id);
            params.quantity = Some(1);

            let item = SubscriptionItem::create(&self.client, params)
                .await
                .map_err(|e| anyhow!("Failed to create subscription item: {}", e))?;

            tracing::info!(
                "Created new region subscription item {} with quantity 1",
                item.id.as_str()
            );

            Ok(item.id.as_str().to_string())
        }
    }

    /// Remove a region from billing (decrements or removes subscription item)
    /// Returns the subscription item ID if still exists, None if deleted
    pub async fn remove_region_billing(
        &self,
        subscription_item_id: &str,
    ) -> Result<Option<String>> {
        let item_id: SubscriptionItemId = subscription_item_id.parse()
            .map_err(|_| anyhow!("Invalid subscription item ID"))?;

        // Get current quantity
        let item = SubscriptionItem::retrieve(&self.client, &item_id, &[])
            .await
            .map_err(|e| anyhow!("Failed to retrieve subscription item: {}", e))?;

        let current_quantity = item.quantity.unwrap_or(0);

        if current_quantity <= 1 {
            // Delete the subscription item
            SubscriptionItem::delete(&self.client, &item_id)
                .await
                .map_err(|e| anyhow!("Failed to delete subscription item: {}", e))?;

            tracing::info!(
                "Deleted region subscription item {} (quantity was {})",
                subscription_item_id,
                current_quantity
            );

            Ok(None)
        } else {
            // Decrement quantity
            let new_quantity = current_quantity - 1;

            let mut params = UpdateSubscriptionItem::new();
            params.quantity = Some(new_quantity);

            let updated = SubscriptionItem::update(&self.client, &item_id, params)
                .await
                .map_err(|e| anyhow!("Failed to update subscription item: {}", e))?;

            tracing::info!(
                "Updated region subscription item {} quantity: {} -> {}",
                subscription_item_id,
                current_quantity,
                new_quantity
            );

            Ok(Some(updated.id.as_str().to_string()))
        }
    }

    /// Get current region quantity from subscription item
    pub async fn get_region_quantity(&self, subscription_item_id: &str) -> Result<u64> {
        let item_id: SubscriptionItemId = subscription_item_id.parse()
            .map_err(|_| anyhow!("Invalid subscription item ID"))?;

        let item = SubscriptionItem::retrieve(&self.client, &item_id, &[])
            .await
            .map_err(|e| anyhow!("Failed to retrieve subscription item: {}", e))?;

        Ok(item.quantity.unwrap_or(0))
    }

    /// List subscription items for a subscription
    pub async fn list_subscription_items(&self, subscription_id: &str) -> Result<Vec<SubscriptionItem>> {
        let subscription_id: SubscriptionId = subscription_id.parse()
            .map_err(|_| anyhow!("Invalid subscription ID"))?;

        let params = ListSubscriptionItems::new(subscription_id);

        let items = SubscriptionItem::list(&self.client, &params)
            .await
            .map_err(|e| anyhow!("Failed to list subscription items: {}", e))?;

        Ok(items.data)
    }

    /// Create a checkout session specifically for region billing
    /// Used when a Free plan user wants to add regions without upgrading
    pub async fn create_region_checkout_session(
        &self,
        customer_id: &str,
        workspace_id: Uuid,
        region_count: u64,
    ) -> Result<CheckoutSession> {
        let region_price_id = self.region_price_id.as_ref()
            .ok_or_else(|| anyhow!("STRIPE_PRICE_REGION not configured"))?;

        let customer_id: CustomerId = customer_id.parse()
            .map_err(|_| anyhow!("Invalid customer ID"))?;

        let mut params = CreateCheckoutSession::new();
        params.customer = Some(customer_id);
        params.mode = Some(CheckoutSessionMode::Subscription);
        params.success_url = Some(&self.success_url);
        params.cancel_url = Some(&self.cancel_url);
        params.line_items = Some(vec![CreateCheckoutSessionLineItems {
            price: Some(region_price_id.clone()),
            quantity: Some(region_count),
            ..Default::default()
        }]);
        params.metadata = Some(
            [
                ("workspace_id".to_string(), workspace_id.to_string()),
                ("type".to_string(), "region_billing".to_string()),
            ]
            .into_iter()
            .collect(),
        );

        CheckoutSession::create(&self.client, params)
            .await
            .map_err(|e| anyhow!("Failed to create region checkout session: {}", e))
    }

    /// Create a checkout session for adding a specific region to a server
    /// Includes server_id and region in metadata for webhook processing
    pub async fn create_region_checkout_session_with_metadata(
        &self,
        customer_id: &str,
        workspace_id: Uuid,
        server_id: Uuid,
        region: &str,
    ) -> Result<CheckoutSession> {
        let region_price_id = self.region_price_id.as_ref()
            .ok_or_else(|| anyhow!("STRIPE_PRICE_REGION not configured"))?;

        let customer_id: CustomerId = customer_id.parse()
            .map_err(|_| anyhow!("Invalid customer ID"))?;

        let mut params = CreateCheckoutSession::new();
        params.customer = Some(customer_id);
        params.mode = Some(CheckoutSessionMode::Subscription);
        params.success_url = Some(&self.success_url);
        params.cancel_url = Some(&self.cancel_url);
        params.line_items = Some(vec![CreateCheckoutSessionLineItems {
            price: Some(region_price_id.clone()),
            quantity: Some(1),
            ..Default::default()
        }]);
        params.metadata = Some(
            [
                ("workspace_id".to_string(), workspace_id.to_string()),
                ("server_id".to_string(), server_id.to_string()),
                ("region".to_string(), region.to_string()),
                ("type".to_string(), "region_addition".to_string()),
            ]
            .into_iter()
            .collect(),
        );

        CheckoutSession::create(&self.client, params)
            .await
            .map_err(|e| anyhow!("Failed to create region checkout session: {}", e))
    }
}

/// Subscription status response
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SubscriptionStatus {
    pub plan: Plan,
    pub status: String,
    pub current_period_end: Option<i64>,
    pub cancel_at_period_end: bool,
    pub stripe_subscription_id: Option<String>,
    pub stripe_customer_id: Option<String>,
}

impl Default for SubscriptionStatus {
    fn default() -> Self {
        Self {
            plan: Plan::Free,
            status: "active".to_string(),
            current_period_end: None,
            cancel_at_period_end: false,
            stripe_subscription_id: None,
            stripe_customer_id: None,
        }
    }
}
