#!/usr/bin/env node
/**
 * EDINET検索デバッグスクリプト
 * 使い方: npx tsx scripts/debug-edinet-search.ts [secCode] [companyName]
 */

const secCode = process.argv[2] || '29810';
const companyName = process.argv[3] || '';
const subscriptionKey = process.env.EDINET_SUBSCRIPTION_KEY;

if (!subscriptionKey) {
  console.error('EDINET_SUBSCRIPTION_KEY environment variable is required');
  process.exit(1);
}

async function searchEdinet() {
  const baseUrl = 'https://disclosure.edinet-fsa.go.jp/api/v2';
  const today = new Date();
  
  console.log(`Searching for: secCode=${secCode}, companyName=${companyName}`);
  console.log(`Date range: ${today.toISOString().slice(0, 10)} to 60 days back`);
  
  for (let daysBack = 0; daysBack < 60; daysBack++) {
    const date = new Date(today);
    date.setDate(date.getDate() - daysBack);
    const dateStr = date.toISOString().slice(0, 10);
    
    const url = `${baseUrl}/documents.json?date=${dateStr}&type=2`;
    const res = await fetch(url, {
      headers: { 'Ocp-Apim-Subscription-Key': subscriptionKey },
    });
    
    if (!res.ok) {
      console.log(`Day ${daysBack}: API error ${res.status}`);
      continue;
    }
    
    const data = await res.json() as { results: Array<any> };
    const results = data.results || [];
    
    // Filter by secCode or companyName
    const matches = results.filter((doc) => {
      const matchSec = doc.secCode === secCode;
      const matchName = companyName && doc.filerName?.includes(companyName);
      return matchSec || matchName;
    });
    
    if (matches.length > 0) {
      console.log(`\nDay ${daysBack} (${dateStr}): Found ${matches.length} matches`);
      for (const doc of matches) {
        console.log(`  docId: ${doc.docID}`);
        console.log(`  secCode: ${doc.secCode}`);
        console.log(`  edinetCode: ${doc.edinetCode}`);
        console.log(`  filerName: ${doc.filerName}`);
        console.log(`  docDescription: ${doc.docDescription}`);
        console.log(`  submitDateTime: ${doc.submitDateTime}`);
        console.log('  ---');
      }
      return;
    }
    
    // Also show all yukashoken reports on this day for reference
    const yukashoken = results.filter((d) => d.docDescription?.includes('有価証券報告書'));
    if (yukashoken.length > 0 && daysBack < 5) {
      console.log(`Day ${daysBack} (${dateStr}): ${yukashoken.length} yukashoken reports (showing first 3)`);
      for (const doc of yukashoken.slice(0, 3)) {
        console.log(`  secCode=${doc.secCode}, filerName=${doc.filerName}`);
      }
    }
    
    if (daysBack % 10 === 0 && daysBack > 0) {
      console.log(`Checked ${daysBack} days...`);
    }
  }
  
  console.log('\nNo matches found in 60 days');
}

searchEdinet();
