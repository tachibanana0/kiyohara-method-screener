#!/usr/bin/env node
/**
 * GitHub Actions用スクリーニングスクリプト
 * 
 * 環境変数:
 * - JQUANTS_API_KEY: J-Quants APIキー
 * - EDINET_SUBSCRIPTION_KEY: EDINET APIキー
 * - OPENROUTER_API_KEY: OpenRouter APIキー
 * - SCREENING_API_URL: WorkerのURL (例: https://kiyohara-screener.hikakunavi360.com)
 * - SCREENING_API_TOKEN: Worker認証用トークン
 */

// ============================================
// 型定義
// ============================================

interface JQuantsSymbol {
  Code: string;
  CoName: string;
  Mkt: string;
}

interface JQuantsStatement {
  CurPerEn: string;
  Sales: number;
  OP: number;
  NP: number;
  CashEq: number;
  ShOutFY: number;
}

interface QuantScreenedStock {
  code: string;
  name: string;
  marketCap: number;
  netCash: number;
  realPER: number;
  salesGrowth3Y: number;
  profitGrowth3Y: number;
  latestPrice: number;
  latestTopix: number;
}

interface LlmEvaluation {
  is_owner_company: number;
  management_score: number;
  reason: string;
}

interface PickResult {
  code: string;
  name: string;
  marketCap: number;
  netCash: number;
  realPER: number;
  salesGrowth3Y: number;
  profitGrowth3Y: number;
  isOwnerCompany: number;
  managementScore: number;
  latestPrice: number;
  latestTopix: number;
}

// ============================================
// ユーティリティ
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// J-Quants API クライアント
// ============================================

class JQuantsClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = 'https://api.jquants.com/v2') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
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
    const data = await this.fetchJson<{ data: JQuantsSymbol[] }>('/equities/master');
    return data.data || [];
  }

  async fetchStatements(code: string): Promise<JQuantsStatement[]> {
    try {
      const data = await this.fetchJson<{ data: JQuantsStatement[] }>(`/fins/summary?code=${code}`);
      return (data.data || [])
        .map((s) => ({
          ...s,
          Sales: Number(s.Sales) || 0,
          OP: Number(s.OP) || 0,
          NP: Number(s.NP) || 0,
          CashEq: Number(s.CashEq) || 0,
          ShOutFY: Number(s.ShOutFY) || 0,
        }))
        .sort((a, b) => new Date(a.CurPerEn).getTime() - new Date(b.CurPerEn).getTime());
    } catch (err: any) {
      if (err.message?.includes('403') || err.message?.includes('429')) {
        console.warn(`J-Quants ${err.message?.includes('403') ? '403' : '429'} for ${code}`);
        return [];
      }
      throw err;
    }
  }
}

// ============================================
// Yahoo Finance クライアント
// ============================================

interface YahooChartResponse {
  chart: {
    result: Array<{
      indicators: {
        quote: Array<{ close: number[] }>;
      };
    }>;
  };
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

  async fetchQuote(code: string): Promise<{ close: number } | null> {
    const trimmed = code.replace(/0$/, '');
    const ticker = `${trimmed}.T`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
    
    try {
      const data = await this.fetchJson<YahooChartResponse>(url);
      const result = data.chart?.result?.[0];
      const quote = result?.indicators?.quote?.[0];
      const close = quote?.close?.[0];
      return close ? { close } : null;
    } catch (err) {
      console.warn(`Yahoo quote failed for ${code}:`, err);
      return null;
    }
  }

  async fetchTopix(): Promise<number | null> {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/^N225?interval=1d&range=1d';
    try {
      const data = await this.fetchJson<YahooChartResponse>(url);
      const result = data.chart?.result?.[0];
      const quote = result?.indicators?.quote?.[0];
      return quote?.close?.[0] ?? null;
    } catch (err) {
      console.warn('Yahoo TOPIX fetch failed:', err);
      return null;
    }
  }

  async fetchQuotes(codes: string[]): Promise<Map<string, { close: number }>> {
    const priceMap = new Map<string, { close: number }>();
    for (const code of codes) {
      await sleep(500);
      const quote = await this.fetchQuote(code);
      if (quote) {
        priceMap.set(code, quote);
      }
    }
    return priceMap;
  }
}

