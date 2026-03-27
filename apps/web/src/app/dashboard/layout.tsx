'use client';

import { useAuth } from '@/hooks/use-auth';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { McpServer } from '@/types';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface NavItem {
  id: string;
  href: string;
  icon: React.ReactNode;
  exact?: boolean;
}

const DEFAULT_SIDEBAR_ORDER = ['overview', 'servers', 'apiKeys', 'vpn', 'team', 'logs', 'billing', 'settings'];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations('nav');
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const { data: servers, isLoading: serversLoading } = useQuery<McpServer[]>({
    queryKey: ['servers'],
    queryFn: () => api.get('/servers'),
    enabled: !!user,
  });

  const { data: preferences } = useQuery<{ sidebar_order: string[] }>({
    queryKey: ['userPreferences'],
    queryFn: () => api.get('/user/preferences'),
    enabled: !!user,
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: (sidebarOrder: string[]) =>
      api.patch('/user/preferences', { sidebar_order: sidebarOrder }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userPreferences'] });
    },
  });

  const [sidebarOrder, setSidebarOrder] = useState<string[]>(DEFAULT_SIDEBAR_ORDER);

  useEffect(() => {
    if (preferences?.sidebar_order) {
      // 保存された設定に含まれていない新しいナビアイテムを追加
      const savedOrder = preferences.sidebar_order;
      const newItems = DEFAULT_SIDEBAR_ORDER.filter(id => !savedOrder.includes(id));
      if (newItems.length > 0) {
        setSidebarOrder([...savedOrder, ...newItems]);
      } else {
        setSidebarOrder(savedOrder);
      }
    }
  }, [preferences]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const navItemsMap: Record<string, NavItem> = {
    overview: {
      id: 'overview',
      href: '/dashboard',
      exact: true,
      icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></svg>,
    },
    servers: {
      id: 'servers',
      href: '/dashboard/servers',
      icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" /><rect x="2" y="14" width="20" height="8" rx="2" /><line x1="6" y1="6" x2="6.01" y2="6" /><line x1="6" y1="18" x2="6.01" y2="18" /></svg>,
    },
    apiKeys: {
      id: 'apiKeys',
      href: '/dashboard/api-keys',
      icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>,
    },
    vpn: {
      id: 'vpn',
      href: '/dashboard/vpn',
      icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
    },
    team: {
      id: 'team',
      href: '/dashboard/team',
      icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
    },
    logs: {
      id: 'logs',
      href: '/dashboard/logs',
      icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" /></svg>,
    },
    billing: {
      id: 'billing',
      href: '/dashboard/billing',
      icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>,
    },
    settings: {
      id: 'settings',
      href: '/dashboard/settings',
      icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
    },
  };

  const sortedNavItems = useMemo(() => {
    return sidebarOrder
      .filter(id => navItemsMap[id])
      .map(id => navItemsMap[id]);
  }, [sidebarOrder]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = sidebarOrder.indexOf(active.id as string);
      const newIndex = sidebarOrder.indexOf(over.id as string);
      const newOrder = arrayMove(sidebarOrder, oldIndex, newIndex);
      setSidebarOrder(newOrder);
      updatePreferencesMutation.mutate(newOrder);
    }
  };

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/');
    }
  }, [user, isLoading, router]);

  // サーバーがない場合はnew画面にリダイレクト
  useEffect(() => {
    if (!serversLoading && servers && servers.length === 0 && pathname !== '/dashboard/servers/new') {
      router.push('/dashboard/servers/new');
    }
  }, [servers, serversLoading, pathname, router]);

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
      <aside className={`${sidebarOpen ? 'w-48' : 'w-12'} border-r bg-card transition-all duration-300 flex-shrink-0`}>
        <div className="h-14 px-3 border-b flex items-center justify-between">
          {sidebarOpen && (
            <Link href="/dashboard" className="flex items-center gap-2">
              <img src="/logo.png" alt="Nodeflare" className="h-5 w-auto" />
              <span className="font-bold">NodeFlare</span>
            </Link>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-md hover:bg-accent transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {sidebarOpen ? (
                <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
              ) : (
                <path d="M13 17l5-5-5-5M6 17l5-5-5-5" />
              )}
            </svg>
          </button>
        </div>
        <nav className="py-2 pl-2 space-y-0.5">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={sidebarOrder} strategy={verticalListSortingStrategy}>
              {sortedNavItems.map((item) => (
                <SortableNavLink
                  key={item.id}
                  id={item.id}
                  href={item.href}
                  pathname={pathname}
                  exact={item.exact}
                  icon={item.icon}
                  collapsed={!sidebarOpen}
                >
                  {t(item.id)}
                </SortableNavLink>
              ))}
            </SortableContext>
          </DndContext>
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
              {t('logout')}
            </Button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 bg-gray-100">{children}</main>
      </div>
    </div>
  );
}

function SortableNavLink({
  id,
  href,
  icon,
  children,
  collapsed,
  pathname,
  exact = false
}: {
  id: string;
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  collapsed: boolean;
  pathname: string;
  exact?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isActive = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(href + '/');

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Link
        href={href}
        className={`flex items-center gap-4 px-2.5 py-1.5 rounded-l-md text-sm font-medium transition-colors ${
          collapsed ? 'justify-center' : ''
        } ${
          isActive
            ? 'bg-gray-100 text-foreground border-r-[3px] border-primary -mr-[1px]'
            : 'hover:bg-gray-50 text-gray-500 hover:text-foreground'
        } ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        title={collapsed ? String(children) : undefined}
        onClick={(e) => {
          if (isDragging) {
            e.preventDefault();
          }
        }}
      >
        <span className="flex-shrink-0">{icon}</span>
        {!collapsed && <span>{children}</span>}
      </Link>
    </div>
  );
}
