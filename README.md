# MCP Cloud

Deploy, manage, and scale MCP servers - Vercel for MCP.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         MCP Cloud                                │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Next.js   │  │  API Server │  │     Proxy Gateway       │  │
│  │  Frontend   │──│   (Axum)    │──│   (Rate Limit, Auth)    │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│         │                │                      │                │
│         │                │                      │                │
│  ┌──────┴────────────────┴──────────────────────┴──────────┐    │
│  │                    PostgreSQL + Redis                     │    │
│  └──────────────────────────────────────────────────────────┘    │
│         │                                                        │
│  ┌──────┴──────┐                                                │
│  │   Builder   │────────────────────────────────────────────────┤
│  │   Worker    │         Build & Deploy                         │
│  └─────────────┘                                                │
│         │                                                        │
│  ┌──────┴──────────────────────────────────────────────────┐    │
│  │              Fly.io Machines (Container Runtime)          │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐     │    │
│  │  │ MCP Srv │  │ MCP Srv │  │ MCP Srv │  │ MCP Srv │     │    │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘     │    │
│  └──────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Tech Stack

- **Backend**: Rust (axum, sqlx, tokio)
- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Database**: [Neon](https://neon.tech) (Serverless PostgreSQL)
- **Cache/Queue**: [Upstash](https://upstash.com) (Serverless Redis)
- **Container Runtime**: Fly.io Machines
- **Job Queue**: Apalis (Upstash Redis-backed)

## Project Structure

```
mcp-cloud/
├── crates/
│   ├── common/         # Shared types, config, errors
│   ├── db/             # Database models & migrations
│   ├── auth/           # JWT, OAuth, API keys, encryption
│   ├── api/            # Main API server (axum)
│   ├── proxy/          # MCP Proxy Gateway
│   ├── builder/        # Build worker (Docker, Fly.io)
│   ├── queue/          # Job definitions
│   ├── github/         # GitHub App integration
│   ├── container/      # Container runtime abstraction
│   └── mcp-runtime/    # MCP protocol types
├── apps/
│   └── web/            # Next.js frontend
├── migrations/         # Database migrations
└── docker/             # Dockerfiles
```

## Getting Started

### Prerequisites

- Rust 1.75+
- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 15+
- Redis 7+

### Local Development

1. **Clone and setup**

```bash
git clone https://github.com/your-org/mcp-cloud.git
cd mcp-cloud
cp .env.example .env
```

2. **Setup Neon (PostgreSQL)**

- Create account at [neon.tech](https://neon.tech)
- Create a new project
- Copy the connection string to `.env`:
  ```
  DATABASE_URL=postgres://user:pass@ep-xxx.region.aws.neon.tech/mcp_cloud?sslmode=require
  ```

3. **Setup Upstash (Redis)**

- Create account at [upstash.com](https://upstash.com)
- Create a new Redis database
- Copy the connection string to `.env`:
  ```
  REDIS_URL=rediss://default:xxx@xxx.upstash.io:6379
  ```

4. **Configure other environment variables**

Edit `.env` with your GitHub OAuth, Fly.io, and encryption keys (see Configuration section below).

5. **Run database migrations**

```bash
cargo install sqlx-cli
sqlx migrate run
```

6. **Start backend services**

```bash
# Terminal 1: API Server
cargo run --bin mcp-api

# Terminal 2: Proxy Gateway
cargo run --bin mcp-proxy

# Terminal 3: Builder Worker
cargo run --bin mcp-builder
```

7. **Start frontend**

```bash
cd apps/web
npm install
npm run dev
```

8. **Open browser**

Navigate to http://localhost:3000

## Configuration

### Required Settings

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Secret for JWT signing (64+ bytes) |
| `ENCRYPTION_KEY` | AES-256 key for secret encryption (32 bytes, base64) |
| `GITHUB_CLIENT_ID` | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret |
| `GITHUB_APP_ID` | GitHub App ID for repo access |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App private key (PEM format) |
| `FLY_API_TOKEN` | Fly.io API token for deployments |
| `PROXY_BASE_DOMAIN` | Base domain for subdomain routing (e.g., `mcp.cloud`) |

### Generating Keys

```bash
# JWT Secret
openssl rand -base64 64

# Encryption Key
openssl rand -base64 32
```

## Deployment

### Using Docker Compose (Development)

```bash
docker-compose up -d
```

### Production (Fly.io)

```bash
# Deploy API
fly deploy -c fly.api.toml

# Deploy Proxy
fly deploy -c fly.proxy.toml

# Deploy Web
fly deploy -c fly.web.toml
```

## API Endpoints

### Authentication
- `GET /api/v1/auth/github` - Initiate GitHub OAuth
- `GET /api/v1/auth/github/callback` - OAuth callback
- `GET /api/v1/auth/me` - Get current user
- `POST /api/v1/auth/logout` - Logout

### Servers
- `GET /api/v1/servers` - List servers
- `POST /api/v1/servers` - Create server
- `GET /api/v1/servers/:id` - Get server
- `PATCH /api/v1/servers/:id` - Update server
- `DELETE /api/v1/servers/:id` - Delete server
- `POST /api/v1/servers/:id/deploy` - Trigger deployment

### Tools
- `GET /api/v1/servers/:id/tools` - List tools
- `PATCH /api/v1/servers/:id/tools/:tool_id` - Update tool

### API Keys
- `GET /api/v1/api-keys` - List API keys
- `POST /api/v1/api-keys` - Create API key
- `DELETE /api/v1/api-keys/:id` - Delete API key

### Secrets
- `GET /api/v1/servers/:id/secrets` - List secrets
- `POST /api/v1/servers/:id/secrets` - Create secret
- `DELETE /api/v1/servers/:id/secrets/:secret_id` - Delete secret

## MCP Proxy

The proxy gateway handles all MCP requests using **subdomain-based routing**:

```
POST https://{server-slug}.mcp.cloud/mcp
Authorization: Bearer {api-key}
```

For example, if your server slug is `my-notion-mcp`:
```
https://my-notion-mcp.mcp.cloud/mcp
```

Features:
- **Subdomain-based routing** - Clean URLs like Vercel (`my-app.vercel.app`)
- API key authentication
- Rate limiting (sliding window)
- Request logging
- Tool-level permissions

### DNS & SSL Configuration (Production)

For subdomain routing to work in production, you need:

1. **Wildcard DNS record**: `*.mcp.cloud -> proxy server IP`
2. **Wildcard SSL certificate**: `*.mcp.cloud` (use Let's Encrypt with DNS challenge)

## License

MIT
#   n o d e f l a r e  
 