// Run: node tools/tests/motion-test.cjs .
// Checks the motion option (js/config.js: motion=off|calm|full, silent fallback, reduced-motion default) and
// js/motion.js: the pure timing curves, the draw helpers against a recording canvas (what runs at each level, and
// nothing while off), and the cheapness rules (no shadowBlur, no setInterval for the flap, colour strings cached).
const vm = require('vm'), fs = require('fs');
const ROOT = process.argv[2] || '.';
let fails = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { fails++; console.log('FAIL', msg); } }
const near = (a, b, eps) => Math.abs(a - b) <= (eps || 1e-9);

// config.js with a given address and (optionally) a prefers-reduced-motion answer
function config(qs, reduced) {
  const ctx = { console, Math, JSON, URLSearchParams, location: { search: qs } };
  ctx.window = ctx;
  ctx.MA = { DEFAULT_PROXY: 'https://example.vercel.app/api/proxy', proxyOk: (v) => v === 'off' || v === 'https://example.vercel.app/api/proxy' };
  if (reduced === 'throws') ctx.matchMedia = () => { throw new Error('no media queries'); };
  else if (reduced !== undefined) ctx.matchMedia = (q) => ({ matches: !!reduced && /prefers-reduced-motion: reduce/.test(q) });
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(ROOT + '/js/config.js', 'utf8'), ctx, { filename: 'js/config.js' });
  return ctx;
}

/* ---- config: motion=off|calm|full ---- */
ok(config('').MA.config.motion === 'calm', 'default is calm');
ok(config('?motion=off').MA.config.motion === 'off', 'motion=off');
ok(config('?motion=full').MA.config.motion === 'full', 'motion=full');
ok(config('?motion=FULL').MA.config.motion === 'full', 'motion value is case-insensitive');
ok(config('?motion=loud').MA.config.motion === 'calm', 'invalid value falls back to calm');
ok(config('?motion=constructor').MA.config.motion === 'calm', 'prototype names are not levels');
ok(config('?motion=__proto__').MA.config.motion === 'calm', '__proto__ is not a level');
ok(config('?motion=').MA.config.motion === 'calm', 'empty value is calm');
ok(config('', false).MA.config.motion === 'calm', 'no reduced-motion preference: calm');
ok(config('', true).MA.config.motion === 'off', 'prefers-reduced-motion: off by default');
ok(config('?motion=full', true).MA.config.motion === 'full', 'an explicit level wins over the system preference');
ok(config('?motion=bogus', true).MA.config.motion === 'off', 'invalid value with reduced motion falls back to off');
ok(config('', 'throws').MA.config.motion === 'calm', 'a failing matchMedia falls back silently to calm');

/* ---- js/motion.js ---- */
function motion(level) {
  const c = config('?motion=' + level);
  const src = fs.readFileSync(ROOT + '/js/motion.js', 'utf8');
  vm.runInContext(src, c, { filename: 'js/motion.js' });
  return c.MA.motion;
}
const M = motion('calm');
ok(M.level === 'calm' && M.enabled() === true, 'calm is loaded and enabled');
ok(motion('off').level === 'off' && motion('off').enabled() === false, 'off is loaded and disabled');
ok(motion('full').level === 'full', 'full is loaded');
const CUR = M.curves;

