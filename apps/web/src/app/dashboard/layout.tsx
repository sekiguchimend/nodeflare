'use client';

import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card">
        <div className="p-4 border-b">
          <Link href="/dashboard" className="text-xl font-bold">
            MCP Cloud
          </Link>
        </div>
        <nav className="p-4 space-y-2">
          <NavLink href="/dashboard">Overview</NavLink>
          <NavLink href="/dashboard/servers">Servers</NavLink>
          <NavLink href="/dashboard/api-keys">API Keys</NavLink>
          <NavLink href="/dashboard/logs">Logs</NavLink>
          <NavLink href="/dashboard/settings">Settings</NavLink>
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <header className="h-14 border-b flex items-center justify-between px-6">
          <div />
          <div className="flex items-center space-x-4">
            <span className="text-sm text-muted-foreground">{user.name}</span>
            {user.avatar_url && (
              <img
                src={user.avatar_url}
                alt={user.name}
                className="w-8 h-8 rounded-full"
              />
            )}
            <Button variant="ghost" size="sm" onClick={() => logout()}>
              Logout
            </Button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="block px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors"
    >
      {children}
    </Link>
  );
}
