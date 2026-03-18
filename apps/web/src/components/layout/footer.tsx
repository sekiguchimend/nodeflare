import Link from 'next/link';

export function Footer() {
  return (
    <footer className="bg-gray-950 border-t border-gray-800 py-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid md:grid-cols-4 gap-12 mb-12">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <img src="/logo.png" alt="Nodeflare" className="h-8 w-auto" />
              <span className="font-black text-white">NodeFlare</span>
            </div>
            <p className="text-gray-400 text-sm">
              MCP専用ホスティング
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-4">プロダクト</h4>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li><Link href="/docs" className="hover:text-white transition-colors">ドキュメント</Link></li>
              <li><Link href="/pricing" className="hover:text-white transition-colors">料金</Link></li>
              <li><Link href="/blog" className="hover:text-white transition-colors">ブログ</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-4">サポート</h4>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li><Link href="/faq" className="hover:text-white transition-colors">よくある質問</Link></li>
              <li><Link href="/contact" className="hover:text-white transition-colors">お問い合わせ</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-4">法務</h4>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li><Link href="/terms" className="hover:text-white transition-colors">利用規約</Link></li>
              <li><Link href="/privacy" className="hover:text-white transition-colors">プライバシー</Link></li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-gray-800 text-center text-gray-500 text-sm">
          © 2024 Nodeflare. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
