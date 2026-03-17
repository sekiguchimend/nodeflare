'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ApiKey, CreateApiKeyRequest, CreateApiKeyResponse } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ApiKeysPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);

  const { data: apiKeys, isLoading } = useQuery<ApiKey[]>({
    queryKey: ['api-keys'],
    queryFn: () => api.get('/api-keys'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">API Keys</h1>
        <Button onClick={() => setShowCreate(true)}>Create API Key</Button>
      </div>

      {newKeyValue && (
        <Card className="border-green-500 bg-green-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-green-800">
                  API Key created successfully!
                </p>
                <p className="text-sm text-green-700 mt-1">
                  Make sure to copy this key now. You won&apos;t be able to see
                  it again.
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
                Copy
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => setNewKeyValue(null)}
            >
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {showCreate && (
        <CreateApiKeyForm
          onClose={() => setShowCreate(false)}
          onCreated={(key) => {
            setNewKeyValue(key);
            setShowCreate(false);
          }}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your API Keys</CardTitle>
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
              No API keys yet
            </div>
          ) : (
            <div className="divide-y">
              {apiKeys?.map((apiKey) => (
                <ApiKeyRow key={apiKey.id} apiKey={apiKey} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Predefined scopes with descriptions
const PREDEFINED_SCOPES = [
  { value: '*', label: 'Full Access', description: 'All permissions (tools, resources, prompts)' },
  { value: 'tools:*', label: 'Tools - All', description: 'List and call any tool' },
  { value: 'tools:list', label: 'Tools - List Only', description: 'Only list available tools' },
  { value: 'tools:call', label: 'Tools - Call Any', description: 'Call any tool (includes list)' },
  { value: 'resources:*', label: 'Resources - All', description: 'List and read any resource' },
  { value: 'resources:list', label: 'Resources - List Only', description: 'Only list resources' },
  { value: 'resources:read', label: 'Resources - Read Any', description: 'Read any resource' },
  { value: 'prompts:*', label: 'Prompts - All', description: 'List and get any prompt' },
  { value: 'prompts:list', label: 'Prompts - List Only', description: 'Only list prompts' },
  { value: 'prompts:get', label: 'Prompts - Get Any', description: 'Get any prompt content' },
] as const;

function CreateApiKeyForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (key: string) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [rateLimit, setRateLimit] = useState('1000');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['*']);
  const [customScope, setCustomScope] = useState('');

  const createMutation = useMutation({
    mutationFn: (data: CreateApiKeyRequest) =>
      api.post<CreateApiKeyResponse>('/api-keys', data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      onCreated(response.key);
    },
  });

  const toggleScope = (scope: string) => {
    if (scope === '*') {
      // If selecting full access, clear other scopes
      setSelectedScopes(['*']);
    } else {
      setSelectedScopes((prev) => {
        // Remove '*' if selecting specific scopes
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
        <CardTitle>Create New API Key</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="My API Key"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Scopes (Permissions)</Label>
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
                    <div className="font-medium text-sm">{scope.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {scope.description}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="customScope">Custom Scope (Optional)</Label>
            <div className="flex space-x-2">
              <Input
                id="customScope"
                placeholder="tools:call:specific_tool_name"
                value={customScope}
                onChange={(e) => setCustomScope(e.target.value)}
              />
              <Button type="button" variant="outline" onClick={addCustomScope}>
                Add
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Examples: <code>tools:call:get_weather</code>, <code>resources:read:file://data</code>
            </p>
          </div>

          {selectedScopes.length > 0 && !selectedScopes.includes('*') && (
            <div className="space-y-2">
              <Label>Selected Scopes</Label>
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
            <Label htmlFor="rateLimit">Rate Limit (requests/hour)</Label>
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
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create'}
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

function ApiKeyRow({ apiKey }: { apiKey: ApiKey }) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api-keys/${apiKey.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const formatScopes = (scopes: string[]) => {
    if (scopes.includes('*')) return 'Full Access';
    if (scopes.length === 0) return 'No permissions';
    if (scopes.length <= 2) return scopes.join(', ');
    return `${scopes.slice(0, 2).join(', ')} +${scopes.length - 2} more`;
  };

  return (
    <div className="p-4 flex items-center justify-between">
      <div className="space-y-1">
        <div className="font-medium">{apiKey.name}</div>
        <div className="text-sm text-muted-foreground">
          <code>{apiKey.key_prefix}...</code>
          <span className="mx-2">•</span>
          {apiKey.rate_limit && <>Rate: {apiKey.rate_limit}/hr</>}
          {apiKey.last_used_at && (
            <>
              <span className="mx-2">•</span>
              Last used: {new Date(apiKey.last_used_at).toLocaleDateString()}
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
              {scope === '*' ? 'Full Access' : scope}
            </span>
          ))}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          if (confirm('Are you sure you want to delete this API key?')) {
            deleteMutation.mutate();
          }
        }}
      >
        Delete
      </Button>
    </div>
  );
}
