'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
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

interface Plan {
  plan: string;
  name: string;
  description: string;
  price_monthly_jpy: number;
  price_yearly_jpy: number;
  features: string[];
  limits: {
    max_servers: number;
    max_deployments_per_month: number;
    max_requests_per_month: number;
    max_team_members: number;
    log_retention_days: number;
    custom_domains: boolean;
    priority_support: boolean;
    sso_enabled: boolean;
  };
}

interface Subscription {
  plan: string;
  status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: number | null;
}

interface Workspace {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

interface Invoice {
  id: string;
  number: string | null;
  status: string | null;
  amount_due: number;
  amount_paid: number;
  currency: string;
  created: number;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
}

export default function BillingPage() {
  const t = useTranslations('billing');
  const tCommon = useTranslations('common');
  const [selectedInterval, setSelectedInterval] = useState<'monthly' | 'yearly'>('monthly');
  const queryClient = useQueryClient();

  const { data: workspaces, isLoading: workspacesLoading } = useQuery<Workspace[]>({
    queryKey: ['workspaces'],
    queryFn: () => api.get('/workspaces'),
  });

  const currentWorkspace = workspaces?.[0];

  const { data: plans, isLoading: plansLoading } = useQuery<Plan[]>({
    queryKey: ['billing-plans'],
    queryFn: () => api.get('/billing/plans'),
  });

  const { data: subscription, isLoading: subscriptionLoading } = useQuery<Subscription>({
    queryKey: ['subscription', currentWorkspace?.id],
    queryFn: () => api.get(`/workspaces/${currentWorkspace?.id}/billing/subscription`),
    enabled: !!currentWorkspace?.id,
  });

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ['invoices', currentWorkspace?.id],
    queryFn: () => api.get(`/workspaces/${currentWorkspace?.id}/billing/invoices`),
    enabled: !!currentWorkspace?.id && !!subscription?.stripe_customer_id,
  });

  const checkoutMutation = useMutation({
    mutationFn: async ({ plan, yearly }: { plan: string; yearly: boolean }) => {
      const response = await api.post<{ checkout_url: string }>(`/workspaces/${currentWorkspace?.id}/billing/checkout`, {
        plan,
        yearly,
      });
      return response;
    },
    onSuccess: (data) => {
      window.location.href = data.checkout_url;
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<{ portal_url: string }>(`/workspaces/${currentWorkspace?.id}/billing/portal`);
      return response;
    },
    onSuccess: (data) => {
      window.location.href = data.portal_url;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<{ status: string; cancel_at_period_end: boolean; current_period_end: number | null }>(
        `/workspaces/${currentWorkspace?.id}/billing/cancel`
      );
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription', currentWorkspace?.id] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });

  const isLoading = workspacesLoading || plansLoading || subscriptionLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const currentPlan = subscription?.plan || 'free';
  const currentPlanData = plans?.find(p => p.plan === currentPlan);
  const isActive = subscription?.status === 'active';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium flex items-center gap-2 text-gray-400">
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
          {t('title')}
        </h1>
      </div>

      {/* Current Plan - Simple inline display */}
      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{t('currentPlan')}</span>
          <span className="font-semibold capitalize">{t(`plans.${currentPlan}.name` as any)}</span>
          <span className={`px-2 py-0.5 text-xs rounded ${isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
            {subscription?.status || 'free'}
          </span>
        </div>
        {subscription?.current_period_end && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{t('periodEnd')}</span>
            <span>{new Date(subscription.current_period_end * 1000).toLocaleDateString()}</span>
          </div>
        )}
        {subscription?.stripe_subscription_id && (
          <div className="flex gap-2 ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => portalMutation.mutate()}
              disabled={portalMutation.isPending}
            >
              {portalMutation.isPending ? tCommon('loading') : t('manageSubscription')}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={cancelMutation.isPending}>
                  {cancelMutation.isPending ? t('cancelling') : t('cancelSubscription')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('cancelTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('cancelDesc')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('keepSubscription')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => cancelMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {t('confirmCancel')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      {/* Plan Selector */}
      <div className="flex justify-center">
        <div className="inline-flex items-center bg-muted rounded-lg p-1">
          <button
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              selectedInterval === 'monthly' ? 'bg-background shadow' : 'text-muted-foreground'
            }`}
            onClick={() => setSelectedInterval('monthly')}
          >
            {t('interval.monthly')}
          </button>
          <button
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              selectedInterval === 'yearly' ? 'bg-background shadow' : 'text-muted-foreground'
            }`}
            onClick={() => setSelectedInterval('yearly')}
          >
            {t('interval.yearly')} <span className="text-green-600 text-xs ml-1">{t('interval.save')}</span>
          </button>
        </div>
      </div>

      {/* Invoice History */}
      {subscription?.stripe_customer_id && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-sm font-medium text-gray-500">{t('invoiceHistory')}</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {invoicesLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-violet-600" />
              </div>
            ) : invoices.length === 0 ? (
              <div className="px-5 py-8 text-center text-gray-500 text-sm">
                {t('noInvoices')}
              </div>
            ) : (
              invoices.map((invoice) => (
                <div key={invoice.id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                      <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">
                        {invoice.number || invoice.id.slice(0, 14)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(invoice.created * 1000).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="font-medium text-gray-900">
                        ¥{invoice.amount_paid.toLocaleString()}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        invoice.status === 'paid'
                          ? 'bg-emerald-100 text-emerald-700'
                          : invoice.status === 'open'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {invoice.status || 'unknown'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {invoice.hosted_invoice_url && (
                        <a
                          href={invoice.hosted_invoice_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                          title={t('viewInvoice')}
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M15 3h6v6" strokeLinecap="round" strokeLinejoin="round" />
                            <line x1="10" y1="14" x2="21" y2="3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </a>
                      )}
                      {invoice.invoice_pdf && (
                        <a
                          href={invoice.invoice_pdf}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                          title={t('downloadPdf')}
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M7 10l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                            <line x1="12" y1="15" x2="12" y2="3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {plans?.map((plan) => {
          const isCurrent = currentPlan === plan.plan;
          const price = selectedInterval === 'yearly' ? plan.price_yearly_jpy : plan.price_monthly_jpy;
          const monthlyPrice = selectedInterval === 'yearly' ? Math.round(price / 12) : price;
          const planKey = plan.plan as 'free' | 'pro' | 'team' | 'enterprise';
          const features = t.raw(`plans.${planKey}.features`) as string[];

          return (
            <Card key={plan.plan} className={`relative ${isCurrent ? 'border-primary ring-2 ring-primary' : ''}`}>
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-primary-foreground text-xs font-medium rounded-full">
                  {t('currentPlan')}
                </div>
              )}
              <CardHeader>
                <CardTitle>{t(`plans.${planKey}.name`)}</CardTitle>
                <CardDescription>{t(`plans.${planKey}.description`)}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-6">
                  <span className="text-4xl font-bold">¥{monthlyPrice.toLocaleString()}</span>
                  <span className="text-muted-foreground">{t('perMonth')}</span>
                  {selectedInterval === 'yearly' && price > 0 && (
                    <p className="text-sm text-muted-foreground">
                      年額 ¥{price.toLocaleString()}
                    </p>
                  )}
                </div>

                <ul className="space-y-3">
                  {features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm">
                      <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                {plan.plan === 'free' ? (
                  <Button variant="outline" className="w-full" disabled={isCurrent}>
                    {isCurrent ? t('currentPlan') : t('downgrade')}
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    variant={isCurrent ? 'outline' : 'default'}
                    disabled={isCurrent || checkoutMutation.isPending}
                    onClick={() => checkoutMutation.mutate({ plan: plan.plan, yearly: selectedInterval === 'yearly' })}
                  >
                    {isCurrent ? t('currentPlan') : checkoutMutation.isPending ? tCommon('loading') : t('upgrade')}
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
