/// <reference types="vite/client" />
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import PickList from './components/PickList';
import PerformanceChart from './components/PerformanceChart';

const API_BASE = import.meta.env.VITE_API_BASE || '';

interface Pick {
  code: string;
  name: string;
  market_cap: number;
  net_cash: number;
  net_cash_ratio: number;
  real_per: number;
  sales_growth: number | null;
  profit_growth: number | null;
  is_owner_company: number;
  management_score: number;
  picked_at: string;
  initial_price: number | null;
  kiyohara_compliant: number;
  reason: string;
  status: string;
}

function formatNum(n: number, decimals = 1): string {
  return n.toLocaleString('ja-JP', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[1, 2, 3, 4, 5].map((i) => (
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

export default function Dashboard() {
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

  const avgPER = picks.length
    ? picks.reduce((s, p) => s + p.real_per, 0) / picks.length
    : 0;
  const compliantCount = picks.filter((p) => p.kiyohara_compliant).length;
  const watchCount = picks.length - compliantCount;
  const ownerCount = picks.filter((p) => p.is_owner_company).length;
  const selectedPick = picks.find((p) => p.code === selectedCode);

  return (
    <div className="min-h-screen flex flex-col">
      <Helmet>
        <title>{picks.length > 0 ? `選定銘柄一覧（${picks.length}件）` : '選定銘柄一覧'} | 清原メソッド・スクリーナー</title>
        <meta name="description" content={`清原メソッドによるスクリーニング結果。${picks.length}件の選定銘柄（清原適合${compliantCount}件・監視対象${watchCount}件）の詳細データを閲覧できます。`} />
      </Helmet>
      <header className="bg-primary text-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Link to="/" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">← LP</Link>
              <h1 className="text-lg font-bold tracking-tight leading-tight">清原メソッド・スクリーナー</h1>
            </div>
            <p className="text-xs text-gray-400 mt-0.5 ml-11">東証グロース市場の割安小型成長株を自動選定 &amp; Alphaトラッキング</p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto px-6 py-8 w-full space-y-8">
        {loading ? (
          <Skeleton />
        ) : (
          <>
            <section>
              <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">スクリーニング基準</h2>
                </div>
                <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-y-4 gap-x-6 text-sm">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">対象市場</div>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">東証グロース (TSE Growth)</span>
                    <p className="text-xs text-muted/60 mt-1">J-Quants API より取得</p>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">定量フィルター</div>
                    <ul className="space-y-0.5">
                      <li className="text-xs text-gray-700">時価総額 <b>&lt; 270</b>億円</li>
                      <li className="text-xs text-gray-700">実質PER <b>&lt; 25</b>倍</li>
                      <li className="text-xs text-gray-700">PER <b>&lt; 時価総額/100</b></li>
                      <li className="text-xs text-gray-700">ネットキャッシュ比率 <b>&ge; 20%</b></li>
                      <li className="text-xs text-gray-700">当期純利益 <b>&gt; 0</b></li>
                      <li className="text-xs text-gray-700">3年売上・営利成長率 <b>&gt; 0%</b></li>
                    </ul>
                    <p className="text-xs text-muted/60 mt-1">J-Quants + Yahoo Finance</p>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">清原適合 (Tier 1)</div>
                    <ul className="space-y-0.5">
                      <li className="text-xs text-gray-700"><span className="text-success font-semibold">オーナー企業</span>判定</li>
                      <li className="text-xs text-gray-700">経営評価スコア <b>&ge; 50</b></li>
                    </ul>
                    <p className="text-xs text-muted/60 mt-1">EDINET → LLM評価</p>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">監視対象 (Tier 2)</div>
                    <ul className="space-y-0.5">
                      <li className="text-xs text-gray-700">経営評価スコア <b>&ge; 20</b></li>
                      <li className="text-xs text-gray-700">実質PER <b>&lt; 40</b>倍</li>
                      <li className="text-xs text-gray-700">オーナー企業不問</li>
                    </ul>
                    <p className="text-xs text-muted/60 mt-1">条件緩和枠</p>
                  </div>
                </div>
                <div className="px-5 py-2.5 bg-gray-50/60 border-t border-gray-100">
                  <p className="text-[11px] text-muted/70 leading-relaxed">
                    <b>LLM評価:</b> EDINET有価証券報告書全文を Gemini 2.5 Flash で分析。創業家・同族経営のオーナー企業かどうかを判定し、開示品質・戦略記述・ガバナンス記述から経営品質を 1-100 で採点。
                  </p>
                </div>
              </div>
            </section>

            {picks.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-white rounded-lg border border-gray-100 p-4">
                  <div className="text-xs text-muted mb-1">選定銘柄数</div>
                  <div className="text-2xl font-bold text-primary tabular-nums">{picks.length}</div>
                </div>
                <div className="bg-white rounded-lg border border-success/20 bg-green-50/50 p-4">
                  <div className="text-xs text-muted mb-1">清原適合</div>
                  <div className="text-2xl font-bold text-success tabular-nums">{compliantCount}</div>
                </div>
                <div className="bg-white rounded-lg border border-amber-100 bg-amber-50/50 p-4">
                  <div className="text-xs text-muted mb-1">監視対象</div>
                  <div className="text-2xl font-bold text-accent tabular-nums">{watchCount}</div>
                </div>
                <div className="bg-white rounded-lg border border-gray-100 p-4">
                  <div className="text-xs text-muted mb-1">オーナー企業</div>
                  <div className="text-2xl font-bold text-primary tabular-nums">{ownerCount}/{picks.length}</div>
                </div>
                <div className="bg-white rounded-lg border border-gray-100 p-4">
                  <div className="text-xs text-muted mb-1">平均 PER</div>
                  <div className="text-2xl font-bold text-primary tabular-nums">{formatNum(avgPER)}x</div>
                </div>
              </div>
            )}

            <section>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">選定銘柄一覧</h2>
                <span className="flex items-center gap-1.5 text-[10px]">
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-success" /><span className="text-muted/60">清原適合</span></span>
                  <span className="flex items-center gap-1 ml-2"><span className="w-1.5 h-1.5 rounded-full bg-accent/60" /><span className="text-muted/60">監視対象</span></span>
                </span>
              </div>
              <PickList picks={picks} selected={selectedCode} onSelect={setSelectedCode} />
            </section>

            {selectedPick && (
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">パフォーマンス</h2>
                  <span className="text-xs text-muted/60">{selectedPick.code} {selectedPick.name} vs 日経平均</span>
                </div>
                <PerformanceChart code={selectedCode!} apiBase={API_BASE} />
              </section>
            )}
          </>
        )}
      </main>

      <footer className="border-t border-gray-100 py-4 text-center text-xs text-muted">
        {picks.length > 0 && (
          <span>最終更新: {new Date(Math.max(...picks.map((p) => new Date(p.picked_at).getTime()))).toLocaleString('ja-JP')}</span>
        )}
      </footer>
    </div>
  );
}
