// WCAG contrast check for the TV page's text colours, per theme.
//   node tools/contrast.mjs          current files (css/style.css vars + js/radar.js palettes)
//   node tools/contrast.mjs before   the hard-coded colours of Release 1 (reference)
// Semi-transparent colours are blended over their background first. The board's
// dot-matrix overlay is ignored (it darkens ~half of each dot cell slightly).
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);

function parse(c) {
  if (Array.isArray(c)) return [c[0], c[1], c[2], c.length > 3 ? c[3] : 1];
  c = String(c).trim();
  let m = /^#([0-9a-f]{6})$/i.exec(c);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].substr(i, 2), 16)).concat(1);
  m = /^#([0-9a-f]{3})$/i.exec(c);
  if (m) return m[1].split('').map((h) => parseInt(h + h, 16)).concat(1);
  m = /^rgba?\(([^)]+)\)$/.exec(c);
  if (m) {
    const p = m[1].split(',').map(parseFloat);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  throw new Error('colour? ' + c);
}
function over(fg, bg) {
  const f = parse(fg), b = parse(bg);
  return [0, 1, 2].map((i) => f[i] * f[3] + b[i] * (1 - f[3])).concat(1);
}
function lum(c) {
  const v = c.slice(0, 3).map((x) => {
    x /= 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
function ratio(fg, bg) {
  const b = over(bg, '#000000'), f = over(fg, b);
  const l1 = lum(f), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
const alpha = (c, a) => { const p = parse(c); return [p[0], p[1], p[2], p[3] * a]; };

// [label, fg key, bg key, minimum]  (3 = large text / graphics, 4.5 = normal text)
const ROWS = [
  ['Header brand MYAIRSPACE', 'brandName', 'bg', 4.5],
  ['Header place', 'brandPlace', 'bg', 4.5],
  ['Clock', 'clock', 'bg', 3],
  ['Summary', 'summary', 'bg', 4.5],
  ['Weather lines #wx', 'wx', 'bg', 4.5],
  ['Weather bold runway', 'wxBold', 'bg', 4.5],
  ['Board label .lbl', 'lbl', 'panel', 4.5],
  ['Board sub-line .sub', 'sub', 'panel', 4.5],
  ['Board LED climbing/level', 'amber', 'panel', 3],
  ['Board LED descending', 'cyan', 'panel', 3],
  ['Board badge special', 'violet', 'panel', 4.5],
  ['Board badge alert', 'red', 'panel', 4.5],
  ['Attribution', 'attrib', 'bg', 4.5],
  ['Setup hint', 'hint', 'bg', 4.5],
  ['Toast text', 'ink', 'toastBg', 4.5],
  ['Tafel date', 'dim', 'bg', 4.5],
  ['Tafel column heads', 'dim', 'panel', 4.5],
  ['Tafel row level', 'rowLevel', 'panel', 3],
  ['Tafel row climbing', 'amber', 'panel', 3],
  ['Tafel row descending', 'cyan', 'panel', 3],
  ['Tafel stat label', 'dim', 'bg', 4.5],
  ['Tafel stat value', 'amber', 'bg', 3],
  ['Tafel stat extra', 'sub', 'bg', 4.5],
  ['Map place', 'c.place', 'c.bg', 4.5],
  ['Map place on water (halo-outlined)', 'c.place', 'c.water', 3],
  ['Map place major', 'c.placeMajor', 'c.bg', 4.5],
  ['Map ring label', 'c.ringLabel', 'c.bg', 4.5],
  ['Map airport code', 'c.airport', 'c.bg', 4.5],
  ['Aircraft callsign', 'c.label', 'c.bg', 4.5],
  ['Aircraft callsign >FL200', 'c.labelDim', 'c.bg', 4.5],
  ['Aircraft alt/type', 'c.detail', 'c.bg', 4.5],
  ['Aircraft alt/type >FL200', 'c.detailDim', 'c.bg', 4.5],
  ['Aircraft climbing (glyph)', 'c.up', 'c.bg', 3],
  ['Aircraft descending (glyph)', 'c.down', 'c.bg', 3],
  ['Aircraft level (glyph)', 'c.level', 'c.bg', 3],
  ['Special label/halo', 'c.special', 'c.bg', 4.5],
  ['Alert label/halo', 'c.alert', 'c.bg', 4.5]
];

// Release 1 (main before "Lesbarkeit"): literal colours incl. element opacities.
const INK = '#e9e4d8', DIM = '#6d7176';
const BEFORE = {
  dark: {
    bg: '#050607', panel: '#0a0b0d', ink: INK, dim: DIM,
    brandName: alpha(INK, 0.85), brandPlace: DIM, clock: alpha(INK, 0.9), summary: DIM,
    wx: alpha(DIM, 0.85), wxBold: alpha(INK, 0.68), lbl: DIM, sub: '#9a9ea3',
    amber: '#ffb547', cyan: '#63d3e8', violet: '#c78bff', red: '#ff5d5d',
    attrib: '#3d4146', hint: alpha(DIM, 0.8), toastBg: 'rgba(10, 11, 13, 0.92)', rowLevel: INK,
    c: {
      bg: '#050607', water: '#121c23', place: 'rgba(255,255,255,0.20)', placeMajor: 'rgba(255,255,255,0.30)',
      ringLabel: 'rgba(255,255,255,0.22)', airport: 'rgba(233,228,216,0.45)',
      label: 'rgba(233,228,216,0.78)', labelDim: 'rgba(233,228,216,0.45)',
      detail: 'rgba(233,228,216,0.55)', detailDim: 'rgba(233,228,216,0.3)',
      up: [255, 181, 71], down: [99, 211, 232], level: [233, 228, 216], special: [199, 139, 255], alert: [255, 93, 93]
    }
  }
};

// Current files: CSS custom properties per theme + canvas palettes from js/radar.js.
function current() {
  const css = readFileSync(new URL('css/style.css', root), 'utf8');
  function block(sel) {
    const i = css.indexOf(sel + ' {');
    if (i < 0) throw new Error('no block ' + sel);
    const body = css.slice(i, css.indexOf('}', i));
    const out = {};
    body.replace(/--([\w-]+):\s*([^;]+);/g, (m, k, v) => { out[k] = v.trim(); });
    return out;
  }
  const dark = block(':root');
  const light = Object.assign({}, dark, block(':root[data-theme="light"]'));
  const ctx = { window: { MA: {} } };
  vm.runInNewContext(readFileSync(new URL('js/radar.js', root), 'utf8'), ctx);
  const pal = ctx.window.MA.Radar.palettes;
  function map(v, c) {
    return {
      bg: v.bg, panel: v.panel, ink: v.ink, dim: v.dim,
      brandName: v.ink, brandPlace: v.dim, clock: v.ink, summary: v.dim,
      wx: v.sub, wxBold: v.ink, lbl: v.dim, sub: v.sub,
      amber: v.amber, cyan: v.cyan, violet: v.violet, red: v.red,
      attrib: v.attrib, hint: v.dim, toastBg: v['toast-bg'], rowLevel: v.ink, c
    };
  }
  return { dark: map(dark, pal.dark), light: map(light, pal.light) };
}

const themes = process.argv[2] === 'before' ? BEFORE : current();
let fails = 0;
for (const name of Object.keys(themes)) {
  const t = themes[name];
  const get = (k) => (k.indexOf('c.') === 0 ? t.c[k.slice(2)] : t[k]);
  console.log('\n' + name.toUpperCase());
  for (const [label, fk, bk, min] of ROWS) {
    const r = ratio(get(fk), get(bk));
    const ok = r >= min;
    if (!ok) fails++;
    console.log((ok ? '  ok  ' : '  LOW ') + label.padEnd(30) + r.toFixed(2).padStart(6) + ' : 1   (min ' + min + ')');
  }
}
console.log('\n' + (fails ? fails + ' below target' : 'all at or above target'));
