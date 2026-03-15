//! GitHub App integration for MCP Cloud
//!
//! Handles:
//! - GitHub App authentication (JWT)
//! - Installation access tokens
//! - Repository operations (clone, get commit info)
//! - Webhook verification

use anyhow::{Context, Result};
use chrono::{Duration, Utc};
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use mcp_common::AppConfig;
use serde::{Deserialize, Serialize};

const GITHUB_API_URL: &str = "https://api.github.com";

#[derive(Clone)]
pub struct GitHubApp {
    app_id: String,
    private_key: EncodingKey,
    http_client: reqwest::Client,
}

#[derive(Debug, Serialize)]
struct AppJwtClaims {
    iat: i64,
    exp: i64,
    iss: String,
}

#[derive(Debug, Deserialize)]
pub struct InstallationToken {
    pub token: String,
    pub expires_at: String,
}

#[derive(Debug, Deserialize)]
pub struct Repository {
    pub id: i64,
    pub name: String,
    pub full_name: String,
    pub default_branch: String,
    pub clone_url: String,
}

#[derive(Debug, Deserialize)]
pub struct Commit {
    pub sha: String,
    pub message: Option<String>,
}

impl GitHubApp {
    pub fn new(config: &AppConfig) -> Result<Self> {
        let private_key = EncodingKey::from_rsa_pem(config.github.app_private_key.as_bytes())
            .context("Invalid GitHub App private key")?;

        let http_client = reqwest::Client::builder()
            .user_agent("MCP-Cloud/1.0")
            .build()?;

        Ok(Self {
            app_id: config.github.app_id.clone(),
            private_key,
            http_client,
        })
    }

    fn generate_jwt(&self) -> Result<String> {
        let now = Utc::now();
        let claims = AppJwtClaims {
            iat: (now - Duration::seconds(60)).timestamp(),
            exp: (now + Duration::minutes(10)).timestamp(),
            iss: self.app_id.clone(),
        };

        let header = Header::new(Algorithm::RS256);
        encode(&header, &claims, &self.private_key).context("Failed to generate JWT")
    }

    pub async fn get_installation_token(&self, installation_id: i64) -> Result<InstallationToken> {
        let jwt = self.generate_jwt()?;

        let response = self
            .http_client
            .post(format!(
                "{}/app/installations/{}/access_tokens",
                GITHUB_API_URL, installation_id
            ))
            .header("Authorization", format!("Bearer {}", jwt))
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .context("Failed to get installation token")?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            anyhow::bail!("GitHub API error: {} - {}", status, body);
        }

        response.json().await.context("Failed to parse response")
    }

    pub async fn get_repository(
        &self,
        installation_id: i64,
        owner: &str,
        repo: &str,
    ) -> Result<Repository> {
        let token = self.get_installation_token(installation_id).await?;

        let response = self
            .http_client
            .get(format!("{}/repos/{}/{}", GITHUB_API_URL, owner, repo))
            .header("Authorization", format!("Bearer {}", token.token))
            .header("Accept", "application/vnd.github+json")
            .send()
            .await?;

        if !response.status().is_success() {
            anyhow::bail!("Failed to get repository");
        }

        response.json().await.context("Failed to parse repository")
    }

    pub async fn get_latest_commit(
        &self,
        installation_id: i64,
        owner: &str,
        repo: &str,
        branch: &str,
    ) -> Result<Commit> {
        let token = self.get_installation_token(installation_id).await?;

        let response = self
            .http_client
            .get(format!(
                "{}/repos/{}/{}/commits/{}",
                GITHUB_API_URL, owner, repo, branch
            ))
            .header("Authorization", format!("Bearer {}", token.token))
            .header("Accept", "application/vnd.github+json")
            .send()
            .await?;

        if !response.status().is_success() {
            anyhow::bail!("Failed to get commit");
        }

        response.json().await.context("Failed to parse commit")
    }

    pub async fn download_tarball(
        &self,
        installation_id: i64,
        owner: &str,
        repo: &str,
        ref_name: &str,
    ) -> Result<Vec<u8>> {
        let token = self.get_installation_token(installation_id).await?;

        let response = self
            .http_client
            .get(format!(
                "{}/repos/{}/{}/tarball/{}",
                GITHUB_API_URL, owner, repo, ref_name
            ))
            .header("Authorization", format!("Bearer {}", token.token))
            .send()
            .await?;

        if !response.status().is_success() {
            anyhow::bail!("Failed to download tarball");
        }

        response
            .bytes()
            .await
            .map(|b| b.to_vec())
            .context("Failed to read tarball")
    }

    pub fn verify_webhook_signature(secret: &str, signature: &str, payload: &[u8]) -> bool {
        use ring::hmac;

        let key = hmac::Key::new(hmac::HMAC_SHA256, secret.as_bytes());
        let expected = hmac::sign(&key, payload);

        // signature format: sha256=<hex>
        if let Some(hex_sig) = signature.strip_prefix("sha256=") {
            if let Ok(sig_bytes) = hex::decode(hex_sig) {
                return sig_bytes == expected.as_ref();
            }
        }

        false
    }
}

#[derive(Debug, Deserialize)]
pub struct WebhookPayload {
    pub action: Option<String>,
    pub repository: Option<WebhookRepository>,
    pub installation: Option<WebhookInstallation>,
    #[serde(rename = "ref")]
    pub ref_name: Option<String>,
    pub after: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct WebhookRepository {
    pub id: i64,
    pub full_name: String,
}

#[derive(Debug, Deserialize)]
pub struct WebhookInstallation {
    pub id: i64,
}
