'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { RequestLog, PaginatedResponse } from '@/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export default function LogsPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<PaginatedResponse<RequestLog>>({
    queryKey: ['logs', page],
    queryFn: () => api.get(`/logs?page=${page}&per_page=50`),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Request Logs</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Requests</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(10)].map((_, i) => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : !data || data.data.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No requests logged yet
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        Time
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        Method
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        Path
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        Tool
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                        Duration
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
                  Showing {(page - 1) * 50 + 1} to{' '}
                  {Math.min(page * 50, data.total)} of {data.total} results
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page * 50 >= data.total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
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
