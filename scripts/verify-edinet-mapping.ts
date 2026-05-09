#!/usr/bin/env node
/**
 * EDINET API検証スクリプト
 */

const subscriptionKey = process.env.EDINET_SUBSCRIPTION_KEY;
if (!subscriptionKey) {
  console.error('EDINET_SUBSCRIPTION_KEY required');
  process.exit(1);
}

const BASE = 'https://disclosure.edinet-fsa.go.jp/api/v2';

async function main() {
  // Test 1: v1 corporates.json
  console.log('=== Test 1: v1 corporates.json ===');
  try {
    const res1 = await fetch('https://disclosure.edinet-fsa.go.jp/api/v1/corporates.json', {
      headers: { 'Ocp-Apim-Subscription-Key': subscriptionKey },
    });
    console.log(`Status: ${res1.status}`);
    console.log(`Content-Type: ${res1.headers.get('content-type')}`);
    const text1 = await res1.text();
    console.log(`Size: ${text1.length} bytes`);
    console.log(`Preview: ${text1.slice(0, 200)}`);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }

  // Test 2: v2 documents with edinetCode filter
  console.log('\n=== Test 2: edinetCode=E02143 (博展) ===');
  try {
    const res2 = await fetch(`${BASE}/documents.json?date=2026-05-08&type=2&edinetCode=E02143`, {
      headers: { 'Ocp-Apim-Subscription-Key': subscriptionKey },
    });
    console.log(`Status: ${res2.status}`);
    const data2 = await res2.json();
    const results2 = data2.results || [];
    console.log(`Results: ${results2.length}`);
    results2.slice(0, 3).forEach(r => {
      console.log(`  docId=${r.docID}, secCode=${r.secCode}, edinetCode=${r.edinetCode}`);
      console.log(`  desc=${r.docDescription}`);
    });
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }

  // Test 3: v2 documents with SECCODE filter
  console.log('\n=== Test 3: SECCODE=2173 (博展) ===');
  try {
    const res3 = await fetch(`${BASE}/documents.json?date=2026-05-08&type=2&SECCODE=2173`, {
      headers: { 'Ocp-Apim-Subscription-Key': subscriptionKey },
    });
    console.log(`Status: ${res3.status}`);
    const data3 = await res3.json();
    const results3 = data3.results || [];
    console.log(`Results: ${results3.length}`);
    results3.slice(0, 3).forEach(r => {
      console.log(`  docId=${r.docID}, secCode=${r.secCode}, edinetCode=${r.edinetCode}`);
      console.log(`  desc=${r.docDescription}`);
    });
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }

  // Test 4: 最近のドキュメントからsecCode/edinetCodeのペアを抽出
  console.log('\n=== Test 4: Extract secCode/edinetCode pairs ===');
  try {
    const today = new Date();
    for (let i = 0; i < 5; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().slice(0, 10);
      const res = await fetch(`${BASE}/documents.json?date=${dateStr}&type=2`, {
        headers: { 'Ocp-Apim-Subscription-Key': subscriptionKey },
      });
      const data = await res.json();
      const results = data.results || [];
      const withCodes = results.filter(r => r.secCode && r.edinetCode);
      if (withCodes.length > 0) {
        console.log(`Date: ${dateStr}, Found ${withCodes.length} docs with codes`);
        withCodes.slice(0, 5).forEach(r => {
          console.log(`  secCode=${r.secCode} -> edinetCode=${r.edinetCode}, filerName=${r.filerName}`);
        });
        break;
      }
    }
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

main();
