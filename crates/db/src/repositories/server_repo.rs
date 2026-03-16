use crate::models::{CreateServer, McpServer, UpdateServer};
use mcp_common::types::{Runtime, ServerStatus, Visibility};
use mcp_common::Result;
use sqlx::PgPool;
use uuid::Uuid;

pub struct ServerRepository;

impl ServerRepository {
    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<McpServer>> {
        let server = sqlx::query_as::<_, McpServer>(
            r#"
            SELECT id, workspace_id, name, slug, description, github_repo, github_branch,
                   github_installation_id, runtime, visibility, status, endpoint_url,
                   rate_limit_per_minute, created_at, updated_at
            FROM mcp_servers
            WHERE id = $1
            "#,
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;

        Ok(server)
    }

    pub async fn find_by_slug(
        pool: &PgPool,
        workspace_id: Uuid,
        slug: &str,
    ) -> Result<Option<McpServer>> {
        let server = sqlx::query_as::<_, McpServer>(
            r#"
            SELECT id, workspace_id, name, slug, description, github_repo, github_branch,
                   github_installation_id, runtime, visibility, status, endpoint_url,
                   rate_limit_per_minute, created_at, updated_at
            FROM mcp_servers
            WHERE workspace_id = $1 AND slug = $2
            "#,
        )
        .bind(workspace_id)
        .bind(slug)
        .fetch_optional(pool)
        .await?;

        Ok(server)
    }

    pub async fn find_by_endpoint_slug(pool: &PgPool, slug: &str) -> Result<Option<McpServer>> {
        // For public servers, find by just the slug
        let server = sqlx::query_as::<_, McpServer>(
            r#"
            SELECT id, workspace_id, name, slug, description, github_repo, github_branch,
                   github_installation_id, runtime, visibility, status, endpoint_url,
                   rate_limit_per_minute, created_at, updated_at
            FROM mcp_servers
            WHERE slug = $1 AND visibility = 'public' AND status = 'running'
            "#,
        )
        .bind(slug)
        .fetch_optional(pool)
        .await?;

        Ok(server)
    }

    pub async fn list_by_workspace(
        pool: &PgPool,
        workspace_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<McpServer>> {
        let servers = sqlx::query_as::<_, McpServer>(
            r#"
            SELECT id, workspace_id, name, slug, description, github_repo, github_branch,
                   github_installation_id, runtime, visibility, status, endpoint_url,
                   rate_limit_per_minute, created_at, updated_at
            FROM mcp_servers
            WHERE workspace_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(workspace_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await?;

        Ok(servers)
    }

    pub async fn count_by_workspace(pool: &PgPool, workspace_id: Uuid) -> Result<i64> {
        let count: (i64,) = sqlx::query_as(
            r#"
            SELECT COUNT(*) FROM mcp_servers WHERE workspace_id = $1
            "#,
        )
        .bind(workspace_id)
        .fetch_one(pool)
        .await?;

        Ok(count.0)
    }

    pub async fn create(pool: &PgPool, data: CreateServer) -> Result<McpServer> {
        let runtime_str = data.runtime.to_string();
        let visibility_str = match data.visibility {
            Visibility::Private => "private",
            Visibility::Team => "team",
            Visibility::Public => "public",
        };

        let server = sqlx::query_as::<_, McpServer>(
            r#"
            INSERT INTO mcp_servers (
                workspace_id, name, slug, description, github_repo, github_branch,
                github_installation_id, runtime, visibility
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id, workspace_id, name, slug, description, github_repo, github_branch,
                      github_installation_id, runtime, visibility, status, endpoint_url,
                      rate_limit_per_minute, created_at, updated_at
            "#,
        )
        .bind(data.workspace_id)
        .bind(&data.name)
        .bind(&data.slug)
        .bind(&data.description)
        .bind(&data.github_repo)
        .bind(&data.github_branch)
        .bind(data.github_installation_id)
        .bind(runtime_str)
        .bind(visibility_str)
        .fetch_one(pool)
        .await?;

        Ok(server)
    }

    pub async fn update(pool: &PgPool, id: Uuid, data: UpdateServer) -> Result<McpServer> {
        let visibility_str = data.visibility.map(|v| match v {
            Visibility::Private => "private",
            Visibility::Team => "team",
            Visibility::Public => "public",
        });

        let status_str = data.status.map(|s| match s {
            ServerStatus::Inactive => "inactive",
            ServerStatus::Building => "building",
            ServerStatus::Deploying => "deploying",
            ServerStatus::Running => "running",
            ServerStatus::Failed => "failed",
            ServerStatus::Stopped => "stopped",
        });

        let server = sqlx::query_as::<_, McpServer>(
            r#"
            UPDATE mcp_servers
            SET
                name = COALESCE($2, name),
                description = COALESCE($3, description),
                github_branch = COALESCE($4, github_branch),
                visibility = COALESCE($5, visibility),
                status = COALESCE($6, status),
                endpoint_url = COALESCE($7, endpoint_url),
                updated_at = NOW()
            WHERE id = $1
            RETURNING id, workspace_id, name, slug, description, github_repo, github_branch,
                      github_installation_id, runtime, visibility, status, endpoint_url,
                      rate_limit_per_minute, created_at, updated_at
            "#,
        )
        .bind(id)
        .bind(&data.name)
        .bind(&data.description)
        .bind(&data.github_branch)
        .bind(visibility_str)
        .bind(status_str)
        .bind(&data.endpoint_url)
        .fetch_one(pool)
        .await?;

        Ok(server)
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<()> {
        sqlx::query("DELETE FROM mcp_servers WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;

        Ok(())
    }

    pub async fn update_status(
        pool: &PgPool,
        id: Uuid,
        status: ServerStatus,
        endpoint_url: Option<&str>,
    ) -> Result<()> {
        let status_str = match status {
            ServerStatus::Inactive => "inactive",
            ServerStatus::Building => "building",
            ServerStatus::Deploying => "deploying",
            ServerStatus::Running => "running",
            ServerStatus::Failed => "failed",
            ServerStatus::Stopped => "stopped",
        };

        sqlx::query(
            r#"
            UPDATE mcp_servers
            SET status = $2, endpoint_url = COALESCE($3, endpoint_url), updated_at = NOW()
            WHERE id = $1
            "#,
        )
        .bind(id)
        .bind(status_str)
        .bind(endpoint_url)
        .execute(pool)
        .await?;

        Ok(())
    }
}
