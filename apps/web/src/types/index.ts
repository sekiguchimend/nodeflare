export interface User {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  created_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  created_at: string;
}

export type Runtime = 'node' | 'python' | 'docker';
export type Visibility = 'public' | 'private' | 'team';
export type ServerStatus = 'pending' | 'building' | 'deploying' | 'running' | 'stopped' | 'failed';
export type DeploymentStatus = 'pending' | 'building' | 'deploying' | 'success' | 'failed';

export interface McpServer {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  description: string | null;
  github_repo: string;
  github_branch: string;
  runtime: Runtime;
  visibility: Visibility;
  status: ServerStatus;
  endpoint_url: string | null;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Deployment {
  id: string;
  server_id: string;
  version: string;
  commit_sha: string;
  commit_message: string | null;
  status: DeploymentStatus;
  build_logs: string | null;
  deployed_at: string | null;
  created_at: string;
}

export interface Tool {
  id: string;
  server_id: string;
  name: string;
  description: string | null;
  input_schema: Record<string, unknown>;
  is_enabled: boolean;
  rate_limit: number | null;
  created_at: string;
}

export interface ApiKey {
  id: string;
  workspace_id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  rate_limit: number;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export interface Secret {
  id: string;
  server_id: string;
  key: string;
  created_at: string;
  updated_at: string;
}

export interface RequestLog {
  id: string;
  server_id: string;
  api_key_id: string | null;
  tool_name: string | null;
  method: string;
  path: string;
  status_code: number;
  duration_ms: number;
  request_size: number;
  response_size: number;
  error: string | null;
  created_at: string;
}

export interface UsageRecord {
  id: string;
  workspace_id: string;
  server_id: string | null;
  period_start: string;
  period_end: string;
  request_count: number;
  compute_seconds: number;
  bandwidth_bytes: number;
}

// API Response types
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

export interface CreateServerRequest {
  name: string;
  slug?: string;
  description?: string;
  github_repo: string;
  github_branch?: string;
  github_installation_id?: number;
  runtime: Runtime;
  visibility: Visibility;
  config?: Record<string, unknown>;
}

export interface UpdateServerRequest {
  name?: string;
  description?: string;
  github_branch?: string;
  visibility?: Visibility;
  config?: Record<string, unknown>;
}

export interface CreateApiKeyRequest {
  name: string;
  scopes: string[];
  rate_limit?: number;
  expires_at?: string;
}

export interface CreateApiKeyResponse {
  api_key: ApiKey;
  key: string;
}

export interface CreateSecretRequest {
  key: string;
  value: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  html_url: string;
  default_branch: string;
  updated_at: string;
  language: string | null;
}
