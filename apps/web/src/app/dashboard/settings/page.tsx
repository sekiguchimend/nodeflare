'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function SettingsPage() {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const { user, logout } = useAuth();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-medium flex items-center gap-2 text-gray-400">
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
        {t('title')}
      </h1>

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle>{t('account.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Profile */}
          <div className="flex items-center space-x-4">
            {user?.avatar_url && (
              <img
                src={user.avatar_url}
                alt={user.name}
                className="w-16 h-16 rounded-full"
              />
            )}
            <div>
              <div className="font-medium text-lg">{user?.name}</div>
              <div className="text-muted-foreground">{user?.email}</div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="font-medium mb-2">{t('account.githubConnection')}</h4>
            <p className="text-sm text-muted-foreground">
              {t('account.connectedAs', { name: user?.name ?? '' })}
            </p>
          </div>

          <div className="border-t pt-4">
            <h4 className="font-medium mb-2">{t('account.signOut')}</h4>
            <p className="text-sm text-muted-foreground mb-4">
              {t('account.signOutDesc')}
            </p>
            <Button variant="outline" onClick={() => logout()}>
              {t('account.signOut')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <h2 className="text-lg font-medium mb-2">{t('danger.title')}</h2>
      <Card className="border-destructive/50 -mt-4">
        <CardContent className="pt-6">
          <div>
            <h4 className="font-medium mb-2">{t('danger.deleteAccount')}</h4>
            <p className="text-sm text-muted-foreground mb-4">
              {t('danger.deleteAccountDetail')}
            </p>

            {!showDeleteConfirm ? (
              <Button
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setShowDeleteConfirm(true)}
              >
                {t('danger.deleteAccount')}
              </Button>
            ) : (
              <div className="space-y-4 p-4 border border-destructive rounded-lg bg-destructive/5">
                <p className="text-sm font-medium text-destructive">
                  {t('danger.deleteConfirm')}
                </p>
                <div>
                  <p className="text-sm mb-2">
                    {t('danger.typeDelete')}
                  </p>
                  <Input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="DELETE"
                    className="max-w-xs"
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    onClick={handleDeleteAccount}
                    disabled={confirmText !== 'DELETE' || isDeleting}
                  >
                    {isDeleting ? t('danger.deleting') : t('danger.permanentlyDelete')}
                  </Button>
                  <Button variant="outline" onClick={cancelDelete}>
                    {tCommon('cancel')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
