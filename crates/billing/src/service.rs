use anyhow::{anyhow, Result};
use stripe::{
    CheckoutSession, CheckoutSessionMode, Client, CreateCheckoutSession,
    CreateCheckoutSessionLineItems, CreateCustomer, CreateBillingPortalSession,
    Customer, CustomerId, Subscription, SubscriptionId,
};
use uuid::Uuid;

use crate::plans::{get_plan_by_price_id, Plan};

/// Stripe billing service
#[derive(Clone)]
pub struct BillingService {
    client: Client,
    success_url: String,
    cancel_url: String,
    portal_return_url: String,
}

impl BillingService {
    pub fn new(api_key: &str, base_url: &str) -> Self {
        let client = Client::new(api_key);

        Self {
            client,
            success_url: format!("{}/dashboard/billing/success", base_url),
            cancel_url: format!("{}/dashboard/billing/cancel", base_url),
            portal_return_url: format!("{}/dashboard/billing", base_url),
        }
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
