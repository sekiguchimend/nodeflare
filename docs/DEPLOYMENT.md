# Deployment Guide

This guide covers deploying Nodeflare to production using Fly.io.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Database Setup](#database-setup)
- [Deploying Services](#deploying-services)
- [Post-Deployment](#post-deployment)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)
- [Rollback Procedures](#rollback-procedures)

---

## Prerequisites

### Required Accounts

1. **Fly.io** - Container hosting ([fly.io](https://fly.io))
2. **Neon** - PostgreSQL database ([neon.tech](https://neon.tech))
3. **Upstash** - Redis ([upstash.com](https://upstash.com))
4. **GitHub** - OAuth App & GitHub App
5. **Stripe** - Billing (optional)
6. **Resend** - Email service (optional)

### Required Tools

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Verify installation
fly version

# Login to Fly.io
fly auth login
```

---

## Environment Setup

### 1. Generate Secrets

```bash
# Generate encryption key (32 bytes hex)
export ENCRYPTION_KEY=$(openssl rand -hex 32)
echo "ENCRYPTION_KEY=$ENCRYPTION_KEY"

# Generate JWT secret (64 bytes base64)
export JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')
echo "JWT_SECRET=$JWT_SECRET"
```

### 2. Create Fly.io Apps

```bash
# Create apps (run from project root)
fly apps create nodeflare-api
fly apps create nodeflare-proxy
fly apps create nodeflare-web
```

### 3. Set Secrets

```bash
# API Server secrets
fly secrets set -a nodeflare-api \
  DATABASE_URL="postgresql://user:pass@host/db?sslmode=require" \
  REDIS_URL="rediss://default:token@host:6379" \
  JWT_SECRET="$JWT_SECRET" \
  ENCRYPTION_KEY="$ENCRYPTION_KEY" \
  GITHUB_CLIENT_ID="your-client-id" \
  GITHUB_CLIENT_SECRET="your-client-secret" \
  GITHUB_APP_ID="your-app-id" \
  GITHUB_APP_PRIVATE_KEY="$(cat private-key.pem)" \
  STRIPE_SECRET_KEY="sk_live_..." \
  STRIPE_WEBHOOK_SECRET="whsec_..." \
  RESEND_API_KEY="re_..." \
  FLY_API_TOKEN="your-fly-token" \
  FLY_ORG="your-org" \
  ENVIRONMENT="production"

# Proxy secrets
fly secrets set -a nodeflare-proxy \
  DATABASE_URL="postgresql://user:pass@host/db?sslmode=require" \
  REDIS_URL="rediss://default:token@host:6379"

# Web secrets
fly secrets set -a nodeflare-web \
  NEXT_PUBLIC_API_URL="https://api.nodeflare.dev"
```

---

## Database Setup

### 1. Create Neon Project

1. Go to [Neon Console](https://console.neon.tech)
2. Create new project
3. Copy connection string

### 2. Run Migrations

```bash
# Set DATABASE_URL
export DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"

# Run migrations
sqlx migrate run

# Verify
sqlx migrate info
```

### 3. Create Indexes (Performance)

Migrations include performance indexes, but verify:

```sql
-- Check indexes exist
SELECT indexname FROM pg_indexes
WHERE tablename IN ('mcp_servers', 'deployments', 'request_logs');
```

---

## Deploying Services

### Deploy Order

1. **Database migrations** (first)
2. **API Server** (depends on DB)
3. **Proxy** (depends on DB, Redis)
4. **Web Frontend** (depends on API)

### 1. Deploy API Server

```bash
# From project root
fly deploy -a nodeflare-api -c fly.api.toml

# Verify deployment
fly status -a nodeflare-api
fly logs -a nodeflare-api
```

**fly.api.toml configuration:**

```toml
app = "nodeflare-api"
primary_region = "nrt"

[build]
dockerfile = "docker/Dockerfile.api"

[http_service]
internal_port = 8080
force_https = true
auto_stop_machines = false
auto_start_machines = true
min_machines_running = 1

[[vm]]
cpu_kind = "shared"
cpus = 1
memory_mb = 512
```

### 2. Deploy Proxy

```bash
fly deploy -a nodeflare-proxy -c fly.proxy.toml

# Verify
fly status -a nodeflare-proxy
```

### 3. Deploy Web Frontend

```bash
fly deploy -a nodeflare-web -c fly.web.toml

# Verify
fly status -a nodeflare-web
```

### 4. Configure Custom Domains

```bash
# Add custom domain
fly certs create -a nodeflare-api api.nodeflare.dev
fly certs create -a nodeflare-web nodeflare.dev

# Verify certificates
fly certs list -a nodeflare-api
```

---

## Post-Deployment

### 1. Verify Health Checks

```bash
# API health
curl https://api.nodeflare.dev/health

# Expected response
{"status":"ok","version":"0.1.0"}
```

### 2. Configure GitHub OAuth

1. Go to GitHub Developer Settings
2. Update OAuth App callback URL:
   ```
   https://api.nodeflare.dev/api/v1/auth/github/callback
   ```

### 3. Configure Stripe Webhooks

1. Go to Stripe Dashboard > Webhooks
2. Add endpoint: `https://api.nodeflare.dev/api/v1/stripe/webhook`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`

### 4. Test Deployment

```bash
# Run API tests
./scripts/test_all_api.sh https://api.nodeflare.dev

# Check logs for errors
fly logs -a nodeflare-api --no-tail | grep -i error
```

---

## Monitoring

### Fly.io Dashboard

- **Metrics**: CPU, memory, network
- **Logs**: Real-time log streaming
- **Alerts**: Configure uptime alerts

### Log Monitoring

```bash
# Stream logs
fly logs -a nodeflare-api

# Filter errors
fly logs -a nodeflare-api | grep -E "(ERROR|WARN)"
```

### Health Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/health` | Basic health check |
| `/metrics` | Prometheus metrics |

### Recommended Alerts

1. **Uptime**: Alert if health check fails
2. **Error Rate**: Alert if error rate > 1%
3. **Latency**: Alert if p99 > 2s
4. **Memory**: Alert if > 80% usage

---

## Troubleshooting

### Common Issues

#### 1. Database Connection Failed

```
Error: connection refused
```

**Solution:**
- Check `DATABASE_URL` is correct
- Verify Neon project is active
- Check IP allowlist (if configured)

#### 2. Redis Connection Failed

```
Error: NOAUTH Authentication required
```

**Solution:**
- Verify `REDIS_URL` includes password
- Use `rediss://` for TLS connections

#### 3. GitHub OAuth Failed

```
Error: redirect_uri_mismatch
```

**Solution:**
- Update callback URL in GitHub OAuth settings
- Ensure `FRONTEND_URL` matches

#### 4. Stripe Webhook Failed

```
Error: No signatures found matching the expected signature
```

**Solution:**
- Verify `STRIPE_WEBHOOK_SECRET` is correct
- Use the webhook-specific secret, not API key

### Debug Commands

```bash
# SSH into running machine
fly ssh console -a nodeflare-api

# Check environment variables
fly ssh console -a nodeflare-api -C "env | grep -E '(DATABASE|REDIS)'"

# Check disk usage
fly ssh console -a nodeflare-api -C "df -h"

# View running processes
fly ssh console -a nodeflare-api -C "ps aux"
```

---

## Rollback Procedures

### Quick Rollback

```bash
# List recent deployments
fly releases -a nodeflare-api

# Rollback to previous version
fly deploy -a nodeflare-api --image registry.fly.io/nodeflare-api:v123
```

### Database Rollback

```bash
# List migrations
sqlx migrate info

# Revert last migration (if supported)
sqlx migrate revert

# Manual rollback
psql $DATABASE_URL -f migrations/rollback/20240329.sql
```

### Blue-Green Deployment

```bash
# Deploy to staging first
fly deploy -a nodeflare-api-staging

# Run tests
./scripts/test_all_api.sh https://api-staging.nodeflare.dev

# If successful, deploy to production
fly deploy -a nodeflare-api
```

---

## Multi-Region Deployment

### Add Regions

```bash
# Add Tokyo region (primary)
fly regions add nrt -a nodeflare-api

# Add Singapore region
fly regions add sin -a nodeflare-api

# Add US East region
fly regions add iad -a nodeflare-api

# Verify regions
fly regions list -a nodeflare-api
```

### Scale Machines

```bash
# Scale to 2 machines per region
fly scale count 2 -a nodeflare-api

# Verify scaling
fly status -a nodeflare-api
```

---

## Maintenance

### Regular Tasks

| Task | Frequency | Command |
|------|-----------|---------|
| Update dependencies | Weekly | `cargo update && npm update` |
| Security audit | Weekly | `cargo audit` |
| Database vacuum | Monthly | `VACUUM ANALYZE;` |
| Log cleanup | Monthly | Via LogCleanupJob |
| SSL cert renewal | Automatic | Managed by Fly.io |

### Updating Deployment

```bash
# Pull latest code
git pull origin main

# Run tests locally
cargo test
npm test

# Deploy
fly deploy -a nodeflare-api
fly deploy -a nodeflare-proxy
fly deploy -a nodeflare-web
```
