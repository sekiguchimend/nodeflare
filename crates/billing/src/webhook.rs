use anyhow::{anyhow, Result};
use mcp_db::{
    CreateDeployment, CreateServerRegion, DbPool, DeploymentRepository, ServerRegionRepository,
    ServerRepository, WorkspaceRepository,
};
use mcp_queue::JobQueue;
use stripe::{Client, Event, EventObject, EventType, Subscription, SubscriptionId, Webhook};
use uuid::Uuid;

use crate::plans::{get_plan_by_price_id, Plan};

/// Stripe webhook handler
pub struct WebhookHandler {
    webhook_secret: String,
    db: DbPool,
    stripe_client: Client,
    job_queue: Option<JobQueue>,
}

impl WebhookHandler {
    pub fn new(webhook_secret: &str, db: DbPool, stripe_api_key: &str) -> Self {
        Self {
            webhook_secret: webhook_secret.to_string(),
            db,
            stripe_client: Client::new(stripe_api_key),
            job_queue: None,
        }
    }

    /// Create a new WebhookHandler with job queue for deployment triggering
    pub fn with_job_queue(
        webhook_secret: &str,
        db: DbPool,
        stripe_api_key: &str,
        job_queue: JobQueue,
    ) -> Self {
        Self {
            webhook_secret: webhook_secret.to_string(),
            db,
            stripe_client: Client::new(stripe_api_key),
            job_queue: Some(job_queue),
        }
    }

    /// Verify and parse webhook event
    pub fn verify_event(&self, payload: &str, signature: &str) -> Result<Event> {
        Webhook::construct_event(payload, signature, &self.webhook_secret)
            .map_err(|e| anyhow!("Failed to verify webhook: {}", e))
    }

    /// Handle a Stripe webhook event
    pub async fn handle_event(&self, event: Event) -> Result<()> {
        tracing::info!("Processing Stripe webhook event: {:?}", event.type_);

        match event.type_ {
            EventType::CheckoutSessionCompleted => {
                self.handle_checkout_completed(event).await?;
            }
            EventType::CustomerSubscriptionCreated => {
                self.handle_subscription_created(event).await?;
            }
            EventType::CustomerSubscriptionUpdated => {
                self.handle_subscription_updated(event).await?;
            }
            EventType::CustomerSubscriptionDeleted => {
                self.handle_subscription_deleted(event).await?;
            }
            EventType::InvoicePaid => {
                self.handle_invoice_paid(event).await?;
            }
            EventType::InvoicePaymentFailed => {
                self.handle_invoice_payment_failed(event).await?;
            }
            _ => {
                tracing::debug!("Unhandled event type: {:?}", event.type_);
            }
        }

        Ok(())
    }

    async fn handle_checkout_completed(&self, event: Event) -> Result<()> {
        if let EventObject::CheckoutSession(session) = event.data.object {
            tracing::info!("Checkout completed for session: {}", session.id);

            // Check if this is a region addition checkout
            let checkout_type = session
                .metadata
                .as_ref()
                .and_then(|m| m.get("type"))
                .map(|s| s.as_str());

            if checkout_type == Some("region_addition") {
                return self.handle_region_checkout_completed(&session).await;
            }

            // Regular plan subscription checkout
            // Get workspace ID from metadata
            let workspace_id = session
                .metadata
                .as_ref()
                .and_then(|m| m.get("workspace_id"))
                .and_then(|id| Uuid::parse_str(id).ok())
                .ok_or_else(|| anyhow!("Missing workspace_id in metadata"))?;

            // Get customer ID
            let customer_id = session
                .customer
                .as_ref()
                .map(|c| c.id().to_string())
                .ok_or_else(|| anyhow!("Missing customer ID"))?;

            // Get subscription ID
            let subscription_id = session
                .subscription
                .as_ref()
                .map(|s| s.id().to_string())
                .ok_or_else(|| anyhow!("Missing subscription ID"))?;

            // Update workspace with Stripe IDs
            WorkspaceRepository::update_stripe_ids(
                &self.db,
                workspace_id,
                &customer_id,
                &subscription_id,
            )
            .await?;

            tracing::info!(
                "Updated workspace {} with Stripe customer {} and subscription {}",
                workspace_id,
                customer_id,
                subscription_id
            );
        }

        Ok(())
    }

