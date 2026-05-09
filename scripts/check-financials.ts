#!/usr/bin/env node
/**
 * J-Quantsから決算期とedinetCodeを確認
 */

async function checkFinancials() {
  const jquantsApiKey = process.env.JQUANTS_API_KEY;
  
  if (!jquantsApiKey) {
    console.error('Missing JQUANTS_API_KEY');
    process.exit(1);
  }

  const codes = ['29810', '34770'];
  
  for (const code of codes) {
    console.log(`\n=== ${code} ===`);
    
    // listed info
    const listedUrl = `https://api.jquants.com/v1/listed?code=${code}`;
    const listedRes = await fetch(listedUrl, {
      headers: { 'x-api-key': jquantsApiKey },
    });
    
    if (listedRes.ok) {
      const listedData = await listedRes.json() as { info: Array<{ Code: string; EdinetCode: string; CompanyName: string; FiscalYearEndMonth: string }> };
      if (listedData.info?.[0]) {
        const info = listedData.info[0];
        console.log(`EdinetCode: ${info.EdinetCode}`);
        console.log(`CompanyName: ${info.CompanyName}`);
        console.log(`FiscalYearEndMonth: ${info.FiscalYearEndMonth}`);
      }
    } else {
      console.log(`Listed API error: ${listedRes.status}`);
    }
    
    // financial summary
    const summaryUrl = `https://api.jquants.com/v2/fins/summary?code=${code}`;
    const summaryRes = await fetch(summaryUrl, {
      headers: { 'x-api-key': jquantsApiKey },
    });
    
    if (summaryRes.ok) {
      const summaryData = await summaryRes.json() as { data: Array<{ CurPerEn: string; CurFw: string }> };
      if (summaryData.data?.length > 0) {
        console.log('\nRecent fiscal year end dates:');
        for (const s of summaryData.data.slice(0, 3)) {
          console.log(`  CurPerEn: ${s.CurPerEn}, CurFw: ${s.CurFw}`);
        }
      }
    } else {
      console.log(`Summary API error: ${summaryRes.status}`);
    }
  }
}

checkFinancials().catch(console.error);
