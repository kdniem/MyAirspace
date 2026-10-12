/* Browser suite (Playwright + Chromium). Run: node tools/tests/browser.mjs [--quick] [--only=<substring>]
   Starts its own static server, blocks every non-local request and fails on any attempt that is not
   on the allow-list. Failure screenshots go to tools/tests/out/ (gitignored), the report to out/report.txt.
   Playwright is resolved via PLAYWRIGHT_PATH, then normal resolution, then /opt/node22/lib/node_modules/playwright.
   Known, tracked product issues live in tools/tests/known-issues.json (reported as KNOWN, not failing). */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'tools/tests/out');
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const QUICK = args.includes('--quick');
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').slice(7);
const CONC = Number(process.env.TEST_CONCURRENCY) || Math.max(2, Math.min(6, os.cpus().length));

function loadPlaywright() {
  const cands = [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean);
  for (const c of cands) { try { return require(c); } catch (e) { /* next */ } }
  console.error('Playwright not found. Install it (npm i -g playwright) or set PLAYWRIGHT_PATH.');
  process.exit(2);
}
const { chromium } = loadPlaywright();

// ---------- inputs from the product ----------
const stylesCtx = { window: { MA: {} } };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/styles.js'), 'utf8'), stylesCtx);
const MAs = stylesCtx.window.MA;
const STYLE_NAMES = MAs.style.names();
const hasLight = (n) => MAs.style.resolve(n, 'light').theme === 'light';
let KNOWN = [];
try { KNOWN = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/tests/known-issues.json'), 'utf8')); } catch (e) { /* none */ }

// ---------- static server ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT + path.sep) || /(^|[\\/])(\.git|tools|node_modules)[\\/]/.test(f.slice(ROOT.length))) { res.writeHead(404); return res.end(); }
  fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(buf);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

// ---------- results ----------
const results = []; // {id, level: 'fail'|'known', msg}
const checked = { pages: 0 };
function isKnown(text) { return KNOWN.find((k) => new RegExp(k.match).test(text)); }
function record(id, msg) {
  const k = isKnown(id + ' ' + msg);
  results.push({ id, msg, level: k ? 'known' : 'fail', note: k && k.note });
}

// ---------- request policy ----------
const ALLOW = {
  demo: [],
  setup: [/^https:\/\/nominatim\.openstreetmap\.org\//],
  live: [/^https:\/\/myairspace-nu\.vercel\.app\/api\/proxy\?/, /^https:\/\/api\.adsb\.lol\/api\/0\/route\//]
};
async function newPage(browser, vp, mode) {
  const ctx = await browser.newContext({ viewport: vp, serviceWorkers: 'block', deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const st = { errors: [], blocked: [], dialogs: 0, local404: [], reqs: [] };
  page.on('pageerror', (e) => st.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) st.errors.push('console.error: ' + m.text()); });
  page.on('dialog', (d) => { st.dialogs++; d.dismiss().catch(() => {}); });
  page.on('response', (r) => { if (r.url().startsWith(BASE) && r.status() >= 400) st.local404.push(r.status() + ' ' + r.url().replace(BASE, '')); });
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('about:')) return route.continue();
    st.reqs.push(u);
    if (ALLOW[mode].some((re) => re.test(u))) {
      if (/nominatim/.test(u)) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      if (/\/route\//.test(u)) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      if (/aviationweather/.test(decodeURIComponent(u))) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ac":[],"now":0,"total":0}' });
    }
    st.blocked.push(u);
    return route.abort('blockedbyclient');
  });
  return { ctx, page, st };
}
async function shot(page, id) {
  fs.mkdirSync(OUT, { recursive: true });
  try { await page.screenshot({ path: path.join(OUT, id.replace(/[^a-z0-9._-]+/gi, '_') + '.png') }); } catch (e) { /* page gone */ }
}
function collect(st, extra) {
  for (const e of st.errors) extra.push(e);
  for (const u of st.blocked) extra.push('forbidden request: ' + u);
  for (const u of st.local404) extra.push('local ' + u);
  if (st.dialogs) extra.push(st.dialogs + ' dialog(s) opened');
}

// ---------- in-page probes ----------
const PROBE = () => {
  const out = { overlap: [], clipped: [], contrast: [], canvas: null, offscreen: [] };
  const vis = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false;
    }
    return true;
  };
  const textRect = (el) => {
    const r = document.createRange(); r.selectNodeContents(el);
    const b = r.getBoundingClientRect();
    return b.width > 0 && b.height > 0 && (el.textContent || '').trim() ? b : null;
  };
  const name = (el) => el.id ? '#' + el.id : '.' + String(el.className).trim().split(/\s+/).join('.');
  // header overlap
  const hdr = ['.brand-tag', '#place', '#title', '#clock', '#clock-tz', '#utc', '#summary', '#wx-metar', '#wx-rwy']
    .map((s) => document.querySelector(s)).filter((e) => e && vis(e)).map((e) => ({ e, r: textRect(e) })).filter((x) => x.r);
  for (let i = 0; i < hdr.length; i++) for (let j = i + 1; j < hdr.length; j++) {
    const a = hdr[i].r, b = hdr[j].r, ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (ox > 1 && oy > 1) out.overlap.push(name(hdr[i].e) + ' x ' + name(hdr[j].e) + ' (' + Math.round(ox) + 'x' + Math.round(oy) + 'px)');
  }
  // clipped text in the board cells (and the log table of the Anzeigetafel)
  document.querySelectorAll('.cell .val, .cell .led, .cell .sub, #lv-rows .c, .lv-head .c, .lv-heading').forEach((e) => {
    if (!vis(e) || !(e.textContent || '').trim()) return;
    if (e.scrollWidth > e.clientWidth + 1) out.clipped.push(name(e) + ' "' + e.textContent.trim().slice(0, 24) + '" scrollWidth ' + e.scrollWidth + ' > clientWidth ' + e.clientWidth);
  });
  // header/board content must stay inside the viewport
  document.querySelectorAll('#top .brand, #top .meta, #board .board-inner, #logview').forEach((e) => {
    if (!vis(e)) return;
    const r = e.getBoundingClientRect();
    if (r.left < -8 || r.right > innerWidth + 8 || r.bottom > innerHeight + 8 /* +-6px burn-in drift */) out.offscreen.push(name(e) + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(','));
  });
  // contrast of key text against its effective background
  const rgb = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(parseFloat); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const over = (f, b) => [0, 1, 2].map((i) => f[i] * f[3] + b[i] * (1 - f[3]));
  const bgOf = (el) => {
    const stack = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c && c[3] > 0) { stack.push(c); if (c[3] >= 1) break; } }
    let base = [255, 255, 255];
    for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base);
    return base;
  };
  const lum = (c) => { const f = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
  // [selector, minimum]: 3:1 for large display values (as in tools/contrast.mjs), 4.5:1 for text
  [['#place', 4.5], ['#clock', 3], ['#summary-text', 4.5], ['#b-flight', 3], ['#b-route', 3], ['.cell-flight .lbl', 4.5], ['#b-airline', 4.5], ['#lv-heading', 3], ['#lv-rows .c-flight', 4.5], ['.lv-head .c', 4.5]].forEach((pair) => {
    const s = pair[0];
    const e = document.querySelector(s);
    if (!e || !vis(e) || !(e.textContent || '').trim()) return;
    const f = rgb(getComputedStyle(e).color); if (!f) return;
    const bg = bgOf(e), fg = over(f, bg), L1 = lum(fg), L2 = lum(bg);
    out.contrast.push({ s, min: pair[1], ratio: Math.round((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05) * 100) / 100 });
  });
  // canvas: downsample and measure luminance spread
  const cv = document.getElementById('radar');
  if (cv && cv.width > 0 && vis(cv)) {
    const t = document.createElement('canvas'); t.width = 64; t.height = 36;
    const c = t.getContext('2d'); c.drawImage(cv, 0, 0, 64, 36);
    const d = c.getImageData(0, 0, 64, 36).data; let sum = 0, sq = 0, n = 0; const seen = {};
    for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; sum += l; sq += l * l; n++; seen[(d[i] >> 3) + ',' + (d[i + 1] >> 3) + ',' + (d[i + 2] >> 3)] = 1; }
    const mean = sum / n;
    out.canvas = { std: Math.round(Math.sqrt(sq / n - mean * mean) * 100) / 100, colors: Object.keys(seen).length };
  }
  return out;
};

