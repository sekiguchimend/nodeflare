'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { RequestLog, PaginatedResponse, McpServer } from '@/types';
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';

// Constants
const LIVE_REFETCH_INTERVAL_MS = 3000;

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
  const [isLive, setIsLive] = useState(true);

  const { data: servers, isLoading: isLoadingServers, isError: isErrorServers } = useQuery<McpServer[]>({
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
    refetchInterval: isLive ? LIVE_REFETCH_INTERVAL_MS : false,
  });

  const hasActiveFilters = searchQuery || statusFilter !== 'all' || methodFilter !== 'all' || timeFilter !== 'all';

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setMethodFilter('all');
    setTimeFilter('all');
    setPage(1);
  };

  // Timeline range
  const timeRange = useMemo(() => {
    if (!data?.data?.length) return null;
    const times = data.data.map(l => new Date(l.created_at).getTime());
    const min = Math.min(...times);
    const max = Math.max(...times);
    return { min, max };
  }, [data?.data]);

  const formatTime = (date: string) => {
    const d = new Date(date);
    const month = d.toLocaleString('en', { month: 'short' }).toUpperCase();
    const day = d.getDate().toString().padStart(2, ' ');
    const time = d.toTimeString().split(' ')[0];
    const ms = d.getMilliseconds().toString().padStart(2, '0').slice(0, 2);
    return { month, day, time, ms };
  };

  if (isLoadingServers) {
    return (
      <div className="space-y-2">
        {[...Array(10)].map((_, i) => (
          <div key={i} className="h-8 bg-gray-100 animate-pulse rounded" />
        ))}
      </div>
    );
  }

  if (isErrorServers) {
    return (
      <div className="py-20 text-center">
        <svg className="w-12 h-12 text-red-400 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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

  if (!servers || servers.length === 0) {
    return (
      <div className="py-20 text-center text-gray-500">
        {t('noServers')}
      </div>
    );
  }

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl font-medium flex items-center gap-2 text-gray-400">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <line x1="10" y1="9" x2="8" y2="9" />
            </svg>
            {t('title')}
          </h1>
          {servers.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 border border-gray-200">
              <div className={`w-2 h-2 rounded-full ${selectedServer?.status === 'running' ? 'bg-emerald-500' : selectedServer?.status === 'stopped' ? 'bg-gray-400' : 'bg-amber-500'}`} />
              <select
                className="bg-transparent text-sm font-medium text-gray-700 focus:outline-none cursor-pointer pr-6 appearance-none"
                value={selectedServer?.id || ''}
                onChange={(e) => { setSelectedServerId(e.target.value); setPage(1); }}
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0 center' }}
              >
                {servers.map((server) => (
                  <option key={server.id} value={server.id}>{server.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-4">
        <button className="p-2 border border-gray-200 rounded-lg hover:border-gray-300">
          <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </button>
        <button className="p-2 border border-gray-200 rounded-lg hover:border-gray-300">
          <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 4h16v16H4z" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 10h16M10 4v16" strokeLinecap="round" />
          </svg>
        </button>
        <div className="flex-1 relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder={t('search')}
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-300"
          />
        </div>
        <button
          onClick={() => setIsLive(!isLive)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:border-gray-300"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="5 3 19 12 5 21 5 3" fill={isLive ? 'currentColor' : 'none'} />
          </svg>
          <span className="text-sm font-medium">{t('live')}</span>
        </button>
        <button onClick={() => refetch()} className="p-2 border border-gray-200 rounded-lg hover:border-gray-300">
          <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 4v6h-6M1 20v-6h6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button className="p-2 border border-gray-200 rounded-lg hover:border-gray-300">
          <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Timeline scrubber */}
      {timeRange && (
        <div className="mb-4 px-2">
          <div className="relative h-6">
            <div className="absolute inset-x-0 top-1/2 h-px bg-gray-200" />
            <div className="absolute left-0 top-0 text-xs text-gray-400">
              {new Date(timeRange.min).toLocaleTimeString()}
            </div>
            <div className="absolute left-1/2 top-0 -translate-x-1/2 text-xs text-gray-400">
              {new Date((timeRange.min + timeRange.max) / 2).toLocaleTimeString()}
            </div>
            <div className="absolute right-0 top-0 text-xs text-gray-400">
              {new Date(timeRange.max).toLocaleTimeString()}
            </div>
          </div>
        </div>
      )}

      {/* Table header */}
      <div className="grid grid-cols-[180px_100px_140px_1fr_200px] gap-2 px-4 py-2 text-xs font-medium text-gray-500 border-b border-gray-200">
        <div>{t('table.time')}</div>
        <div>{t('table.status')}</div>
        <div>{t('table.host')}</div>
        <div>{t('table.request')}</div>
        <div>{t('table.messages')}</div>
      </div>

      {/* Logs */}
      {isLoadingLogs ? (
        <div className="space-y-1 py-2">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="h-10 bg-gray-50 animate-pulse rounded" />
          ))}
        </div>
      ) : !data?.data?.length ? (
        <div className="py-16 text-center text-gray-400 text-sm">
          {t('noLogs')}
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {data.data.map((log) => {
            const time = formatTime(log.created_at);
            const isError = log.status_code >= 400;

            return (
              <div
                key={log.id}
                className={`grid grid-cols-[180px_100px_140px_1fr_200px] gap-2 px-4 py-2.5 text-sm hover:bg-gray-50 ${
                  isError ? 'bg-orange-50/50' : ''
                }`}
              >
                {/* Time */}
                <div className="flex items-center gap-2">
                  {isError && (
                    <svg className="w-4 h-4 text-orange-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2L1 21h22L12 2zm0 3.83L19.13 19H4.87L12 5.83zM11 16h2v2h-2v-2zm0-6h2v4h-2v-4z" />
                    </svg>
                  )}
                  <span className={`font-mono ${isError ? 'text-orange-600' : 'text-gray-500'}`}>
                    {time.month} {time.day}
                  </span>
                  <span className={`font-mono ${isError ? 'text-orange-700' : 'text-gray-900'}`}>
                    {time.time}.{time.ms}
                  </span>
                </div>

                {/* Status */}
                <div className="flex items-center gap-2 font-mono">
                  <span className="text-gray-500">{log.method}</span>
                  <span className={
                    log.status_code >= 500 ? 'text-red-600' :
                    log.status_code >= 400 ? 'text-orange-500' :
                    'text-emerald-600'
                  }>
                    {log.status_code}
                  </span>
                </div>

                {/* Host */}
                <div className="text-gray-500 truncate font-mono text-xs">
                  {selectedServer?.name?.slice(0, 15)}...
                </div>

                {/* Request */}
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded bg-gray-100 flex items-center justify-center text-xs text-gray-500 flex-shrink-0">
                    f
                  </span>
                  <span className={`truncate ${isError ? 'text-orange-600' : 'text-gray-700'}`}>
                    {log.path}
                  </span>
                </div>

                {/* Messages */}
                <div className="text-gray-400 truncate text-xs">
                  {log.tool_name && <span className="text-violet-600">{log.tool_name}</span>}
                  {log.error && <span className="text-red-500">{log.error}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {data && data.total > 50 && (
        <div className="mt-4 flex items-center justify-between text-sm border-t border-gray-200 pt-4">
          <span className="text-gray-400 text-xs">
            {(page - 1) * 50 + 1}-{Math.min(page * 50, data.total)} of {data.total}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              {tCommon('previous')}
            </Button>
            <Button variant="outline" size="sm" disabled={page * 50 >= data.total} onClick={() => setPage(p => p + 1)}>
              {tCommon('next')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
