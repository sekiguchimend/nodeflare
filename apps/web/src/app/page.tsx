'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Header, Footer } from '@/components/layout';
import Link from 'next/link';

export default function HomePage() {
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
          <div className="relative max-w-5xl mx-auto px-6 sm:px-10 lg:px-16">
            <div>
              <div className="relative inline-block mb-6 ml-1">
                <div className="relative px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg">
                  MCPサーバーのホスティングプラットフォーム
                  <div className="absolute -bottom-1.5 left-6 w-2.5 h-2.5 bg-gray-900 rotate-45" />
                </div>
              </div>

              <h1 className="text-6xl sm:text-7xl lg:text-8xl font-black text-gray-900 tracking-tight leading-[1.05] text-left">
                AIツールを、<br />
                <span className="text-violet-600">クラウドで実行</span>
              </h1>

              <div className="text-center">
                <p className="mt-6 text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto">
                  GitHubからワンクリックでデプロイ。<br className="hidden sm:block" />
                  インフラ管理なしで、すぐに本番稼働。
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
                    GitHubで始める
                  </Button>
                </a>
                <Link href="/docs">
                  <Button size="lg" variant="outline" className="h-14 px-8 text-base border-gray-200 hover:bg-gray-50">
                    ドキュメント
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

        {/* Features - ベントグリッド */}
        <section className="py-20 bg-gray-950 text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-10">
              <h2 className="text-2xl sm:text-3xl font-bold">なぜMCP Cloudなのか</h2>
              <p className="mt-4 text-gray-400 text-lg">開発者のための、開発者によるプラットフォーム</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              {/* 大きいカード */}
              <div className="md:col-span-4 bg-violet-600 rounded-3xl p-8 relative overflow-hidden group">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxjaXJjbGUgY3g9IjIwIiBjeT0iMjAiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4xKSIvPjwvZz48L3N2Zz4=')] opacity-30" />
                <div className="relative">
                  <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center mb-6">
                    <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold mb-3">GitHubとシームレス連携</h3>
                  <p className="text-white/80 text-lg leading-relaxed max-w-md">
                    リポジトリを選ぶだけ。pushするたびに自動でビルド・デプロイ。CI/CDの設定は不要です。
                  </p>
                </div>
              </div>

              {/* 小さいカード */}
              <div className="md:col-span-2 bg-gray-900 rounded-3xl p-6 border border-gray-800 hover:border-violet-500/50 transition-colors group">
                <div className="w-12 h-12 rounded-xl bg-violet-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <svg className="w-6 h-6 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold mb-2">高速デプロイ</h3>
                <p className="text-gray-400 text-sm">pushから1〜2分で本番反映</p>
              </div>

              <div className="md:col-span-2 bg-gray-900 rounded-3xl p-6 border border-gray-800 hover:border-emerald-500/50 transition-colors group">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <svg className="w-6 h-6 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold mb-2">セキュリティ</h3>
                <p className="text-gray-400 text-sm">APIキー・アクセス制御標準装備</p>
              </div>

              <div className="md:col-span-2 bg-gray-900 rounded-3xl p-6 border border-gray-800 hover:border-amber-500/50 transition-colors group">
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <svg className="w-6 h-6 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold mb-2">モニタリング</h3>
                <p className="text-gray-400 text-sm">リアルタイムログとメトリクス</p>
              </div>

              <div className="md:col-span-2 bg-gray-900 rounded-3xl p-6 border border-gray-800 hover:border-cyan-500/50 transition-colors group">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <svg className="w-6 h-6 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold mb-2">グローバルCDN</h3>
                <p className="text-gray-400 text-sm">世界中から低レイテンシー</p>
              </div>
            </div>
          </div>
        </section>

        {/* Code Example - サイドバイサイド + シンタックスハイライト */}
        <section className="py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-sm font-medium mb-6">
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
                    { icon: '◎', text: 'Python（近日公開）', color: 'text-gray-400' },
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
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">ブログ</h2>
                <p className="mt-2 text-gray-600">最新の活用方法やアップデート情報</p>
              </div>
              <Link href="/blog" className="hidden sm:flex items-center gap-2 text-violet-600 hover:text-violet-700 font-medium group">
                すべて見る
                <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </div>

            <div className="grid md:grid-cols-12 gap-6">
              {/* メイン記事 */}
              <Link href="/blog" className="md:col-span-7 group">
                <div className="relative h-56 rounded-2xl overflow-hidden border border-gray-200 hover:border-violet-200 hover:shadow-lg transition-all bg-white">
                  <div className="absolute inset-0 bg-violet-50" />
                  <div className="absolute bottom-0 left-0 right-0 p-8">
                    <span className="inline-block px-3 py-1 rounded-full bg-violet-100 text-violet-700 text-sm font-medium mb-4">
                      チュートリアル
                    </span>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2 group-hover:text-violet-600 transition-colors">
                      MCPサーバーの始め方：5分でデプロイする方法
                    </h3>
                    <p className="text-gray-500">2024年1月15日</p>
                  </div>
                </div>
              </Link>

              {/* サブ記事 */}
              <div className="md:col-span-5 grid gap-6">
                {[
                  { title: 'MCPサーバーの活用事例', category: '事例紹介', bgColor: 'bg-emerald-50', color: 'bg-emerald-100', textColor: 'text-emerald-700' },
                  { title: 'セキュリティベストプラクティス', category: 'セキュリティ', bgColor: 'bg-amber-50', color: 'bg-amber-100', textColor: 'text-amber-700' },
                ].map((post, idx) => (
                  <Link key={idx} href="/blog" className="group">
                    <div className={`relative h-[104px] rounded-xl overflow-hidden border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all ${post.bgColor}`}>
                      <div className="absolute bottom-0 left-0 right-0 p-5">
                        <span className={`inline-block px-2 py-0.5 rounded-full ${post.color} ${post.textColor} text-xs font-medium mb-2`}>
                          {post.category}
                        </span>
                        <h3 className="text-lg font-semibold text-gray-900 group-hover:text-gray-700 transition-colors">
                          {post.title}
                        </h3>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
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
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">よくある質問</h2>
              <p className="text-lg text-gray-600">はじめての方からよく寄せられる質問</p>
            </div>

            <div className="space-y-4">
              {[
                { q: 'MCP Cloudとは何ですか？', a: 'MCP CloudはMCPサーバーをクラウド上でホスティングするサービスです。MCPサーバーとは、Claude等のAIアシスタントが外部のツールやデータにアクセスするためのサーバーです。GitHubリポジトリを接続するだけで、自動でビルド・デプロイが行われます。' },
                { q: '無料プランでどこまで使えますか？', a: '無料プランでは、サーバー3つまで、月間10,000リクエストまでご利用いただけます。個人での利用や小規模なプロジェクトには十分な容量です。' },
                { q: 'どの言語に対応していますか？', a: '現在、TypeScript / JavaScriptに対応しています。Python対応は近日公開予定です。' },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className={`bg-white rounded-2xl border transition-all duration-300 ${openFaq === idx ? 'border-violet-200 shadow-lg shadow-violet-500/5' : 'border-gray-200'}`}
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
                <Button variant="outline" className="border-gray-300 hover:bg-white gap-2">
                  すべての質問を見る
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Contact - スプリットデザイン */}
        <section className="py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6">
            <div className="grid lg:grid-cols-2 gap-10 items-center">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
                  ご質問は<br />お気軽に
                </h2>
                <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                  導入のご相談、技術的なご質問、お見積りなど、どんなことでもお問い合わせください。
                </p>
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center">
                      <svg className="w-6 h-6 text-violet-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                        <path d="M22 6l-10 7L2 6" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">メール</p>
                      <p className="font-medium text-gray-900">support@mcpcloud.dev</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center">
                      <svg className="w-6 h-6 text-violet-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 6v6l4 2" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">対応時間</p>
                      <p className="font-medium text-gray-900">平日 10:00 - 18:00（日本時間）</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative">
                <div className="relative bg-violet-600 rounded-2xl p-8 text-white text-center">
                  <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center mx-auto mb-6">
                    <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold mb-4">お問い合わせフォーム</h3>
                  <p className="text-white/80 mb-6">1〜2営業日以内にご返信いたします</p>
                  <Link href="/contact">
                    <Button size="lg" className="bg-white text-violet-600 hover:bg-violet-50 h-12 px-8">
                      フォームを開く
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-20 bg-gray-950 relative overflow-hidden">
          {/* 控えめな背景 */}
          <div className="absolute inset-0">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px]">
              <div className="absolute inset-0 bg-violet-500/10 rounded-full blur-[100px]" />
            </div>
          </div>

          <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              今すぐ始めましょう
            </h2>
            <p className="text-lg text-gray-400 mb-8 max-w-2xl mx-auto">
              GitHubアカウントがあれば、数分でMCPサーバーを公開できます。
            </p>
            <a href="/api/v1/auth/github">
              <Button size="lg" className="h-14 px-10 bg-white text-gray-900 hover:bg-gray-100 text-lg font-semibold shadow-xl gap-2">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                GitHubで始める
              </Button>
            </a>
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
