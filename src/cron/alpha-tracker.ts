// ============================================
// Alpha Tracker (Cron 用ヘルパー)
// ============================================

import { ScreenerDB } from '../db/schema';
import { YahooFinanceClient } from '../api/yahoo-finance';
import type { D1Database } from '@cloudflare/workers-types';

interface TrackerEnv {
  DB: D1Database;
}

export async function runAlphaTracking(env: TrackerEnv, date?: string): Promise<{ tracked: number }> {
  const targetDate = date ?? new Date().toISOString().slice(0, 10);
  const db = new ScreenerDB(env.DB);
  const yahoo = new YahooFinanceClient();

  const activePicks = await db.getActivePicks();
  if (activePicks.length === 0) return { tracked: 0 };

  const topixPrice = await yahoo.fetchTopix();
  if (!topixPrice) throw new Error('TOPIX fetch failed');

  const trackingRows: Parameters<typeof db.batchInsertTracking>[0] = [];

  for (const pick of activePicks) {
    try {
      const quote = await yahoo.fetchQuote(pick.code);
      if (!quote || !pick.initial_price || !pick.initial_topix) continue;

      const stockReturn = (quote.close - pick.initial_price) / pick.initial_price;
      const topixReturn = (topixPrice - pick.initial_topix) / pick.initial_topix;
      const alpha = (stockReturn - topixReturn) * 100;

      trackingRows.push({
        code: pick.code,
        date: targetDate,
        price: quote.close,
        topix: topixPrice,
        alpha,
        cumulative_alpha: alpha,
      });
    } catch (err) {
      console.warn(`Tracking failed for ${pick.code}:`, err);
    }
  }

  await db.batchInsertTracking(trackingRows);
  return { tracked: trackingRows.length };
}
