// ============================================
// Entry Point: Hono v4 + Workflow Binding + Cron
// ============================================

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { JQuantsClient } from './api/jquants';
import { EdinetClient } from './api/edinet';
import { ScreenerDB } from './db/schema';

const app = new Hono<{ Bindings: Cloudflare.Env }>();

// CORS
app.use(
  '*',
  cors({
    origin: ['https://kiyohara-screener.hikakunavi360.com', 'https://kiyohara-screener.pages.dev', 'https://*.kiyohara-screener.pages.dev', 'http://localhost:5173'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
  })
);

// Health check
app.get('/', (c) => c.json({ status: 'ok', app: 'kiyohara-method-screener' }));

// Simple test endpoint
app.get('/api/test', async (c) => {
  return c.json({ test: 'ok', timestamp: new Date().toISOString() });
});

// Test J-Quants API
app.get('/api/test/jquants', async (c) => {
  const jquants = new JQuantsClient(c.env.JQUANTS_API_KEY, c.env.JQUANTS_API_BASE);
  try {
    const symbols = await jquants.fetchAllSymbols();
    return c.json({ count: symbols.length, sample: symbols.slice(0, 3).map(s => ({ code: s.Code, name: s.CoName })) });
  } catch (err) {
    return c.json({ error: String(err) });
  }
});

// Test D1 DB
app.get('/api/test/db', async (c) => {
  const db = new ScreenerDB(c.env.DB);
  try {
    const picks = await db.getActivePicks();
    return c.json({ picksCount: picks.length });
  } catch (err) {
    return c.json({ error: String(err) });
  }
});

// Test screening step 1 only
app.get('/api/test/screen-step1', async (c) => {
  const jquants = new JQuantsClient(c.env.JQUANTS_API_KEY, c.env.JQUANTS_API_BASE);
  try {
    const screened = await jquants.screenQuantitatively();
    return c.json({ count: screened.length, stocks: screened });
  } catch (err) {
    return c.json({ error: String(err) });
  }
});

// Test Yahoo Finance
app.get('/api/test/yahoo', async (c) => {
  const yahoo = new (await import('./api/yahoo-finance')).YahooFinanceClient();
  try {
    const quote = await yahoo.fetchQuote('21730');
    return c.json({ quote });
  } catch (err) {
    return c.json({ error: String(err) });
  }
});

// Test J-Quants symbols
app.get('/api/test/jquants-symbols', async (c) => {
  const jquants = new JQuantsClient(c.env.JQUANTS_API_KEY, c.env.JQUANTS_API_BASE);
  try {
    const symbols = await jquants.fetchAllSymbols();
    const growth = symbols.filter((s) => (s.Mkt || '') === '0113').slice(0, 5);
    return c.json({ total: symbols.length, growth: growth.length, sample: growth });
  } catch (err) {
    return c.json({ error: String(err) });
  }
});

// Test Yahoo Finance batch
app.get('/api/test/yahoo-batch', async (c) => {
  const yahoo = new (await import('./api/yahoo-finance')).YahooFinanceClient();
  try {
    const codes = ['21730', '14010', '130A0'];
    const priceMap = await yahoo.fetchQuotes(codes);
    return c.json({ count: priceMap.size, prices: Object.fromEntries(priceMap) });
  } catch (err) {
    return c.json({ error: String(err) });
  }
});

// Test J-Quants statements
app.get('/api/test/jquants-statements/:code', async (c) => {
  const code = c.req.param('code');
  const jquants = new JQuantsClient(c.env.JQUANTS_API_KEY, c.env.JQUANTS_API_BASE);
  try {
    const statements = await jquants.fetchStatements(code);
    return c.json({ code, count: statements.length, statements });
  } catch (err) {
    return c.json({ code, error: String(err) });
  }
});

// --- API: 現在のPick一覧 ---
app.get('/api/picks', async (c) => {
  const db = new ScreenerDB(c.env.DB);
  const picks = await db.getActivePicks();
  return c.json(picks);
});

// --- API: 特定銘柄のトラッキング系列 ---
app.get('/api/tracking/:code', async (c) => {
  const code = c.req.param('code');
  const db = new ScreenerDB(c.env.DB);
  const series = await db.getTrackingSeries(code);
  return c.json(series);
});

// --- SEO: 個別銘柄ページ ---
app.get('/picks/:code', async (c) => {
  const code = c.req.param('code');
  const db = new ScreenerDB(c.env.DB);
  const pick = await db.getPickByCode(code);
  if (!pick) return c.notFound();

  const series = await db.getTrackingSeries(code);
  const latestTracking = series.length > 0 ? series[series.length - 1] : null;
  const basePrice = series.length > 0 ? series[0].price : (pick.initial_price ?? 0);
  const firstTopix = series.length > 0 ? series[0].topix : (pick.initial_topix ?? 0);

  const stockReturn = latestTracking && basePrice > 0
    ? ((latestTracking.price / basePrice) - 1) * 100
    : 0;
  const topixReturn = latestTracking && firstTopix > 0
    ? ((latestTracking.topix / firstTopix) - 1) * 100
    : 0;
  const alpha = latestTracking ? latestTracking.cumulative_alpha : 0;
  const tier = pick.kiyohara_compliant ? '清原適合' : '監視対象';
  const reason = pick.reason || '評価理由はまだありません。';

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${pick.code} ${pick.name} | 清原メソッド・スクリーナー</title>
<meta name="description" content="${pick.name}(${pick.code})の清原メソッドスクリーニング結果。実質PER ${pick.real_per.toFixed(1)}倍、経営スコア ${pick.management_score}点、${tier}。" />
<link rel="canonical" href="${c.env.APP_URL}/picks/${pick.code}" />
<meta property="og:url" content="${c.env.APP_URL}/picks/${pick.code}" />
<meta property="og:title" content="${pick.code} ${pick.name} | 清原メソッド・スクリーナー" />
<meta property="og:description" content="実質PER ${pick.real_per.toFixed(1)}倍、経営スコア ${pick.management_score}点。${tier}。" />
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebPage",
  "name": "${pick.name} (${pick.code})",
  "description": "清原メソッドスクリーニング結果",
  "about": { "@type": "Corporation", "name": "${pick.name}", "tickerSymbol": "${pick.code}" }
}
</script>
</head>
<body style="font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:2rem;color:#1e293b;background:#f8fafc">
<h1>${pick.code} ${pick.name}</h1>
<p style="color:#64748b">${tier} | 選定日: ${pick.picked_at}</p>

<h2>定量指標</h2>
<table style="width:100%;border-collapse:collapse">
<tr><td style="padding:4px 0;color:#64748b">時価総額</td><td style="text-align:right">${pick.market_cap.toFixed(1)} 億円</td></tr>
<tr><td style="padding:4px 0;color:#64748b">ネットキャッシュ</td><td style="text-align:right">${pick.net_cash.toFixed(1)} 億円</td></tr>
<tr><td style="padding:4px 0;color:#64748b">実質PER</td><td style="text-align:right;font-weight:700;color:${pick.real_per <= 10 ? '#16a34a' : '#1e293b'}">${pick.real_per.toFixed(1)} 倍</td></tr>
<tr><td style="padding:4px 0;color:#64748b">売上成長率 3Y</td><td style="text-align:right">${pick.sales_growth != null ? (pick.sales_growth * 100).toFixed(1)+'%' : 'N/A'}</td></tr>
<tr><td style="padding:4px 0;color:#64748b">営業利益成長率 3Y</td><td style="text-align:right">${pick.profit_growth != null ? (pick.profit_growth * 100).toFixed(1)+'%' : 'N/A'}</td></tr>
</table>

<h2>AI 定性評価</h2>
<p><strong>オーナー企業:</strong> ${pick.is_owner_company ? 'はい' : 'いいえ'}</p>
<p><strong>経営スコア:</strong> ${pick.management_score} / 100</p>
<p><strong>評価理由:</strong> ${reason}</p>

${latestTracking ? `
<h2>パフォーマンス</h2>
<table style="width:100%;border-collapse:collapse">
<tr><td style="padding:4px 0;color:#64748b">現在株価</td><td style="text-align:right;font-weight:700">¥${latestTracking.price.toLocaleString('ja-JP')}</td></tr>
<tr><td style="padding:4px 0;color:#64748b">株価リターン</td><td style="text-align:right;color:${stockReturn >= 0 ? '#16a34a' : '#dc2626'}">${stockReturn >= 0 ? '+' : ''}${stockReturn.toFixed(2)}%</td></tr>
<tr><td style="padding:4px 0;color:#64748b">日経平均リターン</td><td style="text-align:right;color:${topixReturn >= 0 ? '#16a34a' : '#dc2626'}">${topixReturn >= 0 ? '+' : ''}${topixReturn.toFixed(2)}%</td></tr>
<tr><td style="padding:4px 0;color:#64748b">累積 Alpha</td><td style="text-align:right;font-weight:700;color:${alpha >= 0 ? '#16a34a' : '#dc2626'}">${alpha >= 0 ? '+' : ''}${alpha.toFixed(2)}%</td></tr>
</table>
` : ''}

<p style="margin-top:2rem"><a href="https://disclosure.edinet-fsa.go.jp/" style="color:#2563eb">EDINET で有価証券報告書を確認する →</a></p>
<p><a href="/" style="color:#64748b;font-size:.875rem">← 清原メソッド・スクリーナーに戻る</a></p>
</body>
</html>`;

  return c.html(html);
});

// --- API: GitHub Actionsからのスクリーニング結果受信 ---
app.post('/api/screening/receive', async (c) => {
  const token = c.req.header('X-Screening-Token');
  if (!token || token !== c.env.SCREENING_API_TOKEN) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json().catch(() => null);
  if (!body || !Array.isArray(body.picks)) {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const db = new ScreenerDB(c.env.DB);
  let saved = 0;

  for (const pick of body.picks) {
    try {
      await db.upsertPick({
        code: pick.code,
        name: pick.name,
        marketCap: pick.marketCap,
        netCash: pick.netCash,
        realPER: pick.realPER,
        salesGrowth3Y: pick.salesGrowth3Y,
        profitGrowth3Y: pick.profitGrowth3Y,
        isOwnerCompany: pick.isOwnerCompany ?? 0,
        managementScore: pick.managementScore ?? 0,
        latestPrice: pick.latestPrice,
        latestTopix: pick.latestTopix,
        kiyoharaCompliant: pick.isKiyoharaCompliant ?? true,
        reason: pick.reason ?? '',
        netCashRatio: pick.netCashRatio ?? 0,
      });
      saved++;
    } catch (err) {
      console.error(`Failed to save pick ${pick.code}:`, err);
    }
  }

  return c.json({
    success: true,
    saved,
    total: body.picks.length,
    timestamp: new Date().toISOString(),
  });
});

// --- API: GitHub Actionsからのトラッキング結果受信 ---
app.post('/api/tracking/receive', async (c) => {
  const token = c.req.header('X-Screening-Token');
  if (!token || token !== c.env.SCREENING_API_TOKEN) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json().catch(() => null);
  if (!body || !Array.isArray(body.rows)) {
    return c.json({ error: 'Invalid request body' }, 400);
  }

  const targetDate = body.date ?? new Date().toISOString().slice(0, 10);
  const db = new ScreenerDB(c.env.DB);

  const trackingRows: Parameters<typeof db.batchInsertTracking>[0] = body.rows.map((row: any) => ({
    code: row.code,
    date: targetDate,
    price: row.price,
    topix: row.topix,
    alpha: row.alpha,
    cumulative_alpha: row.cumulative_alpha,
  }));

  await db.batchInsertTracking(trackingRows);

  return c.json({
    success: true,
    saved: trackingRows.length,
    date: targetDate,
    timestamp: new Date().toISOString(),
  });
});

// --- DEBUG: Yahoo Finance APIテスト ---
app.get('/api/debug/yahoo/:code', async (c) => {
  const code = c.req.param('code');
  const { YahooFinanceClient } = await import('./api/yahoo-finance');
  const yahoo = new YahooFinanceClient();
  try {
    const quote = await yahoo.fetchQuote(code);
    return c.json({ code, quote, error: null });
  } catch (err) {
    return c.json({ code, quote: null, error: String(err) });
  }
});

// --- DEBUG: Yahoo Finance API生レスポンス ---
app.get('/api/debug/yahoo-raw/:code', async (c) => {
  const code = c.req.param('code');
  const trimmed = code.replace(/0$/, '');
  const ticker = `${trimmed}.T`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
  
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'application/json',
      },
    });
    const text = await res.text();
    const data = JSON.parse(text);
    const result = data.chart?.result?.[0];
    const quote = result?.indicators?.quote?.[0];
    return c.json({ 
      code, 
      ticker, 
      url, 
      status: res.status, 
      statusText: res.statusText,
      hasResult: !!result,
      hasQuote: !!quote,
      closeValue: quote?.close?.[0],
      closeArray: quote?.close,
      quoteKeys: quote ? Object.keys(quote) : null,
      bodyPreview: text.slice(0, 200) 
    });
  } catch (err) {
    return c.json({ code, ticker, url, error: String(err) });
  }
});

// --- DEBUG: J-Quants 財務データテスト ---
app.get('/api/debug/jquants/:code', async (c) => {
  const code = c.req.param('code');
  const jquants = new JQuantsClient(c.env.JQUANTS_API_KEY, c.env.JQUANTS_API_BASE);
  const statements = await jquants.fetchStatements(code);
  return c.json({ code, count: statements.length, latest: statements[statements.length - 1] ?? null });
});

// --- DEBUG: EDINET APIテスト ---
app.get('/api/debug/edinet/:code', async (c) => {
  const code = c.req.param('code');
  try {
    const edinet = new EdinetClient(c.env.EDINET_API_BASE, c.env.EDINET_SUBSCRIPTION_KEY);
    const reports = await edinet.fetchLatestYukashokenReports(code);
    return c.json({ code, reportCount: reports.length, reports });
  } catch (err) {
    console.error('EDINET debug error:', err);
    return c.json({ code, error: String(err), stack: (err as Error)?.stack || 'no stack' });
  }
});

// --- DEBUG: EDINET API生レスポンス ---
app.get('/api/debug/edinet-raw/:code', async (c) => {
  const code = c.req.param('code');
  const date = c.req.query('date') || '2026-01-14';
  const secCode = code;
  const url = `${c.env.EDINET_API_BASE}/documents.json?date=${date}&type=2&SECCODE=${secCode}`;
  
  try {
    const res = await fetch(url, {
      headers: {
        'Ocp-Apim-Subscription-Key': c.env.EDINET_SUBSCRIPTION_KEY,
      },
    });
    return new Response(res.body, {
      status: res.status,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (err) {
    return c.json({ code, secCode, url, error: String(err) });
  }
});

// --- DEBUG: 直接スクリーニング実行（詳細ログ付き） ---
app.get('/api/debug/screen', async (c) => {
  const jquants = new JQuantsClient(c.env.JQUANTS_API_KEY, c.env.JQUANTS_API_BASE);
  const edinet = new EdinetClient(c.env.EDINET_API_BASE, c.env.EDINET_SUBSCRIPTION_KEY);
  const db = new ScreenerDB(c.env.DB);
  const results = await jquants.screenQuantitatively(edinet, db);
  return c.json({ count: results.length, stocks: results });
});

// --- DEBUG: スクリーニング詳細ログ ---
app.get('/api/debug/screen-details', async (c) => {
  const jquants = new JQuantsClient(c.env.JQUANTS_API_KEY, c.env.JQUANTS_API_BASE);
  const yahoo = new (await import('./api/yahoo-finance')).YahooFinanceClient();

  // マスター取得
  await jquants.sleep(12000);
  const symbols = await jquants.fetchAllSymbols();
  const targetSymbols = symbols.filter((s) => (s.Mkt || '') === '0113').slice(0, 5);

  const details: Array<Record<string, unknown>> = [];

  for (const sym of targetSymbols) {
    const price = await yahoo.fetchQuote(sym.Code);
    await jquants.sleep(12000);
    const statements = await jquants.fetchStatements(sym.Code);
    const latest = statements[statements.length - 1];

    details.push({
      code: sym.Code,
      name: sym.CoName,
      hasPrice: !!price,
      price: price?.close ?? null,
      hasStatements: statements.length > 0,
      statementCount: statements.length,
      latestPeriod: latest?.CurPerEn ?? null,
      shares: latest?.ShOutFY ?? null,
      sales: latest?.Sales ?? null,
      op: latest?.OP ?? null,
      np: latest?.NP ?? null,
      cashEq: latest?.CashEq ?? null,
    });
  }

  return c.json({ details });
});

// --- DEBUG: LLM評価テスト（定量データのみ） ---
app.get('/api/debug/llm-eval-test/:code', async (c) => {
  const code = c.req.param('code');
  try {
    const openrouter = new (await import('./api/openrouter')).OpenRouterClient(
      c.env.OPENROUTER_API_KEY,
      c.env.OPENROUTER_API_BASE
    );

    // クエリパラメータでデータを受け取る（ない場合は博展のデータを使う）
    const testData = {
      companyName: c.req.query('name') || '博展',
      marketCap: parseFloat(c.req.query('cap') || '150.5'),
      realPER: parseFloat(c.req.query('per') || '14.2'),
      salesGrowth: parseFloat(c.req.query('sales') || '0.94'),
      profitGrowth: parseFloat(c.req.query('profit') || '1.65'),
    };

    const result = await openrouter.evaluateCompany(testData);
    return c.json({ code, input: testData, evaluation: result });
  } catch (err) {
    console.error('LLM eval test error:', err);
    return c.json({ code, error: String(err) });
  }
});

// --- SEO: 動的 sitemap.xml ---
app.get('/sitemap.xml', async (c) => {
  const db = new ScreenerDB(c.env.DB);
  const picks = await db.getActivePicks();
  const baseUrl = c.env.APP_URL;
  const pickUrls = picks.map((p) =>
    `  <url><loc>${baseUrl}/picks/${p.code}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`
  ).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${baseUrl}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>${baseUrl}/dashboard</loc><changefreq>daily</changefreq><priority>0.9</priority></url>
  <url><loc>${baseUrl}/method</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
  <url><loc>${baseUrl}/faq</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>
  <url><loc>${baseUrl}/about</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>
${pickUrls}
</urlset>`;
  return c.text(xml, 200, { 'Content-Type': 'application/xml' });
});

