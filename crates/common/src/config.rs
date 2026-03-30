use serde::Deserialize;
use std::env;

#[derive(Debug, Clone, Deserialize, Default)]
pub struct AppConfig {
    pub environment: Environment,
    pub server: ServerConfig,
    pub database: DatabaseConfig,
    pub redis: RedisConfig,
    pub auth: AuthConfig,
    pub github: GithubConfig,
    pub flyio: FlyioConfig,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Environment {
    Development,
    Staging,
    Production,
}

impl Default for Environment {
    fn default() -> Self {
        Self::Development
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub proxy_port: u16,
    pub builder_port: u16,
    pub frontend_url: String,
    /// Base domain for proxy (e.g., "mcp.cloud" -> {slug}.mcp.cloud)
    pub proxy_base_domain: String,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            host: "0.0.0.0".to_string(),
            port: 8080,
            proxy_port: 8081,
            builder_port: 8082,
            frontend_url: "http://localhost:3000".to_string(),
            proxy_base_domain: "mcp.cloud".to_string(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct DatabaseConfig {
    pub url: String,
    pub max_connections: u32,
    pub min_connections: u32,
    /// Connection acquire timeout in seconds
    pub acquire_timeout_secs: u64,
    /// Idle connection timeout in seconds
    pub idle_timeout_secs: u64,
    /// Maximum lifetime of a connection in seconds (prevents stale connections)
    pub max_lifetime_secs: u64,
    /// Whether to test connections before acquiring from pool
    pub test_before_acquire: bool,
}

impl Default for DatabaseConfig {
    fn default() -> Self {
        Self {
            url: "postgres://postgres:postgres@localhost:5432/mcp_cloud".to_string(),
            // Increased defaults for better scalability
            max_connections: 20,
            min_connections: 5,
            acquire_timeout_secs: 30,
            idle_timeout_secs: 600,
            // Max 30 minutes lifetime to prevent stale connections
            max_lifetime_secs: 1800,
            // Test connections in production for reliability
            test_before_acquire: true,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct RedisConfig {
    pub url: String,
}

impl Default for RedisConfig {
    fn default() -> Self {
        Self {
            url: "redis://localhost:6379".to_string(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct AuthConfig {
    pub jwt_secret: String,
    pub jwt_expiration_hours: i64,
    pub refresh_token_expiration_days: i64,
}

impl Default for AuthConfig {
    fn default() -> Self {
        Self {
            jwt_secret: String::new(), // Must be set via environment variable
            jwt_expiration_hours: 24,
            refresh_token_expiration_days: 30,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct GithubConfig {
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
    pub app_id: String,
    pub app_private_key: String,
    pub webhook_secret: String,
}

impl Default for GithubConfig {
    fn default() -> Self {
        Self {
            client_id: String::new(),
            client_secret: String::new(),
            redirect_uri: String::new(),
            app_id: String::new(),
            app_private_key: String::new(),
            webhook_secret: String::new(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct FlyioConfig {
    pub api_token: String,
    pub org_slug: String,
    pub region: String,
}

impl Default for FlyioConfig {
    fn default() -> Self {
        Self {
            api_token: String::new(),
            org_slug: "personal".to_string(),
            region: "nrt".to_string(), // Tokyo
        }
    }
}

impl AppConfig {
    pub fn from_env() -> anyhow::Result<Self> {
        dotenvy::dotenv().ok();

        let environment = env::var("ENVIRONMENT")
            .unwrap_or_else(|_| "development".to_string())
            .parse()
            .unwrap_or(Environment::Development);

        Ok(Self {
            environment,
            server: ServerConfig {
                host: env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
                port: env::var("PORT")
                    .unwrap_or_else(|_| "8080".to_string())
                    .parse()?,
                proxy_port: env::var("PROXY_PORT")
                    .unwrap_or_else(|_| "8081".to_string())
                    .parse()?,
                builder_port: env::var("BUILDER_PORT")
                    .unwrap_or_else(|_| "8082".to_string())
                    .parse()?,
                frontend_url: env::var("FRONTEND_URL")
                    .unwrap_or_else(|_| "http://localhost:3000".to_string()),
                proxy_base_domain: env::var("PROXY_BASE_DOMAIN")
                    .unwrap_or_else(|_| "mcp.cloud".to_string()),
            },
            database: DatabaseConfig {
                url: env::var("DATABASE_URL")
                    .unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5432/mcp_cloud".to_string()),
                max_connections: env::var("DATABASE_MAX_CONNECTIONS")
                    .unwrap_or_else(|_| "20".to_string())
                    .parse()?,
                min_connections: env::var("DATABASE_MIN_CONNECTIONS")
                    .unwrap_or_else(|_| "5".to_string())
                    .parse()?,
                acquire_timeout_secs: env::var("DATABASE_ACQUIRE_TIMEOUT_SECS")
                    .unwrap_or_else(|_| "30".to_string())
                    .parse()?,
                idle_timeout_secs: env::var("DATABASE_IDLE_TIMEOUT_SECS")
                    .unwrap_or_else(|_| "600".to_string())
                    .parse()?,
                max_lifetime_secs: env::var("DATABASE_MAX_LIFETIME_SECS")
                    .unwrap_or_else(|_| "1800".to_string())
                    .parse()?,
                test_before_acquire: env::var("DATABASE_TEST_BEFORE_ACQUIRE")
                    .map(|v| v == "true" || v == "1")
                    .unwrap_or(true),
            },
            redis: RedisConfig {
                url: env::var("REDIS_URL")
                    .unwrap_or_else(|_| "redis://localhost:6379".to_string()),
            },
            auth: AuthConfig {
                jwt_secret: {
                    let secret = env::var("JWT_SECRET")
                        .map_err(|_| anyhow::anyhow!("JWT_SECRET environment variable is required"))?;
                    // Minimum 32 characters for security (256 bits)
                    if secret.len() < 32 {
                        return Err(anyhow::anyhow!(
                            "JWT_SECRET must be at least 32 characters long for security. Current length: {}",
                            secret.len()
                        ));
                    }
                    secret
                },
                jwt_expiration_hours: env::var("JWT_EXPIRATION_HOURS")
                    .unwrap_or_else(|_| "24".to_string())
                    .parse()?,
                refresh_token_expiration_days: env::var("REFRESH_TOKEN_EXPIRATION_DAYS")
                    .unwrap_or_else(|_| "30".to_string())
                    .parse()?,
            },
            github: GithubConfig {
                client_id: env::var("GITHUB_CLIENT_ID").unwrap_or_default(),
                client_secret: env::var("GITHUB_CLIENT_SECRET").unwrap_or_default(),
                redirect_uri: env::var("GITHUB_REDIRECT_URI").unwrap_or_default(),
                app_id: env::var("GITHUB_APP_ID").unwrap_or_default(),
                app_private_key: env::var("GITHUB_APP_PRIVATE_KEY").unwrap_or_default(),
                webhook_secret: env::var("GITHUB_WEBHOOK_SECRET").unwrap_or_default(),
            },
            flyio: FlyioConfig {
                api_token: env::var("FLY_API_TOKEN").unwrap_or_default(),
                org_slug: env::var("FLY_ORG_SLUG").unwrap_or_else(|_| "personal".to_string()),
                region: env::var("FLY_REGION").unwrap_or_else(|_| "nrt".to_string()),
            },
        })
    }

    pub fn is_production(&self) -> bool {
        self.environment == Environment::Production
    }
}

impl std::str::FromStr for Environment {
    type Err = String;

    fn from_str(s: &str) -> std::result::Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "development" | "dev" => Ok(Self::Development),
            "staging" | "stg" => Ok(Self::Staging),
            "production" | "prod" => Ok(Self::Production),
            _ => Err(format!("Unknown environment: {}", s)),
        }
    }
}
