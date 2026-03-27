'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { McpServer } from '@/types';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SiNodedotjs, SiPython, SiGo, SiRust, SiDocker } from 'react-icons/si';

interface Workspace {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

interface Plan {
  plan: string;
  limits: {
    max_servers: number;
  };
}

export default function ServersPage() {
  const t = useTranslations('servers');
  const { data: servers, isLoading, isError: isErrorServers } = useQuery<McpServer[]>({
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

  const currentWorkspace = workspaces?.[0];
  const currentPlanLimits = plans?.find(p => p.plan === (currentWorkspace?.plan || 'free'))?.limits;
  const maxServers = currentPlanLimits?.max_servers || 3;
  const currentServerCount = isErrorServers ? 0 : (servers?.length || 0);
  const isAtLimit = !isErrorServers && currentServerCount >= maxServers;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-medium flex items-center gap-2 text-gray-400">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" /></svg>
            {t('title')}
          </h1>
          {/* Usage Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 border border-gray-200 text-sm">
            <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="2" width="20" height="8" rx="2" />
              <rect x="2" y="14" width="20" height="8" rx="2" />
            </svg>
            <span className="text-gray-700">
              {t('usage', { current: currentServerCount, max: maxServers === 4294967295 ? '∞' : maxServers })}
            </span>
          </div>
        </div>
        <Link href="/dashboard/servers/new">
          <Button size="sm" disabled={isAtLimit} className="h-7 text-xs px-2.5">
            <svg className="w-3.5 h-3.5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t('new')}
          </Button>
        </Link>
      </div>

      {/* Upgrade Banner when at limit */}
      {isAtLimit && currentWorkspace?.plan !== 'enterprise' && (
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span>{t('upgrade.serverLimit')}</span>
          </div>
          <Link
            href="/dashboard/billing"
            className="text-violet-600 hover:text-violet-700 font-medium hover:underline"
          >
            {t('upgrade.cta')} →
          </Link>
        </div>
      )}

      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : isErrorServers ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <svg className="w-12 h-12 text-red-400 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-muted-foreground mb-4">{t('loadError')}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              {t('retry')}
            </Button>
          </CardContent>
        </Card>
      ) : servers?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <p className="text-muted-foreground mb-4">{t('empty')}</p>
            <Link href="/dashboard/servers/new">
              <Button>{t('createFirst')}</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {servers?.map((server) => (
            <ServerCard key={server.id} server={server} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

const runtimeStyles: Record<string, { icon: React.ReactNode; iconColor: string; cardBg: string; textColor: string }> = {
  node: { icon: <SiNodedotjs className="w-5 h-5" />, iconColor: 'text-white', cardBg: 'bg-gradient-to-br from-emerald-500 to-teal-600 border-emerald-600', textColor: 'text-white' },
  python: { icon: <SiPython className="w-5 h-5" />, iconColor: 'text-white', cardBg: 'bg-gradient-to-br from-blue-500 to-indigo-600 border-blue-600', textColor: 'text-white' },
  go: { icon: <SiGo className="w-6 h-6" />, iconColor: 'text-white', cardBg: 'bg-gradient-to-br from-cyan-500 to-sky-600 border-cyan-600', textColor: 'text-white' },
  rust: { icon: <SiRust className="w-5 h-5" />, iconColor: 'text-white', cardBg: 'bg-gradient-to-br from-orange-500 to-amber-600 border-orange-600', textColor: 'text-white' },
  docker: { icon: <SiDocker className="w-5 h-5" />, iconColor: 'text-white', cardBg: 'bg-gradient-to-br from-sky-500 to-blue-600 border-sky-600', textColor: 'text-white' },
};

function ServerCard({ server, t }: { server: McpServer; t: (key: string) => string }) {
  const statusColors: Record<string, string> = {
    running: 'bg-green-500',
    building: 'bg-yellow-500',
    deploying: 'bg-blue-500',
    stopped: 'bg-gray-500',
    failed: 'bg-red-500',
    pending: 'bg-gray-500',
  };

  const runtime = runtimeStyles[server.runtime] || runtimeStyles.node;

  return (
    <Link href={`/dashboard/servers/${server.id}`}>
      <Card className={`hover:shadow-xl hover:scale-[1.02] transition-all cursor-pointer ${runtime.cardBg} shadow-lg rounded-[5px]`}>
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-white/20 backdrop-blur-sm">
                <span className={runtime.iconColor}>{runtime.icon}</span>
              </div>
              <div>
                <h3 className="font-semibold text-white">{server.name}</h3>
                <p className="text-sm text-white/70">{server.slug}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-2 py-1 rounded-full bg-white/20">
              <div
                className={`w-2 h-2 rounded-full ${
                  statusColors[server.status] ?? statusColors.pending
                }`}
              />
              <span className="text-xs text-white font-medium">
                {t(`status.${server.status}`)}
              </span>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center text-white/80">
              <span className="mr-2">{t('repo')}:</span>
              <span className="truncate">{server.github_repo}</span>
            </div>
            <div className="flex items-center text-white/80">
              <span className="mr-2">{t('visibility')}:</span>
              <span className="capitalize">{server.visibility}</span>
            </div>
          </div>

          {server.endpoint_url && (
            <div className="mt-4 pt-4 border-t border-white/20">
              <code className="text-xs text-white/70 break-all">
                {server.endpoint_url}
              </code>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
