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
  S33?: string;
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
  netCashRatio: number;
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
  netCashRatio: number;
  realPER: number;
  salesGrowth3Y: number;
  profitGrowth3Y: number;
  isOwnerCompany: number;
  managementScore: number;
  latestPrice: number;
  latestTopix: number;
  isKiyoharaCompliant: boolean;
  reason: string;
}

import JSZip from 'jszip';

// ============================================
// ユーティリティ
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractOwnerRelevantSections(docText: string): string {
  const MAX_LEN = 20000;
  const sections: string[] = [];

  // Priority 1: Major shareholders section (most important for ownership)
  const shareholderPatterns = [
    /大株主の状況[\s\S]*?(?=(?:\n\s*(?:第[一二三四五六七八九十\d]|\[|【|\(|[a-zA-Z]{2,}))|$)/,
    /株主の状況[\s\S]*?(?=(?:\n\s*(?:第[一二三四五六七八九十\d]|\[|【|\(|[a-zA-Z]{2,}))|$)/,
    /所有者別状況[\s\S]*?(?=(?:\n\s*(?:第[一二三四五六七八九十\d]|\[|【|\(|[a-zA-Z]{2,}))|$)/,
    /大株主[\s\S]{0,2000}/,
    /主要株主[\s\S]{0,2000}/,
    /上位.*株主[\s\S]{0,2000}/,
  ];
  for (const pattern of shareholderPatterns) {
    const m = docText.match(pattern);
    if (m && m[0].length > 50) {
      sections.push('[大株主の状況]\n' + m[0].slice(0, 5000));
      break;
    }
  }

  // Priority 2: Directors/officers section
  const directorPatterns = [
    /役員の状況[\s\S]*?(?=(?:\n\s*(?:第[一二三四五六七八九十\d]|\[|【|\(|[a-zA-Z]{2,}))|$)/,
    /取締役[\s\S]{0,3000}/,
    /役員一覧[\s\S]{0,3000}/,
    /代表取締役[\s\S]{0,2000}/,
    /執行役員[\s\S]{0,2000}/,
  ];
  for (const pattern of directorPatterns) {
    const m = docText.match(pattern);
    if (m && m[0].length > 50) {
      sections.push('[役員の状況]\n' + m[0].slice(0, 5000));
      break;
    }
  }

  // Priority 3: Corporate governance section
  const govPatterns = [
    /コーポレートガバナンス[\s\S]*?(?=(?:\n\s*(?:第[一二三四五六七八九十\d]|\[|【|\(|[a-zA-Z]{2,}))|$)/,
    /ガバナンス[\s\S]{0,3000}/,
    /コーポレート・ガバナンス[\s\S]{0,3000}/,
  ];
  for (const pattern of govPatterns) {
    const m = docText.match(pattern);
    if (m && m[0].length > 50) {
      sections.push('[コーポレートガバナンス]\n' + m[0].slice(0, 3000));
      break;
    }
  }

  // Priority 4: Company history (for founder info)
  const historyPatterns = [
    /沿革[\s\S]*?(?=(?:\n\s*(?:第[一二三四五六七八九十\d]|\[|【|\(|[a-zA-Z]{2,}))|$)/,
    /会社.*沿革[\s\S]{0,2000}/,
    /設立[\s\S]{0,1000}/,
  ];
  for (const pattern of historyPatterns) {
    const m = docText.match(pattern);
    if (m && m[0].length > 50) {
      sections.push('[沿革]\n' + m[0].slice(0, 2000));
      break;
    }
  }

  if (sections.length === 0) {
    return docText.slice(0, MAX_LEN);
  }

  return sections.join('\n---\n').slice(0, MAX_LEN);
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
// Yahoo Finance データ取得 (yfinance経由、ブロック対策)
// ============================================

async function fetchYfinanceData(codes: string[]): Promise<{ topix: number; stocks: Map<string, any> }> {
  const stocks = new Map<string, any>();
  if (codes.length === 0) return { topix: 0, stocks };
  try {
    const cp = await import('child_process');
    const cmd = `python3 scripts/yfinance_data.py ${codes.join(' ')}`;
    const result = cp.execSync(cmd, { encoding: 'utf-8', timeout: 120000 });
    const data = JSON.parse(result);
    if (data.error) {
      console.warn('yfinance error:', data.error);
      return { topix: 0, stocks };
    }
    for (const s of data.stocks || []) {
      stocks.set(s.code, s);
    }
    console.log(`yfinance: ${stocks.size} stocks, TOPIX=${data.topix}`);
    return { topix: data.topix || 0, stocks };
  } catch (err: any) {
    console.warn('yfinance failed:', err.message || err);
    return { topix: 0, stocks };
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
    .replace(/ホールディングス/g, '')
    .replace(/ＨＤ/g, '')
    .replace(/HD/g, '')
    .replace(/グループ/g, '')
    .replace(/ジャパン/g, '')
    .replace(/Japan/gi, '')
    .replace(/インターナショナル/g, '')
    .replace(/International/gi, '')
    .replace(/[\s　・]/g, '')
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
    // 会社名の先頭2〜3文字も取得（部分一致のフォールバック）
    const namePrefix2 = normalizedName.slice(0, 2);
    const namePrefix3 = normalizedName.slice(0, 3);

    // 粗密探索: 直近は密に、過去は疎に
    // Phase 1: every day for first 60 days (close matches)
    // Phase 2: every 7 days for next 180 days (extended search)
    // Phase 3: every 14 days beyond (rare cases)
    const searchSteps: number[] = [];
    for (let d = 0; d < 60; d++) searchSteps.push(d);
    for (let d = 60; d < 240; d += 7) searchSteps.push(d);
    for (let d = 240; d < 365; d += 14) searchSteps.push(d);

    for (const daysBack of searchSteps) {
      const date = new Date(today);
      date.setDate(date.getDate() - daysBack);
      const dateStr = formatDate(date);
      const url = `${this.baseUrl}/documents.json?date=${dateStr}&type=2`;

      try {
        const res = await fetch(url, { headers });
        if (!res.ok) continue;

        const data = await res.json() as { results?: Array<{ docID: string; submitDateTime: string; filerName: string; docDescription: string; edinetCode: string; secCode: string }> };
        const results = data.results || [];
        if (results.length === 0) continue;

        const reports = results.filter((r) => {
          const d = r.docDescription || '';
          // 有価証券報告書・半期・四半期 に加え、決算短信や有報も拾う
          const isFinancial = d.includes('有価証券報告書') || d.includes('有報')
            || d.includes('半期報告書') || d.includes('四半期報告書')
            || d.includes('決算短信') || d.includes('臨時報告書');
          if (!isFinancial) return false;
          // Match by edinetCode (exact)
          if (edinetCode && r.edinetCode === edinetCode) return true;
          // Match by secCode
          if (r.secCode && (r.secCode === secCode || r.secCode === secCode4)) return true;
          // Match by filerName
          if (r.filerName) {
            const filerNorm = normalizeCompanyName(r.filerName);
            // 完全一致
            if (normalizedName && filerNorm === normalizedName) return true;
            // 相互包含
            if (normalizedName && (filerNorm.includes(normalizedName) || normalizedName.includes(filerNorm))) return true;
            // 先頭2〜3文字一致（短い会社名対策）
            if (namePrefix2.length >= 2 && filerNorm.startsWith(namePrefix2)) return true;
            // EDINET filerNameが元の会社名を含むか
            if (companyName && r.filerName.includes(companyName)) return true;
          }
          return false;
        });

        if (reports.length > 0) return reports.slice(0, 5);
      } catch {
        // ネットワークエラーは無視して翌日へ
      }

      // EDINET search sleep removed for speed
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
    // Extract relevant sections for owner company analysis
    const relevantText = extractOwnerRelevantSections(docText);

    const prompt = `You are a stock analyst evaluating Japanese companies. You are given text extracted from a company's annual securities report (有価証券報告書) filed with EDINET.

Evaluate the company and respond with ONLY a JSON object. Do not include any explanation or text outside the JSON.

Criteria:
1. is_owner_company: 1 if the founder or founding family still holds significant management control (CEO, Chairman, or Representative Director) AND/OR holds a large ownership stake (appears as a major shareholder with significant percentage). Look for indicators like:
   - Founder listed as 代表取締役社長、会長、執行役員
   - Founder/family as top shareholders (>10% stake)
   - Company history (沿革) section referencing founder's ongoing involvement
   - CEO personally holds a large number of shares
   - Family members in key management positions
   Set to 0 if the company appears to be a subsidiary, professionally managed, or if founder/family has no significant remaining stake.

2. management_score: 1-100, where:
   - 80-100: Excellent management with clear strategy, strong governance, long track record
   - 60-80: Good management, reasonable governance, stable trajectory
   - 40-60: Average management, no particular strengths or weaknesses
   - 20-40: Below average, some governance concerns
   - 1-20: Poor management, red flags

3. reason: Brief reason in Japanese (2-3 sentences). For is_owner_company, cite specific evidence (e.g., founder name, shareholding percentage, family involvement). For management_score, cite specific strengths or weaknesses found in the report.

Respond with ONLY this JSON format:
{"is_owner_company": 0, "management_score": 50, "reason": "理由"}

Document text:
${relevantText}`;

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
  const edinet = new EdinetClient(edinetSubscriptionKey);
  const openrouter = new OpenRouterClient(openrouterApiKey);

  console.log('Step 1: 銘柄マスター取得');
  const symbols = await jquants.fetchAllSymbols();
  const ALL_MARKETS = process.env.ALL_MARKETS === 'true';
  const TARGET_MARKETS = ALL_MARKETS
    ? ['0111', '0112', '0113', '0115'] // Prime, Standard, Growth, JASDAQ
    : ['0113'];                         // Growth only (default)

  // 除外業種（S33コード）：銀行・証券・保険・電力など財務構造が特殊な業種
  const EXCLUDED_S33 = new Set(['7050', '7100', '7200', '4050', '6050', '1050']);

  const targetSymbols = symbols.filter((s) => {
    if (!TARGET_MARKETS.includes(s.Mkt || '')) return false;
    // 業種フィルタ：金融・電力等を除外
    if (s.S33 && EXCLUDED_S33.has(s.S33)) return false;
    const codeWithoutTrailingZero = (s.Code || '').replace(/0$/, '');
    return /^\d{4}$/.test(codeWithoutTrailingZero);
  });
  console.log(`Target: ${targetSymbols.length} stocks (${TARGET_MARKETS.join(',')})`);

  // edinetCode map — dynamically built from EDINET API search results
  const edinetCodeMap = new Map<string, string>();

  // バッチ処理: ALL_MARKETS有効時はカバレッジが広いためバッチ数を増やす
  const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '50', 10);
  const TOTAL_BATCHES = ALL_MARKETS ? 12 : 5; // 全市場の場合は12バッチ(3倍)に分割
// 選定基準 — 清原達郎『わが投資術』に基づくスコア制
// 本には一律閾値が明記されていないため、スコア制に変更
const MIN_QUANT_SCORE = parseInt(process.env.MIN_QUANT_SCORE || '20', 10); // 定量スコア最低ライン
const MIN_SCORE = parseInt(process.env.MIN_SCORE || '40', 10);  // 適合の総合スコア下限
const WATCH_SCORE = parseInt(process.env.WATCH_SCORE || '10', 10); // 監視対象スコア下限
const REQUIRE_PROFIT = process.env.REQUIRE_PROFIT !== 'false';
const SKIP_LOW_GROWTH = process.env.SKIP_LOW_GROWTH !== 'false';

function computeQuantScore(marketCap: number, realPER: number, ncRatio: number, pbr: number): number {
  let score = 0;
  // PER: 低いほど高得点。本では5倍,8倍,13倍が好例
  if (realPER > 0 && realPER <= 5) score += 35;
  else if (realPER > 5 && realPER <= 10) score += 25;
  else if (realPER > 10 && realPER <= 15) score += 15;
  else if (realPER > 15 && realPER <= 25) score += 8;
  else if (realPER > 25 && realPER <= 40) score += 3;
  // 赤字は0点（PER計算不可）

  // PBR: 1倍以下が好ましい
  if (pbr > 0 && pbr <= 0.5) score += 25;
  else if (pbr > 0.5 && pbr <= 0.8) score += 20;
  else if (pbr > 0.8 && pbr <= 1.0) score += 15;
  else if (pbr > 1.0 && pbr <= 1.5) score += 5;
  // PBR > 1.5 or unknown: 0

  // ネットキャッシュ比率: 高いほど高得点
  if (ncRatio >= 1.0) score += 25;
  else if (ncRatio >= 0.5) score += 18;
  else if (ncRatio >= 0.2) score += 10;
  else if (ncRatio > 0) score += 5;
  // negative: 0

  // 小型株ボーナス
  if (marketCap <= 100) score += 15;
  else if (marketCap <= 270) score += 10;
  else if (marketCap <= 500) score += 5;

  return score; // 満点=100
}
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  const batchIndexFromEnv = process.env.BATCH_INDEX;
  const batchIndex = batchIndexFromEnv
    ? parseInt(batchIndexFromEnv, 10)
    : (BATCH_SIZE === 50 ? (dayOfWeek - 1 + TOTAL_BATCHES) % TOTAL_BATCHES : 0);
  const startIdx = batchIndex * BATCH_SIZE;
  const endIdx = Math.min(startIdx + BATCH_SIZE, targetSymbols.length);
  const batchSymbols = targetSymbols.slice(startIdx, endIdx);
  console.log(`Batch ${batchIndex + 1}/${TOTAL_BATCHES}: processing stocks ${startIdx + 1}-${endIdx} of ${targetSymbols.length}`);

  // Step 2: Yahoo Finance データ (yfinance経由、株価・TOPIX・BSを一括取得)
  console.log('Step 2: Yahoo Finance (yfinance)');
  const batchCodes = batchSymbols.map((s) => s.Code);
  const { topix, stocks: yfData } = await fetchYfinanceData(batchCodes);
  console.log(`Fetched: ${yfData.size} stocks, TOPIX=${topix}`);

  console.log('Step 3: J-Quants 財務データ & スクリーニング');
  const screened: QuantScreenedStock[] = [];

  for (const sym of batchSymbols) {
    const yf = yfData.get(sym.Code);
    if (!yf || yf.error || !yf.price) {
      if (yf?.error) console.log(`Skip ${sym.Code}: yfinance error`);
      else console.log(`Skip ${sym.Code}: no price data`);
      continue;
    }

    try {
      await sleep(3000); // J-Quants rate limit: 3 req/min for free tier
      let statements = await jquants.fetchStatements(sym.Code);

      if (statements.length === 0) {
        console.log(`Skip ${sym.Code}: no J-Quants financial data`);
        continue;
      }

      const latest = statements[statements.length - 1];
      const shares = (latest.ShOutFY || yf.shares || 0);
      if (shares <= 0) {
        console.log(`Skip ${sym.Code}: no shares outstanding`);
        continue;
      }

      // Use yfinance market cap if available, fallback to price*shares
      const marketCap = yf.market_cap > 0
        ? yf.market_cap / 1e8
        : (yf.price * (latest.ShOutFY || yf.shares || 0)) / 1e8;

      const profit = latest.NP || 0;
      if (REQUIRE_PROFIT && profit <= 0) {
        console.log(`Skip ${sym.Code}: no profit`);
        continue;
      }

      // 実質PER — 本の基準に従い、ネットキャッシュ比率が使えるならそちらも考慮
      const netCashFromBS = yf.net_cash > 0 ? yf.net_cash / 1e8 : 0;
      const netCashRatioFromBS = yf.net_cash_ratio || 0;
      const netCash = netCashFromBS > 0 ? netCashFromBS : ((latest.CashEq || 0) / 1e8);
      const realPER = profit > 0 ? (marketCap - netCash) / (profit / 1e8) : 0;

      // 清原スコア計算（閾値制 → スコア制に変更。本に一律閾値なし）
      const pbr = yf.pbr || 0;
      const quantScore = computeQuantScore(marketCap, realPER, netCashRatioFromBS, pbr);

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

      if (quantScore < MIN_QUANT_SCORE) {
        console.log(`Skip ${sym.Code}: quant score ${quantScore} < ${MIN_QUANT_SCORE}`);
        continue;
      }

      screened.push({
        code: sym.Code,
        name: sym.CoName,
        marketCap,
        netCash,
        netCashRatio: netCashRatioFromBS,
        realPER,
        salesGrowth3Y: salesGrowth,
        profitGrowth3Y: profitGrowth,
        latestPrice: yf.price,
        latestTopix: topix ?? 0,
        fiscalYearEnd: latest.CurPerEn,
      });

      console.log(`PASS: ${sym.Code} ${sym.CoName} cap=${marketCap.toFixed(0)}億 PER=${realPER.toFixed(1)} nc=${(netCashRatioFromBS*100).toFixed(0)}% pbr=${pbr.toFixed(1)} score=${quantScore}`);
    } catch (err) {
      console.warn(`Screening failed for ${sym.Code}:`, err);
    }
  }

  console.log(`Step 3 complete: ${screened.length} stocks passed`);

  console.log('Step 4: LLM評価');
  const evaluated: Array<{ stock: QuantScreenedStock; eval: LlmEvaluation }> = [];

  for (const stock of screened) {
    try {
      const edinetCode = edinetCodeMap.get(stock.code);
      const reports = await edinet.fetchLatestYukashokenReports(stock.code, stock.name, edinetCode, stock.fiscalYearEnd);
      if (reports.length === 0) {
        console.log(`Skip ${stock.code}: no EDINET reports (saving quantitative data only)`);
        // Save without LLM evaluation — quantitative data still valuable
        evaluated.push({
          stock,
          eval: { is_owner_company: 0, management_score: 0, reason: 'EDINET報告書が見つかりませんでした。定量的なネットキャッシュ比率・PER等は有効です。' },
        });
        continue;
      }

      // Skip correction reports (訂正報告書) — don't contain management info
      const primaryReport = reports.find((r: EdinetDocument) => !r.docDescription?.includes('訂正')) || reports[0];

      const docText = await edinet.fetchDocumentText(primaryReport.docID);
      const evalResult = await openrouter.evaluateCompany(docText);
      evaluated.push({ stock, eval: evalResult });
      console.log(`Evaluated ${stock.code}: owner=${evalResult.is_owner_company}, score=${evalResult.management_score}`);
      
      await sleep(500);
    } catch (err) {
      console.warn(`LLM evaluation failed for ${stock.code}:`, err);
    }
  }

  console.log(`Step 5 complete: ${evaluated.length} stocks evaluated`);

  console.log('Step 6: Pick選定 (2-Tier)');
  const picks: PickResult[] = [];
  const pickedCodes = new Set<string>();

  // Tier 1: 清原メソッド完全適合（定量スコア通過済 + LLM評価）
  for (const item of evaluated) {
    const combinedScore = item.eval.management_score; // LLMの定性評価
    if (
      item.eval.is_owner_company &&
      combinedScore >= MIN_SCORE
    ) {
      picks.push({
        code: item.stock.code,
        name: item.stock.name,
        marketCap: item.stock.marketCap,
        netCash: item.stock.netCash,
        netCashRatio: item.stock.netCashRatio,
        realPER: item.stock.realPER,
        salesGrowth3Y: item.stock.salesGrowth3Y,
        profitGrowth3Y: item.stock.profitGrowth3Y,
        isOwnerCompany: item.eval.is_owner_company,
        managementScore: item.eval.management_score,
        latestPrice: item.stock.latestPrice,
        latestTopix: item.stock.latestTopix,
        isKiyoharaCompliant: true,
        reason: item.eval.reason,
      });
      pickedCodes.add(item.stock.code);
      console.log(`PICK (清原適合): ${item.stock.code} ${item.stock.name}`);
    }
  }

  // Tier 2: 監視対象 (Watchlist)
  for (const item of evaluated) {
    if (pickedCodes.has(item.stock.code)) continue;
    if (item.eval.management_score >= WATCH_SCORE) {
      picks.push({
        code: item.stock.code,
        name: item.stock.name,
        marketCap: item.stock.marketCap,
        netCash: item.stock.netCash,
        netCashRatio: item.stock.netCashRatio,
        realPER: item.stock.realPER,
        salesGrowth3Y: item.stock.salesGrowth3Y,
        profitGrowth3Y: item.stock.profitGrowth3Y,
        isOwnerCompany: item.eval.is_owner_company,
        managementScore: item.eval.management_score,
        latestPrice: item.stock.latestPrice,
        latestTopix: item.stock.latestTopix,
        isKiyoharaCompliant: false,
        reason: item.eval.reason,
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
