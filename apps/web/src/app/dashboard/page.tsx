'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { McpServer } from '@/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function DashboardPage() {
  const router = useRouter();
  const { data: servers, isLoading, isSuccess } = useQuery<McpServer[]>({
    queryKey: ['servers'],
    queryFn: () => api.get('/servers'),
  });

  const hasNoServers = isSuccess && (!servers || servers.length === 0);

  // Redirect to create page if no servers
  useEffect(() => {
    if (hasNoServers) {
      router.replace('/dashboard/servers/new');
    }
  }, [hasNoServers, router]);

  const runningServers = servers?.filter((s) => s.status === 'running') ?? [];
  const recentServers = servers?.slice(0, 5) ?? [];

  // Show loading while checking or redirecting
  if (isLoading || hasNoServers) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Link href="/dashboard/servers/new">
          <Button>New Server</Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Servers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {servers?.length ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Running
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {runningServers.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Requests (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Errors (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">-</div>
          </CardContent>
        </Card>
      </div>

      {/* Recent servers */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Servers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {recentServers.map((server) => (
              <Link
                key={server.id}
                href={`/dashboard/servers/${server.id}`}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors"
              >
                <div>
                  <div className="font-medium">{server.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {server.github_repo}
                  </div>
                </div>
                <StatusBadge status={server.status} />
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
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
      className={`px-2 py-1 text-xs font-medium rounded-full ${
        colors[status] ?? colors.pending
      }`}
    >
      {status}
    </span>
  );
}
