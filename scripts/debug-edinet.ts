#!/usr/bin/env node
/**
 * EDINET APIデバッグスクリプト
 * 使い方: npx tsx scripts/debug-edinet.ts [docId]
 */

import JSZip from 'jszip';

const docId = process.argv[2] || 'S100Q4XB';
const subscriptionKey = process.env.EDINET_SUBSCRIPTION_KEY;

if (!subscriptionKey) {
  console.error('EDINET_SUBSCRIPTION_KEY environment variable is required');
  process.exit(1);
}

async function testEdinet() {
  const baseUrl = 'https://disclosure.edinet-fsa.go.jp/api/v2';
  
  // Test: Document retrieval with ZIP extraction
  console.log('=== Test: Document Retrieval with ZIP Extraction ===');
  const docUrl = `${baseUrl}/documents/${docId}?type=1`;
  console.log(`URL: ${docUrl}`);
  
  try {
    const res = await fetch(docUrl, {
      headers: { 'Ocp-Apim-Subscription-Key': subscriptionKey },
    });
    
    console.log(`Status: ${res.status}`);
    console.log(`Content-Type: ${res.headers.get('content-type')}`);
    
    if (!res.ok) {
      const text = await res.text();
      console.log(`Error: ${text.slice(0, 200)}`);
      return;
    }
    
    const buffer = await res.arrayBuffer();
    console.log(`ZIP size: ${(buffer.byteLength / 1024).toFixed(1)} KB`);
    
    const zip = await JSZip.loadAsync(buffer);
    const files = Object.keys(zip.files).filter((f) => !f.includes('__MACOSX'));
    console.log(`Files in ZIP: ${files.length}`);
    
    const xbrlFiles = files.filter((f) => f.endsWith('.xbrl') || f.endsWith('.xml'));
    console.log(`XBRL/XML files: ${xbrlFiles.length}`);
    for (const f of xbrlFiles.slice(0, 5)) {
      console.log(`  - ${f}`);
    }
    
    if (xbrlFiles.length > 0) {
      const content = await zip.files[xbrlFiles[0]].async('text');
      console.log(`\nFirst XBRL file size: ${(content.length / 1024).toFixed(1)} KB`);
      
      // Extract relevant sections
      const sections: string[] = [];
      const patterns = [
        { name: '役員', regex: /<[^>]*?(Officers|Directors|Executive).*?>([\s\S]*?)<\/[^>]*?(Officers|Directors|Executive).*?>/i },
        { name: '大株主', regex: /<[^>]*?(MajorShareholders).*?>([\s\S]*?)<\/[^>]*?(MajorShareholders).*?>/i },
        { name: '経営環境', regex: /<[^>]*?(BusinessRisks|ManagementPolicy).*?>([\s\S]*?)<\/[^>]*?(BusinessRisks|ManagementPolicy).*?>/i },
        { name: '業績', regex: /<[^>]*?(OperatingResults|BusinessResults).*?>([\s\S]*?)<\/[^>]*?(OperatingResults|BusinessResults).*?>/i },
      ];
      
      for (const p of patterns) {
        const match = content.match(p.regex);
        if (match) {
          sections.push(`【${p.name}】\n${match[0].slice(0, 500)}`);
          console.log(`\n${p.name}: Found (${match[0].length} chars)`);
        } else {
          console.log(`\n${p.name}: Not found`);
        }
      }
      
      console.log(`\nExtracted sections: ${sections.length}`);
      if (sections.length > 0) {
        console.log('--- Preview ---');
        console.log(sections.join('\n\n').slice(0, 1000));
      }
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    if (err.cause) {
      console.error(`Cause: ${err.cause.message || err.cause}`);
    }
  }
}

testEdinet();
