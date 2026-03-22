'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { RequestLog, PaginatedResponse, McpServer } from '@/types';
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';

type StatusFilter = 'all' | '2xx' | '4xx' | '5xx';
type MethodFilter = 'all' | 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type TimeFilter = 'all' | '1h' | '24h' | '7d' | '30d';

export default function LogsPage() {
  const t = useTranslations('logs');
  const tCommon = useTranslations('common');
  const [page, setPage] = useState(1);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [isExporting, setIsExporting] = useState(false);

  const { data: servers, isLoading: isLoadingServers } = useQuery<McpServer[]>({
    queryKey: ['servers'],
    queryFn: () => api.get('/servers'),
  });

  const selectedServer = servers?.find((s) => s.id === selectedServerId)
    || servers?.find((s) => s.status === 'running')
    || servers?.[0];
  const workspaceId = selectedServer?.workspace_id;
  const serverId = selectedServer?.id;

  const buildQueryParams = () => {
    const params = new URLSearchParams();
    params.set('page', page.toString());
    params.set('per_page', '50');
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (methodFilter !== 'all') params.set('method', methodFilter);
    if (timeFilter !== 'all') params.set('time_range', timeFilter);
    if (searchQuery) params.set('search', searchQuery);
    return params.toString();
  };

  const { data, isLoading: isLoadingLogs, refetch } = useQuery<PaginatedResponse<RequestLog>>({
    queryKey: ['workspaces', workspaceId, 'servers', serverId, 'logs', page, statusFilter, methodFilter, timeFilter, searchQuery],
    queryFn: () => api.get(`/workspaces/${workspaceId}/servers/${serverId}/logs?${buildQueryParams()}`),
    enabled: !!workspaceId && !!serverId,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  const isLoading = isLoadingServers || isLoadingLogs;

  const filteredLogs = useMemo(() => {
    if (!data?.data) return [];
    return data.data.filter(log => {
      // Client-side search filtering (in addition to server-side)
      if (searchQuery && !log.path?.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !log.tool_name?.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [data?.data, searchQuery]);

  const handleExport = async (format: 'csv' | 'json') => {
    if (!data?.data) return;
    setIsExporting(true);

    try {
      const exportData = data.data.map(log => ({
        time: new Date(log.created_at).toISOString(),
        method: log.method,
        path: log.path,
        tool: log.tool_name || '',
        status: log.status_code,
        duration_ms: log.duration_ms,
        error: log.error_message || '',
      }));

      let content: string;
      let filename: string;
      let mimeType: string;

      if (format === 'json') {
        content = JSON.stringify(exportData, null, 2);
        filename = `logs-${selectedServer?.name}-${new Date().toISOString().split('T')[0]}.json`;
        mimeType = 'application/json';
      } else {
        const headers = ['Time', 'Method', 'Path', 'Tool', 'Status', 'Duration (ms)', 'Error'];
        const rows = exportData.map(row => [
          row.time, row.method, row.path, row.tool, row.status, row.duration_ms, row.error
        ].join(','));
        content = [headers.join(','), ...rows].join('\n');
        filename = `logs-${selectedServer?.name}-${new Date().toISOString().split('T')[0]}.csv`;
        mimeType = 'text/csv';
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setMethodFilter('all');
    setTimeFilter('all');
    setPage(1);
  };

  const hasActiveFilters = searchQuery || statusFilter !== 'all' || methodFilter !== 'all' || timeFilter !== 'all';

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

      {/* Filters */}
      {servers && servers.length > 0 && (
        <div className="mb-6 p-4 bg-white rounded-xl border border-gray-200">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
                </svg>
                <input
                  type="text"
                  placeholder={t('searchPlaceholder') || 'Search path or tool...'}
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                  className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as StatusFilter); setPage(1); }}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="all">{t('filter.allStatus') || 'All Status'}</option>
              <option value="2xx">2xx Success</option>
              <option value="4xx">4xx Client Error</option>
              <option value="5xx">5xx Server Error</option>
            </select>

            {/* Method Filter */}
            <select
              value={methodFilter}
              onChange={(e) => { setMethodFilter(e.target.value as MethodFilter); setPage(1); }}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="all">{t('filter.allMethods') || 'All Methods'}</option>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="PATCH">PATCH</option>
              <option value="DELETE">DELETE</option>
            </select>

            {/* Time Range Filter */}
            <select
              value={timeFilter}
              onChange={(e) => { setTimeFilter(e.target.value as TimeFilter); setPage(1); }}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="all">{t('filter.allTime') || 'All Time'}</option>
              <option value="1h">{t('filter.lastHour') || 'Last Hour'}</option>
              <option value="24h">{t('filter.last24h') || 'Last 24 Hours'}</option>
              <option value="7d">{t('filter.last7d') || 'Last 7 Days'}</option>
              <option value="30d">{t('filter.last30d') || 'Last 30 Days'}</option>
            </select>

            {/* Reset Filters */}
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
              >
                {t('filter.reset') || 'Reset'}
              </button>
            )}

            {/* Refresh */}
            <button
              onClick={() => refetch()}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              title={t('refresh') || 'Refresh'}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6M1 20v-6h6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* Export */}
            <div className="relative group">
              <button
                disabled={isExporting || !data?.data?.length}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M7 10l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {t('export') || 'Export'}
              </button>
              <div className="absolute right-0 top-full mt-1 w-32 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                <button
                  onClick={() => handleExport('csv')}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 rounded-t-lg"
                >
                  CSV
                </button>
                <button
                  onClick={() => handleExport('json')}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 rounded-b-lg"
                >
                  JSON
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
