'use client';

import { useQuery, useQueries } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { McpServer, ServerStatsResponse } from '@/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

interface Workspace {
  id: string;
  name: string;
  plan: string;
}

interface Plan {
  plan: string;
  limits: {
    max_servers: number;
    max_deployments_per_month: number;
    max_requests_per_month: number;
  };
}

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const tServers = useTranslations('servers');
  const tBilling = useTranslations('billing');
  const router = useRouter();

  const { data: servers, isLoading, isSuccess } = useQuery<McpServer[]>({
    queryKey: ['servers'],
    queryFn: () => api.get('/servers'),
  });

  const { data: workspaces } = useQuery<Workspace[]>({
    queryKey: ['workspaces'],
    queryFn: () => api.get('/workspaces'),
  });

  const { data: plans } = useQuery<Plan[]>({
    queryKey: ['billing-plans'],
    queryFn: () => api.get('/billing/plans'),
  });

  const hasNoServers = isSuccess && (!servers || servers.length === 0);

  useEffect(() => {
    if (hasNoServers) {
      router.replace('/dashboard/servers/new');
    }
  }, [hasNoServers, router]);

  const runningServers = servers?.filter((s) => s.status === 'running') ?? [];
  const currentWorkspace = workspaces?.[0];
  const currentPlan = plans?.find(p => p.plan === (currentWorkspace?.plan || 'free'));

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
    const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
    const uptime = runningServers.length > 0 && servers ? (runningServers.length / servers.length) * 100 : 0;
    return { totalRequests, totalErrors, errorRate, uptime, isLoadingStats };
  }, [statsQueries, runningServers.length, servers]);

  if (isLoading || hasNoServers) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const maxServers = currentPlan?.limits?.max_servers || 3;
  const maxRequests = currentPlan?.limits?.max_requests_per_month || 10000;
  const serverUsage = Math.min((servers?.length || 0) / maxServers * 100, 100);
  const requestUsage = Math.min(aggregatedStats.totalRequests / maxRequests * 100, 100);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-medium flex items-center gap-2 text-gray-400">
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></svg>
          {t('title')}
        </h1>
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-800 text-sm border border-gray-700">
          <span className="capitalize text-white font-medium">{currentWorkspace?.plan || 'free'}</span>
          <span className="text-gray-600">|</span>
          <Link href="/dashboard/billing" className="text-violet-400 hover:text-violet-300 font-medium">
            {tBilling('upgrade')}
          </Link>
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex items-center gap-6 mb-6 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-gray-500">{runningServers.length} / {servers?.length} running</span>
        </div>
        <div className="text-gray-300">|</div>
        <div className="text-gray-500">
          <span className="text-gray-900 font-medium">{aggregatedStats.totalRequests.toLocaleString()}</span> requests
        </div>
        <div className="text-gray-300">|</div>
        <div className="text-gray-500">
          <span className={aggregatedStats.totalErrors > 0 ? 'text-red-600 font-medium' : 'text-gray-900 font-medium'}>{aggregatedStats.totalErrors}</span> errors
        </div>
        <div className="flex-1" />
        <Link href="/dashboard/servers/new" className="flex items-center gap-1.5 text-violet-600 hover:text-violet-700">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          New Server
        </Link>
      </div>

      {/* Servers */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Servers</span>
          <Link href="/dashboard/servers" className="text-xs text-gray-400 hover:text-gray-600">
            View all →
          </Link>
        </div>
        <div className="divide-y divide-gray-100">
          {servers?.slice(0, 6).map((server, index) => (
            <ServerStatusRow key={server.id} server={server} index={index} t={tServers} />
          ))}
        </div>
      </div>

      {/* Plan Usage */}
      <div className="mt-6 rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Plan Usage</span>
          <Link href="/dashboard/billing" className="text-xs text-gray-400 hover:text-gray-600">
            Manage →
          </Link>
        </div>
        <div className="flex gap-8 p-4 bg-white">
          <div className="flex-1">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-sm text-gray-600">Servers</span>
              <span className="text-sm">
                <span className="font-semibold text-gray-900">{servers?.length || 0}</span>
                <span className="text-gray-400"> / {maxServers === 4294967295 ? '∞' : maxServers}</span>
              </span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-400 to-violet-500 rounded-full"
                style={{ width: maxServers === 4294967295 ? '0%' : `${serverUsage}%` }}
              />
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-sm text-gray-600">Requests</span>
              <span className="text-sm">
                <span className="font-semibold text-gray-900">{aggregatedStats.totalRequests.toLocaleString()}</span>
                <span className="text-gray-400"> / {maxRequests === 4294967295 ? '∞' : maxRequests.toLocaleString()}</span>
              </span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full"
                style={{ width: maxRequests === 4294967295 ? '0%' : `${requestUsage}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* News & Updates */}
      <NewsSection />
    </div>
  );
}


function ServerStatusRow({
  server,
  index,
  t,
}: {
  server: McpServer;
  index: number;
  t: (key: string) => string;
}) {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (server.status === 'running') {
      const interval = setInterval(() => {
        setPulse(true);
        setTimeout(() => setPulse(false), 1000);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [server.status]);

  const statusColors: Record<string, string> = {
    running: 'bg-green-500',
    building: 'bg-yellow-500 animate-pulse',
    deploying: 'bg-blue-500 animate-pulse',
    stopped: 'bg-gray-400',
    failed: 'bg-red-500',
    pending: 'bg-gray-400',
  };

  const gradients = [
    'from-blue-400 to-cyan-500',
    'from-violet-400 to-purple-500',
    'from-emerald-400 to-teal-500',
    'from-amber-400 to-orange-500',
    'from-pink-400 to-rose-500',
  ];

  return (
    <Link
      href={`/dashboard/servers/${server.id}`}
      className="group flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 transition-colors"
    >
      <div className={`relative w-8 h-8 rounded-md bg-gradient-to-br ${gradients[index % 5]} flex items-center justify-center flex-shrink-0`}>
        <span className="text-white font-semibold text-xs">{server.name.charAt(0).toUpperCase()}</span>
        {server.status === 'running' && (
          <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white ${pulse ? 'animate-ping' : ''}`} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-gray-900">{server.name}</span>
      </div>
      <div className="flex items-center gap-3 text-sm text-gray-400">
        <span className="hidden sm:inline capitalize">{server.runtime}</span>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${statusColors[server.status]}`} />
          <span className="hidden sm:inline">{t(`status.${server.status}`)}</span>
        </div>
        <svg className="w-4 h-4 text-gray-300 group-hover:text-gray-400 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </Link>
  );
}

interface Announcement {
  id: string;
  title: string;
  content?: string;
  type: string;
  published_at: string;
}

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  publishDate?: string;
}

interface VideoItem {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
}

function NewsSection() {
  // Fetch announcements from API
  const { data: announcements } = useQuery<Announcement[]>({
    queryKey: ['announcements'],
    queryFn: () => api.get('/announcements?limit=5'),
    staleTime: 60000,
  });

  // Fetch blog posts from CMS
  const { data: blogPosts } = useQuery<BlogPost[]>({
    queryKey: ['dashboard-blog-posts'],
    queryFn: async () => {
      const res = await fetch('/api/blog');
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60000,
  });

  // Static videos for now
  const videos: VideoItem[] = [
    {
      id: '1',
      title: 'Getting started with Nodeflare',
      url: 'https://youtube.com/watch?v=example',
      thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
    },
    {
      id: '2',
      title: 'Deploy your first MCP server',
      url: 'https://youtube.com/watch?v=example2',
      thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
    },
  ];

  const messages = announcements || [];
  const blogs = blogPosts?.slice(0, 3) || [];

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toISOString().split('T')[0];
  };

  return (
    <div className="mt-6 space-y-5">
      {/* Messages */}
      {messages.length > 0 && (
        <div className="space-y-1">
          {messages.map((item) => (
            <div key={item.id} className="text-sm text-gray-500">
              <span className="text-gray-400 mr-2">{formatDate(item.published_at)}</span>
              {item.title}
            </div>
          ))}
        </div>
      )}

      {/* Videos */}
      {videos.length > 0 && (
        <div>
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Videos</div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {videos.map((item) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 group"
              >
                <div className="relative w-36 h-20 rounded-lg overflow-hidden bg-gray-100">
                  <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center group-hover:bg-black/30 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
                      <svg className="w-3 h-3 text-gray-900 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1 line-clamp-1 w-36">{item.title}</p>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Blogs */}
      {blogs.length > 0 && (
        <div>
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Blog</div>
          <div className="flex gap-3 overflow-x-auto">
            {blogs.map((post) => (
              <a
                key={post.id}
                href={`/blog/${post.slug}`}
                className="flex-shrink-0 p-3 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors"
              >
                <p className="text-sm text-gray-900 w-44 line-clamp-2">{post.title}</p>
                {post.publishDate && (
                  <span className="text-xs text-gray-400 mt-1 block">{formatDate(post.publishDate)}</span>
                )}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
