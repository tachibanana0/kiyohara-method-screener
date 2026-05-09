#!/usr/bin/env node
/**
 * J-Quants v2 equities/master のレスポンス形式を確認
 * 最初の3銘柄の全フィールドをダンプ
 */
const jquantsKey = process.env.JQUANTS_API_KEY;
if (!jquantsKey) {
  console.error('JQUANTS_API_KEY not set');
  process.exit(1);
}

async function main() {
  const res = await fetch('https://api.jquants.com/v2/equities/master', {
    headers: { 'Content-Type': 'application/json', 'x-api-key': jquantsKey },
  });
  if (!res.ok) {
    console.error(`J-Quants API error: ${res.status}`);
    process.exit(1);
  }
  const json = await res.json() as any;
  const symbols = json.data || json || [];
  
  // TSE Growth (Mkt=0113) の最初3件
  const growth = symbols.filter((s: any) => s.Mkt === '0113' || s.Mkt === '0113');
  console.log(`Total symbols: ${symbols.length}`);
  console.log(`TSE Growth: ${growth.length}\n`);
  
  console.log('=== First 3 TSE Growth symbols (all fields) ===');
  for (const s of growth.slice(0, 3)) {
    console.log(JSON.stringify(s, null, 2));
    console.log('---');
  }
  
  // 全フィールド名を収集
  const allFields = new Set<string>();
  for (const s of growth.slice(0, 10)) {
    Object.keys(s).forEach(k => allFields.add(k));
  }
  console.log('\n=== All field names (first 10 symbols) ===');
  console.log([...allFields].sort().join(', '));
}

main();
