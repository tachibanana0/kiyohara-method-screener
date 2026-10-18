#!/usr/bin/env node
/**
 * edinet_mappings 構築バッチ
 *
 * EDINET 日次書類一覧 API (api.edinet-fsa.go.jp) の各日のレスポンスには
 * secCode + edinetCode ペアが含まれる。過去 N 日分を走査して
 * (J-Quants 5桁コード → edinetCode) マッピングを Worker D1 に蓄積する。
 *
 * 使い方 (GitHub Actions 手動実行 or 定期実行):
 *   npx tsx scripts/build-edinet-mappings.ts
 *
 * 環境変数:
 * - EDINET_SUBSCRIPTION_KEY: EDINET API キー
 * - SCREENING_API_URL: Worker API ベース URL
 * - SCREENING_API_TOKEN: Worker 認証トークン
 * - MAPPING_DAYS: 走査日数 (デフォルト 370 — 有報は提出義務から過去1年以内に必ず出る)
 */

interface EdinetDoc {
  docID: string;
  edinetCode: string;
  secCode: string | null;
  filerName: string;
  docDescription: string;
}

const BASE = 'https://api.edinet-fsa.go.jp/api/v2';
const REPORT_KEYWORDS = ['有価証券報告書', '半期報告書', '四半期報告書'];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const subscriptionKey = process.env.EDINET_SUBSCRIPTION_KEY;
  const apiUrl = process.env.SCREENING_API_URL;
  const token = process.env.SCREENING_API_TOKEN;
  if (!subscriptionKey || !apiUrl || !token) {
    throw new Error('Missing EDINET_SUBSCRIPTION_KEY / SCREENING_API_URL / SCREENING_API_TOKEN');
  }

  const days = parseInt(process.env.MAPPING_DAYS || '370', 10);
  const headers = { 'Ocp-Apim-Subscription-Key': subscriptionKey };

  // code(5桁) → { edinetCode, companyName }。同一コードで複数書類が出ても edinetCode は同一。
  const mappings = new Map<string, { edinetCode: string; companyName: string }>();
  let wafBlocked = false;

  for (let d = 0; d < days; d++) {
    const date = new Date();
    date.setDate(date.getDate() - d);
    const dateStr = date.toISOString().slice(0, 10);
    const url = `${BASE}/documents.json?date=${dateStr}&type=2`;

    try {
      const res = await fetch(url, { headers });
      if (!res.ok) continue;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('json')) {
        if (!wafBlocked) {
          wafBlocked = true;
          console.warn('EDINET: non-JSON response (WAF?). Aborting sweep.');
        }
        break;
      }
      const data = await res.json() as { results?: EdinetDoc[] };
      for (const r of data.results || []) {
        const isReport = REPORT_KEYWORDS.some((k) => (r.docDescription || '').includes(k));
        if (!isReport || !r.secCode || !r.edinetCode || r.edinetCode.startsWith('E') === false) continue;
        if (!mappings.has(r.secCode)) {
          mappings.set(r.secCode, { edinetCode: r.edinetCode, companyName: r.filerName });
        }
      }
    } catch {
      // 1 日分の失敗は無視して継続
    }
    if (d > 0 && d % 30 === 0) {
      console.log(`Day ${d}/${days}: ${mappings.size} mappings`);
    }
    await sleep(200);
  }

  console.log(`Sweep complete: ${mappings.size} unique secCodes`);

  // Worker へ一括 POST (100 件ずつ)
  const CHUNK = 100;
  const all = [...mappings.entries()].map(([code, v]) => ({
    code,
    edinetCode: v.edinetCode,
    companyName: v.companyName,
  }));
  for (let i = 0; i < all.length; i += CHUNK) {
    const chunk = all.slice(i, i + CHUNK);
    const res = await fetch(`${apiUrl}/api/edinet-mappings/receive`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Screening-Token': token,
      },
      body: JSON.stringify({ mappings: chunk }),
    });
    if (!res.ok) {
      throw new Error(`Worker API error: ${res.status}`);
    }
    const result = await res.json() as { saved: number };
    console.log(`Saved ${result.saved} mappings (chunk ${i / CHUNK + 1}/${Math.ceil(all.length / CHUNK)})`);
  }

  console.log('=== edinet_mappings build complete ===');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
