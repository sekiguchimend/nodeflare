'use client';

import { useState } from 'react';
import { Header, Footer } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { PLANS, formatPrice } from '@/lib/plans';

const comparisonFeatures = [
  { name: 'MCPサーバー数', key: 'max_servers' as const },
  { name: 'デプロイ/月', key: 'max_deployments_per_month' as const },
  { name: 'リクエスト/月', key: 'max_requests_per_month' as const },
  { name: 'チームメンバー', key: 'max_team_members' as const },
  { name: 'ログ保持期間', key: 'log_retention_days' as const },
  { name: 'カスタムドメイン', key: 'custom_domains' as const },
  { name: '優先サポート', key: 'priority_support' as const },
  { name: 'SSO/SAML', key: 'sso_enabled' as const },
];

function formatLimitValue(key: string, value: number | boolean): string | boolean {
  if (typeof value === 'boolean') return value;
  if (value === Infinity || value > 1_000_000_000) return '無制限';
  if (key === 'log_retention_days') return `${value}日`;
  if (key === 'max_requests_per_month') {
    if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString()}M`;
    if (value >= 1_000) return `${(value / 1_000).toLocaleString()}K`;
    return value.toLocaleString();
  }
  return value.toLocaleString();
}

export default function PricingPage() {
  const [isYearly, setIsYearly] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <main>
        {/* Hero */}
        <section className="py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
            <h1 className="text-4xl sm:text-5xl font-black text-gray-900 mb-4">
              料金プラン
            </h1>
            <p className="text-xl text-gray-600 mb-8">
              小規模なら無料。スケールに合わせてアップグレード。
            </p>

            {/* Billing Toggle */}
            <div className="inline-flex items-center bg-gray-100 rounded-lg p-1">
              <button
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  !isYearly ? 'bg-white shadow text-gray-900' : 'text-gray-600'
                }`}
                onClick={() => setIsYearly(false)}
              >
                月額
              </button>
              <button
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  isYearly ? 'bg-white shadow text-gray-900' : 'text-gray-600'
                }`}
                onClick={() => setIsYearly(true)}
              >
                年額 <span className="text-green-600 text-xs ml-1">17%お得</span>
              </button>
            </div>
          </div>
        </section>

        {/* Plans */}
        <section className="pb-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {PLANS.map((plan) => {
                const isPopular = plan.plan === 'pro';
                const price = isYearly ? plan.price_yearly_jpy : plan.price_monthly_jpy;
                const monthlyEquivalent = isYearly ? Math.round(price / 12) : price;

                return (
                  <div key={plan.plan} className="relative group">
                    {isPopular && (
                      <div className="absolute -inset-[1px] bg-violet-500 rounded-2xl" />
                    )}
                    <div
                      className={`relative rounded-2xl p-8 h-full ${
                        isPopular
                          ? 'bg-gray-900 text-white'
                          : 'bg-white border border-gray-200 hover:border-gray-300 hover:shadow-lg transition-all'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-sm font-medium ${isPopular ? 'text-violet-300' : 'text-gray-500'}`}>
                          {plan.name}
                        </span>
                        {isPopular && (
                          <span className="px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 text-xs font-medium">
                            おすすめ
                          </span>
                        )}
                      </div>

                      <div className="flex items-baseline gap-1 mb-2">
                        <span className="text-4xl font-bold">{formatPrice(monthlyEquivalent)}</span>
                        <span className={isPopular ? 'text-gray-400' : 'text-gray-500'}>/月</span>
                      </div>

                      {isYearly && price > 0 && (
                        <p className={`text-sm mb-4 ${isPopular ? 'text-gray-400' : 'text-gray-500'}`}>
                          年額 {formatPrice(price)}
                        </p>
                      )}

                      <p className={`mb-6 ${isPopular ? 'text-gray-400' : 'text-gray-600'}`}>
                        {plan.description}
                      </p>

                      <ul className="space-y-3 mb-8">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-center gap-3 text-sm">
                            <svg
                              className={`w-5 h-5 flex-shrink-0 ${isPopular ? 'text-violet-400' : 'text-gray-400'}`}
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                            >
                              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <span className={isPopular ? 'text-gray-200' : 'text-gray-700'}>
                              {feature}
                            </span>
                          </li>
                        ))}
                      </ul>

                      <a href="/api/v1/auth/github" className="block">
                        <Button
                          className={`w-full h-12 ${
                            isPopular
                              ? 'bg-violet-500 hover:bg-violet-400 text-white'
                              : plan.plan === 'enterprise'
                              ? 'bg-gray-900 text-white hover:bg-gray-800'
                              : 'bg-gray-900 text-white hover:bg-gray-800'
                          }`}
                        >
                          {plan.plan === 'free' ? '無料で始める' : plan.plan === 'enterprise' ? 'お問い合わせ' : `${plan.name}を始める`}
                        </Button>
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Comparison Table */}
        <section className="py-20 border-t border-gray-200">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-12">
              プラン比較
            </h2>

            <div className="overflow-x-auto">
              <div className="overflow-hidden rounded-xl border-2 border-gray-300 shadow-sm min-w-[640px]">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-100 border-b-2 border-gray-300">
                      <th className="text-left py-4 px-6 font-semibold text-gray-900">機能</th>
                      {PLANS.map((plan) => (
                        <th
                          key={plan.plan}
                          className={`text-center py-4 px-4 font-semibold text-gray-900 border-l border-gray-300 ${
                            plan.plan === 'pro' ? 'bg-violet-100' : ''
                          }`}
                        >
                          {plan.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonFeatures.map((feature, idx) => (
                      <tr key={feature.key} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-t border-gray-200`}>
                        <td className="py-4 px-6 text-gray-700 font-medium">{feature.name}</td>
                        {PLANS.map((plan) => {
                          const value = plan.limits[feature.key];
                          const displayValue = formatLimitValue(feature.key, value);

                          return (
                            <td
                              key={plan.plan}
                              className={`py-4 px-4 text-center border-l border-gray-200 ${
                                plan.plan === 'pro' ? (idx % 2 === 0 ? 'bg-violet-50' : 'bg-violet-100') : ''
                              }`}
                            >
                              {typeof displayValue === 'boolean' ? (
                                displayValue ? (
                                  <svg className="w-5 h-5 text-green-600 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )
                              ) : (
                                <span className="text-gray-900 font-medium">{displayValue}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <FAQSection />
      </main>

      <Footer />
    </div>
  );
}

const faqs = [
  {
    q: '無料プランから有料プランへの移行は簡単ですか？',
    a: 'はい、ダッシュボードからワンクリックでアップグレードできます。データや設定はそのまま引き継がれます。',
  },
  {
    q: '支払い方法は何に対応していますか？',
    a: 'クレジットカード（Visa、Mastercard、American Express、JCB）に対応しています。',
  },
  {
    q: '解約はいつでもできますか？',
    a: 'はい、いつでも解約可能です。解約後も請求期間の終了まではサービスをご利用いただけます。',
  },
  {
    q: 'リクエスト数の上限を超えたらどうなりますか？',
    a: '上限に近づくとメールでお知らせします。上限を超えた場合、追加料金が発生するか、一時的にリクエストが制限されます。',
  },
  {
    q: '年額払いにするとどのくらいお得ですか？',
    a: '年額払いにすると約17%お得になります。例えばProプランは月額2,980円ですが、年額払いでは月あたり約2,483円相当になります。',
  },
];

function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="py-20 border-t bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <span className="inline-block text-violet-600 text-sm font-medium mb-3">FAQ</span>
          <h2 className="text-2xl font-bold text-gray-900">よくある質問</h2>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, idx) => (
            <div
              key={idx}
              className={`bg-white rounded-xl border transition-all duration-300 overflow-hidden ${
                openIndex === idx
                  ? 'border-violet-400 shadow-lg shadow-violet-500/10'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <button
                onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
                className="w-full flex items-center gap-4 p-5 text-left"
              >
                <span className="flex-1 font-medium text-gray-900">{faq.q}</span>
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                    openIndex === idx ? 'bg-violet-100 rotate-180' : 'bg-gray-100'
                  }`}
                >
                  <svg
                    className={`w-4 h-4 transition-colors ${
                      openIndex === idx ? 'text-violet-600' : 'text-gray-400'
                    }`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>
              </button>
              <div
                className={`transition-all duration-300 ${
                  openIndex === idx ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                <div className="px-5 pb-5">
                  <p className="text-gray-600 leading-relaxed">{faq.a}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
