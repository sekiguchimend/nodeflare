use crate::{Container, ContainerConfig, ContainerRuntime, ContainerStatus};
use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};

const FLY_API_URL: &str = "https://api.machines.dev/v1";
const FLY_GRAPHQL_URL: &str = "https://api.fly.io/graphql";

pub struct FlyioRuntime {
    api_token: String,
    org_slug: String,
    region: String,
    http_client: reqwest::Client,
}

impl FlyioRuntime {
    pub fn new(api_token: String, org_slug: String, region: String) -> Self {
        Self {
            api_token,
            org_slug,
            region,
            http_client: reqwest::Client::new(),
        }
    }

    fn app_name_from_container_name(&self, name: &str) -> String {
        name.replace("_", "-").to_lowercase()
    }

    /// Encode app_name and machine_id into a single ID string
    fn encode_id(app_name: &str, machine_id: &str) -> String {
        format!("{}:{}", app_name, machine_id)
    }

    /// Decode app_name and machine_id from an encoded ID string
    fn decode_id(id: &str) -> Result<(String, String)> {
        let parts: Vec<&str> = id.splitn(2, ':').collect();
        if parts.len() != 2 {
            anyhow::bail!("Invalid container ID format: {}", id);
        }
        Ok((parts[0].to_string(), parts[1].to_string()))
    }
}

#[derive(Debug, Serialize)]
struct CreateMachineRequest {
    name: String,
    region: String,
    config: MachineConfig,
}

#[derive(Debug, Serialize)]
struct MachineConfig {
    image: String,
    env: std::collections::HashMap<String, String>,
    guest: MachineGuest,
    services: Vec<MachineService>,
}

#[derive(Debug, Serialize)]
struct MachineGuest {
    cpu_kind: String,
    cpus: u8,
    memory_mb: u32,
}

#[derive(Debug, Serialize)]
struct MachineService {
    ports: Vec<MachinePort>,
    protocol: String,
    internal_port: u16,
}

#[derive(Debug, Serialize)]
struct MachinePort {
    port: u16,
    handlers: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct MachineResponse {
    id: String,
    name: String,
    state: String,
}

#[async_trait::async_trait]
impl ContainerRuntime for FlyioRuntime {
    async fn create(&self, name: &str, config: ContainerConfig) -> Result<Container> {
        let app_name = self.app_name_from_container_name(name);

        // Ensure app exists
        let _ = self
            .http_client
            .post(format!("{}/apps", FLY_API_URL))
            .header("Authorization", format!("Bearer {}", self.api_token))
            .json(&serde_json::json!({
                "app_name": app_name,
                "org_slug": self.org_slug
            }))
            .send()
            .await;

        let request = CreateMachineRequest {
            name: name.to_string(),
            region: self.region.clone(),
            config: MachineConfig {
                image: config.image,
                env: config.env,
                guest: MachineGuest {
                    cpu_kind: "shared".to_string(),
                    cpus: 1,
                    memory_mb: config.memory_mb,
                },
                services: vec![MachineService {
                    ports: vec![
                        MachinePort {
                            port: 80,
                            handlers: vec!["http".to_string()],
                        },
                        MachinePort {
                            port: 443,
                            handlers: vec!["http".to_string(), "tls".to_string()],
                        },
                    ],
                    protocol: "tcp".to_string(),
                    internal_port: config.port,
                }],
            },
        };

        let response = self
            .http_client
            .post(format!("{}/apps/{}/machines", FLY_API_URL, app_name))
            .header("Authorization", format!("Bearer {}", self.api_token))
            .json(&request)
            .send()
            .await
            .context("Failed to create machine")?;

        if !response.status().is_success() {
            let error = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to create machine: {}", error);
        }

        let machine: MachineResponse = response.json().await?;

        Ok(Container {
            id: Self::encode_id(&app_name, &machine.id),
            name: app_name.clone(),
            status: ContainerStatus::Creating,
            endpoint_url: Some(format!("https://{}.fly.dev", app_name)),
        })
    }

    async fn start(&self, id: &str) -> Result<()> {
        let (app_name, machine_id) = Self::decode_id(id)?;

        let response = self
            .http_client
            .post(format!(
                "{}/apps/{}/machines/{}/start",
                FLY_API_URL, app_name, machine_id
            ))
            .header("Authorization", format!("Bearer {}", self.api_token))
            .send()
            .await
            .context("Failed to start machine")?;

        if !response.status().is_success() {
            let error = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to start machine: {}", error);
        }

        Ok(())
    }

    async fn stop(&self, id: &str) -> Result<()> {
        let (app_name, machine_id) = Self::decode_id(id)?;

        let response = self
            .http_client
            .post(format!(
                "{}/apps/{}/machines/{}/stop",
                FLY_API_URL, app_name, machine_id
            ))
            .header("Authorization", format!("Bearer {}", self.api_token))
            .send()
            .await
            .context("Failed to stop machine")?;

        if !response.status().is_success() {
            let error = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to stop machine: {}", error);
        }

        Ok(())
    }

