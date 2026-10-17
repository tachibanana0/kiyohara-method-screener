// Diagnose EDINET WAF: does a "warm-up" visit to the WAF page grant access to /api/v2?
const key = process.env.EDINET_SUBSCRIPTION_KEY;
if (!key) { console.log('no key'); process.exit(0); }
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const date = new Date(); date.setDate(date.getDate() - 30);
const ds = date.toISOString().slice(0, 10);

// Attempt 1: hit the error page first to acquire cookies, then call API with cookie jar (undici fetch doesn't share cookies; manual)
const gateRes = await fetch('https://disclosure2.edinet-fsa.go.jp/WZEK0130.aspx', { headers: { 'User-Agent': UA } });
const setCookies = [...gateRes.headers.getSetCookie?.() ?? []].map((c: string) => c.split(';')[0]);
console.log('gate:', gateRes.status, 'cookies:', setCookies.length);
const res = await fetch(`https://disclosure2.edinet-fsa.go.jp/api/v2/documents.json?date=${ds}&type=2`, {
  headers: { 'Ocp-Apim-Subscription-Key': key, 'User-Agent': UA, Accept: 'application/json', Cookie: setCookies.join('; ') },
  redirect: 'follow',
});
const text = await res.text();
console.log('api after warmup:', res.status, text.slice(0, 80).replace(/\n/g, ' '));
