'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Header, Footer } from '@/components/layout';
import Link from 'next/link';

export default function HomePage() {
  const t = useTranslations('home');
  const tNav = useTranslations('nav');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [typedText, setTypedText] = useState('');
  const fullText = 'npx mcp-cloud deploy';

  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      if (i < fullText.length) {
        setTypedText(fullText.slice(0, i + 1));
        i++;
      } else {
        clearInterval(timer);
      }
    }, 80);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <main>
        {/* Hero - ドットパターン背景 */}
        <section className="relative pt-16 pb-20 sm:pt-20 sm:pb-24 overflow-hidden bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] bg-[size:20px_20px]">
          {/* 右側の背景画像 */}
          <div
            className="absolute -right-20 w-[60%] h-[120%] bg-no-repeat bg-top bg-contain pointer-events-none hidden lg:block"
            style={{ backgroundImage: 'url(/top.png)', top: '-5%' }}
          />
          <div className="relative max-w-6xl mx-auto px-6 sm:px-10 lg:px-16">
            <div>
              <div className="relative inline-block mb-6 ml-1">
                <div className="relative px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg">
                  {t('title')}
                  <div className="absolute -bottom-1.5 left-6 w-2.5 h-2.5 bg-gray-900 rotate-45" />
                </div>
              </div>

              <h1 className="text-6xl sm:text-7xl lg:text-8xl font-black text-gray-900 tracking-tight leading-[1.05] text-left">
                {t('heroTitle1')}<br />
                <span className="text-violet-600">{t('heroTitle2')}</span>
              </h1>

              <div className="text-center">
                <p className="mt-6 text-lg text-gray-800 leading-relaxed max-w-2xl text-left">
                  {t('heroDescription1')}<br className="hidden sm:block" />
                  {t('heroDescription2')}
                </p>

                {/* ターミナル風コマンド */}
                <div className="mt-8 inline-flex items-center gap-3 px-5 py-3 rounded-xl bg-gray-900 text-left">
                  <span className="text-gray-500">$</span>
                  <span className="text-emerald-400 font-mono">{typedText}</span>
                  <span className="w-2 h-5 bg-emerald-400 animate-blink" />
                </div>

                <div className="mt-8 flex flex-wrap justify-center gap-4">
                <a href="/api/v1/auth/github">
                  <Button size="lg" className="h-14 px-8 bg-violet-600 hover:bg-violet-700 text-white text-base gap-2 shadow-lg hover:shadow-xl transition-all">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                    </svg>
                    {t('startWithGithub')}
                  </Button>
                </a>
                <Link href="/docs">
                  <Button size="lg" variant="outline" className="h-14 px-8 text-base border-gray-400 hover:bg-gray-50">
                    {tNav('docs')}
                  </Button>
                </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Dashboard Preview - カード重ねデザイン */}
        <section className="pb-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <div className="relative">
              {/* 背景の装飾 */}
              <div className="absolute -inset-4 bg-gray-100/80 rounded-3xl transform rotate-1" />
              <div className="absolute -inset-4 bg-white rounded-3xl transform -rotate-1 shadow-xl" />

              {/* メインカード */}
              <div className="relative rounded-2xl border border-gray-200 shadow-2xl overflow-hidden bg-white">
                <div className="border-b border-gray-100 bg-gray-50/80 px-4 py-3 flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-yellow-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                  </div>
                  <div className="flex-1 flex justify-center">
                    <div className="px-4 py-1 rounded-md bg-white border border-gray-200 text-xs text-gray-500 font-mono">
                      dashboard.mcpcloud.dev
                    </div>
                  </div>
                </div>

                <div className="p-8">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900">サーバー</h2>
                      <p className="text-gray-500 mt-1">3つ稼働中</p>
                    </div>
                    <Button className="bg-violet-600 hover:bg-violet-700 text-white gap-2">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                      </svg>
                      新規作成
                    </Button>
                  </div>

                  <div className="grid gap-4">
                    {[
                      { name: 'notion-sync', domain: 'notion-sync.mcp.run', status: '稼働中', color: 'bg-emerald-500', requests: '12.4k', uptime: '99.9%' },
                      { name: 'database-query', domain: 'db-query.mcp.run', status: '稼働中', color: 'bg-emerald-500', requests: '8.2k', uptime: '99.8%' },
                      { name: 'file-manager', domain: 'file-mgr.mcp.run', status: 'デプロイ中', color: 'bg-amber-500', requests: '-', uptime: '-' },
                    ].map((server, idx) => (
                      <div
                        key={server.name}
                        className="group flex items-center justify-between p-5 rounded-xl border border-gray-100 hover:border-violet-200 hover:shadow-lg hover:shadow-violet-500/5 transition-all duration-300 bg-white cursor-pointer"
                        style={{ animationDelay: `${idx * 100}ms` }}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-violet-600 flex items-center justify-center text-white font-bold text-lg">
                            {server.name[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900 group-hover:text-violet-600 transition-colors">{server.name}</p>
                            <p className="text-sm text-gray-500">{server.domain}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-8">
                          <div className="text-right hidden sm:block">
                            <p className="text-sm text-gray-500">リクエスト</p>
                            <p className="font-semibold text-gray-900">{server.requests}</p>
                          </div>
                          <div className="text-right hidden sm:block">
                            <p className="text-sm text-gray-500">稼働率</p>
                            <p className="font-semibold text-gray-900">{server.uptime}</p>
                          </div>
                          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-50">
                            <span className={`w-2 h-2 rounded-full ${server.color} ${server.status === 'デプロイ中' ? 'animate-pulse' : ''}`} />
                            <span className="text-sm text-gray-600">{server.status}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features - 吹き出しブロック */}
        <section className="py-24">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-16">
              <span className="inline-block text-violet-600 text-sm font-medium mb-4">
                Why Nodeflare?
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">ローカル運用の限界を超える</h2>
              <p className="mt-4 text-gray-500 text-lg">MCPサーバーを本番品質で運用するために必要な機能をすべて</p>
            </div>

            {/* 吹き出しブロック */}
            <div className="space-y-5">
              {[
                { title: 'ゼロコンフィグ', desc: 'MCP SDKで書いたコードをそのままpush。設定ファイル不要', icon: <><path d="M12 2a10 10 0 1 0 10 10H12V2z" /><path d="M21.18 8.02A10 10 0 0 0 12 2v10h10a10 10 0 0 0-0.82-3.98z" /></>, align: 'left' },
                { title: 'ツール単位のACL', desc: '誰がどのツールを呼べるか、メソッドレベルで制御', icon: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></>, align: 'right' },
                { title: 'シークレット管理', desc: '環境変数を暗号化保存。チームで安全に共有', icon: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>, align: 'left' },
                { title: 'プロトコル最適化', desc: 'MCP専用プロキシでレート制限・リトライ・ログを自動化', icon: <><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></>, align: 'right' },
                { title: '常時オンライン', desc: 'PCを閉じても24時間稼働。ngrok不要', icon: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></>, align: 'left' },
              ].map((item, idx) => (
                <div key={idx} className={`flex ${item.align === 'right' ? 'justify-end' : 'justify-start'}`}>
                  <div className="relative inline-block max-w-md">
                    {/* 紫の影（ずらした吹き出し） */}
                    <div className="absolute top-1 left-1 w-full">
                      <div className="px-6 py-5 rounded-lg bg-violet-500" style={{ visibility: 'hidden' }}>
                        <div className="flex items-center gap-3">
                          <span className="w-7 h-7" />
                          <p className="text-2xl font-bold">{item.title}</p>
                        </div>
                        <p className="mt-3 text-lg">{item.desc}</p>
                      </div>
                      <div className="absolute inset-0 rounded-lg bg-violet-500" />
                      <div className="absolute -bottom-[8px] left-8 w-4 h-4 rotate-45 bg-violet-500" />
                    </div>
                    {/* 吹き出し本体 */}
                    <div className="relative px-6 py-5 rounded-lg bg-gray-900">
                      {/* タイトル行（アイコン＋タイトル） */}
                      <div className="flex items-center gap-3">
                        <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          {item.icon}
                        </svg>
                        <p className="text-2xl font-bold text-white">{item.title}</p>
                      </div>
                      {/* 説明文 */}
                      <p className="mt-3 text-lg text-gray-300">{item.desc}</p>
                    </div>
                    {/* 吹き出しの矢印（下向き） */}
                    <div className="absolute -bottom-[8px] left-8 w-4 h-4 rotate-45 bg-gray-900" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Code Example - サイドバイサイド + シンタックスハイライト */}
        <section className="py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-emerald-700 text-sm font-medium mb-6">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Developer Experience
                </div>
                <h2 className="text-3xl font-bold text-gray-900 mb-5">
                  書き慣れたコードで<br />すぐにデプロイ
                </h2>
                <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                  MCP SDKで書いたサーバーをそのままpush。特別な設定ファイルは不要です。環境変数もダッシュボードから安全に管理。
                </p>

                <div className="space-y-4">
                  {[
                    { icon: '✓', text: 'TypeScript / JavaScript 対応', color: 'text-emerald-600' },
                    { icon: '✓', text: 'Python 対応', color: 'text-emerald-600' },
                    { icon: '✓', text: '環境変数の暗号化保存', color: 'text-emerald-600' },
                    { icon: '✓', text: 'カスタムドメイン対応', color: 'text-emerald-600' },
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <span className={`${item.color} font-bold`}>{item.icon}</span>
                      <span className="text-gray-700">{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative">
                <div className="absolute -inset-4 bg-violet-500/5 rounded-3xl blur-xl" />
                <div className="relative bg-[#0d1117] rounded-2xl overflow-hidden shadow-2xl border border-gray-800">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-500" />
                        <div className="w-3 h-3 rounded-full bg-yellow-500" />
                        <div className="w-3 h-3 rounded-full bg-green-500" />
                      </div>
                      <span className="text-gray-400 text-sm font-mono">server.ts</span>
                    </div>
                    <button className="text-gray-500 hover:text-gray-300 transition-colors">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </button>
                  </div>
                  <div className="p-6 overflow-x-auto">
                    <pre className="text-sm leading-relaxed">
                      <code>
                        <span className="text-purple-400">import</span>
                        <span className="text-gray-300">{" { "}</span>
                        <span className="text-cyan-400">Server</span>
                        <span className="text-gray-300">{" } "}</span>
                        <span className="text-purple-400">from</span>
                        <span className="text-emerald-400">{` "@mcp/sdk"`}</span>
                        <span className="text-gray-300">;</span>
                        {"\n\n"}
                        <span className="text-purple-400">const</span>
                        <span className="text-gray-300"> server = </span>
                        <span className="text-purple-400">new</span>
                        <span className="text-cyan-400"> Server</span>
                        <span className="text-gray-300">{"({"}</span>
                        {"\n"}
                        <span className="text-gray-300">{"  "}</span>
                        <span className="text-cyan-400">name</span>
                        <span className="text-gray-300">: </span>
                        <span className="text-emerald-400">{`"notion-sync"`}</span>
                        {"\n"}
                        <span className="text-gray-300">{"});"}</span>
                        {"\n\n"}
                        <span className="text-gray-300">server.</span>
                        <span className="text-yellow-400">tool</span>
                        <span className="text-gray-300">(</span>
                        <span className="text-emerald-400">{`"search"`}</span>
                        <span className="text-gray-300">, </span>
                        <span className="text-purple-400">async</span>
                        <span className="text-gray-300">{" (query) => {"}</span>
                        {"\n"}
                        <span className="text-gray-500">{"  // Notionのページを検索"}</span>
                        {"\n"}
                        <span className="text-gray-300">{"  "}</span>
                        <span className="text-purple-400">const</span>
                        <span className="text-gray-300"> results = </span>
                        <span className="text-purple-400">await</span>
                        <span className="text-gray-300"> notion.search(query);</span>
                        {"\n"}
                        <span className="text-gray-300">{"  "}</span>
                        <span className="text-purple-400">return</span>
                        <span className="text-gray-300">{" { results };"}</span>
                        {"\n"}
                        <span className="text-gray-300">{"});"}</span>
                        {"\n\n"}
                        <span className="text-gray-300">server.</span>
                        <span className="text-yellow-400">start</span>
                        <span className="text-gray-300">();</span>
                      </code>
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing - 非対称カード */}
        <section className="py-20 bg-gradient-to-b from-gray-50 to-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-10">
              <span className="inline-block text-violet-600 text-sm font-medium mb-4">
                Pricing
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">シンプルな料金</h2>
              <p className="text-lg text-gray-600">小規模なら無料。スケールに合わせてアップグレード。</p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Free */}
              <div className="relative group">
                <div className="relative bg-white rounded-2xl p-8 border border-gray-200 hover:border-gray-300 hover:shadow-lg transition-all h-full">
                  <div className="text-sm font-medium text-gray-500 mb-2">Free</div>
                  <div className="flex items-baseline gap-1 mb-6">
                    <span className="text-5xl font-bold text-gray-900">¥0</span>
                    <span className="text-gray-500">/月</span>
                  </div>
                  <p className="text-gray-600 mb-8">個人開発や検証に最適</p>
                  <ul className="space-y-4 mb-8">
                    {['サーバー3つまで', '月間10,000リクエスト', 'コミュニティサポート', '基本的なログ'].map((item) => (
                      <li key={item} className="flex items-center gap-3 text-gray-700">
                        <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {item}
                      </li>
                    ))}
                  </ul>
                  <a href="/api/v1/auth/github" className="block">
                    <Button variant="outline" className="w-full h-12 border-gray-300 hover:bg-gray-50">
                      無料で始める
                    </Button>
                  </a>
                </div>
              </div>

              {/* Pro */}
              <div className="relative group">
                <div className="absolute -inset-[1px] bg-violet-500 rounded-2xl" />
                <div className="relative bg-gray-900 rounded-2xl p-8 text-white h-full">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium text-violet-300">Pro</span>
                    <span className="px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 text-xs font-medium">おすすめ</span>
                  </div>
                  <div className="flex items-baseline gap-1 mb-6">
                    <span className="text-5xl font-bold">¥2,980</span>
                    <span className="text-gray-400">/月</span>
                  </div>
                  <p className="text-gray-400 mb-8">本番運用に必要な全機能</p>
                  <ul className="space-y-4 mb-8">
                    {['サーバー無制限', '月間100,000リクエスト', 'カスタムドメイン', '優先サポート', '高度な分析'].map((item) => (
                      <li key={item} className="flex items-center gap-3">
                        <svg className="w-5 h-5 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {item}
                      </li>
                    ))}
                  </ul>
                  <a href="/api/v1/auth/github" className="block">
                    <Button className="w-full h-12 bg-violet-500 hover:bg-violet-400 text-white">
                      Proを始める
                    </Button>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Blog - マガジンレイアウト */}
        <section className="py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <div className="flex items-end justify-between mb-8">
              <div>
                <span className="inline-block text-violet-600 text-sm font-medium mb-4">
                  Blog
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">ブログ</h2>
              </div>
              <Link href="/blog" className="hidden sm:flex items-center gap-2 text-violet-600 hover:text-violet-700 font-medium group">
                すべて見る
                <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                { title: 'MCPサーバーの始め方：5分でデプロイする方法', date: '2024年1月15日', thumbnail: '/blog/thumbnail1.png' },
                { title: 'MCPサーバーの活用事例', date: '2024年1月10日', thumbnail: '/blog/thumbnail2.png' },
                { title: 'セキュリティベストプラクティス', date: '2024年1月5日', thumbnail: '/blog/thumbnail3.png' },
              ].map((post, idx) => (
                <Link key={idx} href="/blog" className="group">
                  <div className="h-full rounded-lg border border-gray-200 hover:border-violet-200 hover:shadow-lg transition-all bg-white overflow-hidden">
                    <div className="aspect-[4/3] bg-gray-100 overflow-hidden">
                      <img src={post.thumbnail} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    </div>
                    <div className="p-6">
                      <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-violet-600 transition-colors">
                        {post.title}
                      </h3>
                      <p className="text-sm text-gray-500 mb-5">{post.date}</p>
                      <span className="inline-flex items-center text-sm text-violet-600 font-medium group-hover:gap-2 transition-all">
                        詳細を見る
                        <svg className="w-4 h-4 ml-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            <div className="mt-8 text-center sm:hidden">
              <Link href="/blog">
                <Button variant="outline" className="border-gray-300">すべての記事を見る</Button>
              </Link>
            </div>
          </div>
        </section>

        {/* FAQ - インタラクティブアコーディオン */}
        <section className="py-20 bg-gray-50">
          <div className="max-w-3xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-10">
              <span className="inline-block text-violet-600 text-sm font-medium mb-4">
                FAQ
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">よくある質問</h2>
              <p className="text-lg text-gray-600">はじめての方からよく寄せられる質問</p>
            </div>

            <div className="space-y-4">
              {[
                { q: 'Nodeflareとは何ですか？', a: 'MCP専用のホスティングサービスです。MCP SDKで書いたコードをpushするだけで即デプロイ。アクセス制御・ログ・シークレット管理など、本番運用に必要な機能をすべて備えています。' },
                { q: '無料プランでどこまで使えますか？', a: '無料プランでは、サーバー3つまで、月間10,000リクエストまでご利用いただけます。個人での利用や小規模なプロジェクトには十分な容量です。' },
                { q: 'どの言語に対応していますか？', a: 'TypeScript / JavaScript、Pythonに対応しています。Go、Rust、Dockerも利用可能です。' },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className={`bg-white rounded-2xl border transition-all duration-300 ${openFaq === idx ? 'border-violet-400 shadow-lg shadow-violet-500/5' : 'border-gray-300'}`}
                >
                  <button
                    onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                    className="w-full flex items-center justify-between p-6 text-left"
                  >
                    <span className="font-semibold text-gray-900 pr-8">{item.q}</span>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${openFaq === idx ? 'bg-violet-100 rotate-180' : 'bg-gray-100'}`}>
                      <svg className={`w-5 h-5 transition-colors ${openFaq === idx ? 'text-violet-600' : 'text-gray-400'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </div>
                  </button>
                  <div className={`overflow-hidden transition-all duration-300 ${openFaq === idx ? 'max-h-96' : 'max-h-0'}`}>
                    <div className="px-6 pb-6">
                      <p className="text-gray-600 leading-relaxed">{item.a}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 text-center">
              <Link href="/faq">
                <Button variant="ghost" className="hover:bg-gray-100 gap-2">
                  すべての質問を見る
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Contact - シンプルフォーム */}
        <section className="py-20">
          <div className="max-w-2xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-10">
              <span className="inline-block text-violet-600 text-sm font-medium mb-4">
                Contact
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">お問い合わせ</h2>
              <p className="text-gray-600">ご質問やご相談がありましたらお気軽にどうぞ</p>
            </div>

            <form className="space-y-6">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">お名前</label>
                <input
                  type="text"
                  id="name"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none transition-all"
                  placeholder="山田 太郎"
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">メールアドレス</label>
                <input
                  type="email"
                  id="email"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none transition-all"
                  placeholder="example@email.com"
                />
              </div>
              <div>
                <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">メッセージ</label>
                <textarea
                  id="message"
                  rows={5}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none transition-all resize-none"
                  placeholder="お問い合わせ内容をご記入ください"
                />
              </div>
              <div className="flex gap-4">
                <Button type="button" variant="outline" className="flex-1 h-12 border-gray-300 hover:bg-gray-50">
                  キャンセル
                </Button>
                <Button type="submit" className="flex-1 h-12 bg-violet-600 hover:bg-violet-700 text-white">
                  送信する
                </Button>
              </div>
            </form>
          </div>
        </section>

      </main>

      <Footer />

      <style jsx>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
        .animate-blink {
          animation: blink 1s step-end infinite;
        }
      `}</style>
    </div>
  );
}
