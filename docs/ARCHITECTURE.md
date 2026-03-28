# Architecture Documentation

This document describes the system architecture of Nodeflare, a platform for deploying and managing MCP (Model Context Protocol) servers.

## Table of Contents

- [System Overview](#system-overview)
- [Component Architecture](#component-architecture)
- [Crate Structure](#crate-structure)
- [Data Flow](#data-flow)
- [Database Schema](#database-schema)
- [External Integrations](#external-integrations)
- [Scaling Strategy](#scaling-strategy)

---

## System Overview

Nodeflare is a multi-service platform consisting of:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Clients                                     │
│                    (Web Browser, MCP Clients, APIs)                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │  Next.js  │   │  MCP API  │   │ MCP Proxy │
            │  Frontend │   │  (Axum)   │   │  (Axum)   │
            │  :3000    │   │  :8080    │   │  :8081    │
            └───────────┘   └───────────┘   └───────────┘
                    │               │               │
                    └───────────────┼───────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │ PostgreSQL│   │   Redis   │   │  Fly.io   │
            │   (Neon)  │   │ (Upstash) │   │ Machines  │
            └───────────┘   └───────────┘   └───────────┘
                                    │
                                    ▼
                            ┌───────────────┐
                            │  MCP Builder  │
                            │  (Job Worker) │
                            └───────────────┘
```

### Services

| Service | Port | Technology | Purpose |
|---------|------|------------|---------|
| **Web Frontend** | 3000 | Next.js 15 | User dashboard, management UI |
| **MCP API** | 8080 | Rust/Axum | REST API, WebSocket, authentication |
| **MCP Proxy** | 8081 | Rust/Axum | MCP protocol gateway, request routing |
| **MCP Builder** | - | Rust | Build worker, container deployment |

---

## Component Architecture

### Frontend (apps/web)

```
apps/web/
├── src/
│   ├── app/              # Next.js App Router pages
│   │   ├── (auth)/       # Authentication pages
│   │   ├── dashboard/    # Main dashboard
│   │   └── ...
│   ├── components/       # React components
│   │   ├── ui/           # Base UI components (Radix)
│   │   └── ...
│   ├── hooks/            # Custom React hooks
│   ├── lib/              # Utilities, API client
│   ├── types/            # TypeScript definitions
│   └── i18n/             # Internationalization
├── public/               # Static assets
└── next.config.js        # Next.js configuration
```

**Key Technologies:**
- Next.js 15 (App Router)
- React 18 with Server Components
- TanStack Query for data fetching
- Zustand for state management
- Tailwind CSS + Radix UI

### Backend (crates/)

```
crates/
├── api/          # Main API server
├── auth/         # Authentication (JWT, OAuth, API keys)
├── billing/      # Stripe integration
├── builder/      # Build worker (Docker, Fly.io)
├── common/       # Shared types, configuration
├── container/    # Container runtime abstraction
├── db/           # Database models and repositories
├── email/        # Email service (Resend)
├── github/       # GitHub App integration
├── mcp-runtime/  # MCP protocol implementation
├── proxy/        # MCP proxy gateway
└── queue/        # Job queue (Apalis + Redis)
```

---

## Crate Structure

### mcp-api

Main API server providing REST endpoints and WebSocket connections.

```rust
// Key modules
routes/
├── auth.rs       # OAuth, JWT, session management
├── workspaces.rs # Workspace CRUD
├── servers.rs    # Server management
├── deployments.rs# Deployment operations
├── secrets.rs    # Secret management (encrypted)
├── api_keys.rs   # API key management
├── members.rs    # Team member management
├── billing.rs    # Subscription management
├── regions.rs    # Multi-region deployment
└── webhooks.rs   # Deploy webhooks
```

**Dependencies:**
- `mcp-auth`: Authentication services
- `mcp-db`: Database access
- `mcp-queue`: Job queue
- `mcp-billing`: Stripe integration

### mcp-auth

Authentication and authorization services.

```rust
// Modules
├── jwt.rs        # JWT generation/verification
├── password.rs   # Argon2 password hashing
├── crypto.rs     # AES-256-GCM encryption
├── api_key.rs    # API key generation/verification
└── github.rs     # GitHub OAuth client
```

### mcp-db

Database layer using SQLx with PostgreSQL.

```rust
// Repository pattern
repositories/
├── user_repo.rs
├── workspace_repo.rs
├── server_repo.rs
├── deployment_repo.rs
├── secret_repo.rs
└── ...

// Models map to database tables
models/
├── user.rs
├── workspace.rs
├── server.rs
└── ...
```

### mcp-proxy

MCP protocol proxy gateway.

```rust
// Key features
├── cache.rs      # Request coalescing + Redis caching
├── router.rs     # Request routing to MCP servers
├── metrics.rs    # Prometheus metrics
└── main.rs       # HTTP/WebSocket server
```

### mcp-builder

Build worker for CI/CD pipeline.

```rust
// Build pipeline
├── docker.rs     # Docker image building
├── flyio.rs      # Fly.io deployment
└── main.rs       # Job consumer (Apalis)
```

### mcp-queue

Job queue abstraction using Apalis + Redis.

```rust
// Job types
├── BuildJob      # Trigger container build
├── DeployJob     # Deploy to Fly.io
├── CleanupJob    # Resource cleanup
└── LogCleanupJob # Log retention
```

---

## Data Flow

### User Authentication Flow

```
┌────────┐    ┌─────────┐    ┌────────┐    ┌───────────┐
│ Browser│───▶│ Next.js │───▶│ GitHub │───▶│ MCP API   │
└────────┘    └─────────┘    └────────┘    └───────────┘
     │                                            │
     │  1. Click "Login with GitHub"              │
     │ ─────────────────────────────────────────▶ │
     │                                            │
     │  2. Redirect to GitHub OAuth               │
     │ ◀───────────────────────────────────────── │
     │                                            │
     │  3. User authorizes                        │
     │ ─────────────────────▶                     │
     │                                            │
     │  4. GitHub callback with code              │
     │ ◀─────────────────────                     │
     │                                            │
     │  5. Exchange code for user info            │
     │ ─────────────────────────────────────────▶ │
     │                                            │
     │  6. Create/update user, return JWT         │
     │ ◀───────────────────────────────────────── │
     │                                            │
     │  7. Set HttpOnly cookies                   │
     │ ◀───────────────────────────────────────── │
```

### Deployment Flow

```
┌────────┐    ┌─────────┐    ┌───────────┐    ┌─────────┐    ┌────────┐
│ User   │───▶│ API     │───▶│ Job Queue │───▶│ Builder │───▶│ Fly.io │
└────────┘    └─────────┘    └───────────┘    └─────────┘    └────────┘
     │              │               │               │              │
     │ 1. Deploy    │               │               │              │
     │ ───────────▶ │               │               │              │
     │              │               │               │              │
     │              │ 2. Enqueue    │               │              │
     │              │ BuildJob      │               │              │
     │              │ ─────────────▶│               │              │
     │              │               │               │              │
     │              │               │ 3. Consume    │              │
     │              │               │ ─────────────▶│              │
     │              │               │               │              │
     │              │               │               │ 4. Clone repo│
     │              │               │               │ Build Docker │
     │              │               │               │              │
     │              │               │               │ 5. Push image│
     │              │               │               │ ────────────▶│
     │              │               │               │              │
     │              │               │               │ 6. Create    │
     │              │               │               │    Machine   │
     │              │               │               │ ────────────▶│
     │              │               │               │              │
     │              │ 7. Update status via Redis pub/sub          │
     │ ◀─────────────────────────────────────────────────────────  │
```

### MCP Request Flow

```
┌────────────┐    ┌───────────┐    ┌─────────┐    ┌───────────┐
│ MCP Client │───▶│ MCP Proxy │───▶│  Cache  │───▶│ MCP Server│
└────────────┘    └───────────┘    └─────────┘    └───────────┘
       │                │               │               │
       │ 1. MCP Request │               │               │
       │ ──────────────▶│               │               │
       │                │               │               │
       │                │ 2. Check cache│               │
       │                │ ─────────────▶│               │
       │                │               │               │
       │                │ 3a. Cache hit │               │
       │ ◀──────────────────────────────│               │
       │                │               │               │
       │                │ 3b. Cache miss│               │
       │                │ ─────────────▶│ 4. Forward    │
       │                │               │ ─────────────▶│
       │                │               │               │
       │                │               │ 5. Response   │
       │                │ ◀─────────────────────────────│
       │                │               │               │
       │                │ 6. Cache response             │
       │                │ ─────────────▶│               │
       │                │               │               │
       │ 7. Return response             │               │
       │ ◀──────────────│               │               │
```

---

## Database Schema

### Core Entities

```
┌──────────────┐       ┌────────────────┐       ┌─────────────┐
│    users     │       │   workspaces   │       │ mcp_servers │
├──────────────┤       ├────────────────┤       ├─────────────┤
│ id (PK)      │       │ id (PK)        │       │ id (PK)     │
│ github_id    │◀──┐   │ name           │◀──┐   │ workspace_id│──▶
│ email        │   │   │ slug           │   │   │ name        │
│ name         │   │   │ plan           │   │   │ github_repo │
│ avatar_url   │   │   │ stripe_*       │   │   │ runtime     │
│ created_at   │   │   │ created_at     │   │   │ status      │
└──────────────┘   │   └────────────────┘   │   └─────────────┘
                   │                        │           │
          ┌────────┴────────┐               │           │
          │                 │               │           │
┌─────────┴─────┐  ┌────────┴───────┐       │   ┌───────┴──────┐
│workspace_     │  │  api_keys      │       │   │ deployments  │
│  members      │  ├────────────────┤       │   ├──────────────┤
├───────────────┤  │ id (PK)        │       │   │ id (PK)      │
│ workspace_id  │──│ workspace_id   │───────┘   │ server_id    │──▶
│ user_id       │──│ name           │           │ version      │
│ role          │  │ key_hash       │           │ commit_sha   │
│ joined_at     │  │ permissions    │           │ status       │
└───────────────┘  └────────────────┘           └──────────────┘
```

### Additional Tables

| Table | Purpose |
|-------|---------|
| `server_secrets` | Encrypted environment variables |
| `server_regions` | Multi-region deployment config |
| `refresh_tokens` | JWT refresh token hashes |
| `deploy_webhooks` | Deployment notification webhooks |
| `request_logs` | MCP request logging |
| `notification_settings` | User notification preferences |

---

## External Integrations

### GitHub

- **OAuth**: User authentication
- **GitHub App**: Repository access, webhooks
- **API**: Clone repos, read files

### Stripe

- **Checkout**: Subscription setup
- **Webhooks**: Payment events
- **Customer Portal**: Self-service billing

### Fly.io

- **Machines API**: Container deployment
- **Apps API**: Application management
- **WireGuard**: Private networking

### Resend

- **Transactional Email**: Notifications, invites

### Neon (PostgreSQL)

- **Serverless Postgres**: Primary database
- **Connection Pooling**: Efficient connections

### Upstash (Redis)

- **Caching**: API response cache
- **Job Queue**: Apalis backend
- **Pub/Sub**: Real-time events

---

## Scaling Strategy

### Horizontal Scaling

```
                    ┌─────────────────┐
                    │  Load Balancer  │
                    └────────┬────────┘
           ┌─────────────────┼─────────────────┐
           ▼                 ▼                 ▼
    ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
    │  API Pod 1  │   │  API Pod 2  │   │  API Pod N  │
    └─────────────┘   └─────────────┘   └─────────────┘
           │                 │                 │
           └─────────────────┼─────────────────┘
                             │
                    ┌────────┴────────┐
                    │ Redis (Upstash) │  ◀── Session/Cache sharing
                    └─────────────────┘
```

### Multi-Region Deployment

```
┌─────────────────────────────────────────────────────────────┐
│                        Global                                │
│  ┌───────────┐    ┌───────────┐    ┌───────────┐            │
│  │  Tokyo    │    │ Singapore │    │  US East  │            │
│  │   (nrt)   │    │   (sin)   │    │   (iad)   │            │
│  └───────────┘    └───────────┘    └───────────┘            │
│       │                │                │                    │
│       └────────────────┼────────────────┘                    │
│                        │                                     │
│              ┌─────────┴─────────┐                          │
│              │  Anycast Routing  │                          │
│              └───────────────────┘                          │
└─────────────────────────────────────────────────────────────┘
```

### Performance Optimizations

1. **Database**: Index optimization, connection pooling
2. **Caching**: Redis LRU cache, request coalescing
3. **CDN**: Static assets via Fly.io edge
4. **Async Processing**: Job queue for heavy tasks
