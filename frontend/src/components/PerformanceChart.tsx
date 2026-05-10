import { useEffect, useState } from 'react';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Bar,
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

function fmtYen(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  if (n >= 1000) return `${n.toLocaleString('ja-JP')}`;
  return `${n}`;
}

function ChartSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-gray-100 p-6">
      <div className="animate-pulse space-y-4">
        <div className="grid grid-cols-5 gap-4 mb-4">
          {[1, 2, 3, 4, 5].map((i) => (
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

  const first = data[0];
  const last = data[data.length - 1];
  const basePrice = first.price;
  const baseTopix = first.topix;

  const chartData = data.map((d) => ({
    date: d.date.slice(5),
    price: d.price,
    topix_val: d.topix,
    stock: ((d.price / basePrice) * 100 - 100),
    topix: ((d.topix / baseTopix) * 100 - 100),
    alpha: d.cumulative_alpha,
  }));

  const final = chartData[chartData.length - 1];
  const stockColor = '#2563eb';
  const topixColor = '#94a3b8';
  const alphaColor = '#d4af37';
  const priceColor = '#8b5cf6';

  function pctCls(v: number) {
    return `font-bold tabular-nums ${v >= 0 ? 'text-success' : 'text-danger'}`;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
      <div className="grid grid-cols-5 divide-x divide-gray-50 border-b border-gray-100">
        <div className="px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-muted/50 mb-0.5">現在株価</div>
          <div className="text-lg font-bold text-primary tabular-nums">
            &yen;{last.price.toLocaleString('ja-JP')}
          </div>
          <div className="text-[11px] text-muted/60 tabular-nums mt-0.5">
            前日比 {last.price >= first.price ? '+' : ''}{((last.price / first.price - 1) * 100).toFixed(1)}%
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-muted/50 mb-0.5">株価推移</div>
          <div className={pctCls(final.stock)}>
            {final.stock >= 0 ? '+' : ''}{final.stock.toFixed(2)}%
          </div>
          <div className="text-[11px] text-muted/60 mt-0.5">
            {fmtYen(first.price)} \u2192 {fmtYen(last.price)}
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-muted/50 mb-0.5">日経平均</div>
          <div className={pctCls(final.topix)}>
            {final.topix >= 0 ? '+' : ''}{final.topix.toFixed(2)}%
          </div>
          <div className="text-[11px] text-muted/60 mt-0.5">
            {first.topix.toLocaleString('ja-JP')} \u2192 {last.topix.toLocaleString('ja-JP')}
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-muted/50 mb-0.5">超過収益 \u03b1</div>
          <div className={pctCls(final.alpha)}>
            {final.alpha >= 0 ? '+' : ''}{final.alpha.toFixed(2)}%
          </div>
          <div className="text-[11px] text-muted/60 mt-0.5">累積</div>
        </div>
        <div className="px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-muted/50 mb-0.5">騰落率</div>
          <div className={pctCls(final.stock)}>
            {final.stock >= 0 ? '+' : ''}{final.stock.toFixed(2)}%
          </div>
          <div className="text-[11px] text-muted/60 mt-0.5">
            {data.length}日間
          </div>
        </div>
      </div>

      <div className="p-4">
        <ResponsiveContainer width="100%" height={360}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="pct"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`}
              width={62}
            />
            <YAxis
              yAxisId="yen"
              orientation="right"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `\u00a5${fmtYen(v)}`}
              width={52}
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
                if (name === 'price') return [`\u00a5${value.toLocaleString('ja-JP')}`, '\u682a\u4fa1'];
                if (name === 'stock') {
                  const pct = `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
                  return [pct, '\u682a\u4fa1\u30ea\u30bf\u30fc\u30f3'];
                }
                if (name === 'topix') {
                  const pct = `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
                  return [pct, '\u65e5\u7d4c\u5e73\u5747'];
                }
                if (name === 'alpha') {
                  const pct = `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
                  return [pct, '\u8d85\u904e\u53ce\u76ca'];
                }
                return [value, name];
              }}
            />
            <Bar yAxisId="yen" dataKey="price" fill={priceColor} fillOpacity={0.12} radius={[2, 2, 0, 0]} maxBarSize={24} />
            <Line yAxisId="pct" type="monotone" dataKey="stock" stroke={stockColor} strokeWidth={2} dot={false}
              activeDot={{ r: 4, fill: stockColor, stroke: '#fff', strokeWidth: 2 }} />
            <Line yAxisId="pct" type="monotone" dataKey="topix" stroke={topixColor} strokeWidth={1.5} dot={false}
              strokeDasharray="4 3" activeDot={{ r: 3, fill: topixColor }} />
            <Line yAxisId="pct" type="monotone" dataKey="alpha" stroke={alphaColor} strokeWidth={2.5} dot={false}
              activeDot={{ r: 4, fill: alphaColor, stroke: '#fff', strokeWidth: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>

        <div className="flex items-center justify-center gap-6 mt-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm opacity-20" style={{ backgroundColor: priceColor }} />
            <span className="text-xs text-muted">株価（円）</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded" style={{ backgroundColor: stockColor }} />
            <span className="text-xs text-muted">株価リターン</span>
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
