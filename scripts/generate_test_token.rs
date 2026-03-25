// Run with: cargo script scripts/generate_test_token.rs
// Or add as a binary target

use chrono::{Duration, Utc};
use jsonwebtoken::{encode, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub exp: i64,
    pub iat: i64,
    pub workspace_id: Option<String>,
}

fn main() {
    let jwt_secret = std::env::var("JWT_SECRET")
        .unwrap_or_else(|_| "v0UojD/ZlTFO0gAVFn5bZx/lNs0PqCMIul+yeRV1SM5OELoH818kWhnEfKI4Vkwyzsy6CSOvJzPCnALKYUfFkQ==".to_string());

    let user_id = std::env::var("USER_ID")
        .map(|s| Uuid::parse_str(&s).expect("Invalid USER_ID"))
        .unwrap_or_else(|_| Uuid::new_v4());

    let workspace_id = std::env::var("WORKSPACE_ID")
        .ok()
        .map(|s| Uuid::parse_str(&s).expect("Invalid WORKSPACE_ID"));

    let now = Utc::now();
    let exp = now + Duration::hours(24);

    let claims = Claims {
        sub: user_id.to_string(),
        exp: exp.timestamp(),
        iat: now.timestamp(),
        workspace_id: workspace_id.map(|id| id.to_string()),
    };

    let encoding_key = EncodingKey::from_secret(jwt_secret.as_bytes());
    let token = encode(&Header::default(), &claims, &encoding_key).expect("Failed to generate token");

    println!("Generated JWT Token:");
    println!("{}", token);
    println!();
    println!("User ID: {}", user_id);
    if let Some(wid) = workspace_id {
        println!("Workspace ID: {}", wid);
    }
    println!("Expires: {}", exp);
}
