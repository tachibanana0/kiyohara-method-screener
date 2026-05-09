#!/usr/bin/env node
/**
 * EDINET検索デバッグ - 単一銘柄で高速テスト
 */

const today = new Date();

// テスト対象: 29810 ランディックス（前回0-120日で成功）
const testCases = [
  {
    code: '29810',
    name: 'ランディックス株式会社',
    fiscalYearEnd: '2025-12-31',
    secCode: '2981',
  },
];

async function testEdinetSearch() {
  const subscriptionKey = process.env.EDINET_SUBSCRIPTION_KEY;
  if (!subscriptionKey) {
    console.error('EDINET_SUBSCRIPTION_KEY not set');
    process.exit(1);
  }

  for (const tc of testCases) {
    console.log(`\n=== Testing ${tc.code} ${tc.name} ===`);
    
    // 決算期から検索期間を計算
    const fyEnd = new Date(tc.fiscalYearEnd);
    const filingDeadline = new Date(fyEnd);
    filingDeadline.setMonth(filingDeadline.getMonth() + 3);
    const searchEnd = new Date(filingDeadline);
    searchEnd.setDate(searchEnd.getDate() + 30);

    const todayTime = today.getTime();
    const fyEndTime = fyEnd.getTime();
    const searchEndTime = searchEnd.getTime();

    const searchStartDays = Math.max(0, Math.floor((todayTime - searchEndTime) / (1000 * 60 * 60 * 24)));
    const searchEndDays = Math.max(60, Math.floor((todayTime - fyEndTime) / (1000 * 60 * 60 * 24)));

    console.log(`Fiscal Year End: ${tc.fiscalYearEnd}`);
    console.log(`Filing Deadline: ${filingDeadline.toISOString().slice(0, 10)}`);
    console.log(`Search End (with buffer): ${searchEnd.toISOString().slice(0, 10)}`);
    console.log(`Search window: ${searchStartDays} - ${searchEndDays} days back`);
    console.log(`Date range: ${new Date(today.getTime() - searchStartDays * 86400000).toISOString().slice(0, 10)} to ${new Date(today.getTime() - searchEndDays * 86400000).toISOString().slice(0, 10)}`);

    // 前回の0-120日ウィンドウもテスト
    console.log(`\n--- Previous window (0-120 days) ---`);
    console.log(`Date range: ${new Date(today.getTime() - 0 * 86400000).toISOString().slice(0, 10)} to ${new Date(today.getTime() - 120 * 86400000).toISOString().slice(0, 10)}`);

    // 数日でテスト（高速）
    console.log(`\n--- Testing specific dates ---`);
    
    const testDates = [
      today.getTime() - searchStartDays * 86400000,
      today.getTime() - (searchStartDays + 10) * 86400000,
      today.getTime() - 60 * 86400000,
      today.getTime() - 100 * 86400000,
      today.getTime() - 120 * 86400000,
    ];

    for (const ts of testDates) {
      const dateStr = new Date(ts).toISOString().slice(0, 10);
      const url = `https://disclosure.edinet-fsa.go.jp/api/v2/documents.json?date=${dateStr}&type=2`;
      
      const res = await fetch(url, {
        headers: { 'Ocp-Apim-Subscription-Key': subscriptionKey },
      });

      if (!res.ok) {
        console.log(`${dateStr}: API error ${res.status}`);
        continue;
      }

      const data = await res.json() as { results: Array<{ docID: string; filerName: string; secCode: string; edinetCode: string; docDescription: string }> };
      const results = data.results || [];
      
      const yukashoken = results.filter(r => r.docDescription?.includes('有価証券報告書'));
      const matchSec = yukashoken.filter(r => r.secCode === tc.code || r.secCode === tc.secCode);
      const matchName = yukashoken.filter(r => r.filerName?.includes('ランディックス'));

      console.log(`${dateStr}: ${results.length} total, ${yukashoken.length} yukashoken, ${matchSec.length} secCode match, ${matchName.length} name match`);
      
      if (matchSec.length > 0) {
        console.log(`  secCode matches: ${matchSec.map(r => `${r.secCode} ${r.filerName}`).join(', ')}`);
      }
      if (matchName.length > 0) {
        console.log(`  Name matches: ${matchName.map(r => `${r.secCode} ${r.filerName}`).join(', ')}`);
      }
    }
  }
}

testEdinetSearch().catch(console.error);
