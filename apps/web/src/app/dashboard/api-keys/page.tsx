'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { ApiKey, CreateApiKeyRequest, CreateApiKeyResponse, Workspace } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ApiKeysPage() {
  const t = useTranslations('apiKeys');
  const tCommon = useTranslations('common');
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const { data: workspaces, isLoading: isLoadingWorkspaces } = useQuery<Workspace[]>({
    queryKey: ['workspaces'],
    queryFn: () => api.get('/workspaces'),
  });

  const workspaceId = selectedWorkspaceId || workspaces?.[0]?.id;

  const { data: apiKeys, isLoading: isLoadingKeys } = useQuery<ApiKey[]>({
    queryKey: ['workspaces', workspaceId, 'api-keys'],
    queryFn: () => api.get(`/workspaces/${workspaceId}/api-keys`),
    enabled: !!workspaceId,
  });

  const isLoading = isLoadingWorkspaces || isLoadingKeys;

  const handleCopyKey = () => {
    if (newKeyValue) {
      navigator.clipboard.writeText(newKeyValue);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl font-medium flex items-center gap-2 text-gray-400">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>
            {t('title')}
          </h1>
          {workspaces && workspaces.length > 1 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 border border-gray-200">
              <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <select
                className="bg-transparent text-sm font-medium text-gray-700 focus:outline-none cursor-pointer pr-6 appearance-none"
                value={workspaceId || ''}
                onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0 center' }}
              >
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>{ws.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        {!showCreate && (
          <Button
            size="sm"
            onClick={() => setShowCreate(true)}
            disabled={!workspaceId}
            className="h-7 text-xs px-2.5 bg-violet-600 hover:bg-violet-700 text-white"
          >
            <svg className="w-3.5 h-3.5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t('new')}
          </Button>
        )}
      </div>

      {/* New Key Success Banner */}
      {newKeyValue && (
        <div className="mb-8 p-5 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-emerald-800">{t('created')}</p>
              <p className="text-sm text-emerald-700 mt-1">{t('createdWarning')}</p>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-white rounded-lg border border-emerald-200 text-sm font-mono text-gray-800 truncate">
                  {newKeyValue}
                </code>
                <Button
                  size="sm"
                  variant={copiedKey ? "default" : "outline"}
                  className={copiedKey ? "bg-emerald-600 hover:bg-emerald-600" : ""}
                  onClick={handleCopyKey}
                >
                  {copiedKey ? "Copied!" : tCommon('copy')}
                </Button>
              </div>
            </div>
            <button
              onClick={() => setNewKeyValue(null)}
              className="text-emerald-400 hover:text-emerald-600 transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Create Form */}
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

      {/* API Keys List */}
      <div>
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">{t('yourKeys')}</h2>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-100 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : apiKeys?.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-gray-500">{t('empty')}</p>
          </div>
        ) : (
          <div>
            {apiKeys?.map((apiKey, index) => (
              <ApiKeyRow
                key={apiKey.id}
                apiKey={apiKey}
                workspaceId={workspaceId!}
                t={t}
                tCommon={tCommon}
                isFirst={index === 0}
                isLast={index === apiKeys.length - 1}
              />
            ))}
          </div>
        )}
      </div>
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
    });
  };

  return (
    <div className="mb-8 p-6 rounded-2xl bg-gray-50 border border-gray-200">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">{t('create.title')}</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <Label htmlFor="name" className="text-gray-700">{t('create.name')}</Label>
          <Input
            id="name"
            placeholder={t('create.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="mt-2 bg-white"
          />
        </div>

        <div>
          <Label className="text-gray-700 mb-3 block">{t('scopes.title')}</Label>
          <div className="grid grid-cols-2 gap-2">
            {PREDEFINED_SCOPES.map((scope) => (
              <label
                key={scope.value}
                className={`flex items-start space-x-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedScopes.includes(scope.value)
                    ? 'border-violet-500 bg-violet-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
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
                  <div className="text-xs text-gray-500">{t(scope.descKey)}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div>
          <Label htmlFor="customScope" className="text-gray-700">{t('customScope')}</Label>
          <div className="flex gap-2 mt-2">
            <Input
              id="customScope"
              placeholder="tools:call:specific_tool_name"
              value={customScope}
              onChange={(e) => setCustomScope(e.target.value)}
              className="bg-white"
            />
            <Button type="button" variant="outline" onClick={addCustomScope}>
              {tCommon('add')}
            </Button>
          </div>
          <p className="text-xs text-gray-500 mt-2">{t('customScopeExamples')}</p>
        </div>

        {selectedScopes.length > 0 && !selectedScopes.includes('*') && (
          <div>
            <Label className="text-gray-700 mb-2 block">{t('scopes.selected')}</Label>
            <div className="flex flex-wrap gap-2">
              {selectedScopes.map((scope) => (
                <span
                  key={scope}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-violet-100 text-violet-700 rounded-full"
                >
                  <code className="text-xs">{scope}</code>
                  <button
                    type="button"
                    onClick={() => removeScope(scope)}
                    className="ml-1 text-violet-400 hover:text-violet-600"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          <Button type="button" variant="ghost" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
          <Button type="submit" disabled={createMutation.isPending} className="bg-violet-600 hover:bg-violet-700">
            {createMutation.isPending ? t('create.creating') : t('create.submit')}
          </Button>
        </div>

        {createMutation.isError && (
          <p className="text-sm text-red-600">{(createMutation.error as Error).message}</p>
        )}
      </form>
    </div>
  );
}

function ApiKeyRow({
  apiKey,
  workspaceId,
  t,
  tCommon,
  isFirst,
  isLast
}: {
  apiKey: ApiKey;
  workspaceId: string;
  t: (key: string, values?: Record<string, string | number>) => string;
  tCommon: (key: string) => string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/workspaces/${workspaceId}/api-keys/${apiKey.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'api-keys'] });
    },
  });

  const formatLastUsed = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '今';
    if (diffMins < 60) return `${diffMins}分前`;
    if (diffHours < 24) return `${diffHours}時間前`;
    if (diffDays < 7) return `${diffDays}日前`;
    return date.toLocaleDateString();
  };

  return (
    <div
      className={`group flex items-center gap-4 px-4 py-3 bg-white border-x border-b border-gray-200 hover:bg-gray-50 transition-colors ${
        isFirst ? 'border-t rounded-t-lg' : ''
      } ${isLast ? 'rounded-b-lg' : ''}`}
    >
      {/* Key Icon */}
      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
        <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        {/* Top Row: Name + Last Used */}
        <div className="flex items-center justify-between">
          <span className="font-medium text-gray-900">{apiKey.name}</span>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span>{new Date(apiKey.created_at).toLocaleDateString()}に作成</span>
            {apiKey.last_used_at && (
              <>
                <span className="text-gray-300">•</span>
                <span>{formatLastUsed(apiKey.last_used_at)}に使用</span>
              </>
            )}
          </div>
        </div>
        {/* Bottom Row: Key Prefix + Scopes */}
        <div className="flex items-center gap-2 mt-1">
          <code className="text-xs text-gray-500 font-mono">{apiKey.key_prefix}...</code>
          <span className="text-gray-300">•</span>
          <span className="text-xs text-gray-500">
            {apiKey.scopes?.includes('*')
              ? t('scopes.fullAccess')
              : apiKey.scopes?.slice(0, 2).join(', ') + (apiKey.scopes && apiKey.scopes.length > 2 ? ` +${apiKey.scopes.length - 2}` : '')
            }
          </span>
        </div>
      </div>

      {/* Delete Button */}
      <button
        onClick={() => {
          if (confirm(t('revokeConfirm'))) {
            deleteMutation.mutate();
          }
        }}
        disabled={deleteMutation.isPending}
        className="p-2 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
        title={t('revoke')}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
