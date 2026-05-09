#!/usr/bin/env node
/**
 * EDINETで特定edinetCodeの有報提出日を探す
 */

async function findReportDates() {
  const subscriptionKey = process.env.EDINET_SUBSCRIPTION_KEY;
  
  if (!subscriptionKey) {
    console.error('Missing EDINET_SUBSCRIPTION_KEY');
    process.exit(1);
  }

  const targetCodes = ['E05773', 'E05998']; // ランディックス, フォーライフ
  const today = new Date();
  
  for (const targetCode of targetCodes) {
    console.log(`\n=== Searching for ${targetCode} ===`);
    let found = false;
    
    // 1日ずつ検索（最大180日）
    for (let daysBack = 0; daysBack <= 180; daysBack++) {
      const date = new Date(today);
      date.setDate(date.getDate() - daysBack);
      const dateStr = date.toISOString().slice(0, 10);
      
      const url = `https://disclosure.edinet-fsa.go.jp/api/v2/documents.json?date=${dateStr}&type=2`;
      const res = await fetch(url, {
        headers: { 'Ocp-Apim-Subscription-Key': subscriptionKey },
      });
      
      if (!res.ok) continue;
      
      const data = await res.json() as { results: Array<{ docID: string; edinetCode: string; filerName: string; docDescription: string }> };
      const results = data.results || [];
      
      const match = results.find(r => r.edinetCode === targetCode && r.docDescription?.includes('有価証券報告書'));
      if (match) {
        console.log(`FOUND on ${dateStr} (${daysBack} days ago):`);
        console.log(`  docID: ${match.docID}`);
        console.log(`  filerName: ${match.filerName}`);
        console.log(`  edinetCode: ${match.edinetCode}`);
        console.log(`  docDescription: ${match.docDescription}`);
        found = true;
        break;
      }
      
      // 進捗表示（10日ごと）
      if (daysBack % 30 === 0 && daysBack > 0) {
        console.log(`  Searched ${daysBack} days...`);
      }
    }
    
    if (!found) {
      console.log('NOT FOUND in 180 days');
    }
  }
}

findReportDates().catch(console.error);
