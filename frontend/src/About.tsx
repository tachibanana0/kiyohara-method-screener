import { Link } from 'react-router-dom';

export default function About() {
  return (
    <div className="min-h-screen bg-[#080c14] text-white">
      <header className="border-b border-white/5 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link to="/" className="text-sm text-gray-400 hover:text-white transition-colors">← トップ</Link>
          <span className="text-sm font-bold">清原メソッド・スクリーナー</span>
          <Link to="/dashboard" className="text-sm text-gray-400 hover:text-white transition-colors">ダッシュボード →</Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-16 space-y-12">
        <section>
          <h1 className="text-3xl font-bold mb-4">運営者情報</h1>
          <p className="text-gray-400 leading-relaxed">
            清原メソッド・スクリーナーは、清原達郎氏の投資手法「清原メソッド」に基づく自動スクリーニングツールです。
          </p>
        </section>
        <section>
          <h2 className="text-lg font-bold mb-3">技術スタック</h2>
          <ul className="space-y-2 text-sm text-gray-400">
            <li>Cloudflare Workers (Hono v4) — REST API</li>
            <li>Cloudflare D1 (SQLite) — データベース</li>
            <li>Cloudflare Pages — フロントエンドホスティング</li>
            <li>React 19 + Vite + Tailwind v4 + Recharts — UI</li>
            <li>GitHub Actions — 定期スクリーニング実行</li>
            <li>J-Quants API v2 — 財務データ取得</li>
            <li>EDINET API v2 — 有価証券報告書取得</li>
            <li>Yahoo Finance — 株価取得</li>
            <li>OpenRouter (Gemini 2.5 Flash) — LLM 定性評価</li>
          </ul>
        </section>
        <section>
          <h2 className="text-lg font-bold mb-3">ソースコード</h2>
          <p className="text-sm text-gray-400 leading-relaxed">
            GitHub で公開しています：
            <a href="https://github.com/tachibanana0/kiyohara-method-screener" target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:underline ml-1">
              github.com/tachibanana0/kiyohara-method-screener
            </a>
          </p>
        </section>
        <section>
          <h2 className="text-lg font-bold mb-3">免責事項</h2>
          <div className="text-sm text-gray-400 leading-relaxed space-y-3">
            <p>本サービスは投資助言を目的としたものではありません。スクリーニング結果はあくまで参考情報であり、特定の銘柄の売買を推奨するものではありません。</p>
            <p>掲載されているデータは正確性を保証するものではありません。実際の投資判断はご自身の責任において行ってください。</p>
            <p>本サービスは清原達郎氏および関係者とは一切関係がありません。</p>
          </div>
        </section>
      </main>
      <footer className="border-t border-white/5 px-6 py-8 text-center">
        <p className="text-xs text-gray-600">清原メソッド・スクリーナー</p>
      </footer>
    </div>
  );
}