// ---------- matrix test ----------
async function matrixCase(browser, c) {
  const id = [c.style, c.theme, c.vp.w + 'x' + c.vp.h, c.view].join('_');
  const { ctx, page, st } = await newPage(browser, { width: c.vp.w, height: c.vp.h }, 'demo');
  const problems = [];
  try {
    await page.goto(BASE + '/index.html?demo=1&style=' + c.style + '&theme=' + c.theme + '&view=' + c.view, { waitUntil: 'load' });
    await page.waitForTimeout(3500);
    const r = await page.evaluate(PROBE);
    collect(st, problems);
    r.overlap.forEach((m) => problems.push('header overlap: ' + m));
    r.clipped.forEach((m) => problems.push('clipped: ' + m));
    r.offscreen.forEach((m) => problems.push('outside viewport: ' + m));
    r.contrast.forEach((x) => { if (x.ratio < x.min) problems.push('contrast ' + x.s + ' = ' + x.ratio + ':1 < ' + x.min); });
    if (c.view === 'radar') {
      if (!r.canvas) problems.push('canvas missing or hidden');
      else if (r.canvas.std < 1.5 || r.canvas.colors < 6) problems.push('canvas looks blank (std ' + r.canvas.std + ', colors ' + r.canvas.colors + ')');
    } else if (!(await page.evaluate(() => document.body.classList.contains('view-board')))) {
      problems.push('view=board did not show the Anzeigetafel');
    }
    checked.pages++;
    if (problems.length) { problems.forEach((p) => record(id, p)); await shot(page, id); }
  } catch (e) {
    record(id, 'test crashed: ' + e.message); await shot(page, id);
  } finally { await ctx.close(); }
}

