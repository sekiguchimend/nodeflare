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
  current_period_start: number | null;
  current_period_end: number | null;
  cancel_at_period_end: boolean;
  additional_regions: number;
}

interface PaymentMethod {
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
}

interface BillingSettings {
  auto_email_invoices: boolean;
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
  const [showPlans, setShowPlans] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');
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
    enabled: !!currentWorkspace?.id,
  });

  const { data: paymentMethodData } = useQuery<{ payment_method: PaymentMethod | null }>({
    queryKey: ['payment-method', currentWorkspace?.id],
    queryFn: () => api.get(`/workspaces/${currentWorkspace?.id}/billing/payment-method`),
    enabled: !!currentWorkspace?.id && !!subscription?.stripe_subscription_id,
  });

  const { data: billingSettings } = useQuery<BillingSettings>({
    queryKey: ['billing-settings', currentWorkspace?.id],
    queryFn: () => api.get(`/workspaces/${currentWorkspace?.id}/billing/settings`),
    enabled: !!currentWorkspace?.id,
  });

  const updateBillingSettingsMutation = useMutation({
    mutationFn: async (autoEmailInvoices: boolean) => {
      return api.patch(`/workspaces/${currentWorkspace?.id}/billing/settings`, {
        auto_email_invoices: autoEmailInvoices,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing-settings', currentWorkspace?.id] });
    },
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
  const isFree = currentPlan === 'free';

  // Calculate billing amounts
  const planPrice = currentPlanData?.price_monthly_jpy || 0;
  const additionalRegionPrice = 300; // ¥300 per additional region
  const additionalRegionCount = subscription?.additional_regions || 0;
  const additionalRegionTotal = additionalRegionCount * additionalRegionPrice;
  const totalMonthly = planPrice + additionalRegionTotal;
  const paymentMethod = paymentMethodData?.payment_method;
  const autoEmailEnabled = billingSettings?.auto_email_invoices ?? true;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium flex items-center gap-2 text-gray-400">
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
            <line x1="1" y1="10" x2="23" y2="10" />
          </svg>
          {t('title')}
        </h1>
      </div>

      {/* Current Plan Header */}
      <div className="flex items-center gap-6 text-sm flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{t('currentPlan')}</span>
          <span className="font-semibold capitalize">{t(`plans.${currentPlan}.name` as any)}</span>
          <span className={`px-2 py-0.5 text-xs rounded ${isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
            {subscription?.status || 'free'}
          </span>
          {subscription?.cancel_at_period_end && (
            <span className="px-2 py-0.5 text-xs rounded bg-amber-100 text-amber-700">
              期間終了時にキャンセル
            </span>
          )}
        </div>
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

      {/* Two Column Layout: Current Plan | Invoice Calendar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Current Plan Receipt */}
        <div>
          <h2 className="text-sm font-medium text-gray-500 mb-2">{t('currentPlan')}</h2>
          <div className="bg-white border border-gray-300 rounded-lg overflow-hidden font-mono text-xs">
            <div className="px-4 py-3 text-center border-b border-dashed border-gray-300">
              <div className="font-bold text-gray-900">Nodeflare</div>
              <div className="text-xs text-gray-400">請求書</div>
            </div>
            <div className="px-4 py-2 border-b border-dashed border-gray-300">
              <div className="flex justify-between text-gray-600">
                <span>発行日</span>
                <span>{new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
              </div>
              {subscription?.current_period_end && (
                <div className="flex justify-between text-gray-600 mt-1">
                  <span>次回請求日</span>
                  <span>{new Date(subscription.current_period_end * 1000).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                </div>
              )}
            </div>
            <div className="px-4 py-2 border-b border-dashed border-gray-300">
              <div className="flex justify-between text-gray-900">
                <span>{t(`plans.${currentPlan}.name` as any)}プラン</span>
                <span>¥{planPrice.toLocaleString()}</span>
              </div>
              {additionalRegionCount > 0 && (
                <div className="flex justify-between text-gray-900 mt-1">
                  <span>追加リージョン ×{additionalRegionCount}</span>
                  <span>¥{additionalRegionTotal.toLocaleString()}</span>
                </div>
              )}
            </div>
            <div className="px-4 py-2 bg-gray-50">
              <div className="flex justify-between text-gray-900 font-bold">
                <span>合計（税込）</span>
                <span>¥{totalMonthly.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Invoice Calendar */}
        <div>
          <h2 className="text-sm font-medium text-gray-500 mb-2">{t('invoiceHistory')}</h2>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
              <button onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))} className="p-1 hover:bg-gray-100 rounded">
                <svg className="w-4 h-4 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <span className="text-sm font-medium text-gray-900">{calendarDate.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' })}</span>
              <button onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))} className="p-1 hover:bg-gray-100 rounded">
                <svg className="w-4 h-4 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
            <div className="p-3">
              <div className="grid grid-cols-7 gap-1 mb-1">
                {['日', '月', '火', '水', '木', '金', '土'].map((day) => (
                  <div key={day} className="text-center text-xs text-gray-400 py-1">{day}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {(() => {
                  const year = calendarDate.getFullYear();
                  const month = calendarDate.getMonth();
                  const firstDay = new Date(year, month, 1).getDay();
                  const daysInMonth = new Date(year, month + 1, 0).getDate();
                  const days = [];
                  for (let i = 0; i < firstDay; i++) days.push(<div key={`empty-${i}`} className="h-8" />);
                  for (let day = 1; day <= daysInMonth; day++) {
                    const invoiceOnDay = invoices.find((inv) => {
                      const d = new Date(inv.created * 1000);
                      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
                    });
                    const isSelected = selectedInvoice && (() => {
                      const d = new Date(selectedInvoice.created * 1000);
                      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
                    })();
                    days.push(
                      <button
                        key={day}
                        onClick={() => invoiceOnDay && setSelectedInvoice(isSelected ? null : invoiceOnDay)}
                        className={`h-8 w-full rounded text-xs transition-colors ${invoiceOnDay ? isSelected ? 'bg-violet-600 text-white font-medium' : 'bg-violet-100 text-violet-700 hover:bg-violet-200 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
                        disabled={!invoiceOnDay}
                      >
                        {day}
                      </button>
                    );
                  }
                  return days;
                })()}
              </div>
            </div>
            <div className="px-3 py-2 border-t border-gray-200 flex items-center gap-3 text-xs text-gray-500">
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded bg-violet-100" /><span>引き落とし</span></div>
              {selectedInvoice && <button onClick={() => setSelectedInvoice(null)} className="ml-auto text-gray-500 hover:text-gray-700">×</button>}
            </div>
            {/* Bulk Export by Date Range */}
            <div className="px-3 py-3 border-t border-gray-200 bg-gray-50">
              <div className="flex items-center gap-2 text-xs">
                <input
                  type="month"
                  value={exportFrom}
                  onChange={(e) => setExportFrom(e.target.value)}
                  placeholder="開始月"
                  className="border border-gray-300 rounded px-2 py-1 text-xs w-28 bg-white"
                />
                <span className="text-gray-400">〜</span>
                <input
                  type="month"
                  value={exportTo}
                  onChange={(e) => setExportTo(e.target.value)}
                  placeholder="終了月"
                  className="border border-gray-300 rounded px-2 py-1 text-xs w-28 bg-white"
                />
                <button
                  onClick={() => {
                    if (!exportFrom || !exportTo) return;
                    const from = new Date(exportFrom + '-01');
                    const to = new Date(exportTo + '-01');
                    to.setMonth(to.getMonth() + 1);
                    const filtered = invoices.filter((inv) => {
                      const d = new Date(inv.created * 1000);
                      return d >= from && d < to;
                    });
                    if (filtered.length > 0) {
                      filtered.forEach((inv) => {
                        if (inv.invoice_pdf) window.open(inv.invoice_pdf, '_blank');
                      });
                    } else {
                      alert('該当期間の請求書がありません');
                    }
                  }}
                  disabled={!exportFrom || !exportTo}
                  className={`px-3 py-1 rounded text-xs transition-colors ${exportFrom && exportTo ? 'bg-violet-600 text-white hover:bg-violet-700' : 'bg-gray-200 text-gray-400'}`}
                >
                  一括DL
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Selected Invoice Detail */}
      {selectedInvoice && (
        <div className="bg-white border border-gray-300 rounded-lg overflow-hidden font-mono text-xs max-w-md">
          <div className="px-4 py-3 text-center border-b border-dashed border-gray-300">
            <div className="font-bold text-gray-900">Nodeflare</div>
            <div className="text-xs text-gray-400">領収書</div>
          </div>
          <div className="px-4 py-2 border-b border-dashed border-gray-300">
            <div className="flex justify-between text-gray-600">
              <span>発行日</span>
              <span>{new Date(selectedInvoice.created * 1000).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
            <div className="flex justify-between text-gray-600 mt-1">
              <span>請求番号</span>
              <span>{selectedInvoice.number || selectedInvoice.id.slice(0, 14)}</span>
            </div>
          </div>
          <div className="px-4 py-2 border-b border-dashed border-gray-300">
            <div className="flex justify-between text-gray-900">
              <span>ご利用料金</span>
              <span>¥{selectedInvoice.amount_paid.toLocaleString()}</span>
            </div>
          </div>
          <div className="px-4 py-2 bg-gray-50">
            <div className="flex justify-between text-gray-900 font-bold">
              <span>合計（税込）</span>
              <span>¥{selectedInvoice.amount_paid.toLocaleString()}</span>
            </div>
            <div className="flex justify-between mt-2 text-gray-500">
              <span>{selectedInvoice.status === 'paid' ? '支払済' : '未払い'}</span>
              <div className="flex gap-2">
                {selectedInvoice.invoice_pdf && <a href={selectedInvoice.invoice_pdf} target="_blank" rel="noopener noreferrer" className="hover:text-gray-700">PDF</a>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Method */}
        <div>
          <h2 className="text-sm font-medium text-gray-500 mb-2">{t('paymentMethod.title')}</h2>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            {paymentMethod ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-6 bg-gray-100 rounded flex items-center justify-center text-xs font-bold text-gray-600 uppercase">
                    {paymentMethod.brand.slice(0, 4)}
                  </div>
                  <div className="text-sm">
                    <div className="text-gray-900">**** {paymentMethod.last4}</div>
                    <div className="text-gray-500 text-xs">
                      {String(paymentMethod.exp_month).padStart(2, '0')}/{String(paymentMethod.exp_year).slice(-2)}
                    </div>
                  </div>
                </div>
                <button onClick={() => portalMutation.mutate()} disabled={portalMutation.isPending} className="text-sm text-gray-600 hover:text-gray-900 underline">変更</button>
              </div>
            ) : subscription?.stripe_subscription_id ? (
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-500">カード情報を取得中...</div>
                <button onClick={() => portalMutation.mutate()} disabled={portalMutation.isPending} className="text-sm text-gray-600 hover:text-gray-900 underline">変更</button>
              </div>
            ) : (
              <div className="text-sm text-gray-500">{t('paymentMethod.noMethod')}</div>
            )}
          </div>
        </div>

        {/* Auto Email Toggle */}
        <div>
          <h2 className="text-sm font-medium text-gray-500 mb-2">請求書の自動送信</h2>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700">毎月の請求書をメールで受け取る</div>
              <button
                onClick={() => updateBillingSettingsMutation.mutate(!autoEmailEnabled)}
                disabled={updateBillingSettingsMutation.isPending}
                className={`relative w-11 h-6 rounded-full transition-colors ${autoEmailEnabled ? 'bg-violet-600' : 'bg-gray-300'} ${updateBillingSettingsMutation.isPending ? 'opacity-50' : ''}`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${autoEmailEnabled ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Upgrade Link */}
      {isFree && (
        <button onClick={() => setShowPlans(true)} className="text-sm text-violet-600 hover:text-violet-700">
          プランをアップグレード →
        </button>
      )}

      {/* Plans Grid */}
      {showPlans && (
        <>
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
                          {t('billedYearly', { price: price.toLocaleString() })}
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
        </>
      )}
    </div>
  );
}
