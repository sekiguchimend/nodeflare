'use client';

import { Button } from '@/components/ui/button';
import { Header, Footer } from '@/components/layout';
import Link from 'next/link';

const posts = [
  {
    slug: 'getting-started-with-mcp',
    title: 'MCPサーバーの始め方：5分でデプロイする方法',
    excerpt: 'MCP Cloudを使って、初めてのMCPサーバーをデプロイする手順を解説します。GitHubリポジトリの準備から本番公開まで。',
    date: '2024年1月15日',
    category: 'チュートリアル',
    readTime: '5分',
  },
  {
    slug: 'mcp-use-cases',
    title: 'MCPサーバーの活用事例：Notionとの連携からDB操作まで',
    excerpt: '実際にMCP Cloudで運用されているサーバーの事例を紹介。Notion API連携、データベースクエリ、ファイル操作など。',
    date: '2024年1月10日',
    category: '事例紹介',
    readTime: '8分',
  },
  {
    slug: 'security-best-practices',
    title: 'MCPサーバーのセキュリティベストプラクティス',
    excerpt: 'APIキーの管理、環境変数の設定、アクセス制御など、本番環境で安全に運用するためのポイントを解説。',
    date: '2024年1月5日',
    category: 'セキュリティ',
    readTime: '6分',
  },
  {
    slug: 'typescript-mcp-server',
    title: 'TypeScriptでMCPサーバーを構築する',
    excerpt: 'MCP SDKを使ってTypeScriptでサーバーを実装する方法。型安全なツール定義とエラーハンドリング。',
    date: '2024年1月1日',
    category: 'チュートリアル',
    readTime: '10分',
  },
  {
    slug: 'monitoring-and-logging',
    title: 'ログとモニタリングで問題を素早く特定する',
    excerpt: 'MCP Cloudのログ機能を活用して、ツール呼び出しのデバッグやパフォーマンス監視を行う方法。',
    date: '2023年12月28日',
    category: '運用',
    readTime: '7分',
  },
  {
    slug: 'custom-domains',
    title: 'カスタムドメインの設定方法',
    excerpt: '独自ドメインでMCPサーバーを公開する手順。DNS設定からSSL証明書の自動発行まで。',
    date: '2023年12月20日',
    category: 'チュートリアル',
    readTime: '4分',
  },
];

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-white">
      <Header />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">ブログ</h1>
          <p className="text-lg text-gray-600">
            MCP Cloudの使い方、ベストプラクティス、アップデート情報をお届けします。
          </p>
        </div>

        <div className="grid gap-8">
          {posts.map((post) => (
            <article key={post.slug} className="group">
              <Link href={`/blog/${post.slug}`} className="block p-6 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all bg-white">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs font-medium text-violet-600 bg-violet-50 px-2 py-1 rounded">
                    {post.category}
                  </span>
                  <span className="text-sm text-gray-500">{post.date}</span>
                  <span className="text-sm text-gray-400">·</span>
                  <span className="text-sm text-gray-500">{post.readTime}で読める</span>
                </div>
                <h2 className="text-xl font-semibold text-gray-900 group-hover:text-violet-600 transition-colors mb-2">
                  {post.title}
                </h2>
                <p className="text-gray-600 leading-relaxed">
                  {post.excerpt}
                </p>
              </Link>
            </article>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}
