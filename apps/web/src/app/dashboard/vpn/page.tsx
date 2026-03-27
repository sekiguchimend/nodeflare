'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Workspace {
  id: string;
  name: string;
  slug: string;
}

interface WireGuardConfig {
  peer_name: string;
  config_file: string;
  peer_ip: string;
  instructions: string[];
}

interface CreateWireGuardRequest {
  name: string;
  region: string;
}

const REGIONS = [
  { code: 'nrt', name: 'Tokyo', flag: '🇯🇵' },
  { code: 'sin', name: 'Singapore', flag: '🇸🇬' },
  { code: 'hkg', name: 'Hong Kong', flag: '🇭🇰' },
  { code: 'syd', name: 'Sydney', flag: '🇦🇺' },
  { code: 'iad', name: 'Virginia', flag: '🇺🇸' },
  { code: 'fra', name: 'Frankfurt', flag: '🇩🇪' },
  { code: 'lhr', name: 'London', flag: '🇬🇧' },
];

export default function VPNPage() {
  const t = useTranslations('vpn');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [peerName, setPeerName] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('nrt');
  const [generatedConfig, setGeneratedConfig] = useState<WireGuardConfig | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: workspaces, isLoading: isLoadingWorkspaces } = useQuery<Workspace[]>({
    queryKey: ['workspaces'],
    queryFn: () => api.get('/workspaces'),
  });

  const workspaceId = workspaces?.[0]?.id;

  const createMutation = useMutation({
    mutationFn: (data: CreateWireGuardRequest) =>
      api.post<WireGuardConfig>(`/workspaces/${workspaceId}/wireguard`, data),
    onSuccess: (config) => {
      setGeneratedConfig(config);
      setShowCreate(false);
      setPeerName('');
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!peerName.trim()) return;
    createMutation.mutate({ name: peerName, region: selectedRegion });
  };

  const handleCopyConfig = () => {
    if (generatedConfig) {
      navigator.clipboard.writeText(generatedConfig.config_file);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadConfig = () => {
    if (generatedConfig) {
      const blob = new Blob([generatedConfig.config_file], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${generatedConfig.peer_name}.conf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  if (isLoadingWorkspaces) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-medium flex items-center gap-2 text-gray-400">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            {t('title')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{t('description')}</p>
        </div>
        <Button onClick={() => setShowCreate(true)} disabled={!workspaceId}>
          <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t('createConnection')}
        </Button>
      </div>

      {/* How it works */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">{t('howItWorks')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="flex flex-col items-center text-center p-4 bg-gray-50 rounded-lg">
            <div className="w-10 h-10 bg-violet-100 rounded-full flex items-center justify-center mb-3">
              <span className="text-violet-600 font-bold">1</span>
            </div>
            <p className="text-sm text-gray-600">{t('step1')}</p>
          </div>
          <div className="flex flex-col items-center text-center p-4 bg-gray-50 rounded-lg">
            <div className="w-10 h-10 bg-violet-100 rounded-full flex items-center justify-center mb-3">
              <span className="text-violet-600 font-bold">2</span>
            </div>
            <p className="text-sm text-gray-600">{t('step2')}</p>
          </div>
          <div className="flex flex-col items-center text-center p-4 bg-gray-50 rounded-lg">
            <div className="w-10 h-10 bg-violet-100 rounded-full flex items-center justify-center mb-3">
              <span className="text-violet-600 font-bold">3</span>
            </div>
            <p className="text-sm text-gray-600">{t('step3')}</p>
          </div>
          <div className="flex flex-col items-center text-center p-4 bg-gray-50 rounded-lg">
            <div className="w-10 h-10 bg-violet-100 rounded-full flex items-center justify-center mb-3">
              <span className="text-violet-600 font-bold">4</span>
            </div>
            <p className="text-sm text-gray-600">{t('step4')}</p>
          </div>
        </div>
      </div>

      {/* Generated Config */}
      {generatedConfig && (
        <div className="bg-white rounded-xl border p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <svg className="w-5 h-5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              {t('configGenerated')}
            </h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyConfig}>
                {copied ? (
                  <>
                    <svg className="w-4 h-4 mr-1 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {tCommon('copied')}
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    {tCommon('copy')}
                  </>
                )}
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadConfig}>
                <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {t('download')}
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label className="text-gray-500">{t('peerName')}</Label>
              <p className="font-mono text-sm bg-gray-50 p-2 rounded">{generatedConfig.peer_name}</p>
            </div>
            <div>
              <Label className="text-gray-500">{t('peerIP')}</Label>
              <p className="font-mono text-sm bg-gray-50 p-2 rounded">{generatedConfig.peer_ip}</p>
            </div>
            <div>
              <Label className="text-gray-500">{t('configFile')}</Label>
              <pre className="font-mono text-xs bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto">
                {generatedConfig.config_file}
              </pre>
            </div>
          </div>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h3 className="font-medium text-blue-800 mb-2">{t('nextSteps')}</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-blue-700">
              {generatedConfig.instructions.map((instruction, i) => (
                <li key={i}>{instruction}</li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!generatedConfig && !showCreate && (
        <div className="bg-white rounded-xl border p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">{t('noConnections')}</h3>
          <p className="text-gray-500 mb-6">{t('noConnectionsDescription')}</p>
          <Button onClick={() => setShowCreate(true)} disabled={!workspaceId}>
            {t('createFirstConnection')}
          </Button>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">{t('createConnection')}</h2>
            <form onSubmit={handleCreate}>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="peerName">{t('connectionName')}</Label>
                  <Input
                    id="peerName"
                    value={peerName}
                    onChange={(e) => setPeerName(e.target.value)}
                    placeholder={t('connectionNamePlaceholder')}
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-500 mt-1">{t('connectionNameHint')}</p>
                </div>
                <div>
                  <Label>{t('region')}</Label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {REGIONS.map((region) => (
                      <button
                        key={region.code}
                        type="button"
                        onClick={() => setSelectedRegion(region.code)}
                        className={`flex items-center gap-2 p-3 rounded-lg border transition-colors ${
                          selectedRegion === region.code
                            ? 'border-violet-500 bg-violet-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <span className="text-lg">{region.flag}</span>
                        <span className="text-sm">{region.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowCreate(false);
                    setPeerName('');
                  }}
                >
                  {tCommon('cancel')}
                </Button>
                <Button type="submit" disabled={!peerName.trim() || createMutation.isPending}>
                  {createMutation.isPending ? t('creating') : t('create')}
                </Button>
              </div>
              {createMutation.isError && (
                <p className="text-red-500 text-sm mt-2">
                  {t('createError')}
                </p>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-6">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div>
            <h4 className="font-medium text-amber-800">{t('requiresWireGuard')}</h4>
            <p className="text-sm text-amber-700 mt-1">
              {t('wireGuardInfo')}{' '}
              <a
                href="https://www.wireguard.com/install/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                wireguard.com/install
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
