// web-check.mjs — correctness gate + observation for a static / single-page web product.
// Renders the page in real Chrome (Playwright, channel:'chrome' — no browser download),
// captures console/page errors, screenshots, and checks that funnel-critical strings are
// still in the DOM. Exit 0 + JSON {ok:true} when healthy; exit 1 + the same JSON otherwise.
//
// Usage: node scripts/adapters/web-check.mjs [out.png] [url]
// Env:   WEB_MUST_INCLUDE="brand,primary CTA"  (comma-separated; from loop.config.env)
//        WEB_URL=...                            (default file://$PWD/index.html)
//        WEB_VIEWPORT=430x932                   (mobile-first default)
import { chromium } from 'playwright';
import fs from 'node:fs';

// Interactive use (/loop-once, /audit) has no driver to export loop.config.env — load it here.
// Minimal KEY="value" / KEY=value parser; environment already set wins.
try {
  for (const line of fs.readFileSync('loop.config.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)=("([^"]*)"|'([^']*)'|([^#\s]*))/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[3] ?? m[4] ?? m[5] ?? '';
  }
} catch {}

const OUT = process.argv[2] || '/tmp/loop-shot.png';
const URL = process.argv[3] || process.env.WEB_URL || `file://${process.cwd()}/index.html`;
const MUST_INCLUDE = (process.env.WEB_MUST_INCLUDE || '').split(',').map((s) => s.trim()).filter(Boolean);
const [vw, vh] = (process.env.WEB_VIEWPORT || '430x932').split('x').map(Number);

const consoleErrors = [];
const pageErrors = [];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: vw, height: vh } });

// Stub analytics with an empty 204 (aborting the request emits a bogus console error).
await page.route('**/*', (route) => {
  const u = route.request().url();
  if (/googletagmanager|google-analytics|analytics\.google|stats\.g|plausible\.io|posthog/.test(u)) {
    return route.fulfill({ status: 204, body: '' });
  }
  return route.continue();
});

// Only real app-logic errors count. Resource/network load failures (fonts, CDNs) are noise.
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/Failed to load resource|net::ERR_/.test(t)) return;
  consoleErrors.push(t);
});
page.on('pageerror', (e) => pageErrors.push(String(e)));

let nav = 'ok';
try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
} catch (e) {
  nav = 'goto-failed: ' + e.message;
}
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT });

let html = '';
try { html = await page.content(); } catch {}
const missing = MUST_INCLUDE.filter((s) => !html.includes(s));

await browser.close();

const warning = MUST_INCLUDE.length ? undefined : 'WEB_MUST_INCLUDE is empty — funnel-DOM check is disabled; set it in loop.config.env';
const ok = nav === 'ok' && pageErrors.length === 0 && consoleErrors.length === 0 && missing.length === 0;
console.log(JSON.stringify({ ok, nav, consoleErrors, pageErrors, missing, warning, screenshot: OUT }, null, 2));
process.exit(ok ? 0 : 1);
