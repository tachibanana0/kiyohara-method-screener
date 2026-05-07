#!/usr/bin/env node
/**
 * GitHub Actions用Alphaトラッキングスクリプト
 * 
 * 環境変数:
 * - SCREENING_API_URL: WorkerのURL
 * - SCREENING_API_TOKEN: Worker認証用トークン
 */

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class YahooFinanceClient {
  private async fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(`Yahoo Finance API error: ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  async fetchQuote(code: string): Promise<number | null> {
    const trimmed = code.replace(/0$/, '');
    const ticker = `${trimmed}.T`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
    
    try {
      const data = await this.fetchJson<{ chart: { result: Array<{ indicators: { quote: Array<{ close: number[] }> }> }> }>(url);
      const result = data.chart?.result?.[0];
      const quote = result?.indicators?.quote?.[0];
      return quote?.close?.[0] ?? null;
    } catch (err) {
      console.warn(`Yahoo quote failed for ${code}:`, err);
      return null;
    }
  }

  async fetchTopix(): Promise<number | null> {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/^N225?interval=1d&range=1d';
    try {
      const data = await this.fetchJson<{ chart: { result: Array<{ indicators: { quote: Array<{ close: number[] }> }> }> }>(url);
      const result = data.chart?.result?.[0];
      const quote = result?.indicators?.quote?.[0];
      return quote?.close?.[0] ?? null;
    } catch (err) {
      console.warn('Yahoo TOPIX fetch failed:', err);
      return null;
    }
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

  const yahoo = new YahooFinanceClient();

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

  console.log('Step 2: Fetch TOPIX...');
  const topix = await yahoo.fetchTopix();
  if (!topix) {
    throw new Error('Failed to fetch TOPIX');
  }
  console.log(`TOPIX: ${topix}`);

  console.log('Step 3: Fetch stock prices...');
  const trackingRows: TrackingRow[] = [];

  for (const pick of picks) {
    try {
      await sleep(500);
      const price = await yahoo.fetchQuote(pick.code);
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
    } catch (err) {
      console.warn(`Tracking failed for ${pick.code}:`, err);
    }
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
