// Run: node tools/tests/pick-test.cjs .
// Simulates 10 minutes of moving traffic through MA.pick.next (js/pick.js) and checks that the board stays calm:
// average dwell >= 12 s, no switch before 12 s (except an emergency newcomer), no A-B-A within 30 s,
// emergencies jump at once, a very close newcomer only replaces a far or leaving aircraft.
const vm = require('vm'), fs = require('fs');
const ROOT = process.argv[2] || '.';
let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.log('FAIL', msg); } }

function load() {
  const ctx = { console, Math, Object, Date };
  ctx.window = ctx;
  ctx.MA = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(ROOT + '/js/pick.js', 'utf8'), ctx, { filename: 'js/pick.js' });
  return ctx.MA.pick;
}
const pick = load();
function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

/* ---- 10 minutes of traffic: straight tracks across a 25 km radius, a new aircraft about every 25-45 s ---- */
function simulate(seed, withEmergency) {
  const R = rng(seed), cfg = { radiusKm: 25, rotateSec: 20 };
  const planes = [];
  let t = -120;                                   // start with traffic already around
  let n = 0;
  while (t < 600) {
    const ang = R() * 2 * Math.PI, off = (R() - 0.5) * 30, v = 0.08 + R() * 0.12;   // km/s: 290..720 km/h
    // start 45 km out on bearing ang, heading roughly through the centre with a lateral offset
    const sx = Math.sin(ang) * 45, sy = Math.cos(ang) * 45, dx = -Math.sin(ang), dy = -Math.cos(ang);
    const px = -dy * off, py = dx * off;
    planes.push({ hex: ('a0000' + (n++)).slice(-6) + 'x'.slice(0, 0), t0: t, sx: sx + px, sy: sy + py, vx: dx * v, vy: dy * v, special: null });
    t += 25 + R() * 20;
  }
  let emerg = null;
  if (withEmergency) {
    emerg = { hex: 'ffee01', t0: 200, sx: 20, sy: -20, vx: -0.03, vy: 0.03, special: { alert: true } };
    planes.push(emerg);
  }
  planes.push({ hex: 'bb0001', t0: 330, sx: 40, sy: 10, vx: -0.12, vy: 0, special: { alert: false } });   // a special (not an emergency)
  const st = pick.create(), log = [];
  let curHex = null, since = 0, prev = null;
  const switches = [];
  for (let now = 0; now < 600; now += 0.5) {
    const list = [];
    planes.forEach((p) => {
      if (now < p.t0) return;
      const k = now - p.t0, x = p.sx + p.vx * k, y = p.sy + p.vy * k;
      list.push({ hex: p.hex, dist: Math.sqrt(x * x + y * y), fade: 1, special: p.special });
    });
    list.sort((a, b) => a.dist - b.dist);
    const before = st.hex;
    const feat = pick.next(st, list, now * 1000 + 1e6, cfg);
    if (st.hex !== before) {
      const gone = before !== null && !list.some((a) => a.hex === before && a.dist <= cfg.radiusKm * 1.15);
      switches.push({ t: now, from: before, to: st.hex, reason: st.reason, forced: gone || before === null });
    }
  }
  return { switches, emerg, planes };
}

