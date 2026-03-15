use crate::models::{CreateRequestLog, RequestLog, RequestLogStats, ToolUsageStats};
use chrono::{DateTime, Utc};
use mcp_common::Result;
use sqlx::PgPool;
use uuid::Uuid;

pub struct RequestLogRepository;

impl RequestLogRepository {
    pub async fn create(pool: &PgPool, data: CreateRequestLog) -> Result<RequestLog> {
        let log = sqlx::query_as::<_, RequestLog>(
            r#"
            INSERT INTO request_logs (
                server_id, tool_name, api_key_id, client_info,
                request_body, response_status, error_message, duration_ms
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, server_id, tool_name, api_key_id, client_info,
                      request_body, response_status, error_message, duration_ms, created_at
            "#,
        )
        .bind(data.server_id)
        .bind(&data.tool_name)
        .bind(data.api_key_id)
        .bind(&data.client_info)
        .bind(&data.request_body)
        .bind(&data.response_status)
        .bind(&data.error_message)
        .bind(data.duration_ms)
        .fetch_one(pool)
        .await?;

        Ok(log)
    }

    pub async fn list_by_server(
        pool: &PgPool,
        server_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<RequestLog>> {
        let logs = sqlx::query_as::<_, RequestLog>(
            r#"
            SELECT id, server_id, tool_name, api_key_id, client_info,
                   request_body, response_status, error_message, duration_ms, created_at
            FROM request_logs
            WHERE server_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            "#,
        )
        .bind(server_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await?;

        Ok(logs)
    }

    pub async fn list_by_server_since(
        pool: &PgPool,
        server_id: Uuid,
        since: DateTime<Utc>,
        limit: i64,
    ) -> Result<Vec<RequestLog>> {
        let logs = sqlx::query_as::<_, RequestLog>(
            r#"
            SELECT id, server_id, tool_name, api_key_id, client_info,
                   request_body, response_status, error_message, duration_ms, created_at
            FROM request_logs
            WHERE server_id = $1 AND created_at > $2
            ORDER BY created_at DESC
            LIMIT $3
            "#,
        )
        .bind(server_id)
        .bind(since)
        .bind(limit)
        .fetch_all(pool)
        .await?;

        Ok(logs)
    }

    pub async fn get_stats(
        pool: &PgPool,
        server_id: Uuid,
        since: DateTime<Utc>,
    ) -> Result<RequestLogStats> {
        let stats = sqlx::query_as::<_, RequestLogStats>(
            r#"
            SELECT
                COUNT(*) as total_requests,
                COUNT(*) FILTER (WHERE response_status = 'success') as success_count,
                COUNT(*) FILTER (WHERE response_status != 'success') as error_count,
                COALESCE(AVG(duration_ms), 0) as avg_duration_ms
            FROM request_logs
            WHERE server_id = $1 AND created_at > $2
            "#,
        )
        .bind(server_id)
        .bind(since)
        .fetch_one(pool)
        .await?;

        Ok(stats)
    }

    pub async fn get_tool_usage_stats(
        pool: &PgPool,
        server_id: Uuid,
        since: DateTime<Utc>,
    ) -> Result<Vec<ToolUsageStats>> {
        let stats = sqlx::query_as::<_, ToolUsageStats>(
            r#"
            SELECT
                COALESCE(tool_name, 'unknown') as tool_name,
                COUNT(*) as call_count,
                COUNT(*) FILTER (WHERE response_status != 'success') as error_count,
                COALESCE(AVG(duration_ms), 0) as avg_duration_ms
            FROM request_logs
            WHERE server_id = $1 AND created_at > $2
            GROUP BY tool_name
            ORDER BY call_count DESC
            "#,
        )
        .bind(server_id)
        .bind(since)
        .fetch_all(pool)
        .await?;

        Ok(stats)
    }

    pub async fn count_by_server(
        pool: &PgPool,
        server_id: Uuid,
        since: DateTime<Utc>,
    ) -> Result<i64> {
        let count: (i64,) = sqlx::query_as(
            r#"
            SELECT COUNT(*) FROM request_logs
            WHERE server_id = $1 AND created_at > $2
            "#,
        )
        .bind(server_id)
        .bind(since)
        .fetch_one(pool)
        .await?;

        Ok(count.0)
    }

    pub async fn delete_old_logs(pool: &PgPool, before: DateTime<Utc>) -> Result<u64> {
        let result = sqlx::query("DELETE FROM request_logs WHERE created_at < $1")
            .bind(before)
            .execute(pool)
            .await?;

        Ok(result.rows_affected())
    }
}
