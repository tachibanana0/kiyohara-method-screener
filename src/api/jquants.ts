// ============================================
// J-Quants API Client (V2) - Financial Data Only
// Stock prices are fetched via Yahoo Finance
// ============================================

import type { JQuantsSymbol, JQuantsStatement, QuantScreenedStock } from '../types';
import { YahooFinanceClient } from './yahoo-finance';
import { EdinetClient } from './edinet';

const RATE_LIMIT_MS = 5_000; // Free tier: 3 req/min = 20s interval, but use 5s for speed

export class JQuantsClient {
  constructor(
    private apiKey: string,
    private baseUrl: string
  ) {}

  private async fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          ...(init?.headers || {}),
        },
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`J-Quants API error: ${res.status} ${text}`);
      }
      return res.json() as Promise<T>;
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  async fetchAllSymbols(): Promise<JQuantsSymbol[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const data = await this.fetchJson<{ data: JQuantsSymbol[] }>('/equities/master');
      clearTimeout(timeoutId);
      return data.data || [];
    } catch (err) {
      clearTimeout(timeoutId);
      console.error('Failed to fetch symbols:', err);
      return [];
    }
  }

  /** 財務データを取得（複数年）
   *  Free tierで403の場合は空配列を返し、呼び出し側でEDINETフォールバック
   */
  async fetchStatements(code: string): Promise<JQuantsStatement[]> {
    try {
      const data = await this.fetchJson<{ data: JQuantsStatement[] }>(
        `/fins/summary?code=${code}`
      );
      return (data.data || [])
        .map((s) => ({
          ...s,
          Sales: Number(s.Sales) || 0,
          OP: Number(s.OP) || 0,
          NP: Number(s.NP) || 0,
          CashEq: Number(s.CashEq) || 0,
          ShOutFY: Number(s.ShOutFY) || 0,
        }))
        .sort(
          (a, b) => new Date(a.CurPerEn).getTime() - new Date(b.CurPerEn).getTime()
        );
    } catch (err: any) {
      if (err.message?.includes('403') || err.message?.includes('429')) {
        console.warn(`J-Quants ${err.message?.includes('403') ? '403' : '429'} for ${code}, will fallback to EDINET`);
        return [];
      }
      throw err;
    }
  }

  /** Step 1: 定量スクリーニング
   *  - 株価: Yahoo Finance API
   *  - 財務: J-Quants API (Free tier: 5req/min) → 403時はEDINETフォールバック
   */
  async screenQuantitatively(edinetClient?: EdinetClient, db?: import('../db/schema').ScreenerDB): Promise<QuantScreenedStock[]> {
    console.log('screenQuantitatively: START');
    const yahoo = new YahooFinanceClient();

    // --- 1. 銘柄マスター取得 ---
    const symbols = await this.fetchAllSymbols();
    const targetSymbols = symbols.filter((s) => {
      // 東証グロースのみ
      if ((s.Mkt || '') !== '0113') return false;
      // EDINET対応: コードが数値5桁（末尾0）のみ
      const codeWithoutTrailingZero = (s.Code || '').replace(/0$/, '');
      return /^\d{4}$/.test(codeWithoutTrailingZero);
    }); // 東証グロース
    console.log(`Target: ${targetSymbols.length} TSE Growth stocks (EDINET-compatible)`);

    // Free tier制限: 株価取得(Yahoo) + 財務取得(J-Quants) + TOPIX(Yahoo)
    const MAX_STOCKS = 3;
    const limitedSymbols = targetSymbols.slice(0, MAX_STOCKS);
    console.log(`Processing first ${limitedSymbols.length} stocks due to API limits`);

    // --- 2. Yahoo Financeで株価取得 ---
    const codes = limitedSymbols.map((s) => s.Code);
    const priceMap = await yahoo.fetchQuotes(codes);
    console.log(`Fetched Yahoo prices for ${priceMap.size} stocks`);

    // --- 3. Yahoo FinanceでTOPIX取得 ---
    const topix = await yahoo.fetchTopix();
    console.log(`TOPIX: ${topix}`);

    // --- 4. J-Quantsで財務データ取得（レートリミット厳守） ---
    const screened: QuantScreenedStock[] = [];

    for (const sym of limitedSymbols) {
      const priceData = priceMap.get(sym.Code);
      if (!priceData) {
        console.log(`Skip ${sym.Code}: no price data`);
        continue;
      }

      try {
        await this.sleep(RATE_LIMIT_MS);
        let statements = await this.fetchStatements(sym.Code);

        // J-Quants 403 fallback: EDINETから有価証券報告書を取得
        if (statements.length === 0 && edinetClient) {
          console.log(`J-Quants 403 for ${sym.Code}, trying EDINET fallback...`);
          const mapping = db ? await db.getEdinetMapping(sym.Code) : null;
          const reports = await edinetClient.fetchLatestYukashokenReports(sym.Code, sym.CoName, mapping?.edinet_code);
          if (reports.length > 0) {
            const xbrlText = await edinetClient.fetchDocumentText(reports[0].docId);
            const fin = edinetClient.extractFinancialData(xbrlText);
            if (fin) {
              statements = [{
                CurPerEn: new Date().toISOString().slice(0, 10),
                Sales: fin.sales,
                OP: fin.operatingProfit,
                NP: fin.netProfit,
                CashEq: fin.cashAndDeposits,
                ShOutFY: fin.sharesOutstanding,
              } as JQuantsStatement];
            }
          }
        }

        if (statements.length === 0) {
          console.log(`Skip ${sym.Code}: no financial data (J-Quants 403 + EDINET fallback failed)`);
          continue;
        }

        const latest = statements[statements.length - 1];

        // 時価総額 = 株価 × 発行済株式数
        const shares = latest.ShOutFY || 0;
        if (shares <= 0) {
          console.log(`Skip ${sym.Code}: no shares outstanding`);
          continue;
        }
        const marketCap = (priceData.close * shares) / 1e8; // 億円
        if (marketCap > 500) {
          console.log(`Skip ${sym.Code}: market cap ${marketCap.toFixed(1)}億円 > 500億円`);
          continue;
        }

        // ネットキャッシュ
        const cash = latest.CashEq || 0;
        const netCash = cash / 1e8;

        // 実質PER
        const profit = latest.NP || 0;
        if (profit <= 0) {
          console.log(`Skip ${sym.Code}: no profit`);
          continue;
        }
        const realPER = (marketCap - netCash) / (profit / 1e8);
        if (realPER > 15 || realPER <= 0) {
          console.log(`Skip ${sym.Code}: realPER ${realPER.toFixed(1)} > 15`);
          continue;
        }

        // 成長性（過去3年）- J-Quantsデータがある場合のみ判定
        let salesGrowth = 0;
        let profitGrowth = 0;
          if (statements.length >= 3) {
          const last3 = statements.slice(-3);
          salesGrowth = this.avgGrowthRate(last3.map((s) => s.Sales));
          profitGrowth = this.avgGrowthRate(last3.map((s) => s.OP));
          if (salesGrowth <= 0 || profitGrowth <= 0) {
            console.log(`Skip ${sym.Code}: insufficient growth (sales=${salesGrowth.toFixed(2)}, op=${profitGrowth.toFixed(2)})`);
            continue;
          }
        }

        screened.push({
          code: sym.Code,
          name: sym.CoName,
          marketCap,
          netCash,
          realPER,
          salesGrowth3Y: salesGrowth,
          profitGrowth3Y: profitGrowth,
          latestPrice: priceData.close,
          latestTopix: topix ?? 0,
        });

        console.log(
          `PASS: ${sym.Code} ${sym.CoName} cap=${marketCap.toFixed(1)}B PER=${realPER.toFixed(1)}`
        );
      } catch (err) {
        console.warn(`Screening failed for ${sym.Code}:`, err);
      }
    }

    console.log(`Final screened: ${screened.length} stocks`);
    return screened;
  }

  private avgGrowthRate(values: number[]): number {
    if (values.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < values.length; i++) {
      const prev = values[i - 1];
      const curr = values[i];
      total += prev === 0 ? 0 : (curr - prev) / Math.abs(prev);
    }
    return total / (values.length - 1);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