    /// Handle checkout completion for region addition
    async fn handle_region_checkout_completed(&self, session: &stripe::CheckoutSession) -> Result<()> {
        let metadata = session.metadata.as_ref()
            .ok_or_else(|| anyhow!("Missing metadata in region checkout session"))?;

        // Extract metadata
        let workspace_id = metadata
            .get("workspace_id")
            .and_then(|id| Uuid::parse_str(id).ok())
            .ok_or_else(|| anyhow!("Missing workspace_id in region checkout metadata"))?;

        let server_id = metadata
            .get("server_id")
            .and_then(|id| Uuid::parse_str(id).ok())
            .ok_or_else(|| anyhow!("Missing server_id in region checkout metadata"))?;

        let region = metadata
            .get("region")
            .ok_or_else(|| anyhow!("Missing region in region checkout metadata"))?;

        // Get subscription ID for tracking
        let subscription_id = session
            .subscription
            .as_ref()
            .map(|s| s.id().to_string());

        tracing::info!(
            "Processing region addition: workspace={}, server={}, region={}, subscription={:?}",
            workspace_id, server_id, region, subscription_id
        );

        // Check if region already exists (in case of duplicate webhook)
        let existing = ServerRegionRepository::find_by_server_and_region(&self.db, server_id, region)
            .await?;

        if existing.is_some() {
            tracing::warn!(
                "Region {} already exists for server {}, skipping duplicate",
                region, server_id
            );
            return Ok(());
        }

        // Create the region record
        let created_region = ServerRegionRepository::create(
            &self.db,
            CreateServerRegion {
                server_id,
                region: region.clone(),
                is_primary: false,
            },
        )
        .await?;

        tracing::info!(
            "Created region {} for server {} (region_id: {})",
            region, server_id, created_region.id
        );

        // Fetch the subscription to get the subscription item ID
        if let Some(sub_id) = subscription_id {
            let subscription_id: SubscriptionId = sub_id.parse()
                .map_err(|_| anyhow!("Invalid subscription ID"))?;

            let subscription = Subscription::retrieve(&self.stripe_client, &subscription_id, &[])
                .await
                .map_err(|e| anyhow!("Failed to retrieve subscription: {}", e))?;

            // Get the first subscription item ID (should be the region price)
            let item_id = subscription.items.data
                .first()
                .map(|item| item.id.as_str().to_string())
                .ok_or_else(|| anyhow!("No subscription items found"))?;

            // Store the subscription item ID for future quantity updates
            WorkspaceRepository::update_region_subscription_item(&self.db, workspace_id, Some(&item_id))
                .await?;

            tracing::info!(
                "Updated workspace {} with region subscription item {}",
                workspace_id, item_id
            );
        }

        // Trigger deployment to the new region
        if let Some(job_queue) = &self.job_queue {
            // Get server information
            let server = ServerRepository::find_by_id(&self.db, server_id)
                .await?
                .ok_or_else(|| anyhow!("Server not found for deployment trigger"))?;

            // Get the latest successful deployment to get the commit SHA
            if let Some(latest_deployment) =
                DeploymentRepository::find_latest_by_server(&self.db, server_id).await?
            {
                // Create a new deployment record for this region
                let deployment = DeploymentRepository::create(
                    &self.db,
                    CreateDeployment {
                        server_id,
                        commit_sha: latest_deployment.commit_sha.clone(),
                        deployed_by: None, // System-triggered deployment
                    },
                )
                .await?;

                // Create and enqueue the build job
                let build_job = mcp_queue::BuildJob {
                    deployment_id: deployment.id,
                    server_id,
                    github_repo: server.github_repo,
                    github_branch: server.github_branch,
                    commit_sha: latest_deployment.commit_sha,
                    runtime: server.runtime,
                    github_installation_id: server.github_installation_id,
                    region: region.clone(),
                };

                job_queue.push_build_job(build_job).await.map_err(|e| {
                    anyhow!("Failed to enqueue build job for new region: {}", e)
                })?;

                tracing::info!(
                    "Enqueued build job for server {} new region {} (deployment {})",
                    server_id,
                    region,
                    deployment.id
                );
            } else {
                tracing::warn!(
                    "No previous deployment found for server {}, skipping auto-deploy to region {}",
                    server_id,
                    region
                );
            }
        } else {
            tracing::warn!(
                "Job queue not configured, skipping auto-deploy for region {} on server {}",
                region,
                server_id
            );
        }

        Ok(())
    }

