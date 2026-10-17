#!/usr/bin/env node
/**
 * GitHub Actions用Alphaトラッキングスクリプト
 * 
 * 環境変数:
 * - SCREENING_API_URL: WorkerのURL
 * - SCREENING_API_TOKEN: Worker認証用トークン
 */

import { execSync } from 'node:child_process';

interface Pick {
  code: string;
  name: string;
  initial_price: number;
  initial_topix: number;
}

interface TrackingRow {
  code: string;
  price: number;
  topix: number;
  alpha: number;
  cumulative_alpha: number;
}

interface YfStock {
  code: string;
  price: number;
  error?: string;
}

interface YfResult {
  topix: number;
  stocks: YfStock[];
}

// yfinance (子プロセス) で株価・日経平均を一括取得。
// GitHub Actions の共有 IP から query1.finance.yahoo.com を直叩きすると
// ブロックされるため、README の決定通り yfinance 経由のみを使う。
function fetchYfinanceTracking(codes: string[]): YfResult {
  const empty: YfResult = { topix: 0, stocks: [] };
  if (codes.length === 0) return empty;
  try {
    // 1400銘柄で引数長制限に触れないよう 500 件ずつ分割して実行。
    const chunks: string[][] = [];
    for (let i = 0; i < codes.length; i += 500) chunks.push(codes.slice(i, i + 500));

    let topix = 0;
    const byCode = new Map<string, number>();
    for (const chunk of chunks) {
      const result = execSync(`python3 scripts/yfinance_data.py ${chunk.join(' ')}`, {
        encoding: 'utf-8',
        timeout: 300000,
        maxBuffer: 50 * 1024 * 1024,
      });
      const data: unknown = JSON.parse(result);
      if (data === null || typeof data !== 'object' || !('stocks' in data)) continue;
      const parsed = data as YfResult;
      if ('error' in parsed) {
        console.warn('yfinance error:', parsed.error);
        continue;
      }
      topix = parsed.topix || topix;
      for (const s of parsed.stocks || []) {
        if (typeof s.price === 'number' && s.price > 0) byCode.set(s.code, s.price);
      }
    }
    console.log(`yfinance: ${byCode.size}/${codes.length} prices, benchmark=${topix}`);
    return { topix, stocks: [...byCode].map(([code, price]) => ({ code, price })) };
  } catch (err: unknown) {
    console.warn('yfinance failed:', err instanceof Error ? err.message : err);
    return empty;
  }
}

async function main() {
  console.log('=== Alpha Tracking Started ===');
  const startTime = Date.now();

  const screeningApiUrl = process.env.SCREENING_API_URL;
  const screeningApiToken = process.env.SCREENING_API_TOKEN;

  if (!screeningApiUrl || !screeningApiToken) {
    throw new Error('Missing SCREENING_API_URL or SCREENING_API_TOKEN');
  }

  console.log('Step 1: Fetch active picks from Worker...');
  const picksRes = await fetch(`${screeningApiUrl}/api/picks`, {
    headers: { 'X-Screening-Token': screeningApiToken },
  });

  if (!picksRes.ok) {
    throw new Error(`Failed to fetch picks: ${picksRes.status}`);
  }

  const picks: Pick[] = await picksRes.json();
  console.log(`Found ${picks.length} active picks`);

  if (picks.length === 0) {
    console.log('No active picks to track. Exiting.');
    return;
  }

  console.log('Step 2: Fetch prices via yfinance (batch)...');
  const { topix, stocks } = fetchYfinanceTracking(picks.map((p) => p.code));
  if (!topix) {
    throw new Error('Failed to fetch benchmark (^N225) via yfinance');
  }
  console.log(`Benchmark: ${topix}`);
  const priceByCode = new Map(stocks.map((s) => [s.code, s.price]));

  console.log('Step 3: Compute alpha...');
  const trackingRows: TrackingRow[] = [];

  for (const pick of picks) {
    const price = priceByCode.get(pick.code);
    if (!price) {
      console.warn(`Failed to fetch price for ${pick.code}`);
      continue;
    }

    if (!pick.initial_price || !pick.initial_topix) {
      console.warn(`Missing initial data for ${pick.code}`);
      continue;
    }

    const stockReturn = (price - pick.initial_price) / pick.initial_price;
    const topixReturn = (topix - pick.initial_topix) / pick.initial_topix;
    const alpha = (stockReturn - topixReturn) * 100;

    trackingRows.push({
      code: pick.code,
      price,
      topix,
      alpha,
      cumulative_alpha: alpha,
    });

    console.log(`${pick.code}: price=${price}, alpha=${alpha.toFixed(2)}%`);
  }

  console.log(`Step 3 complete: ${trackingRows.length} rows to save`);

  console.log('Step 4: Save to Worker...');
  const res = await fetch(`${screeningApiUrl}/api/tracking/receive`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Screening-Token': screeningApiToken,
    },
    body: JSON.stringify({
      date: new Date().toISOString().slice(0, 10),
      rows: trackingRows,
    }),
  });

  if (!res.ok) {
    throw new Error(`Worker API error: ${res.status}`);
  }

  const result = await res.json() as { success: boolean; saved: number };
  console.log(`Worker response: ${result.saved} rows saved`);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`=== Alpha Tracking Complete: ${elapsed}s ===`);
}

main();
