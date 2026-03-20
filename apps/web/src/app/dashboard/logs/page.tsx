'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { RequestLog, PaginatedResponse, McpServer } from '@/types';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export default function LogsPage() {
  const t = useTranslations('logs');
  const tCommon = useTranslations('common');
  const [page, setPage] = useState(1);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);

  const { data: servers, isLoading: isLoadingServers } = useQuery<McpServer[]>({
    queryKey: ['servers'],
    queryFn: () => api.get('/servers'),
  });

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
    <div className="max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl font-medium flex items-center gap-2 text-gray-400">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" /></svg>
            {t('title')}
          </h1>
          {servers && servers.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 border border-gray-200">
              <div className={`w-2 h-2 rounded-full ${selectedServer?.status === 'running' ? 'bg-emerald-500' : selectedServer?.status === 'stopped' ? 'bg-gray-400' : 'bg-amber-500'}`} />
              <select
                className="bg-transparent text-sm font-medium text-gray-700 focus:outline-none cursor-pointer pr-6 appearance-none"
                value={selectedServer?.id || ''}
                onChange={(e) => {
                  setSelectedServerId(e.target.value);
                  setPage(1);
                }}
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0 center' }}
              >
                {servers.map((server) => (
                  <option key={server.id} value={server.id}>
                    {server.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {isLoadingServers ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 animate-pulse rounded-lg" />
          ))}
        </div>
      ) : !servers || servers.length === 0 ? (
        <div className="py-16 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-gray-500">{t('noServers')}</p>
        </div>
      ) : (
        <div>
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">{t('recentRequests')}</h2>

          {isLoadingLogs ? (
            <div className="space-y-3">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : !data?.data || data.data.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-gray-500">{t('noLogs')}</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {t('table.time')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {t('table.method')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {t('table.path')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {t('table.tool')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {t('table.status')}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {t('table.duration')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.data.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <MethodBadge method={log.method} />
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <code className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                            {log.path}
                          </code>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {log.tool_name ? (
                            <span className="inline-flex items-center gap-1">
                              <svg className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              {log.tool_name}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <StatusBadge code={log.status_code} />
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className="inline-flex items-center gap-1 text-gray-600">
                            <svg className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10" />
                              <path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            {log.duration_ms}ms
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  {tCommon('showing', {
                    from: (page - 1) * 50 + 1,
                    to: Math.min(page * 50, data.total),
                    total: data.total
                  })}
                </div>
                <div className="flex gap-2">
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
        </div>
      )}
    </div>
  );
}

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: 'bg-blue-100 text-blue-700',
    POST: 'bg-green-100 text-green-700',
    PUT: 'bg-amber-100 text-amber-700',
    PATCH: 'bg-orange-100 text-orange-700',
    DELETE: 'bg-red-100 text-red-700',
  };

  return (
    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${colors[method] || 'bg-gray-100 text-gray-700'}`}>
      {method}
    </span>
  );
}

function StatusBadge({ code }: { code: number }) {
  let colorClass = 'bg-gray-100 text-gray-700';
  if (code >= 200 && code < 300) {
    colorClass = 'bg-emerald-100 text-emerald-700';
  } else if (code >= 400 && code < 500) {
    colorClass = 'bg-amber-100 text-amber-700';
  } else if (code >= 500) {
    colorClass = 'bg-red-100 text-red-700';
  }

  return (
    <span className={`inline-flex px-2 py-0.5 text-xs font-mono font-medium rounded ${colorClass}`}>
      {code}
    </span>
  );
}
