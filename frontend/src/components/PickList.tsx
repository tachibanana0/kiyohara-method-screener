import { useState } from 'react';
import { Link } from 'react-router-dom';

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
  kiyohara_compliant: number;
  reason: string;
}

interface Props {
  picks: Pick[];
  selected: string | null;
  onSelect: (code: string) => void;
}

type SortKey = 'code' | 'market_cap' | 'net_cash_ratio' | 'real_per' | 'management_score' | 'sales_growth' | 'profit_growth' | 'nc_ratio' | 'score';

function fmt(n: number, d = 1): string {
  return n.toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function pct(v: number | null): { text: string; cls: string } {
  if (v == null) return { text: '\u2014', cls: 'text-muted' };
  const p = v * 100;
  const sign = p >= 0 ? '+' : '';
  const cls = p > 0 ? 'text-success' : p < 0 ? 'text-danger' : 'text-muted';
  return { text: `${sign}${p.toFixed(1)}%`, cls };
}

function scoreBadge(score: number) {
  const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold';
  if (score >= 70) return { cls: `${base} bg-green-50 text-success`, label: `${score}` };
  if (score >= 50) return { cls: `${base} bg-amber-50 text-amber-700`, label: `${score}` };
  return { cls: `${base} bg-red-50 text-danger`, label: `${score}` };
}

function SortArrow({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <span className="text-gray-300 ml-0.5">\u25b4\u25be</span>;
  return <span className="text-accent ml-0.5">{dir === 'asc' ? '\u25b2' : '\u25bc'}</span>;
}

export default function PickList({ picks, selected, onSelect }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('net_cash_ratio');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sorted = [...picks].sort((a, b) => {
    const va = getVal(a, sortKey);
    const vb = getVal(b, sortKey);
    if (va == null) return 1;
    if (vb == null) return -1;
    return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  });

  if (picks.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-100 p-12 text-center">
        <div className="text-muted text-sm">現在の選定銘柄はありません。</div>
        <div className="text-muted/60 text-xs mt-1">平日 15:00 に自動スクリーニングが実行されます。</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/80">
              <th className="text-left px-3 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider w-8" />
              <Th label="銘柄" sortKey="code" active={sortKey} dir={sortDir} onClick={() => toggleSort('code')} />
              <Th label="Tier" sortKey="code" active="code" dir="desc" onClick={() => {}} />
              <Th label="オーナー" sortKey="code" active="code" dir="desc" onClick={() => {}} />
              <Th label="時価総額" sortKey="market_cap" active={sortKey} dir={sortDir} onClick={() => toggleSort('market_cap')} />
              <Th label="NC比率" sortKey="net_cash_ratio" active={sortKey} dir={sortDir} onClick={() => toggleSort('net_cash_ratio')} />
              <Th label="実質PER" sortKey="real_per" active={sortKey} dir={sortDir} onClick={() => toggleSort('real_per')} />
              <Th label="売上成長" sortKey="sales_growth" active={sortKey} dir={sortDir} onClick={() => toggleSort('sales_growth')} />
              <Th label="営利成長" sortKey="profit_growth" active={sortKey} dir={sortDir} onClick={() => toggleSort('profit_growth')} />
              <Th label="スコア" sortKey="management_score" active={sortKey} dir={sortDir} onClick={() => toggleSort('management_score')} />
              <th className="text-left px-3 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider">評価理由</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sorted.map((pick) => {
              const isSel = selected === pick.code;
              const isKiyohara = pick.kiyohara_compliant === 1;
              const sales = pct(pick.sales_growth);
              const profit = pct(pick.profit_growth);
              const badge = scoreBadge(pick.management_score);
              const ncr = pick.net_cash_ratio > 0 ? `${(pick.net_cash_ratio * 100).toFixed(0)}%` : '\u2014';
              const ncrCls = pick.net_cash_ratio >= 1 ? 'text-success font-semibold' : pick.net_cash_ratio >= 0.5 ? 'text-amber-600 font-medium' : 'text-gray-500';

              return (
                <tr
                  key={pick.code}
                  onClick={() => onSelect(pick.code)}
                  className={`cursor-pointer transition-colors duration-100 ${isSel ? 'bg-amber-50/50' : isKiyohara ? 'hover:bg-green-50/30' : 'hover:bg-amber-50/20'}`}
                >
                  <td className="px-3 py-3">
                    <div className={`w-2 h-2 rounded-full ${isSel ? 'bg-accent ring-2 ring-accent/30' : isKiyohara ? 'bg-success' : 'bg-accent/60'}`} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2 min-w-[150px]">
                      <Link to={`/picks/${pick.code}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-primary tabular-nums hover:text-accent transition-colors">
                        {pick.code}
                      </Link>
                      <span className="text-gray-700 truncate max-w-[100px]">{pick.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center">
                    {isKiyohara ? (
                      <span className="text-[10px] bg-green-50 text-success font-semibold px-1.5 py-0.5 rounded">適合</span>
                    ) : (
                      <span className="text-[10px] bg-amber-50 text-accent font-semibold px-1.5 py-0.5 rounded">監視</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {pick.is_owner_company ? (
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-50 text-success text-xs font-bold">✓</span>
                    ) : (
                      <span className="text-xs text-muted/40">✗</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-800">
                    {fmt(pick.market_cap)}<span className="text-xs text-muted ml-0.5">億</span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <span className={ncrCls}>{ncr}</span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <span className={pick.real_per <= 10 ? 'text-success font-semibold' : pick.real_per <= 15 ? 'text-primary font-medium' : 'text-gray-600'}>
                      {fmt(pick.real_per, 1)}
                    </span>
                    <span className="text-xs text-muted ml-0.5">倍</span>
                  </td>
                  <td className={`px-3 py-3 text-right tabular-nums font-semibold ${sales.cls}`}>{sales.text}</td>
                  <td className={`px-3 py-3 text-right tabular-nums font-semibold ${profit.cls}`}>{profit.text}</td>
                  <td className="px-3 py-3 text-center"><span className={badge.cls}>{badge.label}</span></td>
                  <td className="px-3 py-3 max-w-[220px]">
                    <span className="text-xs text-gray-600 line-clamp-2 leading-relaxed" title={pick.reason}>{pick.reason || '\u2014'}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ label, sortKey, active, dir, onClick }: { label: string; sortKey: SortKey; active: SortKey; dir: 'asc' | 'desc'; onClick: () => void }) {
  return (
    <th className="text-right px-3 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider cursor-pointer hover:text-gray-800 select-none" onClick={onClick}>
      {label}
      <SortArrow active={active === sortKey} dir={dir} />
    </th>
  );
}

function getVal(p: Pick, key: SortKey): number | string {
  switch (key) {
    case 'code': return p.code;
    case 'market_cap': return p.market_cap;
    case 'net_cash_ratio': case 'nc_ratio': return p.net_cash_ratio || 0;
    case 'real_per': return p.real_per;
    case 'management_score': case 'score': return p.management_score;
    case 'sales_growth': return p.sales_growth ?? -999;
    case 'profit_growth': return p.profit_growth ?? -999;
    default: return 0;
  }
}
