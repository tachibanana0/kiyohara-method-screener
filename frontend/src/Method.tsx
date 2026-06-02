import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

export default function Method() {
  return (
    <div className="min-h-screen bg-[#080c14] text-white">
      <Helmet>
        <title>清原メソッドの全7基準を徹底解説 | 清原メソッド・スクリーナー</title>
        <meta name="description" content="清原メソッドの全7基準（時価総額・実質PER・ネットキャッシュ・成長率・オーナー企業・経営スコア）と、AIによる自動スクリーニングの仕組みを詳しく解説します。" />
      </Helmet>
      <header className="border-b border-white/5 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link to="/" className="text-sm text-gray-400 hover:text-white transition-colors">← トップ</Link>
          <span className="text-sm font-bold">清原メソッド・スクリーナー</span>
          <Link to="/dashboard" className="text-sm text-gray-400 hover:text-white transition-colors">ダッシュボード →</Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-16 space-y-16">
        <section>
          <h1 className="text-3xl font-bold mb-4">清原メソッドとは</h1>
          <p className="text-gray-400 leading-relaxed">
            清原メソッドは、伝説の投資家・清原達郎氏が著書『わが投資術 市場は誰に微笑むか』で体系化した日本株投資手法です。割安で成長性のある小型株のうち、創業家が経営に関与する「オーナー企業」に着目し、長期的な超過収益を狙います。
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-6">スクリーニング基準（スコア制）</h2>
          <div className="space-y-6">
            {[
              { n: '1', title: '定量スコアリング', desc: 'PER（低いほど高得点・最大35pt）・PBR（0.5倍以下で25pt）・ネットキャッシュ比率（100%以上で25pt）・小型株ボーナス（cap 100億以下で15pt）の4指標を統合し0-100で評価。本に一律閾値が明記されていないため、総合スコア制を採用。' },
              { n: '2', title: 'ネットキャッシュ比率', desc: '流動資産 + 投資有価証券×70% − 負債 ÷ 時価総額。清原達郎氏が独自に考案した指標。時価総額を超える現金性資産を持つ企業を「実質無借金の割安株」として評価。yfinance で貸借対照表データを取得し正確に計算。' },
              { n: '3', title: 'LLM 定性評価（上位15銘柄のみ）', desc: '定量スコア上位の銘柄だけ EDINET 有価証券報告書を Gemini 2.5 Flash が分析。大株主構成・役員経歴・沿革・ガバナンスからオーナー企業判定と経営スコアを算出。時間短縮のため全件は評価しない。' },
              { n: '4', title: '2-Tier 選定', desc: 'Tier 1: LLMスコア40以上＋オーナー企業＝清原適合。Tier 2: LLMスコア10以上＝監視対象。' },
               { n: '5', title: 'Alpha トラッキング', desc: '選定後は毎日株価を取得し、日経平均に対する超過収益率（Alpha）を計算・蓄積。' },
            ].map((item) => (
              <div key={item.n} className="flex gap-4">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-sm shrink-0">{item.n}</div>
                <div>
                  <h3 className="font-bold text-white mb-1">{item.title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-6">自動化の仕組み</h2>
          <div className="space-y-4">
            {[
              { step: '1', title: 'データ収集', desc: 'J-Quants API から全銘柄の財務データを、Yahoo Finance から株価を、EDINET API から有価証券報告書を自動取得。毎日 15:00 に実行。' },
              { step: '2', title: '定量スクリーニング', desc: '上記 7 基準のうち、時価総額・実質PER・ネットキャッシュ・成長率の 5 項目を機械的に判定。通過銘柄のみ定性評価へ。' },
              { step: '3', title: 'AI 定性評価', desc: 'EDINET 有価証券報告書の「大株主の状況」「役員の状況」「沿革」「ガバナンス」セクションを Gemini 2.5 Flash が読解。オーナー企業判定と経営スコアを算出。' },
              { step: '4', title: '2-Tier 選定', desc: 'Tier 1: 全基準を満たす「清原適合」銘柄。Tier 2: 一部基準を満たさないが近い「監視対象」銘柄。両方をトラッキング。' },
              { step: '5', title: 'Alpha トラッキング', desc: '選定後は毎日株価を取得し、日経平均に対する超過収益率（Alpha）を計算・蓄積。清原メソッドの真価である長期アウトパフォームを可視化する。' },
            ].map((item) => (
              <div key={item.step} className="flex gap-4 items-start">
                <div className="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs text-gray-400 shrink-0 mt-0.5">{item.step}</div>
                <div>
                  <h3 className="font-bold text-sm text-white mb-0.5">{item.title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
      <footer className="border-t border-white/5 px-6 py-8 text-center">
        <p className="text-xs text-gray-600">清原メソッド・スクリーナー &middot; <Link to="/about" className="hover:text-gray-400 transition-colors">運営者情報</Link></p>
      </footer>
    </div>
  );
}
