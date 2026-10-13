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
  setup: [/^https:\/\/nominatim\.openstreetmap\.org\//, /^https:\/\/myairspace-nu\.vercel\.app\/api\/proxy\?/],   // the preview runs live (mocked)
  live: [/^https:\/\/myairspace-nu\.vercel\.app\/api\/proxy\?/, /^https:\/\/api\.adsb\.lol\/api\/0\/route\//]
};
async function newPage(browser, vp, mode, geo, extra) {
  const ctx = await browser.newContext(Object.assign({ viewport: vp, serviceWorkers: 'block', deviceScaleFactor: 1 }, extra || {}, geo ? { permissions: ['geolocation'], geolocation: { latitude: 53.5511, longitude: 9.9937 } } : {}));
  const page = await ctx.newPage();
  const st = { errors: [], blocked: [], dialogs: 0, local404: [], reqs: [], nom: '[]' };
  page.on('pageerror', (e) => st.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) st.errors.push('console.error: ' + m.text()); });
  page.on('dialog', (d) => { st.dialogs++; d.dismiss().catch(() => {}); });
  page.on('response', (r) => { if (r.url().startsWith(BASE) && r.status() >= 400) st.local404.push(r.status() + ' ' + r.url().replace(BASE, '')); });
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('about:')) return route.continue();
    st.reqs.push(u);
    if (ALLOW[mode].some((re) => re.test(u))) {
      if (/nominatim.*reverse/.test(u)) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"address":{"city":"Hamburg"}}' });
      if (/nominatim/.test(u)) return route.fulfill({ status: 200, contentType: 'application/json', body: st.nom });
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
    await page.goto(BASE + '/setup.html?demo=1&wizard=0', { waitUntil: 'load' });
    await page.waitForTimeout(500);
    await page.fill('#lat', '53.55');
    await page.fill('#lon', '9.99');
    await page.check('input[name=style][value=eicam-boeing]', { force: true });
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
    if (!/style=eicam-boeing/.test(info.url)) problems.push('generated URL lacks style=eicam-boeing: ' + info.url);
    if (!/accent=amber/.test(info.url)) problems.push('generated URL lacks accent=amber: ' + info.url);
    // focus view choice: the address gets view=airport and the airport, the airport row shows up
    await page.selectOption('#view-sel', 'airport');
    await page.selectOption('#airport-sel', 'FRA');
    await page.waitForTimeout(300);
    const u2 = await page.textContent('#url');
    if (!/view=airport/.test(u2) || !/airport=FRA/.test(u2)) problems.push('generated URL lacks the focus view: ' + u2);
    if (!(await page.locator('#airport-field').isVisible())) problems.push('airport choice hidden in the focus view');
    // the rotation with the focus view: views= and the airport, the duration sliders show up
    await page.selectOption('#view-sel', 'rot3');
    await page.waitForTimeout(300);
    const u3 = await page.textContent('#url');
    if (!/views=radar(%2C|,)board(%2C|,)airport/.test(u3) || !/airport=FRA/.test(u3)) problems.push('generated URL lacks the rotation: ' + u3);
    if (!(await page.locator('#rot-field').isVisible())) problems.push('rotation durations hidden in a rotation preset');
    if (!(await page.locator('#airportsec-row').isVisible())) problems.push('airport duration hidden in the rotation with the airport');
    await page.selectOption('#view-sel', 'rot2');
    await page.waitForTimeout(300);
    const u4 = await page.textContent('#url');
    if (/views=|airport=|airportsec=/.test(u4)) problems.push('default rotation writes non-default options: ' + u4);
    if (!/lat=53\.5/.test(u4)) problems.push('default rotation URL lost its location: ' + u4);
    if (!/lat=53\.5/.test(info.url) || !/lon=9\.9/.test(info.url)) problems.push('generated URL lacks the location: ' + info.url);
    checked.pages++;
    if (problems.length) { problems.forEach((p) => record(id, p)); await shot(page, id); }
  } catch (e) {
    record(id, 'test crashed: ' + e.message); await shot(page, id);
  } finally { await ctx.close(); }
}

