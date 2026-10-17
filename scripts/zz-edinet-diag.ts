// Diagnose: strict secCode match for チェンジホールディングス (3962) on recent dates
const key = process.env.EDINET_SUBSCRIPTION_KEY;
if (!key) { console.log('no key'); process.exit(0); }
const secCode = '3962';
let found = 0;
for (let d = 0; d < 30; d++) {
  const date = new Date(); date.setDate(date.getDate() - d);
  const ds = date.toISOString().slice(0, 10);
  const url = `https://disclosure.edinet-fsa.go.jp/api/v2/documents.json?date=${ds}&type=2`;
  const res = await fetch(url, { headers: { 'Ocp-Apim-Subscription-Key': key } });
  if (!res.ok) { continue; }
  const data = await res.json() as { results?: Array<{ secCode?: string; edinetCode: string; filerName: string; docDescription: string }> };
  const hits = (data.results || []).filter(r => r.secCode === secCode);
  for (const h of hits) { console.log(ds, h.docDescription, h.filerName); found++; }
}
console.log('total secCode hits:', found);
