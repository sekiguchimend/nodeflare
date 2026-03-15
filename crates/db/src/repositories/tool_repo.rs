use crate::models::{CreateTool, Tool, UpdateTool, UpsertTool};
use mcp_common::types::ToolPermissionLevel;
use mcp_common::Result;
use sqlx::PgPool;
use uuid::Uuid;

pub struct ToolRepository;

impl ToolRepository {
    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Tool>> {
        let tool = sqlx::query_as::<_, Tool>(
            r#"
            SELECT id, server_id, name, description, input_schema, enabled,
                   permission_level, rate_limit_per_minute, created_at, updated_at
            FROM tools
            WHERE id = $1
            "#,
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;

        Ok(tool)
    }

    pub async fn find_by_name(
        pool: &PgPool,
        server_id: Uuid,
        name: &str,
    ) -> Result<Option<Tool>> {
        let tool = sqlx::query_as::<_, Tool>(
            r#"
            SELECT id, server_id, name, description, input_schema, enabled,
                   permission_level, rate_limit_per_minute, created_at, updated_at
            FROM tools
            WHERE server_id = $1 AND name = $2
            "#,
        )
        .bind(server_id)
        .bind(name)
        .fetch_optional(pool)
        .await?;

        Ok(tool)
    }

    pub async fn list_by_server(pool: &PgPool, server_id: Uuid) -> Result<Vec<Tool>> {
        let tools = sqlx::query_as::<_, Tool>(
            r#"
            SELECT id, server_id, name, description, input_schema, enabled,
                   permission_level, rate_limit_per_minute, created_at, updated_at
            FROM tools
            WHERE server_id = $1
            ORDER BY name
            "#,
        )
        .bind(server_id)
        .fetch_all(pool)
        .await?;

        Ok(tools)
    }

    pub async fn list_enabled_by_server(pool: &PgPool, server_id: Uuid) -> Result<Vec<Tool>> {
        let tools = sqlx::query_as::<_, Tool>(
            r#"
            SELECT id, server_id, name, description, input_schema, enabled,
                   permission_level, rate_limit_per_minute, created_at, updated_at
            FROM tools
            WHERE server_id = $1 AND enabled = true
            ORDER BY name
            "#,
        )
        .bind(server_id)
        .fetch_all(pool)
        .await?;

        Ok(tools)
    }

    pub async fn create(pool: &PgPool, data: CreateTool) -> Result<Tool> {
        let tool = sqlx::query_as::<_, Tool>(
            r#"
            INSERT INTO tools (server_id, name, description, input_schema)
            VALUES ($1, $2, $3, $4)
            RETURNING id, server_id, name, description, input_schema, enabled,
                      permission_level, rate_limit_per_minute, created_at, updated_at
            "#,
        )
        .bind(data.server_id)
        .bind(&data.name)
        .bind(&data.description)
        .bind(&data.input_schema)
        .fetch_one(pool)
        .await?;

        Ok(tool)
    }

    pub async fn upsert(pool: &PgPool, data: UpsertTool) -> Result<Tool> {
        let tool = sqlx::query_as::<_, Tool>(
            r#"
            INSERT INTO tools (server_id, name, description, input_schema)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (server_id, name) DO UPDATE SET
                description = EXCLUDED.description,
                input_schema = EXCLUDED.input_schema,
                updated_at = NOW()
            RETURNING id, server_id, name, description, input_schema, enabled,
                      permission_level, rate_limit_per_minute, created_at, updated_at
            "#,
        )
        .bind(data.server_id)
        .bind(&data.name)
        .bind(&data.description)
        .bind(&data.input_schema)
        .fetch_one(pool)
        .await?;

        Ok(tool)
    }

    pub async fn update(pool: &PgPool, id: Uuid, data: UpdateTool) -> Result<Tool> {
        let permission_str = data.permission_level.map(|p| match p {
            ToolPermissionLevel::Normal => "normal",
            ToolPermissionLevel::Elevated => "elevated",
            ToolPermissionLevel::Dangerous => "dangerous",
        });

        let tool = sqlx::query_as::<_, Tool>(
            r#"
            UPDATE tools
            SET
                description = COALESCE($2, description),
                enabled = COALESCE($3, enabled),
                permission_level = COALESCE($4, permission_level),
                rate_limit_per_minute = COALESCE($5, rate_limit_per_minute),
                updated_at = NOW()
            WHERE id = $1
            RETURNING id, server_id, name, description, input_schema, enabled,
                      permission_level, rate_limit_per_minute, created_at, updated_at
            "#,
        )
        .bind(id)
        .bind(&data.description)
        .bind(data.enabled)
        .bind(permission_str)
        .bind(data.rate_limit_per_minute)
        .fetch_one(pool)
        .await?;

        Ok(tool)
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<()> {
        sqlx::query("DELETE FROM tools WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;

        Ok(())
    }

    pub async fn delete_by_server(pool: &PgPool, server_id: Uuid) -> Result<()> {
        sqlx::query("DELETE FROM tools WHERE server_id = $1")
            .bind(server_id)
            .execute(pool)
            .await?;

        Ok(())
    }

    pub async fn sync_tools(
        pool: &PgPool,
        server_id: Uuid,
        tools: Vec<UpsertTool>,
    ) -> Result<Vec<Tool>> {
        let mut result = Vec::new();

        // Get existing tool names
        let existing: Vec<String> = sqlx::query_scalar(
            "SELECT name FROM tools WHERE server_id = $1",
        )
        .bind(server_id)
        .fetch_all(pool)
        .await?;

        // Upsert all provided tools
        let mut new_names = Vec::new();
        for tool in tools {
            new_names.push(tool.name.clone());
            let upserted = Self::upsert(pool, tool).await?;
            result.push(upserted);
        }

        // Remove tools that no longer exist
        for name in existing {
            if !new_names.contains(&name) {
                sqlx::query("DELETE FROM tools WHERE server_id = $1 AND name = $2")
                    .bind(server_id)
                    .bind(&name)
                    .execute(pool)
                    .await?;
            }
        }

        Ok(result)
    }
}
