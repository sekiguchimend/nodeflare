'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { McpServer } from '@/types';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function ServersPage() {
  const { data: servers, isLoading } = useQuery<McpServer[]>({
    queryKey: ['servers'],
    queryFn: () => api.get('/servers'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Servers</h1>
        <Link href="/dashboard/servers/new">
          <Button>New Server</Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : servers?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <p className="text-muted-foreground mb-4">No servers yet</p>
            <Link href="/dashboard/servers/new">
              <Button>Create your first server</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {servers?.map((server) => (
            <ServerCard key={server.id} server={server} />
          ))}
        </div>
      )}
    </div>
  );
}

function ServerCard({ server }: { server: McpServer }) {
  const statusColors: Record<string, string> = {
    running: 'bg-green-500',
    building: 'bg-yellow-500',
    deploying: 'bg-blue-500',
    stopped: 'bg-gray-500',
    failed: 'bg-red-500',
    pending: 'bg-gray-500',
  };

  return (
    <Link href={`/dashboard/servers/${server.id}`}>
      <Card className="hover:border-primary/50 transition-colors cursor-pointer">
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="font-semibold">{server.name}</h3>
              <p className="text-sm text-muted-foreground">{server.slug}</p>
            </div>
            <div className="flex items-center space-x-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  statusColors[server.status] ?? statusColors.pending
                }`}
              />
              <span className="text-xs text-muted-foreground capitalize">
                {server.status}
              </span>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center text-muted-foreground">
              <span className="mr-2">Repo:</span>
              <span className="truncate">{server.github_repo}</span>
            </div>
            <div className="flex items-center text-muted-foreground">
              <span className="mr-2">Runtime:</span>
              <span className="capitalize">{server.runtime}</span>
            </div>
            <div className="flex items-center text-muted-foreground">
              <span className="mr-2">Visibility:</span>
              <span className="capitalize">{server.visibility}</span>
            </div>
          </div>

          {server.endpoint_url && (
            <div className="mt-4 pt-4 border-t">
              <code className="text-xs text-muted-foreground break-all">
                {server.endpoint_url}
              </code>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
