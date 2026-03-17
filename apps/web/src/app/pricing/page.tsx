'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import Link from 'next/link';

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

export default function PricingPage() {
  const [selectedInterval, setSelectedInterval] = useState<'monthly' | 'yearly'>('monthly');
  const { user } = useAuth();

  const { data: plans, isLoading } = useQuery<Plan[]>({
    queryKey: ['billing-plans'],
    queryFn: () => api.get('/billing/plans'),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold">
            Nodeflare
          </Link>
          <nav className="flex items-center gap-4">
            {user ? (
              <Link href="/dashboard">
                <Button>Dashboard</Button>
              </Link>
            ) : (
              <Link href="/api/v1/auth/github">
                <Button>Get Started</Button>
              </Link>
            )}
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 text-center">
        <div className="container mx-auto px-4">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Start for free, scale as you grow. No hidden fees, no surprises.
          </p>

          {/* Interval Toggle */}
          <div className="inline-flex items-center bg-muted rounded-lg p-1">
            <button
              className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
                selectedInterval === 'monthly' ? 'bg-background shadow' : 'text-muted-foreground'
              }`}
              onClick={() => setSelectedInterval('monthly')}
            >
              Monthly
            </button>
            <button
              className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
                selectedInterval === 'yearly' ? 'bg-background shadow' : 'text-muted-foreground'
              }`}
              onClick={() => setSelectedInterval('yearly')}
            >
              Yearly <span className="text-green-600 text-xs ml-1">Save 20%</span>
            </button>
          </div>
        </div>
      </section>

      {/* Plans Grid */}
      <section className="pb-20">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
            {plans?.map((plan, index) => {
              const price = selectedInterval === 'yearly' ? plan.price_yearly_usd : plan.price_monthly_usd;
              const monthlyPrice = selectedInterval === 'yearly' ? Math.round(price / 12) : price;
              const isPopular = plan.plan === 'pro';

              return (
                <Card key={plan.plan} className={`relative ${isPopular ? 'border-primary ring-2 ring-primary' : ''}`}>
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-primary-foreground text-xs font-medium rounded-full">
                      Most Popular
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
                      {plan.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm">
                          <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    {user ? (
                      <Link href="/dashboard/billing" className="w-full">
                        <Button className="w-full" variant={isPopular ? 'default' : 'outline'}>
                          {plan.plan === 'free' ? 'Current Plan' : 'Upgrade'}
                        </Button>
                      </Link>
                    ) : (
                      <Link href="/api/v1/auth/github" className="w-full">
                        <Button className="w-full" variant={isPopular ? 'default' : 'outline'}>
                          Get Started
                        </Button>
                      </Link>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Feature Comparison */}
      <section className="py-20 bg-muted/50">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Compare Plans</h2>
          <div className="max-w-5xl mx-auto overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-4 px-4">Feature</th>
                  {plans?.map((plan) => (
                    <th key={plan.plan} className="text-center py-4 px-4">{plan.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-4 px-4 font-medium">MCP Servers</td>
                  {plans?.map((plan) => (
                    <td key={plan.plan} className="text-center py-4 px-4">
                      {plan.limits.max_servers === 4294967295 ? 'Unlimited' : plan.limits.max_servers}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-4 px-4 font-medium">Deployments/month</td>
                  {plans?.map((plan) => (
                    <td key={plan.plan} className="text-center py-4 px-4">
                      {plan.limits.max_deployments_per_month === 4294967295 ? 'Unlimited' : plan.limits.max_deployments_per_month}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-4 px-4 font-medium">API Requests/month</td>
                  {plans?.map((plan) => (
                    <td key={plan.plan} className="text-center py-4 px-4">
                      {plan.limits.max_requests_per_month > 1e15 ? 'Unlimited' : `${(plan.limits.max_requests_per_month / 1000).toFixed(0)}K`}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-4 px-4 font-medium">Team Members</td>
                  {plans?.map((plan) => (
                    <td key={plan.plan} className="text-center py-4 px-4">
                      {plan.limits.max_team_members === 4294967295 ? 'Unlimited' : plan.limits.max_team_members}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-4 px-4 font-medium">Log Retention</td>
                  {plans?.map((plan) => (
                    <td key={plan.plan} className="text-center py-4 px-4">{plan.limits.log_retention_days} days</td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-4 px-4 font-medium">Custom Domains</td>
                  {plans?.map((plan) => (
                    <td key={plan.plan} className="text-center py-4 px-4">
                      {plan.limits.custom_domains ? (
                        <svg className="w-5 h-5 text-green-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-muted-foreground mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-4 px-4 font-medium">Priority Support</td>
                  {plans?.map((plan) => (
                    <td key={plan.plan} className="text-center py-4 px-4">
                      {plan.limits.priority_support ? (
                        <svg className="w-5 h-5 text-green-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-muted-foreground mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-4 px-4 font-medium">SSO/SAML</td>
                  {plans?.map((plan) => (
                    <td key={plan.plan} className="text-center py-4 px-4">
                      {plan.limits.sso_enabled ? (
                        <svg className="w-5 h-5 text-green-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-muted-foreground mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to get started?</h2>
          <p className="text-xl text-muted-foreground mb-8">
            Start with our free plan and upgrade when you're ready.
          </p>
          {user ? (
            <Link href="/dashboard">
              <Button size="lg">Go to Dashboard</Button>
            </Link>
          ) : (
            <Link href="/api/v1/auth/github">
              <Button size="lg">Start for Free</Button>
            </Link>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} Nodeflare. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