    async fn delete(&self, id: &str) -> Result<()> {
        let (app_name, machine_id) = Self::decode_id(id)?;

        let response = self
            .http_client
            .delete(format!(
                "{}/apps/{}/machines/{}",
                FLY_API_URL, app_name, machine_id
            ))
            .header("Authorization", format!("Bearer {}", self.api_token))
            .send()
            .await
            .context("Failed to delete machine")?;

        if !response.status().is_success() {
            let error = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to delete machine: {}", error);
        }

        Ok(())
    }

    async fn status(&self, id: &str) -> Result<ContainerStatus> {
        let (app_name, machine_id) = Self::decode_id(id)?;

        let response = self
            .http_client
            .get(format!(
                "{}/apps/{}/machines/{}",
                FLY_API_URL, app_name, machine_id
            ))
            .header("Authorization", format!("Bearer {}", self.api_token))
            .send()
            .await
            .context("Failed to get machine status")?;

        if !response.status().is_success() {
            let error = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to get machine status: {}", error);
        }

        let machine: MachineResponse = response.json().await?;

        let status = match machine.state.as_str() {
            "started" | "running" => ContainerStatus::Running,
            "stopped" | "stopping" => ContainerStatus::Stopped,
            "created" | "starting" => ContainerStatus::Creating,
            _ => ContainerStatus::Failed,
        };

        Ok(status)
    }

    async fn logs(&self, id: &str, tail: usize) -> Result<String> {
        let (app_name, _machine_id) = Self::decode_id(id)?;

        // Fly.io logs are accessed via Nats or the logs API
        // For simplicity, we'll use the HTTP logs endpoint
        let response = self
            .http_client
            .get(format!("https://api.fly.io/api/v1/apps/{}/logs", app_name))
            .header("Authorization", format!("Bearer {}", self.api_token))
            .query(&[("limit", tail.to_string())])
            .send()
            .await
            .context("Failed to get logs")?;

        if !response.status().is_success() {
            // Logs endpoint may not be available, return empty
            return Ok(String::new());
        }

        let logs = response.text().await.unwrap_or_default();
        Ok(logs)
    }
}

// ============================================================================
// Extended Fly.io Features: Exec, WireGuard, Tigris
// ============================================================================

/// Response from machine exec
#[derive(Debug, Deserialize)]
pub struct ExecResponse {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

/// WireGuard peer info (for listing)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WireGuardPeerInfo {
    pub name: String,
    pub region: String,
    pub peerip: String,
}

/// WireGuard configuration for client
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WireGuardConfig {
    pub peer_name: String,
    pub private_key: String,
    pub public_key: String,
    pub peer_ip: String,
    pub dns: String,
    pub endpoint: String,
    pub endpoint_public_key: String,
    pub allowed_ips: String,
}

impl FlyioRuntime {
    /// Execute a command on a running machine
    pub async fn exec(&self, id: &str, command: Vec<String>, timeout_secs: u32) -> Result<ExecResponse> {
        let (app_name, machine_id) = Self::decode_id(id)?;

        let request = serde_json::json!({
            "cmd": command,
            "timeout": timeout_secs
        });

        let response = self
            .http_client
            .post(format!(
                "{}/apps/{}/machines/{}/exec",
                FLY_API_URL, app_name, machine_id
            ))
            .header("Authorization", format!("Bearer {}", self.api_token))
            .json(&request)
            .send()
            .await
            .context("Failed to execute command")?;

        if !response.status().is_success() {
            let error = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to execute command: {}", error);
        }

        let result: ExecResponse = response.json().await?;
        Ok(result)
    }

    /// Create a WireGuard peer for an organization
    pub async fn create_wireguard_peer(
        &self,
        org_slug: &str,
        region: &str,
        peer_name: &str,
    ) -> Result<WireGuardConfig> {
        // Generate WireGuard keypair
        let private_key = Self::generate_wireguard_private_key();
        let public_key = Self::derive_wireguard_public_key(&private_key)?;

        let query = r#"
            mutation AddWireGuardPeer($input: AddWireGuardPeerInput!) {
                addWireGuardPeer(input: $input) {
                    peerip
                    endpointip
                    pubkey
                }
            }
        "#;

        let variables = serde_json::json!({
            "input": {
                "organizationId": org_slug,
                "region": region,
                "name": peer_name,
                "pubkey": public_key
            }
        });

        let response = self
            .http_client
            .post(FLY_GRAPHQL_URL)
            .header("Authorization", format!("Bearer {}", self.api_token))
            .json(&serde_json::json!({
                "query": query,
                "variables": variables
            }))
            .send()
            .await
            .context("Failed to create WireGuard peer")?;

        if !response.status().is_success() {
            let error = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to create WireGuard peer: {}", error);
        }

        let result: serde_json::Value = response.json().await?;

        if let Some(errors) = result.get("errors") {
            anyhow::bail!("GraphQL error: {}", errors);
        }

        let data = result
            .get("data")
            .and_then(|d| d.get("addWireGuardPeer"))
            .ok_or_else(|| anyhow!("Invalid response from WireGuard API"))?;

        let peer_ip = data["peerip"].as_str().unwrap_or("").to_string();
        let endpoint_ip = data["endpointip"].as_str().unwrap_or("").to_string();
        let endpoint_pubkey = data["pubkey"].as_str().unwrap_or("").to_string();

        Ok(WireGuardConfig {
            peer_name: peer_name.to_string(),
            private_key,
            public_key,
            peer_ip,
            dns: "fdaa::3".to_string(),
            endpoint: format!("{}:51820", endpoint_ip),
            endpoint_public_key: endpoint_pubkey,
            allowed_ips: "fdaa::/16".to_string(),
        })
    }

