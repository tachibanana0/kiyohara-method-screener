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
}

interface Props {
  picks: Pick[];
  selected: string | null;
  onSelect: (code: string) => void;
}

export default function PickList({ picks, selected, onSelect }: Props) {
  if (picks.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
        現在の選定銘柄はありません。
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {picks.map((pick) => (
        <button
          key={pick.code}
          onClick={() => onSelect(pick.code)}
          className={`text-left rounded-lg border p-4 transition shadow-sm hover:shadow-md ${
            selected === pick.code
              ? 'border-accent ring-2 ring-accent bg-white'
              : 'border-gray-200 bg-white'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-primary">
              {pick.code} {pick.name}
            </span>
            {pick.is_owner_company ? (
              <span className="text-xs bg-accent/10 text-accent font-semibold px-2 py-0.5 rounded">
                オーナー企業
              </span>
            ) : null}
          </div>

          <div className="space-y-1 text-sm text-gray-600">
            <div className="flex justify-between">
              <span>時価総額</span>
              <span className="font-medium">{pick.market_cap.toFixed(1)}億円</span>
            </div>
            <div className="flex justify-between">
              <span>ネットキャッシュ</span>
              <span className="font-medium">{pick.net_cash.toFixed(1)}億円</span>
            </div>
            <div className="flex justify-between">
              <span>実質PER</span>
              <span className="font-medium">{pick.real_per.toFixed(1)}倍</span>
            </div>
            <div className="flex justify-between">
              <span>経営スコア</span>
              <span
                className={`font-medium ${
                  pick.management_score >= 70
                    ? 'text-success'
                    : pick.management_score >= 50
                    ? 'text-amber-600'
                    : 'text-danger'
                }`}
              >
                {pick.management_score}点
              </span>
            </div>
            <div className="flex justify-between">
              <span>売上成長(3Y)</span>
              <span className="font-medium">
                {pick.sales_growth ? `${(pick.sales_growth * 100).toFixed(1)}%` : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>営利成長(3Y)</span>
              <span className="font-medium">
                {pick.profit_growth ? `${(pick.profit_growth * 100).toFixed(1)}%` : 'N/A'}
              </span>
            </div>
          </div>

          <div className="mt-3 text-xs text-gray-400">
            選定日: {new Date(pick.picked_at).toLocaleDateString('ja-JP')}
          </div>
        </button>
      ))}
    </div>
  );
}
