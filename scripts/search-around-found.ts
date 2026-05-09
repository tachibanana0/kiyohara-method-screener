#!/usr/bin/env node
/**
 * 有報が見つかった日の周辺を詳しく検索
 */

async function searchAroundFoundDate() {
  const subscriptionKey = process.env.EDINET_SUBSCRIPTION_KEY;
  
  if (!subscriptionKey) {
    console.error('Missing EDINET_SUBSCRIPTION_KEY');
    process.exit(1);
  }

  const testCases = [
    { name: 'ランディックス', edinetCode: 'E35303', foundDate: '2025-11-11' },
    { name: 'フォーライフ', edinetCode: 'E32793', foundDate: '2025-11-17' },
  ];

  for (const tc of testCases) {
    console.log(`\n=== Searching around ${tc.foundDate} for ${tc.name} ===`);
    
    // 見つかった日の前後10日を検索
    const baseDate = new Date(tc.foundDate);
    for (let dayOffset = -10; dayOffset <= 10; dayOffset++) {
      const date = new Date(baseDate);
      date.setDate(date.getDate() + dayOffset);
      const dateStr = date.toISOString().slice(0, 10);
      
      const url = `https://disclosure.edinet-fsa.go.jp/api/v2/documents.json?date=${dateStr}&type=2`;
      const res = await fetch(url, {
        headers: { 'Ocp-Apim-Subscription-Key': subscriptionKey },
      });
      
      if (!res.ok) continue;
      
      const data = await res.json() as { results: Array<{ docID: string; edinetCode: string; filerName: string; docDescription: string }> };
      const results = data.results || [];
      
      const match = results.find(r => r.edinetCode === tc.edinetCode);
      if (match) {
        console.log(`${dateStr}: FOUND - ${match.docDescription} (edinetCode: ${match.edinetCode})`);
      }
    }
  }
}

searchAroundFoundDate().catch(console.error);
