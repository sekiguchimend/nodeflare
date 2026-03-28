# Contributing Guide

Thank you for your interest in contributing to Nodeflare! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Code Style](#code-style)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing](#testing)
- [Documentation](#documentation)

---

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on the code, not the person
- Help others learn and grow

---

## Getting Started

### Prerequisites

- **Rust** 1.75+ (install via [rustup](https://rustup.rs))
- **Node.js** 20+ (install via [nvm](https://github.com/nvm-sh/nvm))
- **Docker** & Docker Compose
- **PostgreSQL** client (for migrations)

### Setup Development Environment

```bash
# Clone the repository
git clone https://github.com/your-org/nodeflare.git
cd nodeflare

# Copy environment file
cp .env.example .env

# Start infrastructure (PostgreSQL, Redis)
docker-compose up -d

# Run database migrations
sqlx migrate run

# Install frontend dependencies
cd apps/web && npm install && cd ../..

# Build Rust crates
cargo build
```

### Running Locally

```bash
# Terminal 1: API Server
cargo run -p mcp-api

# Terminal 2: Proxy Server
cargo run -p mcp-proxy

# Terminal 3: Builder (optional)
cargo run -p mcp-builder

# Terminal 4: Frontend
cd apps/web && npm run dev
```

---

## Development Workflow

### 1. Create a Branch

```bash
# Update main
git checkout main
git pull origin main

# Create feature branch
git checkout -b feature/your-feature-name

# Or for bug fixes
git checkout -b fix/bug-description
```

### Branch Naming Convention

| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feature/description` | `feature/add-webhook-retries` |
| Bug Fix | `fix/description` | `fix/auth-cookie-domain` |
| Docs | `docs/description` | `docs/update-api-reference` |
| Refactor | `refactor/description` | `refactor/extract-auth-middleware` |

### 2. Make Changes

- Write code following the [Code Style](#code-style) guidelines
- Add tests for new functionality
- Update documentation if needed

### 3. Test Your Changes

```bash
# Run Rust tests
cargo test

# Run Rust lints
cargo clippy -- -D warnings

# Check formatting
cargo fmt -- --check

# Run frontend tests (if applicable)
cd apps/web && npm run type-check && npm run lint
```

### 4. Commit Your Changes

Follow the [Commit Guidelines](#commit-guidelines).

### 5. Push and Create PR

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

---

## Code Style

### Rust

We follow the standard Rust style with some additions:

```rust
// Use descriptive names
fn verify_workspace_membership(db: &DbPool, workspace_id: Uuid, user_id: Uuid) -> Result<Member>

// Document public functions
/// Verifies that a user is a member of the specified workspace.
///
/// # Arguments
/// * `db` - Database connection pool
/// * `workspace_id` - The workspace to check
/// * `user_id` - The user to verify
///
/// # Returns
/// The member record if found, or an error if not a member.
pub async fn verify_workspace_membership(...) -> Result<Member> {
    // Implementation
}

// Group imports
use std::sync::Arc;

use axum::{extract::State, http::StatusCode};
use uuid::Uuid;

use crate::extractors::AuthUser;
use crate::state::AppState;

// Error handling - use ? operator
let user = UserRepository::find_by_id(&db, user_id)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((StatusCode::NOT_FOUND, "User not found".to_string()))?;

// Security comments for sensitive operations
// SECURITY: Verify ownership before allowing access
if server.workspace_id != workspace_id {
    return Err((StatusCode::FORBIDDEN, "Access denied".to_string()));
}
```

### TypeScript/React

```typescript
// Use TypeScript strict mode
// Prefer interfaces over types for objects
interface ServerResponse {
  id: string;
  name: string;
  status: ServerStatus;
}

// Use functional components with hooks
export function ServerCard({ server }: { server: ServerResponse }) {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <div className="rounded-lg border p-4">
      <h3>{server.name}</h3>
      <StatusBadge status={server.status} />
    </div>
  );
}

// Use React Query for data fetching
const { data, isLoading } = useQuery({
  queryKey: ['servers', workspaceId],
  queryFn: () => api.servers.list(workspaceId),
});
```

### Formatting

```bash
# Rust
cargo fmt

# TypeScript
npm run lint -- --fix
```

---

## Commit Guidelines

We use [Conventional Commits](https://www.conventionalcommits.org/).

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no code change |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `chore` | Maintenance tasks |

### Scopes

| Scope | Description |
|-------|-------------|
| `api` | API server changes |
| `proxy` | Proxy server changes |
| `web` | Frontend changes |
| `auth` | Authentication changes |
| `db` | Database changes |
| `billing` | Billing/Stripe changes |
| `docs` | Documentation changes |

### Examples

```bash
# Feature
feat(api): add webhook retry mechanism

# Bug fix
fix(auth): correct cookie domain for production

# Documentation
docs(api): add OpenAPI annotations to server routes

# Breaking change
feat(api)!: change server status enum values

BREAKING CHANGE: Server status values have changed from
uppercase to lowercase. Update client code accordingly.
```

---

## Pull Request Process

### Before Submitting

- [ ] Tests pass locally (`cargo test`)
- [ ] Lints pass (`cargo clippy`, `npm run lint`)
- [ ] Formatting is correct (`cargo fmt`, `npm run lint`)
- [ ] Documentation is updated (if applicable)
- [ ] Commit messages follow guidelines

### PR Template

```markdown
## Description
Brief description of changes.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
How did you test these changes?

## Checklist
- [ ] Tests pass
- [ ] Lints pass
- [ ] Documentation updated
- [ ] No security vulnerabilities introduced
```

### Review Process

1. **Automated Checks**: CI runs tests and lints
2. **Code Review**: At least one maintainer reviews
3. **Feedback**: Address any requested changes
4. **Approval**: Maintainer approves
5. **Merge**: Squash and merge to main

### After Merge

- Delete your feature branch
- Pull latest main
- Celebrate!

---

## Testing

### Rust Tests

```bash
# Run all tests
cargo test

# Run specific crate tests
cargo test -p mcp-api

# Run with output
cargo test -- --nocapture

# Run specific test
cargo test test_jwt_generation
```

### Integration Tests

```bash
# Start local services
docker-compose up -d
cargo run -p mcp-api &

# Run API tests
./scripts/test_all_api.sh http://localhost:8080
```

### Frontend Tests

```bash
cd apps/web

# Type checking
npm run type-check

# Linting
npm run lint

# Unit tests (when added)
npm test
```

### Writing Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_api_key_generation() {
        let key = ApiKey::generate("test-key");
        assert!(key.value.starts_with("nf_"));
        assert_eq!(key.value.len(), 43); // nf_ + 40 chars
    }

    #[tokio::test]
    async fn test_user_creation() {
        let pool = setup_test_db().await;
        let user = UserRepository::create(&pool, CreateUser {
            github_id: 12345,
            email: "test@example.com".to_string(),
            name: "Test User".to_string(),
        }).await.unwrap();

        assert_eq!(user.email, "test@example.com");
    }
}
```

---

## Documentation

### Code Documentation

```rust
//! Module-level documentation explaining the purpose
//! and usage of this module.

/// Function documentation with examples.
///
/// # Arguments
/// * `param` - Description of the parameter
///
/// # Returns
/// Description of what is returned.
///
/// # Errors
/// Conditions under which errors are returned.
///
/// # Examples
/// ```
/// let result = my_function(param);
/// assert!(result.is_ok());
/// ```
pub fn my_function(param: &str) -> Result<()> {
    // ...
}
```

### API Documentation

- Add OpenAPI annotations using `utoipa`
- Update `openapi.rs` for new endpoints
- Include request/response examples

### User Documentation

- Update README.md for major features
- Add to docs/ for detailed guides
- Include screenshots for UI changes

---

## Questions?

- Open a GitHub Issue for bugs or features
- Start a Discussion for questions
- Check existing issues before creating new ones

Thank you for contributing!
