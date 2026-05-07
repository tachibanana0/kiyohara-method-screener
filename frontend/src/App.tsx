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
  status: string;
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

  return (
    <div className="min-h-screen">
      <header className="bg-primary text-white px-6 py-4 shadow">
        <h1 className="text-xl font-bold tracking-wide">
          清原メソッド・スクリーナー
        </h1>
        <p className="text-sm opacity-80 mt-1">
          割安小型成長株の自動選定 & Alphaトラッキング
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <span className="text-xs bg-white/20 px-2 py-1 rounded">
            対象市場: 東証グロース
          </span>
          <span className="text-xs bg-white/20 px-2 py-1 rounded">
            時価総額: 500億円以下
          </span>
          <span className="text-xs bg-white/20 px-2 py-1 rounded">
            実質PER: 10倍以下
          </span>
          <span className="text-xs bg-white/20 px-2 py-1 rounded">
            成長性: 売上・営利 3年連続成長
          </span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-8">
        {loading ? (
          <div className="text-center py-20 text-gray-500">読み込み中...</div>
        ) : (
          <>
            <section>
              <h2 className="text-lg font-semibold text-primary mb-4">
                推奨銘柄一覧
              </h2>
              <PickList picks={picks} onSelect={setSelectedCode} selected={selectedCode} />
            </section>

            {selectedCode && (
              <section>
                <h2 className="text-lg font-semibold text-primary mb-4">
                  パフォーマンス比較（{selectedCode} vs 日経平均）
                </h2>
                <PerformanceChart code={selectedCode} apiBase={API_BASE} />
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
