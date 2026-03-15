use crate::{Container, ContainerConfig, ContainerRuntime, ContainerStatus};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

const FLY_API_URL: &str = "https://api.machines.dev/v1";

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
