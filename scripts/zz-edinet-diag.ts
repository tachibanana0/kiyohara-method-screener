const key = process.env.EDINET_SUBSCRIPTION_KEY;
if (!key) { console.log('no key'); process.exit(0); }
// Check: does the list contain data at all + find any secCode matches across several codes
let foundAny = 0, totalDocs = 0;
for (let d = 0; d < 14; d++) {
  const date = new Date(); date.setDate(date.getDate() - d);
  const ds = date.toISOString().slice(0, 10);
  const res = await fetch(`https://api.edinet-fsa.go.jp/api/v2/documents.json?date=${ds}&type=2`, {
    headers: { 'Ocp-Apim-Subscription-Key': key },
  });
  if (!res.ok) { console.log(ds, 'HTTP', res.status); continue; }
  const data = await res.json() as { results?: Array<{ secCode?: string; filerName: string; docDescription: string }> };
  totalDocs += (data.results || []).length;
  const yuho = (data.results || []).filter(r => r.secCode && (r.docDescription || '').includes('有価証券報告書'));
  if (yuho.length) { console.log(ds, 'yuho w/ secCode:', yuho.length, 'e.g.', yuho[0].filerName, yuho[0].secCode); foundAny++; }
}
console.log('total docs 14d:', totalDocs, 'days with yuho:', foundAny);