// ============================================
// EDINET API クライアント
// ============================================

class EdinetClient {
  private baseUrl: string;
  private subscriptionKey: string;

  constructor(subscriptionKey: string, baseUrl: string = 'https://disclosure.edinet-fsa.go.jp/api/v2') {
    this.baseUrl = baseUrl;
    this.subscriptionKey = subscriptionKey;
  }

  async fetchLatestYukashokenReports(
    secCode: string,
    companyName?: string,
    edinetCode?: string
  ): Promise<Array<{ docId: string; submitDateTime: string; filerName: string }>> {
    const today = new Date();
    const results: Array<{ docId: string; submitDateTime: string; filerName: string }> = [];

    for (let daysBack = 0; daysBack < 60; daysBack++) {
      const date = new Date(today);
      date.setDate(date.getDate() - daysBack);
      const dateStr = date.toISOString().slice(0, 10);

      const url = `${this.baseUrl}/documents.json?date=${dateStr}&type=2`;
      const res = await fetch(url, {
        headers: { 'Ocp-Apim-Subscription-Key': this.subscriptionKey },
      });

      if (!res.ok) continue;

      const data = await res.json() as { results: Array<{ docID: string; submitDateTime: string; filerName: string; secCode: string; edinetCode: string }> };
      
      for (const doc of data.results || []) {
        const matchEdinet = edinetCode && doc.edinetCode === edinetCode;
        const matchSecCode = doc.secCode === secCode;
        const matchName = companyName && doc.filerName?.includes(companyName);

        if (matchEdinet || matchSecCode || matchName) {
          results.push({
            docId: doc.docID,
            submitDateTime: doc.submitDateTime,
            filerName: doc.filerName,
          });
        }
      }

      if (results.length > 0) break;
      await sleep(1000);
    }

    return results.sort((a, b) => b.submitDateTime.localeCompare(a.submitDateTime));
  }

  async fetchDocumentText(docId: string): Promise<string> {
    const url = `${this.baseUrl}/documents/${docId}`;
    
    // EDINET returns XBRL documents with redirects
    // Node.js fetch has redirect limits, so we handle manually
    let currentUrl = url;
    for (let i = 0; i < 10; i++) {
      const res = await fetch(currentUrl, {
        headers: { 'Ocp-Apim-Subscription-Key': this.subscriptionKey },
        redirect: 'manual',
      });
      
      if (res.status === 301 || res.status === 302 || res.status === 307 || res.status === 308) {
        currentUrl = res.headers.get('location') || currentUrl;
        continue;
      }
      
      if (!res.ok) {
        throw new Error(`EDINET document fetch failed: ${res.status}`);
      }
      return res.text();
    }
    
    throw new Error('EDINET document redirect loop');
  }

  extractFinancialData(xbrlText: string): {
    sales: number;
    operatingProfit: number;
    netProfit: number;
    cashAndDeposits: number;
    sharesOutstanding: number;
  } | null {
    const extract = (pattern: RegExp): number => {
      const match = xbrlText.match(pattern);
      return match ? parseFloat(match[1]) || 0 : 0;
    };

    const sales = extract(/<jpdei:NetSales.*?>(.*?)<\/jpdei:NetSales>/);
    const operatingProfit = extract(/<jpdei:OperatingProfit.*?>(.*?)<\/jpdei:OperatingProfit>/);
    const netProfit = extract(/<jpdei:NetIncome.*?>(.*?)<\/jpdei:NetIncome>/);
    const cashAndDeposits = extract(/<jpdei:CashAndDeposits.*?>(.*?)<\/jpdei:CashAndDeposits>/);
    const sharesOutstanding = extract(/<jpdei:TotalSharesOutstanding.*?>(.*?)<\/jpdei:TotalSharesOutstanding>/);

    return { sales, operatingProfit, netProfit, cashAndDeposits, sharesOutstanding };
  }
}

// ============================================
// OpenRouter クライアント
// ============================================

class OpenRouterClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = 'https://openrouter.ai/api/v1') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async evaluateCompany(docText: string): Promise<LlmEvaluation> {
    const prompt = `以下の有価証券報告書の内容を読み、清原メソッドの基準で評価してください。

評価基準:
1. オーナー企業かどうか（創業家経営、同族企業など）
2. 経営の質（1-100点）

出力形式:
{
  "is_owner_company": 0 または 1,
  "management_score": 1-100の数値,
  "reason": "評価理由を簡潔に"
}

---
${docText.slice(0, 8000)}
---`;

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://kiyohara-screener.hikakunavi360.com',
        'X-Title': 'Kiyohara Method Screener',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenRouter API error: ${res.status}`);
    }

    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    const content = data.choices[0]?.message?.content || '';
    
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as LlmEvaluation;
      }
    } catch (err) {
      console.warn('Failed to parse LLM response:', err);
    }

    return {
      is_owner_company: 0,
      management_score: 0,
      reason: 'Failed to parse LLM response',
    };
  }
}

// ============================================
// スクリーニングロジック
// ============================================

async function runScreening(): Promise<PickResult[]> {
  const jquantsApiKey = process.env.JQUANTS_API_KEY;
  const edinetSubscriptionKey = process.env.EDINET_SUBSCRIPTION_KEY;
  const openrouterApiKey = process.env.OPENROUTER_API_KEY;

  if (!jquantsApiKey || !edinetSubscriptionKey || !openrouterApiKey) {
    throw new Error('Missing required environment variables');
  }

  const jquants = new JQuantsClient(jquantsApiKey);
  const yahoo = new YahooFinanceClient();
  const edinet = new EdinetClient(edinetSubscriptionKey);
  const openrouter = new OpenRouterClient(openrouterApiKey);

  console.log('Step 1: 銘柄マスター取得');
  const symbols = await jquants.fetchAllSymbols();
  const targetSymbols = symbols.filter((s) => {
    if ((s.Mkt || '') !== '0113') return false;
    const codeWithoutTrailingZero = (s.Code || '').replace(/0$/, '');
    return /^\d{4}$/.test(codeWithoutTrailingZero);
  });
  console.log(`Target: ${targetSymbols.length} TSE Growth stocks`);

  // バッチ処理: 1日50銘柄ずつ、6日で全銘柄カバー
  const BATCH_SIZE = 50;
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  const batchIndex = (dayOfWeek - 1 + 5) % 5; // 0-4 for Mon-Fri
  const startIdx = batchIndex * BATCH_SIZE;
  const endIdx = Math.min(startIdx + BATCH_SIZE, targetSymbols.length);
  const batchSymbols = targetSymbols.slice(startIdx, endIdx);
  console.log(`Batch ${batchIndex + 1}/5: processing stocks ${startIdx + 1}-${endIdx} of ${targetSymbols.length}`);

  console.log('Step 2: Yahoo Financeで株価取得');
  const codes = batchSymbols.map((s) => s.Code);
  const priceMap = await yahoo.fetchQuotes(codes);
  console.log(`Fetched Yahoo prices for ${priceMap.size} stocks`);

  console.log('Step 3: TOPIX取得');
  const topix = await yahoo.fetchTopix();
  console.log(`TOPIX: ${topix}`);

  console.log('Step 4: 財務データ取得 & スクリーニング');
  const screened: QuantScreenedStock[] = [];

  for (const sym of batchSymbols) {
    const priceData = priceMap.get(sym.Code);
    if (!priceData) {
      console.log(`Skip ${sym.Code}: no price data`);
      continue;
    }

    try {
      await sleep(20000);
      let statements = await jquants.fetchStatements(sym.Code);

      if (statements.length === 0) {
        console.log(`J-Quants 403 for ${sym.Code}, trying EDINET fallback...`);
        const reports = await edinet.fetchLatestYukashokenReports(sym.Code, sym.CoName);
        if (reports.length > 0) {
          const xbrlText = await edinet.fetchDocumentText(reports[0].docId);
          const fin = edinet.extractFinancialData(xbrlText);
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
        console.log(`Skip ${sym.Code}: no financial data`);
        continue;
      }

      const latest = statements[statements.length - 1];
      const shares = latest.ShOutFY || 0;
      if (shares <= 0) {
        console.log(`Skip ${sym.Code}: no shares outstanding`);
        continue;
      }

      const marketCap = (priceData.close * shares) / 1e8;
      if (marketCap > 500) {
        console.log(`Skip ${sym.Code}: market cap ${marketCap.toFixed(1)}億円 > 500億円`);
        continue;
      }

      const cash = latest.CashEq || 0;
      const netCash = cash / 1e8;
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

      let salesGrowth = 0;
      let profitGrowth = 0;
      if (statements.length >= 3) {
        const last3 = statements.slice(-3);
        salesGrowth = avgGrowthRate(last3.map((s) => s.Sales));
        profitGrowth = avgGrowthRate(last3.map((s) => s.OP));
        if (salesGrowth <= 0 || profitGrowth <= 0) {
          console.log(`Skip ${sym.Code}: insufficient growth`);
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

      console.log(`PASS: ${sym.Code} ${sym.CoName} cap=${marketCap.toFixed(1)}B PER=${realPER.toFixed(1)}`);
    } catch (err) {
      console.warn(`Screening failed for ${sym.Code}:`, err);
    }
  }

  console.log(`Step 4 complete: ${screened.length} stocks passed quantitative screening`);

  console.log('Step 5: LLM評価');
  const evaluated: Array<{ stock: QuantScreenedStock; eval: LlmEvaluation }> = [];

  for (const stock of screened) {
    try {
      const reports = await edinet.fetchLatestYukashokenReports(stock.code, stock.name);
      if (reports.length === 0) {
        console.log(`Skip ${stock.code}: no EDINET reports`);
        continue;
      }

      const docText = await edinet.fetchDocumentText(reports[0].docId);
      const evalResult = await openrouter.evaluateCompany(docText);
      evaluated.push({ stock, eval: evalResult });
      console.log(`Evaluated ${stock.code}: owner=${evalResult.is_owner_company}, score=${evalResult.management_score}`);
      
      await sleep(2000);
    } catch (err) {
      console.warn(`LLM evaluation failed for ${stock.code}:`, err);
    }
  }

  console.log(`Step 5 complete: ${evaluated.length} stocks evaluated`);

  console.log('Step 6: Pick選定');
  const picks: PickResult[] = [];

  for (const item of evaluated) {
    if (
      item.eval.is_owner_company &&
      item.eval.management_score >= 60 &&
      item.stock.realPER <= 15
    ) {
      picks.push({
        code: item.stock.code,
        name: item.stock.name,
        marketCap: item.stock.marketCap,
        netCash: item.stock.netCash,
        realPER: item.stock.realPER,
        salesGrowth3Y: item.stock.salesGrowth3Y,
        profitGrowth3Y: item.stock.profitGrowth3Y,
        isOwnerCompany: item.eval.is_owner_company,
        managementScore: item.eval.management_score,
        latestPrice: item.stock.latestPrice,
        latestTopix: item.stock.latestTopix,
      });
      console.log(`PICK: ${item.stock.code} ${item.stock.name}`);
    }
  }

  console.log(`Step 6 complete: ${picks.length} picks selected`);
  return picks;
}

function avgGrowthRate(values: number[]): number {
  if (values.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    const curr = values[i];
    total += prev === 0 ? 0 : (curr - prev) / Math.abs(prev);
  }
  return total / (values.length - 1);
}

// ============================================
// メイン処理
// ============================================

async function main() {
  console.log('=== Screening Started ===');
  const startTime = Date.now();

  try {
    const picks = await runScreening();

    const screeningApiUrl = process.env.SCREENING_API_URL;
    const screeningApiToken = process.env.SCREENING_API_TOKEN;

    if (!screeningApiUrl || !screeningApiToken) {
      throw new Error('Missing SCREENING_API_URL or SCREENING_API_TOKEN');
    }

    console.log(`Sending ${picks.length} picks to Worker...`);
    const res = await fetch(`${screeningApiUrl}/api/screening/receive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Screening-Token': screeningApiToken,
      },
      body: JSON.stringify({ picks }),
    });

    if (!res.ok) {
      throw new Error(`Worker API error: ${res.status}`);
    }

    const result = await res.json() as { success: boolean; saved: number };
    console.log(`Worker response: ${result.saved} picks saved`);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`=== Screening Complete: ${elapsed}s ===`);
  } catch (err) {
    console.error('Screening failed:', err);
    process.exit(1);
  }
}

main();
