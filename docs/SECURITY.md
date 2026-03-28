# Security Documentation

This document outlines the security measures, best practices, and guidelines for Nodeflare.

## Table of Contents

- [Security Architecture](#security-architecture)
- [Authentication](#authentication)
- [Authorization](#authorization)
- [Data Protection](#data-protection)
- [API Security](#api-security)
- [Infrastructure Security](#infrastructure-security)
- [Security Checklist](#security-checklist)
- [Reporting Vulnerabilities](#reporting-vulnerabilities)

---

## Security Architecture

### Overview

Nodeflare implements a defense-in-depth security model with multiple layers:

```
┌─────────────────────────────────────────────────────────┐
│                    Client (Browser)                      │
├─────────────────────────────────────────────────────────┤
│                   HTTPS / TLS 1.3                        │
├─────────────────────────────────────────────────────────┤
│              Rate Limiting (Redis-based)                 │
├─────────────────────────────────────────────────────────┤
│           Authentication (JWT + Refresh Token)          │
├─────────────────────────────────────────────────────────┤
│              Authorization (RBAC per Workspace)          │
├─────────────────────────────────────────────────────────┤
│                 Input Validation (Axum)                  │
├─────────────────────────────────────────────────────────┤
│          Parameterized Queries (SQLx + PostgreSQL)       │
├─────────────────────────────────────────────────────────┤
│            Encryption at Rest (AES-256-GCM)              │
└─────────────────────────────────────────────────────────┘
```

---

## Authentication

### GitHub OAuth 2.0

- **Flow**: Authorization Code Grant with PKCE
- **CSRF Protection**: State parameter validated via Redis (one-time use)
- **Token Storage**: JWT in HttpOnly cookies

### JWT Tokens

| Token Type | Lifetime | Storage | Purpose |
|------------|----------|---------|---------|
| Access Token | 24 hours | HttpOnly Cookie | API authentication |
| Refresh Token | 30 days | HttpOnly Cookie + DB (hashed) | Token renewal |

### Cookie Security

```
access_token=<token>; HttpOnly; Secure; SameSite=Lax; Path=/
refresh_token=<token>; HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth/refresh
```

- **HttpOnly**: Prevents JavaScript access (XSS protection)
- **Secure**: HTTPS only (production)
- **SameSite=Lax**: CSRF protection while allowing OAuth redirects

### API Key Authentication

- **Format**: `nf_<random_32_bytes_base64>`
- **Storage**: SHA-256 hashed in database
- **Verification**: Constant-time comparison to prevent timing attacks

### Brute Force Protection

- Rate limiting per IP address
- Failed attempt tracking with exponential backoff
- Account lockout after repeated failures

---

## Authorization

### Role-Based Access Control (RBAC)

Each workspace has members with specific roles:

| Role | Permissions |
|------|------------|
| **Owner** | Full access, can delete workspace, transfer ownership |
| **Admin** | Manage members, servers, settings (cannot delete workspace) |
| **Member** | Create/manage own servers, view shared resources |
| **Viewer** | Read-only access to workspace resources |

### Resource Access Checks

All API endpoints verify:

1. **Authentication**: Valid JWT or API key
2. **Workspace Membership**: User belongs to the workspace
3. **Role Permission**: User role allows the action
4. **Resource Ownership**: Resource belongs to the workspace

```rust
// Example: Server ownership verification
let member = WorkspaceRepository::get_member(&db, workspace_id, user_id)?;
if server.workspace_id != workspace_id {
    return Err(StatusCode::NOT_FOUND);
}
if matches!(member.role(), WorkspaceRole::Viewer) {
    return Err(StatusCode::FORBIDDEN);
}
```

---

## Data Protection

### Encryption at Rest

- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key Management**: Environment variable (`ENCRYPTION_KEY`)
- **Protected Data**: Server secrets, API credentials

```rust
// Encryption implementation
let cipher = Aes256Gcm::new(key);
let nonce = SystemRandom::new().generate_nonce();
let ciphertext = cipher.encrypt(nonce, plaintext)?;
```

### Sensitive Data Handling

| Data Type | Storage | Protection |
|-----------|---------|------------|
| Passwords | N/A (OAuth only) | - |
| API Keys | PostgreSQL | SHA-256 hash |
| Server Secrets | PostgreSQL | AES-256-GCM encrypted |
| Refresh Tokens | PostgreSQL | SHA-256 hash |
| JWT Secret | Environment | Not stored in DB |

### Database Security

- **Connection**: TLS encrypted (Neon PostgreSQL)
- **Queries**: Parameterized (SQLx) - no SQL injection
- **Access**: Principle of least privilege

### Cryptographic Practices

- **Random Number Generation**: All cryptographic random values use `ring::rand::SystemRandom` (CSPRNG)
- **Token Generation**: API keys and refresh tokens use 32+ bytes of cryptographically secure random data
- **Key Derivation**: WireGuard keys use proper Curve25519 operations via `x25519-dalek`

```rust
// SECURITY: Cryptographically secure random generation
use ring::rand::{SecureRandom, SystemRandom};
let rng = SystemRandom::new();
let mut bytes = vec![0u8; 32];
rng.fill(&mut bytes).expect("SystemRandom failed");
```

---

## API Security

### Input Validation

All inputs are validated before processing:

```rust
// Example: Server name validation
if name.trim().is_empty() {
    return Err(BadRequest("Name cannot be empty"));
}
if name.len() > 100 {
    return Err(BadRequest("Name too long"));
}
```

### Rate Limiting

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| Authentication | 5 requests | 1 minute |
| API (authenticated) | 100 requests | 1 minute |
| Public | 30 requests | 1 minute |

### CORS Configuration

- Allowed origins: Configured via `FRONTEND_URL`
- Credentials: Allowed for authenticated requests
- Methods: GET, POST, PUT, DELETE, OPTIONS

### SSRF Protection

Webhook URLs are validated to prevent Server-Side Request Forgery:

```rust
// Blocked hosts
- localhost, 127.0.0.1, ::1
- 169.254.169.254 (AWS metadata)
- metadata.google.internal (GCP metadata)
- kubernetes.default
- Internal IP ranges (10.x, 172.16-31.x, 192.168.x)
```

### Error Handling

- Internal errors return generic messages to clients
- Detailed errors logged server-side only
- No stack traces exposed to users

### Stripe Integration Security

#### Webhook Security

- **Signature Verification**: All webhooks verified using Stripe signature
- **Idempotency**: Duplicate webhook events are detected and skipped
- **Server-side Price Resolution**: Price IDs determined server-side, never from client

```rust
// Webhook signature verification
Webhook::construct_event(payload, signature, &webhook_secret)
```

#### Double-Charge Prevention

1. **Checkout Creation**: Existing subscriptions are checked before creating new checkout
2. **Webhook Handling**: Subscription ID duplication is detected
3. **Region Billing**: DB record created before billing increment (with rollback on failure)

```rust
// Example: Idempotency check in webhook
if workspace.stripe_subscription_id.as_ref() == Some(&subscription_id) {
    // Skip duplicate webhook
    return Ok(());
}
```

#### Client Input Validation

- Plan names validated server-side (only `pro`, `team`, `enterprise` allowed)
- Price IDs resolved from environment variables, not client input
- Customer IDs validated against workspace ownership

```rust
// Server-side price resolution
fn get_price_id(plan: &str, yearly: bool) -> Option<String> {
    let env_key = match (plan, yearly) {
        ("pro", false) => "STRIPE_PRICE_PRO_MONTHLY",
        // ... never trust client-provided price_id
    };
    std::env::var(env_key).ok()
}
```

---

## Frontend Security

### Content Security Policy

All pages include strict CSP headers:

```
default-src 'self';
script-src 'self' 'unsafe-eval' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https: blob:;
connect-src 'self' <API_URL> wss://*.fly.dev;
frame-ancestors 'none';
form-action 'self';
```

### Security Headers

| Header | Value | Purpose |
|--------|-------|---------|
| X-Content-Type-Options | nosniff | Prevent MIME type sniffing |
| X-Frame-Options | DENY | Prevent clickjacking |
| X-XSS-Protection | 1; mode=block | XSS filter (legacy browsers) |
| Referrer-Policy | strict-origin-when-cross-origin | Limit referrer leakage |
| Permissions-Policy | camera=(), microphone=(), geolocation=() | Disable unnecessary APIs |

### XSS Prevention

- **DOMPurify**: Used to sanitize all HTML content from CMS
- **React Escaping**: JSX automatically escapes interpolated values
- **No localStorage Tokens**: Authentication uses HTTP-only cookies only

### WebSocket Security

- **Cookie Authentication**: WebSocket connections authenticate via HTTP-only cookies
- **WSS Protocol**: All WebSocket connections use secure WebSocket (wss://)
- **No Token in URL**: Tokens are never passed in WebSocket URL parameters

---

## Infrastructure Security

### Fly.io Deployment

- **HTTPS**: Enforced via `force_https = true`
- **TLS**: Automatic certificate management
- **Isolation**: Each server runs in isolated Fly Machine

### Environment Variables

**Required in Production:**

| Variable | Purpose |
|----------|---------|
| `ENCRYPTION_KEY` | AES-256 encryption key (32 bytes hex) |
| `JWT_SECRET` | JWT signing key (64 bytes base64) |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth secret |
| `STRIPE_SECRET_KEY` | Stripe API key |

**Generation Commands:**

```bash
# Generate ENCRYPTION_KEY
openssl rand -hex 32

# Generate JWT_SECRET
openssl rand -base64 64
```

### Secrets Management

- Never commit secrets to Git
- Use environment variables or secret management services
- Rotate keys periodically

---

## Security Checklist

### Before Deployment

- [ ] All environment variables set
- [ ] `ENCRYPTION_KEY` is unique and secure
- [ ] `JWT_SECRET` is unique and secure
- [ ] `.env` file is in `.gitignore`
- [ ] HTTPS is enforced
- [ ] Database connection uses TLS
- [ ] Rate limiting is enabled
- [ ] CORS origins are restricted

### Regular Maintenance

- [ ] Run `cargo audit` weekly
- [ ] Update dependencies monthly
- [ ] Review access logs for anomalies
- [ ] Rotate API keys periodically
- [ ] Review workspace member access

### Incident Response

1. **Detect**: Monitor logs and alerts
2. **Contain**: Disable compromised credentials
3. **Investigate**: Analyze logs and impact
4. **Remediate**: Fix vulnerability, rotate keys
5. **Document**: Record incident and lessons learned

---

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** create a public GitHub issue
2. Email security concerns to the maintainers
3. Include detailed reproduction steps
4. Allow reasonable time for a fix before disclosure

We appreciate responsible disclosure and will acknowledge contributors.

---

## Security Updates

| Date | Update |
|------|--------|
| 2024-03-29 | Initial security audit completed |
| 2024-03-29 | OWASP Top 10 compliance verified |
| 2024-03-29 | PII logging removed from auth flows |
| 2024-03-30 | Replaced rand::thread_rng() with cryptographically secure SystemRandom |
| 2024-03-30 | Added timeout and redirect policy to all HTTP clients |
| 2024-03-30 | Fixed unwrap() panics in cookie handling |
| 2024-03-30 | Added comprehensive input validation (length limits, slug format) |
| 2024-03-30 | Sanitized error responses to prevent token leakage |
| 2024-03-30 | Added Content Security Policy and security headers to frontend |
| 2024-03-30 | Fixed WebSocket authentication to use cookies instead of localStorage |
| 2024-03-30 | Added server ownership verification in tool routes |
| 2024-03-30 | Stripe billing race conditions fixed (DB before billing with rollback) |
