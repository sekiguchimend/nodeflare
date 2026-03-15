'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { CreateServerRequest, McpServer, Runtime, Visibility } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

export default function NewServerPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: servers } = useQuery<McpServer[]>({
    queryKey: ['servers'],
    queryFn: () => api.get('/servers'),
  });

  const isFirstServer = !servers || servers.length === 0;

  const [formData, setFormData] = useState<CreateServerRequest>({
    name: '',
    description: '',
    github_repo: '',
    github_branch: 'main',
    runtime: 'node',
    visibility: 'private',
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateServerRequest) =>
      api.post<McpServer>('/servers', data),
    onSuccess: (server) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      router.push(`/dashboard/servers/${server.id}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  return (
    <div className="max-w-2xl mx-auto">
      {isFirstServer && (
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Welcome to MCP Cloud</h1>
          <p className="text-muted-foreground">
            Deploy your first MCP server in seconds. Connect your GitHub repository and we'll handle the rest.
          </p>
        </div>
      )}
      <h1 className="text-2xl font-bold mb-6">
        {isFirstServer ? 'Create Your First Server' : 'Create New Server'}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Server Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="my-mcp-server"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="A brief description of your server"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="github_repo">GitHub Repository</Label>
              <Input
                id="github_repo"
                placeholder="owner/repo"
                value={formData.github_repo}
                onChange={(e) =>
                  setFormData({ ...formData, github_repo: e.target.value })
                }
                required
              />
              <p className="text-xs text-muted-foreground">
                Format: owner/repository
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="github_branch">Branch</Label>
              <Input
                id="github_branch"
                placeholder="main"
                value={formData.github_branch}
                onChange={(e) =>
                  setFormData({ ...formData, github_branch: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="runtime">Runtime</Label>
                <Select
                  id="runtime"
                  value={formData.runtime}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      runtime: e.target.value as Runtime,
                    })
                  }
                >
                  <option value="node">Node.js</option>
                  <option value="python">Python</option>
                  <option value="docker">Docker</option>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="visibility">Visibility</Label>
                <Select
                  id="visibility"
                  value={formData.visibility}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      visibility: e.target.value as Visibility,
                    })
                  }
                >
                  <option value="private">Private</option>
                  <option value="public">Public</option>
                  <option value="team">Team</option>
                </Select>
              </div>
            </div>

            <div className="flex justify-end space-x-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create Server'}
              </Button>
            </div>

            {createMutation.isError && (
              <p className="text-sm text-destructive">
                {(createMutation.error as Error).message}
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
