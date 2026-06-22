#!/usr/bin/env node
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const API_BASE = process.env.SCREENING_API_URL || process.env.VITE_API_BASE || 'https://kiyohara-method-screener.tachibanananana.workers.dev';
const TOKEN = process.env.SCREENING_API_TOKEN || '';
const OUT_FILE = resolve(process.cwd(), '.picks-cache.json');
const SITEMAP_FILE = resolve(process.cwd(), 'public', 'sitemap.xml');
const SITE_BASE = 'https://kiyohara-screener.hikakunavi360.com';

console.log(`[fetch-picks] API: ${API_BASE}`);

async function fetchPicks() {
  try {
    const headers = TOKEN ? { 'Authorization': `Bearer ${TOKEN}` } : {};
    const res = await fetch(`${API_BASE}/api/picks?limit=1000`, { headers });
    if (!res.ok) {
      console.warn(`[fetch-picks] API returned ${res.status}, writing empty cache`);
      writeFileSync(OUT_FILE, '[]', 'utf-8');
      return [];
    }
    const picks = await res.json();
    const filtered = Array.isArray(picks)
      ? picks.filter((p) => p && p.code)
      : [];
    writeFileSync(OUT_FILE, JSON.stringify(filtered), 'utf-8');
    console.log(`[fetch-picks] Wrote ${filtered.length} picks to ${OUT_FILE}`);
    return filtered;
  } catch (err) {
    console.warn(`[fetch-picks] Failed: ${err.message}, writing empty cache`);
    writeFileSync(OUT_FILE, '[]', 'utf-8');
    return [];
  }
}

function generateSitemap(picks) {
  const staticPages = [
    { loc: '/', changefreq: 'daily', priority: '1.0' },
    { loc: '/dashboard', changefreq: 'daily', priority: '0.9' },
    { loc: '/method', changefreq: 'weekly', priority: '0.8' },
    { loc: '/faq', changefreq: 'weekly', priority: '0.7' },
    { loc: '/about', changefreq: 'monthly', priority: '0.6' },
  ];
  const stockPages = picks.map((p) => ({
    loc: `/picks/${p.code}`,
    changefreq: 'daily',
    priority: '0.6',
    lastmod: p.picked_at ? p.picked_at.replace(' ', 'T') + '+09:00' : undefined,
  }));
  const all = [...staticPages, ...stockPages];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${all
  .map(
    (u) => `  <url>
    <loc>${SITE_BASE}${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
  </url>`,
  )
  .join('\n')}
</urlset>
`;
  writeFileSync(SITEMAP_FILE, xml, 'utf-8');
  console.log(`[fetch-picks] Wrote sitemap with ${all.length} URLs to ${SITEMAP_FILE}`);
}

const picks = await fetchPicks();
generateSitemap(picks);
