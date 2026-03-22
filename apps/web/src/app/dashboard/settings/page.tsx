'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/hooks/use-auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface NotificationSettings {
  email_deploy_success: boolean;
  email_deploy_failure: boolean;
  email_server_down: boolean;
  email_weekly_report: boolean;
}

export default function SettingsPage() {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const { user, logout, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Profile editing state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState(user?.name || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Notification settings
  const { data: notificationSettings } = useQuery<NotificationSettings>({
    queryKey: ['notificationSettings'],
    queryFn: () => api.get('/user/notifications'),
    initialData: {
      email_deploy_success: true,
      email_deploy_failure: true,
      email_server_down: true,
      email_weekly_report: false,
    },
  });

  const notificationMutation = useMutation({
    mutationFn: (settings: Partial<NotificationSettings>) =>
      api.patch('/user/notifications', settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificationSettings'] });
    },
  });

  const handleSaveProfile = async () => {
    if (!profileName.trim()) return;
    setProfileSaving(true);
    setProfileError(null);
    try {
      await api.patch('/auth/profile', { name: profileName.trim() });
      refreshUser?.();
      setIsEditingProfile(false);
    } catch (err: any) {
      setProfileError(err?.response?.data?.error?.message || 'Failed to update profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleNotificationToggle = (key: keyof NotificationSettings) => {
    if (!notificationSettings) return;
    notificationMutation.mutate({
      [key]: !notificationSettings[key],
    });
  };

  const handleReconnectGithub = () => {
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL || ''}/auth/github?reconnect=true`;
  };

  const handleDeleteAccount = async () => {
    if (confirmText !== 'DELETE') return;

    setIsDeleting(true);
    setError(null);
    try {
      await api.delete('/auth/account');
      logout();
    } catch (err) {
      console.error('Failed to delete account:', err);
      setError(t('danger.deleteFailed'));
    } finally {
      setIsDeleting(false);
    }
  };

  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setConfirmText('');
    setError(null);
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-medium flex items-center gap-2 text-gray-400 mb-8">
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
        {t('title')}
      </h1>

      {/* Profile Section */}
      <section className="mb-10">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">{t('account.title')}</h2>

        <div className="p-5 rounded-2xl bg-gradient-to-r from-gray-50 to-slate-50 border border-gray-100">
          <div className="flex items-center gap-5 mb-4">
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.name}
                className="w-16 h-16 rounded-2xl ring-4 ring-white shadow-lg"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center ring-4 ring-white shadow-lg">
                <span className="text-white font-bold text-xl">{user?.name?.charAt(0) || '?'}</span>
              </div>
            )}
            <div className="flex-1">
              {isEditingProfile ? (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="profileName" className="text-xs text-gray-500">{t('account.name')}</Label>
                    <Input
                      id="profileName"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      className="mt-1"
                      placeholder={t('account.namePlaceholder')}
                    />
                  </div>
                  {profileError && (
                    <p className="text-sm text-red-600">{profileError}</p>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveProfile} disabled={profileSaving}>
                      {profileSaving ? tCommon('loading') : tCommon('save')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => {
                      setIsEditingProfile(false);
                      setProfileName(user?.name || '');
                      setProfileError(null);
                    }}>
                      {tCommon('cancel')}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="font-semibold text-lg text-gray-900">{user?.name}</div>
                  <div className="text-gray-500">{user?.email}</div>
                </>
              )}
            </div>
            {!isEditingProfile && (
              <button
                onClick={() => setIsEditingProfile(true)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* GitHub Connection */}
      <section className="mb-10">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">{t('account.githubConnection')}</h2>

        <div className="flex items-center justify-between p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gray-900 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
            </div>
            <div>
              <div className="font-medium text-gray-900">{user?.name}</div>
              <div className="text-sm text-gray-500">{t('account.connectedAs', { name: user?.name ?? '' })}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="text-sm text-emerald-600 font-medium">{t('account.connected')}</span>
            </div>
            <button
              onClick={handleReconnectGithub}
              className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              {t('account.reconnect')}
            </button>
          </div>
        </div>
      </section>

      {/* Email Notifications */}
      <section className="mb-10">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">{t('notifications.title')}</h2>

        <div className="space-y-3">
          <NotificationToggle
            label={t('notifications.deploySuccess')}
            description={t('notifications.deploySuccessDesc')}
            checked={notificationSettings?.email_deploy_success ?? true}
            onChange={() => handleNotificationToggle('email_deploy_success')}
            disabled={notificationMutation.isPending}
          />
          <NotificationToggle
            label={t('notifications.deployFailure')}
            description={t('notifications.deployFailureDesc')}
            checked={notificationSettings?.email_deploy_failure ?? true}
            onChange={() => handleNotificationToggle('email_deploy_failure')}
            disabled={notificationMutation.isPending}
          />
          <NotificationToggle
            label={t('notifications.serverDown')}
            description={t('notifications.serverDownDesc')}
            checked={notificationSettings?.email_server_down ?? true}
            onChange={() => handleNotificationToggle('email_server_down')}
            disabled={notificationMutation.isPending}
          />
          <NotificationToggle
            label={t('notifications.weeklyReport')}
            description={t('notifications.weeklyReportDesc')}
            checked={notificationSettings?.email_weekly_report ?? false}
            onChange={() => handleNotificationToggle('email_weekly_report')}
            disabled={notificationMutation.isPending}
          />
        </div>
      </section>

      {/* Sign Out */}
      <section className="mb-10">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">{t('account.signOut')}</h2>

        <div className="flex items-center justify-between p-4 rounded-xl bg-white border border-gray-200">
          <p className="text-gray-600">{t('account.signOutDesc')}</p>
          <Button variant="outline" onClick={() => logout()} className="gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M16 17l5-5-5-5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t('account.signOut')}
          </Button>
        </div>
      </section>

      {/* Danger Zone */}
      <section>
        <h2 className="text-sm font-medium text-red-500 uppercase tracking-wider mb-4 flex items-center gap-2">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t('danger.title')}
        </h2>

        <div className="p-5 rounded-xl border-2 border-dashed border-red-200 bg-red-50/50">
          <h3 className="font-medium text-gray-900 mb-2">{t('danger.deleteAccount')}</h3>
          <p className="text-sm text-gray-600 mb-4">{t('danger.deleteAccountDetail')}</p>

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="text-red-600 text-sm font-medium hover:text-red-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t('danger.deleteAccount')}
            </button>
          ) : (
            <div className="mt-4 p-4 rounded-xl bg-white border border-red-200">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 9v2m0 4h.01" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-red-800">{t('danger.deleteConfirm')}</p>
                  <p className="text-sm text-gray-600 mt-1">{t('danger.typeDelete')}</p>
                </div>
              </div>

              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                className="mb-4 border-red-200 focus:border-red-400 focus:ring-red-400"
              />

              {error && (
                <p className="text-sm text-red-600 mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M15 9l-6 6M9 9l6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {error}
                </p>
              )}

              <div className="flex gap-3">
                <Button
                  variant="destructive"
                  onClick={handleDeleteAccount}
                  disabled={confirmText !== 'DELETE' || isDeleting}
                  className="gap-2"
                >
                  {isDeleting ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                      </svg>
                      {t('danger.deleting')}
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {t('danger.permanentlyDelete')}
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={cancelDelete}>
                  {tCommon('cancel')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function NotificationToggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-white border border-gray-200">
      <div>
        <div className="font-medium text-gray-900">{label}</div>
        <div className="text-sm text-gray-500">{description}</div>
      </div>
      <button
        onClick={onChange}
        disabled={disabled}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          checked ? 'bg-violet-600' : 'bg-gray-300'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
