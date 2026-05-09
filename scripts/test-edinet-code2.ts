#!/usr/bin/env node
/**
 * edinetCodeマッチング検証 - ハードコードedinetCodeでテスト
 */

async function testEdinetCodeMatching() {
  const subscriptionKey = process.env.EDINET_SUBSCRIPTION_KEY;
  
  if (!subscriptionKey) {
    console.error('Missing EDINET_SUBSCRIPTION_KEY');
    process.exit(1);
  }

  // テスト銘柄: 29810 ランディックス (edinetCode: E05773)
  const testCases = [
    { code: '29810', name: 'ランディックス', edinetCode: 'E05773' },
    { code: '34770', name: 'フォーライフ', edinetCode: 'E05998' },
  ];

  for (const tc of testCases) {
    console.log(`\n=== Testing ${tc.code} ${tc.name} (edinetCode: ${tc.edinetCode}) ===`);
    
    const today = new Date();
    let found = false;
    
    // 最近120日をテスト（5日おき）
    for (let daysBack = 0; daysBack <= 120; daysBack += 5) {
      const date = new Date(today);
      date.setDate(date.getDate() - daysBack);
      const dateStr = date.toISOString().slice(0, 10);
      
      const url = `https://disclosure.edinet-fsa.go.jp/api/v2/documents.json?date=${dateStr}&type=2`;
      const res = await fetch(url, {
        headers: { 'Ocp-Apim-Subscription-Key': subscriptionKey },
      });
      
      if (!res.ok) continue;
      
      const data = await res.json() as { results: Array<{ docID: string; filerName: string; secCode: string; edinetCode: string; docDescription: string }> };
      const results = data.results || [];
      
      const match = results.find(r => r.edinetCode === tc.edinetCode && r.docDescription?.includes('有価証券報告書'));
      if (match) {
        console.log(`FOUND on ${dateStr} (${daysBack} days ago):`);
        console.log(`  docID: ${match.docID}`);
        console.log(`  filerName: ${match.filerName}`);
        console.log(`  edinetCode: ${match.edinetCode}`);
        console.log(`  secCode: ${match.secCode}`);
        console.log(`  docDescription: ${match.docDescription}`);
        found = true;
        break;
      }
    }
    
    if (!found) {
      console.log('NOT FOUND in 120 days');
    }
  }
}

testEdinetCodeMatching().catch(console.error);
