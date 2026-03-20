'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { api } from '@/lib/api';
import { TeamMember, AddMemberRequest, WorkspaceRole } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Workspace {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

interface PlanLimits {
  max_team_members: number;
}

interface Plan {
  plan: string;
  limits: PlanLimits;
}

export default function TeamPage() {
  const t = useTranslations('team');
  const tCommon = useTranslations('common');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);

  const { data: workspaces, isLoading: isLoadingWorkspaces } = useQuery<Workspace[]>({
    queryKey: ['workspaces'],
    queryFn: () => api.get('/workspaces'),
  });

  const workspaceId = selectedWorkspaceId || workspaces?.[0]?.id;
  const currentWorkspace = workspaces?.find(w => w.id === workspaceId);

  const { data: members, isLoading: isLoadingMembers } = useQuery<TeamMember[]>({
    queryKey: ['workspaces', workspaceId, 'members'],
    queryFn: () => api.get(`/workspaces/${workspaceId}/members`),
    enabled: !!workspaceId,
  });

  const { data: plans } = useQuery<Plan[]>({
    queryKey: ['billing-plans'],
    queryFn: () => api.get('/billing/plans'),
  });

  const currentPlanLimits = plans?.find(p => p.plan === (currentWorkspace?.plan || 'free'))?.limits;
  const maxMembers = currentPlanLimits?.max_team_members || 1;
  const currentMemberCount = members?.length || 0;
  const isAtLimit = currentMemberCount >= maxMembers;

  const isLoading = isLoadingWorkspaces || isLoadingMembers;

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl font-medium flex items-center gap-2 text-gray-400">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
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
        {/* Usage Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 border border-gray-200 text-sm">
          <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="9" cy="7" r="4" />
          </svg>
          <span className="text-gray-700">
            {t('usage', { current: currentMemberCount, max: maxMembers === 4294967295 ? '∞' : maxMembers })}
          </span>
        </div>
      </div>

      {/* Upgrade Banner (when at limit and not on enterprise) */}
      {isAtLimit && currentWorkspace?.plan !== 'enterprise' && (
        <div className="mb-8 p-5 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-medium text-amber-800">{t('upgrade.title')}</p>
              <p className="text-sm text-amber-700 mt-1">{t('errors.limitReached')}</p>
            </div>
            <Link href="/dashboard/billing">
              <Button variant="outline" className="border-amber-300 text-amber-700 hover:bg-amber-100">
                {t('upgrade.cta')}
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Create Form */}
      {showCreate && workspaceId ? (
        <AddMemberForm
          workspaceId={workspaceId}
          onClose={() => setShowCreate(false)}
          t={t}
          tCommon={tCommon}
        />
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          disabled={!workspaceId || isAtLimit}
          className="mb-8 px-6 py-3 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/50 hover:bg-blue-100/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="flex items-center justify-center gap-2 text-blue-600">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-medium">{t('addMember')}</span>
          </div>
        </button>
      )}

      {/* Members List */}
      <div>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-100 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : members?.length === 1 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="9" cy="7" r="4" />
              </svg>
            </div>
            <p className="text-gray-500">{t('empty')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {members?.map((member, index) => (
              <MemberRow
                key={member.user_id}
                member={member}
                workspaceId={workspaceId!}
                t={t}
                tCommon={tCommon}
                index={index}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AddMemberForm({
  workspaceId,
  onClose,
  t,
  tCommon,
}: {
  workspaceId: string;
  onClose: () => void;
  t: (key: string) => string;
  tCommon: (key: string) => string;
}) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('member');
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: AddMemberRequest) =>
      api.post<TeamMember>(`/workspaces/${workspaceId}/members`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'members'] });
      onClose();
    },
    onError: (err: any) => {
      const errorCode = err?.response?.data?.error?.code;
      if (errorCode === 'NOT_FOUND') {
        setError(t('errors.userNotFound'));
      } else if (errorCode === 'ALREADY_MEMBER') {
        setError(t('errors.alreadyMember'));
      } else if (errorCode === 'MEMBER_LIMIT_REACHED') {
        setError(t('errors.limitReached'));
      } else {
        setError(err.message || 'An error occurred');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    createMutation.mutate({ email, role });
  };

  const roles: WorkspaceRole[] = ['admin', 'member', 'viewer'];

  return (
    <div className="mb-8 p-6 rounded-2xl bg-gray-50 border border-gray-200">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">{t('add.title')}</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <Label htmlFor="email" className="text-gray-700">{t('add.email')}</Label>
          <Input
            id="email"
            type="email"
            placeholder="user@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-2 bg-white"
          />
        </div>

        <div>
          <Label className="text-gray-700 mb-3 block">{t('add.role')}</Label>
          <div className="grid grid-cols-3 gap-2">
            {roles.map((r) => (
              <label
                key={r}
                className={`flex items-center justify-center p-3 rounded-lg border cursor-pointer transition-colors ${
                  role === r
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value={r}
                  checked={role === r}
                  onChange={() => setRole(r)}
                  className="sr-only"
                />
                <span className="font-medium text-sm capitalize">{t(`roles.${r}`)}</span>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          <Button type="button" variant="ghost" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
          <Button type="submit" disabled={createMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
            {createMutation.isPending ? tCommon('loading') : t('add.submit')}
          </Button>
        </div>
      </form>
    </div>
  );
}

function MemberRow({
  member,
  workspaceId,
  t,
  tCommon,
  index,
}: {
  member: TeamMember;
  workspaceId: string;
  t: (key: string, values?: Record<string, string | number>) => string;
  tCommon: (key: string) => string;
  index: number;
}) {
  const queryClient = useQueryClient();
  const [isHovered, setIsHovered] = useState(false);
  const [selectedRole, setSelectedRole] = useState<WorkspaceRole>(member.role);

  const updateMutation = useMutation({
    mutationFn: (role: WorkspaceRole) =>
      api.patch(`/workspaces/${workspaceId}/members/${member.user_id}`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'members'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/workspaces/${workspaceId}/members/${member.user_id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces', workspaceId, 'members'] });
    },
  });

  const handleRoleChange = (newRole: WorkspaceRole) => {
    setSelectedRole(newRole);
    updateMutation.mutate(newRole);
  };

  const colors = [
    'from-blue-400 to-cyan-500',
    'from-violet-400 to-purple-500',
    'from-emerald-400 to-teal-500',
    'from-amber-400 to-orange-500',
    'from-pink-400 to-rose-500',
  ];

  const isOwner = member.role === 'owner';

  return (
    <div
      className="group p-4 rounded-xl bg-white border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-center gap-4">
        {member.avatar_url ? (
          <img
            src={member.avatar_url}
            alt={member.name}
            className="w-10 h-10 rounded-full"
          />
        ) : (
          <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${colors[index % colors.length]} flex items-center justify-center flex-shrink-0`}>
            <span className="text-white font-bold text-sm">{member.name.charAt(0).toUpperCase()}</span>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900">{member.name}</span>
            {isOwner && (
              <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full">
                {t('roles.owner')}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 truncate">{member.email}</p>
        </div>

        {!isOwner && (
          <>
            <select
              value={selectedRole}
              onChange={(e) => handleRoleChange(e.target.value as WorkspaceRole)}
              disabled={updateMutation.isPending}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="admin">{t('roles.admin')}</option>
              <option value="member">{t('roles.member')}</option>
              <option value="viewer">{t('roles.viewer')}</option>
            </select>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  className={`px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-all ${
                    isHovered ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  {tCommon('delete')}
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{tCommon('confirm')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('remove.confirm', { name: member.name })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {tCommon('delete')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>
    </div>
  );
}
