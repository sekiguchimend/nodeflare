'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Region, REGIONS } from '@/types';

interface Workspace {
  id: string;
  name: string;
  slug: string;
}

interface WireGuardPeer {
  name: string;
  region: string;
  peer_ip: string;
}

interface WireGuardConfig {
  peer_name: string;
  config_file: string;
  peer_ip: string;
  instructions: string[];
}

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

export default function VPNPage() {
  const t = useTranslations('vpn');
  const tServers = useTranslations('servers');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [peerName, setPeerName] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<Region>('nrt');
  const [generatedConfig, setGeneratedConfig] = useState<WireGuardConfig | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: workspaces, isLoading: isLoadingWorkspaces } = useQuery<Workspace[]>({
    queryKey: ['workspaces'],
    queryFn: () => api.get('/workspaces'),
  });

  const workspaceId = workspaces?.[0]?.id;

  const { data: peers, isLoading: isLoadingPeers } = useQuery<WireGuardPeer[]>({
    queryKey: ['wireguard-peers', workspaceId],
    queryFn: () => api.get(`/workspaces/${workspaceId}/wireguard`),
    enabled: !!workspaceId,
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; region: string }) =>
      api.post<WireGuardConfig>(`/workspaces/${workspaceId}/wireguard`, data),
    onSuccess: (config) => {
      setGeneratedConfig(config);
      setShowForm(false);
      setPeerName('');
      queryClient.invalidateQueries({ queryKey: ['wireguard-peers', workspaceId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) =>
      api.delete(`/workspaces/${workspaceId}/wireguard/${encodeURIComponent(name)}`),
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['wireguard-peers', workspaceId] });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!peerName.trim()) return;
    createMutation.mutate({ name: peerName, region: selectedRegion });
  };

  const handleCopy = () => {
    if (generatedConfig) {
      navigator.clipboard.writeText(generatedConfig.config_file);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
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

  const getRegionDisplay = (code: string) => {
    const region = REGIONS.find(r => r.code === code);
    if (!region) return code;
    return `${tServers(`regions.${code}`)}`;
  };

  const isLoading = isLoadingWorkspaces || isLoadingPeers;
  const hasPeers = peers && peers.length > 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-gray-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium flex items-center gap-2 text-gray-400">
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          {t('title')}
        </h1>
        {hasPeers && !showForm && !generatedConfig && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            + {t('createConnection')}
          </Button>
        )}
      </div>

      {/* Generated Config */}
      {generatedConfig && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {t('configGenerated')}
            </div>
            <button onClick={() => setGeneratedConfig(null)} className="text-gray-400 hover:text-gray-600 text-sm">
              {tCommon('close')}
            </button>
          </div>

          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded">
            {t('importantNote')} {t('configOnlyOnce')}
          </div>

          <div className="flex gap-6 text-sm">
            <div>
              <span className="text-gray-500">Name:</span>
              <span className="ml-2 font-mono">{generatedConfig.peer_name}</span>
            </div>
            <div>
              <span className="text-gray-500">IP:</span>
              <span className="ml-2 font-mono">{generatedConfig.peer_ip}</span>
            </div>
          </div>

          <pre className="text-xs font-mono bg-gray-900 text-gray-100 p-4 rounded overflow-x-auto">
            {generatedConfig.config_file}
          </pre>

          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleCopy}>
              {copied ? tCommon('copied') : tCommon('copy')}
            </Button>
            <Button size="sm" onClick={handleDownload}>
              {t('download')}
            </Button>
          </div>
        </div>
      )}

      {/* Connections Table */}
      {hasPeers && !generatedConfig && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Region</th>
              <th className="pb-2 font-medium">IP</th>
              <th className="pb-2 font-medium w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {peers.map((peer) => {
              const region = REGIONS.find(r => r.code === peer.region);
              return (
                <tr key={peer.name} className="group">
                  <td className="py-3 font-medium text-gray-900">{peer.name}</td>
                  <td className="py-3 text-gray-600">
                    {region && <span className={`fi fi-${region.countryCode} mr-2`}></span>}
                    {getRegionDisplay(peer.region)}
                  </td>
                  <td className="py-3 font-mono text-gray-500">{peer.peer_ip}</td>
                  <td className="py-3">
                    <button
                      onClick={() => setDeleteTarget(peer.name)}
                      className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Create Form */}
      {(showForm || !hasPeers) && !generatedConfig && (
        <form onSubmit={handleCreate} className="space-y-5 max-w-md">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('connectionName')}</label>
            <Input
              value={peerName}
              onChange={(e) => setPeerName(e.target.value)}
              placeholder={t('connectionNamePlaceholder')}
            />
            <p className="text-xs text-gray-500 mt-1">{t('connectionNameHint')}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('region')}</label>
            <RegionSelect
              value={selectedRegion}
              onChange={setSelectedRegion}
              t={tServers}
            />
          </div>

          {createMutation.isError && (
            <p className="text-sm text-red-600">{t('createError')}</p>
          )}

          <div className="flex gap-2">
            {showForm && hasPeers && (
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                {tCommon('cancel')}
              </Button>
            )}
            <Button type="submit" disabled={!peerName.trim() || !workspaceId || createMutation.isPending}>
              {createMutation.isPending ? t('creating') : t('create')}
            </Button>
          </div>
        </form>
      )}

      {/* Info */}
      <p className="text-sm text-gray-500">
        {t('wireGuardInfo')}{' '}
        <a href="https://www.wireguard.com/install/" target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:underline">
          wireguard.com/install
        </a>
      </p>

      {/* Delete Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-5 max-w-xs w-full mx-4">
            <p className="text-sm text-gray-700 mb-4">
              {t('deleteConfirmMessage', { name: deleteTarget })}
            </p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setDeleteTarget(null)}>
                {tCommon('cancel')}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => deleteMutation.mutate(deleteTarget)}
                disabled={deleteMutation.isPending}
              >
                {tCommon('delete')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
