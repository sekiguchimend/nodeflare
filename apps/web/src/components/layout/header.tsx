'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { LocaleSwitcher } from '@/components/locale-switcher';

export function Header() {
  const { user, isLoading } = useAuth();
  const t = useTranslations('nav');

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-sm border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="text-lg font-semibold text-gray-900">MCP Cloud</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          <Link href="/docs" className="text-sm text-gray-600 hover:text-gray-900">{t('docs')}</Link>
          <Link href="/pricing" className="text-sm text-gray-600 hover:text-gray-900">Pricing</Link>
          <Link href="/blog" className="text-sm text-gray-600 hover:text-gray-900">{t('blog')}</Link>
        </nav>

        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          {isLoading ? (
            <div className="w-20 h-9 bg-gray-100 rounded-lg animate-pulse" />
          ) : user ? (
            <Link href="/dashboard">
              <Button className="bg-violet-600 hover:bg-violet-700 text-white">{t('dashboard')}</Button>
            </Link>
          ) : (
            <>
              <a href="/api/v1/auth/github" className="text-sm text-gray-600 hover:text-gray-900 hidden sm:block">{t('login')}</a>
              <a href="/api/v1/auth/github">
                <Button className="bg-violet-600 hover:bg-violet-700 text-white">{t('signup')}</Button>
              </a>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
