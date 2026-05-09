#!/usr/bin/env node
/**
 * EDINET secCode形式調査 - 特定日の有報をすべて表示
 */

async function investigateSecCode() {
  const subscriptionKey = process.env.EDINET_SUBSCRIPTION_KEY;
  if (!subscriptionKey) {
    console.error('EDINET_SUBSCRIPTION_KEY not set');
    process.exit(1);
  }

  // 2026-04-30の有報をすべて取得
  const dateStr = '2026-04-30';
  const url = `https://disclosure.edinet-fsa.go.jp/api/v2/documents.json?date=${dateStr}&type=2`;
  
  const res = await fetch(url, {
    headers: { 'Ocp-Apim-Subscription-Key': subscriptionKey },
  });

  if (!res.ok) {
    console.error(`API error: ${res.status}`);
    process.exit(1);
  }

  const data = await res.json() as { results: Array<{ docID: string; filerName: string; secCode: string; edinetCode: string; docDescription: string }> };
  const results = data.results || [];
  
  const yukashoken = results.filter(r => r.docDescription?.includes('有価証券報告書'));
  
  console.log(`Date: ${dateStr}`);
  console.log(`Total documents: ${results.length}`);
  console.log(`Yukashoken reports: ${yukashoken.length}`);
  
  // secCodeの分布を確認
  const secCodeMap = new Map<string, number>();
  for (const doc of yukashoken) {
    secCodeMap.set(doc.secCode, (secCodeMap.get(doc.secCode) || 0) + 1);
  }
  
  console.log('\nsecCode distribution (first 20):');
  const sorted = Array.from(secCodeMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20);
  for (const [code, count] of sorted) {
    console.log(`  ${code}: ${count} reports`);
  }
  
  // ランディックス関連を検索
  console.log('\nSearching for "ランディックス" in filerName:');
  const randix = yukashoken.filter(r => r.filerName?.includes('ランディックス'));
  if (randix.length > 0) {
    for (const doc of randix) {
      console.log(`  secCode=${doc.secCode}, edinetCode=${doc.edinetCode}, filerName=${doc.filerName}`);
    }
  } else {
    console.log('  Not found');
  }
  
  // secCode "2981" を検索
  console.log('\nSearching for secCode "2981":');
  const sec2981 = yukashoken.filter(r => r.secCode === '2981');
  if (sec2981.length > 0) {
    for (const doc of sec2981) {
      console.log(`  filerName=${doc.filerName}, edinetCode=${doc.edinetCode}`);
    }
  } else {
    console.log('  Not found');
  }
  
  // secCode "29810" を検索
  console.log('\nSearching for secCode "29810":');
  const sec29810 = yukashoken.filter(r => r.secCode === '29810');
  if (sec29810.length > 0) {
    for (const doc of sec29810) {
      console.log(`  filerName=${doc.filerName}, edinetCode=${doc.edinetCode}`);
    }
  } else {
    console.log('  Not found');
  }
  
  // 29810のedinetCodeを特定するために、J-Quantsから取得
  console.log('\n--- Checking J-Quants for 29810 ---');
  const jquantsRes = await fetch('https://api.jquants.com/v1/listed?code=29810');
  if (jquantsRes.ok) {
    const jquantsData = await jquantsRes.json() as { info: Array<{ Code: string; EdinetCode: string; CompanyName: string }> };
    if (jquantsData.info && jquantsData.info.length > 0) {
      const info = jquantsData.info[0];
      console.log(`Code: ${info.Code}`);
      console.log(`EdinetCode: ${info.EdinetCode}`);
      console.log(`CompanyName: ${info.CompanyName}`);
    }
  }
}

investigateSecCode().catch(console.error);
