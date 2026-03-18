'use client';

import { useState, useEffect, useRef } from 'react';
import { Header, Footer } from '@/components/layout';
import Link from 'next/link';

const sections = [
  { id: 'introduction', title: 'はじめに' },
  { id: 'quickstart', title: 'クイックスタート' },
  { id: 'create-server', title: 'サーバーの作成' },
  { id: 'deploy', title: 'デプロイ' },
  { id: 'secrets', title: '環境変数・シークレット' },
  { id: 'access-control', title: 'アクセス制御' },
  { id: 'logs', title: 'ログ・監視' },
  { id: 'connect-ai', title: 'AIクライアントとの接続' },
  { id: 'api-reference', title: 'APIリファレンス' },
  { id: 'troubleshooting', title: 'トラブルシューティング' },
];

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('introduction');
  const isScrollingRef = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (isScrollingRef.current) return;

        const visibleSections = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => entry.target.id);

        if (visibleSections.length > 0) {
          const sectionOrder = sections.map((s) => s.id);
          const topSection = visibleSections.sort(
            (a, b) => sectionOrder.indexOf(a) - sectionOrder.indexOf(b)
          )[0];
          setActiveSection(topSection);
        }
      },
      {
        rootMargin: '-80px 0px -60% 0px',
        threshold: 0,
      }
    );

    sections.forEach((section) => {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    isScrollingRef.current = true;
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => {
        isScrollingRef.current = false;
      }, 1000);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex gap-12">
          {/* サイドバー */}
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <nav className="sticky top-24 space-y-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
                ドキュメント
              </p>
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={`block w-full text-left px-3 py-2 text-sm transition-colors ${
                    activeSection === section.id
                      ? 'text-gray-900 font-medium'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {section.title}
                </button>
              ))}
            </nav>
          </aside>

          {/* メインコンテンツ */}
          <main className="flex-1 min-w-0">
            <div className="prose prose-gray max-w-none">

              {/* はじめに */}
              <section id="introduction" className="scroll-mt-24 mb-16">
                <h1 className="text-4xl font-black text-gray-900 mb-4">NodeFlare ドキュメント</h1>
                <p className="text-xl text-gray-600 mb-8">
                  MCP専用ホスティングサービス「NodeFlare」の使い方を解説します。
                </p>

                <h3 className="text-xl font-bold text-gray-900 mt-8 mb-4">NodeFlareとは？</h3>
                <p className="text-gray-600 mb-6">
                  NodeFlareは、MCP（Model Context Protocol）サーバーを本番環境で運用するための専用ホスティングサービスです。
                  MCP SDKで書いたコードをpushするだけで即座にデプロイ。アクセス制御、ログ管理、シークレット管理など、
                  本番運用に必要な機能をすべて備えています。
                </p>

                <h3 className="text-xl font-bold text-gray-900 mt-8 mb-4">主な特徴</h3>
                <ul className="space-y-3 text-gray-600">
                  <li><strong>ゼロコンフィグ</strong> — MCP SDKのコードをそのままpush。設定ファイル不要</li>
                  <li><strong>ツール単位のACL</strong> — 誰がどのツールを呼べるか細かく制御</li>
                  <li><strong>シークレット管理</strong> — 環境変数を暗号化保存。チームで安全に共有</li>
                  <li><strong>常時オンライン</strong> — PCを閉じても24時間稼働。ngrok不要</li>
                </ul>
              </section>

              {/* クイックスタート */}
              <section id="quickstart" className="scroll-mt-24 mb-16 pt-8 border-t">
                <h2 className="text-3xl font-bold text-gray-900 mb-6">クイックスタート</h2>
                <p className="text-gray-600 mb-6">
                  5分でMCPサーバーをデプロイする手順を説明します。
                </p>

                <div className="space-y-8">
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">1. GitHubでサインアップ</h4>
                    <p className="text-gray-600 mb-3">
                      NodeFlareはGitHubアカウントでログインします。トップページの「GitHubで始める」をクリックしてください。
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">2. MCPサーバーのリポジトリを準備</h4>
                    <p className="text-gray-600 mb-3">
                      MCP SDKを使用したサーバーコードをGitHubリポジトリに用意します。TypeScriptまたはPythonで記述できます。
                    </p>

                    <p className="text-sm font-medium text-gray-700 mb-2">TypeScript</p>
                    <div className="bg-gray-900 rounded-xl overflow-hidden mb-4">
                      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
                        <span className="text-gray-400 text-sm font-mono">server.ts</span>
                      </div>
                      <pre className="p-4 overflow-x-auto text-sm">
                        <code className="text-gray-300">{`import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "my-server",
  version: "1.0.0",
});

