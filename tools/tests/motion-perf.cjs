// Run: node tools/tests/motion-perf.cjs [seconds=10] [rounds=2]
// Frame cost of the main loop (js/main.js frame(): advance, radar render, board, flap) on ?demo=1 at 1920x1080,
// motion=off against motion=full, measured in headless Chromium (Playwright). Not part of run-all: timings are
// machine-dependent. The page's requestAnimationFrame callbacks are wrapped to time them; nothing in the app changes.
// Serves the repo with python3 -m http.server on a free port and aborts every request that is not localhost.
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const { createRequire } = require('module');
const ROOT = path.resolve(__dirname, '../..');
const SECS = Number(process.argv[2]) || 10, ROUNDS = Number(process.argv[3]) || 2;

function loadPlaywright() {
  const cands = [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean);
  for (const c of cands) { try { return createRequire(__filename)(c); } catch (e) { /* next */ } }
  console.error('Playwright not found (set PLAYWRIGHT_PATH).');
  process.exit(2);
}
const { chromium } = loadPlaywright();

function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
  });
}

// wraps rAF: records the duration of each callback (the whole frame) and the interval between frames
const INIT = () => {
  window.__frames = { cost: [], gap: [], last: 0 };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function (cb) {
    return raf(function (ts) {
      const t0 = performance.now();
      if (window.__frames.last) window.__frames.gap.push(t0 - window.__frames.last);
      window.__frames.last = t0;
      try { cb(ts); } finally { window.__frames.cost.push(performance.now() - t0); }
    });
  };
};

function stats(a) {
  const s = a.slice().sort((x, y) => x - y), n = s.length;
  const avg = s.reduce((x, y) => x + y, 0) / n;
  return { n, avg, p95: s[Math.floor(n * 0.95)], max: s[n - 1] };
}

(async () => {
  const port = await freePort();
  const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', ROOT], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const base = 'http://127.0.0.1:' + port;
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const results = { off: [], full: [] };
  try {
    for (let round = 0; round < ROUNDS; round++) {
      for (const level of ['off', 'full']) {
        const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block', deviceScaleFactor: 1 });
        await ctx.addInitScript(INIT);
        await ctx.route('**/*', (route) => {
          const u = route.request().url();
          if (u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
          return route.abort('blockedbyclient');
        });
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(base + '/index.html?demo=1&motion=' + level, { waitUntil: 'load' });
        await page.waitForTimeout(3000);   // demo traffic settles, fonts and base layer are ready
        await page.evaluate(() => { window.__frames.cost = []; window.__frames.gap = []; window.__frames.last = 0; });
        await page.waitForTimeout(SECS * 1000);
        const f = await page.evaluate(() => ({ cost: window.__frames.cost, gap: window.__frames.gap }));
        if (errors.length) console.log('page errors (' + level + '):', errors.join(' | '));
        results[level].push({ cost: stats(f.cost), gap: stats(f.gap) });
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    server.kill();
  }
  const fmt = (x) => x.toFixed(2) + ' ms';
  for (const level of ['off', 'full']) {
    results[level].forEach((r, i) => console.log(level.padEnd(5) + ' round ' + (i + 1) + ': frame work avg ' + fmt(r.cost.avg) + ', p95 ' + fmt(r.cost.p95) +
      ', max ' + fmt(r.cost.max) + ' (' + r.cost.n + ' frames; interval avg ' + fmt(r.gap.avg) + ')'));
  }
  const mean = (lvl) => results[lvl].reduce((a, r) => a + r.cost.avg, 0) / results[lvl].length;
  const diff = mean('full') - mean('off');
  console.log('mean frame work: off ' + fmt(mean('off')) + ', full ' + fmt(mean('full')) + ', difference ' + (diff >= 0 ? '+' : '') + fmt(diff));
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
