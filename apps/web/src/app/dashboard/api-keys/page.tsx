'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { ApiKey, CreateApiKeyRequest, CreateApiKeyResponse, Workspace } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ApiKeysPage() {
  const t = useTranslations('apiKeys');
  const tCommon = useTranslations('common');
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);

  // Fetch workspaces first
  const { data: workspaces, isLoading: isLoadingWorkspaces } = useQuery<Workspace[]>({
    queryKey: ['workspaces'],
    queryFn: () => api.get('/workspaces'),
  });

  // Auto-select first workspace if not selected
  const workspaceId = selectedWorkspaceId || workspaces?.[0]?.id;

  const { data: apiKeys, isLoading: isLoadingKeys } = useQuery<ApiKey[]>({
    queryKey: ['workspaces', workspaceId, 'api-keys'],
    queryFn: () => api.get(`/workspaces/${workspaceId}/api-keys`),
    enabled: !!workspaceId,
  });

  const isLoading = isLoadingWorkspaces || isLoadingKeys;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl font-medium flex items-center gap-2 text-gray-400">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>
            {t('title')}
          </h1>
          {workspaces && workspaces.length > 1 && (
            <select
              className="h-10 px-3 rounded-md border border-input bg-background text-sm"
              value={workspaceId || ''}
              onChange={(e) => setSelectedWorkspaceId(e.target.value)}
            >
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <Button onClick={() => setShowCreate(true)} disabled={!workspaceId}>{t('new')}</Button>
      </div>

      {newKeyValue && (
        <Card className="border-green-500 bg-green-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-green-800">
                  {t('created')}
                </p>
                <p className="text-sm text-green-700 mt-1">
                  {t('createdWarning')}
                </p>
                <code className="mt-2 block bg-white p-2 rounded border text-sm">
                  {newKeyValue}
                </code>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(newKeyValue);
                }}
              >
                {tCommon('copy')}
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setNewKeyValue(null)}
            >
              {tCommon('dismiss')}
            </Button>
          </CardContent>
        </Card>
      )}

      {showCreate && workspaceId && (
        <CreateApiKeyForm
          workspaceId={workspaceId}
          onClose={() => setShowCreate(false)}
          onCreated={(key) => {
            setNewKeyValue(key);
            setShowCreate(false);
          }}
          t={t}
          tCommon={tCommon}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('yourKeys')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : apiKeys?.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              {t('empty')}
            </div>
          ) : (
            <div className="divide-y">
              {apiKeys?.map((apiKey) => (
                <ApiKeyRow key={apiKey.id} apiKey={apiKey} workspaceId={workspaceId!} t={t} tCommon={tCommon} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CreateApiKeyForm({
  workspaceId,
  onClose,
  onCreated,
  t,
  tCommon,
}: {
  workspaceId: string;
  onClose: () => void;
  onCreated: (key: string) => void;
  t: (key: string) => string;
  tCommon: (key: string) => string;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [rateLimit, setRateLimit] = useState('1000');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['*']);
  const [customScope, setCustomScope] = useState('');

  const PREDEFINED_SCOPES = [
    { value: '*', labelKey: 'scopes.fullAccess', descKey: 'scopes.fullAccessDesc' },
    { value: 'tools:*', labelKey: 'scopes.toolsAll', descKey: 'scopes.toolsAllDesc' },
    { value: 'tools:list', labelKey: 'scopes.toolsList', descKey: 'scopes.toolsListDesc' },
    { value: 'tools:call', labelKey: 'scopes.toolsCall', descKey: 'scopes.toolsCallDesc' },
    { value: 'resources:*', labelKey: 'scopes.resourcesAll', descKey: 'scopes.resourcesAllDesc' },
    { value: 'resources:list', labelKey: 'scopes.resourcesList', descKey: 'scopes.resourcesListDesc' },
    { value: 'resources:read', labelKey: 'scopes.resourcesRead', descKey: 'scopes.resourcesReadDesc' },
    { value: 'prompts:*', labelKey: 'scopes.promptsAll', descKey: 'scopes.promptsAllDesc' },
    { value: 'prompts:list', labelKey: 'scopes.promptsList', descKey: 'scopes.promptsListDesc' },
    { value: 'prompts:get', labelKey: 'scopes.promptsGet', descKey: 'scopes.promptsGetDesc' },
  ];

  const createMutation = useMutation({
    mutationFn: (data: CreateApiKeyRequest) =>
      api.post<CreateApiKeyResponse>(`/workspaces/${workspaceId}/api-keys`, data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'api-keys'] });
      onCreated(response.key);
    },
  });

  const toggleScope = (scope: string) => {
    if (scope === '*') {
      setSelectedScopes(['*']);
    } else {
      setSelectedScopes((prev) => {
        const filtered = prev.filter((s) => s !== '*');
        if (filtered.includes(scope)) {
          const result = filtered.filter((s) => s !== scope);
          return result.length === 0 ? ['*'] : result;
        } else {
          return [...filtered, scope];
        }
      });
    }
  };

  const addCustomScope = () => {
    if (customScope && !selectedScopes.includes(customScope)) {
      setSelectedScopes((prev) => {
        const filtered = prev.filter((s) => s !== '*');
        return [...filtered, customScope];
      });
      setCustomScope('');
    }
  };

  const removeScope = (scope: string) => {
    setSelectedScopes((prev) => {
      const result = prev.filter((s) => s !== scope);
      return result.length === 0 ? ['*'] : result;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      name,
      scopes: selectedScopes,
      rate_limit: parseInt(rateLimit, 10),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('create.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('create.name')}</Label>
            <Input
              id="name"
              placeholder={t('create.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>{t('scopes.title')}</Label>
            <div className="grid grid-cols-2 gap-2">
              {PREDEFINED_SCOPES.map((scope) => (
                <label
                  key={scope.value}
                  className={`flex items-start space-x-2 p-2 rounded border cursor-pointer transition-colors ${
                    selectedScopes.includes(scope.value)
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedScopes.includes(scope.value)}
                    onChange={() => toggleScope(scope.value)}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-medium text-sm">{t(scope.labelKey)}</div>
                    <div className="text-xs text-muted-foreground">
                      {t(scope.descKey)}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="customScope">{t('customScope')}</Label>
            <div className="flex space-x-2">
              <Input
                id="customScope"
                placeholder="tools:call:specific_tool_name"
                value={customScope}
                onChange={(e) => setCustomScope(e.target.value)}
              />
              <Button type="button" variant="outline" onClick={addCustomScope}>
                {tCommon('add')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('customScopeExamples')}
            </p>
          </div>

          {selectedScopes.length > 0 && !selectedScopes.includes('*') && (
            <div className="space-y-2">
              <Label>{t('scopes.selected')}</Label>
              <div className="flex flex-wrap gap-2">
                {selectedScopes.map((scope) => (
                  <span
                    key={scope}
                    className="inline-flex items-center px-2 py-1 text-xs bg-secondary rounded"
                  >
                    <code>{scope}</code>
                    <button
                      type="button"
                      onClick={() => removeScope(scope)}
                      className="ml-1 text-muted-foreground hover:text-foreground"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="rateLimit">{t('rateLimit')}</Label>
            <Input
              id="rateLimit"
              type="number"
              value={rateLimit}
              onChange={(e) => setRateLimit(e.target.value)}
              min="1"
              max="100000"
            />
          </div>

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {tCommon('cancel')}
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? t('create.creating') : t('create.submit')}
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
  );
}

function ApiKeyRow({ apiKey, workspaceId, t, tCommon }: { apiKey: ApiKey; workspaceId: string; t: (key: string, values?: Record<string, string | number>) => string; tCommon: (key: string) => string }) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/workspaces/${workspaceId}/api-keys/${apiKey.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'api-keys'] });
    },
  });

  return (
    <div className="p-4 flex items-center justify-between">
      <div className="space-y-1">
        <div className="font-medium">{apiKey.name}</div>
        <div className="text-sm text-muted-foreground">
          <code>{apiKey.key_prefix}...</code>
          <span className="mx-2">•</span>
          {apiKey.rate_limit && <>{t('rate', { rate: apiKey.rate_limit })}</>}
          {apiKey.last_used_at && (
            <>
              <span className="mx-2">•</span>
              {t('lastUsed', { date: new Date(apiKey.last_used_at).toLocaleDateString() })}
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {apiKey.scopes?.map((scope) => (
            <span
              key={scope}
              className="inline-flex items-center px-1.5 py-0.5 text-xs bg-secondary rounded"
              title={scope}
            >
              {scope === '*' ? t('scopes.fullAccess') : scope}
            </span>
          ))}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          if (confirm(t('revokeConfirm'))) {
            deleteMutation.mutate();
          }
        }}
      >
        {t('revoke')}
      </Button>
    </div>
  );
}
