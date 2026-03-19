'use client';

import { useQuery, useQueries } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { McpServer, ServerStatsResponse } from '@/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const tServers = useTranslations('servers');
  const router = useRouter();
  const { data: servers, isLoading, isSuccess } = useQuery<McpServer[]>({
    queryKey: ['servers'],
    queryFn: () => api.get('/servers'),
  });

  const hasNoServers = isSuccess && (!servers || servers.length === 0);

  useEffect(() => {
    if (hasNoServers) {
      router.replace('/dashboard/servers/new');
    }
  }, [hasNoServers, router]);

  const runningServers = servers?.filter((s) => s.status === 'running') ?? [];

  // Fetch stats for all servers
  const statsQueries = useQueries({
    queries: (servers ?? []).map((server) => ({
      queryKey: ['workspaces', server.workspace_id, 'servers', server.id, 'stats'],
      queryFn: () => api.get<ServerStatsResponse>(`/workspaces/${server.workspace_id}/servers/${server.id}/stats`),
      enabled: !!server.workspace_id,
      staleTime: 60000,
    })),
  });

  const aggregatedStats = useMemo(() => {
    let totalRequests = 0;
    let totalErrors = 0;

    statsQueries.forEach((query) => {
      if (query.data?.stats) {
        totalRequests += query.data.stats.total_requests;
        totalErrors += query.data.stats.error_count;
      }
    });

    const isLoadingStats = statsQueries.some((q) => q.isLoading);
    return { totalRequests, totalErrors, isLoadingStats };
  }, [statsQueries]);

  if (isLoading || hasNoServers) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium flex items-center gap-2 text-gray-400">
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></svg>
          {t('title')}
        </h1>
        <Link href="/dashboard/servers/new">
          <Button size="sm">{t('newServer')}</Button>
        </Link>
      </div>

      {/* Stats - simple inline */}
      <div className="flex items-center gap-8 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{t('totalServers')}</span>
          <span className="font-semibold">{servers?.length ?? 0}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{t('running')}</span>
          <span className="font-semibold text-green-600">{runningServers.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{t('requests7d')}</span>
          <span className="font-semibold">
            {aggregatedStats.isLoadingStats ? '...' : aggregatedStats.totalRequests.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{t('errors7d')}</span>
          <span className="font-semibold text-red-600">
            {aggregatedStats.isLoadingStats ? '...' : aggregatedStats.totalErrors.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Servers table */}
      <div className="border rounded">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">{t('serverName')}</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">{t('repository')}</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">{t('status')}</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">{t('runtime')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {servers?.map((server) => (
              <tr key={server.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/servers/${server.id}`} className="font-medium hover:underline">
                    {server.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {server.github_repo}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={server.status} t={tServers} />
                </td>
                <td className="px-4 py-3 text-sm capitalize">
                  {server.runtime}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status, t }: { status: string; t: (key: string) => string }) {
  const colors: Record<string, string> = {
    running: 'bg-green-100 text-green-800',
    building: 'bg-yellow-100 text-yellow-800',
    deploying: 'bg-blue-100 text-blue-800',
    stopped: 'bg-gray-100 text-gray-800',
    failed: 'bg-red-100 text-red-800',
    pending: 'bg-gray-100 text-gray-800',
  };

  return (
    <span
      className={`px-2 py-0.5 text-xs font-medium rounded ${
        colors[status] ?? colors.pending
      }`}
    >
      {t(`status.${status}`)}
    </span>
  );
}
