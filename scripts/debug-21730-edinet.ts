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
  
  // 1. Try secCode=21730
  console.log('\n1. Search by secCode=21730');
  const p1 = new URLSearchParams({ type: '2', date: `${formatDate(from)}~${formatDate(today)}`, docTypeList: '["2","3"]', sort: 'descending', limit: '5' });
  p1.set('secCode', '21730');
  const r1 = await fetch(`${baseUrl}/documents.json?${p1}`, { headers });
  const d1 = await r1.json() as any;
  console.log(`Status: ${r1.status}, Results: ${d1.results?.length || 0}`);
  if (d1.results?.length > 0) {
    for (const r of d1.results.slice(0, 3)) {
      console.log(`  docID=${r.docID} edinetCode=${r.edinetCode} filerName=${r.filerName} desc=${r.docDescription}`);
    }
  }

  // 2. Try secCode=2173
  console.log('\n2. Search by secCode=2173');
  const p2 = new URLSearchParams({ type: '2', date: `${formatDate(from)}~${formatDate(today)}`, docTypeList: '["2","3"]', sort: 'descending', limit: '5' });
  p2.set('secCode', '2173');
  const r2 = await fetch(`${baseUrl}/documents.json?${p2}`, { headers });
  const d2 = await r2.json() as any;
  console.log(`Status: ${r2.status}, Results: ${d2.results?.length || 0}`);
  if (d2.results?.length > 0) {
    for (const r of d2.results.slice(0, 3)) {
      console.log(`  docID=${r.docID} edinetCode=${r.edinetCode} filerName=${r.filerName} desc=${r.docDescription}`);
    }
  }

  // 3. Try filerName=博展
  console.log('\n3. Search by filerName=博展');
  const p3 = new URLSearchParams({ type: '2', date: `${formatDate(from)}~${formatDate(today)}`, docTypeList: '["2","3"]', sort: 'descending', limit: '5' });
  p3.set('filerName', '博展');
  const r3 = await fetch(`${baseUrl}/documents.json?${p3}`, { headers });
  const d3 = await r3.json() as any;
  console.log(`Status: ${r3.status}, Results: ${d3.results?.length || 0}`);
  if (d3.results?.length > 0) {
    for (const r of d3.results.slice(0, 3)) {
      console.log(`  docID=${r.docID} edinetCode=${r.edinetCode} filerName=${r.filerName} desc=${r.docDescription}`);
    }
  }

  // 4. Try filerName=博展 (encoded)
  console.log('\n4. Search by filerName=博展 (full name with 株式会社)');
  const p4 = new URLSearchParams({ type: '2', date: `${formatDate(from)}~${formatDate(today)}`, docTypeList: '["2","3"]', sort: 'descending', limit: '5' });
  p4.set('filerName', '株式会社博展');
  const r4 = await fetch(`${baseUrl}/documents.json?${p4}`, { headers });
  const d4 = await r4.json() as any;
  console.log(`Status: ${r4.status}, Results: ${d4.results?.length || 0}`);
  if (d4.results?.length > 0) {
    for (const r of d4.results.slice(0, 3)) {
      console.log(`  docID=${r.docID} edinetCode=${r.edinetCode} filerName=${r.filerName} desc=${r.docDescription}`);
    }
  }
}

main();