[11, 23, 42, 77].forEach((seed) => {
  const { switches, emerg } = simulate(seed, true);
  const tag = 'seed ' + seed + ': ';
  ok(switches.length > 10, tag + 'enough switches (' + switches.length + ')');
  // dwell of each aircraft
  const dwells = [];
  for (let i = 1; i < switches.length; i++) dwells.push(switches[i].t - switches[i - 1].t);
  const avg = dwells.reduce((a, b) => a + b, 0) / dwells.length;
  ok(avg >= 12, tag + 'average dwell ' + avg.toFixed(1) + ' s >= 12');
  for (let i = 1; i < switches.length; i++) {
    const d = switches[i].t - switches[i - 1].t, s = switches[i];
    if (!s.forced && s.reason !== 'emergency') ok(d >= 12, tag + 'switch ' + s.reason + ' after only ' + d + ' s at t=' + s.t);
  }
  // no A-B-A within 30 s (a forced return because the other one left is not a ping-pong)
  for (let i = 2; i < switches.length; i++) {
    const a = switches[i - 2], c = switches[i];
    if (c.to === a.to && !c.forced) ok(c.t - a.t >= 30, tag + 'ping-pong ' + a.to + ' -> ' + switches[i - 1].to + ' -> ' + c.to + ' within ' + (c.t - a.t) + ' s');
  }
  // the same aircraft never twice in a row
  switches.forEach((s) => ok(s.from !== s.to, tag + 'switch to itself'));
  // emergency: the featured aircraft changes in the very first step after it enters the radius
  const jump = switches.find((s) => s.to === emerg.hex);
  ok(!!jump && jump.reason === 'emergency', tag + 'emergency was shown by an emergency jump');
  if (jump) {
    let inT = null;
    for (let t = emerg.t0; t < 600; t += 0.5) {
      const k = t - emerg.t0, x = emerg.sx + emerg.vx * k, y = emerg.sy + emerg.vy * k;
      if (Math.sqrt(x * x + y * y) <= 25) { inT = t; break; }
    }
    ok(inT !== null && jump.t - inT <= 1, tag + 'emergency jump delay ' + (jump && inT !== null ? jump.t - inT : '?') + ' s');
  }
});

/* ---- rules on hand-made situations ---- */
function ac(hex, dist, extra) { return Object.assign({ hex: hex, dist: dist, fade: 1, special: null }, extra || {}); }
const cfg = { radiusKm: 25, rotateSec: 20 };
let st = pick.create();
let r = pick.next(st, [ac('a', 10), ac('b', 12)], 0, cfg);
ok(r.hex === 'a', 'first pick: lowest hex of equally unseen, nearest four (' + r.hex + ')');
// rank change alone does not switch
r = pick.next(st, [ac('b', 5), ac('a', 10)], 3000, cfg);
ok(r.hex === 'a', 'no switch on rank change');
// close newcomer: current is near (< 6 km) and not leaving -> stays even after the dwell
r = pick.next(st, [ac('c', 1.5), ac('a', 4), ac('b', 12)], 13000, cfg);
ok(r.hex === 'a', 'close newcomer does not replace a near aircraft');
// current far away -> close newcomer takes over after 12 s
st = pick.create();
pick.next(st, [ac('a', 15), ac('b', 20)], 0, cfg);
r = pick.next(st, [ac('c', 1.5), ac('a', 15), ac('b', 20)], 5000, cfg);
ok(r.hex === 'a', 'close newcomer waits for the 12 s dwell');
r = pick.next(st, [ac('c', 1.5), ac('a', 15), ac('b', 20)], 13000, cfg);
ok(r.hex === 'c', 'close newcomer replaces a far aircraft after the dwell');
// emergency interrupts at once
st = pick.create();
pick.next(st, [ac('a', 10), ac('b', 12)], 0, cfg);
r = pick.next(st, [ac('a', 10), ac('b', 12), ac('e', 20, { special: { alert: true } })], 1000, cfg);
ok(r.hex === 'e', 'emergency newcomer jumps immediately');
// rotation after rotateSec to the other aircraft, and not back within 30 s
st = pick.create();
pick.next(st, [ac('a', 10), ac('b', 12)], 0, cfg);
r = pick.next(st, [ac('a', 10), ac('b', 12)], 21000, cfg);
ok(r.hex === 'b', 'rotation after 20 s');
r = pick.next(st, [ac('a', 10), ac('b', 12)], 42000, cfg);
ok(r.hex === 'b', 'no return to an aircraft shown less than 30 s ago');
r = pick.next(st, [ac('a', 10), ac('b', 12)], 52000, cfg);
ok(r.hex === 'a', 'rotation returns once 30 s have passed');
// current leaves: forced switch at once
r = pick.next(st, [ac('b', 12)], 53000, cfg);
ok(r.hex === 'b', 'current gone: next one at once');
r = pick.next(st, [], 54000, cfg);
ok(r === null && st.hex === null, 'empty sky');

console.log(fails ? fails + ' failed' : 'pick: all passed');
process.exit(fails ? 1 : 0);
