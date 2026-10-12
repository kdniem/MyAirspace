// Run: node tools/tests/motion-sim.js .   (compares old vs new motion model; see js/geo.js glide())
// Simulates 150 s of one aircraft and compares the OLD motion (arrival-time stamps + pure easing)
// with the NEW one (server-time stamps + out-of-order guard + glide) under fresh/cached responses.
const vm = require('vm'), fs = require('fs');
const ROOT = process.argv[2];
function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

async function run(mode, opt) {
  let simNow = 1.8e12;
  const ctx = { console, Promise, setTimeout, clearTimeout, Math, JSON, encodeURIComponent, URLSearchParams, location: { search: '' } };
  ctx.window = ctx; ctx.Date = { now: () => simNow };
  let payload = null;
  ctx.fetch = async () => ({ ok: true, status: 200, json: async () => payload });
  vm.createContext(ctx);
  // js/pwa.js (not loaded here) provides the proxy helper that config.js uses
  vm.runInContext("window.MA={DEFAULT_PROXY:'https://example.vercel.app/api/proxy',proxyOk:function(){return true;}}", ctx);
  ['js/config.js', 'js/geo.js', 'js/format.js', 'js/data.js'].forEach(f => vm.runInContext(fs.readFileSync(ROOT + '/' + f, 'utf8'), ctx, { filename: f }));
  const MA = ctx.MA, R = rng(opt.seed);
  const lat0 = 53.70, lon0 = 9.90, track = 150, gs = 160, vkm = gs * 1.852 / 3600000;
  const truth = t => { const p = MA.geo.dest(lat0, lon0, track, vkm * t); return [p[0], p[1]]; };
  const t0 = simNow, ux = Math.sin(track * Math.PI / 180), uy = Math.cos(track * Math.PI / 180);
  const along = (a, b) => { const kx = 111.32 * Math.cos(a[0] * Math.PI / 180); return ((b[1] - a[1]) * kx) * ux + ((b[0] - a[0]) * 110.574) * uy; };

  const ac = { hex: 'abc', trail: [] }; let have = false;
  let nextPoll = 0, prev = null, back = 0, backM = 0, frames = 0, sumSq = 0, maxErr = 0, stalls = 0;
  const END = 150000;
  for (let t = 0; t < END; ) {
    const dt = R() < 0.1 ? 33.3 : 16.7; t += dt; simNow = t0 + t;
    if (t >= nextPoll) {
      nextPoll += 5000;
      // source: fresh (generated 150 ms before arrival) or cached/stale (age 3..30 s)
      const stale = R() < opt.pStale; const age = stale ? 3000 + R() * 27000 : 150;
      const G = simNow - age, fix = G - (50 + R() * 1250);
      const p = truth(fix - t0);
      payload = { now: G + opt.skew, ac: [{ hex: 'abc', flight: 'TEST1', lat: p[0], lon: p[1], gs, track, alt_baro: 3000, baro_rate: 0, seen_pos: (G - fix) / 1000 }] };
      const list = await MA.data.providers.adsblol.fetch(53.55, 9.99, 80);
      const n = list[0];
      if (mode === 'old') n.ts = simNow - payload.ac[0].seen_pos * 1000;   // arrival time stamp (old behaviour)
      if (!have) { Object.assign(ac, n, { dlat: n.lat, dlon: n.lon }); have = true; }
      else if (mode === 'new' && n.ts < ac.ts) { /* keep newer fix */ }
      else Object.keys(n).forEach(k => { ac[k] = n[k]; });
    }
    if (!have) continue;
    if (mode === 'old') {
      const k = Math.min(1, dt / 600), age = Math.min(20000, Math.max(0, simNow - ac.ts));
      const q = MA.geo.dest(ac.lat, ac.lon, ac.track, ac.gs * 1.852 * age / 3600000);
      ac.dlat += (q[0] - ac.dlat) * k; ac.dlon += (q[1] - ac.dlon) * k;
    } else MA.geo.glide(ac, simNow, dt, 20000);
    const cur = [ac.dlat, ac.dlon];
    if (t > 20000) {
      frames++;
      const tr = truth(t), e = Math.abs(along(tr, cur)) * 1000; sumSq += e * e; if (e > maxErr) maxErr = e;
      if (prev) {
        const d = along(prev, cur) * 1000;           // m moved along the track this frame
        if (d < -0.02) { back++; backM += -d; }
        if (d < vkm * 1000 * dt * 0.1) stalls++;      // moving at <10 % of the real speed
      }
    }
    prev = cur;
  }
  return { backFrames: back, backMeters: Math.round(backM), maxErrM: Math.round(maxErr), rmsM: Math.round(Math.sqrt(sumSq / frames)), stallFrames: stalls, frames };
}
(async () => {
  const cases = [
    ['all fresh, no skew', { pStale: 0, skew: 0 }],
    ['30 % cached/stale, no skew', { pStale: 0.3, skew: 0 }],
    ['30 % cached/stale, server clock +3.7 s', { pStale: 0.3, skew: 3700 }],
    ['60 % cached/stale, server clock -2.1 s', { pStale: 0.6, skew: -2100 }],
  ];
  for (const [name, o] of cases) {
    console.log('\n' + name);
    for (const mode of ['old', 'new']) {
      const rs = []; for (let s = 1; s <= 5; s++) rs.push(await run(mode, Object.assign({ seed: s }, o)));
      const avg = k => Math.round(rs.reduce((a, r) => a + r[k], 0) / rs.length);
      console.log('  ' + mode.padEnd(4), 'rückwärts-Frames', String(avg('backFrames')).padStart(5), '| rückwärts gesamt', String(avg('backMeters')).padStart(5) + ' m', '| max Abw.', String(avg('maxErrM')).padStart(5) + ' m', '| RMS', String(avg('rmsM')).padStart(4) + ' m', '| Stillstand-Frames', avg('stallFrames'));
    }
  }
})();