// ---------- setup page ----------
async function setupCase(browser, vp) {
  const id = 'setup_' + vp.width + 'x' + vp.height;
  const { ctx, page, st } = await newPage(browser, vp, 'setup');
  const problems = [];
  try {
    await page.goto(BASE + '/setup.html?demo=1', { waitUntil: 'load' });
    await page.waitForTimeout(500);
    await page.fill('#lat', '53.55');
    await page.fill('#lon', '9.99');
    await page.check('input[name=style][value=boeing]', { force: true });
    await page.check('input[name=accent][value=amber]', { force: true });
    await page.waitForTimeout(3000);
    const info = await page.evaluate(() => {
      const f = document.getElementById('frame'); let loaded = false; const src = f.getAttribute('src') || '';
      try { loaded = !!f.contentDocument && !!f.contentDocument.getElementById('radar') && f.contentDocument.readyState === 'complete'; } catch (e) { loaded = false; }
      return { url: document.getElementById('url').textContent, src, loaded, sw: document.documentElement.scrollWidth, iw: innerWidth };
    });
    collect(st, problems);
    if (info.sw > info.iw) problems.push('horizontal scroll: scrollWidth ' + info.sw + ' > ' + info.iw);
    if (!/index\.html\?/.test(info.src)) problems.push('preview iframe has no src: ' + info.src);
    else if (!info.loaded) problems.push('preview iframe did not load the radar');
    if (!/style=boeing/.test(info.url)) problems.push('generated URL lacks style=boeing: ' + info.url);
    if (!/accent=amber/.test(info.url)) problems.push('generated URL lacks accent=amber: ' + info.url);
    if (!/lat=53\.5/.test(info.url) || !/lon=9\.9/.test(info.url)) problems.push('generated URL lacks the location: ' + info.url);
    checked.pages++;
    if (problems.length) { problems.forEach((p) => record(id, p)); await shot(page, id); }
  } catch (e) {
    record(id, 'test crashed: ' + e.message); await shot(page, id);
  } finally { await ctx.close(); }
}

// ---------- hostile parameters ----------
const HOSTILE = [
  'title=' + encodeURIComponent('<img src=x onerror="window.__pwn=1;alert(1)">'),
  'label=' + encodeURIComponent('<svg onload=window.__pwn=1>'),
  'accent=' + encodeURIComponent('red;}body{display:none}x{'),
  'accent=' + encodeURIComponent('url(javascript:window.__pwn=1)'),
  'accent=' + encodeURIComponent('#fff;background:url(//evil.example/x)'),
  'style=__proto__', 'style=constructor', 'style=toString', 'font=__proto__', 'theme=__proto__',
  'datablock=__proto__,constructor,callsign', 'show=__proto__,hasOwnProperty', 'hide=__proto__',
  'proxy=' + encodeURIComponent('https://evil.example/p'), 'provider=__proto__',
  'lat=1e999&lon=NaN', 'r=-5', 'night=' + encodeURIComponent('<b>'), 'view=__proto__', 'speed=__proto__&pressure=__proto__&time=__proto__'
];
async function hostileCase(browser, which, qs) {
  const id = 'hostile_' + which + '_' + qs.slice(0, 40);
  const { ctx, page, st } = await newPage(browser, { width: 1280, height: 720 }, which === 'setup' ? 'setup' : 'demo');
  const problems = [];
  try {
    await page.goto(BASE + '/' + (which === 'setup' ? 'setup.html' : 'index.html') + '?demo=1&' + qs, { waitUntil: 'load' });
    await page.waitForTimeout(which === 'setup' ? 1800 : 1800);
    const r = await page.evaluate(() => {
      const sel = 'img[src="x"], [onerror], [onload], script:not([src])';
      let inj = document.querySelectorAll(sel).length, pwn = !!window.__pwn;
      const f = document.getElementById('frame');
      try { if (f && f.contentDocument) { inj += f.contentDocument.querySelectorAll(sel).length; pwn = pwn || !!f.contentWindow.__pwn; } } catch (e) { /* cross-origin */ }
      return { pwn, inj, hidden: getComputedStyle(document.body).display === 'none' };
    });
    collect(st, problems);
    if (r.pwn) problems.push('script executed (window.__pwn set)');
    if (r.inj) problems.push(r.inj + ' injected element(s) with handlers');
    if (r.hidden) problems.push('CSS injection hid the body');
    const evil = st.reqs.filter((u) => /evil\.example/.test(u));
    if (evil.length) problems.push('request to attacker host attempted: ' + evil.join(', '));
    checked.pages++;
    if (problems.length) { problems.forEach((p) => record(id, p)); await shot(page, id); }
  } catch (e) {
    record(id, 'test crashed: ' + e.message);
  } finally { await ctx.close(); }
}

