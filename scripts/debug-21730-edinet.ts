#!/usr/bin/env node
/**
 * Debug EDINET search for stock 21730 (博展)
 */
const subscriptionKey = process.env.EDINET_SUBSCRIPTION_KEY;
if (!subscriptionKey) {
  console.error('EDINET_SUBSCRIPTION_KEY not set');
  process.exit(1);
}

const baseUrl = 'https://disclosure.edinet-fsa.go.jp/api/v2';
const headers = { 'Content-Type': 'application/json', 'Ocp-Apim-Subscription-Key': subscriptionKey };

function formatDate(d: Date) { return d.toISOString().slice(0, 10); }

async function main() {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 365);

  console.log('=== Debug EDINET for 21730 博展 ===');
  
  // 1. Try SECCODE=21730
  console.log('\n1. Search by SECCODE=21730');
  const p1 = new URLSearchParams({ type: '2', date: formatDate(from), limit: '10' });
  p1.set('SECCODE', '21730');
  const r1 = await fetch(`${baseUrl}/documents.json?${p1}`, { headers });
  console.log(`Status: ${r1.status}`);
  if (!r1.ok) { console.log(`  Body: ${(await r1.text()).slice(0, 200)}`); }
  else {
    const d1 = await r1.json() as any;
    console.log(`  Results: ${d1.results?.length || 0}`);
    for (const r of (d1.results || []).slice(0, 3)) {
      console.log(`  docID=${r.docID} edinetCode=${r.edinetCode} filerName=${r.filerName} desc=${r.docDescription?.slice(0, 40)}`);
    }
  }

  // 2. Try SECCODE=2173
  console.log('\n2. Search by SECCODE=2173');
  const p2 = new URLSearchParams({ type: '2', date: formatDate(from), limit: '10' });
  p2.set('SECCODE', '2173');
  const r2 = await fetch(`${baseUrl}/documents.json?${p2}`, { headers });
  console.log(`Status: ${r2.status}`);
  if (!r2.ok) { console.log(`  Body: ${(await r2.text()).slice(0, 200)}`); }
  else {
    const d2 = await r2.json() as any;
    console.log(`  Results: ${d2.results?.length || 0}`);
    for (const r of (d2.results || []).slice(0, 3)) {
      console.log(`  docID=${r.docID} edinetCode=${r.edinetCode} filerName=${r.filerName} desc=${r.docDescription?.slice(0, 40)}`);
    }
  }

  // 3. Try date range with type=2 only
  console.log('\n3. Search date range, type=2');
  const p3 = new URLSearchParams({ type: '2', date: `${formatDate(from)}~${formatDate(today)}`, limit: '5' });
  const r3 = await fetch(`${baseUrl}/documents.json?${p3}`, { headers });
  console.log(`Status: ${r3.status}`);
  if (!r3.ok) { console.log(`  Body: ${(await r3.text()).slice(0, 200)}`); }
  else {
    const d3 = await r3.json() as any;
    console.log(`  Results: ${d3.results?.length || 0}`);
    // Filter for 博展
    const hakuten = (d3.results || []).filter((r: any) => r.filerName?.includes('博展'));
    console.log(`  博展 matches: ${hakuten.length}`);
    for (const r of hakuten.slice(0, 3)) {
      console.log(`  docID=${r.docID} edinetCode=${r.edinetCode} filerName=${r.filerName} desc=${r.docDescription?.slice(0, 40)}`);
    }
  }

  // 4. Try edinetCode=E02143
  console.log('\n4. Search by edinetCode=E02143');
  const p4 = new URLSearchParams({ type: '2', date: formatDate(from), limit: '10' });
  p4.set('edinetCode', 'E02143');
  const r4 = await fetch(`${baseUrl}/documents.json?${p4}`, { headers });
  console.log(`Status: ${r4.status}`);
  if (!r4.ok) { console.log(`  Body: ${(await r4.text()).slice(0, 200)}`); }
  else {
    const d4 = await r4.json() as any;
    console.log(`  Results: ${d4.results?.length || 0}`);
    for (const r of (d4.results || []).slice(0, 3)) {
      console.log(`  docID=${r.docID} edinetCode=${r.edinetCode} filerName=${r.filerName} desc=${r.docDescription?.slice(0, 40)}`);
    }
  }
}

main();
