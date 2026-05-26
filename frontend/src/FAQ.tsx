import { Link } from 'react-router-dom';

const faqs = [
  { q: '清原メソッド・スクリーナーは無料ですか？', a: 'はい、完全無料です。Cloudflare Workers の無料枠と GitHub Actions の無料枠で運用しています。API キー（J-Quants・EDINET・OpenRouter）の取得もすべて無料で行えます。' },
  { q: 'なぜ東証グロース市場だけが対象ですか？', a: '清原メソッドが本来対象とする小型株は東証グロースに集中しています。プライム・スタンダード市場には大型株が多く、時価総額基準を満たしません。将来的に対象市場を拡大する可能性はあります。' },
  { q: 'AI のオーナー企業判定は正確ですか？', a: 'EDINET 有価証券報告書の大株主構成・役員経歴・沿革セクションに基づいて Gemini 2.5 Flash が判定しています。2025年5月の検証では、250銘柄中 7 銘柄をオーナー企業と判定し、いずれも実際に創業者経営が確認できました。ただし AI 判定には限界があり、最終的な投資判断はご自身で行ってください。' },
  { q: '選定銘柄は実際に購入すべきですか？', a: '本サービスは投資助言ではありません。スクリーニング結果はあくまで清原メソッドの基準に照らした参考情報です。実際の投資判断は、ご自身の責任で行ってください。' },
  { q: 'データの更新頻度は？', a: '平日 15:00（日本時間）に自動スクリーニングが実行され、選定銘柄が更新されます。株価トラッキングは毎日 15:00 に全アクティブ銘柄に対して実行されます。' },
  { q: 'API キーはどこで取得できますか？', a: 'J-Quants は j-quants.com、EDINET は disclosure.edinet-fsa.go.jp、OpenRouter は openrouter.ai でそれぞれ無料登録できます。本サービスを利用するだけであれば API キーは不要です（提供側で設定済みのため）。' },
  { q: 'ソースコードは公開されていますか？', a: 'はい、GitHub で公開しています。github.com/tachibanana0/kiyohara-method-screener' },
  { q: 'バグを見つけた場合や機能提案は？', a: 'GitHub の Issues でご報告いただくか、お問い合わせフォームからご連絡ください。' },
];

export default function FAQ() {
  return (
    <div className="min-h-screen bg-[#080c14] text-white">
      <header className="border-b border-white/5 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link to="/" className="text-sm text-gray-400 hover:text-white transition-colors">← トップ</Link>
          <span className="text-sm font-bold">清原メソッド・スクリーナー</span>
          <Link to="/dashboard" className="text-sm text-gray-400 hover:text-white transition-colors">ダッシュボード →</Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">よくある質問</h1>
        <p className="text-gray-500 text-sm mb-12">清原メソッド・スクリーナーに関するよくある質問と回答です。</p>
        <div className="space-y-8">
          {faqs.map((faq, i) => (
            <div key={i}>
              <h2 className="text-lg font-bold text-white mb-2">{faq.q}</h2>
              <p className="text-sm text-gray-400 leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </main>
      <footer className="border-t border-white/5 px-6 py-8 text-center">
        <p className="text-xs text-gray-600">清原メソッド・スクリーナー &middot; <Link to="/about" className="hover:text-gray-400 transition-colors">運営者情報</Link></p>
      </footer>
    </div>
  );
}