// ツールを定義
server.tool("hello", "挨拶を返す", {
  name: { type: "string", description: "名前" }
}, async ({ name }) => {
  return {
    content: [{ type: "text", text: \`こんにちは、\${name}さん！\` }]
  };
});

// サーバー起動
const transport = new StdioServerTransport();
await server.connect(transport);`}</code>
                      </pre>
                    </div>

                    <p className="text-sm font-medium text-gray-700 mb-2">Python</p>
                    <div className="bg-gray-900 rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
                        <span className="text-gray-400 text-sm font-mono">main.py</span>
                      </div>
                      <pre className="p-4 overflow-x-auto text-sm">
                        <code className="text-gray-300">{`from mcp.server import Server
from mcp.types import TextContent

server = Server("my-server")

@server.tool("hello", description="挨拶を返す")
async def hello(name: str) -> list[TextContent]:
    return [TextContent(type="text", text=f"こんにちは、{name}さん！")]

if __name__ == "__main__":
    server.run()`}</code>
                      </pre>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">3. 依存関係の設定</h4>

                    <p className="text-sm font-medium text-gray-700 mb-2">TypeScript: package.json</p>
                    <div className="bg-gray-900 rounded-xl overflow-hidden mb-4">
                      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
                        <span className="text-gray-400 text-sm font-mono">package.json</span>
                      </div>
                      <pre className="p-4 overflow-x-auto text-sm">
                        <code className="text-gray-300">{`{
  "name": "my-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/server.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}`}</code>
                      </pre>
                    </div>

                    <p className="text-sm font-medium text-gray-700 mb-2">Python: requirements.txt</p>
                    <div className="bg-gray-900 rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
                        <span className="text-gray-400 text-sm font-mono">requirements.txt</span>
                      </div>
                      <pre className="p-4 overflow-x-auto text-sm">
                        <code className="text-gray-300">{`mcp>=1.0.0`}</code>
                      </pre>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">4. NodeFlareでデプロイ</h4>
                    <p className="text-gray-600 mb-3">
                      ダッシュボードで「新規サーバー」をクリックし、GitHubリポジトリを選択します。
                      リポジトリを選択すると、自動的にビルド・デプロイが開始されます。
                    </p>
                    <p className="text-gray-600">
                      デプロイが完了すると、MCPサーバーのエンドポイントURLが発行されます。
                    </p>
                  </div>
                </div>
              </section>

              {/* サーバーの作成 */}
              <section id="create-server" className="scroll-mt-24 mb-16 pt-8 border-t">
                <h2 className="text-3xl font-bold text-gray-900 mb-6">サーバーの作成</h2>

                <h3 className="text-xl font-bold text-gray-900 mt-8 mb-4">対応言語・ランタイム</h3>
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">言語</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">ステータス</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">SDK / 検出ファイル</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="py-3 px-4">TypeScript / JavaScript</td>
                      <td className="py-3 px-4">対応済み</td>
                      <td className="py-3 px-4 font-mono text-sm">@modelcontextprotocol/sdk</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-3 px-4">Python</td>
                      <td className="py-3 px-4">対応済み</td>
                      <td className="py-3 px-4 font-mono text-sm">mcp (requirements.txt / pyproject.toml)</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-3 px-4">Go</td>
                      <td className="py-3 px-4">対応済み</td>
                      <td className="py-3 px-4 font-mono text-sm">go.mod</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-3 px-4">Rust</td>
                      <td className="py-3 px-4">対応済み</td>
                      <td className="py-3 px-4 font-mono text-sm">Cargo.toml</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-3 px-4">Docker</td>
                      <td className="py-3 px-4">対応済み</td>
                      <td className="py-3 px-4 font-mono text-sm">Dockerfile</td>
                    </tr>
                  </tbody>
                </table>

                <h3 className="text-xl font-bold text-gray-900 mt-8 mb-4">リポジトリの要件</h3>
                <ul className="list-disc list-inside space-y-2 text-gray-600">
                  <li><code className="font-mono text-sm">package.json</code> にMCP SDKが依存関係として含まれていること</li>
                  <li><code className="font-mono text-sm">build</code> スクリプトと <code className="font-mono text-sm">start</code> スクリプトが定義されていること</li>
                  <li>エントリーポイントが <code className="font-mono text-sm">main</code> フィールドで指定されていること</li>
                </ul>

                <h3 className="text-xl font-bold text-gray-900 mt-8 mb-4">サーバー設定</h3>
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">項目</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">説明</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">必須</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="py-3 px-4 font-medium">サーバー名</td>
                      <td className="py-3 px-4 text-gray-600">識別用の名前（ダッシュボードに表示）</td>
                      <td className="py-3 px-4">必須</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-3 px-4 font-medium">スラッグ</td>
                      <td className="py-3 px-4 text-gray-600">URLに使用される識別子（英小文字・ハイフンのみ）</td>
                      <td className="py-3 px-4">必須</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-3 px-4 font-medium">GitHubリポジトリ</td>
                      <td className="py-3 px-4 text-gray-600">owner/repo 形式</td>
                      <td className="py-3 px-4">必須</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-3 px-4 font-medium">ブランチ</td>
                      <td className="py-3 px-4 text-gray-600">デプロイ対象のブランチ（デフォルト: main）</td>
                      <td className="py-3 px-4">任意</td>
                    </tr>
                  </tbody>
                </table>
              </section>

              {/* デプロイ */}
              <section id="deploy" className="scroll-mt-24 mb-16 pt-8 border-t">
                <h2 className="text-3xl font-bold text-gray-900 mb-6">デプロイ</h2>

                <h3 className="text-xl font-bold text-gray-900 mt-8 mb-4">自動デプロイ</h3>
                <p className="text-gray-600 mb-4">
                  指定したブランチにpushすると、自動的にビルド・デプロイが実行されます。
                  GitHub Webhookにより、コードの変更を検知して即座にデプロイを開始します。
                </p>

                <h3 className="text-xl font-bold text-gray-900 mt-8 mb-4">ビルドプロセス</h3>
                <ol className="list-decimal list-inside space-y-2 text-gray-600">
                  <li>リポジトリのクローン</li>
                  <li><code className="font-mono text-sm">npm install</code> で依存関係をインストール</li>
                  <li><code className="font-mono text-sm">npm run build</code> でビルド</li>
                  <li>コンテナイメージの作成</li>
                  <li>デプロイ・起動</li>
                </ol>

                <h3 className="text-xl font-bold text-gray-900 mt-8 mb-4">デプロイステータス</h3>
                <table className="w-full border-collapse">
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="py-2 px-4 font-medium">保留中</td>
                      <td className="py-2 px-4 text-gray-600">デプロイがキューに入っている状態</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-2 px-4 font-medium">ビルド中</td>
                      <td className="py-2 px-4 text-gray-600">npm install, npm run build を実行中</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-2 px-4 font-medium">デプロイ中</td>
                      <td className="py-2 px-4 text-gray-600">コンテナを起動中</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-2 px-4 font-medium">稼働中</td>
                      <td className="py-2 px-4 text-gray-600">サーバーが正常に動作している</td>
                    </tr>
                  </tbody>
                </table>

                <h3 className="text-xl font-bold text-gray-900 mt-8 mb-4">ビルドが失敗した場合</h3>
                <p className="text-gray-600 mb-2">
                  ダッシュボードのログタブでビルドログを確認できます。よくある原因：
                </p>
                <ul className="list-disc list-inside space-y-1 text-gray-600">
                  <li>依存関係のインストールエラー</li>
                  <li>TypeScriptの型エラー</li>
                  <li>エントリーポイントの指定ミス</li>
                </ul>
              </section>

              {/* 環境変数・シークレット */}
              <section id="secrets" className="scroll-mt-24 mb-16 pt-8 border-t">
                <h2 className="text-3xl font-bold text-gray-900 mb-6">環境変数・シークレット</h2>
                <p className="text-gray-600 mb-6">
                  APIキーやデータベース接続情報などの機密情報は、シークレットとして暗号化して保存できます。
                </p>

                <h3 className="text-xl font-bold text-gray-900 mt-8 mb-4">シークレットの追加</h3>
                <ol className="list-decimal list-inside space-y-2 text-gray-600 mb-6">
                  <li>ダッシュボードでサーバーを選択</li>
                  <li>「シークレット」タブを開く</li>
                  <li>「シークレットを追加」をクリック</li>
                  <li>キー名と値を入力して保存</li>
                </ol>

                <h3 className="text-xl font-bold text-gray-900 mt-8 mb-4">サーバーコードでの使用</h3>
                <div className="bg-gray-900 rounded-xl overflow-hidden mb-6">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
                    <span className="text-gray-400 text-sm font-mono">例</span>
                  </div>
                  <pre className="p-4 overflow-x-auto text-sm">
                    <code className="text-gray-300">{`// 環境変数として自動的に注入されます
const notionApiKey = process.env.NOTION_API_KEY;
const databaseUrl = process.env.DATABASE_URL;

// APIクライアントの初期化
const notion = new Client({ auth: notionApiKey });`}</code>
                  </pre>
                </div>

                <h3 className="text-xl font-bold text-gray-900 mt-8 mb-4">セキュリティに関する注意</h3>
                <ul className="list-disc list-inside space-y-1 text-gray-600">
                  <li>シークレットはAES-256で暗号化して保存されます</li>
                  <li>一度保存したシークレットの値は表示されません（上書きのみ可能）</li>
                  <li>コード内にAPIキーをハードコードしないでください</li>
                </ul>
              </section>

              {/* アクセス制御 */}
              <section id="access-control" className="scroll-mt-24 mb-16 pt-8 border-t">
                <h2 className="text-3xl font-bold text-gray-900 mb-6">アクセス制御</h2>
                <p className="text-gray-600 mb-6">
                  MCPサーバーへのアクセスをAPIキーで制御できます。ツール単位での権限設定も可能です。
                </p>

                <h3 className="text-xl font-bold text-gray-900 mt-8 mb-4">APIキーの発行</h3>
                <ol className="list-decimal list-inside space-y-2 text-gray-600 mb-6">
                  <li>ダッシュボードの「API Keys」を開く</li>
                  <li>「新規APIキー」をクリック</li>
                  <li>キー名を入力して作成</li>
                  <li>表示されたAPIキーを安全な場所に保存（一度しか表示されません）</li>
                </ol>

                <h3 className="text-xl font-bold text-gray-900 mt-8 mb-4">認証方法</h3>
                <p className="text-gray-600 mb-4">
                  MCPクライアントからの接続時に、APIキーをヘッダーに含めます。
                </p>
                <div className="bg-gray-900 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
                    <span className="text-gray-400 text-sm font-mono">HTTPヘッダー</span>
                  </div>
                  <pre className="p-4 overflow-x-auto text-sm">
                    <code className="text-gray-300">{`Authorization: Bearer your-api-key-here`}</code>
                  </pre>
                </div>
              </section>

              {/* ログ・監視 */}
              <section id="logs" className="scroll-mt-24 mb-16 pt-8 border-t">
                <h2 className="text-3xl font-bold text-gray-900 mb-6">ログ・監視</h2>

                <h3 className="text-xl font-bold text-gray-900 mt-8 mb-4">ログの種類</h3>
                <table className="w-full border-collapse mb-6">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">ログ種別</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">内容</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="py-3 px-4 font-medium">ビルドログ</td>
                      <td className="py-3 px-4 text-gray-600">npm install, npm run build の出力</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-3 px-4 font-medium">ランタイムログ</td>
                      <td className="py-3 px-4 text-gray-600">console.log, console.error の出力</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-3 px-4 font-medium">リクエストログ</td>
                      <td className="py-3 px-4 text-gray-600">MCPリクエストのメソッド、パラメータ、レスポンス時間</td>
                    </tr>
                  </tbody>
                </table>

                <h3 className="text-xl font-bold text-gray-900 mt-8 mb-4">メトリクス</h3>
                <ul className="list-disc list-inside space-y-2 text-gray-600">
                  <li>リクエスト数（時間別・日別）</li>
                  <li>平均レスポンス時間</li>
                  <li>エラー率</li>
                  <li>稼働率（Uptime）</li>
                </ul>
              </section>

              {/* AIクライアントとの接続 */}
              <section id="connect-ai" className="scroll-mt-24 mb-16 pt-8 border-t">
                <h2 className="text-3xl font-bold text-gray-900 mb-6">AIクライアントとの接続</h2>
                <p className="text-gray-600 mb-6">
                  デプロイしたMCPサーバーを各種AIクライアントから利用する方法を説明します。
                </p>

                <h3 className="text-xl font-bold text-gray-900 mt-8 mb-4">Claude Desktop</h3>
                <p className="text-gray-600 mb-4">
                  Claude Desktopの設定ファイルにMCPサーバーを追加します。
                </p>
                <div className="bg-gray-900 rounded-xl overflow-hidden mb-6">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
                    <span className="text-gray-400 text-sm font-mono">claude_desktop_config.json</span>
                  </div>
                  <pre className="p-4 overflow-x-auto text-sm">
                    <code className="text-gray-300">{`{
  "mcpServers": {
    "my-server": {
      "url": "https://your-server.nodeflare.dev/mcp",
      "headers": {
        "Authorization": "Bearer your-api-key"
      }
    }
  }
}`}</code>
                  </pre>
                </div>

                <h3 className="text-xl font-bold text-gray-900 mt-8 mb-4">Cursor</h3>
                <p className="text-gray-600 mb-4">
                  Cursorの設定でMCPサーバーのURLを追加します。
                </p>
                <div className="bg-gray-900 rounded-xl overflow-hidden mb-6">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
                    <span className="text-gray-400 text-sm font-mono">.cursor/mcp.json</span>
                  </div>
                  <pre className="p-4 overflow-x-auto text-sm">
                    <code className="text-gray-300">{`{
  "servers": {
    "my-server": {
      "url": "https://your-server.nodeflare.dev/mcp",
      "apiKey": "your-api-key"
    }
  }
}`}</code>
                  </pre>
                </div>

                <h3 className="text-xl font-bold text-gray-900 mt-8 mb-4">エンドポイントURL</h3>
                <p className="text-gray-600">
                  サーバーのエンドポイントURLは、ダッシュボードのサーバー詳細ページで確認できます。<br />
                  形式: <code className="font-mono text-sm">https://[slug].nodeflare.dev/mcp</code>
                </p>
              </section>

              {/* APIリファレンス */}
              <section id="api-reference" className="scroll-mt-24 mb-16 pt-8 border-t">
                <h2 className="text-3xl font-bold text-gray-900 mb-6">APIリファレンス</h2>
                <p className="text-gray-600 mb-6">
                  NodeFlareの管理APIを使用して、プログラムからサーバーを管理できます。
                </p>

                <h3 className="text-xl font-bold text-gray-900 mt-8 mb-4">ベースURL</h3>
                <p className="font-mono text-sm mb-6">
                  https://api.nodeflare.dev/v1
                </p>

                <h3 className="text-xl font-bold text-gray-900 mt-8 mb-4">エンドポイント一覧</h3>
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">メソッド</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">パス</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-900">説明</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="py-3 px-4 font-mono text-sm">GET</td>
                      <td className="py-3 px-4 font-mono text-sm">/servers</td>
                      <td className="py-3 px-4 text-gray-600">サーバー一覧を取得</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-3 px-4 font-mono text-sm">POST</td>
                      <td className="py-3 px-4 font-mono text-sm">/servers</td>
                      <td className="py-3 px-4 text-gray-600">新規サーバーを作成</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-3 px-4 font-mono text-sm">GET</td>
                      <td className="py-3 px-4 font-mono text-sm">/servers/:id</td>
                      <td className="py-3 px-4 text-gray-600">サーバー詳細を取得</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-3 px-4 font-mono text-sm">DELETE</td>
                      <td className="py-3 px-4 font-mono text-sm">/servers/:id</td>
                      <td className="py-3 px-4 text-gray-600">サーバーを削除</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-3 px-4 font-mono text-sm">POST</td>
                      <td className="py-3 px-4 font-mono text-sm">/servers/:id/deploy</td>
                      <td className="py-3 px-4 text-gray-600">手動デプロイを実行</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-3 px-4 font-mono text-sm">GET</td>
                      <td className="py-3 px-4 font-mono text-sm">/servers/:id/logs</td>
                      <td className="py-3 px-4 text-gray-600">ログを取得</td>
                    </tr>
                  </tbody>
                </table>
              </section>

              {/* トラブルシューティング */}
              <section id="troubleshooting" className="scroll-mt-24 mb-16 pt-8 border-t">
                <h2 className="text-3xl font-bold text-gray-900 mb-6">トラブルシューティング</h2>

                <div className="space-y-8">
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">ビルドが失敗する</h4>
                    <ul className="list-disc list-inside space-y-1 text-gray-600">
                      <li><code className="font-mono text-sm">package.json</code> に <code className="font-mono text-sm">build</code> スクリプトがあるか確認</li>
                      <li>TypeScriptの型エラーがないか確認（ローカルで <code className="font-mono text-sm">npm run build</code> を実行）</li>
                      <li>依存関係のバージョンが正しいか確認</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">デプロイ後にサーバーが起動しない</h4>
                    <ul className="list-disc list-inside space-y-1 text-gray-600">
                      <li><code className="font-mono text-sm">main</code> フィールドがビルド後のエントリーポイントを指しているか確認</li>
                      <li>ランタイムログでエラーを確認</li>
                      <li>必要な環境変数がシークレットに設定されているか確認</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">AIクライアントから接続できない</h4>
                    <ul className="list-disc list-inside space-y-1 text-gray-600">
                      <li>エンドポイントURLが正しいか確認</li>
                      <li>APIキーが正しく設定されているか確認</li>
                      <li>サーバーが「稼働中」ステータスか確認</li>
                    </ul>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t">
                  <p className="text-gray-600 mb-4">
                    上記で解決しない場合は、お気軽にお問い合わせください。
                  </p>
                  <Link href="/contact" className="text-gray-900 font-medium hover:underline">
                    お問い合わせ →
                  </Link>
                </div>
              </section>

            </div>
          </main>
        </div>
      </div>

      <Footer />
    </div>
  );
}
