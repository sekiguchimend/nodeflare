'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { CreateServerRequest, McpServer, Runtime, Visibility, GitHubRepo } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

export default function NewServerPage() {
  const t = useTranslations('servers');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: workspaces } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['workspaces'],
    queryFn: () => api.get('/workspaces'),
  });

  const workspaceId = workspaces?.[0]?.id;

  const { data: servers } = useQuery<McpServer[]>({
    queryKey: ['servers'],
    queryFn: () => api.get('/servers'),
  });

  const { data: repos, isLoading: reposLoading } = useQuery<GitHubRepo[]>({
    queryKey: ['github-repos'],
    queryFn: () => api.get('/github/repos'),
  });

  const isFirstServer = !servers || servers.length === 0;
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);

  const filteredRepos = repos?.filter(
    (repo) =>
      repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      repo.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const [formData, setFormData] = useState<CreateServerRequest>({
    name: '',
    slug: '',
    description: '',
    github_repo: '',
    github_branch: 'main',
    runtime: 'node',
    visibility: 'private',
  });

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 63);
  };

  const handleSelectRepo = (repo: GitHubRepo) => {
    setSelectedRepo(repo);
    const slug = generateSlug(repo.name);
    setFormData({
      ...formData,
      name: repo.name,
      slug: slug,
      github_repo: repo.full_name,
      github_branch: repo.default_branch,
    });
  };

  const createMutation = useMutation({
    mutationFn: (data: CreateServerRequest) => {
      if (!workspaceId) throw new Error('No workspace found');
      return api.post<McpServer>(`/workspaces/${workspaceId}/servers`, data);
    },
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
          <h1 className="text-3xl font-bold mb-2">{t('create.welcome')}</h1>
          <p className="text-muted-foreground">
            {t('create.welcomeDesc')}
          </p>
        </div>
      )}
      <h1 className="text-2xl font-medium mb-6 flex items-center gap-2 text-gray-400">
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" /></svg>
        {isFirstServer ? t('create.firstTitle') : t('create.title')}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>{t('create.configuration')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">{t('create.name')}</Label>
              <Input
                id="name"
                placeholder={t('create.namePlaceholder')}
                value={formData.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setFormData({ ...formData, name, slug: generateSlug(name) });
                }}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t('create.description')}</Label>
              <Input
                id="description"
                placeholder={t('create.descriptionBrief')}
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>{t('create.githubRepo')}</Label>
              {selectedRepo ? (
                <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                      <svg className="w-5 h-5 text-gray-600" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium">{selectedRepo.full_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {selectedRepo.private ? t('create.private') : t('create.visibilityPublic')} · {selectedRepo.language || 'Unknown'}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedRepo(null);
                      setFormData({ ...formData, github_repo: '', name: '' });
                    }}
                  >
                    {tCommon('change')}
                  </Button>
                </div>
              ) : (
                <div className="border rounded-lg">
                  <div className="p-3 border-b">
                    <Input
                      placeholder={t('create.searchRepos')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="border-0 p-0 h-auto focus-visible:ring-0"
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {reposLoading ? (
                      <div className="p-4 text-center text-muted-foreground">
                        {t('create.loadingRepos')}
                      </div>
                    ) : filteredRepos?.length === 0 ? (
                      <div className="p-4 text-center text-muted-foreground">
                        {t('create.noRepos')}
                      </div>
                    ) : (
                      filteredRepos?.map((repo) => (
                        <button
                          key={repo.id}
                          type="button"
                          onClick={() => handleSelectRepo(repo)}
                          className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left border-b last:border-b-0"
                        >
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <svg className="w-4 h-4 text-gray-600" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{repo.name}</p>
                            <p className="text-sm text-muted-foreground truncate">
                              {repo.description || t('create.noDescription')}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
                            {repo.private && (
                              <span className="px-1.5 py-0.5 rounded bg-muted">{t('create.private')}</span>
                            )}
                            {repo.language && <span>{repo.language}</span>}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="github_branch">{t('create.branch')}</Label>
              <Input
                id="github_branch"
                placeholder={t('create.branchPlaceholder')}
                value={formData.github_branch}
                onChange={(e) =>
                  setFormData({ ...formData, github_branch: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="runtime">{t('create.runtime')}</Label>
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
                  <option value="node">{t('create.runtimeNode')}</option>
                  <option value="python">{t('create.runtimePython')}</option>
                  <option value="go">{t('create.runtimeGo')}</option>
                  <option value="rust">{t('create.runtimeRust')}</option>
                  <option value="docker">{t('create.runtimeDocker')}</option>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="visibility">{t('create.visibility')}</Label>
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
                  <option value="private">{t('create.visibilityPrivate')}</option>
                  <option value="public">{t('create.visibilityPublic')}</option>
                  <option value="team">{t('create.visibilityTeam')}</option>
                </Select>
              </div>
            </div>

            <div className="flex justify-end space-x-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                {tCommon('cancel')}
              </Button>
              <Button type="submit" disabled={createMutation.isPending || !workspaceId || !formData.github_repo}>
                {createMutation.isPending ? t('create.creating') : t('create.submit')}
              </Button>
            </div>

            {createMutation.isError && (
              <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
                <p className="text-sm font-medium text-destructive">
                  {(createMutation.error as Error).message || t('create.failed')}
                </p>
                {(() => {
                  const error = createMutation.error as any;
                  if (error?.details?.suggestion) {
                    return (
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('create.trySuggestion')} <code className="px-1 py-0.5 bg-muted rounded">{error.details.suggestion}</code>
                      </p>
                    );
                  }
                  if (error?.details?.supported_runtimes) {
                    return (
                      <p className="text-xs text-muted-foreground mt-1">
                        Supported runtimes: {error.details.supported_runtimes.join(', ')}
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
