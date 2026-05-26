import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_BASE || '';

export default function Landing() {
  const [picks, setPicks] = useState<any[]>([]);

  useEffect(() => {
    fetch(`${API_BASE}/api/picks`)
      .then((r) => r.json())
      .then((data) => setPicks(data))
      .catch(() => {});
  }, []);

  const compliant = picks.filter((p) => p.kiyohara_compliant).length;
  const watch = picks.length - compliant;

  return (
    <div className="min-h-screen bg-[#080c14] text-white overflow-x-hidden">
      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center px-6 py-24">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-950/40 via-transparent to-[#080c14]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.08),transparent_60%),radial-gradient(ellipse_at_bottom_left,rgba(212,175,55,0.06),transparent_50%)]" />
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs text-gray-400 mb-8 animate-fadeInUp">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            現在 {picks.length} 銘柄をトラッキング中
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.05] mb-6 animate-fadeInUp delay-100">
            <span className="text-white">清原メソッド</span>
            <br />
            <span className="bg-gradient-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent">
              スクリーナー
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 animate-fadeInUp delay-200 leading-relaxed">
            割安小型成長株を<strong className="text-white font-semibold">AI</strong>が毎日自動で探し、
            <strong className="text-white font-semibold">オーナー企業</strong>を見極め、
            超過収益 Alpha をトラッキングします。
          </p>

          <div className="flex items-center justify-center gap-4 animate-fadeInUp delay-300">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-[#080c14] font-bold text-sm hover:from-amber-400 hover:to-amber-500 transition-all shadow-xl shadow-amber-500/20"
            >
              選定銘柄を見る
              <span className="text-lg">→</span>
            </Link>
            <a
              href="#method"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl border border-white/10 text-sm font-medium text-gray-300 hover:border-white/20 hover:text-white transition-all"
            >
              仕組みを知る
            </a>
          </div>

          {picks.length > 0 && (
            <div className="grid grid-cols-3 gap-6 max-w-md mx-auto mt-16 pt-12 border-t border-white/5 animate-fadeInUp delay-400">
              <div className="text-center">
                <div className="text-3xl font-bold text-white tabular-nums">{picks.length}</div>
                <div className="text-xs text-gray-500 mt-1">選定銘柄</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-emerald-400 tabular-nums">{compliant}</div>
                <div className="text-xs text-gray-500 mt-1">清原適合</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-amber-400 tabular-nums">{watch}</div>
                <div className="text-xs text-gray-500 mt-1">監視対象</div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Method Section */}
      <section id="method" className="relative px-6 py-32">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-20">
            <span className="text-xs tracking-[0.2em] uppercase text-amber-500 font-semibold mb-4 block">
              清原メソッドとは
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              3 つの基準で<span className="text-amber-400">割安小型成長株</span>を発掘
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: '定量フィルター',
                desc: '東証グロース全銘柄から時価総額・実質PER・成長率で絞り込み。J-Quants + Yahoo Finance で毎日最新データを自動取得。',
                color: 'from-blue-500 to-blue-600',
              },
              {
                step: '02',
                title: 'AI 定性評価',
                desc: 'EDINET 有価証券報告書を Gemini 2.5 Flash が全文解析。創業者経営・大株主持分からオーナー企業か判定し、経営品質を 1-100 でスコア化。',
                color: 'from-amber-500 to-amber-600',
              },
              {
                step: '03',
                title: 'Alpha トラッキング',
                desc: '選定後は毎日株価を取得し日経平均との超過収益率（Alpha）を追跡。清原メソッドの真価＝長期での市場平均アウトパフォームを可視化。',
                color: 'from-violet-500 to-violet-600',
              },
            ].map((item) => (
              <div key={item.step} className="group relative">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/5 p-8">
                  <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br ${item.color} text-white font-bold text-sm mb-6`}>
                    {item.step}
                  </div>
                  <h3 className="text-lg font-bold text-white mb-3">{item.title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pick Preview */}
      {picks.length > 0 && (
        <section className="relative px-6 py-32">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <span className="text-xs tracking-[0.2em] uppercase text-amber-500 font-semibold mb-4 block">
              現在の選定銘柄
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              清原適合 <span className="text-emerald-400">{compliant}</span> 銘柄を発見
            </h2>
            <p className="text-gray-400 text-sm">
              オーナー企業 &middot; 経営スコア &ge; 50 &middot; 実質 PER &lt; 10 倍
            </p>
          </div>

          <div className="max-w-4xl mx-auto overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left">
                  <th className="py-3 px-4 text-xs text-gray-500 font-medium uppercase tracking-wider">銘柄</th>
                  <th className="py-3 px-4 text-xs text-gray-500 font-medium uppercase tracking-wider text-right">時価総額</th>
                  <th className="py-3 px-4 text-xs text-gray-500 font-medium uppercase tracking-wider text-right">実質PER</th>
                  <th className="py-3 px-4 text-xs text-gray-500 font-medium uppercase tracking-wider text-right">スコア</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {picks.slice(0, 8).map((pick) => (
                  <tr key={pick.code} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-white text-xs">{pick.code}</span>
                        <span className="text-gray-400">{pick.name}</span>
                        {pick.kiyohara_compliant ? (
                          <span className="text-[10px] bg-emerald-500/10 text-emerald-400 font-semibold px-1.5 py-0.5 rounded">適合</span>
                        ) : (
                          <span className="text-[10px] bg-amber-500/10 text-amber-400 font-semibold px-1.5 py-0.5 rounded">監視</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-gray-300">
                      {(pick.market_cap || 0).toFixed(0)}
                      <span className="text-xs text-gray-600 ml-0.5">億</span>
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums">
                      <span className={pick.real_per <= 10 ? 'text-emerald-400 font-semibold' : 'text-gray-300'}>
                        {(pick.real_per || 0).toFixed(1)}
                      </span>
                      <span className="text-xs text-gray-600 ml-0.5">倍</span>
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-gray-300">
                      {pick.management_score}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-center mt-12">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-white/5 border border-white/10 text-sm font-medium text-gray-300 hover:bg-white/10 hover:text-white transition-all"
            >
              全 {picks.length} 銘柄の詳細を見る →
            </Link>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="relative px-6 py-32 text-center">
        <div className="absolute inset-0 bg-gradient-to-t from-blue-950/30 to-transparent" />
        <div className="relative z-10 max-w-2xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            清原メソッドを、<span className="text-amber-400">自動化</span>しよう
          </h2>
          <p className="text-gray-400 mb-10 text-sm leading-relaxed">
            毎日 250 銘柄をチェックする手間から解放されます。
            平日 15 時に自動スクリーニング、選定後は Alpha を毎日トラッキング。
            あなたは結果を見るだけ。
          </p>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 px-10 py-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-[#080c14] font-bold hover:from-amber-400 hover:to-amber-500 transition-all shadow-xl shadow-amber-500/20 text-base"
          >
            ダッシュボードを開く →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 px-6 py-8 text-center">
        <p className="text-xs text-gray-600">
          清原メソッド・スクリーナー &middot; Cloudflare Workers + D1 + GitHub Actions + OpenRouter
        </p>
      </footer>
    </div>
  );
}