// ---------- guided setup: the whole journey ----------
const SHOTS = process.env.JOURNEY_SHOTS || '';
async function journeyCase(browser, vp) {
  const id = 'journey_' + vp.width + 'x' + vp.height;
  const { ctx, page, st } = await newPage(browser, vp, 'setup', true);
  st.nom = JSON.stringify([{ lat: '53.55', lon: '10.0', name: '<img src=x onerror="window.__pwn=1">', display_name: '<img src=x onerror="window.__pwn=1">, Hamburg' }]);
  const problems = [];
  const vis = (sel) => page.locator(sel).first().isVisible();
  const stepIs = async (n, what) => { const got = await page.getAttribute('body', 'data-step'); if (got !== n) problems.push(what + ': expected step ' + n + ', got ' + got); };
  const snap = async (n) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.waitForTimeout(700); await page.screenshot({ path: path.join(SHOTS, vp.width + '_' + n + '.png') }); } };
  const noHScroll = async (what) => { const r = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); if (r[0] > r[1]) problems.push('horizontal scroll at ' + what + ': ' + r[0] + ' > ' + r[1]); };
  const focusOk = async (what) => { const t = await page.evaluate(() => { const a = document.activeElement; return a && a.tagName === 'H2' ? 'ok' : (a ? a.tagName : 'none'); }); if (t !== 'ok') problems.push('focus not on the step heading after ' + what + ' (' + t + ')'); };
  try {
    await page.goto(BASE + '/setup.html', { waitUntil: 'load' });
    await stepIs('welcome', 'start');
    if (!(await vis('#frame'))) problems.push('welcome: preview missing');
    await page.waitForTimeout(2500);
    const wsrc = await page.getAttribute('#frame', 'src');
    if (!/demo=1/.test(wsrc || '')) problems.push('welcome preview is not the demo: ' + wsrc);
    if (await vis('#wz-back')) problems.push('welcome shows Zurück');
    if (!(await vis('#wz-all'))) problems.push('welcome lacks the expert link');
    await noHScroll('welcome'); await snap('0_welcome');
    await page.click('#wz-next');
    await stepIs('standort', 'next'); await focusOk('Los geht’s');
    if ((await page.textContent('#wz-step')).indexOf('Schritt 1 von 5') < 0) problems.push('progress text: ' + (await page.textContent('#wz-step')));
    if ((await page.getAttribute('#wz-next', 'aria-disabled')) !== 'true') problems.push('Weiter is not disabled without a location');
    await page.click('#wz-next', { force: true });   // aria-disabled: the click must not leave the step
    await stepIs('standort', 'blocked next');
    await snap('1_standort');
    // hostile search result stays inert text
    await page.fill('#search', 'hamburg');
    await page.waitForSelector('#results button', { timeout: 6000 });
    if (await page.locator('#results img').count()) problems.push('search result rendered markup');
    await page.click('#results button');
    if (await page.locator('#place-card img').count()) problems.push('place card rendered markup');
    // GPS
    await page.click('#geo');
    await page.waitForFunction(() => /übernommen/.test(document.getElementById('geo-status').textContent), null, { timeout: 5000 }).catch(() => problems.push('GPS did not report success'));
    await page.waitForTimeout(1500);
    // manual coordinates
    await page.click('#coords summary');
    await page.fill('#lat', '53.55');
    await page.fill('#lon', '9.99');
    if ((await page.getAttribute('#wz-next', 'aria-disabled')) === 'true') problems.push('Weiter stays disabled with a location');
    if (!(await page.textContent('#place-name')).trim()) problems.push('chosen place name is empty');
    await noHScroll('standort'); await snap('1b_standort_gps');
    await page.click('#wz-next');
    await stepIs('look', 'to look'); await focusOk('Weiter');
    await page.waitForTimeout(800);
    const minis = await page.evaluate(() => Array.from(document.querySelectorAll('.stylecard canvas')).map((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const seen = {}; for (let i = 0; i < d.length; i += 400) seen[d[i] + ',' + d[i + 1]] = 1; return Object.keys(seen).length; }));
    if (minis.length !== STYLE_NAMES.length || minis.some((n) => n < 6)) problems.push('style mini previews missing or blank: ' + minis.join(','));
    await page.click('.stylecard[data-style=eicam-boeing]');
    await page.click('input[name=accent][value=cyan]', { force: true });
    await noHScroll('look'); await snap('2_look');
    await page.click('#wz-next');
    await stepIs('inhalt', 'to inhalt');
    await page.click('#elements-main .switch:nth-child(3)');   // Spuren off
    await page.locator('#radius').evaluate((e) => { e.value = '30'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await noHScroll('inhalt'); await snap('3_inhalt');
    // Back keeps state
    await page.click('#wz-back');
    await page.waitForFunction(() => document.body.dataset.step === 'look', null, { timeout: 3000 }).catch(() => {});
    await stepIs('look', 'back');
    if (!(await page.isChecked('input[name=style][value=eicam-boeing]'))) problems.push('Back lost the style choice');
    await page.click('#wz-back');
    await page.waitForFunction(() => document.body.dataset.step === 'standort', null, { timeout: 3000 }).catch(() => {});
    await stepIs('standort', 'back 2');
    if ((await page.inputValue('#lat')) !== '53.55') problems.push('Back lost the location');
    await page.click('#wz-next'); await page.click('#wz-next');
    await stepIs('inhalt', 'again to inhalt');
    await page.evaluate(() => history.back());   // browser Back re-renders the previous step
    await page.waitForFunction(() => document.body.dataset.step !== 'inhalt', null, { timeout: 3000 }).catch(() => {});
    if ((await page.getAttribute('body', 'data-step')) === 'inhalt') problems.push('browser Back did not change the step');
    await page.evaluate(() => history.forward());
    await page.waitForFunction(() => document.body.dataset.step === 'inhalt', null, { timeout: 3000 }).catch(() => {});
    if (await page.locator('#elements-main .switch:nth-child(3) input').isChecked()) problems.push('Back lost the toggle state');
    await page.click('#wz-next');
    await stepIs('fernseher', 'to fernseher');
    const url = await page.textContent('#url');
    if (!/lat=53\.5/.test(url) || !/lon=9\.9/.test(url)) problems.push('URL lacks the location: ' + url);
    if (!/style=eicam-boeing/.test(url)) problems.push('URL lacks the style: ' + url);
    if (!/trails=0/.test(url)) problems.push('URL lacks trails=0: ' + url);
    if (!/r=30/.test(url)) problems.push('URL lacks r=30: ' + url);
    if (!(await page.locator('#qr svg').count())) problems.push('QR code missing');
    if (await vis('#frame')) problems.push('preview still visible on the TV step');
    const before = await page.locator('#device-steps li').count();
    await page.click('label.device:nth-child(2)');
    const apple = await page.textContent('#device-steps');
    if (!/AirPlay|Kontrollzentrum/.test(apple) || before < 3) problems.push('device chooser did not change the steps');
    for (const nm of ['label.device:nth-child(3)', 'label.device:nth-child(4)']) { await page.click(nm); if (!(await page.locator('#device-steps li').count())) problems.push('device ' + nm + ' has no steps'); }
    await noHScroll('fernseher'); await snap('4_fernseher');
    await page.click('#wz-next');
    await stepIs('fertig', 'to fertig');
    if (!(await vis('#wz-test')) || !/lat=53/.test(await page.getAttribute('#wz-test', 'href'))) problems.push('Testen link missing or without the address');
    if ((await page.locator('#tips li').count()) !== 3) problems.push('expected 3 tips');
    await noHScroll('fertig'); await snap('5_fertig');
    // resume after reload (sessionStorage)
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(500);
    await stepIs('fertig', 'resume');
    if (!/style=eicam-boeing/.test(await page.getAttribute('#wz-test', 'href'))) problems.push('resume lost the choices');
    if (/lat=/.test(await page.evaluate(() => location.search))) problems.push('resumed session left lat/lon in the address bar');
    // all settings, hostile label
    await page.click('#wz-all');
    await stepIs('all', 'all settings');
    await page.fill('#label', '<svg onload=window.__pwn=1>');
    await page.waitForTimeout(500);
    await noHScroll('alle'); await snap('6_alle');
    if (!(await vis('#night-from')) || !(await vis('#fields'))) problems.push('all settings lack extra controls');
    const pwn = await page.evaluate(() => !!window.__pwn || document.querySelectorAll('img[src="x"], [onerror], [onload]').length);
    if (pwn) problems.push('hostile text became active');
    // deep links
    await page.goto(BASE + '/setup.html?lat=50.03&lon=8.57&demo=1', { waitUntil: 'load' });
    await stepIs('all', 'deep link with location');
    await page.evaluate(() => sessionStorage.clear());
    await page.goto(BASE + '/setup.html?wizard=1&demo=1#fernseher', { waitUntil: 'load' });
    await stepIs('standort', 'deep link to a step that needs a location');
    collect(st, problems);
    checked.pages++;
    if (problems.length) { problems.forEach((p) => record(id, p)); await shot(page, id); }
  } catch (e) {
    problems.forEach((p) => record(id, p));
    record(id, 'test crashed: ' + e.message); await shot(page, id);
  } finally { await ctx.close(); }
}

// ---------- focus view (view=airport): one airport, apron, corridors, aircraft and the header ----------
async function airportCase(browser, code, vp) {
  const id = 'airport_' + code + '_' + vp.width + 'x' + vp.height;
  const { ctx, page, st } = await newPage(browser, { width: vp.width, height: vp.height }, 'demo');
  const problems = [];
  try {
    await page.goto(BASE + '/index.html?demo=1&view=airport&airport=' + code + '&style=tower', { waitUntil: 'load' });
    await page.waitForTimeout(3500);
    const r = await page.evaluate(PROBE);
    collect(st, problems);
    r.overlap.forEach((m) => problems.push('header overlap: ' + m));
    r.offscreen.forEach((m) => problems.push('outside viewport: ' + m));
    if (!r.canvas) problems.push('canvas missing or hidden');
    else if (r.canvas.std < 1.5 || r.canvas.colors < 6) problems.push('canvas looks blank (std ' + r.canvas.std + ', colors ' + r.canvas.colors + ')');
    const s = await page.evaluate(() => {
      const hdr = ['#place', '#title', '#clock', '#clock-tz', '#utc', '#summary-text', '#wx-metar', '#wx-rwy'];
      const bad = [];
      hdr.forEach((sel) => {
        const e = document.querySelector(sel);
        if (!e || !e.textContent.trim() || getComputedStyle(e).display === 'none') return;
        const b = e.getBoundingClientRect();
        if (b.left < 0 || b.right > innerWidth || b.top < 0 || b.bottom > innerHeight) bad.push(sel + ' outside the screen');
        if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible') bad.push(sel + ' clipped');
      });
      return {
        view: document.body.classList.contains('view-airport'),
        sum: document.getElementById('summary-text').textContent,
        place: document.getElementById('place').textContent,
        board: getComputedStyle(document.getElementById('board')).display,
        overlay: document.body.classList.contains('view-board'),
        bad: bad
      };
    });
    if (!s.view) problems.push('focus view class missing');
    if (s.overlay) problems.push('Anzeigetafel overlay in the focus view');
    if (s.board !== 'none') problems.push('board still visible in the focus view');
    if (!/^\d+ im Anflug · \d+ am Boden$/.test(s.sum)) problems.push('summary lacks the counts: ' + s.sum);
    if (!s.place) problems.push('airport name missing');
    s.bad.forEach((m) => problems.push('header: ' + m));
    checked.pages++;
    if (problems.length) { problems.forEach((p) => record(id, p)); await shot(page, id); }
  } catch (e) {
    record(id, 'test crashed: ' + e.message); await shot(page, id);
  } finally { await ctx.close(); }
}

// ---------- rotation with the focus view: the canvas switches after radarsec, the body gets view-airport ----------
async function rotationCase(browser) {
  const id = 'rotation_airport_1280x720';
  const { ctx, page, st } = await newPage(browser, { width: 1280, height: 720 }, 'demo');
  const problems = [];
  try {
    await page.goto(BASE + '/index.html?demo=1&views=radar,airport&radarsec=10&airportsec=10', { waitUntil: 'load' });
    await page.waitForTimeout(1000);
    if (await page.evaluate(() => document.body.classList.contains('view-airport'))) problems.push('focus view on before the first switch');
    await page.waitForTimeout(12500);   // radar 10 s, then the 1.2 s fade to the focus view
    const s = await page.evaluate(() => ({
      view: document.body.classList.contains('view-airport'),
      board: getComputedStyle(document.getElementById('board')).display,
      opacity: getComputedStyle(document.getElementById('radar')).opacity,
      place: document.getElementById('place').textContent,
      attrib: document.getElementById('attrib').textContent
    }));
    collect(st, problems);
    if (!s.view) problems.push('body has no view-airport after the switch');
    if (s.board !== 'none') problems.push('board visible in the focus view');
    if (s.opacity !== '1') problems.push('canvas not back at full opacity after the fade: ' + s.opacity);
    if (s.place !== 'HAMBURG') problems.push('header does not show the airport: ' + s.place);
    if (!/OpenStreetMap/.test(s.attrib)) problems.push('attribution lacks the OpenStreetMap credit in the focus view');
    checked.pages++;
    if (problems.length) { problems.forEach((p) => record(id, p)); await shot(page, id); }
  } catch (e) {
    record(id, 'test crashed: ' + e.message); await shot(page, id);
  } finally { await ctx.close(); }
}

// ---------- TV first-run welcome overlay ----------
async function hintCase(browser) {
  const id = 'tv_welcome';
  const { ctx, page, st } = await newPage(browser, { width: 1920, height: 1080 }, 'live');   // live: the second load asks the (mocked) proxy
  const problems = [];
  try {
    await page.goto(BASE + '/index.html', { waitUntil: 'load' });
    await page.waitForTimeout(3500);
    const r = await page.evaluate(() => { const h = document.getElementById('hint'); return h ? { qr: !!h.querySelector('svg'), op: getComputedStyle(h).opacity, text: h.textContent } : null; });
    if (!r) problems.push('no welcome overlay without a location');
    else {
      if (!r.qr) problems.push('welcome overlay has no QR code');
      if (!/Willkommen bei MyAirspace/.test(r.text) || !/setup\.html/.test(r.text)) problems.push('welcome overlay text: ' + r.text);
      if (+r.op < 0.9) problems.push('overlay not visible, opacity ' + r.op);
    }
    if (!(await page.evaluate(() => document.getElementById('radar').width))) problems.push('no radar behind the overlay');
    await page.goto(BASE + '/index.html?lat=53.55&lon=9.99', { waitUntil: 'load' });
    await page.waitForTimeout(800);
    if (await page.evaluate(() => { const h = document.getElementById('hint'); return !!h && /Willkommen/.test(h.textContent); })) problems.push('welcome overlay shown although a location is set');
    collect(st, problems);
    checked.pages++;
    if (problems.length) { problems.forEach((p) => record(id, p)); await shot(page, id); }
  } catch (e) { record(id, 'test crashed: ' + e.message); } finally { await ctx.close(); }
}

// ---------- canvas resolution: backing store vs CSS size (js/render-scale.js) ----------
async function resCase(browser) {
  const id = 'canvas_res';
  const problems = [];
  const measure = async (qs, dpr) => {
    const { ctx, page, st } = await newPage(browser, { width: 1920, height: 1080 }, 'demo', false, { deviceScaleFactor: dpr });
    try {
      await page.goto(BASE + '/index.html?demo=1' + qs, { waitUntil: 'load' });
      await page.waitForTimeout(600);
      const r = await page.evaluate(() => { const c = document.getElementById('radar'); return { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight }; });
      collect(st, problems);
      checked.pages++;
      return r;
    } finally { await ctx.close(); }
  };
  try {
    const d2 = await measure('', 2);   // devicePixelRatio 2, auto
    if (d2.w < 2 * d2.cw || d2.h < 2 * d2.ch) problems.push('devicePixelRatio 2: canvas ' + d2.w + 'x' + d2.h + ' for CSS ' + d2.cw + 'x' + d2.ch + ' (need at least 2x)');
    const r1 = await measure('&res=1', 2);   // res=1 wins over the screen
    if (r1.w !== r1.cw || r1.h !== r1.ch) problems.push('res=1 at devicePixelRatio 2: canvas ' + r1.w + 'x' + r1.h + ' for CSS ' + r1.cw + 'x' + r1.ch + ' (expected 1x)');
    const d1 = await measure('', 1);   // auto on a 1x screen is 2x as well (AirPlay mirror)
    if (d1.w < 2 * d1.cw) problems.push('auto at devicePixelRatio 1: canvas ' + d1.w + 'x' + d1.h + ' for CSS ' + d1.cw + 'x' + d1.ch + ' (expected 2x)');
  } catch (e) { problems.push('test crashed: ' + e.message); }
  problems.forEach((p) => record(id, p));
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

// ---------- motion option: off and full at 1280x720 (js/motion.js) ----------
async function motionCase(browser, level) {
  const id = 'motion_' + level + '_1280x720';
  const { ctx, page, st } = await newPage(browser, { width: 1280, height: 720 }, 'demo');
  const problems = [];
  try {
    await page.goto(BASE + '/index.html?demo=1&motion=' + level, { waitUntil: 'load' });
    await page.waitForTimeout(3500);
    const r = await page.evaluate(PROBE);
    const lvl = await page.evaluate(() => [document.documentElement.getAttribute('data-motion'), MA.motion.level, MA.motion.enabled()]);
    collect(st, problems);
    if (lvl[0] !== level || lvl[1] !== level) problems.push('motion level is ' + lvl.join('/') + ', expected ' + level);
    if ((lvl[2] === true) !== (level !== 'off')) problems.push('motion enabled flag wrong for ' + level);
    if (!r.canvas) problems.push('canvas missing or hidden');
    else if (r.canvas.std < 1.5 || r.canvas.colors < 6) problems.push('canvas looks blank (std ' + r.canvas.std + ', colors ' + r.canvas.colors + ')');
    r.overlap.forEach((m) => problems.push('header overlap: ' + m));
    checked.pages++;
    if (problems.length) { problems.forEach((p) => record(id, p)); await shot(page, id); }
  } catch (e) {
    record(id, 'test crashed: ' + e.message); await shot(page, id);
  } finally { await ctx.close(); }
}

// ---------- chart background (chartbg=1, demo traffic, no third-party requests) ----------
async function chartCase(browser, vp) {
  const id = 'chart_' + vp.w + 'x' + vp.h;
  const { ctx, page, st } = await newPage(browser, { width: vp.w, height: vp.h }, 'demo');
  const problems = [];
  try {
    await page.goto(BASE + '/index.html?demo=1&chartbg=1&style=chart-paper', { waitUntil: 'load' });
    await page.waitForTimeout(3500);
    const r = await page.evaluate(PROBE);
    collect(st, problems);
    const data = await page.evaluate(() => (window.MA && MA.chartData) ? { air: MA.chartData.airspaces.length, nav: MA.chartData.navaids.length } : null);
    if (!data || data.air < 10 || data.nav < 10) problems.push('chart data not loaded (' + JSON.stringify(data) + ')');
    if (!r.canvas) problems.push('canvas missing or hidden');
    else if (r.canvas.std < 1.5 || r.canvas.colors < 6) problems.push('canvas looks blank (std ' + r.canvas.std + ', colors ' + r.canvas.colors + ')');
    r.overlap.forEach((m) => problems.push('header overlap: ' + m));
    r.clipped.forEach((m) => problems.push('clipped: ' + m));
    r.offscreen.forEach((m) => problems.push('outside viewport: ' + m));
    r.contrast.forEach((x) => { if (x.ratio < x.min) problems.push('contrast ' + x.s + ' = ' + x.ratio + ':1 < ' + x.min); });
    checked.pages++;
    if (problems.length) { problems.forEach((p) => record(id, p)); await shot(page, id); }
  } catch (e) { record(id, 'test crashed: ' + e.message); await shot(page, id); } finally { await ctx.close(); }
}

async function diagPanelCase(browser) {
  const id = 'diag_panel';
  const { ctx, page, st } = await newPage(browser, { width: 1280, height: 720 }, 'demo');
  const problems = [];
  try {
    await page.goto(BASE + '/index.html?diag=1&demo=1', { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const info = await page.evaluate(() => {
      const p = document.getElementById('diag-panel');
      if (!p) return null;
      const box = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
      return { panel: box(p), brand: box(document.querySelector('.brand')), meta: box(document.querySelector('#top .meta')),
        board: box(document.getElementById('board')), text: p.textContent, display: getComputedStyle(p).display, fonts: document.fonts.status };
    });
    if (!info) problems.push('?diag=1 shows no diagnostics panel');
    else {
      if (!/\bboot\b/.test(info.text)) problems.push('diagnostics panel has no boot event');
      const hit = (a, b) => a && b && Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1;
      const fmt = (b) => b ? [b.l, b.t, b.r, b.b].map((v) => Math.round(v)).join(',') : 'none';
      if (hit(info.panel, info.brand) || hit(info.panel, info.meta)) problems.push('diagnostics panel overlaps the header (panel l,t,r,b ' + fmt(info.panel) + '; brand ' + fmt(info.brand) + '; meta ' + fmt(info.meta) + '; fonts ' + info.fonts + ')');
      if (hit(info.panel, info.board)) problems.push('diagnostics panel overlaps the board');
      if (info.panel.r > 1280 || info.panel.b > 720 || info.panel.l < 0 || info.panel.t < 0) problems.push('diagnostics panel leaves the 1280x720 screen');
    }
    collect(st, problems);
    checked.pages++;
    if (problems.length) { problems.forEach((p) => record(id, p)); }
    await shot(page, id + '_1280');
  } catch (e) { record(id, 'test crashed: ' + e.message); } finally { await ctx.close(); }
}
async function diagSetupCase(browser) {
  const id = 'diag_setup';
  const { ctx, page, st } = await newPage(browser, { width: 1280, height: 800 }, 'setup');
  const problems = [];
  try {
    await page.goto(BASE + '/setup.html?demo=1&wizard=0', { waitUntil: 'load' });
    const btns = await page.evaluate(() => Array.from(document.querySelectorAll('#diag-box button')).map((b) => b.textContent));
    if (!btns.some((t) => /Diagnoseprotokoll herunterladen/.test(t))) problems.push('setup page has no "Diagnoseprotokoll herunterladen" button');
    if (!btns.some((t) => /Protokoll leeren/.test(t))) problems.push('setup page has no "Protokoll leeren" button');
    collect(st, problems);
    checked.pages++;
    if (problems.length) { problems.forEach((p) => record(id, p)); await shot(page, id); }
  } catch (e) { record(id, 'test crashed: ' + e.message); } finally { await ctx.close(); }
}

// ---------- degraded data (js/nodata.js): every source blocked -> notice; source back -> notice removed ----------
async function nodataCase(browser) {
  const id = 'nodata_notice';
  const { ctx, page, st } = await newPage(browser, { width: 1280, height: 720 }, 'live');
  const problems = [];
  let blockFeed = true;
  // registered after newPage's policy route, so it runs first: abort the own proxy while blockFeed is set
  await ctx.route(/\/api\/proxy\?/, (route) => (blockFeed ? route.abort('failed') : route.fallback()));
  const text = 'Keine Flugdaten – Quelle nicht erreichbar, neuer Versuch läuft';
  const shown = () => page.evaluate(() => { const e = document.getElementById('nodata'); return !!e && !e.hidden; });
  try {
    // public=0: with the default (public on) a failing feed moves to the other providers through the public proxies,
    // and stays there up to PRIMARY_RETRY_MS (5 min) after the own proxy is back. This case checks the notice itself
    // (appears, renders, disappears when the source returns), so it runs on the own-proxy path only, as before the default changed.
    await page.goto(BASE + '/index.html?lat=53.5511&lon=9.9937&r=25&public=0', { waitUntil: 'load' });
    try {
      await page.waitForFunction(() => { const e = document.getElementById('nodata'); return !!e && !e.hidden; }, null, { timeout: 20000 });
    } catch (e) { problems.push('notice does not appear while every source fails'); }
    if (await shown()) {
      const info = await page.evaluate(() => {
        const e = document.getElementById('nodata'), b = e.getBoundingClientRect();
        return { text: e.textContent, display: getComputedStyle(e).display, w: b.width, h: b.height };
      });
      if (info.text !== text) problems.push('notice text is "' + info.text + '"');
      if (info.display === 'none' || info.w < 1 || info.h < 1) problems.push('notice is not rendered (display ' + info.display + ')');
    }
    blockFeed = false;
    try {
      await page.waitForFunction(() => { const e = document.getElementById('nodata'); return !!e && e.hidden; }, null, { timeout: 30000 });
    } catch (e) { problems.push('notice does not disappear after the source is back'); }
    collect(st, problems);
    checked.pages++;
    if (problems.length) { problems.forEach((p) => record(id, p)); await shot(page, id); }
  } catch (e) { record(id, 'test crashed: ' + e.message); } finally { await ctx.close(); }
}

// ---------- settings overlay (js/settings.js): gear, keyboard, focus, persistence, reload note ----------
const SETTINGS_RECT = () => {
  const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
  return { gear: r('#set-btn'), board: r('#board'), fs: r('#fs-btn'), attrib: r('#attrib'), top: r('#top'), panel: r('#set-layer .set-panel') };
};
const overlaps = (a, b) => !!a && !!b && a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;

async function settingsCase(browser) {
  const id = 'settings_1280';
  const { ctx, page, st } = await newPage(browser, { width: 1280, height: 720 }, 'demo');
  const problems = [];
  try {
    await page.goto(BASE + '/index.html?demo=1', { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    const geo = await page.evaluate(SETTINGS_RECT);
    ['gear', 'board', 'fs', 'attrib', 'top'].forEach((k) => { if (!geo[k]) problems.push('missing element for overlap check: ' + k); });
    if (overlaps(geo.gear, geo.board)) problems.push('gear overlaps the flight board');
    if (overlaps(geo.gear, geo.fs)) problems.push('gear overlaps the fullscreen button');
    if (overlaps(geo.gear, geo.attrib)) problems.push('gear overlaps the attribution footer');
    if (overlaps(geo.gear, geo.top)) problems.push('gear overlaps the header');
    // mouse: click opens, focus moves into the dialog, Tab stays inside
    await page.click('#set-btn');
    await page.waitForTimeout(400);
    if (!(await page.evaluate(() => document.getElementById('set-layer').classList.contains('open')))) problems.push('click on the gear did not open the overlay');
    for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => document.getElementById('set-layer').contains(document.activeElement));
    if (!inside) problems.push('focus left the overlay while it was open (Tab)');
    // change Stil: applies live and is saved
    await page.selectOption('#set-style', 'eicam-boeing');
    await page.waitForTimeout(300);
    if ((await page.evaluate(() => document.documentElement.getAttribute('data-style'))) !== 'eicam-boeing') problems.push('Stil did not apply live');
    const saved = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('ma.settings')); } catch (e) { return null; } });
    if (!saved || saved.style !== 'eicam-boeing') problems.push('Stil was not saved in localStorage ma.settings');
    if (saved && ('lat' in saved || 'lon' in saved)) problems.push('localStorage ma.settings holds a location');
    // Ansicht = Flughafen waits for a reload and says so
    await page.selectOption('#set-view', 'airport');
    await page.waitForTimeout(150);
    const reloadShown = await page.evaluate(() => !document.getElementById('set-reload').hidden && /Neuladen/.test(document.getElementById('note-view').textContent));
    if (!reloadShown) problems.push('Ansicht Flughafen did not show "wirkt nach Neuladen" and the Neu laden button');
    await page.selectOption('#set-view', 'auto');
    await page.waitForTimeout(150);
    if (await page.evaluate(() => !document.getElementById('set-reload').hidden)) problems.push('Neu laden stayed visible after the view was set back');
    // Escape closes and returns focus to the gear
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    if (await page.evaluate(() => document.getElementById('set-layer').classList.contains('open'))) problems.push('Escape did not close the overlay');
    if (!(await page.evaluate(() => document.activeElement && document.activeElement.id === 'set-btn'))) problems.push('focus did not return to the gear after closing');
    // keyboard: S opens and closes
    await page.evaluate(() => document.body.focus());
    await page.keyboard.press('s');
    await page.waitForTimeout(300);
    if (!(await page.evaluate(() => document.getElementById('set-layer').classList.contains('open')))) problems.push('key S did not open the overlay');
    await page.keyboard.press('S');
    await page.waitForTimeout(300);
    if (await page.evaluate(() => document.getElementById('set-layer').classList.contains('open'))) problems.push('key S did not close the overlay');
    // persistence: after reload the saved Stil applies, and an address parameter still wins
    await page.goto(BASE + '/index.html?demo=1', { waitUntil: 'load' });
    await page.waitForTimeout(800);
    if ((await page.evaluate(() => document.documentElement.getAttribute('data-style'))) !== 'eicam-boeing') problems.push('saved Stil did not survive a reload');
    await page.goto(BASE + '/index.html?demo=1&style=tower', { waitUntil: 'load' });
    await page.waitForTimeout(800);
    if ((await page.evaluate(() => document.documentElement.getAttribute('data-style'))) !== 'tower') problems.push('address parameter style=tower did not win over the saved style');
    // show= hides the board: no gear
    await page.goto(BASE + '/index.html?demo=1&hide=board', { waitUntil: 'load' });
    await page.waitForTimeout(600);
    if (await page.evaluate(() => !!document.getElementById('set-btn'))) problems.push('gear shown although hide=board removes the board');
    collect(st, problems);
    checked.pages++;
    if (problems.length) { problems.forEach((p) => record(id, p)); await shot(page, id); }
  } catch (e) {
    record(id, 'test crashed: ' + e.message); await shot(page, id);
  } finally { await ctx.close(); }
}

async function settingsTouchCase(browser) {
  const id = 'settings_touch_390';
  const { ctx, page, st } = await newPage(browser, { width: 390, height: 844 }, 'demo', false, { hasTouch: true, isMobile: true });
  const problems = [];
  try {
    await page.goto(BASE + '/index.html?demo=1', { waitUntil: 'load' });
    await page.waitForTimeout(1000);
    await page.tap('#set-btn');
    await page.waitForTimeout(400);
    const panel = await page.evaluate(() => {
      const e = document.querySelector('#set-layer .set-panel');
      const open = document.getElementById('set-layer').classList.contains('open');
      if (!e) return { open, none: true };
      const b = e.getBoundingClientRect();
      return { open, left: b.left, right: b.right, innerWidth, overflowX: document.documentElement.scrollWidth - innerWidth };
    });
    if (!panel.open) problems.push('tap on the gear did not open the overlay');
    if (panel.none) problems.push('overlay panel missing');
    if (!panel.none && (panel.left < 15 || panel.right > panel.innerWidth - 15)) problems.push('overlay panel does not keep the 16px gutter at 390 px (' + Math.round(panel.left) + '..' + Math.round(panel.right) + ')');
    await page.tap('#set-chartbg');
    await page.waitForTimeout(200);
    await page.tap('#set-close');
    await page.waitForTimeout(400);
    if (await page.evaluate(() => document.getElementById('set-layer').classList.contains('open'))) problems.push('tap on the close button did not close the overlay');
    const geo = await page.evaluate(SETTINGS_RECT);
    if (overlaps(geo.gear, geo.board)) problems.push('gear overlaps the flight board at 390 px');
    if (overlaps(geo.gear, geo.fs)) problems.push('gear overlaps the fullscreen button at 390 px');
    // the tapped Karte switch is kept and applies after a reload
    await page.goto(BASE + '/index.html?demo=1', { waitUntil: 'load' });
    await page.waitForTimeout(800);
    if ((await page.evaluate(() => MA.config.chartbg)) !== true) problems.push('tapped Karte switch did not persist');
    collect(st, problems);
    checked.pages++;
    if (problems.length) { problems.forEach((p) => record(id, p)); await shot(page, id); }
  } catch (e) {
    record(id, 'test crashed: ' + e.message); await shot(page, id);
  } finally { await ctx.close(); }
}

// ---------- Anzeigetafel: the stats line keeps clear of the title, the clock and the fullscreen button ----------
// the log is seeded for today so that the stats show all five cells (an empty log shows one)
const SEED_LOG = () => {
  const d = new Date(), pad = (n) => String(n).padStart(2, '0');
  const k = 'myairspace.log.' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const now = Date.now(), types = ['A320', 'B738', 'A359', 'E190', 'B789', 'A388', 'DH8D', 'A21N', 'B763', 'C172'];
  const airlines = ['Lufthansa', 'Eurowings', 'KLM', 'Ryanair', 'British Airways', 'Emirates', 'SAS', 'Condor'];
  const list = [];
  for (let i = 0; i < 14; i++) list.push({ hex: 'abc' + i, cs: 'DLH' + (100 + i), al: airlines[i % airlines.length], t: types[i % types.length], reg: '', from: 'HAM', to: 'FRA',
    first: now - (i + 1) * 900000, last: now - (i + 1) * 900000 + 60000, dmin: 3 + i * 1.7, tmin: now - (i + 1) * 900000, altC: 2000 + i * 900, amin: 2000, amax: 9000, ph: i % 2 ? 'up' : 'down' });
  try { localStorage.setItem(k, JSON.stringify({ v: 1, entries: list })); } catch (e) { /* storage off */ }
};
const BOARD_GEO = () => {
  const box = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null; };
  const text = (e) => { if (!e || !(e.textContent || '').trim()) return null; const r = document.createRange(); r.selectNodeContents(e); const b = r.getBoundingClientRect(); return b.width > 0 && b.height > 0 ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null; };
  const cells = Array.from(document.querySelectorAll('#lv-stats .st')).map((e) => ({ n: 'stat "' + e.textContent.trim().slice(0, 18) + '"', box: box(e), txt: Array.from(e.querySelectorAll('.st-l, .st-v, .st-x')).map(text).filter(Boolean) }));
  return { cells, title: text(document.querySelector('.lv-heading')), date: text(document.querySelector('.lv-date')), clock: box(document.getElementById('clock')), fs: box(document.getElementById('fs-btn')), view: document.body.classList.contains('view-board') };
};
async function boardStatsCase(browser, vp) {
  const id = 'board_stats_no_overlap';
  const { ctx, page, st } = await newPage(browser, { width: vp.w, height: vp.h }, 'demo');
  const problems = [];
  const at = vp.w + 'x' + vp.h;
  try {
    await ctx.addInitScript(SEED_LOG);
    await page.goto(BASE + '/index.html?demo=1&view=board', { waitUntil: 'load' });
    await page.waitForTimeout(9000);   // the board refreshes every 5 s; the first refresh loads the seeded log
    const g = await page.evaluate(BOARD_GEO);
    if (!g.view) problems.push('view=board did not show the Anzeigetafel at ' + at);
    if (!g.fs) problems.push('no fullscreen button to check against at ' + at);
    if (g.cells.length < 5) problems.push('stats line has ' + g.cells.length + ' cells, expected 5 (seeded log not shown) at ' + at);
    const hit = (a, b) => !!a && !!b && Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1;
    const fmt = (b) => b ? [b.l, b.t, b.r, b.b].map((v) => Math.round(v)).join(',') : 'none';
    g.cells.forEach((c) => {
      if (hit(c.box, g.fs)) problems.push(c.n + ' runs under the fullscreen button at ' + at + ' (cell ' + fmt(c.box) + '; button ' + fmt(g.fs) + ')');
      if (hit(c.box, g.clock)) problems.push(c.n + ' overlaps the clock at ' + at);
      c.txt.forEach((t) => {
        if (hit(t, g.title)) problems.push(c.n + ' text overlaps the title ÜBERFLÜGE at ' + at + ' (text ' + fmt(t) + '; title ' + fmt(g.title) + ')');
        if (hit(t, g.date)) problems.push(c.n + ' text overlaps the date at ' + at);
      });
    });
    collect(st, problems);
    checked.pages++;
    if (problems.length) { problems.forEach((p) => record(id, p)); await shot(page, id + '_' + vp.w); }
  } catch (e) { record(id, 'test crashed at ' + at + ': ' + e.message); await shot(page, id + '_' + vp.w); } finally { await ctx.close(); }
}

