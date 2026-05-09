#!/usr/bin/env node
/**
 * EDINETで会社名検索して正しいedinetCodeと決算期を確認
 */

async function searchByCompanyName() {
  const subscriptionKey = process.env.EDINET_SUBSCRIPTION_KEY;
  
  if (!subscriptionKey) {
    console.error('Missing EDINET_SUBSCRIPTION_KEY');
    process.exit(1);
  }

  // 会社名で検索
  const companyNames = ['ランディックス', 'フォーライフ'];
  const today = new Date();
  
  for (const name of companyNames) {
    console.log(`\n=== Searching for "${name}" ===`);
    let found = false;
    
    // 最近180日を1日ずつ検索
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
      
      const match = results.find(r => r.filerName?.includes(name));
      if (match) {
        console.log(`FOUND on ${dateStr} (${daysBack} days ago):`);
        console.log(`  docID: ${match.docID}`);
        console.log(`  filerName: ${match.filerName}`);
        console.log(`  edinetCode: ${match.edinetCode}`);
        console.log(`  docDescription: ${match.docDescription}`);
        found = true;
        break;
      }
    }
    
    if (!found) {
      console.log('NOT FOUND in 180 days');
    }
  }
}

searchByCompanyName().catch(console.error);
