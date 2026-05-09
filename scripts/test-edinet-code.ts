#!/usr/bin/env node
/**
 * edinetCodeマッチングの検証
 */

async function testEdinetCodeMatching() {
  const subscriptionKey = process.env.EDINET_SUBSCRIPTION_KEY;
  const jquantsApiKey = process.env.JQUANTS_API_KEY;
  
  if (!subscriptionKey || !jquantsApiKey) {
    console.error('Missing env vars');
    process.exit(1);
  }

  // テスト銘柄: 29810 ランディックス
  const testCode = '29810';
  
  console.log(`=== Testing ${testCode} ===`);
  
  // Step 1: J-QuantsからedinetCode取得
  console.log('\nStep 1: Fetch edinetCode from J-Quants...');
  const jquantsUrl = `https://api.jquants.com/v1/listed?code=${testCode}`;
  const jquantsRes = await fetch(jquantsUrl, {
    headers: { 'x-api-key': jquantsApiKey },
  });
  
  if (!jquantsRes.ok) {
    console.error(`J-Quants error: ${jquantsRes.status}`);
    process.exit(1);
  }
  
  const jquantsData = await jquantsRes.json() as { info: Array<{ Code: string; EdinetCode: string; CompanyName: string }> };
  console.log('J-Quants response:', JSON.stringify(jquantsData.info?.[0], null, 2));
  
  const edinetCode = jquantsData.info?.[0]?.EdinetCode;
  if (!edinetCode) {
    console.error('No edinetCode found');
    process.exit(1);
  }
  console.log(`edinetCode: ${edinetCode}`);
  
  // Step 2: EDINETでedinetCodeを使って検索
  console.log('\nStep 2: Search EDINET with edinetCode...');
  
  const today = new Date();
  let found = false;
  
  // 最近120日をテスト（高速化のため5日おき）
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
    
    const match = results.find(r => r.edinetCode === edinetCode && r.docDescription?.includes('有価証券報告書'));
    if (match) {
      console.log(`\nFOUND on ${dateStr} (${daysBack} days ago):`);
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
    console.log('\nNOT FOUND: No reports matched edinetCode in 120 days');
  }
}

testEdinetCodeMatching().catch(console.error);