    async fn handle_subscription_created(&self, event: Event) -> Result<()> {
        if let EventObject::Subscription(subscription) = event.data.object {
            tracing::info!("Subscription created: {}", subscription.id);

            // Get workspace ID from metadata
            let workspace_id = subscription
                .metadata
                .get("workspace_id")
                .and_then(|id| Uuid::parse_str(id).ok())
                .ok_or_else(|| anyhow!("Missing workspace_id in subscription metadata"))?;

            // Get plan from price
            let plan = subscription
                .items
                .data
                .first()
                .and_then(|item| item.price.as_ref())
                .and_then(|price| get_plan_by_price_id(&price.id))
                .unwrap_or(Plan::Free);

            // Update workspace plan
            WorkspaceRepository::update_plan(&self.db, workspace_id, plan.into())
                .await?;

            // Set subscription status and period end
            let status = subscription.status.to_string();
            let period_end = chrono::DateTime::from_timestamp(subscription.current_period_end, 0);

            WorkspaceRepository::update_subscription_status(
                &self.db,
                workspace_id,
                &status,
                period_end,
            ).await?;

            tracing::info!(
                "Created subscription for workspace {} with plan {:?}, status {}, period ends: {:?}",
                workspace_id, plan, status, period_end
            );
        }

        Ok(())
    }

    async fn handle_subscription_updated(&self, event: Event) -> Result<()> {
        if let EventObject::Subscription(subscription) = event.data.object {
            tracing::info!("Subscription updated: {}", subscription.id);

            // Get workspace ID from metadata
            let workspace_id = subscription
                .metadata
                .get("workspace_id")
                .and_then(|id| Uuid::parse_str(id).ok())
                .ok_or_else(|| anyhow!("Missing workspace_id in subscription metadata"))?;

            // Get plan from price
            let plan = subscription
                .items
                .data
                .first()
                .and_then(|item| item.price.as_ref())
                .and_then(|price| get_plan_by_price_id(&price.id))
                .unwrap_or(Plan::Free);

            // Update workspace plan
            WorkspaceRepository::update_plan(&self.db, workspace_id, plan.into())
                .await?;

            // Update subscription status and period end
            let status = subscription.status.to_string();
            let period_end = chrono::DateTime::from_timestamp(subscription.current_period_end, 0);

            WorkspaceRepository::update_subscription_status(
                &self.db,
                workspace_id,
                &status,
                period_end,
            ).await?;

            tracing::info!(
                "Updated workspace {} to plan {:?} with status {} (period ends: {:?})",
                workspace_id, plan, status, period_end
            );
        }

        Ok(())
    }

