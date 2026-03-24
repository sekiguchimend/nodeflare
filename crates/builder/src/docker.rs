use anyhow::{Context, Result};
use bollard::image::{BuildImageOptions, TagImageOptions};
use bollard::Docker;
use flate2::read::GzDecoder;
use futures::StreamExt;
use mcp_queue::BuildJob;
use regex::Regex;
use std::io::{Cursor, Read};

/// Validate GitHub repository name (owner/repo format)
/// Prevents command injection by ensuring strict format
fn validate_github_repo(repo: &str) -> Result<()> {
    // GitHub repo format: owner/repo
    // Owner: alphanumeric, hyphens (but not starting/ending with hyphen)
    // Repo: alphanumeric, hyphens, underscores, dots
    let re = Regex::new(r"^[a-zA-Z0-9][-a-zA-Z0-9]*[a-zA-Z0-9]?/[a-zA-Z0-9][-a-zA-Z0-9._]*[a-zA-Z0-9]$")
        .expect("Invalid regex");

    if !re.is_match(repo) {
        return Err(anyhow::anyhow!(
            "Invalid GitHub repository format. Expected 'owner/repo'"
        ));
    }

    // Additional safety checks
    if repo.contains("..") || repo.contains("//") {
        return Err(anyhow::anyhow!("Invalid characters in repository name"));
    }

    // Check length limits
    let parts: Vec<&str> = repo.split('/').collect();
    if parts.len() != 2 {
        return Err(anyhow::anyhow!("Repository must be in 'owner/repo' format"));
    }
    if parts[0].len() > 39 || parts[1].len() > 100 {
        return Err(anyhow::anyhow!("Repository name too long"));
    }

    Ok(())
}

/// Validate Git branch name
/// Prevents command injection through malicious branch names
fn validate_git_branch(branch: &str) -> Result<()> {
    // Git branch naming rules:
    // - Cannot start with '-' or '.'
    // - Cannot contain: space, ~, ^, :, ?, *, [, \, control chars
    // - Cannot end with '.lock' or '/'
    // - Cannot contain '..' or '@{'

    if branch.is_empty() || branch.len() > 255 {
        return Err(anyhow::anyhow!("Invalid branch name length"));
    }

    // Check for disallowed patterns
    if branch.starts_with('-') || branch.starts_with('.') {
        return Err(anyhow::anyhow!("Branch name cannot start with '-' or '.'"));
    }

    if branch.ends_with('/') || branch.ends_with(".lock") {
        return Err(anyhow::anyhow!("Invalid branch name ending"));
    }

    if branch.contains("..") || branch.contains("@{") {
        return Err(anyhow::anyhow!("Branch name contains invalid sequence"));
    }

    // Disallowed characters (including shell metacharacters)
    let disallowed = ['~', '^', ':', '?', '*', '[', '\\', ' ', '\t', '\n', '\r',
                      '\'', '"', '`', '$', '!', '&', '|', ';', '<', '>', '(', ')'];
    for c in disallowed {
        if branch.contains(c) {
            return Err(anyhow::anyhow!(
                "Branch name contains invalid character: '{}'",
                c
            ));
        }
    }

    // Must be valid UTF-8 and printable
    if !branch.chars().all(|c| c.is_ascii_graphic() || c == '/') {
        return Err(anyhow::anyhow!("Branch name contains non-printable characters"));
    }

    Ok(())
}

/// Build Docker image from GitHub tarball
pub async fn build_image_from_tarball(
    docker: &Docker,
    tarball: &[u8],
    job: &BuildJob,
    image_tag: &str,
) -> Result<()> {
    // GitHub tarball is gzipped - decompress it
    let gz = GzDecoder::new(Cursor::new(tarball));
    let mut archive = tar::Archive::new(gz);

    // Create new tar for Docker build context
    let mut build_context = tar::Builder::new(Vec::new());

    // GitHub tarballs have a top-level directory like "owner-repo-sha/"
    // We need to strip this prefix
    let mut prefix: Option<String> = None;

    for entry in archive.entries()? {
        let mut entry = entry?;
        let path = entry.path()?.to_path_buf();

        // Determine the prefix from the first entry
        if prefix.is_none() {
            if let Some(first_component) = path.components().next() {
                prefix = Some(first_component.as_os_str().to_string_lossy().to_string());
            }
        }

        // Strip the prefix
        if let Some(ref pfx) = prefix {
            if let Ok(stripped) = path.strip_prefix(pfx) {
                if !stripped.as_os_str().is_empty() {
                    let mut header = entry.header().clone();
                    header.set_path(stripped)?;

                    let mut data = Vec::new();
                    entry.read_to_end(&mut data)?;

                    build_context.append(&header, &data[..])?;
                }
            }
        }
    }

    // Check if Dockerfile exists in the tarball, if not, generate one
    let tar_bytes = build_context.into_inner()?;
    let has_dockerfile = check_has_dockerfile(&tar_bytes);

    let final_tar = if has_dockerfile {
        tar_bytes
    } else {
        // Add generated Dockerfile
        add_dockerfile_to_tar(&tar_bytes, &job.runtime)?
    };

    // Build the image
    let options = BuildImageOptions {
        t: image_tag,
        dockerfile: "Dockerfile",
        rm: true,
        ..Default::default()
    };

    let mut stream = docker.build_image(options, None, Some(final_tar.into()));

    while let Some(result) = stream.next().await {
        match result {
            Ok(output) => {
                if let Some(stream) = output.stream {
                    tracing::debug!("{}", stream.trim());
                }
                if let Some(error) = output.error {
                    return Err(anyhow::anyhow!("Build error: {}", error));
                }
            }
            Err(e) => {
                return Err(anyhow::anyhow!("Docker error: {}", e));
            }
        }
    }

    Ok(())
}

