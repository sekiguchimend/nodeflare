'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { CreateServerRequest, McpServer, Runtime, Visibility, GitHubRepo, Region, REGIONS } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SiNodedotjs, SiPython, SiGo, SiRust, SiDocker } from 'react-icons/si';

function RegionSelect({
  value,
  onChange,
  t
}: {
  value: Region;
  onChange: (region: Region) => void;
  t: (key: string) => string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedRegion = REGIONS.find(r => r.code === value);

  const groupedRegions = {
    'Asia Pacific': REGIONS.filter(r => r.area === 'Asia Pacific'),
    'Americas': REGIONS.filter(r => r.area === 'Americas'),
    'Europe': REGIONS.filter(r => r.area === 'Europe'),
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-gray-100 bg-white text-gray-900 font-medium cursor-pointer hover:border-gray-200 focus:border-violet-400 focus:outline-none transition-colors text-left"
      >
        <span className={`fi fi-${selectedRegion?.countryCode} text-xl`}></span>
        <span className="flex-1">{t(`regions.${value}`)} ({value.toUpperCase()})</span>
        <svg className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute z-20 w-full mt-2 py-2 bg-white rounded-xl border border-gray-200 shadow-xl max-h-80 overflow-y-auto">
            {Object.entries(groupedRegions).map(([area, regions]) => (
              <div key={area}>
                <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">
                  {t(`regions.${area === 'Asia Pacific' ? 'asiaPacific' : area === 'Americas' ? 'americas' : 'europe'}`)}
                </div>
                {regions.map(region => (
                  <button
                    key={region.code}
                    type="button"
                    onClick={() => {
                      onChange(region.code);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-violet-50 transition-colors text-left ${
                      value === region.code ? 'bg-violet-50 text-violet-700' : 'text-gray-700'
                    }`}
                  >
                    <span className={`fi fi-${region.countryCode} text-xl`}></span>
                    <span className="flex-1">{t(`regions.${region.code}`)} ({region.code.toUpperCase()})</span>
                    {value === region.code && (
                      <svg className="w-5 h-5 text-violet-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

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
    region: 'nrt',
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
    setFormData(prev => ({
      ...prev,
      name: repo.name,
      slug: slug,
      github_repo: repo.full_name,
      github_branch: repo.default_branch,
    }));
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

  const runtimes = [
    { value: 'node', label: t('create.runtimeNode'), color: 'bg-green-600', icon: <SiNodedotjs className="w-5 h-5" /> },
    { value: 'python', label: t('create.runtimePython'), color: 'bg-blue-500', icon: <SiPython className="w-5 h-5" /> },
    { value: 'go', label: t('create.runtimeGo'), color: 'bg-cyan-500', icon: <SiGo className="w-6 h-6" /> },
    { value: 'rust', label: t('create.runtimeRust'), color: 'bg-orange-600', icon: <SiRust className="w-5 h-5" /> },
    { value: 'docker', label: t('create.runtimeDocker'), color: 'bg-sky-500', icon: <SiDocker className="w-5 h-5" /> },
  ];

  const visibilities = [
    { value: 'private', label: t('create.visibilityPrivate'), desc: 'あなただけがアクセス可能', icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
    )},
    { value: 'team', label: t('create.visibilityTeam'), desc: 'チームメンバーがアクセス可能', icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
    )},
    { value: 'public', label: t('create.visibilityPublic'), desc: '誰でもアクセス可能', icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
    )},
  ];

  return (
    <div className="max-w-2xl">
      {/* Welcome message for first server */}
      {isFirstServer && (
        <div className="text-center mb-10 py-8 px-6 rounded-2xl bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-100">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="2" width="20" height="8" rx="2" />
              <rect x="2" y="14" width="20" height="8" rx="2" />
              <line x1="6" y1="6" x2="6.01" y2="6" />
              <line x1="6" y1="18" x2="6.01" y2="18" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('create.welcome')}</h1>
          <p className="text-gray-600">{t('create.welcomeDesc')}</p>
        </div>
      )}

      {/* Header */}
      <h1 className="text-2xl font-medium mb-8 flex items-center gap-2 text-gray-400">
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" /></svg>
        {isFirstServer ? t('create.firstTitle') : t('create.title')}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* GitHub Repository Selection */}
        <section>
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">{t('create.githubRepo')}</h2>

          {selectedRepo ? (
            <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-200">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gray-900 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{selectedRepo.full_name}</p>
                  <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                    {selectedRepo.private ? (
                      <span className="inline-flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                        Private
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /></svg>
                        Public
                      </span>
                    )}
                    {selectedRepo.language && (
                      <>
                        <span>·</span>
                        <span>{selectedRepo.language}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedRepo(null);
                  setFormData(prev => ({ ...prev, github_repo: '', name: '', slug: '' }));
                }}
                className="text-sm text-violet-600 hover:text-violet-700 font-medium"
              >
                {tCommon('change')}
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="p-3 border-b border-gray-100">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50">
                  <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                  <input
                    type="text"
                    placeholder={t('create.searchRepos')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent text-sm focus:outline-none"
                  />
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {reposLoading ? (
                  <div className="p-8 text-center">
                    <div className="w-8 h-8 mx-auto mb-3 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
                    <p className="text-sm text-gray-500">{t('create.loadingRepos')}</p>
                  </div>
                ) : filteredRepos?.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" />
                    </svg>
                    {t('create.noRepos')}
                  </div>
                ) : (
                  filteredRepos?.map((repo) => (
                    <button
                      key={repo.id}
                      type="button"
                      onClick={() => handleSelectRepo(repo)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-violet-50 transition-colors text-left border-b border-gray-50 last:border-b-0"
                    >
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-gray-600" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{repo.name}</p>
                        <p className="text-sm text-gray-500 truncate">
                          {repo.description || t('create.noDescription')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {repo.private && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">Private</span>
                        )}
                        {repo.language && (
                          <span className="text-xs text-gray-400">{repo.language}</span>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </section>

        {/* Server Details */}
        <section>
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">{t('create.configuration')}</h2>

          <div className="space-y-4">
            <div>
              <Label htmlFor="name" className="text-gray-700">{t('create.name')}</Label>
              <Input
                id="name"
                placeholder={t('create.namePlaceholder')}
                value={formData.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setFormData(prev => ({ ...prev, name, slug: generateSlug(name) }));
                }}
                required
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="description" className="text-gray-700">{t('create.description')}</Label>
              <Input
                id="description"
                placeholder={t('create.descriptionBrief')}
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="github_branch" className="text-gray-700">{t('create.branch')}</Label>
              <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white">
                <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 3v12" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
                </svg>
                <input
                  id="github_branch"
                  type="text"
                  placeholder={t('create.branchPlaceholder')}
                  value={formData.github_branch}
                  onChange={(e) => setFormData(prev => ({ ...prev, github_branch: e.target.value }))}
                  className="flex-1 bg-transparent text-sm focus:outline-none"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Runtime Selection */}
        <section>
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">{t('create.runtime')}</h2>

          <div className="grid grid-cols-5 gap-2">
            {runtimes.map((runtime) => (
              <button
                key={runtime.value}
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, runtime: runtime.value as Runtime }))}
                className={`p-3 rounded-xl text-center transition-all ${
                  formData.runtime === runtime.value
                    ? 'bg-violet-100 border-2 border-violet-400 shadow-sm'
                    : 'bg-white border-2 border-gray-100 hover:border-gray-200'
                }`}
              >
                <div className={`w-10 h-10 mx-auto mb-2 rounded-lg ${runtime.color} flex items-center justify-center text-white`}>
                  {runtime.icon}
                </div>
                <span className="text-xs font-medium text-gray-700">{runtime.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Visibility Selection */}
        <section>
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">{t('create.visibility')}</h2>

          <div className="flex gap-2">
            {visibilities.map((vis) => (
              <button
                key={vis.value}
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, visibility: vis.value as Visibility }))}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all ${
                  formData.visibility === vis.value
                    ? 'bg-violet-100 border-2 border-violet-400 text-violet-700'
                    : 'bg-white border-2 border-gray-100 hover:border-gray-200 text-gray-600'
                }`}
              >
                <span className={formData.visibility === vis.value ? 'text-violet-600' : 'text-gray-400'}>
                  {vis.icon}
                </span>
                <span className="text-sm font-medium">{vis.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Region Selection */}
        <section>
          <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">{t('create.region')}</h2>
          <p className="text-sm text-gray-500 mb-4">{t('create.regionHelp')}</p>

          <RegionSelect
            value={formData.region || 'nrt'}
            onChange={(region) => setFormData(prev => ({ ...prev, region }))}
            t={t}
          />
        </section>

        {/* Error Message */}
        {createMutation.isError && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M15 9l-6 6M9 9l6 6" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-red-800">
                  {(createMutation.error as Error).message || t('create.failed')}
                </p>
                {(() => {
                  const error = createMutation.error as any;
                  if (error?.details?.suggestion) {
                    return (
                      <p className="text-sm text-red-600 mt-1">
                        {t('create.trySuggestion')} <code className="px-1.5 py-0.5 bg-red-100 rounded text-xs">{error.details.suggestion}</code>
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            {tCommon('cancel')}
          </Button>
          <Button
            type="submit"
            disabled={createMutation.isPending || !workspaceId || !formData.github_repo}
            className="bg-violet-600 hover:bg-violet-700 gap-2"
          >
            {createMutation.isPending ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                </svg>
                {t('create.creating')}
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {t('create.submit')}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
