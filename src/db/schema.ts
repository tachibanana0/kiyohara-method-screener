// ============================================
// D1 Database Query Helpers
// ============================================

import type { D1Database } from '@cloudflare/workers-types';
import type {
  CompanyEvaluationRow,
  PickRow,
  DailyTrackingRow,
} from '../types';

export class ScreenerDB {
  constructor(private db: D1Database) {}

  // --- company_evaluations ---

  async getLatestEvaluation(code: string): Promise<CompanyEvaluationRow | null> {
    const row = await this.db
      .prepare(
        `SELECT * FROM company_evaluations
         WHERE code = ?
         ORDER BY submitted_date DESC
         LIMIT 1`
      )
      .bind(code)
      .first<CompanyEvaluationRow>();
    return row ?? null;
  }

  async getEvaluationByDocId(code: string, docId: string): Promise<CompanyEvaluationRow | null> {
    const row = await this.db
      .prepare(
        `SELECT * FROM company_evaluations
         WHERE code = ? AND doc_id = ?
         LIMIT 1`
      )
      .bind(code, docId)
      .first<CompanyEvaluationRow>();
    return row ?? null;
  }

  async insertEvaluation(
    code: string,
    docId: string,
    submittedDate: string,
    isOwner: boolean,
    score: number,
    reason: string
  ): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO company_evaluations
         (code, doc_id, submitted_date, is_owner_company, management_score, reason)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(code, doc_id) DO UPDATE SET
           is_owner_company = excluded.is_owner_company,
           management_score = excluded.management_score,
           reason = excluded.reason,
           updated_at = CURRENT_TIMESTAMP`
      )
      .bind(code, docId, submittedDate, isOwner ? 1 : 0, score, reason)
      .run();
  }

  // --- picks ---

  async getActivePicks(): Promise<PickRow[]> {
    const { results } = await this.db
      .prepare(`SELECT * FROM picks WHERE status = 'active' ORDER BY picked_at DESC`)
      .all<PickRow>();
    return results ?? [];
  }

  async getPickByCode(code: string): Promise<PickRow | null> {
    const row = await this.db
      .prepare(`SELECT * FROM picks WHERE code = ? LIMIT 1`)
      .bind(code)
      .first<PickRow>();
    return row ?? null;
  }

  async upsertPick(stock: {
    code: string;
    name: string;
    marketCap: number;
    netCash: number;
    realPER: number;
    salesGrowth3Y: number;
    profitGrowth3Y: number;
    isOwnerCompany: boolean;
    managementScore: number;
    latestPrice: number;
    latestTopix: number;
    kiyoharaCompliant: boolean;
    reason: string;
    netCashRatio: number;
  }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO picks
         (code, name, market_cap, net_cash, net_cash_ratio, real_per, sales_growth, profit_growth,
          is_owner_company, management_score, initial_price, initial_topix, kiyohara_compliant, reason, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
         ON CONFLICT(code) DO UPDATE SET
           name = excluded.name,
           market_cap = excluded.market_cap,
           net_cash = excluded.net_cash,
           net_cash_ratio = excluded.net_cash_ratio,
           real_per = excluded.real_per,
           sales_growth = excluded.sales_growth,
           profit_growth = excluded.profit_growth,
           is_owner_company = excluded.is_owner_company,
           management_score = excluded.management_score,
           kiyohara_compliant = excluded.kiyohara_compliant,
           reason = excluded.reason,
           initial_price = COALESCE(picks.initial_price, excluded.initial_price),
           initial_topix = COALESCE(picks.initial_topix, excluded.initial_topix),
           status = 'active',
           picked_at = CURRENT_TIMESTAMP`
      )
      .bind(
        stock.code,
        stock.name,
        stock.marketCap,
        stock.netCash,
        (stock.netCashRatio ?? 0),
        stock.realPER,
        stock.salesGrowth3Y,
        stock.profitGrowth3Y,
        stock.isOwnerCompany ? 1 : 0,
        stock.managementScore,
        stock.latestPrice,
        stock.latestTopix,
        stock.kiyoharaCompliant ? 1 : 0,
        stock.reason
      )
      .run();
  }

  async closePick(code: string): Promise<void> {
    await this.db
      .prepare(`UPDATE picks SET status = 'closed' WHERE code = ?`)
      .bind(code)
      .run();
  }

  /** 現行ハード基準に違反する active picks を一括クローズ。
   *  旧ロジックで選定された汚染行 (大型株・PER基準外・NC<=0) を掃除する。
   *  REIT/投資法人等の名前パターンは screening 側の除外リストと同一正規表現。 */
  async closeNonCompliantPicks(maxMarketCap: number, maxRealPer: number): Promise<number> {
    const result = await this.db
      .prepare(
        `UPDATE picks SET status = 'closed'
         WHERE status = 'active'
           AND (
             market_cap > ?1
             OR real_per <= 0 OR real_per > ?2
             OR net_cash <= 0
             OR name LIKE '%投資法人%' OR name LIKE '%投資信託%' OR name LIKE '%リート%'
             OR name LIKE '%ＲＥＩＴ%' OR name LIKE '%REIT%' OR name LIKE '%ファンド%'
             OR name LIKE '%ＥＴＦ%' OR name LIKE '%ETF%' OR name LIKE '%ＥＴＮ%' OR name LIKE '%ETN%'
           )`
      )
      .bind(maxMarketCap, maxRealPer)
      .run();
    return result.meta.changes ?? 0;
  }

  async countNonCompliantPicks(maxMarketCap: number, maxRealPer: number): Promise<number> {
    const row = await this.db
      .prepare(
        `SELECT COUNT(*) as n FROM picks
         WHERE status = 'active'
           AND (
             market_cap > ?1
             OR real_per <= 0 OR real_per > ?2
             OR net_cash <= 0
             OR name LIKE '%投資法人%' OR name LIKE '%投資信託%' OR name LIKE '%リート%'
             OR name LIKE '%ＲＥＩＴ%' OR name LIKE '%REIT%' OR name LIKE '%ファンド%'
             OR name LIKE '%ＥＴＦ%' OR name LIKE '%ETF%' OR name LIKE '%ＥＴＮ%' OR name LIKE '%ETN%'
           )`
      )
      .bind(maxMarketCap, maxRealPer)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  // --- daily_tracking ---

  async getLatestTracking(code: string): Promise<DailyTrackingRow | null> {
    const row = await this.db
      .prepare(
        `SELECT * FROM daily_tracking WHERE code = ? ORDER BY date DESC LIMIT 1`
      )
      .bind(code)
      .first<DailyTrackingRow>();
    return row ?? null;
  }

  async insertTracking(
    code: string,
    date: string,
    price: number,
    topix: number,
    alpha: number,
    cumulativeAlpha: number
  ): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO daily_tracking
         (code, date, price, topix, alpha, cumulative_alpha)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(code, date) DO UPDATE SET
           price = excluded.price,
           topix = excluded.topix,
           alpha = excluded.alpha,
           cumulative_alpha = excluded.cumulative_alpha`
      )
      .bind(code, date, price, topix, alpha, cumulativeAlpha)
      .run();
  }

  async getTrackingSeries(code: string): Promise<DailyTrackingRow[]> {
    const { results } = await this.db
      .prepare(
        `SELECT * FROM daily_tracking WHERE code = ? ORDER BY date ASC`
      )
      .bind(code)
      .all<DailyTrackingRow>();
    return results ?? [];
  }

  // --- edinet_mappings ---

  async getEdinetMapping(code: string): Promise<{ code: string; edinet_code: string; company_name: string } | null> {
    const row = await this.db
      .prepare(`SELECT * FROM edinet_mappings WHERE code = ? LIMIT 1`)
      .bind(code)
      .first<{ code: string; edinet_code: string; company_name: string }>();
    return row ?? null;
  }

  async getAllEdinetMappings(): Promise<Array<{ code: string; edinet_code: string; company_name: string }>> {
    const { results } = await this.db
      .prepare(`SELECT code, edinet_code, company_name FROM edinet_mappings`)
      .all<{ code: string; edinet_code: string; company_name: string }>();
    return results ?? [];
  }

  async upsertEdinetMapping(code: string, edinetCode: string, companyName: string): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO edinet_mappings (code, edinet_code, company_name)
         VALUES (?, ?, ?)
         ON CONFLICT(code) DO UPDATE SET
           edinet_code = excluded.edinet_code,
           company_name = excluded.company_name,
           updated_at = CURRENT_TIMESTAMP`
      )
      .bind(code, edinetCode, companyName)
      .run();
  }

  // --- helpers ---

  /** 各銘柄の最新 cumulative_alpha を一括取得 (1 クエリ)。トラッキング受信時に
   *  逐次 getTrackingSeries を呼ぶと Workers の subrequest 上限 (50) を超えるため。 */
  async getLatestCumulativeAlphas(codes: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (codes.length === 0) return map;
    const unique = [...new Set(codes)];
    const BATCH = 90; // IN句のパラメータ数は 1 クエリあたり 100 バインド上限に余裕を持たせる
    for (let i = 0; i < unique.length; i += BATCH) {
      const slice = unique.slice(i, i + BATCH);
      const placeholders = slice.map(() => '?').join(',');
      const { results } = await this.db
        .prepare(
          `SELECT t.code, t.cumulative_alpha
           FROM daily_tracking t
           JOIN (SELECT code, MAX(date) AS max_date FROM daily_tracking WHERE code IN (${placeholders}) GROUP BY code) m
             ON t.code = m.code AND t.date = m.max_date`
        )
        .bind(...slice)
        .all<{ code: string; cumulative_alpha: number }>();
      for (const r of results ?? []) map.set(r.code, r.cumulative_alpha);
    }
    return map;
  }

  async batchInsertTracking(rows: Omit<DailyTrackingRow, 'id' | 'created_at'>[]): Promise<void> {
    if (rows.length === 0) return;
    const stmts = rows.map((r) =>
      this.db
        .prepare(
          `INSERT INTO daily_tracking (code, date, price, topix, alpha, cumulative_alpha)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(code, date) DO UPDATE SET
             price = excluded.price,
             topix = excluded.topix,
             alpha = excluded.alpha,
             cumulative_alpha = excluded.cumulative_alpha`
        )
        .bind(r.code, r.date, r.price, r.topix, r.alpha, r.cumulative_alpha)
    );
    // Free tier limit: 1,000 statements per batch
    const BATCH_SIZE = 500;
    for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
      await this.db.batch(stmts.slice(i, i + BATCH_SIZE));
    }
  }
}
