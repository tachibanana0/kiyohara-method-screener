// Diagnose EDINET WAF behavior from GH runners with redirect following + UA
const key = process.env.EDINET_SUBSCRIPTION_KEY;
if (!key) { console.log('no key'); process.exit(0); }
const date = new Date(); date.setDate(date.getDate() - 30);
const ds = date.toISOString().slice(0, 10);
for (const host of ['disclosure.edinet-fsa.go.jp', 'disclosure2.edinet-fsa.go.jp']) {
  const url = `https://${host}/api/v2/documents.json?date=${ds}&type=2`;
  for (const ua of ['default', 'browser']) {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: ua === 'browser'
          ? { 'Ocp-Apim-Subscription-Key': key, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', Accept: 'application/json' }
          : { 'Ocp-Apim-Subscription-Key': key },
      });
      const text = await res.text();
      console.log(`${host} ua=${ua}: ${res.status} ${res.url.slice(0, 70)} ${text.slice(0, 60).replace(/\n/g, ' ')}`);
    } catch (e) {
      console.log(`${host} ua=${ua}: ERR ${(e as Error).message}`);
    }
  }
}
