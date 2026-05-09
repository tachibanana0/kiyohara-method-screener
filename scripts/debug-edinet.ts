#!/usr/bin/env node
/**
 * EDINET APIデバッグスクリプト
 * 使い方: npx tsx scripts/debug-edinet.ts [docId]
 */

const docId = process.argv[2] || 'S100Q4XB';
const subscriptionKey = process.env.EDINET_SUBSCRIPTION_KEY;

if (!subscriptionKey) {
  console.error('EDINET_SUBSCRIPTION_KEY environment variable is required');
  process.exit(1);
}

async function testEdinet() {
  const baseUrl = 'https://disclosure.edinet-fsa.go.jp/api/v2';
  
  // Test 1: Document list
  console.log('=== Test 1: Document List ===');
  const listUrl = `${baseUrl}/documents.json?date=2025-06-28&type=2`;
  console.log(`URL: ${listUrl}`);
  
  const listRes = await fetch(listUrl, {
    headers: { 'Ocp-Apim-Subscription-Key': subscriptionKey },
  });
  console.log(`Status: ${listRes.status}`);
  console.log(`Content-Type: ${listRes.headers.get('content-type')}`);
  
  if (listRes.ok) {
    const listData = await listRes.json();
    const results = listData.results || [];
    console.log(`Results: ${results.length}`);
    if (results.length > 0) {
      const r = results[0];
      console.log(`Sample: docID=${r.docID}, secCode=${r.secCode}, edinetCode=${r.edinetCode}`);
    }
  } else {
    const text = await listRes.text();
    console.log(`Error: ${text.slice(0, 200)}`);
  }

  // Test 2: Document retrieval
  console.log('\n=== Test 2: Document Retrieval ===');
  const docUrl = `${baseUrl}/documents/${docId}`;
  console.log(`URL: ${docUrl}`);
  
  try {
    const docRes = await fetch(docUrl, {
      headers: { 'Ocp-Apim-Subscription-Key': subscriptionKey },
      redirect: 'manual',
    });
    console.log(`Status: ${docRes.status}`);
    console.log(`Content-Type: ${docRes.headers.get('content-type')}`);
    console.log(`Location: ${docRes.headers.get('location')}`);
    
    if (docRes.status >= 300 && docRes.status < 400) {
      console.log('Redirect detected!');
    } else if (docRes.ok) {
      const text = await docRes.text();
      console.log(`Response length: ${text.length} chars`);
      console.log(`Preview: ${text.slice(0, 500)}`);
    } else {
      const text = await docRes.text();
      console.log(`Error: ${text.slice(0, 200)}`);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    if (err.cause) {
      console.error(`Cause: ${err.cause.message || err.cause}`);
    }
  }

  // Test 3: Document with type=1
  console.log('\n=== Test 3: Document with type=1 ===');
  const docUrlType1 = `${baseUrl}/documents/${docId}?type=1`;
  console.log(`URL: ${docUrlType1}`);
  
  try {
    const docRes = await fetch(docUrlType1, {
      headers: { 'Ocp-Apim-Subscription-Key': subscriptionKey },
      redirect: 'manual',
    });
    console.log(`Status: ${docRes.status}`);
    console.log(`Content-Type: ${docRes.headers.get('content-type')}`);
    console.log(`Location: ${docRes.headers.get('location')}`);
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
  }
}

testEdinet();
