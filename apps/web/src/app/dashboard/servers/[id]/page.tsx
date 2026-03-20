'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { api } from '@/lib/api';
import { McpServer, Deployment, Tool, Secret } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Workspace {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

interface Plan {
  plan: string;
  limits: {
    max_deployments_per_month: number;
  };
}

export default function ServerDetailPage() {
  const t = useTranslations('servers');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const serverId = params.id as string;
  const [activeTab, setActiveTab] = useState<'deployments' | 'tools' | 'secrets' | 'settings'>('deployments');

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

  const { data: workspaces } = useQuery<Workspace[]>({
    queryKey: ['workspaces'],
    queryFn: () => api.get('/workspaces'),
  });

  const { data: plans } = useQuery<Plan[]>({
    queryKey: ['billing-plans'],
    queryFn: () => api.get('/billing/plans'),
  });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const deploymentsThisMonth = deployments?.filter(d => {
    const deployDate = new Date(d.created_at);
    return deployDate >= new Date(monthStart);
  }).length || 0;

  const currentWorkspace = workspaces?.find(w => w.id === workspaceId);
  const currentPlanLimits = plans?.find(p => p.plan === (currentWorkspace?.plan || 'free'))?.limits;
  const maxDeployments = currentPlanLimits?.max_deployments_per_month || 50;
  const isAtDeployLimit = deploymentsThisMonth >= maxDeployments;

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
        <div className="h-8 w-48 bg-gray-200 animate-pulse rounded" />
        <div className="h-32 bg-gray-200 animate-pulse rounded-xl" />
      </div>
    );
  }

  if (!server) {
    return (
      <div className="py-16 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="2" width="20" height="8" rx="2" />
            <rect x="2" y="14" width="20" height="8" rx="2" />
          </svg>
        </div>
        <p className="text-gray-500">{tErrors('serverNotFound')}</p>
      </div>
    );
  }

  const statusColors: Record<string, { bg: string; text: string; dot: string }> = {
    running: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
    building: { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' },
    deploying: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
    stopped: { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-400' },
    failed: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
    pending: { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-400' },
  };

  const statusStyle = statusColors[server.status] || statusColors.pending;

  const tabs = [
    { id: 'deployments', label: t('detail.deployments'), count: deployments?.length },
    { id: 'tools', label: t('detail.tools'), count: tools?.length },
    { id: 'secrets', label: t('detail.secrets'), count: secrets?.length },
    { id: 'settings', label: t('detail.settings') },
  ] as const;

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="2" width="20" height="8" rx="2" />
              <rect x="2" y="14" width="20" height="8" rx="2" />
              <line x1="6" y1="6" x2="6.01" y2="6" />
              <line x1="6" y1="18" x2="6.01" y2="18" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{server.name}</h1>
            <p className="text-sm text-gray-500">{server.github_repo}</p>
          </div>
          <span className={`ml-2 px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2 ${statusStyle.bg} ${statusStyle.text}`}>
            <span className={`w-2 h-2 rounded-full ${statusStyle.dot}`} />
            {t(`status.${server.status}`)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Deploy Button */}
          <Button
            onClick={() => deployMutation.mutate()}
            disabled={deployMutation.isPending || isAtDeployLimit}
            className="bg-gray-900 hover:bg-gray-800 text-white"
          >
            {deployMutation.isPending ? t('detail.deploying') : t('detail.deploy')}
            <span className="ml-2 text-gray-400 text-xs">
              {deploymentsThisMonth}/{maxDeployments === 4294967295 ? '∞' : maxDeployments}
            </span>
          </Button>

          {/* Delete Button */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="icon" className="text-gray-400 hover:text-red-500 hover:border-red-300">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('detail.deleteServer')}</AlertDialogTitle>
                <AlertDialogDescription>{t('detail.deleteConfirm')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteMutation.mutate()}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {tCommon('delete')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Upgrade Banner */}
      {isAtDeployLimit && currentWorkspace?.plan !== 'enterprise' && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-medium text-amber-800">{t('upgrade.title')}</p>
              <p className="text-sm text-amber-700 mt-1">{t('upgrade.deployLimit')}</p>
            </div>
            <Link href="/dashboard/billing">
              <Button variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-100">
                {t('upgrade.cta')}
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Info Pills */}
      <div className="flex items-center gap-2 text-sm">
        <span className="px-3 py-1.5 bg-gray-100 rounded-full">
          <span className="text-gray-500">{t('detail.runtime')}</span>
          <span className="ml-1.5 font-medium text-gray-900 capitalize">{server.runtime}</span>
        </span>
        <span className="px-3 py-1.5 bg-gray-100 rounded-full">
          <span className="text-gray-500">{t('visibility')}</span>
          <span className="ml-1.5 font-medium text-gray-900 capitalize">{server.visibility}</span>
        </span>
        <span className="px-3 py-1.5 bg-gray-100 rounded-full">
          <span className="text-gray-500">{t('create.branch')}</span>
          <span className="ml-1.5 font-medium text-gray-900 font-mono">{server.github_branch}</span>
        </span>
      </div>

      {/* Endpoint */}
      {server.status === 'running' && server.endpoint_url && (
        <div className="flex items-center justify-between px-5 py-3 bg-gray-50 rounded-xl border border-gray-200">
          <span className="text-sm text-gray-500">{t('detail.endpoint')}</span>
          <code className="text-sm font-mono text-gray-900">
            https://{server.slug}.{process.env.NEXT_PUBLIC_PROXY_BASE_DOMAIN || 'mcp.cloud'}
          </code>
        </div>
      )}

      {/* Tabs */}
      <div>
        <div className="flex gap-1 border-b border-gray-200">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? 'border-violet-600 text-violet-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {'count' in tab && tab.count !== undefined && (
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                  activeTab === tab.id ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {activeTab === 'deployments' && (
            <DeploymentsTab deployments={deployments ?? []} t={t} />
          )}
          {activeTab === 'tools' && (
            <ToolsTab
              tools={tools ?? []}
              serverId={serverId}
              workspaceId={workspaceId!}
              t={t}
              tCommon={tCommon}
            />
          )}
          {activeTab === 'secrets' && (
            <SecretsTab
              secrets={secrets ?? []}
              serverId={serverId}
              workspaceId={workspaceId!}
              t={t}
              tCommon={tCommon}
            />
          )}
          {activeTab === 'settings' && (
            <SettingsTab
              server={server}
              workspaceId={workspaceId!}
              t={t}
              tCommon={tCommon}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function DeploymentsTab({ deployments, t }: { deployments: Deployment[]; t: (key: string) => string }) {
  if (deployments.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-gray-500">{t('detail.noDeployments')}</p>
      </div>
    );
  }

  const statusColors: Record<string, { bg: string; text: string }> = {
    success: { bg: 'bg-green-100', text: 'text-green-700' },
    building: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
    deploying: { bg: 'bg-blue-100', text: 'text-blue-700' },
    failed: { bg: 'bg-red-100', text: 'text-red-700' },
    pending: { bg: 'bg-gray-100', text: 'text-gray-700' },
  };

  return (
    <div className="space-y-3">
      {deployments.map((deployment, index) => {
        const style = statusColors[deployment.status] || statusColors.pending;
        return (
          <div
            key={deployment.id}
            className="p-4 rounded-xl bg-white border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${style.bg}`}>
                <span className={`text-sm font-bold ${style.text}`}>v{index + 1}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono text-gray-600">{deployment.commit_sha.slice(0, 7)}</code>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
                    {t(`status.${deployment.status}`)}
                  </span>
                </div>
                <p className="text-sm text-gray-500 truncate mt-0.5">
                  {deployment.commit_message || 'No commit message'}
                </p>
              </div>
              <div className="text-sm text-gray-400">
                {deployment.deployed_at
                  ? new Date(deployment.deployed_at).toLocaleString()
                  : t('detail.pending')}
              </div>
            </div>
          </div>
        );
      })}
    </div>
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
      <div className="py-16 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-gray-500">{t('detail.noTools')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tools.map((tool) => (
        <div
          key={tool.id}
          className="p-4 rounded-xl bg-white border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all"
        >
          <div className="flex items-center gap-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              tool.is_enabled ? 'bg-violet-100' : 'bg-gray-100'
            }`}>
              <svg className={`w-5 h-5 ${tool.is_enabled ? 'text-violet-600' : 'text-gray-400'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900">{tool.name}</p>
              <p className="text-sm text-gray-500 truncate">{tool.description}</p>
            </div>
            <button
              onClick={() => toggleMutation.mutate({ toolId: tool.id, enabled: !tool.is_enabled })}
              disabled={toggleMutation.isPending}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                tool.is_enabled ? 'bg-violet-600' : 'bg-gray-300'
              }`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                tool.is_enabled ? 'left-7' : 'left-1'
              }`} />
            </button>
          </div>
        </div>
      ))}
    </div>
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
  const [isAdding, setIsAdding] = useState(false);
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: () =>
      api.post(`/workspaces/${workspaceId}/servers/${serverId}/secrets`, { key: newKey, value: newValue }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers', serverId, 'secrets'] });
      setNewKey('');
      setNewValue('');
      setIsAdding(false);
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
      {/* Add Secret Form */}
      {isAdding ? (
        <div className="p-6 rounded-2xl bg-gray-50 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">{t('detail.addSecret')}</h3>
            <button onClick={() => setIsAdding(false)} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <div className="flex gap-3">
            <Input
              placeholder={t('detail.keyPlaceholder')}
              value={newKey}
              onChange={(e) => setNewKey(e.target.value.toUpperCase())}
              className="flex-1 bg-white"
            />
            <Input
              type="password"
              placeholder={t('detail.valuePlaceholder')}
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              className="flex-1 bg-white"
            />
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!newKey || !newValue || createMutation.isPending}
              className="bg-violet-600 hover:bg-violet-700"
            >
              {tCommon('add')}
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="w-full px-6 py-3 rounded-xl border-2 border-dashed border-violet-300 bg-violet-50/50 hover:bg-violet-100/50 transition-all"
        >
          <div className="flex items-center justify-center gap-2 text-violet-600">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-medium">{t('detail.addSecret')}</span>
          </div>
        </button>
      )}

      {/* Secrets List */}
      {secrets.length === 0 ? (
        <div className="py-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <p className="text-gray-500">{t('detail.noSecrets')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {secrets.map((secret) => (
            <div
              key={secret.id}
              className="group p-4 rounded-xl bg-white border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <code className="flex-1 text-sm font-mono text-gray-900">{secret.key}</code>
                <span className="text-sm text-gray-400">••••••••</span>
                <button
                  onClick={() => deleteMutation.mutate(secret.key)}
                  className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                >
                  {tCommon('delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
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
    <div className="max-w-2xl space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name" className="text-gray-700">{t('create.name')}</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-white"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description" className="text-gray-700">{t('create.description')}</Label>
          <Input
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('create.descriptionPlaceholder')}
            className="bg-white"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="branch" className="text-gray-700">{t('create.branch')}</Label>
          <Input
            id="branch"
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="bg-white"
          />
        </div>

        <div>
          <Label className="text-gray-700 block mb-2">{t('create.visibility')}</Label>
          <div className="inline-flex p-0.5 bg-gray-200/60 rounded-[10px] border border-gray-200">
            {(['public', 'private', 'team'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVisibility(v)}
                className={`px-2.5 py-1 text-xs font-medium rounded-[10px] transition-all ${
                  visibility === v
                    ? 'bg-white text-gray-800 shadow border border-gray-100'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {t(`create.visibility${v.charAt(0).toUpperCase() + v.slice(1)}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-gray-200">
        <Button onClick={handleSave} disabled={isSaving} className="bg-violet-600 hover:bg-violet-700">
          {isSaving ? tCommon('loading') : tCommon('save')}
        </Button>
      </div>
    </div>
  );
}
