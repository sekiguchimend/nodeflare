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

  const createMutation = useMutation({
    mutationFn: (data: CreateApiKeyRequest) =>
      api.post<CreateApiKeyResponse>('/api-keys', data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      onCreated(response.key);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      name,
      scopes: ['*'],
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

  return (
    <div className="p-4 flex items-center justify-between">
      <div>
        <div className="font-medium">{apiKey.name}</div>
        <div className="text-sm text-muted-foreground">
          <code>{apiKey.key_prefix}...</code>
          <span className="mx-2">•</span>
          Rate limit: {apiKey.rate_limit}/hr
          {apiKey.last_used_at && (
            <>
              <span className="mx-2">•</span>
              Last used: {new Date(apiKey.last_used_at).toLocaleDateString()}
            </>
          )}
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