// --- SEO: static page prerendering (method/faq/about) ---
app.get('/method', (c) => c.html(methodHtml));
app.get('/faq', (c) => c.html(faqHtml));
app.get('/about', (c) => c.html(aboutHtml));

const methodHtml = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>清原メソッドとは | 清原メソッド・スクリーナー</title><meta name="description" content="清原メソッドの全7基準（時価総額・実質PER・ネットキャッシュ・成長率・オーナー企業・経営スコア）と自動化の仕組みを詳しく解説します。"><link rel="canonical" href="https://kiyohara-screener.hikakunavi360.com/method"></head><body style="font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:2rem;color:#1e293b;background:#f8fafc"><h1>清原メソッドとは</h1><p>清原メソッドは、伝説の投資家・清原達郎氏が著書『わが投資術 市場は誰に微笑むか』で体系化した日本株投資手法です。割安で成長性のある小型株のうち、創業家が経営に関与するオーナー企業に着目し、長期的な超過収益を狙います。</p><h2>7 つのスクリーニング基準</h2><ol><li><strong>時価総額 &lt; 2,000 億円</strong> — 小型株は成長余地が大きく市場の非効率性による割安銘柄が存在</li><li><strong>実質PER</strong> — 時価総額からネットキャッシュを差し引いた実質的な企業価値÷純利益で割安度を評価</li><li><strong>ネットキャッシュ &gt; 0</strong> — 有利子負債より現金が多く財務健全</li><li><strong>売上高成長率 &gt; 0</strong> — 過去3年平均で売上が成長</li><li><strong>営業利益成長率 &gt; 0</strong> — 利益も成長</li><li><strong>オーナー企業</strong> — 創業者/創業家が現在も経営に関与し大株主</li><li><strong>経営スコア 50点以上</strong> — EDINET 有報を AI が解析し経営品質を評価</li></ol><h2>自動化の仕組み</h2><p>データ収集→定量スクリーニング→AI定性評価→2-Tier選定→Alphaトラッキングの5ステップを平日15:00に自動実行。</p><p><a href="/">← 戻る</a></p></body></html>`;

const faqHtml = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>よくある質問 | 清原メソッド・スクリーナー</title><meta name="description" content="清原メソッド・スクリーナーのよくある質問（無料ですか？AI判定の精度は？データ更新頻度は？など）"><link rel="canonical" href="https://kiyohara-screener.hikakunavi360.com/faq"></head><body style="font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:2rem;color:#1e293b;background:#f8fafc"><h1>よくある質問</h1><h2>Q: 無料ですか？</h2><p>はい、完全無料です。</p><h2>Q: なぜ東証グロースだけ？</h2><p>清原メソッドの対象である小型株が集中しているため。</p><h2>Q: AIの判定精度は？</h2><p>EDINET有報の大株主構成・役員経歴に基づきGemini 2.5 Flashが判定。250銘柄中7件を正しく検出。</p><h2>Q: データ更新頻度は？</h2><p>平日15:00に自動スクリーニング。株価は毎日15:00に取得。</p><h2>Q: ソースコードは？</h2><p>GitHubで公開中: github.com/tachibanana0/kiyohara-method-screener</p><p><a href="/">← 戻る</a></p></body></html>`;

const aboutHtml = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>運営者情報 | 清原メソッド・スクリーナー</title><meta name="description" content="清原メソッド・スクリーナーの運営者情報・免責事項・技術スタック。Cloudflare Workers + D1 + GitHub Actions + OpenRouter。"><link rel="canonical" href="https://kiyohara-screener.hikakunavi360.com/about"></head><body style="font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:2rem;color:#1e293b;background:#f8fafc"><h1>運営者情報</h1><p>清原メソッド・スクリーナーは清原達郎氏の投資手法に基づく自動スクリーニングツールです。</p><h2>技術スタック</h2><p>Cloudflare Workers (Hono v4) / D1 (SQLite) / Pages / React 19 + Vite + Tailwind v4 / GitHub Actions / J-Quants API v2 / EDINET API v2 / Yahoo Finance / OpenRouter (Gemini 2.5 Flash)</p><h2>免責事項</h2><p>本サービスは投資助言を目的としたものではありません。実際の投資判断はご自身の責任で行ってください。清原達郎氏および関係者とは一切関係ありません。</p><p><a href="/">← 戻る</a></p></body></html>`;

export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },
};
