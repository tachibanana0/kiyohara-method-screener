/// <reference types="vite/client" />
import { useEffect, useState } from 'react';
import PickList from './components/PickList';
import PerformanceChart from './components/PerformanceChart';

const API_BASE = import.meta.env.VITE_API_BASE || '';

interface Pick {
  code: string;
  name: string;
  market_cap: number;
  net_cash: number;
  real_per: number;
  sales_growth: number | null;
  profit_growth: number | null;
  is_owner_company: number;
  management_score: number;
  picked_at: string;
  initial_price: number | null;
  kiyohara_compliant: number;
  status: string;
}

function formatNum(n: number, decimals = 1): string {
  return n.toLocaleString('ja-JP', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-100 p-4">
            <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
            <div className="h-6 bg-gray-200 rounded w-2/3" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
        <div className="h-10 bg-gray-100" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 border-t border-gray-50 flex items-center px-6">
            <div className="h-3 bg-gray-200 rounded w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [picks, setPicks] = useState<Pick[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/picks`)
      .then((r) => r.json())
      .then((data: Pick[]) => {
        setPicks(data);
        if (data.length > 0) setSelectedCode(data[0].code);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const avgScore = picks.length
    ? picks.reduce((s, p) => s + p.management_score, 0) / picks.length
    : 0;
  const avgPER = picks.length
    ? picks.reduce((s, p) => s + p.real_per, 0) / picks.length
    : 0;
  const selectedPick = picks.find((p) => p.code === selectedCode);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-primary text-white">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight leading-tight">
              清原メソッド・スクリーナー
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              割安小型成長株の自動選定 &amp; Alphaトラッキング
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-gray-500 mr-1.5">基準</span>
            <span className="text-[11px] bg-white/10 border border-white/15 px-2.5 py-1 rounded-full">
              東証グロース
            </span>
            <span className="text-[11px] bg-white/10 border border-white/15 px-2.5 py-1 rounded-full">
              時価総額 &lt;500億
            </span>
            <span className="text-[11px] bg-white/10 border border-white/15 px-2.5 py-1 rounded-full">
              PER &lt;10倍
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto px-6 py-8 w-full space-y-8">
        {loading ? (
          <Skeleton />
        ) : (
          <>
            {picks.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-white rounded-lg border border-gray-100 p-4">
                  <div className="text-xs text-muted mb-1">選定銘柄数</div>
                  <div className="text-2xl font-bold text-primary tabular-nums">{picks.length}</div>
                </div>
                <div className="bg-white rounded-lg border border-success/20 bg-green-50/50 p-4">
                  <div className="text-xs text-muted mb-1">清原適合</div>
                  <div className="text-2xl font-bold text-success tabular-nums">
                    {picks.filter((p) => p.kiyohara_compliant).length}
                  </div>
                </div>
                <div className="bg-white rounded-lg border border-amber-100 bg-amber-50/50 p-4">
                  <div className="text-xs text-muted mb-1">監視対象</div>
                  <div className="text-2xl font-bold text-accent tabular-nums">
                    {picks.filter((p) => !p.kiyohara_compliant).length}
                  </div>
                </div>
                <div className="bg-white rounded-lg border border-gray-100 p-4">
                  <div className="text-xs text-muted mb-1">平均スコア</div>
                  <div className="text-2xl font-bold text-primary tabular-nums">{avgScore.toFixed(0)}</div>
                </div>
                <div className="bg-white rounded-lg border border-gray-100 p-4">
                  <div className="text-xs text-muted mb-1">平均 PER</div>
                  <div className="text-2xl font-bold text-primary tabular-nums">{formatNum(avgPER)}x</div>
                </div>
              </div>
            )}

            <section>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
                  選定銘柄一覧
                </h2>
                <span className="flex items-center gap-1.5 text-[10px]">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-success" />
                    <span className="text-muted/60">清原適合</span>
                  </span>
                  <span className="flex items-center gap-1 ml-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                    <span className="text-muted/60">監視対象</span>
                  </span>
                </span>
              </div>
              <PickList picks={picks} selected={selectedCode} onSelect={setSelectedCode} />
            </section>

            {selectedPick && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
                    パフォーマンス
                  </h2>
                  <span className="text-xs text-muted/60">
                    {selectedPick.code} {selectedPick.name} vs 日経平均
                  </span>
                </div>
                <PerformanceChart code={selectedCode!} apiBase={API_BASE} />
              </section>
            )}
          </>
        )}
      </main>

      <footer className="border-t border-gray-100 py-4 text-center text-xs text-muted">
        {picks.length > 0 && (
          <span>最終更新: {new Date(picks[0].picked_at).toLocaleString('ja-JP')}</span>
        )}
      </footer>
    </div>
  );
}
