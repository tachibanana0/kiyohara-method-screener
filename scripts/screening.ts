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
  fiscalYearEnd: string;
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
  isKiyoharaCompliant: boolean;
}

import JSZip from 'jszip';

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

  async fetchStatements(code: string, retries = 2): Promise<JQuantsStatement[]> {
    for (let attempt = 0; attempt <= retries; attempt++) {
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
        if ((err.message?.includes('403') || err.message?.includes('429')) && attempt < retries) {
          console.warn(`J-Quants rate limited for ${code}, retry ${attempt + 1}/${retries}...`);
          await sleep(30000);
          continue;
        }
        if (err.message?.includes('403') || err.message?.includes('429')) {
          console.warn(`J-Quants rate limited for ${code}, skipping after ${retries} retries`);
          return [];
        }
        throw err;
      }
    }
    return [];
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

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function normalizeCompanyName(name: string): string {
  return name
    .replace(/株式会社/g, '')
    .replace(/（株）/g, '')
    .replace(/\(株\)/g, '')
    .replace(/\s+/g, '')
    .trim();
}

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
    edinetCode?: string,
    _fiscalYearEnd?: string
  ): Promise<Array<{ docID: string; submitDateTime: string; filerName: string; edinetCode: string }>> {
    const today = new Date();
    const headers = {
      'Content-Type': 'application/json',
      'Ocp-Apim-Subscription-Key': this.subscriptionKey,
    };
    const secCode4 = secCode.replace(/0$/, ''); // 5桁→4桁
    const normalizedName = companyName ? normalizeCompanyName(companyName) : '';

    // Search up to 90 days back, client-side filtering
    for (let daysBack = 0; daysBack < 90; daysBack++) {
      const date = new Date(today);
      date.setDate(date.getDate() - daysBack);
      const dateStr = formatDate(date);
      const url = `${this.baseUrl}/documents.json?date=${dateStr}&type=2`;

      const res = await fetch(url, { headers });
      if (!res.ok) continue;

      const data = await res.json() as { results?: Array<{ docID: string; submitDateTime: string; filerName: string; docDescription: string; edinetCode: string; secCode: string }> };
      const results = data.results || [];
      if (results.length === 0) continue;

      const reports = results.filter((r) => {
        const d = r.docDescription || '';
        if (!d.includes('有価証券報告書') && !d.includes('半期報告書') && !d.includes('四半期報告書')) return false;
        // Match by edinetCode (exact)
        if (edinetCode && r.edinetCode === edinetCode) return true;
        // Match by secCode
        if (r.secCode && (r.secCode === secCode || r.secCode === secCode4)) return true;
        // Match by filerName (partial, normalized)
        if (normalizedName && r.filerName) {
          const filerNorm = normalizeCompanyName(r.filerName);
          if (filerNorm.includes(normalizedName) || normalizedName.includes(filerNorm)) return true;
        }
        return false;
      });

      if (reports.length > 0) return reports.slice(0, 5);
    }

    return [];
  }

  async fetchDocumentText(docId: string): Promise<string> {
    // EDINET API v2: type=1 は必須（ないと302→notfound.html）
    const url = `${this.baseUrl}/documents/${docId}?type=1`;
    
    const res = await fetch(url, {
      headers: { 'Ocp-Apim-Subscription-Key': this.subscriptionKey },
    });
    
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`EDINET document fetch failed: ${res.status} ${text.slice(0, 200)}`);
    }
    
    // ZIPファイルを展開してHTMLテキストを抽出
    const buffer = await res.arrayBuffer();
    const zip = await JSZip.loadAsync(buffer);
    
    // HTMLファイル（ixbrl.htm）を優先。XBRLは補助的に使用
    const htmlFiles = Object.keys(zip.files).filter(
      (f) => f.endsWith('.htm') && f.includes('PublicDoc') && !f.includes('__MACOSX')
    );
    const xbrlFiles = Object.keys(zip.files).filter(
      (f) => f.endsWith('.xbrl') && !f.includes('__MACOSX')
    );
    
    const texts: string[] = [];
    
    // HTMLファイルからテキストを抽出（最初の2ファイル）
    for (const file of htmlFiles.slice(0, 2)) {
      const content = await zip.files[file].async('text');
      // HTMLタグを除去してテキストのみ抽出
      const text = content.replace(/<[^>]*>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#\d+;/g, '');
      // 空白を整理
      const cleaned = text.replace(/\s+/g, ' ').trim();
      if (cleaned.length > 100) {
        texts.push(cleaned);
      }
    }
    
    // HTMLがなければXBRLを使用
    if (texts.length === 0) {
      for (const file of xbrlFiles.slice(0, 2)) {
        const content = await zip.files[file].async('text');
        const cleaned = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        if (cleaned.length > 100) texts.push(cleaned);
      }
    }
    
    return texts.join('\n---\n').slice(0, 50000);
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
    const prompt = `You are a stock analyst evaluating companies using the Kiyohara Method.

Evaluate the following financial report (annual, semi-annual, or quarterly) and respond with ONLY a JSON object. Do not include any explanation or text outside the JSON.

Criteria:
1. is_owner_company: 1 if owner-managed (founder family, same family name as company name, etc.), 0 otherwise
2. management_score: 1-100 (higher = better management quality)
3. reason: Brief reason in Japanese

Respond with ONLY this JSON format:
{"is_owner_company": 0, "management_score": 50, "reason": "理由"}

Document:
${docText.slice(0, 8000)}`;

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
      console.warn('Raw content:', content.slice(0, 200));
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

  // edinetCode map — dynamically built from EDINET API search results
  const edinetCodeMap = new Map<string, string>();

  // バッチ処理: 1日50銘柄ずつ、6日で全銘柄カバー
  const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '50', 10);
