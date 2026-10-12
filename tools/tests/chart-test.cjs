// Run: node tools/tests/chart-test.cjs .
// Checks the chart background (chartbg=1): the generated data file parses and stays small and in its region,
// the chart colour roles keep their contrast on every style and theme, and the renderer draws nothing with chartbg=0.
const vm = require('vm'), fs = require('fs');
const ROOT = process.argv[2] || '.';
let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.log('FAIL', msg); } }

// ---- 1. data file: parses, size, shape, region
const dataSrc = fs.readFileSync(ROOT + '/data/chart-features.js', 'utf8');
ok(Buffer.byteLength(dataSrc, 'utf8') <= 150 * 1024, 'data/chart-features.js is above 150 KB');
const dctx = {};
dctx.window = dctx;
vm.createContext(dctx);
try { vm.runInContext(dataSrc, dctx, { filename: 'data/chart-features.js' }); } catch (e) { ok(false, 'data file does not parse: ' + e.message); }
const D = (dctx.MA && dctx.MA.chartData) || {};
ok(D && D.src && /OpenAIP/.test(D.src.airspace) && /OurAirports/.test(D.src.navaid), 'source and licence fields present');
ok(Array.isArray(D.airports) && D.airports.length === 4, 'four airports (HAM, FRA, FMO, CPH)');
const ICAO = ['EDDH', 'EDDF', 'EDDG', 'EKCH'];
ok(D.airports && ICAO.every((i) => D.airports.some((a) => a.icao === i)), 'airport ICAO codes');
const T = ['ctl', 'res', 'dng', 'pro', 'oth'];
ok(Array.isArray(D.airspaces) && D.airspaces.length > 50, 'airspaces present (' + (D.airspaces || []).length + ')');
(D.airspaces || []).forEach((a, i) => {
  if (!T.includes(a.t)) ok(false, 'airspace ' + i + ' has an unknown class ' + a.t);
  if (!Array.isArray(a.p) || a.p.length < 4) ok(false, 'airspace ' + i + ' has fewer than 4 points');
  else {
    const p0 = a.p[0], pn = a.p[a.p.length - 1];
    if (p0[0] !== pn[0] || p0[1] !== pn[1]) ok(false, 'airspace ' + i + ' ring is not closed');
  }
  if (typeof a.n !== 'string' || !a.n.length) ok(false, 'airspace ' + i + ' has no name');
});
ok((D.airspaces || []).every((a) => a.p.every((q) => q[0] > 47 && q[0] < 58 && q[1] > 3 && q[1] < 16)), 'airspace vertices are plausible coordinates for DE/DK/NL/SE');
ok(Array.isArray(D.navaids) && D.navaids.length > 20, 'navaids present');
ok((D.navaids || []).every((n) => ['VOR', 'NDB', 'DME'].includes(n.g) && typeof n.id === 'string'), 'navaid kinds');
ok(Array.isArray(D.obstacles) && D.obstacles.every((o) => o[2] >= 150), 'obstacles are at least 150 m');
ok((D.airports || []).every((a) => typeof a.decl === 'number' && Math.abs(a.decl) < 5), 'magnetic declination in range');

// ---- 2. colour roles: contrast on the paper of every style and theme
const sctx = {};
sctx.window = sctx;
vm.createContext(sctx);
['js/styles.js'].forEach((f) => vm.runInContext(fs.readFileSync(ROOT + '/' + f, 'utf8'), sctx, { filename: f }));
const MA = sctx.MA;
MA.style.names().forEach((n) => ['dark', 'light'].forEach((t) => {
  const ch = MA.style.resolve(n, t, {}).c.chart;
  const id = n + '/' + t;
  ok(ch && /^#[0-9a-f]{6}$/.test(ch.paper), id + ': paper colour');
  ['ctl', 'res', 'dng', 'pro', 'oth', 'grid', 'obs', 'nav'].forEach((k) => {
    ok(MA.style.ratio(ch[k], ch.paper) >= 3 - 0.01, id + ' ' + k + ' below 3:1 on paper (' + MA.style.ratio(ch[k], ch.paper).toFixed(2) + ')');
  });
  ['label', 'labelDim'].forEach((k) => {
    ok(MA.style.ratio(ch[k], ch.paper) >= 4.5 - 0.01, id + ' ' + k + ' below 4.5:1 on paper');
  });
}));

// ---- 3. renderer: nothing is drawn with chartbg=0, the layer runs with chartbg=1
function stubCtx() {
  const target = {};
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      return function () { return undefined; };
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}
function runBase(qs) {
  const ctx = { console, Math, JSON, URLSearchParams, Date, location: { search: qs }, window: null };
  ctx.window = ctx;
  ctx.innerWidth = 1280; ctx.innerHeight = 720; ctx.devicePixelRatio = 1;
  ctx.document = {
    createElement() { const c = { width: 0, height: 0, getContext() { return stubCtx(); } }; return c; },
    fonts: null
  };
  ctx.MA = {};
  const DP = 'https://myairspace-nu.vercel.app/api/proxy';
  ctx.MA.DEFAULT_PROXY = DP; ctx.MA.proxyOk = (v) => v === DP || v === 'off';
  vm.createContext(ctx);
  ['js/styles.js', 'js/config.js', 'js/geo.js', 'data/geo-features.js', 'data/chart-features.js', 'js/chart.js', 'js/render-scale.js', 'js/radar.js'].forEach((f) => {
    vm.runInContext(fs.readFileSync(ROOT + '/' + f, 'utf8'), ctx, { filename: f });
  });
  const calls = { under: 0, over: 0 };
  const real = ctx.MA.chart;
  ctx.MA.chart = {
    under(r) { calls.under++; return real.under(r); },
    over(r) { calls.over++; return real.over(r); }
  };
  const canvas = { width: 0, height: 0, getContext() { return stubCtx(); } };
  const radar = new ctx.MA.Radar(canvas, ctx.MA.config);
  radar.base();
  return calls;
}
const off = runBase('?lat=53.55&lon=9.99&demo=1');
ok(off.under === 0 && off.over === 0, 'chartbg off: the chart layer is not called (' + JSON.stringify(off) + ')');
const on = runBase('?lat=53.55&lon=9.99&demo=1&chartbg=1');
ok(on.under === 1 && on.over === 1, 'chartbg=1: the chart layer runs once per base build (' + JSON.stringify(on) + ')');
ok(runBase('?lat=53.55&lon=9.99&chartbg=0').under === 0, 'chartbg=0 is off');

console.log(fails ? fails + ' failed' : 'chart: all passed');
process.exit(fails ? 1 : 0);
