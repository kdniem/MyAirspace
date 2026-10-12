// Run: node tools/tests/render-scale-test.cjs .
// Unit test of the canvas scale and the frame-time guard in js/render-scale.js (pure functions, no DOM).
const vm = require('vm'), fs = require('fs'), assert = require('assert');
const ROOT = process.argv[2] || '.';
const ctx = { console, Math, Float64Array, Array, isFinite, isNaN };
ctx.window = ctx;
ctx.MA = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(ROOT + '/js/render-scale.js', 'utf8'), ctx, { filename: 'js/render-scale.js' });
const RS = ctx.MA.renderScale;
let n = 0;
function t(name, fn) { fn(); n++; console.log('ok  ' + name); }
const S = (cssW, cssH, dpr, res) => RS.choose({ cssW: cssW, cssH: cssH, dpr: dpr, res: res || 'auto' });

t('auto at 1080p with 1x screen: 2x (AirPlay and mirrored 1x output stay sharp)', () => {
  assert.strictEqual(S(1920, 1080, 1), 2);
});
t('auto on 2x screens: 2x; 1x stays 1x when the screen is smaller than the cap rule', () => {
  assert.strictEqual(S(1920, 1080, 2), 2);
  assert.strictEqual(S(1280, 720, 1), 2);
  assert.strictEqual(S(1280, 720, 2), 2);
});
t('auto keeps a device pixel ratio above 2 (phones): 3x for 390 px wide', () => {
  assert.strictEqual(S(390, 844, 3), 3);
});
t('res=1 is always 1x, res=2 is always 2x (within the caps)', () => {
  assert.strictEqual(S(1920, 1080, 2, '1'), 1);
  assert.strictEqual(S(1920, 1080, 1, '1'), 1);
  assert.strictEqual(S(1920, 1080, 1, '2'), 2);
  assert.strictEqual(S(1920, 1080, 2, '2'), 2);
});
t('width cap: 3840 px; a 4K CSS screen gets 1x even on auto', () => {
  assert.strictEqual(S(3840, 2160, 2), 1);
  assert.strictEqual(S(4000, 2000, 1), 1);
  assert.strictEqual(S(4000, 2000, 1, '2'), 1);
  assert.strictEqual(S(3000, 1500, 1, '2'), 1.28);   // 3840 / 3000 = 1.28
});
t('pixel cap: 8.3 M pixels in total', () => {
  const s = S(2560, 1440, 1, '2');
  assert.ok(s > 1 && s < 2, 'between 1x and 2x, got ' + s);
  assert.ok(2560 * 1440 * s * s <= 8300000, 'pixels ' + (2560 * 1440 * s * s));
});
t('never below 1, bad input falls back to 1x', () => {
  assert.strictEqual(S(5000, 3000, 1, '2'), 1);
  assert.strictEqual(RS.choose({ cssW: 0, cssH: 0, dpr: NaN, res: 'auto' }) >= 1, true);
  assert.strictEqual(RS.choose({ cssW: 1920, cssH: 1080, dpr: undefined, res: 'auto' }), 2);
});
t('every size and ratio: caps hold and the scale is at least 1', () => {
  const sizes = [[320, 568], [390, 844], [768, 1024], [1024, 768], [1280, 720], [1366, 768], [1920, 1080], [2560, 1440], [2732, 2048], [3840, 2160], [5120, 2880]];
  [1, 1.25, 1.5, 2, 3].forEach((dpr) => ['auto', '1', '2'].forEach((res) => sizes.forEach((sz) => {
    const s = S(sz[0], sz[1], dpr, res), W = Math.round(sz[0] * s), H = Math.round(sz[1] * s);
    assert.ok(s >= 1, 'floor ' + sz + ' ' + dpr + ' ' + res);
    // the caps limit the extra resolution above 1x; a screen larger than the cap is simply drawn at 1x
    assert.ok(W <= Math.max(3840, sz[0]) + 1, 'width ' + W + ' ' + sz + ' ' + dpr + ' ' + res);
    assert.ok(W * H <= Math.max(8300000, sz[0] * sz[1]) + 4000, 'pixels ' + W * H + ' ' + sz + ' ' + dpr + ' ' + res);
  })));
});