// 選定基準 (Kiyohara-strict)
const MAX_MARKET_CAP = parseInt(process.env.MAX_MARKET_CAP || '2000', 10);
const MAX_PER = parseInt(process.env.MAX_PER || '50', 10);
const MIN_SCORE = parseInt(process.env.MIN_SCORE || '50', 10);
// 監視対象 (Watchlist) — 清原基準から外れても拾う閾値
const WATCH_PER = parseInt(process.env.WATCH_PER || '80', 10);
const WATCH_SCORE = parseInt(process.env.WATCH_SCORE || '10', 10);
// 定量フィルターの緩衝閾値
const REQUIRE_PROFIT = process.env.REQUIRE_PROFIT !== 'false';  // true by default
const SKIP_LOW_GROWTH = process.env.SKIP_LOW_GROWTH !== 'true'; // false by default (don't skip)
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  const batchIndex = BATCH_SIZE === 50 ? (dayOfWeek - 1 + 5) % 5 : 0; // 0-4 for Mon-Fri, 0 for custom batch
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
      await sleep(5000); // J-Quants rate limit: 3 req/min for free tier
      let statements = await jquants.fetchStatements(sym.Code);

      if (statements.length === 0) {
        console.log(`J-Quants 403 for ${sym.Code}, trying EDINET fallback...`);
        const edinetCode = edinetCodeMap.get(sym.Code) || undefined;
        const reports = await edinet.fetchLatestYukashokenReports(sym.Code, sym.CoName, edinetCode);
        if (reports.length > 0) {
          // Cache edinetCode from successful EDINET search
          if (reports[0].edinetCode) edinetCodeMap.set(sym.Code, reports[0].edinetCode);
          const xbrlText = await edinet.fetchDocumentText(reports[0].docID);
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
      if (marketCap > MAX_MARKET_CAP) {
        console.log(`Skip ${sym.Code}: market cap ${marketCap.toFixed(1)}億円 > ${MAX_MARKET_CAP}億円`);
        continue;
      }

      const cash = latest.CashEq || 0;
      const netCash = cash / 1e8;
      const profit = latest.NP || 0;
      if (REQUIRE_PROFIT && profit <= 0) {
        console.log(`Skip ${sym.Code}: no profit`);
        continue;
      }

      const realPER = (marketCap - netCash) / (profit / 1e8);
      if (realPER > MAX_PER || realPER <= 0) {
        console.log(`Skip ${sym.Code}: realPER ${realPER.toFixed(1)} > ${MAX_PER}`);
        continue;
      }

      let salesGrowth = 0;
      let profitGrowth = 0;
      if (statements.length >= 3) {
        const last3 = statements.slice(-3);
        salesGrowth = avgGrowthRate(last3.map((s) => s.Sales));
        profitGrowth = avgGrowthRate(last3.map((s) => s.OP));
        if (SKIP_LOW_GROWTH && (salesGrowth <= 0 || profitGrowth <= 0)) {
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
        fiscalYearEnd: latest.CurPerEn,
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
      const edinetCode = edinetCodeMap.get(stock.code);
      const reports = await edinet.fetchLatestYukashokenReports(stock.code, stock.name, edinetCode, stock.fiscalYearEnd);
      if (reports.length === 0) {
        console.log(`Skip ${stock.code}: no EDINET reports`);
        continue;
      }

      const docText = await edinet.fetchDocumentText(reports[0].docID);
      const evalResult = await openrouter.evaluateCompany(docText);
      evaluated.push({ stock, eval: evalResult });
      console.log(`Evaluated ${stock.code}: owner=${evalResult.is_owner_company}, score=${evalResult.management_score}`);
      
      await sleep(2000);
    } catch (err) {
      console.warn(`LLM evaluation failed for ${stock.code}:`, err);
    }
  }

  console.log(`Step 5 complete: ${evaluated.length} stocks evaluated`);

  console.log('Step 6: Pick選定 (2-Tier)');
  const picks: PickResult[] = [];
  const pickedCodes = new Set<string>();

  // Tier 1: 清原メソッド完全適合
  for (const item of evaluated) {
    if (
      item.eval.is_owner_company &&
      item.eval.management_score >= MIN_SCORE &&
      item.stock.realPER <= MAX_PER &&
      item.stock.realPER > 0
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
        isKiyoharaCompliant: true,
      });
      pickedCodes.add(item.stock.code);
      console.log(`PICK (清原適合): ${item.stock.code} ${item.stock.name}`);
    }
  }

  // Tier 2: 監視対象 (Watchlist) — 清原基準は満たさないが近い
  for (const item of evaluated) {
    if (pickedCodes.has(item.stock.code)) continue;
    if (
      item.eval.management_score >= WATCH_SCORE &&
      item.stock.realPER <= WATCH_PER &&
      item.stock.realPER > 0
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
        isKiyoharaCompliant: false,
      });
      console.log(`PICK (監視): ${item.stock.code} ${item.stock.name} (score=${item.eval.management_score}, PER=${item.stock.realPER.toFixed(1)}, owner=${item.eval.is_owner_company})`);
    }
  }

  console.log(`Step 6 complete: ${picks.length} picks (${picks.filter(p => p.isKiyoharaCompliant).length} 適合, ${picks.filter(p => !p.isKiyoharaCompliant).length} 監視)`);
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
