'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Header, Footer } from '@/components/layout';
import Link from 'next/link';

const faqs = [
  {
    category: '基本',
    questions: [
      {
        q: 'Nodeflareとは何ですか？',
        a: 'NodeflareはMCPサーバーをクラウド上でホスティングするサービスです。MCPサーバーとは、Claude等のAIアシスタントが外部のツールやデータにアクセスするためのサーバーです。GitHubリポジトリを接続するだけで、自動でビルド・デプロイが行われます。',
      },
      {
        q: 'MCPサーバーとは何ですか？',
        a: 'MCP（Model Context Protocol）サーバーは、AIアシスタントが使用できるツールを定義するサーバーです。例えば、データベースの検索、ファイルの読み書き、外部APIの呼び出しなど、任意の機能をAIに提供できます。',
      },
      {
        q: 'どのAIで使えますか？',
        a: '現在、Anthropic社のClaudeに対応しています。Claude Desktop、Claude.ai、API経由など、MCPに対応した環境であればご利用いただけます。',
      },
    ],
  },
  {
    category: '料金',
    questions: [
      {
        q: '無料プランでどこまで使えますか？',
        a: '無料プランでは、サーバー3つまで、月間10,000リクエストまでご利用いただけます。個人での利用や小規模なプロジェクトには十分な容量です。',
      },
      {
        q: '有料プランにアップグレードするタイミングは？',
        a: 'サーバー数が4つ以上必要な場合、月間リクエスト数が10,000を超える場合、またはカスタムドメインや優先サポートが必要な場合は、Proプラン（月額¥2,980）へのアップグレードをご検討ください。',
      },
      {
        q: '支払い方法は何がありますか？',
        a: 'クレジットカード（Visa、Mastercard、American Express、JCB）に対応しています。請求書払いをご希望の場合は、お問い合わせください。',
      },
    ],
  },
  {
    category: '技術',
    questions: [
      {
        q: 'どの言語に対応していますか？',
        a: '現在、TypeScript / JavaScriptに対応しています。Python対応は近日公開予定です。',
      },
      {
        q: 'デプロイにかかる時間は？',
        a: '通常、GitHubへのpushから1〜2分程度でデプロイが完了します。初回のビルドは依存関係のインストールがあるため、やや時間がかかる場合があります。',
      },
      {
        q: '環境変数はどのように設定しますか？',
        a: 'ダッシュボードの各サーバー設定画面から、環境変数を安全に設定できます。APIキーやシークレットなどの機密情報も暗号化して保存されます。',
      },
      {
        q: 'カスタムドメインは使えますか？',
        a: 'Proプラン以上でカスタムドメインをご利用いただけます。DNSの設定後、SSL証明書は自動で発行されます。',
      },
    ],
  },
  {
    category: 'セキュリティ',
    questions: [
      {
        q: 'APIキーはどのように管理されますか？',
        a: '各サーバーに対してAPIキーを発行できます。キーごとにアクセス権限を設定でき、不要になったキーはいつでも無効化できます。',
      },
      {
        q: 'アクセスログは確認できますか？',
        a: 'はい、すべてのツール呼び出しのログをダッシュボードから確認できます。リクエスト内容、レスポンス、実行時間などを確認できます。',
      },
      {
        q: 'データはどこに保存されますか？',
        a: 'サーバーは東京リージョンで稼働しており、データも国内に保存されます。',
      },
    ],
  },
];

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<string | null>(null);

  const toggleQuestion = (key: string) => {
    setOpenIndex(openIndex === key ? null : key);
  };

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="mb-12 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">よくある質問</h1>
          <p className="text-lg text-gray-600">
            Nodeflareについてのよくある質問と回答です。
          </p>
        </div>

        <div className="space-y-12">
          {faqs.map((section) => (
            <div key={section.category}>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">
                {section.category}
              </h2>
              <div className="space-y-3">
                {section.questions.map((item, idx) => {
                  const key = `${section.category}-${idx}`;
                  const isOpen = openIndex === key;
                  return (
                    <div key={key} className="border border-gray-100 rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggleQuestion(key)}
                        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
                      >
                        <span className="font-medium text-gray-900">{item.q}</span>
                        <svg
                          className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-4">
                          <p className="text-gray-600 leading-relaxed">{item.a}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center p-8 bg-gray-50 rounded-xl">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            お探しの回答が見つかりませんか？
          </h3>
          <p className="text-gray-600 mb-4">
            お気軽にお問い合わせください。
          </p>
          <Link href="/contact">
            <Button className="bg-violet-600 hover:bg-violet-700 text-white">
              お問い合わせ
            </Button>
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
