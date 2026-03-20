'use client';

import { useState } from 'react';
import { Header, Footer } from '@/components/layout';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

const plans = [
  {
    name: 'Free',
    price: 0,
    description: '個人開発や検証に最適',
    features: [
      'サーバー3つまで',
      '月間10,000リクエスト',
      'コミュニティサポート',
      '基本的なログ（7日間保持）',
    ],
    cta: '無料で始める',
    popular: false,
  },
  {
    name: 'Pro',
    price: 2980,
    description: '本番運用に必要な全機能',
    features: [
      'サーバー20個まで',
      '月間500,000リクエスト',
      'カスタムドメイン',
      'ログ30日間保持',
      'メールサポート',
    ],
    cta: 'Proを始める',
    popular: true,
  },
  {
    name: 'Team',
    price: 9800,
    description: 'チームでの本格運用に',
    features: [
      'サーバー100個まで',
      '月間5,000,000リクエスト',
      'カスタムドメイン',
      '優先サポート',
      'ログ90日間保持',
      'チームメンバー10人まで',
    ],
    cta: 'Teamを始める',
    popular: false,
  },
];

const comparisonFeatures = [
  { name: 'MCPサーバー数', free: '3', pro: '20', team: '100' },
  { name: 'リクエスト/月', free: '10,000', pro: '500,000', team: '5,000,000' },
  { name: 'チームメンバー', free: '1', pro: '1', team: '10' },
  { name: 'ログ保持期間', free: '7日', pro: '30日', team: '90日' },
  { name: 'カスタムドメイン', free: false, pro: true, team: true },
  { name: '優先サポート', free: false, pro: false, team: true },
];

export default function PricingPage() {
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
            <p className="text-xl text-gray-600">
              小規模なら無料。スケールに合わせてアップグレード。
            </p>
          </div>
        </section>

        {/* Plans */}
        <section className="pb-20">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <div className="grid md:grid-cols-3 gap-6">
              {plans.map((plan) => (
                <div
                  key={plan.name}
                  className="relative group"
                >
                  {plan.popular && (
                    <div className="absolute -inset-[1px] bg-violet-500 rounded-2xl" />
                  )}
                  <div
                    className={`relative rounded-2xl p-8 h-full ${
                      plan.popular
                        ? 'bg-gray-900 text-white'
                        : 'bg-white border border-gray-200 hover:border-gray-300 hover:shadow-lg transition-all'
                    }`}
                  >
                    <div className={`flex items-center gap-2 mb-2`}>
                      <span className={`text-sm font-medium ${plan.popular ? 'text-violet-300' : 'text-gray-500'}`}>
                        {plan.name}
                      </span>
                      {plan.popular && (
                        <span className="px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 text-xs font-medium">
                          おすすめ
                        </span>
                      )}
                    </div>

                    <div className="flex items-baseline gap-1 mb-4">
                      <span className="text-4xl font-bold">¥{plan.price.toLocaleString()}</span>
                      <span className={plan.popular ? 'text-gray-400' : 'text-gray-500'}>/月</span>
                    </div>

                    <p className={`mb-6 ${plan.popular ? 'text-gray-400' : 'text-gray-600'}`}>
                      {plan.description}
                    </p>

                    <ul className="space-y-3 mb-8">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-center gap-3 text-sm">
                          <svg
                            className={`w-5 h-5 flex-shrink-0 ${plan.popular ? 'text-violet-400' : 'text-gray-400'}`}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                          >
                            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span className={plan.popular ? 'text-gray-200' : 'text-gray-700'}>
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <a href="/api/v1/auth/github" className="block">
                      <Button
                        className={`w-full h-12 ${
                          plan.popular
                            ? 'bg-violet-500 hover:bg-violet-400 text-white'
                            : 'bg-gray-900 text-white hover:bg-gray-800'
                        }`}
                      >
                        {plan.cta}
                      </Button>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Comparison Table */}
        <section className="py-20 border-t border-gray-200">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-12">
              プラン比較
            </h2>

            <div className="overflow-hidden rounded-xl border-2 border-gray-300 shadow-sm">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-100 border-b-2 border-gray-300">
                    <th className="text-left py-4 px-6 font-semibold text-gray-900">機能</th>
                    <th className="text-center py-4 px-4 font-semibold text-gray-900 border-l border-gray-300">Free</th>
                    <th className="text-center py-4 px-4 font-semibold text-gray-900 bg-violet-100 border-l border-gray-300">Pro</th>
                    <th className="text-center py-4 px-4 font-semibold text-gray-900 border-l border-gray-300">Team</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonFeatures.map((feature, idx) => (
                    <tr key={feature.name} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} border-t border-gray-200`}>
                      <td className="py-4 px-6 text-gray-700 font-medium">{feature.name}</td>
                      <td className="py-4 px-4 text-center border-l border-gray-200">
                        {typeof feature.free === 'boolean' ? (
                          feature.free ? (
                            <svg className="w-5 h-5 text-green-600 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )
                        ) : (
                          <span className="text-gray-900 font-medium">{feature.free}</span>
                        )}
                      </td>
                      <td className={`py-4 px-4 text-center border-l border-gray-200 ${idx % 2 === 0 ? 'bg-violet-50' : 'bg-violet-100'}`}>
                        {typeof feature.pro === 'boolean' ? (
                          feature.pro ? (
                            <svg className="w-5 h-5 text-green-600 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )
                        ) : (
                          <span className="text-gray-900 font-medium">{feature.pro}</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-center border-l border-gray-200">
                        {typeof feature.team === 'boolean' ? (
                          feature.team ? (
                            <svg className="w-5 h-5 text-green-600 mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )
                        ) : (
                          <span className="text-gray-900 font-medium">{feature.team}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
