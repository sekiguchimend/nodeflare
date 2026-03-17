pub mod auth;
pub mod billing;
pub mod github;
pub mod health;
pub mod openapi;
pub mod servers;
pub mod workspaces;
pub mod members;
pub mod tools;
pub mod deployments;
pub mod api_keys;
pub mod secrets;
pub mod logs;
pub mod ws;

use axum::{routing::{get, post, patch, delete}, Router};
use std::sync::Arc;
use crate::state::AppState;

pub fn api_router() -> Router<Arc<AppState>> {
    Router::new()
        // Auth
        .route("/auth/github", get(auth::github_login))
        .route("/auth/github/callback", get(auth::github_callback))
        .route("/auth/refresh", post(auth::refresh_token))
        .route("/auth/me", get(auth::get_current_user))
        .route("/auth/account", delete(auth::delete_account))
        // GitHub
        .route("/github/repos", get(github::list_repositories))
        // Workspaces
        .route("/workspaces", get(workspaces::list).post(workspaces::create))
        .route(
            "/workspaces/:workspace_id",
            get(workspaces::get)
                .patch(workspaces::update)
                .delete(workspaces::delete),
        )
        // Workspace Members
        .route(
            "/workspaces/:workspace_id/members",
            get(members::list).post(members::add),
        )
        .route(
            "/workspaces/:workspace_id/members/:user_id",
            patch(members::update).delete(members::remove),
        )
        // Servers (all)
        .route("/servers", get(servers::list_all))
        // Servers (workspace scoped)
        .route("/workspaces/:workspace_id/servers", get(servers::list).post(servers::create))
        .route(
            "/workspaces/:workspace_id/servers/:server_id",
            get(servers::get)
                .patch(servers::update)
                .delete(servers::delete),
        )
        .route(
            "/workspaces/:workspace_id/servers/:server_id/deploy",
            post(servers::deploy),
        )
        .route(
            "/workspaces/:workspace_id/servers/:server_id/stop",
            post(servers::stop),
        )
        .route(
            "/workspaces/:workspace_id/servers/:server_id/restart",
            post(servers::restart),
        )
        // Tools
        .route(
            "/workspaces/:workspace_id/servers/:server_id/tools",
            get(tools::list),
        )
        .route(
            "/workspaces/:workspace_id/servers/:server_id/tools/:tool_id",
            patch(tools::update),
        )
        // Deployments
        .route(
            "/workspaces/:workspace_id/servers/:server_id/deployments",
            get(deployments::list),
        )
        .route(
            "/workspaces/:workspace_id/servers/:server_id/deployments/:deployment_id",
            get(deployments::get),
        )
        .route(
            "/workspaces/:workspace_id/servers/:server_id/deployments/:deployment_id/logs",
            get(deployments::get_logs),
        )
        .route(
            "/workspaces/:workspace_id/servers/:server_id/deployments/:deployment_id/rollback",
            post(deployments::rollback),
        )
        // API Keys
        .route(
            "/workspaces/:workspace_id/api-keys",
            get(api_keys::list).post(api_keys::create),
        )
        .route(
            "/workspaces/:workspace_id/api-keys/:key_id",
            delete(api_keys::delete),
        )
        // Secrets
        .route(
            "/workspaces/:workspace_id/servers/:server_id/secrets",
            get(secrets::list).post(secrets::set),
        )
        .route(
            "/workspaces/:workspace_id/servers/:server_id/secrets/:key",
            delete(secrets::delete),
        )
        // Logs
        .route(
            "/workspaces/:workspace_id/servers/:server_id/logs",
            get(logs::list),
        )
        .route(
            "/workspaces/:workspace_id/servers/:server_id/stats",
            get(logs::stats),
        )
        // Billing
        .route("/billing/plans", get(billing::list_plans))
        .route(
            "/workspaces/:workspace_id/billing/subscription",
            get(billing::get_subscription),
        )
        .route(
            "/workspaces/:workspace_id/billing/checkout",
            post(billing::create_checkout),
        )
        .route(
            "/workspaces/:workspace_id/billing/portal",
            post(billing::create_portal_session),
        )
        .route(
            "/workspaces/:workspace_id/billing/cancel",
            post(billing::cancel_subscription),
        )
        // Stripe webhook (no auth required)
        .route("/webhooks/stripe", post(billing::handle_webhook))
}

/// WebSocket router for real-time updates
pub fn ws_router() -> Router<Arc<AppState>> {
    Router::new()
        // Deployment status updates
        .route(
            "/deployments/:deployment_id",
            get(ws::deployment_ws),
        )
        // Build logs streaming
        .route(
            "/deployments/:deployment_id/logs",
            get(ws::build_logs_ws),
        )
        // Server logs streaming
        .route(
            "/workspaces/:workspace_id/servers/:server_id/logs",
            get(ws::server_logs_ws),
        )
}
