'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function SettingsPage() {
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
      setError('Failed to delete account. Please try again.');
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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">GitHub Connection</h4>
            <p className="text-sm text-muted-foreground">
              Connected as @{user?.name}
            </p>
          </div>

          <div className="border-t pt-4">
            <h4 className="font-medium mb-2">Sign Out</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Sign out of your account on this device.
            </p>
            <Button variant="outline" onClick={() => logout()}>
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent>
          <div>
            <h4 className="font-medium mb-2">Delete Account</h4>
            <p className="text-sm text-muted-foreground mb-4">
              Permanently delete your account and all associated data. This
              action cannot be undone.
            </p>

            {!showDeleteConfirm ? (
              <Button
                variant="destructive"
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete Account
              </Button>
            ) : (
              <div className="space-y-4 p-4 border border-destructive rounded-lg bg-destructive/5">
                <p className="text-sm font-medium text-destructive">
                  Are you absolutely sure? This will permanently delete your
                  account, all your workspaces, servers, and deployments.
                </p>
                <div>
                  <p className="text-sm mb-2">
                    Type <span className="font-mono font-bold">DELETE</span> to
                    confirm:
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
                    {isDeleting ? 'Deleting...' : 'Permanently Delete'}
                  </Button>
                  <Button variant="outline" onClick={cancelDelete}>
                    Cancel
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