    /// Remove a WireGuard peer
    pub async fn remove_wireguard_peer(&self, org_slug: &str, peer_name: &str) -> Result<()> {
        let query = r#"
            mutation RemoveWireGuardPeer($input: RemoveWireGuardPeerInput!) {
                removeWireGuardPeer(input: $input) {
                    organization {
                        id
                    }
                }
            }
        "#;

        let variables = serde_json::json!({
            "input": {
                "organizationId": org_slug,
                "name": peer_name
            }
        });

        let response = self
            .http_client
            .post(FLY_GRAPHQL_URL)
            .header("Authorization", format!("Bearer {}", self.api_token))
            .json(&serde_json::json!({
                "query": query,
                "variables": variables
            }))
            .send()
            .await
            .context("Failed to remove WireGuard peer")?;

        if !response.status().is_success() {
            let error = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to remove WireGuard peer: {}", error);
        }

        Ok(())
    }

    /// List WireGuard peers for an organization
    pub async fn list_wireguard_peers(&self, org_slug: &str) -> Result<Vec<WireGuardPeerInfo>> {
        let query = r#"
            query GetWireGuardPeers($slug: String!) {
                organization(slug: $slug) {
                    wireGuardPeers {
                        nodes {
                            name
                            region
                            peerip
                        }
                    }
                }
            }
        "#;

        let variables = serde_json::json!({
            "slug": org_slug
        });

        let response = self
            .http_client
            .post(FLY_GRAPHQL_URL)
            .header("Authorization", format!("Bearer {}", self.api_token))
            .json(&serde_json::json!({
                "query": query,
                "variables": variables
            }))
            .send()
            .await
            .context("Failed to list WireGuard peers")?;

        if !response.status().is_success() {
            let error = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to list WireGuard peers: {}", error);
        }

        let result: serde_json::Value = response.json().await?;

        if let Some(errors) = result.get("errors") {
            anyhow::bail!("GraphQL error: {}", errors);
        }

        let nodes = result
            .get("data")
            .and_then(|d| d.get("organization"))
            .and_then(|o| o.get("wireGuardPeers"))
            .and_then(|w| w.get("nodes"))
            .and_then(|n| n.as_array())
            .cloned()
            .unwrap_or_default();

        let peers: Vec<WireGuardPeerInfo> = nodes
            .into_iter()
            .filter_map(|node| {
                Some(WireGuardPeerInfo {
                    name: node.get("name")?.as_str()?.to_string(),
                    region: node.get("region")?.as_str()?.to_string(),
                    peerip: node.get("peerip")?.as_str()?.to_string(),
                })
            })
            .collect();

        Ok(peers)
    }

    /// Generate WireGuard configuration file content
    pub fn generate_wireguard_config(config: &WireGuardConfig) -> String {
        format!(
            r#"[Interface]
PrivateKey = {}
Address = {}/120
DNS = {}

[Peer]
PublicKey = {}
AllowedIPs = {}
Endpoint = {}
PersistentKeepalive = 15
"#,
            config.private_key,
            config.peer_ip,
            config.dns,
            config.endpoint_public_key,
            config.allowed_ips,
            config.endpoint
        )
    }

    // Helper: Generate WireGuard private key (base64 encoded)
    fn generate_wireguard_private_key() -> String {
        use rand::RngCore;
        let mut key = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut key);
        // Clamp the key for Curve25519
        key[0] &= 248;
        key[31] &= 127;
        key[31] |= 64;
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, key)
    }

    // Helper: Derive public key from private key
    fn derive_wireguard_public_key(private_key: &str) -> Result<String> {
        use base64::Engine;
        let private_bytes = base64::engine::general_purpose::STANDARD
            .decode(private_key)
            .context("Invalid private key")?;

        if private_bytes.len() != 32 {
            anyhow::bail!("Invalid private key length");
        }

        // Use x25519-dalek for proper key derivation
        let mut private_array = [0u8; 32];
        private_array.copy_from_slice(&private_bytes);

        // Compute public key using scalar multiplication
        let public_key = x25519_dalek::x25519(private_array, x25519_dalek::X25519_BASEPOINT_BYTES);

        Ok(base64::engine::general_purpose::STANDARD.encode(public_key))
    }
}
