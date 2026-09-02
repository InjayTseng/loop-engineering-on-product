// Web adapter for the improvement loop — the build+correctness gate for a static site.
// Loads index.html in real Chrome, captures console/page errors, screenshots, and
// checks funnel-critical DOM is intact. Exits non-zero + prints a JSON report on failure.
//
// Usage: node Scripts/web-check.mjs [out.png] [url]
import { chromium } from 'playwright';

const OUT = process.argv[2] || '/tmp/ft-shot.png';
const URL = process.argv[3] || `file://${process.cwd()}/index.html`;

// Funnel-integrity signals: if any of these vanish, a JS/markup edit broke the page.
const MUST_INCLUDE = ['<brand — redacted>', '開始排盤', '稟報生辰'];

const consoleErrors = [];
const pageErrors = [];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 430, height: 932 } });

// Stub analytics with an empty 204 (not abort — abort emits a bogus console error).
await page.route('**/*', (route) => {
  const u = route.request().url();
  if (/googletagmanager|google-analytics|analytics\.google|stats\.g/.test(u)) {
    return route.fulfill({ status: 204, body: '' });
  }
  return route.continue();
});

// Capture only real app-logic errors. Resource/network load failures (fonts, CDNs)
// are not logic breakage, so they're filtered out.
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

const ok =
  nav === 'ok' &&
  pageErrors.length === 0 &&
  consoleErrors.length === 0 &&
  missing.length === 0;

console.log(JSON.stringify({ ok, nav, consoleErrors, pageErrors, missing, screenshot: OUT }, null, 2));
process.exit(ok ? 0 : 1);
