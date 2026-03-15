use serde::{Deserialize, Serialize};
use thiserror::Error;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, Error)]
pub enum Error {
    #[error("Authentication required")]
    Unauthorized,

    #[error("Permission denied")]
    Forbidden,

    #[error("{0} not found")]
    NotFound(String),

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Rate limit exceeded")]
    RateLimitExceeded,

    #[error("Service unavailable: {0}")]
    ServiceUnavailable(String),

    #[error("Internal server error: {0}")]
    Internal(String),

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Redis error: {0}")]
    Redis(String),

    #[error("JWT error: {0}")]
    Jwt(#[from] jsonwebtoken::errors::Error),

    #[error("External service error: {0}")]
    ExternalService(String),

    #[error("Configuration error: {0}")]
    Config(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
}

impl Error {
    pub fn status_code(&self) -> u16 {
        match self {
            Error::Unauthorized => 401,
            Error::Forbidden => 403,
            Error::NotFound(_) => 404,
            Error::Conflict(_) => 409,
            Error::Validation(_) | Error::BadRequest(_) => 400,
            Error::RateLimitExceeded => 429,
            Error::ServiceUnavailable(_) => 503,
            _ => 500,
        }
    }

    pub fn error_code(&self) -> &'static str {
        match self {
            Error::Unauthorized => "UNAUTHORIZED",
            Error::Forbidden => "FORBIDDEN",
            Error::NotFound(_) => "NOT_FOUND",
            Error::Conflict(_) => "CONFLICT",
            Error::Validation(_) => "VALIDATION_ERROR",
            Error::BadRequest(_) => "BAD_REQUEST",
            Error::RateLimitExceeded => "RATE_LIMIT_EXCEEDED",
            Error::ServiceUnavailable(_) => "SERVICE_UNAVAILABLE",
            Error::Database(_) => "DATABASE_ERROR",
            Error::Redis(_) => "REDIS_ERROR",
            Error::Jwt(_) => "JWT_ERROR",
            Error::ExternalService(_) => "EXTERNAL_SERVICE_ERROR",
            Error::Config(_) => "CONFIG_ERROR",
            Error::Io(_) => "IO_ERROR",
            Error::Json(_) => "JSON_ERROR",
            Error::Internal(_) => "INTERNAL_ERROR",
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ErrorResponse {
    pub error: ErrorBody,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ErrorBody {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

impl From<&Error> for ErrorResponse {
    fn from(err: &Error) -> Self {
        Self {
            error: ErrorBody {
                code: err.error_code().to_string(),
                message: err.to_string(),
                details: None,
            },
        }
    }
}

impl From<fred::error::RedisError> for Error {
    fn from(err: fred::error::RedisError) -> Self {
        Error::Redis(err.to_string())
    }
}
