'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { McpServer, Deployment, Tool, Secret } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useState } from 'react';

export default function ServerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const serverId = params.id as string;

  const { data: server, isLoading } = useQuery<McpServer>({
    queryKey: ['servers', serverId],
    queryFn: () => api.get(`/servers/${serverId}`),
  });

  const { data: deployments } = useQuery<Deployment[]>({
    queryKey: ['servers', serverId, 'deployments'],
    queryFn: () => api.get(`/servers/${serverId}/deployments`),
  });

  const { data: tools } = useQuery<Tool[]>({
    queryKey: ['servers', serverId, 'tools'],
    queryFn: () => api.get(`/servers/${serverId}/tools`),
  });

  const { data: secrets } = useQuery<Secret[]>({
    queryKey: ['servers', serverId, 'secrets'],
    queryFn: () => api.get(`/servers/${serverId}/secrets`),
  });

  const deployMutation = useMutation({
    mutationFn: () => api.post(`/servers/${serverId}/deploy`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers', serverId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/servers/${serverId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      router.push('/dashboard/servers');
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-64 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  if (!server) {
    return <div>Server not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{server.name}</h1>
          <p className="text-muted-foreground">{server.description}</p>
        </div>
        <div className="flex space-x-2">
          <Button
            onClick={() => deployMutation.mutate()}
            disabled={deployMutation.isPending}
          >
            {deployMutation.isPending ? 'Deploying...' : 'Deploy'}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (confirm('Are you sure you want to delete this server?')) {
                deleteMutation.mutate();
              }
            }}
          >
            Delete
          </Button>
        </div>
      </div>

      {/* Status Card */}
      <Card>
        <CardContent className="p-6">
          <div className="grid md:grid-cols-4 gap-6">
            <div>
              <div className="text-sm text-muted-foreground">Status</div>
              <div className="font-medium capitalize">{server.status}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Runtime</div>
              <div className="font-medium capitalize">{server.runtime}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Visibility</div>
              <div className="font-medium capitalize">{server.visibility}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Repository</div>
              <div className="font-medium">{server.github_repo}</div>
            </div>
          </div>
          {server.status === 'running' && (
            <div className="mt-4 pt-4 border-t">
              <div className="text-sm text-muted-foreground mb-1">
                Public URL (Subdomain)
              </div>
              <code className="text-sm bg-muted px-2 py-1 rounded">
                https://{server.slug}.{process.env.NEXT_PUBLIC_PROXY_BASE_DOMAIN || 'mcp.cloud'}
              </code>
              <p className="text-xs text-muted-foreground mt-2">
                Use this URL to connect from Claude, ChatGPT, or other AI clients
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="deployments">
        <TabsList>
          <TabsTrigger value="deployments">Deployments</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
          <TabsTrigger value="secrets">Secrets</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="deployments" className="mt-4">
          <DeploymentsTab deployments={deployments ?? []} />
        </TabsContent>

        <TabsContent value="tools" className="mt-4">
          <ToolsTab tools={tools ?? []} serverId={serverId} />
        </TabsContent>

        <TabsContent value="secrets" className="mt-4">
          <SecretsTab secrets={secrets ?? []} serverId={serverId} />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <SettingsTab server={server} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DeploymentsTab({ deployments }: { deployments: Deployment[] }) {
  if (deployments.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No deployments yet
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-y">
          {deployments.map((deployment) => (
            <div key={deployment.id} className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium">{deployment.version}</div>
                <div className="text-sm text-muted-foreground">
                  {deployment.commit_sha.slice(0, 7)} - {deployment.commit_message}
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">
                  {deployment.deployed_at
                    ? new Date(deployment.deployed_at).toLocaleString()
                    : 'Pending'}
                </span>
                <StatusBadge status={deployment.status} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ToolsTab({ tools, serverId }: { tools: Tool[]; serverId: string }) {
  const queryClient = useQueryClient();

  const toggleMutation = useMutation({
    mutationFn: ({ toolId, enabled }: { toolId: string; enabled: boolean }) =>
      api.patch(`/servers/${serverId}/tools/${toolId}`, { is_enabled: enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers', serverId, 'tools'] });
    },
  });

  if (tools.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No tools discovered. Deploy your server to detect tools.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-y">
          {tools.map((tool) => (
            <div key={tool.id} className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium">{tool.name}</div>
                <div className="text-sm text-muted-foreground">
                  {tool.description}
                </div>
              </div>
              <Button
                variant={tool.is_enabled ? 'default' : 'outline'}
                size="sm"
                onClick={() =>
                  toggleMutation.mutate({
                    toolId: tool.id,
                    enabled: !tool.is_enabled,
                  })
                }
              >
                {tool.is_enabled ? 'Enabled' : 'Disabled'}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SecretsTab({ secrets, serverId }: { secrets: Secret[]; serverId: string }) {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: () =>
      api.post(`/servers/${serverId}/secrets`, { key: newKey, value: newValue }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers', serverId, 'secrets'] });
      setNewKey('');
      setNewValue('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (secretId: string) =>
      api.delete(`/servers/${serverId}/secrets/${secretId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers', serverId, 'secrets'] });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add Secret</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-4">
            <input
              type="text"
              placeholder="KEY"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value.toUpperCase())}
              className="flex-1 h-10 px-3 rounded-md border border-input bg-background text-sm"
            />
            <input
              type="password"
              placeholder="Value"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              className="flex-1 h-10 px-3 rounded-md border border-input bg-background text-sm"
            />
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!newKey || !newValue || createMutation.isPending}
            >
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {secrets.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No secrets configured
            </div>
          ) : (
            <div className="divide-y">
              {secrets.map((secret) => (
                <div
                  key={secret.id}
                  className="p-4 flex items-center justify-between"
                >
                  <code className="text-sm">{secret.key}</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMutation.mutate(secret.id)}
                  >
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsTab({ server }: { server: McpServer }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Server Settings</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">Settings configuration coming soon.</p>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    success: 'bg-green-100 text-green-800',
    building: 'bg-yellow-100 text-yellow-800',
    deploying: 'bg-blue-100 text-blue-800',
    failed: 'bg-red-100 text-red-800',
    pending: 'bg-gray-100 text-gray-800',
  };

  return (
    <span
      className={`px-2 py-1 text-xs font-medium rounded-full ${
        colors[status] ?? colors.pending
      }`}
    >
      {status}
    </span>
  );
}