// ---------- radar: the METAR and runway lines stay clear of the special-aircraft banner ----------
const RADAR_GEO = () => {
  const box = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
  const text = (e) => { if (!e || !(e.textContent || '').trim()) return null; const r = document.createRange(); r.selectNodeContents(e); const b = r.getBoundingClientRect(); return b.width > 0 && b.height > 0 ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null; };
  const toast = document.getElementById('toast');
  return { toast: box(toast), on: toast.classList.contains('on'), vw: innerWidth, vh: innerHeight,
    wx: ['wx-metar', 'wx-rwy'].map((id) => ({ n: id, box: text(document.getElementById(id)) })).filter((x) => x.box) };
};
async function radarMetarCase(browser, vp) {
  const id = 'radar_metar_not_under_alert';
  const { ctx, page, st } = await newPage(browser, { width: vp.w, height: vp.h }, 'demo');
  const problems = [];
  const at = vp.w + 'x' + vp.h;
  try {
    await page.goto(BASE + '/index.html?demo=1&style=tower', { waitUntil: 'load' });
    // the demo has a squawk 7700 aircraft that comes into range: its banner is the one under test
    const t0 = Date.now();
    while (Date.now() - t0 < 60000 && !(await page.evaluate(() => document.getElementById('toast').classList.contains('on')))) await page.waitForTimeout(250);
    await page.waitForTimeout(1500);   // the banner slides in over 1.2 s
    const g = await page.evaluate(RADAR_GEO);
    if (!g.on) problems.push('no special-aircraft banner in demo mode at ' + at);
    if (!g.wx.length) problems.push('no METAR or runway line to check against at ' + at);
    const hit = (a, b) => !!a && !!b && Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1;
    const fmt = (b) => b ? [b.l, b.t, b.r, b.b].map((v) => Math.round(v)).join(',') : 'none';
    g.wx.forEach((w) => { if (hit(w.box, g.toast)) problems.push(w.n + ' runs under the special-aircraft banner at ' + at + ' (line ' + fmt(w.box) + '; banner ' + fmt(g.toast) + ')'); });
    if (g.on && (g.toast.r > g.vw + 1 || g.toast.b > g.vh + 1 || g.toast.l < -1)) problems.push('special-aircraft banner leaves the screen at ' + at + ' (' + fmt(g.toast) + ')');
    collect(st, problems);
    checked.pages++;
    if (problems.length) { problems.forEach((p) => record(id, p)); await shot(page, id + '_' + vp.w); }
  } catch (e) { record(id, 'test crashed at ' + at + ': ' + e.message); await shot(page, id + '_' + vp.w); } finally { await ctx.close(); }
}