// timing curves
ok(CUR.easeOut(0) === 0 && CUR.easeOut(1) === 1, 'easeOut ends');
ok(CUR.easeOut(-3) === 0 && CUR.easeOut(7) === 1, 'easeOut clamps');
let mono = true, prev = -1;
for (let t = 0; t <= 1.0001; t += 0.01) { const v = CUR.easeOut(t); if (v < prev - 1e-12) mono = false; prev = v; }
ok(mono, 'easeOut is monotonic');
ok(CUR.easeOut(0.5) > 0.5, 'easeOut starts fast');
ok(near(CUR.sweepAngle(0, 6000), 0) && near(CUR.sweepAngle(1500, 6000), Math.PI / 2) && near(CUR.sweepAngle(6000, 6000), 0), 'sweep: one revolution per 6 s, north at 0');
ok(near(CUR.sweepAngle(-1500, 6000), Math.PI * 1.5), 'sweep wraps for negative time');
let inRange = true;
for (let t = 0; t < 12000; t += 37) { const b = CUR.breath(t, 4000); if (b < -1e-12 || b > 1 + 1e-12) inRange = false; }
ok(inRange && near(CUR.breath(0, 4000), 0) && near(CUR.breath(2000, 4000), 1) && near(CUR.breath(4000, 4000), 0, 1e-9), 'breath: 0..1 over one cycle, 0 at the start');
ok(CUR.ringProgress(-1, 1600) === -1 && CUR.ringProgress(0, 1600) === 0 && CUR.ringProgress(1600, 1600) === -1, 'ring: idle before and after its life');
ok(CUR.ringProgress(800, 1600) > 0 && CUR.ringProgress(800, 1600) < 1, 'ring: progress in between');
ok(CUR.fadeIn(0, 600) === 0 && CUR.fadeIn(600, 600) === 1 && CUR.fadeIn(-50, 600) === 0 && CUR.fadeIn(9000, 600) === 1, 'fade-in: 0 to 1');
ok(CUR.trailGrow(-10, 1000) === 0 && CUR.trailGrow(0, 1000) === 0 && CUR.trailGrow(1000, 1000) === 1 && CUR.trailGrow(5000, 1000) === 1, 'trail grows 0 to 1');
ok(CUR.flapStep(0, 45, 14) === 0 && CUR.flapStep(44, 45, 14) === 0 && CUR.flapStep(45, 45, 14) === 1, 'flap steps every 45 ms');
ok(CUR.flapStep(630, 45, 14) === 14 && CUR.flapStep(99999, 45, 14) === 14 && CUR.flapStep(-5, 45, 14) === 0, 'flap steps clamp');
ok(CUR.flapText('ABCD', 7, 14, () => 0) === 'ABAA', 'flap: the settled prefix stays, the rest scrambles');
ok(CUR.flapText('12:3', 0, 14, () => 0) === 'AA:A', 'flap: symbols never flip');
ok(CUR.flapText('ABCD', 14, 14, () => 0) === 'ABCD', 'flap: settled text is the target');
ok(CUR.flapText('A B', 3, 14, () => 0.5).charAt(1) === ' ', 'flap: spaces stay');
let alphaOk = true;
for (let t = 0; t < 9000; t += 53) { const a = CUR.alphaCycle(t, 4000, 0.6); if (a < 0.6 - 1e-12 || a > 1 + 1e-12) alphaOk = false; }
ok(alphaOk, 'alphaCycle stays between its minimum and 1');

// the draw helpers, against a recording canvas
function fakeCtx() {
  const ctx = { globalAlpha: 1, strokeStyle: '', lineWidth: 1, lineCap: '', shadowBlur: 0, strokes: [], paths: 0, arcs: 0 };
  ctx.beginPath = () => { ctx.paths++; };
  ctx.moveTo = () => {};
  ctx.lineTo = () => {};
  ctx.arc = () => { ctx.arcs++; };
  ctx.stroke = () => { ctx.strokes.push({ alpha: ctx.globalAlpha, style: ctx.strokeStyle }); };
  return ctx;
}
const RGB = [127, 217, 154];

// radar sweep
let c = fakeCtx(); motion('off').sweep(c, 0, 0, 300, 1000, RGB, 1);
ok(c.strokes.length === 0, 'off: the sweep draws nothing');
c = fakeCtx(); motion('calm').sweep(c, 0, 0, 300, 1000, RGB, 1);
ok(c.strokes.length === 1 && near(c.strokes[0].alpha, 0.07), 'calm: one faint line');
c = fakeCtx(); motion('full').sweep(c, 0, 0, 300, 1000, RGB, 1);
ok(c.strokes.length === 4, 'full: head plus a three-line fading wedge');
ok(c.strokes[3].alpha > c.strokes[2].alpha && c.strokes[2].alpha > c.strokes[1].alpha && c.strokes[1].alpha > c.strokes[0].alpha, 'full: the head (drawn last) is the brightest, the wedge fades behind it');
ok(c.globalAlpha === 1, 'sweep leaves globalAlpha at 1');
ok(c.strokes[0].style === 'rgb(127,217,154)', 'sweep colour string');

