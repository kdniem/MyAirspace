// Distinctness of the seven default looks (js/styles.js STYLES). Run: node tools/tests/theme-distinct-test.cjs [root]
//
// The seven default palettes (each look in its default theme, default accent) are laid out in a 3x3 test grid
// (seven cells filled, two empty). For every one of the 21 pairs the test checks:
//   1. background: CIEDE2000 between the two background colours (bg)           must be >= BG_MIN
//   2. accent:     CIEDE2000 between the two accent colours                     must be >= ACC_MIN
//      a pair passes when (1) OR (2) holds: two looks may share a background if their accent differs, and vice versa
//   3. typography class (font family, weight, capitals, label tracking) must differ for every pair
// Thresholds (CIEDE2000 units; a just-noticeable difference is about 1, clearly different colours are 10+):
const BG_MIN = 8;    // backgrounds of two looks must be clearly apart (dark-only looks share near-black, so this is the weaker test)
const ACC_MIN = 20;  // accents must be clearly apart (hue family and lightness)
const vm = require('vm'), fs = require('fs'), path = require('path');
const ROOT = process.argv[2] || '.';
let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.log('FAIL', msg); } }

// ---- colour: sRGB -> Lab (D65) -> CIEDE2000 ----
function toLab(hex) {
  const n = [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  const X = (n[0] * 0.4124 + n[1] * 0.3576 + n[2] * 0.1805) / 0.95047;
  const Y = (n[0] * 0.2126 + n[1] * 0.7152 + n[2] * 0.0722);
  const Z = (n[0] * 0.0193 + n[1] * 0.1192 + n[2] * 0.9505) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
function deltaE2000(l1, l2) {
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const C1 = Math.hypot(l1[1], l1[2]), C2 = Math.hypot(l2[1], l2[2]), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
  const a1 = (1 + G) * l1[1], a2 = (1 + G) * l2[1];
  const Cp1 = Math.hypot(a1, l1[2]), Cp2 = Math.hypot(a2, l2[2]);
  const hp = (a, b) => (a === 0 && b === 0 ? 0 : (Math.atan2(b, a) * deg + 360) % 360);
  const h1 = hp(a1, l1[2]), h2 = hp(a2, l2[2]);
  const dL = l2[0] - l1[0], dC = Cp2 - Cp1;
  let dh = 0;
  if (Cp1 * Cp2 !== 0) { dh = h2 - h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin(dh / 2 * rad);
  const Lb = (l1[0] + l2[0]) / 2, Cpb = (Cp1 + Cp2) / 2;
  let hb = h1 + h2;
  if (Cp1 * Cp2 !== 0) { hb = Math.abs(h1 - h2) > 180 ? (h1 + h2 + 360) / 2 : (h1 + h2) / 2; }
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
  const dTheta = 30 * Math.exp(-Math.pow((hb - 275) / 25, 2));
  const RC = 2 * Math.sqrt(Math.pow(Cpb, 7) / (Math.pow(Cpb, 7) + Math.pow(25, 7)));
  const SL = 1 + 0.015 * Math.pow(Lb - 50, 2) / Math.sqrt(20 + Math.pow(Lb - 50, 2));
  const SC = 1 + 0.045 * Cpb, SH = 1 + 0.015 * Cpb * T;
  const RT = -Math.sin(2 * dTheta * rad) * RC;
  return Math.sqrt(Math.pow(dL / SL, 2) + Math.pow(dC / SC, 2) + Math.pow(dH / SH, 2) + RT * (dC / SC) * (dH / SH));
}
// self-check of the formula: identical colours, and black against white (the scale's extremes)
ok(Math.abs(deltaE2000(toLab('#000000'), toLab('#000000'))) < 1e-9, 'deltaE of identical colours is 0');
ok(deltaE2000(toLab('#ffffff'), toLab('#000000')) > 99, 'white against black is about 100');

// ---- load the table exactly as the TV page does ----
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/styles.js'), 'utf8'), ctx, { filename: 'js/styles.js' });
const MA = ctx.window.MA;
const names = MA.style.names();
ok(names.length === 7, 'seven looks, found ' + names.length);

// 3x3 test grid: cell i = look i (row-major); the last two cells stay empty
const grid = [];
for (let i = 0; i < 9; i++) grid.push(null);
const looks = names.map((n, i) => {
  const st = MA.STYLES[n], theme = MA.style.defaultTheme(n);
  const r = MA.style.resolve(n, theme, {});
  const item = {
    name: n, cell: i, theme: theme,
    bg: r.css['--bg'], accent: r.css['--accent'],
    type: [st.font, st.weight, st.caps ? 'CAPS' : 'mixed', st.track + 'em'].join(' | ')
  };
  grid[i] = item;
  return item;
});

console.log('3x3 grid of default looks (theme, background, accent, typography class):');
for (let row = 0; row < 3; row++) {
  const cells = [];
  for (let col = 0; col < 3; col++) {
    const it = grid[row * 3 + col];
    cells.push(it ? (it.name + ' ' + it.bg + ' ' + it.accent + ' ' + it.theme) : '(empty)');
  }
  console.log('  ' + cells.join('  |  '));
}

// ---- pairwise check ----
let minBg = 1e9, minAcc = 1e9, worst = '';
const rows = [];
for (let i = 0; i < looks.length; i++) {
  for (let j = i + 1; j < looks.length; j++) {
    const a = looks[i], b = looks[j];
    const dBg = deltaE2000(toLab(a.bg), toLab(b.bg));
    const dAcc = deltaE2000(toLab(a.accent), toLab(b.accent));
    const passBg = dBg >= BG_MIN, passAcc = dAcc >= ACC_MIN;
    const passType = a.type !== b.type;
    ok(passBg || passAcc, 'pair ' + a.name + ' / ' + b.name + ': background dE ' + dBg.toFixed(1) + ' < ' + BG_MIN + ' and accent dE ' + dAcc.toFixed(1) + ' < ' + ACC_MIN);
    ok(passType, 'pair ' + a.name + ' / ' + b.name + ': same typography class (' + a.type + ')');
    if (dAcc < minAcc) minAcc = dAcc;
    if (dBg < minBg) { minBg = dBg; worst = a.name + ' / ' + b.name; }
    rows.push('  ' + (a.name + ' / ' + b.name).padEnd(30) + ' bg dE ' + dBg.toFixed(1).padStart(5) + (passBg ? ' ok ' : '    ') +
      ' accent dE ' + dAcc.toFixed(1).padStart(5) + (passAcc ? ' ok ' : '    ') + ' type ' + (passType ? 'differs' : 'SAME'));
  }
}
console.log('\npairwise (21):');
rows.forEach((r) => console.log(r));
console.log('\naccent hues: ' + looks.map((l) => {
  const lab = toLab(l.accent), h = (Math.atan2(lab[2], lab[1]) * 180 / Math.PI + 360) % 360;
  return l.name + ' ' + h.toFixed(0) + ' deg';
}).join(', '));
console.log('thresholds: background dE00 >= ' + BG_MIN + ' or accent dE00 >= ' + ACC_MIN + '; typography class must differ');
console.log('smallest accent dE00 ' + minAcc.toFixed(1) + ', smallest background dE00 ' + minBg.toFixed(1) + ' (' + worst + ')');
console.log(fails ? fails + ' distinctness check(s) failed' : 'distinctness: all 21 pairs differ');
process.exit(fails ? 1 : 0);
