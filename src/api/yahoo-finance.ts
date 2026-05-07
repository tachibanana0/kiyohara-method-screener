// ============================================
// Yahoo Finance API Client (Unofficial)
// Used for stock prices since J-Quants Free plan
// blocks /equities/bars/daily with 403
// ============================================

export interface YahooFinanceQuote {
  code: string;
  close: number;        // 終値
  open: number;
  high: number;
  low: number;
  volume: number;
  previousClose: number;
  currency: string;
}

export class YahooFinanceClient {
  private readonly baseUrl = 'https://query1.finance.yahoo.com/v8/finance/chart';
  private readonly userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  /** 日本株ティッカー: {code}.T
   *  J-QuantsのCodeは5桁（末尾0付き）だが、Yahoo Financeでは4桁
   */
  private toTicker(code: string): string {
    // 末尾の0を1つ除去（例: 72030 → 7203, 130A0 → 130A）
    const trimmed = code.replace(/0$/, '');
    return `${trimmed}.T`;
  }

  async fetchQuote(code: string): Promise<YahooFinanceQuote | null> {
    const ticker = this.toTicker(code);
    const url = `${this.baseUrl}/${ticker}?interval=1d&range=1d`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    let res: Response;
    try {
      res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'application/json',
        },
      });
      clearTimeout(timeoutId);
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn(`Yahoo Finance timeout for ${ticker}:`, err);
      return null;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`Yahoo Finance error for ${ticker}: ${res.status} ${text}`);
      return null;
    }

    const data = (await res.json()) as {
      chart?: {
        result?: Array<{
          meta: {
            currency: string;
            regularMarketPrice?: number;
            chartPreviousClose?: number;
          };
          indicators: {
            quote: Array<{
              close: number[];
              open: number[];
              high: number[];
              low: number[];
              volume: number[];
            }>;
          };
        }>;
        error?: unknown;
      };
    };

    const result = data.chart?.result?.[0];
    if (!result) return null;

    const quote = result.indicators.quote?.[0];
    let close = quote?.close?.[0];
    
    // Fallback: if quote data is empty, use regularMarketPrice from meta
    if (!close || isNaN(close)) {
      close = result.meta.regularMarketPrice;
      if (!close || isNaN(close)) return null;
      
      return {
        code,
        close,
        open: close,
        high: close,
        low: close,
        volume: 0,
        previousClose: result.meta.chartPreviousClose ?? close,
        currency: result.meta.currency ?? 'JPY',
      };
    }

    return {
      code,
      close,
      open: quote.open?.[0] ?? close,
      high: quote.high?.[0] ?? close,
      low: quote.low?.[0] ?? close,
      volume: quote.volume?.[0] ?? 0,
      previousClose: result.meta.chartPreviousClose ?? close,
      currency: result.meta.currency ?? 'JPY',
    };
  }

  /** 日経平均指数を取得（^N225）
   *  NOTE: Yahoo Financeの ^TOPX (TOPIX) は404のため、
   *  ベンチマークとして日経平均を使用
   */
  async fetchTopix(): Promise<number | null> {
    const url = `${this.baseUrl}/^N225?interval=1d&range=1d`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    let res: Response;
    try {
      res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'application/json',
        },
      });
      clearTimeout(timeoutId);
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn(`Yahoo Finance timeout for ^N225:`, err);
      return null;
    }

    if (!res.ok) {
      console.warn(`Yahoo Finance Nikkei225 error: ${res.status}`);
      return null;
    }

    const data = (await res.json()) as {
      chart?: {
        result?: Array<{
          indicators: {
            quote: Array<{ close: number[] }>;
          };
        }>;
      };
    };

    const close = data.chart?.result?.[0]?.indicators.quote[0].close?.[0];
    return close && !isNaN(close) ? close : null;
  }

  /** 複数銘柄をバルク取得（シリアル・レートリミット対策） */
  async fetchQuotes(codes: string[]): Promise<Map<string, YahooFinanceQuote>> {
    const results = new Map<string, YahooFinanceQuote>();
    const DELAY_MS = 500; // 0.5秒間隔でレートリミット回避

    for (const code of codes) {
      try {
        const quote = await this.fetchQuote(code);
        if (quote) results.set(code, quote);
      } catch (err) {
        console.warn(`Yahoo Finance fetch failed for ${code}:`, err);
      }
      // レートリミット対策
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }

    return results;
  }
}