/// Legacy build function for when no tarball is available (public repos via git clone)
pub async fn build_image(docker: &Docker, job: &BuildJob, image_tag: &str) -> Result<()> {
    // Validate inputs to prevent command injection
    validate_github_repo(&job.github_repo)
        .context("Invalid GitHub repository name")?;
    validate_git_branch(&job.github_branch)
        .context("Invalid Git branch name")?;

    // Clone the repository using git
    let temp_dir = tempfile::tempdir()?;
    let repo_path = temp_dir.path();

    tracing::info!("Cloning {} to {:?}", job.github_repo, repo_path);

    let status = tokio::process::Command::new("git")
        .args([
            "clone",
            "--depth",
            "1",
            "--branch",
            &job.github_branch,
            &format!("https://github.com/{}.git", job.github_repo),
            repo_path.to_str().unwrap(),
        ])
        .status()
        .await
        .context("Failed to execute git clone")?;

    if !status.success() {
        return Err(anyhow::anyhow!("Git clone failed"));
    }

    // Create tar archive from cloned repo
    let mut ar = tar::Builder::new(Vec::new());
    ar.append_dir_all(".", repo_path)?;
    let tar_bytes = ar.into_inner()?;

    // Check for Dockerfile, add if missing
    let has_dockerfile = repo_path.join("Dockerfile").exists();
    let final_tar = if has_dockerfile {
        tar_bytes
    } else {
        add_dockerfile_to_tar(&tar_bytes, &job.runtime)?
    };

    let options = BuildImageOptions {
        t: image_tag,
        dockerfile: "Dockerfile",
        rm: true,
        ..Default::default()
    };

    let mut stream = docker.build_image(options, None, Some(final_tar.into()));

    while let Some(result) = stream.next().await {
        match result {
            Ok(output) => {
                if let Some(stream) = output.stream {
                    tracing::debug!("{}", stream.trim());
                }
                if let Some(error) = output.error {
                    return Err(anyhow::anyhow!("Build error: {}", error));
                }
            }
            Err(e) => {
                return Err(anyhow::anyhow!("Docker error: {}", e));
            }
        }
    }

    Ok(())
}

fn check_has_dockerfile(tar_bytes: &[u8]) -> bool {
    if let Ok(mut archive) = tar::Archive::new(Cursor::new(tar_bytes)).entries() {
        while let Some(Ok(entry)) = archive.next() {
            if let Ok(path) = entry.path() {
                if path.to_string_lossy() == "Dockerfile" {
                    return true;
                }
            }
        }
    }
    false
}

fn add_dockerfile_to_tar(original_tar: &[u8], runtime: &str) -> Result<Vec<u8>> {
    let dockerfile = match runtime {
        "node" => generate_node_dockerfile(),
        "python" => generate_python_dockerfile(),
        "go" => generate_go_dockerfile(),
        "rust" => generate_rust_dockerfile(),
        _ => generate_docker_dockerfile(),
    };

    let mut new_tar = tar::Builder::new(Vec::new());

    // Copy existing entries
    let mut archive = tar::Archive::new(Cursor::new(original_tar));
    for entry in archive.entries()? {
        let mut entry = entry?;
        let header = entry.header().clone();
        let mut data = Vec::new();
        entry.read_to_end(&mut data)?;
        new_tar.append(&header, &data[..])?;
    }

    // Add Dockerfile
    let mut header = tar::Header::new_gnu();
    header.set_path("Dockerfile")?;
    header.set_size(dockerfile.len() as u64);
    header.set_mode(0o644);
    header.set_cksum();
    new_tar.append(&header, dockerfile.as_bytes())?;

    Ok(new_tar.into_inner()?)
}

fn generate_node_dockerfile() -> String {
    r#"
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]
"#
    .to_string()
}

fn generate_python_dockerfile() -> String {
    r#"
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["python", "main.py"]
"#
    .to_string()
}

fn generate_go_dockerfile() -> String {
    r#"
FROM golang:1.22-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o /app/server .

FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /app

COPY --from=builder /app/server .

EXPOSE 8080

CMD ["./server"]
"#
    .to_string()
}

fn generate_rust_dockerfile() -> String {
    r#"
FROM rust:1.75-alpine AS builder

RUN apk add --no-cache musl-dev

WORKDIR /app

COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -rf src

COPY . .
RUN touch src/main.rs
RUN cargo build --release

FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /app

COPY --from=builder /app/target/release/mcp-server .

EXPOSE 8080

CMD ["./mcp-server"]
"#
    .to_string()
}

fn generate_docker_dockerfile() -> String {
    // Assume the repo has its own Dockerfile
    r#"
# Using repository's Dockerfile
"#
    .to_string()
}

pub async fn push_image(docker: &Docker, image_tag: &str, registry_url: &str) -> Result<String> {
    let full_tag = format!("{}/{}", registry_url, image_tag);

    docker
        .tag_image(
            image_tag,
            Some(TagImageOptions {
                repo: full_tag.clone(),
                tag: "latest".to_string(),
            }),
        )
        .await
        .context("Failed to tag image")?;

    // Push to registry
    let mut stream = docker.push_image::<String>(
        &full_tag,
        None,
        None,
    );

    while let Some(result) = stream.next().await {
        match result {
            Ok(output) => {
                if let Some(error) = output.error {
                    return Err(anyhow::anyhow!("Push error: {}", error));
                }
            }
            Err(e) => {
                return Err(anyhow::anyhow!("Docker error: {}", e));
            }
        }
    }

    Ok(full_tag)
}