    async fn handle_subscription_deleted(&self, event: Event) -> Result<()> {
        if let EventObject::Subscription(subscription) = event.data.object {
            tracing::info!("Subscription deleted: {}", subscription.id);

            // Get workspace ID from metadata
            let workspace_id = subscription
                .metadata
                .get("workspace_id")
                .and_then(|id| Uuid::parse_str(id).ok())
                .ok_or_else(|| anyhow!("Missing workspace_id in subscription metadata"))?;

            // Downgrade to free plan
            WorkspaceRepository::update_plan(&self.db, workspace_id, mcp_common::types::Plan::Free)
                .await?;

            // Clear Stripe subscription ID
            WorkspaceRepository::clear_stripe_subscription(&self.db, workspace_id)
                .await?;

            tracing::info!("Downgraded workspace {} to Free plan", workspace_id);
        }

        Ok(())
    }

    async fn handle_invoice_payment_failed(&self, event: Event) -> Result<()> {
        if let EventObject::Invoice(invoice) = event.data.object {
            tracing::warn!(
                "Invoice payment failed: {}",
                invoice.id.as_str()
            );

            // Get customer ID from invoice
            if let Some(customer) = invoice.customer {
                let customer_id = customer.id().to_string();

                // Find workspace by customer ID
                if let Ok(Some(workspace)) = WorkspaceRepository::find_by_stripe_customer(&self.db, &customer_id).await {
                    // Get attempt count from invoice
                    let attempt_count = invoice.attempt_count.unwrap_or(0);

                    // Update subscription status based on attempt count
                    let new_status = if attempt_count >= 3 {
                        // After 3 failed attempts, mark as unpaid (service will be blocked)
                        tracing::warn!(
                            "Workspace {} marked as unpaid after {} failed payment attempts",
                            workspace.id,
                            attempt_count
                        );
                        "unpaid"
                    } else {
                        // Mark as past_due (grace period, service continues but user warned)
                        tracing::warn!(
                            "Workspace {} marked as past_due (attempt {})",
                            workspace.id,
                            attempt_count
                        );
                        "past_due"
                    };

                    if let Err(e) = WorkspaceRepository::update_subscription_status(
                        &self.db,
                        workspace.id,
                        new_status,
                        None,
                    ).await {
                        tracing::error!("Failed to update subscription status: {}", e);
                    }
                }
            }
        }

        Ok(())
    }

    async fn handle_invoice_paid(&self, event: Event) -> Result<()> {
        if let EventObject::Invoice(invoice) = event.data.object {
            tracing::info!(
                "Invoice paid: {} for amount {}",
                invoice.id.as_str(),
                invoice.amount_paid.unwrap_or(0)
            );

            // On successful payment, restore active status
            if let Some(customer) = invoice.customer {
                let customer_id = customer.id().to_string();

                if let Ok(Some(workspace)) = WorkspaceRepository::find_by_stripe_customer(&self.db, &customer_id).await {
                    // Only update if status was past_due or unpaid
                    if let Some(ref status) = workspace.subscription_status {
                        if status == "past_due" || status == "unpaid" {
                            tracing::info!(
                                "Restoring workspace {} to active status after payment",
                                workspace.id
                            );

                            // Get period end from subscription
                            let period_end = invoice.lines.as_ref()
                                .and_then(|lines| lines.data.first())
                                .and_then(|line| line.period.as_ref())
                                .and_then(|period| period.end)
                                .and_then(|end| chrono::DateTime::from_timestamp(end, 0));

                            if let Err(e) = WorkspaceRepository::update_subscription_status(
                                &self.db,
                                workspace.id,
                                "active",
                                period_end,
                            ).await {
                                tracing::error!("Failed to restore subscription status: {}", e);
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }
}

impl From<Plan> for mcp_common::types::Plan {
    fn from(plan: Plan) -> Self {
        match plan {
            Plan::Free => mcp_common::types::Plan::Free,
            Plan::Pro => mcp_common::types::Plan::Pro,
            Plan::Team => mcp_common::types::Plan::Team,
            Plan::Enterprise => mcp_common::types::Plan::Enterprise,
        }
    }
}