// scale ladder
t('scaleAt: 25 % steps down from the target, rounded, never below 1', () => {
  assert.strictEqual(RS.scaleAt(2, 0), 2);
  assert.strictEqual(RS.scaleAt(2, 1), 1.5);
  assert.strictEqual(RS.scaleAt(2, 2), 1.13);
  assert.strictEqual(RS.scaleAt(2, 3), 1);
  assert.strictEqual(RS.scaleAt(2, 40), 1);
  assert.strictEqual(RS.scaleAt(1, 3), 1);
});

// guard: sustained slowness steps down, recovery steps up, the middle band changes nothing
function run(g, p95, ms) { let act = null; for (let t = 0; t < ms; t += 500) { const a = RS.step(g, p95, 500); if (a) act = a; } return act; }
t('p95 above 40 ms for 9.5 s: no step; for 10 s: one step down', () => {
  const g = RS.guard(2);
  assert.strictEqual(run(g, 55, 9500), null);
  assert.strictEqual(g.level, 0);
  assert.strictEqual(RS.step(g, 55, 500), 'down');
  assert.strictEqual(g.level, 1);
  assert.strictEqual(RS.scaleAt(g.target, g.level), 1.5);
});
t('after a step the next one needs another 10 s; it stops at 1x', () => {
  const g = RS.guard(2);
  run(g, 60, 10000);
  assert.strictEqual(g.level, 1);
  assert.strictEqual(run(g, 60, 9500), null);
  assert.strictEqual(run(g, 60, 500), 'down');
  assert.strictEqual(RS.scaleAt(g.target, g.level), 1.13);
  run(g, 60, 10000);
  assert.strictEqual(RS.scaleAt(g.target, g.level), 1);
  assert.strictEqual(run(g, 60, 60000), null, 'no step below 1x');
  assert.strictEqual(RS.scaleAt(g.target, g.level), 1);
});
t('a dip into the 25 to 40 ms band restarts the 10 s count', () => {
  const g = RS.guard(2);
  run(g, 55, 9000);
  run(g, 30, 500);                    // middle band
  assert.strictEqual(run(g, 55, 9000), null, 'the count restarted');
  assert.strictEqual(run(g, 55, 1000), 'down');
});
t('a target of 1x never changes', () => {
  const g = RS.guard(1);
  assert.strictEqual(run(g, 90, 60000), null);
  assert.strictEqual(RS.scaleAt(g.target, g.level), 1);
});
t('recovery: p95 below 25 ms for 30 s steps back up one level; the band in between holds', () => {
  const g = RS.guard(2);
  run(g, 60, 10000);
  assert.strictEqual(g.level, 1);
  run(g, 30, 60000);                  // middle band: no recovery
  assert.strictEqual(g.level, 1);
  assert.strictEqual(run(g, 20, 29500), null);
  assert.strictEqual(run(g, 20, 500), 'up');
  assert.strictEqual(g.level, 0);
  assert.strictEqual(run(g, 20, 60000), null, 'already at the target');
  assert.strictEqual(g.level, 0);
});

// frame window
t('frame window: empty gives NaN, p95 of the last frames, old frames drop out', () => {
  const w = RS.window(10);
  assert.ok(isNaN(RS.percentile(w, 0.95)));
  for (let i = 0; i < 10; i++) RS.push(w, 16);
  assert.strictEqual(RS.percentile(w, 0.95), 16);
  RS.push(w, 50);
  RS.push(w, 60);
  assert.strictEqual(w.n, 10);
  assert.strictEqual(RS.percentile(w, 1), 60);
  RS.clear(w);
  assert.strictEqual(w.n, 0);
  assert.ok(isNaN(RS.percentile(w, 0.5)));
});

console.log(n + ' tests passed');
