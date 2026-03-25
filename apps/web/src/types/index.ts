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

export type Runtime = 'node' | 'python' | 'go' | 'rust' | 'docker';
export type Visibility = 'public' | 'private' | 'team';
export type ServerStatus = 'pending' | 'building' | 'deploying' | 'running' | 'stopped' | 'failed' | 'inactive';
export type DeploymentStatus = 'pending' | 'building' | 'deploying' | 'success' | 'failed';
export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';
export type Region = 'nrt' | 'sin' | 'hkg' | 'syd' | 'iad' | 'sjc' | 'lax' | 'sea' | 'ams' | 'fra' | 'lhr';

// Region metadata for UI
export const REGIONS: { code: Region; city: string; area: string; flag: string }[] = [
  // Asia Pacific
  { code: 'nrt', city: 'Tokyo', area: 'Asia Pacific', flag: '🇯🇵' },
  { code: 'sin', city: 'Singapore', area: 'Asia Pacific', flag: '🇸🇬' },
  { code: 'hkg', city: 'Hong Kong', area: 'Asia Pacific', flag: '🇭🇰' },
  { code: 'syd', city: 'Sydney', area: 'Asia Pacific', flag: '🇦🇺' },
  // Americas
  { code: 'iad', city: 'Virginia', area: 'Americas', flag: '🇺🇸' },
  { code: 'sjc', city: 'San Jose', area: 'Americas', flag: '🇺🇸' },
  { code: 'lax', city: 'Los Angeles', area: 'Americas', flag: '🇺🇸' },
  { code: 'sea', city: 'Seattle', area: 'Americas', flag: '🇺🇸' },
  // Europe
  { code: 'ams', city: 'Amsterdam', area: 'Europe', flag: '🇳🇱' },
  { code: 'fra', city: 'Frankfurt', area: 'Europe', flag: '🇩🇪' },
  { code: 'lhr', city: 'London', area: 'Europe', flag: '🇬🇧' },
];

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
  region: Region;
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
  workspace_id?: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  server_id?: string;
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
  region?: Region;
  config?: Record<string, unknown>;
}

export interface UpdateServerRequest {
  name?: string;
  description?: string;
  github_branch?: string;
  visibility?: Visibility;
  region?: Region;
  config?: Record<string, unknown>;
}

export interface CreateApiKeyRequest {
  name: string;
  server_id?: string;
  scopes?: string[];
  expires_in_days?: number;
}

export interface CreateApiKeyResponse {
  id: string;
  name: string;
  key: string;
  key_prefix: string;
  created_at: string;
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

export interface RequestLogStats {
  total_requests: number;
  success_count: number;
  error_count: number;
  avg_duration_ms: number | null;
}

export interface ToolUsageStats {
  tool_name: string;
  call_count: number;
}

export interface ServerStatsResponse {
  stats: RequestLogStats;
  tool_usage: ToolUsageStats[];
}

// Team member types
export interface TeamMember {
  user_id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role: WorkspaceRole;
}

export interface AddMemberRequest {
  email: string;
  role?: WorkspaceRole;
}

export interface UpdateMemberRequest {
  role: WorkspaceRole;
}
