import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface TrackingPoint {
  date: string;
  price: number;
  topix: number;
  alpha: number;
  cumulative_alpha: number;
}

interface Props {
  code: string;
  apiBase: string;
}

function ChartSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-gray-100 p-6">
      <div className="animate-pulse space-y-4">
        <div className="grid grid-cols-3 gap-4 mb-4">
          {[1, 2, 3].map((i) => (
            <div key={i}>
              <div className="h-2 bg-gray-200 rounded w-16 mb-2" />
              <div className="h-5 bg-gray-200 rounded w-20" />
            </div>
          ))}
        </div>
        <div className="h-64 bg-gray-100 rounded" />
      </div>
    </div>
  );
}

export default function PerformanceChart({ code, apiBase }: Props) {
  const [data, setData] = useState<TrackingPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${apiBase}/api/tracking/${code}`)
      .then((r) => r.json())
      .then((rows: TrackingPoint[]) => {
        setData(rows);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [code, apiBase]);

  if (loading) return <ChartSkeleton />;

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-100 p-10 text-center">
        <div className="text-muted text-sm">トラッキングデータがまだありません。</div>
        <div className="text-muted/60 text-xs mt-1">毎日 15:00 に自動取得されます。</div>
      </div>
    );
  }

  const basePrice = data[0].price;
  const baseTopix = data[0].topix;

  const chartData = data.map((d) => ({
    date: d.date.slice(5),
    stock: ((d.price / basePrice) * 100 - 100),
    topix: ((d.topix / baseTopix) * 100 - 100),
    alpha: d.cumulative_alpha,
  }));

  const final = chartData[chartData.length - 1];
  const stockColor = '#2563eb';
  const topixColor = '#94a3b8';
  const alphaColor = '#d4af37';

  function finalCls(v: number) {
    return `text-lg font-bold tabular-nums ${v >= 0 ? 'text-success' : 'text-danger'}`;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
      <div className="grid grid-cols-3 divide-x divide-gray-50 border-b border-gray-100">
        <div className="px-5 py-3">
          <div className="text-[10px] uppercase tracking-wider text-muted/50 mb-0.5">銘柄リターン</div>
          <div className={finalCls(final.stock)}>
            {final.stock >= 0 ? '+' : ''}{final.stock.toFixed(2)}%
          </div>
        </div>
        <div className="px-5 py-3">
          <div className="text-[10px] uppercase tracking-wider text-muted/50 mb-0.5">日経平均</div>
          <div className={finalCls(final.topix)}>
            {final.topix >= 0 ? '+' : ''}{final.topix.toFixed(2)}%
          </div>
        </div>
        <div className="px-5 py-3">
          <div className="text-[10px] uppercase tracking-wider text-muted/50 mb-0.5">超過収益 \u03b1</div>
          <div className={finalCls(final.alpha)}>
            {final.alpha >= 0 ? '+' : ''}{final.alpha.toFixed(2)}%
          </div>
        </div>
      </div>

      <div className="p-4">
        <ResponsiveContainer width="100%" height={360}>
          <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`}
              width={62}
            />
            <Tooltip
              contentStyle={{
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                fontSize: '12px',
                padding: '8px 12px',
              }}
              formatter={(value: number, name: string) => {
                const pct = `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
                const label =
                  name === 'stock' ? '\u9298\u67c4' : name === 'topix' ? '\u65e5\u7d4c\u5e73\u5747' : 'Alpha';
                return [pct, label];
              }}
            />
            <Line
              type="monotone"
              dataKey="stock"
              stroke={stockColor}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: stockColor, stroke: '#fff', strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              dataKey="topix"
              stroke={topixColor}
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="4 3"
              activeDot={{ r: 3, fill: topixColor }}
            />
            <Line
              type="monotone"
              dataKey="alpha"
              stroke={alphaColor}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, fill: alphaColor, stroke: '#fff', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>

        <div className="flex items-center justify-center gap-6 mt-3">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded" style={{ backgroundColor: stockColor }} />
            <span className="text-xs text-muted">銘柄</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 border-t border-dashed" style={{ borderColor: topixColor }} />
            <span className="text-xs text-muted">日経平均</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded" style={{ backgroundColor: alphaColor }} />
            <span className="text-xs text-muted">超過収益 \u03b1</span>
          </div>
        </div>
      </div>
    </div>
  );
}
