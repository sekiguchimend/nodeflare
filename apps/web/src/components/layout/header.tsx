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
          <img src="/logo.png" alt="Nodeflare" className="h-8 w-auto" />
          <span className="text-lg font-black text-gray-900">NodeFlare</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          <Link href="/docs" className="text-sm font-medium text-gray-600 hover:text-gray-900">{t('docs')}</Link>
          <Link href="/pricing" className="text-sm font-medium text-gray-600 hover:text-gray-900">Pricing</Link>
          <Link href="/blog" className="text-sm font-medium text-gray-600 hover:text-gray-900">{t('blog')}</Link>
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
