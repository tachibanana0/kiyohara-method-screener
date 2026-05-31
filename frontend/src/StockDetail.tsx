import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import PerformanceChart from './components/PerformanceChart';

const API_BASE = import.meta.env.VITE_API_BASE || '';

interface Pick {
  code: string; name: string; market_cap: number; net_cash: number; real_per: number;
  sales_growth: number | null; profit_growth: number | null;
  is_owner_company: number; management_score: number; picked_at: string;
  initial_price: number | null; kiyohara_compliant: number; reason: string; status: string;
}

export default function StockDetail() {
  const { code } = useParams<{ code: string }>();
  const [pick, setPick] = useState<Pick | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/picks`)
      .then((r) => r.json())
      .then((data: Pick[]) => {
        const found = data.find((p) => p.code === code);
        setPick(found || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [code]);

  if (loading) return <div className="min-h-screen bg-surface flex items-center justify-center"><div className="animate-spin w-6 h-6 border-2 border-amber-500/30 border-t-amber-500 rounded-full" /></div>;
  if (!pick) return <div className="min-h-screen bg-surface flex items-center justify-center text-muted">銘柄が見つかりません</div>;

  const fmt = (n: number, d = 1) => n.toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d });

  return (
    <div className="min-h-screen flex flex-col">
      <Helmet>
        <title>{pick.code} {pick.name}（{pick.kiyohara_compliant ? '清原適合' : '監視対象'}）PER{pick.real_per.toFixed(1)}倍 スコア{pick.management_score} | 清原メソッド</title>
        <meta name="description" content={`${pick.name}(${pick.code}) — 実質PER ${pick.real_per.toFixed(1)}倍、時価総額 ${pick.market_cap.toFixed(0)}億円、経営スコア ${pick.management_score}/100。${pick.kiyohara_compliant ? '清原メソッドの全基準を満たす適合銘柄。' : '監視対象銘柄。'}${pick.reason ? ' AI評価: ' + pick.reason.slice(0, 100) : ''}`} />
      </Helmet>
      <header className="bg-primary text-white">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link to="/dashboard" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">← 一覧</Link>
          <h1 className="text-lg font-bold">{pick.code} {pick.name}</h1>
          <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${pick.kiyohara_compliant ? 'bg-green-50 text-success' : 'bg-amber-50 text-accent'}`}>
            {pick.kiyohara_compliant ? '清原適合' : '監視対象'}
          </span>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto px-6 py-8 w-full space-y-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['時価総額', `${fmt(pick.market_cap)} 億円`],
            ['ネットキャッシュ', `${fmt(pick.net_cash)} 億円`],
            ['実質PER', `${fmt(pick.real_per, 1)} 倍`],
            ['売上成長 3Y', pick.sales_growth != null ? `${(pick.sales_growth * 100).toFixed(1)}%` : 'N/A'],
            ['営利成長 3Y', pick.profit_growth != null ? `${(pick.profit_growth * 100).toFixed(1)}%` : 'N/A'],
            ['オーナー企業', pick.is_owner_company ? 'はい' : 'いいえ'],
            ['経営スコア', `${pick.management_score} / 100`],
            ['選定日', pick.picked_at?.slice(0, 10) || 'N/A'],
          ].map(([label, val]) => (
            <div key={label} className="bg-white rounded-lg border border-gray-100 p-4">
              <div className="text-xs text-muted mb-1">{label}</div>
              <div className="text-lg font-bold text-primary tabular-nums">{val}</div>
            </div>
          ))}
        </div>

        {pick.reason && (
          <div className="bg-white rounded-lg border border-gray-100 p-5">
            <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">AI 評価理由</h2>
            <p className="text-sm text-gray-700 leading-relaxed">{pick.reason}</p>
          </div>
        )}

        <section>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">パフォーマンス</h2>
          <PerformanceChart code={pick.code} apiBase={API_BASE} />
        </section>

        <p className="text-xs text-muted/60">
          <a href={`https://disclosure.edinet-fsa.go.jp/`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
            EDINET で有価証券報告書を確認する →
          </a>
        </p>
      </main>
    </div>
  );
}
