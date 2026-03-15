use crate::models::{CreateWorkspace, UpdateWorkspace, Workspace, WorkspaceMember, WorkspaceWithRole};
use mcp_common::types::{Plan, WorkspaceRole};
use mcp_common::Result;
use sqlx::PgPool;
use uuid::Uuid;

pub struct WorkspaceRepository;

impl WorkspaceRepository {
    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Workspace>> {
        let workspace = sqlx::query_as::<_, Workspace>(
            r#"
            SELECT id, name, slug, plan, owner_id, created_at, updated_at
            FROM workspaces
            WHERE id = $1
            "#,
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;

        Ok(workspace)
    }

    pub async fn find_by_slug(pool: &PgPool, slug: &str) -> Result<Option<Workspace>> {
        let workspace = sqlx::query_as::<_, Workspace>(
            r#"
            SELECT id, name, slug, plan, owner_id, created_at, updated_at
            FROM workspaces
            WHERE slug = $1
            "#,
        )
        .bind(slug)
        .fetch_optional(pool)
        .await?;

        Ok(workspace)
    }

    pub async fn list_by_user(pool: &PgPool, user_id: Uuid) -> Result<Vec<WorkspaceWithRole>> {
        let workspaces = sqlx::query_as::<_, WorkspaceWithRole>(
            r#"
            SELECT w.id, w.name, w.slug, w.plan, w.owner_id, w.created_at, w.updated_at, wm.role
            FROM workspaces w
            INNER JOIN workspace_members wm ON w.id = wm.workspace_id
            WHERE wm.user_id = $1
            ORDER BY w.created_at DESC
            "#,
        )
        .bind(user_id)
        .fetch_all(pool)
        .await?;

        Ok(workspaces)
    }

    pub async fn create(pool: &PgPool, data: CreateWorkspace) -> Result<Workspace> {
        let mut tx = pool.begin().await?;

        let workspace = sqlx::query_as::<_, Workspace>(
            r#"
            INSERT INTO workspaces (name, slug, owner_id)
            VALUES ($1, $2, $3)
            RETURNING id, name, slug, plan, owner_id, created_at, updated_at
            "#,
        )
        .bind(&data.name)
        .bind(&data.slug)
        .bind(data.owner_id)
        .fetch_one(&mut *tx)
        .await?;

        // Add owner as workspace member
        sqlx::query(
            r#"
            INSERT INTO workspace_members (workspace_id, user_id, role)
            VALUES ($1, $2, 'owner')
            "#,
        )
        .bind(workspace.id)
        .bind(data.owner_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        Ok(workspace)
    }

    pub async fn update(pool: &PgPool, id: Uuid, data: UpdateWorkspace) -> Result<Workspace> {
        let plan_str = data.plan.map(|p| match p {
            Plan::Free => "free",
            Plan::Pro => "pro",
            Plan::Team => "team",
            Plan::Enterprise => "enterprise",
        });

        let workspace = sqlx::query_as::<_, Workspace>(
            r#"
            UPDATE workspaces
            SET
                name = COALESCE($2, name),
                plan = COALESCE($3, plan),
                updated_at = NOW()
            WHERE id = $1
            RETURNING id, name, slug, plan, owner_id, created_at, updated_at
            "#,
        )
        .bind(id)
        .bind(&data.name)
        .bind(plan_str)
        .fetch_one(pool)
        .await?;

        Ok(workspace)
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<()> {
        sqlx::query("DELETE FROM workspaces WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;

        Ok(())
    }

    pub async fn get_member(
        pool: &PgPool,
        workspace_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<WorkspaceMember>> {
        let member = sqlx::query_as::<_, WorkspaceMember>(
            r#"
            SELECT workspace_id, user_id, role, created_at
            FROM workspace_members
            WHERE workspace_id = $1 AND user_id = $2
            "#,
        )
        .bind(workspace_id)
        .bind(user_id)
        .fetch_optional(pool)
        .await?;

        Ok(member)
    }

    pub async fn add_member(
        pool: &PgPool,
        workspace_id: Uuid,
        user_id: Uuid,
        role: WorkspaceRole,
    ) -> Result<WorkspaceMember> {
        let role_str = match role {
            WorkspaceRole::Owner => "owner",
            WorkspaceRole::Admin => "admin",
            WorkspaceRole::Member => "member",
            WorkspaceRole::Viewer => "viewer",
        };

        let member = sqlx::query_as::<_, WorkspaceMember>(
            r#"
            INSERT INTO workspace_members (workspace_id, user_id, role)
            VALUES ($1, $2, $3)
            RETURNING workspace_id, user_id, role, created_at
            "#,
        )
        .bind(workspace_id)
        .bind(user_id)
        .bind(role_str)
        .fetch_one(pool)
        .await?;

        Ok(member)
    }

    pub async fn remove_member(pool: &PgPool, workspace_id: Uuid, user_id: Uuid) -> Result<()> {
        sqlx::query(
            r#"
            DELETE FROM workspace_members
            WHERE workspace_id = $1 AND user_id = $2
            "#,
        )
        .bind(workspace_id)
        .bind(user_id)
        .execute(pool)
        .await?;

        Ok(())
    }

    pub async fn list_members(pool: &PgPool, workspace_id: Uuid) -> Result<Vec<WorkspaceMember>> {
        let members = sqlx::query_as::<_, WorkspaceMember>(
            r#"
            SELECT workspace_id, user_id, role, created_at
            FROM workspace_members
            WHERE workspace_id = $1
            ORDER BY created_at
            "#,
        )
        .bind(workspace_id)
        .fetch_all(pool)
        .await?;

        Ok(members)
    }

    pub async fn list_owned_by_user(pool: &PgPool, user_id: Uuid) -> Result<Vec<Workspace>> {
        let workspaces = sqlx::query_as::<_, Workspace>(
            r#"
            SELECT id, name, slug, plan, owner_id, created_at, updated_at
            FROM workspaces
            WHERE owner_id = $1
            ORDER BY created_at DESC
            "#,
        )
        .bind(user_id)
        .fetch_all(pool)
        .await?;

        Ok(workspaces)
    }
}
