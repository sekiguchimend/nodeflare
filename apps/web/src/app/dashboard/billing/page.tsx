'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  price_monthly_usd: number;
  price_yearly_usd: number;
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

export default function BillingPage() {
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
  const isActive = subscription?.status === 'active';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Billing & Subscription</h1>
        <p className="text-muted-foreground mt-1">
          Manage your subscription and billing settings
        </p>
      </div>

      {/* Current Plan Status */}
      <Card>
        <CardHeader>
          <CardTitle>Current Plan</CardTitle>
          <CardDescription>Your current subscription status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold capitalize">{currentPlan} Plan</p>
              <p className="text-sm text-muted-foreground">
                Status: <span className={isActive ? 'text-green-600' : 'text-yellow-600'}>{subscription?.status || 'free'}</span>
              </p>
              {subscription?.current_period_end && (
                <p className="text-sm text-muted-foreground">
                  Current period ends: {new Date(subscription.current_period_end * 1000).toLocaleDateString()}
                </p>
              )}
            </div>
            {subscription?.stripe_subscription_id && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => portalMutation.mutate()}
                  disabled={portalMutation.isPending}
                >
                  {portalMutation.isPending ? 'Loading...' : 'Manage Subscription'}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={cancelMutation.isPending}>
                      {cancelMutation.isPending ? 'Cancelling...' : 'Cancel Subscription'}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel Subscription</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to cancel your subscription? You will continue to have access until the end of your current billing period, after which your account will be downgraded to the Free plan.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => cancelMutation.mutate()}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Yes, Cancel Subscription
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Plan Selector */}
      <div className="flex justify-center mb-6">
        <div className="inline-flex items-center bg-muted rounded-lg p-1">
          <button
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              selectedInterval === 'monthly' ? 'bg-background shadow' : 'text-muted-foreground'
            }`}
            onClick={() => setSelectedInterval('monthly')}
          >
            Monthly
          </button>
          <button
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              selectedInterval === 'yearly' ? 'bg-background shadow' : 'text-muted-foreground'
            }`}
            onClick={() => setSelectedInterval('yearly')}
          >
            Yearly <span className="text-green-600 text-xs ml-1">Save 20%</span>
          </button>
        </div>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {plans?.map((plan) => {
          const isCurrent = currentPlan === plan.plan;
          const price = selectedInterval === 'yearly' ? plan.price_yearly_usd : plan.price_monthly_usd;
          const monthlyPrice = selectedInterval === 'yearly' ? Math.round(price / 12) : price;

          return (
            <Card key={plan.plan} className={`relative ${isCurrent ? 'border-primary ring-2 ring-primary' : ''}`}>
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-primary-foreground text-xs font-medium rounded-full">
                  Current Plan
                </div>
              )}
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-6">
                  <span className="text-4xl font-bold">${monthlyPrice}</span>
                  <span className="text-muted-foreground">/month</span>
                  {selectedInterval === 'yearly' && price > 0 && (
                    <p className="text-sm text-muted-foreground">
                      Billed ${price}/year
                    </p>
                  )}
                </div>

                <ul className="space-y-3">
                  {plan.features.map((feature, index) => (
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
                    {isCurrent ? 'Current Plan' : 'Downgrade'}
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    variant={isCurrent ? 'outline' : 'default'}
                    disabled={isCurrent || checkoutMutation.isPending}
                    onClick={() => checkoutMutation.mutate({ plan: plan.plan, yearly: selectedInterval === 'yearly' })}
                  >
                    {isCurrent ? 'Current Plan' : checkoutMutation.isPending ? 'Loading...' : 'Upgrade'}
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {/* Usage Limits */}
      {currentPlan && plans && (
        <Card>
          <CardHeader>
            <CardTitle>Plan Limits</CardTitle>
            <CardDescription>Your current usage limits based on your plan</CardDescription>
          </CardHeader>
          <CardContent>
            {(() => {
              const plan = plans.find(p => p.plan === currentPlan);
              if (!plan) return null;

              const limits = [
                { label: 'MCP Servers', value: plan.limits.max_servers === 4294967295 ? 'Unlimited' : plan.limits.max_servers },
                { label: 'Deployments/month', value: plan.limits.max_deployments_per_month === 4294967295 ? 'Unlimited' : plan.limits.max_deployments_per_month },
                { label: 'API Requests/month', value: plan.limits.max_requests_per_month > 1e15 ? 'Unlimited' : plan.limits.max_requests_per_month.toLocaleString() },
                { label: 'Team Members', value: plan.limits.max_team_members === 4294967295 ? 'Unlimited' : plan.limits.max_team_members },
                { label: 'Log Retention', value: `${plan.limits.log_retention_days} days` },
                { label: 'Custom Domains', value: plan.limits.custom_domains ? 'Yes' : 'No' },
                { label: 'Priority Support', value: plan.limits.priority_support ? 'Yes' : 'No' },
                { label: 'SSO/SAML', value: plan.limits.sso_enabled ? 'Yes' : 'No' },
              ];

              return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {limits.map((limit, index) => (
                    <div key={index} className="text-center p-4 bg-muted rounded-lg">
                      <p className="text-sm text-muted-foreground">{limit.label}</p>
                      <p className="text-lg font-semibold mt-1">{limit.value}</p>
                    </div>
                  ))}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* FAQ Section */}
      <Card>
        <CardHeader>
          <CardTitle>Billing FAQ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium">How do I cancel my subscription?</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Click "Manage Subscription" to access the billing portal where you can cancel your subscription.
              You'll continue to have access until the end of your billing period.
            </p>
          </div>
          <div>
            <h4 className="font-medium">Can I change plans?</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Yes! You can upgrade or downgrade your plan at any time. When upgrading, you'll be charged the prorated amount.
              When downgrading, the change takes effect at the end of your current billing period.
            </p>
          </div>
          <div>
            <h4 className="font-medium">What payment methods do you accept?</h4>
            <p className="text-sm text-muted-foreground mt-1">
              We accept all major credit cards (Visa, Mastercard, American Express) through our secure payment processor, Stripe.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