// ---------- run ----------
const t0 = Date.now();
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const jobs = [];
const VPS = QUICK ? [{ w: 1920, h: 1080 }] : [{ w: 1920, h: 1080 }, { w: 1280, h: 720 }, { w: 3840, h: 2160 }];
for (const style of STYLE_NAMES) for (const theme of hasLight(style) ? ['dark', 'light'] : ['dark'])
  for (const vp of VPS) for (const view of ['radar', 'board']) jobs.push({ n: [style, theme, vp.w, view].join('_'), run: () => matrixCase(browser, { style, theme, vp, view }) });
for (const code of ['HAM', 'FRA']) for (const vp of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }])
  jobs.push({ n: 'airport_' + code + '_' + vp.width, run: () => airportCase(browser, code, vp) });
jobs.push({ n: 'rotation_airport_1280', run: () => rotationCase(browser) });
jobs.push({ n: 'journey_390', run: () => journeyCase(browser, { width: 390, height: 844 }) }, { n: 'journey_1280', run: () => journeyCase(browser, { width: 1280, height: 800 }) }, { n: 'tv_welcome', run: () => hintCase(browser) }, { n: 'setup_390', run: () => setupCase(browser, { width: 390, height: 844 }) }, { n: 'setup_1280', run: () => setupCase(browser, { width: 1280, height: 800 }) }, { n: 'live', run: () => liveCase(browser) });
jobs.push({ n: 'motion_off', run: () => motionCase(browser, 'off') }, { n: 'motion_full', run: () => motionCase(browser, 'full') });
jobs.push({ n: 'canvas_res', run: () => resCase(browser) });
for (const h of HOSTILE) { jobs.push({ n: 'hostile_index_' + h, run: () => hostileCase(browser, 'index', h) }); jobs.push({ n: 'hostile_setup_' + h, run: () => hostileCase(browser, 'setup', h) }); }
jobs.push({ n: 'diag_panel', run: () => diagPanelCase(browser) }, { n: 'diag_setup', run: () => diagSetupCase(browser) });
jobs.push({ n: 'nodata_notice', run: () => nodataCase(browser) });
jobs.push({ n: 'settings_1280', run: () => settingsCase(browser) }, { n: 'settings_touch_390', run: () => settingsTouchCase(browser) });
jobs.push({ n: 'board_stats_no_overlap_1920', run: () => boardStatsCase(browser, { w: 1920, h: 1080 }) }, { n: 'board_stats_no_overlap_1280', run: () => boardStatsCase(browser, { w: 1280, h: 720 }) });
jobs.push({ n: 'radar_metar_not_under_alert_1280', run: () => radarMetarCase(browser, { w: 1280, h: 720 }) }, { n: 'radar_metar_not_under_alert_390', run: () => radarMetarCase(browser, { w: 390, h: 844 }) });
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