// arrival ring and fade-in
c = fakeCtx(); motion('off').drawArrival(c, 0, 0, 1, 1000, 900, RGB);
ok(c.strokes.length === 0, 'off: no ring');
ok(motion('off').arrivalFade(1000, 900) === 1, 'off: arriving symbols are shown at once');
c = fakeCtx(); M.drawArrival(c, 0, 0, 1, 1000, undefined, RGB);
ok(c.strokes.length === 0, 'no arrival time: no ring');
c = fakeCtx(); M.drawArrival(c, 0, 0, 1, 1000, 1000, RGB);
ok(c.strokes.length === 1 && near(c.strokes[0].alpha, 0.55), 'calm: one ring at its peak alpha when it starts');
c = fakeCtx(); M.drawArrival(c, 0, 0, 1, 1000, 1000 - 2000, RGB);
ok(c.strokes.length === 0, 'calm: a ring that is over is not drawn');
c = fakeCtx(); motion('full').drawArrival(c, 0, 0, 1, 1000, 1000, RGB);
ok(c.strokes.length === 1, 'full: no echo before its delay');
c = fakeCtx(); motion('full').drawArrival(c, 0, 0, 1, 1000 + 400, 1000, RGB);
ok(c.strokes.length === 2, 'full: the echo ring follows once');
ok(M.arrivalFade(1000, 1000) === 0 && near(M.arrivalFade(1600, 1000), 1), 'arrival fade-in runs from 0 to 1 over 600 ms');
ok(M.arrivalFade(1000, undefined) === 1, 'no arrival time: fully visible');

// trail draw-on: points slide from the aircraft back to their place; the aircraft is the last point
const pp = [[0, 0], [10, 0], [20, 0]], cur = pp[2];
M.growTrail(pp, cur, 1500, 1000);   // 500 ms into a 1000 ms growth: g = easeOut(0.5) = 0.875
ok(near(pp[0][0], 20 + (0 - 20) * 0.875, 1e-9) && pp[2] === cur && cur[0] === 20, 'trail: points move towards the aircraft, the aircraft point stays');
const pp2 = [[0, 0], [10, 0], [20, 0]];
M.growTrail(pp2, pp2[2], 3000, 1000);
ok(pp2[0][0] === 0, 'trail: fully grown trails are untouched');
const pp3 = [[0, 0], [10, 0], [20, 0]];
motion('off').growTrail(pp3, pp3[2], 1100, 1000);
ok(pp3[0][0] === 0, 'off: trails are not changed');

// runway in use and emergency frame
ok(motion('off').runwayAlpha(1234) === 1 && motion('off').alertAlpha(1234) === 1, 'off: steady runway and steady alert frame');
ok(M.runwayAlpha(undefined) === 1, 'a static layer (no time) stays steady');
let rMin = 9, rMax = -9, aMin = 9, aMax = -9;
for (let t = 0; t < 8000; t += 41) {
  const r = motion('calm').runwayAlpha(t), a = motion('calm').alertAlpha(t);
  rMin = Math.min(rMin, r); rMax = Math.max(rMax, r); aMin = Math.min(aMin, a); aMax = Math.max(aMax, a);
}
ok(near(rMin, 0.75, 1e-3) && near(rMax, 1, 1e-3), 'calm runway breathes between 0.75 and 1');
ok(near(aMin, 0.5, 1e-3) && near(aMax, 1, 1e-3), 'calm alert frame pulses between 0.5 and 1');
const F = motion('full');
ok(near(F.runwayAlpha(0), 0.6) && near(F.alertAlpha(0), 0.3), 'full: the dimmest points are 0.6 (runway) and 0.3 (alert)');

// levels, the palette string cache, and the rowHighlight time
ok(motion('off').rowHighlightMs() === 0 && M.rowHighlightMs() === 900, 'row sweep: 900 ms, none while off');
const c2 = fakeCtx(); M.drawArrival(c2, 0, 0, 1, 1000, 1000, RGB);
ok(RGB._css === 'rgb(127,217,154)', 'palette colour string is cached on the palette array');
const lv = config('?motion=calm'); vm.runInContext(fs.readFileSync(ROOT + '/js/motion.js', 'utf8'), lv, { filename: 'js/motion.js' });
lv.MA.motion.setLevel('constructor');
ok(lv.MA.motion.level === 'off' && lv.MA.motion.enabled() === false, 'setLevel: an unknown name is off');
lv.MA.motion.setLevel('full');
ok(lv.MA.motion.level === 'full' && lv.MA.motion.enabled(), 'setLevel: full');

/* ---- cheapness rules, read from the sources ---- */
const code = (f) => fs.readFileSync(ROOT + '/js/' + f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');   // code without comments
const motionSrc = code('motion.js');
const boardSrc = code('board.js');
const radarSrc = code('radar.js');
ok(!/shadowBlur|filter\s*=/.test(motionSrc) && !/shadowBlur/.test(radarSrc), 'no shadowBlur or canvas filters');
ok(!/setInterval/.test(boardSrc), 'split-flap is driven by the frame loop, not by its own interval');
ok(/MA\.motion\.enabled\(\)/.test(boardSrc), 'split-flap is instant when motion is off');

console.log(fails ? fails + ' of ' + checks + ' motion checks failed' : 'motion: all ' + checks + ' checks passed');
process.exit(fails ? 1 : 0);
