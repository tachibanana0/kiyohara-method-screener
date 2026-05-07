import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
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

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
        グラフを読み込み中...
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
        トラッキングデータがありません。
      </div>
    );
  }

  // 正規化: 選定時点を100基準に
  const basePrice = data[0].price;
  const baseTopix = data[0].topix;

  const chartData = data.map((d) => ({
    date: d.date.slice(5), // MM-DD
    stock: ((d.price / basePrice) * 100 - 100),
    topix: ((d.topix / baseTopix) * 100 - 100),
    alpha: d.cumulative_alpha,
  }));

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis
            tick={{ fontSize: 12 }}
            label={{ value: '累積収益率 (%)', angle: -90, position: 'insideLeft', offset: 10 }}
          />
          <Tooltip
            formatter={(value: number, name: string) => [
              `${value.toFixed(2)}%`,
              name === 'stock' ? '銘柄' : name === 'topix' ? 'TOPIX' : 'Alpha',
            ]}
            labelFormatter={(label) => `${label}`}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="stock"
            name="銘柄"
            stroke="#1e3a5f"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="topix"
            name="TOPIX"
            stroke="#6b7280"
            strokeWidth={2}
            dot={false}
            strokeDasharray="4 4"
          />
          <Line
            type="monotone"
            dataKey="alpha"
            name="Alpha (超過収益)"
            stroke="#d4af37"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
