'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { RequestLog, PaginatedResponse, McpServer } from '@/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export default function LogsPage() {
  const t = useTranslations('logs');
  const tCommon = useTranslations('common');
  const [page, setPage] = useState(1);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);

  // Fetch all servers to get workspace_id and server list
  const { data: servers, isLoading: isLoadingServers } = useQuery<McpServer[]>({
    queryKey: ['servers'],
    queryFn: () => api.get('/servers'),
  });

  // Find selected server or use first running server
  const selectedServer = servers?.find((s) => s.id === selectedServerId)
    || servers?.find((s) => s.status === 'running')
    || servers?.[0];
  const workspaceId = selectedServer?.workspace_id;
  const serverId = selectedServer?.id;

  const { data, isLoading: isLoadingLogs } = useQuery<PaginatedResponse<RequestLog>>({
    queryKey: ['workspaces', workspaceId, 'servers', serverId, 'logs', page],
    queryFn: () => api.get(`/workspaces/${workspaceId}/servers/${serverId}/logs?page=${page}&per_page=50`),
    enabled: !!workspaceId && !!serverId,
  });

  const isLoading = isLoadingServers || isLoadingLogs;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl font-medium flex items-center gap-2 text-gray-400">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" /></svg>
            {t('title')}
          </h1>
          {servers && servers.length > 0 && (
            <select
              className="h-10 px-3 rounded-md border border-input bg-background text-sm"
              value={selectedServer?.id || ''}
              onChange={(e) => {
                setSelectedServerId(e.target.value);
                setPage(1);
              }}
            >
              {servers.map((server) => (
                <option key={server.id} value={server.id}>
                  {server.name} ({t(`status.${server.status}`)})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {isLoadingServers ? (
        <Card>
          <CardContent className="p-4">
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : !servers || servers.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t('noServers')}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t('recentRequests')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoadingLogs ? (
              <div className="p-4 space-y-2">
                {[...Array(10)].map((_, i) => (
                  <div key={i} className="h-12 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : !data?.data || data.data.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                {t('noLogs')}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                          {t('table.time')}
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                          {t('table.method')}
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                          {t('table.path')}
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                          {t('table.tool')}
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                          {t('table.status')}
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                          {t('table.duration')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.data.map((log) => (
                        <tr key={log.id} className="hover:bg-muted/50">
                          <td className="px-4 py-3 text-sm">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className="font-mono">{log.method}</span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <code className="text-xs bg-muted px-1 rounded">
                              {log.path}
                            </code>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {log.tool_name ?? '-'}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <StatusCode code={log.status_code} />
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {log.duration_ms}ms
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="p-4 flex items-center justify-between border-t">
                  <div className="text-sm text-muted-foreground">
                    {tCommon('showing', {
                      from: (page - 1) * 50 + 1,
                      to: Math.min(page * 50, data.total),
                      total: data.total
                    })}
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      {tCommon('previous')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page * 50 >= data.total}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      {tCommon('next')}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatusCode({ code }: { code: number }) {
  let colorClass = 'text-gray-600';
  if (code >= 200 && code < 300) {
    colorClass = 'text-green-600';
  } else if (code >= 400 && code < 500) {
    colorClass = 'text-yellow-600';
  } else if (code >= 500) {
    colorClass = 'text-red-600';
  }

  return <span className={`font-mono ${colorClass}`}>{code}</span>;
}
