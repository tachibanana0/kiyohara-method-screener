#!/usr/bin/env node
/**
 * EDINET APIレスポンスの生データ確認
 */

async function checkRawResponse() {
  const subscriptionKey = process.env.EDINET_SUBSCRIPTION_KEY;
  
  if (!subscriptionKey) {
    console.error('Missing EDINET_SUBSCRIPTION_KEY');
    process.exit(1);
  }

  const dateStr = '2026-04-30';
  const url = `https://disclosure.edinet-fsa.go.jp/api/v2/documents.json?date=${dateStr}&type=2`;
  
  const res = await fetch(url, {
    headers: { 'Ocp-Apim-Subscription-Key': subscriptionKey },
  });
  
  const data = await res.json() as { results: Array<Record<string, unknown>> };
  const results = data.results || [];
  
  console.log(`Date: ${dateStr}`);
  console.log(`Total results: ${results.length}`);
  
  if (results.length > 0) {
    console.log('\nFirst result keys:');
    console.log(Object.keys(results[0]));
    
    console.log('\nFirst 3 results (selected fields):');
    for (const r of results.slice(0, 3)) {
      console.log(`  docID: ${r.docID}`);
      console.log(`  edinetCode: ${r.edinetCode}`);
      console.log(`  secCode: ${r.secCode}`);
      console.log(`  filerName: ${r.filerName}`);
      console.log(`  docDescription: ${r.docDescription}`);
      console.log('  ---');
    }
  }
}

checkRawResponse().catch(console.error);
