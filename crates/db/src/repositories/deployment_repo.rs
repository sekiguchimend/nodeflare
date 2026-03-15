use crate::models::{CreateDeployment, Deployment, UpdateDeployment};
use mcp_common::types::DeploymentStatus;
use mcp_common::Result;
use sqlx::PgPool;
use uuid::Uuid;

pub struct DeploymentRepository;

impl DeploymentRepository {
    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Deployment>> {
        let deployment = sqlx::query_as::<_, Deployment>(
            r#"
            SELECT id, server_id, version, commit_sha, status, build_logs,
                   error_message, started_at, finished_at, deployed_by
            FROM deployments
            WHERE id = $1
            "#,
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;

        Ok(deployment)
    }

    pub async fn find_latest_by_server(pool: &PgPool, server_id: Uuid) -> Result<Option<Deployment>> {
        let deployment = sqlx::query_as::<_, Deployment>(
            r#"
            SELECT id, server_id, version, commit_sha, status, build_logs,
                   error_message, started_at, finished_at, deployed_by
            FROM deployments
            WHERE server_id = $1
            ORDER BY version DESC
            LIMIT 1
            "#,
        )
        .bind(server_id)
        .fetch_optional(pool)
        .await?;

        Ok(deployment)
    }

    pub async fn list_by_server(
        pool: &PgPool,
        server_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<Deployment>> {
        let deployments = sqlx::query_as::<_, Deployment>(
            r#"
            SELECT id, server_id, version, commit_sha, status, build_logs,
                   error_message, started_at, finished_at, deployed_by
            FROM deployments
            WHERE server_id = $1
            ORDER BY version DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(server_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await?;

        Ok(deployments)
    }

    pub async fn create(pool: &PgPool, data: CreateDeployment) -> Result<Deployment> {
        // Get next version number
        let version: (i32,) = sqlx::query_as(
            r#"
            SELECT COALESCE(MAX(version), 0) + 1
            FROM deployments
            WHERE server_id = $1
            "#,
        )
        .bind(data.server_id)
        .fetch_one(pool)
        .await?;

        let deployment = sqlx::query_as::<_, Deployment>(
            r#"
            INSERT INTO deployments (server_id, version, commit_sha, deployed_by)
            VALUES ($1, $2, $3, $4)
            RETURNING id, server_id, version, commit_sha, status, build_logs,
                      error_message, started_at, finished_at, deployed_by
            "#,
        )
        .bind(data.server_id)
        .bind(version.0)
        .bind(&data.commit_sha)
        .bind(data.deployed_by)
        .fetch_one(pool)
        .await?;

        Ok(deployment)
    }

    pub async fn update(pool: &PgPool, id: Uuid, data: UpdateDeployment) -> Result<Deployment> {
        let status_str = data.status.map(|s| match s {
            DeploymentStatus::Pending => "pending",
            DeploymentStatus::Building => "building",
            DeploymentStatus::Pushing => "pushing",
            DeploymentStatus::Deploying => "deploying",
            DeploymentStatus::Succeeded => "succeeded",
            DeploymentStatus::Failed => "failed",
            DeploymentStatus::Cancelled => "cancelled",
        });

        let deployment = sqlx::query_as::<_, Deployment>(
            r#"
            UPDATE deployments
            SET
                status = COALESCE($2, status),
                build_logs = COALESCE($3, build_logs),
                error_message = COALESCE($4, error_message),
                finished_at = COALESCE($5, finished_at)
            WHERE id = $1
            RETURNING id, server_id, version, commit_sha, status, build_logs,
                      error_message, started_at, finished_at, deployed_by
            "#,
        )
        .bind(id)
        .bind(status_str)
        .bind(&data.build_logs)
        .bind(&data.error_message)
        .bind(data.finished_at)
        .fetch_one(pool)
        .await?;

        Ok(deployment)
    }

    pub async fn append_log(pool: &PgPool, id: Uuid, log_line: &str) -> Result<()> {
        sqlx::query(
            r#"
            UPDATE deployments
            SET build_logs = COALESCE(build_logs, '') || $2 || E'\n'
            WHERE id = $1
            "#,
        )
        .bind(id)
        .bind(log_line)
        .execute(pool)
        .await?;

        Ok(())
    }
}
