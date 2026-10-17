// Check whether the WAF error page is triggered by the URL pattern (/api/v2) itself.
// Test other EDINET endpoints that used to work and the error page's exact response to /api/ versions.
const key = process.env.EDINET_SUBSCRIPTION_KEY;
const UA = 'Mozilla/5.0';
const ds = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
const tests = [
  `/api/v2/documents.json?date=${ds}&type=2`,
  `/api/v1/documents.json?date=${ds}&type=2`,
];
for (const p of tests) {
  const res = await fetch(`https://disclosure2.edinet-fsa.go.jp${p}`, { headers: { 'Ocp-Apim-Subscription-Key': key, 'User-Agent': UA }, redirect: 'follow' });
  const t = await res.text();
  console.log(p.slice(0, 12), '→', res.status, res.url.includes('wzek0130') ? 'WAF-block' : 'JSON?', t.slice(0, 60).replace(/\n/g, ' '));
}
