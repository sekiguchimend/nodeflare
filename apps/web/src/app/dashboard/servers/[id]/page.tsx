'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { api } from '@/lib/api';
import { McpServer, Deployment, Tool, Secret, Region, REGIONS, ServerRegion, RegionCostEstimate } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState, useEffect } from 'react';
import { useServerStatusWebSocket } from '@/hooks/use-websocket';
import { BuildLogsPanel } from '@/components/deployment/build-logs-panel';
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
  const [activeTab, setActiveTab] = useState<'deployments' | 'tools' | 'secrets' | 'regions' | 'webhooks' | 'console' | 'settings'>('deployments');
  const [showDeployInfo, setShowDeployInfo] = useState(false);

  const { data: servers, isLoading: isLoadingServers, isError: isErrorServers } = useQuery<McpServer[]>({
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

  const { data: serverRegions } = useQuery<ServerRegion[]>({
    queryKey: ['servers', serverId, 'regions'],
    queryFn: () => api.get(`/workspaces/${workspaceId}/servers/${serverId}/regions`),
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

  // Real-time server status via WebSocket
  const { isConnected: wsConnected } = useServerStatusWebSocket(
    workspaceId || '',
    serverId,
    {
      onStatusUpdate: (status) => {
        // Update the server status in cache
        queryClient.setQueryData<McpServer[]>(['servers'], (old) => {
          if (!old) return old;
          return old.map((s) =>
            s.id === serverId
              ? { ...s, status: status.status, endpoint_url: status.endpoint_url || s.endpoint_url }
              : s
          );
        });
      },
    }
  );

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

  if (isErrorServers) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <svg className="w-12 h-12 text-red-400 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p className="text-gray-500 mb-4">{t('loadError')}</p>
        <button
          onClick={() => window.location.reload()}
          className="text-sm text-violet-600 hover:text-violet-700"
        >
          {tCommon('retry')}
        </button>
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
    { id: 'regions', label: t('regions.title'), count: serverRegions?.length },
    { id: 'webhooks', label: t('webhooks.title') },
    { id: 'console', label: t('console.title') },
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
          <span className={`ml-2 text-sm font-medium flex items-center gap-2 ${statusStyle.text}`}>
            <span className={`w-2 h-2 rounded-full ${statusStyle.dot}`} />
            {t(`status.${server.status}`)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Deploy Button */}
          <Button
            onClick={() => deployMutation.mutate()}
            disabled={deployMutation.isPending || isAtDeployLimit}
            className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-lg shadow-violet-500/25"
          >
            {deployMutation.isPending ? (
              <>
                <svg className="w-4 h-4 mr-2 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                </svg>
                {t('detail.deploying')}
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                {t('detail.pullAndDeploy')}
              </>
            )}
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
      <div className="flex items-center gap-2 text-sm flex-wrap">
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
        <span className="px-3 py-1.5 bg-gray-100 rounded-full">
          <span className="text-gray-500">{t('create.region')}</span>
          <span className={`fi fi-${REGIONS.find(r => r.code === server.region)?.countryCode} mr-1.5`}></span>
          <span className="font-medium text-gray-900">{t(`regions.${server.region}`)} ({server.region.toUpperCase()})</span>
        </span>
        <div className="relative">
          <button
            onClick={() => setShowDeployInfo(!showDeployInfo)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
          >
            <span className="text-gray-500">{t('detail.deploys')}</span>
            <span className="font-medium text-gray-900">{deploymentsThisMonth}/{maxDeployments === 4294967295 ? '∞' : maxDeployments}</span>
            <svg className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
            </svg>
          </button>
          {showDeployInfo && (
            <div className="absolute top-full left-0 mt-2 w-72 p-4 rounded-xl bg-white border border-gray-200 shadow-xl z-50">
              <p className="font-medium text-gray-900 mb-2">{t('detail.deployInfo')}</p>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl font-bold text-violet-600">{deploymentsThisMonth}</span>
                <span className="text-gray-400">/</span>
                <span className="text-lg text-gray-500">{maxDeployments === 4294967295 ? '∞' : maxDeployments}</span>
              </div>
              <p className="text-sm text-gray-500">
                {maxDeployments === 4294967295 ? t('detail.deployInfoUnlimited') : t('detail.deployInfoDesc', { max: maxDeployments })}
              </p>
              <Link
                href="/dashboard/billing"
                className="inline-flex items-center gap-1 text-sm text-violet-600 hover:text-violet-700 mt-3 font-medium"
                onClick={() => setShowDeployInfo(false)}
              >
                {t('detail.viewPlan')}
              </Link>
            </div>
          )}
        </div>
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
            <DeploymentsTab deployments={deployments ?? []} t={t} tCommon={tCommon} />
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
          {activeTab === 'regions' && (
            <RegionsTab
              regions={serverRegions ?? []}
              serverId={serverId}
              workspaceId={workspaceId!}
              currentRegion={server.region}
              t={t}
              tCommon={tCommon}
            />
          )}
          {activeTab === 'webhooks' && (
            <WebhooksTab
              serverId={serverId}
              workspaceId={workspaceId!}
              t={t}
              tCommon={tCommon}
            />
          )}
          {activeTab === 'console' && (
            <ConsoleTab
              serverId={serverId}
              workspaceId={workspaceId!}
              serverRegions={serverRegions ?? []}
              serverStatus={server.status}
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

function DeploymentsTab({ deployments, t, tCommon }: { deployments: Deployment[]; t: (key: string) => string; tCommon: (key: string) => string }) {
  const [selectedDeployment, setSelectedDeployment] = useState<string | null>(null);

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
    succeeded: { bg: 'bg-green-100', text: 'text-green-700' },
    building: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
    deploying: { bg: 'bg-blue-100', text: 'text-blue-700' },
    failed: { bg: 'bg-red-100', text: 'text-red-700' },
    pending: { bg: 'bg-gray-100', text: 'text-gray-700' },
  };

  return (
    <div className="space-y-4">
      {/* Build Logs Panel */}
      {selectedDeployment && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600">
              {t('detail.buildLogs')} - {selectedDeployment.slice(0, 8)}
            </h3>
            <button
              onClick={() => setSelectedDeployment(null)}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              {tCommon('close')}
            </button>
          </div>
          <BuildLogsPanel deploymentId={selectedDeployment} maxHeight="300px" />
        </div>
      )}

      {/* Deployments List */}
      <div className="space-y-3">
        {deployments.map((deployment, index) => {
          const style = statusColors[deployment.status] || statusColors.pending;
          const isSelected = selectedDeployment === deployment.id;
          const isBuilding = deployment.status === 'building' || deployment.status === 'deploying';
          return (
            <div
              key={deployment.id}
              className={`p-4 rounded-xl bg-white border transition-all cursor-pointer ${
                isSelected
                  ? 'border-violet-300 ring-2 ring-violet-100'
                  : 'border-gray-100 hover:border-gray-200 hover:shadow-md'
              }`}
              onClick={() => setSelectedDeployment(isSelected ? null : deployment.id)}
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${style.bg}`}>
                  <span className={`text-sm font-bold ${style.text}`}>v{deployments.length - index}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono text-gray-600">{deployment.commit_sha.slice(0, 7)}</code>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1.5 ${style.bg} ${style.text}`}>
                      {isBuilding && (
                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                      )}
                      {t(`status.${deployment.status}`)}
                    </span>
                    {isBuilding && (
                      <span className="text-xs text-violet-600 font-medium">
                        {t('detail.clickToViewLogs')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 truncate mt-0.5">
                    {deployment.commit_message || t('detail.noCommitMessage')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-sm text-gray-400">
                    {deployment.deployed_at
                      ? new Date(deployment.deployed_at).toLocaleString()
                      : t('detail.pending')}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedDeployment(isSelected ? null : deployment.id);
                    }}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    title={t('detail.viewLogs')}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
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
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-violet-300 bg-violet-50 hover:bg-violet-100 text-violet-600 transition-all"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-sm font-medium">{t('detail.addSecret')}</span>
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

function ConsoleTab({
  serverId,
  workspaceId,
  serverRegions,
  serverStatus,
  t,
  tCommon
}: {
  serverId: string;
  workspaceId: string;
  serverRegions: ServerRegion[];
  serverStatus: string;
  t: (key: string) => string;
  tCommon: (key: string) => string;
}) {
  const [command, setCommand] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<string | undefined>();
  const [output, setOutput] = useState<{ stdout: string; stderr: string; exit_code: number } | null>(null);
  const [history, setHistory] = useState<Array<{ command: string; output: { stdout: string; stderr: string; exit_code: number } }>>([]);

  const execMutation = useMutation({
    mutationFn: (cmd: string) =>
      api.post<{ stdout: string; stderr: string; exit_code: number }>(
        `/workspaces/${workspaceId}/servers/${serverId}/console/exec`,
        {
          command: cmd.split(' '),
          timeout: 30,
          region: selectedRegion,
        }
      ),
    onSuccess: (data) => {
      setOutput(data);
      setHistory((prev) => [...prev, { command, output: data }]);
      setCommand('');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (command.trim()) {
      execMutation.mutate(command);
    }
  };

  const runningRegions = serverRegions.filter(r => r.status === 'running');

  if (serverStatus !== 'running') {
    return (
      <div className="py-16 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 9l6 6M15 9l-6 6" strokeLinecap="round" />
          </svg>
        </div>
        <p className="text-gray-500">{t('console.serverNotRunning')}</p>
        <p className="text-sm text-gray-400 mt-1">{t('console.deployFirst')}</p>
      </div>
    );
  }

  if (runningRegions.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
          </svg>
        </div>
        <p className="text-gray-500">{t('console.noRunningRegions')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-gray-900 to-gray-800 border border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M7 8l4 4-4 4M13 16h4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-white">{t('console.title')}</h3>
            <p className="text-sm text-gray-400">{t('console.description')}</p>
          </div>
        </div>
      </div>

      {/* Region Selector */}
      {runningRegions.length > 1 && (
        <div className="flex items-center gap-3">
          <Label className="text-gray-600">{t('console.selectRegion')}</Label>
          <select
            value={selectedRegion || ''}
            onChange={(e) => setSelectedRegion(e.target.value || undefined)}
            className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            <option value="">{t('console.primaryRegion')}</option>
            {runningRegions.map((region) => {
              const regionInfo = REGIONS.find(r => r.code === region.region);
              return (
                <option key={region.region} value={region.region}>
                  {regionInfo?.city || region.region} ({region.region.toUpperCase()})
                  {region.is_primary && ` - ${t('regions.primary')}`}
                </option>
              );
            })}
          </select>
        </div>
      )}

      {/* Terminal */}
      <div className="rounded-xl bg-gray-900 border border-gray-700 overflow-hidden">
        {/* Terminal Header */}
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <div className="w-3 h-3 rounded-full bg-green-500" />
          </div>
          <span className="text-sm text-gray-400 ml-2">
            {selectedRegion ? selectedRegion.toUpperCase() : runningRegions.find(r => r.is_primary)?.region.toUpperCase() || 'Console'}
          </span>
        </div>

        {/* Terminal Output */}
        <div className="p-4 font-mono text-sm max-h-80 overflow-y-auto">
          {history.length === 0 && !output && (
            <div className="text-gray-500">
              {t('console.welcome')}
            </div>
          )}

          {history.map((item, index) => (
            <div key={index} className="mb-4">
              <div className="flex items-center gap-2 text-green-400">
                <span>$</span>
                <span>{item.command}</span>
              </div>
              {item.output.stdout && (
                <pre className="text-gray-300 whitespace-pre-wrap mt-1">{item.output.stdout}</pre>
              )}
              {item.output.stderr && (
                <pre className="text-red-400 whitespace-pre-wrap mt-1">{item.output.stderr}</pre>
              )}
              <div className={`text-xs mt-1 ${item.output.exit_code === 0 ? 'text-gray-500' : 'text-red-400'}`}>
                exit: {item.output.exit_code}
              </div>
            </div>
          ))}

          {execMutation.isPending && (
            <div className="flex items-center gap-2 text-gray-400">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
              </svg>
              <span>{t('console.executing')}</span>
            </div>
          )}
        </div>

        {/* Command Input */}
        <form onSubmit={handleSubmit} className="flex items-center border-t border-gray-700">
          <span className="pl-4 text-green-400 font-mono">$</span>
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder={t('console.placeholder')}
            disabled={execMutation.isPending}
            className="flex-1 px-2 py-3 bg-transparent text-gray-300 font-mono text-sm focus:outline-none placeholder-gray-600"
            autoFocus
          />
          <button
            type="submit"
            disabled={!command.trim() || execMutation.isPending}
            className="px-4 py-3 text-violet-400 hover:text-violet-300 disabled:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
      </div>

      {/* Quick Commands */}
      <div>
        <Label className="text-gray-600 mb-2 block">{t('console.quickCommands')}</Label>
        <div className="flex flex-wrap gap-2">
          {['ls -la', 'pwd', 'cat package.json', 'node --version', 'npm list --depth=0'].map((cmd) => (
            <button
              key={cmd}
              onClick={() => {
                setCommand(cmd);
              }}
              className="px-3 py-1.5 text-sm font-mono bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
            >
              {cmd}
            </button>
          ))}
        </div>
      </div>

      {execMutation.isError && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200">
          <p className="text-red-700 text-sm">{t('console.error')}</p>
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
  const [region, setRegion] = useState<Region>(server.region);
  const [rootDirectory, setRootDirectory] = useState(server.root_directory || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.patch(`/workspaces/${workspaceId}/servers/${server.id}`, {
        name,
        description: description || null,
        visibility,
        github_branch: branch,
        region,
        root_directory: rootDirectory || null,
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

        <div className="space-y-2">
          <Label htmlFor="rootDirectory" className="text-gray-700">{t('create.rootDirectory')}</Label>
          <p className="text-xs text-gray-500">{t('create.rootDirectoryHelp')}</p>
          <Input
            id="rootDirectory"
            value={rootDirectory}
            onChange={(e) => setRootDirectory(e.target.value)}
            placeholder="packages/mcp-server"
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

        <div className="space-y-2">
          <Label htmlFor="region" className="text-gray-700">{t('create.region')}</Label>
          <p className="text-xs text-gray-500">{t('create.regionHelp')}</p>
          <RegionSelect value={region} onChange={setRegion} t={t} />
        </div>
      </div>

      <div className="pt-4 border-t border-gray-200">
        <Button onClick={handleSave} disabled={isSaving} className="bg-violet-600 hover:bg-violet-700 px-6">
          {isSaving ? tCommon('loading') : t('detail.save')}
        </Button>
      </div>
    </div>
  );
}

function RegionSelect({
  value,
  onChange,
  t
}: {
  value: Region;
  onChange: (region: Region) => void;
  t: (key: string) => string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedRegion = REGIONS.find(r => r.code === value);

  const groupedRegions = {
    'Asia Pacific': REGIONS.filter(r => r.area === 'Asia Pacific'),
    'Americas': REGIONS.filter(r => r.area === 'Americas'),
    'Europe': REGIONS.filter(r => r.area === 'Europe'),
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 font-medium cursor-pointer hover:border-gray-400 focus:border-violet-400 focus:outline-none transition-colors text-left"
      >
        <span className={`fi fi-${selectedRegion?.countryCode} text-lg`}></span>
        <span className="flex-1 text-sm">{t(`regions.${value}`)} ({value.toUpperCase()})</span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute z-20 w-full mt-2 py-2 bg-white rounded-xl border border-gray-200 shadow-xl max-h-64 overflow-y-auto">
            {Object.entries(groupedRegions).map(([area, regions]) => (
              <div key={area}>
                <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">
                  {t(`regions.${area === 'Asia Pacific' ? 'asiaPacific' : area === 'Americas' ? 'americas' : 'europe'}`)}
                </div>
                {regions.map(region => (
                  <button
                    key={region.code}
                    type="button"
                    onClick={() => {
                      onChange(region.code);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-violet-50 transition-colors text-left ${
                      value === region.code ? 'bg-violet-50 text-violet-700' : 'text-gray-700'
                    }`}
                  >
                    <span className={`fi fi-${region.countryCode} text-lg`}></span>
                    <span className="flex-1 text-sm">{t(`regions.${region.code}`)} ({region.code.toUpperCase()})</span>
                    {value === region.code && (
                      <svg className="w-4 h-4 text-violet-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RegionsTab({
  regions,
  serverId,
  workspaceId,
  currentRegion,
  t,
  tCommon
}: {
  regions: ServerRegion[];
  serverId: string;
  workspaceId: string;
  currentRegion: Region;
  t: ReturnType<typeof useTranslations>;
  tCommon: ReturnType<typeof useTranslations>;
}) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // Get cost estimate
  const { data: costEstimate } = useQuery<RegionCostEstimate>({
    queryKey: ['region-cost', workspaceId],
    queryFn: () => api.get(`/workspaces/${workspaceId}/billing/region-cost`),
  });

  const addMutation = useMutation({
    mutationFn: (region: Region) =>
      api.post<{ type: string; checkout_url?: string; region?: unknown }>(`/workspaces/${workspaceId}/servers/${serverId}/regions`, { region }),
    onSuccess: (data) => {
      if (data.type === 'checkout_required' && data.checkout_url) {
        // First region - redirect to Stripe checkout for subscription
        window.location.href = data.checkout_url;
      } else if (data.type === 'added') {
        // Subsequent regions - added directly (subscription quantity incremented)
        queryClient.invalidateQueries({ queryKey: ['servers', serverId, 'regions'] });
        queryClient.invalidateQueries({ queryKey: ['region-cost', workspaceId] });
        setIsAdding(false);
        setSelectedRegion(null);
      }
    },
  });

  const removeMutation = useMutation({
    mutationFn: (region: string) =>
      api.delete(`/workspaces/${workspaceId}/servers/${serverId}/regions/${region}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers', serverId, 'regions'] });
      queryClient.invalidateQueries({ queryKey: ['region-cost', workspaceId] });
    },
  });

  // Filter out regions that are already added
  const existingRegionCodes = regions.map(r => r.region);
  const availableRegions = REGIONS.filter(r => !existingRegionCodes.includes(r.code));

  const statusColors: Record<string, { bg: string; text: string; dot: string }> = {
    running: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
    deploying: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
    stopped: { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-400' },
    failed: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
    pending: { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  };

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200">
        <div>
          <h3 className="font-semibold text-violet-900 flex items-center gap-2">
            <svg className="w-5 h-5 text-violet-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            {t('regions.multiRegionTitle')}
          </h3>
          <p className="text-sm text-violet-700 mt-1">{t('regions.multiRegionDesc')}</p>
            {costEstimate && costEstimate.additional_regions > 0 && (
              <p className="text-sm text-violet-600 mt-2 font-medium">
                {t('regions.currentCost', {
                  count: costEstimate.additional_regions,
                  cost: costEstimate.estimated_monthly_jpy
                })}
              </p>
            )}
        </div>
      </div>

      {/* Current Regions */}
      <div className="space-y-3">
        <h3 className="font-medium text-gray-900">{t('regions.activeRegions')}</h3>
        {regions.map((region) => {
          const regionInfo = REGIONS.find(r => r.code === region.region);
          const style = statusColors[region.status] || statusColors.pending;
          return (
            <div
              key={region.region}
              className="group p-4 rounded-xl bg-white border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-gray-50 flex items-center justify-center">
                  <span className={`fi fi-${regionInfo?.countryCode} text-2xl`}></span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">
                      {t(`regions.${region.region}`)} ({region.region.toUpperCase()})
                    </span>
                    {region.is_primary && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700">
                        {t('regions.primary')}
                      </span>
                    )}
                    <span className={`text-xs font-medium flex items-center gap-1.5 ${style.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                      {t(`status.${region.status}`)}
                    </span>
                  </div>
                  {region.endpoint_url && (
                    <p className="text-sm text-gray-500 mt-0.5">{region.endpoint_url}</p>
                  )}
                </div>
                {!region.is_primary && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400">¥300/月</span>
                    <button
                      onClick={() => {
                        if (confirm(t('regions.removeConfirm'))) {
                          removeMutation.mutate(region.region);
                        }
                      }}
                      disabled={removeMutation.isPending}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Region */}
      {availableRegions.length > 0 && (
        <div>
          {isAdding ? (
            <div className="p-6 rounded-2xl bg-gray-50 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">{t('regions.addRegion')}</h3>
                <button onClick={() => setIsAdding(false)} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
              <div className="space-y-3">
                <p className="text-sm text-gray-600">{t('regions.addRegionDesc')}</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {availableRegions.map((region) => (
                    <button
                      key={region.code}
                      onClick={() => setSelectedRegion(region.code)}
                      className={`flex items-center gap-2 p-3 rounded-lg border transition-all text-left ${
                        selectedRegion === region.code
                          ? 'border-violet-300 bg-violet-50 ring-2 ring-violet-100'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <span className={`fi fi-${region.countryCode} text-lg`}></span>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{region.city}</div>
                        <div className="text-xs text-gray-500">{region.code.toUpperCase()}</div>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                  <div className="text-sm text-gray-600">
                    {t('regions.priceInfo')}
                  </div>
                  <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
                    <AlertDialogTrigger asChild>
                      <Button
                        onClick={() => setShowConfirmDialog(true)}
                        disabled={!selectedRegion || addMutation.isPending}
                        className="bg-violet-600 hover:bg-violet-700"
                      >
                        {addMutation.isPending ? tCommon('loading') : t('regions.addRegion')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('regions.confirmTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('regions.confirmDesc', { region: selectedRegion?.toUpperCase() || '' })}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            if (selectedRegion) {
                              addMutation.mutate(selectedRegion);
                            }
                            setShowConfirmDialog(false);
                          }}
                          className="bg-violet-600 hover:bg-violet-700"
                        >
                          {t('regions.confirmAdd')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-violet-300 bg-violet-50 hover:bg-violet-100 text-violet-600 transition-all"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-sm font-medium">{t('regions.addRegion')}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface Webhook {
  id: string;
  name: string;
  webhook_url: string;
  webhook_type: string;
  events: string[];
  is_active: boolean;
  last_triggered_at: string | null;
  last_status: string | null;
  created_at: string;
}

function WebhooksTab({
  serverId,
  workspaceId,
  t,
  tCommon
}: {
  serverId: string;
  workspaceId: string;
  t: (key: string) => string;
  tCommon: (key: string) => string;
}) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [newWebhook, setNewWebhook] = useState({
    name: '',
    webhook_url: '',
    webhook_type: 'custom',
    events: ['deploy_success', 'deploy_failure'],
    secret: '',
  });

  const { data: webhooks = [], isLoading } = useQuery<Webhook[]>({
    queryKey: ['webhooks', serverId],
    queryFn: () => api.get(`/workspaces/${workspaceId}/servers/${serverId}/webhooks`),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof newWebhook) =>
      api.post(`/workspaces/${workspaceId}/servers/${serverId}/webhooks`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks', serverId] });
      setIsAdding(false);
      setNewWebhook({
        name: '',
        webhook_url: '',
        webhook_type: 'custom',
        events: ['deploy_success', 'deploy_failure'],
        secret: '',
      });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.patch(`/workspaces/${workspaceId}/servers/${serverId}/webhooks/${id}`, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks', serverId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/workspaces/${workspaceId}/servers/${serverId}/webhooks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks', serverId] });
    },
  });

  const testMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(`/workspaces/${workspaceId}/servers/${serverId}/webhooks/${id}/test`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks', serverId] });
    },
  });

  const handleEventToggle = (event: string) => {
    const events = newWebhook.events.includes(event)
      ? newWebhook.events.filter(e => e !== event)
      : [...newWebhook.events, event];
    setNewWebhook({ ...newWebhook, events });
  };

  const eventOptions = [
    { id: 'deploy_success', label: t('webhooks.eventDeploySuccess'), desc: t('webhooks.eventDeploySuccessDesc') },
    { id: 'deploy_failure', label: t('webhooks.eventDeployFailure'), desc: t('webhooks.eventDeployFailureDesc') },
    { id: 'deploy_started', label: t('webhooks.eventDeployStarted'), desc: t('webhooks.eventDeployStartedDesc') },
  ];

  if (isLoading) {
    return (
      <div className="py-16 flex justify-center">
        <svg className="w-8 h-8 animate-spin text-violet-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add Webhook Form */}
      {isAdding ? (
        <div className="p-6 rounded-2xl bg-gray-50 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">{t('webhooks.add')}</h3>
            <button onClick={() => setIsAdding(false)} className="text-gray-400 hover:text-gray-600">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <Label>{t('webhooks.name')}</Label>
              <Input
                value={newWebhook.name}
                onChange={(e) => setNewWebhook({ ...newWebhook, name: e.target.value })}
                placeholder={t('webhooks.namePlaceholder')}
                className="mt-1 bg-white"
              />
            </div>
            <div>
              <Label>{t('webhooks.url')}</Label>
              <Input
                value={newWebhook.webhook_url}
                onChange={(e) => setNewWebhook({ ...newWebhook, webhook_url: e.target.value })}
                placeholder={t('webhooks.urlPlaceholder')}
                className="mt-1 bg-white"
              />
            </div>
            <div>
              <Label>{t('webhooks.type')}</Label>
              <select
                value={newWebhook.webhook_type}
                onChange={(e) => setNewWebhook({ ...newWebhook, webhook_type: e.target.value })}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <option value="custom">{t('webhooks.typeCustom')}</option>
                <option value="slack">{t('webhooks.typeSlack')}</option>
                <option value="discord">{t('webhooks.typeDiscord')}</option>
              </select>
            </div>
            <div>
              <Label className="mb-2 block">{t('webhooks.events')}</Label>
              <div className="space-y-2">
                {eventOptions.map(event => (
                  <label key={event.id} className="flex items-center gap-3 p-3 rounded-lg bg-white border border-gray-200 cursor-pointer hover:border-gray-300">
                    <input
                      type="checkbox"
                      checked={newWebhook.events.includes(event.id)}
                      onChange={() => handleEventToggle(event.id)}
                      className="w-4 h-4 text-violet-600 rounded border-gray-300 focus:ring-violet-500"
                    />
                    <div>
                      <div className="font-medium text-gray-900">{event.label}</div>
                      <div className="text-sm text-gray-500">{event.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label>{t('webhooks.secret')}</Label>
              <Input
                type="password"
                value={newWebhook.secret}
                onChange={(e) => setNewWebhook({ ...newWebhook, secret: e.target.value })}
                placeholder={t('webhooks.secretPlaceholder')}
                className="mt-1 bg-white"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                onClick={() => createMutation.mutate(newWebhook)}
                disabled={!newWebhook.name || !newWebhook.webhook_url || newWebhook.events.length === 0 || createMutation.isPending}
                className="bg-violet-600 hover:bg-violet-700"
              >
                {createMutation.isPending ? tCommon('loading') : t('webhooks.add')}
              </Button>
              <Button variant="outline" onClick={() => setIsAdding(false)}>
                {tCommon('cancel')}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-violet-300 bg-violet-50 hover:bg-violet-100 text-violet-600 transition-all"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-sm font-medium">{t('webhooks.add')}</span>
        </button>
      )}

      {/* Webhooks List */}
      {webhooks.length === 0 ? (
        <div className="py-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-gray-500 mb-2">{t('webhooks.empty')}</p>
          <p className="text-sm text-gray-400">{t('webhooks.emptyDesc')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((webhook) => (
            <div
              key={webhook.id}
              className={`group p-4 rounded-xl bg-white border transition-all ${
                webhook.is_active ? 'border-gray-100 hover:border-gray-200 hover:shadow-md' : 'border-gray-100 opacity-60'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  webhook.webhook_type === 'slack' ? 'bg-purple-100' :
                  webhook.webhook_type === 'discord' ? 'bg-indigo-100' : 'bg-gray-100'
                }`}>
                  {webhook.webhook_type === 'slack' ? (
                    <svg className="w-5 h-5 text-purple-600" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                    </svg>
                  ) : webhook.webhook_type === 'discord' ? (
                    <svg className="w-5 h-5 text-indigo-600" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">{webhook.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      webhook.webhook_type === 'slack' ? 'bg-purple-100 text-purple-700' :
                      webhook.webhook_type === 'discord' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {webhook.webhook_type}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 truncate">{webhook.webhook_url}</p>
                  <div className="flex items-center gap-4 mt-1">
                    <div className="flex gap-1">
                      {webhook.events.map(event => (
                        <span key={event} className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                          {event.replace('deploy_', '')}
                        </span>
                      ))}
                    </div>
                    {webhook.last_triggered_at && (
                      <span className="text-xs text-gray-400">
                        Last: {new Date(webhook.last_triggered_at).toLocaleString()}
                        {webhook.last_status && (
                          <span className={webhook.last_status === 'success' ? 'text-green-600 ml-1' : 'text-red-600 ml-1'}>
                            ({webhook.last_status})
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => testMutation.mutate(webhook.id)}
                    disabled={testMutation.isPending}
                    className="px-3 py-1.5 text-sm text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                    title={t('webhooks.test')}
                  >
                    {testMutation.isPending ? t('webhooks.testing') : t('webhooks.test')}
                  </button>
                  <button
                    onClick={() => toggleMutation.mutate({ id: webhook.id, is_active: !webhook.is_active })}
                    disabled={toggleMutation.isPending}
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      webhook.is_active ? 'bg-violet-600' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                      webhook.is_active ? 'left-5' : 'left-0.5'
                    }`} />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(t('webhooks.deleteConfirm'))) {
                        deleteMutation.mutate(webhook.id);
                      }
                    }}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
