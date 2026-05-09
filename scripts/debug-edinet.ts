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
    for (const f of files) {
      console.log(`  - ${f}`);
    }
    
    const xbrlFiles = files.filter((f) => f.endsWith('.xbrl'));
    const xmlFiles = files.filter((f) => f.endsWith('.xml'));
    console.log(`\n.xbrl files: ${xbrlFiles.length}`);
    for (const f of xbrlFiles) console.log(`  - ${f}`);
    console.log(`\n.xml files: ${xmlFiles.length}`);
    for (const f of xmlFiles.slice(0, 5)) console.log(`  - ${f}`);
    
    // Try .xbrl first, then .xml
    const targetFiles = xbrlFiles.length > 0 ? xbrlFiles : xmlFiles;
    
    if (targetFiles.length > 0) {
      const content = await zip.files[targetFiles[0]].async('text');
      console.log(`\nFirst file size: ${(content.length / 1024).toFixed(1)} KB`);
      console.log(`Preview (first 2000 chars):\n${content.slice(0, 2000)}`);
      
      // Extract relevant sections with broader patterns
      const sections: string[] = [];
      const patterns = [
        { name: '役員', regex: /(?:役員|Officer|Director)[^<]{0,100}(?:の状況|Status)/i },
        { name: '大株主', regex: /(?:大株主|MajorShareholder)/i },
        { name: '経営環境', regex: /(?:経営環境|BusinessRisk|対処すべき課題)/i },
        { name: '業績', regex: /(?:業績|OperatingResults|BusinessResults|事業の状況)/i },
      ];
      
      for (const p of patterns) {
        const match = content.match(new RegExp(`.{0,200}${p.regex.source}.{0,500}`, 'is'));
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
