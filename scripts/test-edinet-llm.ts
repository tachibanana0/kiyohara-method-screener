#!/usr/bin/env node
/**
 * スクリーニングのEDINET+LLM部分だけをテスト
 * 使い方: npx tsx scripts/test-edinet-llm.ts [code] [name] [docId]
 */

import JSZip from 'jszip';

const code = process.argv[2] || '21730';
const name = process.argv[3] || '博展';
const docId = process.argv[4] || 'S100R46H';
const subscriptionKey = process.env.EDINET_SUBSCRIPTION_KEY;
const openrouterKey = process.env.OPENROUTER_API_KEY;

if (!subscriptionKey || !openrouterKey) {
  console.error('EDINET_SUBSCRIPTION_KEY and OPENROUTER_API_KEY required');
  process.exit(1);
}

async function main() {
  const baseUrl = 'https://disclosure.edinet-fsa.go.jp/api/v2';
  
  // Step 1: EDINET document fetch
  console.log('=== Step 1: Fetch EDINET Document ===');
  const url = `${baseUrl}/documents/${docId}?type=1`;
  console.log(`URL: ${url}`);
  
  const res = await fetch(url, {
    headers: { 'Ocp-Apim-Subscription-Key': subscriptionKey },
  });
  
  if (!res.ok) {
    console.error(`Failed: ${res.status}`);
    return;
  }
  
  const buffer = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  
  const htmlFiles = Object.keys(zip.files).filter(
    (f) => f.endsWith('.htm') && f.includes('PublicDoc') && !f.includes('__MACOSX')
  );
  console.log(`HTML files: ${htmlFiles.length}`);
  htmlFiles.forEach(f => console.log(`  - ${f}`));
  
  let text = '';
  for (const file of htmlFiles.slice(0, 2)) {
    const content = await zip.files[file].async('text');
    const cleaned = content.replace(/<[^>]*>/g, ' ')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
      .replace(/&#\d+;/g, '').replace(/\s+/g, ' ').trim();
    text += cleaned + '\n---\n';
  }
  
  console.log(`Extracted text: ${(text.length / 1024).toFixed(1)} KB`);
  console.log(`Preview:\n${text.slice(0, 1000)}`);
  
  // Step 2: LLM evaluation
  console.log('\n=== Step 2: LLM Evaluation ===');
  const prompt = `以下の有価証券報告書の内容を読み、清原メソッドの基準で評価してください。

評価基準:
1. オーナー企業かどうか（創業家経営、同族企業など）
2. 経営の質（1-100点）

出力形式:
{
  "is_owner_company": 0 または 1,
  "management_score": 1-100の数値,
  "reason": "評価理由を簡潔に"
}

---
${text.slice(0, 8000)}
---`;

  const llmRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openrouterKey}`,
      'HTTP-Referer': 'https://kiyohara-screener.hikakunavi360.com',
      'X-Title': 'Kiyohara Method Screener',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
    }),
  });
  
  if (!llmRes.ok) {
    console.error(`LLM failed: ${llmRes.status}`);
    return;
  }
  
  const data = await llmRes.json() as { choices: Array<{ message: { content: string } }> };
  const content = data.choices[0]?.message?.content || '';
  console.log(`LLM Response:\n${content}`);
  
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      console.log(`\nParsed Result:`);
      console.log(`  is_owner_company: ${result.is_owner_company}`);
      console.log(`  management_score: ${result.management_score}`);
      console.log(`  reason: ${result.reason}`);
    }
  } catch (err) {
    console.error('Failed to parse LLM response');
  }
}

main();