// ---------- live-mode request allow-list ----------
async function liveCase(browser) {
  const id = 'live_requests';
  const { ctx, page, st } = await newPage(browser, { width: 1280, height: 720 }, 'live');
  const problems = [];
  try {
    await page.goto(BASE + '/index.html?lat=53.55&lon=9.99&label=Test', { waitUntil: 'load' });
    await page.waitForTimeout(3000);
    collect(st, problems);
    if (!st.reqs.some((u) => /myairspace-nu\.vercel\.app\/api\/proxy/.test(u))) problems.push('live mode never asked the default proxy (requests: ' + st.reqs.join(' | ') + ')');
    checked.pages++;
    if (problems.length) { problems.forEach((p) => record(id, p)); await shot(page, id); }
  } catch (e) { record(id, 'test crashed: ' + e.message); } finally { await ctx.close(); }
}

// ---------- run ----------
const t0 = Date.now();
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const jobs = [];
const VPS = QUICK ? [{ w: 1920, h: 1080 }] : [{ w: 1920, h: 1080 }, { w: 1280, h: 720 }, { w: 3840, h: 2160 }];
for (const style of STYLE_NAMES) for (const theme of hasLight(style) ? ['dark', 'light'] : ['dark'])
  for (const vp of VPS) for (const view of ['radar', 'board']) jobs.push({ n: [style, theme, vp.w, view].join('_'), run: () => matrixCase(browser, { style, theme, vp, view }) });
jobs.push({ n: 'setup_390', run: () => setupCase(browser, { width: 390, height: 844 }) }, { n: 'setup_1280', run: () => setupCase(browser, { width: 1280, height: 800 }) }, { n: 'live', run: () => liveCase(browser) });
for (const h of HOSTILE) { jobs.push({ n: 'hostile_index_' + h, run: () => hostileCase(browser, 'index', h) }); jobs.push({ n: 'hostile_setup_' + h, run: () => hostileCase(browser, 'setup', h) }); }
const filtered = ONLY ? jobs.filter((j) => j.n.indexOf(ONLY) >= 0) : jobs;
let next = 0;
await Promise.all(Array.from({ length: CONC }, async () => { while (next < filtered.length) await filtered[next++].run(); }));
await browser.close();
server.close();

// ---------- report ----------
const fails = results.filter((r) => r.level === 'fail'), known = results.filter((r) => r.level === 'known');
const lines = [];
lines.push('browser: ' + checked.pages + ' page loads in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s (concurrency ' + CONC + '), ' + fails.length + ' failing check(s), ' + known.length + ' known issue(s)');
for (const [title, arr] of [['FAIL', fails], ['KNOWN', known]]) {
  const g = {};
  arr.forEach((r) => { const k = r.msg.replace(/\d+/g, '#').replace(/"[^"]*"/g, '"..."'); (g[k] = g[k] || []).push(r); });
  Object.keys(g).forEach((k) => {
    lines.push(title + ' x' + g[k].length + '  ' + g[k][0].msg + (g[k][0].note ? '  [' + g[k][0].note + ']' : '') + '\n      e.g. ' + g[k].slice(0, 4).map((r) => r.id).join(', '));
  });
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'report.txt'), lines.join('\n') + '\n\nAll findings:\n' + results.map((r) => r.level.toUpperCase() + ' ' + r.id + ': ' + r.msg).join('\n') + '\n');
console.log(lines.join('\n'));
if (results.length) console.log('Full list: tools/tests/out/report.txt (screenshots next to it)');
process.exit(fails.length ? 1 : 0);
