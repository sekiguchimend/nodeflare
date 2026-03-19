'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { McpServer, Deployment, Tool, Secret } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';

export default function ServerDetailPage() {
  const t = useTranslations('servers');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const serverId = params.id as string;

  // Fetch all servers to find the current server and its workspace_id
  const { data: servers, isLoading: isLoadingServers } = useQuery<McpServer[]>({
    queryKey: ['servers'],
    queryFn: () => api.get('/servers'),
  });

  const server = servers?.find((s) => s.id === serverId);
  const workspaceId = server?.workspace_id;

  const { data: deployments } = useQuery<Deployment[]>({
    queryKey: ['servers', serverId, 'deployments'],
    queryFn: () => api.get(`/workspaces/${workspaceId}/servers/${serverId}/deployments`),
    enabled: !!workspaceId,
  });

  const { data: tools } = useQuery<Tool[]>({
    queryKey: ['servers', serverId, 'tools'],
    queryFn: () => api.get(`/workspaces/${workspaceId}/servers/${serverId}/tools`),
    enabled: !!workspaceId,
  });

  const { data: secrets } = useQuery<Secret[]>({
    queryKey: ['servers', serverId, 'secrets'],
    queryFn: () => api.get(`/workspaces/${workspaceId}/servers/${serverId}/secrets`),
    enabled: !!workspaceId,
  });

  const deployMutation = useMutation({
    mutationFn: () => api.post(`/workspaces/${workspaceId}/servers/${serverId}/deploy`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      queryClient.invalidateQueries({ queryKey: ['servers', serverId, 'deployments'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/workspaces/${workspaceId}/servers/${serverId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      router.push('/dashboard/servers');
    },
  });

  if (isLoadingServers) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-64 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  if (!server) {
    return <div>{tErrors('serverNotFound')}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-medium flex items-center gap-2 text-gray-400">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" /></svg>
            {server.name}
          </h1>
          <p className="text-muted-foreground">{server.description}</p>
        </div>
        <div className="flex space-x-2">
          <Button
            onClick={() => deployMutation.mutate()}
            disabled={deployMutation.isPending}
          >
            {deployMutation.isPending ? t('detail.deploying') : t('detail.deploy')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              if (confirm(t('detail.deleteConfirm'))) {
                deleteMutation.mutate();
              }
            }}
          >
            {tCommon('delete')}
          </Button>
        </div>
      </div>

      {/* Status Card */}
      <Card>
        <CardContent className="p-6">
          <div className="grid md:grid-cols-4 gap-6">
            <div>
              <div className="text-sm text-muted-foreground">{t('detail.status')}</div>
              <div className="font-medium">{t(`status.${server.status}`)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">{t('detail.runtime')}</div>
              <div className="font-medium capitalize">{server.runtime}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">{t('visibility')}</div>
              <div className="font-medium capitalize">{server.visibility}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">{t('detail.repository')}</div>
              <div className="font-medium">{server.github_repo}</div>
            </div>
          </div>
          {server.status === 'running' && (
            <div className="mt-4 pt-4 border-t">
              <div className="text-sm text-muted-foreground mb-1">
                {t('detail.publicUrl')}
              </div>
              <code className="text-sm bg-muted px-2 py-1 rounded">
                https://{server.slug}.{process.env.NEXT_PUBLIC_PROXY_BASE_DOMAIN || 'mcp.cloud'}
              </code>
              <p className="text-xs text-muted-foreground mt-2">
                {t('detail.publicUrlDesc')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="deployments">
        <TabsList>
          <TabsTrigger value="deployments">{t('detail.deployments')}</TabsTrigger>
          <TabsTrigger value="tools">{t('detail.tools')}</TabsTrigger>
          <TabsTrigger value="secrets">{t('detail.secrets')}</TabsTrigger>
          <TabsTrigger value="settings">{t('detail.settings')}</TabsTrigger>
        </TabsList>

        <TabsContent value="deployments" className="mt-4">
          <DeploymentsTab deployments={deployments ?? []} t={t} />
        </TabsContent>

        <TabsContent value="tools" className="mt-4">
          <ToolsTab
            tools={tools ?? []}
            serverId={serverId}
            workspaceId={workspaceId!}
            t={t}
            tCommon={tCommon}
          />
        </TabsContent>

        <TabsContent value="secrets" className="mt-4">
          <SecretsTab
            secrets={secrets ?? []}
            serverId={serverId}
            workspaceId={workspaceId!}
            t={t}
            tCommon={tCommon}
          />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <SettingsTab
            server={server}
            workspaceId={workspaceId!}
            t={t}
            tCommon={tCommon}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DeploymentsTab({ deployments, t }: { deployments: Deployment[]; t: (key: string) => string }) {
  if (deployments.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          {t('detail.noDeployments')}
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
                    : t('detail.pending')}
                </span>
                <StatusBadge status={deployment.status} t={t} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ToolsTab({
  tools,
  serverId,
  workspaceId,
  t,
  tCommon
}: {
  tools: Tool[];
  serverId: string;
  workspaceId: string;
  t: (key: string) => string;
  tCommon: (key: string) => string;
}) {
  const queryClient = useQueryClient();

  const toggleMutation = useMutation({
    mutationFn: ({ toolId, enabled }: { toolId: string; enabled: boolean }) =>
      api.patch(`/workspaces/${workspaceId}/servers/${serverId}/tools/${toolId}`, { is_enabled: enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers', serverId, 'tools'] });
    },
  });

  if (tools.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          {t('detail.noTools')}
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
                {tool.is_enabled ? tCommon('enabled') : tCommon('disabled')}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SecretsTab({
  secrets,
  serverId,
  workspaceId,
  t,
  tCommon
}: {
  secrets: Secret[];
  serverId: string;
  workspaceId: string;
  t: (key: string) => string;
  tCommon: (key: string) => string;
}) {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: () =>
      api.post(`/workspaces/${workspaceId}/servers/${serverId}/secrets`, { key: newKey, value: newValue }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers', serverId, 'secrets'] });
      setNewKey('');
      setNewValue('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (secretKey: string) =>
      api.delete(`/workspaces/${workspaceId}/servers/${serverId}/secrets/${secretKey}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers', serverId, 'secrets'] });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('detail.addSecret')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-4">
            <input
              type="text"
              placeholder={t('detail.keyPlaceholder')}
              value={newKey}
              onChange={(e) => setNewKey(e.target.value.toUpperCase())}
              className="flex-1 h-10 px-3 rounded-md border border-input bg-background text-sm"
            />
            <input
              type="password"
              placeholder={t('detail.valuePlaceholder')}
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              className="flex-1 h-10 px-3 rounded-md border border-input bg-background text-sm"
            />
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!newKey || !newValue || createMutation.isPending}
            >
              {tCommon('add')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {secrets.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              {t('detail.noSecrets')}
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
                    onClick={() => deleteMutation.mutate(secret.key)}
                  >
                    {tCommon('delete')}
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

function SettingsTab({
  server,
  workspaceId,
  t,
  tCommon
}: {
  server: McpServer;
  workspaceId: string;
  t: (key: string) => string;
  tCommon: (key: string) => string;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(server.name);
  const [description, setDescription] = useState(server.description || '');
  const [visibility, setVisibility] = useState(server.visibility);
  const [branch, setBranch] = useState(server.github_branch);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.patch(`/workspaces/${workspaceId}/servers/${server.id}`, {
        name,
        description: description || null,
        visibility,
        github_branch: branch,
      });
      queryClient.invalidateQueries({ queryKey: ['servers'] });
    } catch (error) {
      console.error('Failed to update server:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('detail.serverSettings')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">{t('create.name')}</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">{t('create.description')}</Label>
          <Input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('create.descriptionPlaceholder')}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="branch">{t('create.branch')}</Label>
          <Input
            id="branch"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>{t('create.visibility')}</Label>
          <div className="flex space-x-4">
            {(['public', 'private', 'team'] as const).map((v) => (
              <label key={v} className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="visibility"
                  value={v}
                  checked={visibility === v}
                  onChange={(e) => setVisibility(e.target.value as typeof visibility)}
                  className="w-4 h-4"
                />
                <span className="capitalize">{t(`create.visibility${v.charAt(0).toUpperCase() + v.slice(1)}`)}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="pt-4">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? tCommon('loading') : tCommon('save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status, t }: { status: string; t: (key: string) => string }) {
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
      {t(`status.${status}`)}
    </span>
  );
}
