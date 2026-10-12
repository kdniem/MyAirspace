// WCAG contrast check for the TV page, for every style x theme (js/styles.js STYLES table),
// plus the accent presets and a few typed hex accents.
//   node tools/contrast.mjs            all combinations, prints failures and a summary
//   node tools/contrast.mjs -v         also prints passing rows
//   node tools/contrast.mjs atc light  one style and theme, all rows
// Semi-transparent colours are blended over their background first.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const ctx = { window: { MA: {} } };
vm.runInNewContext(readFileSync(new URL('js/styles.js', root), 'utf8'), ctx);
const MA = ctx.window.MA;

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

// [label, fg, bg, minimum]; keys: css custom property names ('--ink') or canvas keys ('c.label')
const ROWS = [
  ['Header place', '--ink', '--bg', 4.5],
  ['Header brand tag', '--dim', '--bg', 4.5],
  ['Clock', '--ink', '--bg', 3],
  ['Date/UTC line', '--sub', '--bg', 4.5],
  ['Summary', '--dim', '--bg', 4.5],
  ['Weather lines', '--sub', '--bg', 4.5],
  ['Weather bold', '--ink', '--bg', 4.5],
  ['Board label', '--dim', '--panel', 4.5],
  ['Board value', '--val-color', '--panel', 3],
  ['Board callsign', '--call-color', '--panel', 3],
  ['Board unit', '--unit-color', '--panel', 4.5],
  ['Board sub-line', '--sub', '--panel', 4.5],
  ['Board tag special', '--special', '--panel', 4.5],
  ['Board tag warning', '--warning', '--panel', 4.5],
  ['Board tag caution', '--caution', '--panel', 4.5],
  ['Attribution', '--attrib', '--bg', 4.5],
  ['Toast text', '--ink', '--toast-bg', 4.5],
  ['Toast label special', '--special', '--toast-bg', 4.5],
  ['Tafel column heads', '--dim', '--head', 4.5],
  ['Tafel row text', '--ink', '--panel', 4.5],
  ['Tafel row secondary', '--sub', '--panel', 4.5],
  ['Tafel status', '--accent', '--panel', 4.5],
  ['Tafel stat value', '--val-color', '--bg', 3],
  ['Map place', 'c.place', 'c.bg', 4.5],
  ['Map place on water', 'c.place', 'c.water', 3],
  ['Map place major', 'c.placeMajor', 'c.bg', 4.5],
  ['Map ring label', 'c.ringLabel', 'c.bg', 4.5],
  ['Map compass label', 'c.tickLabel', 'c.bg', 4.5],
  ['Map airport code', 'c.airport', 'c.bg', 4.5],
  ['Data block callsign', 'c.label', 'c.bg', 4.5],
  ['Data block callsign >FL200', 'c.labelDim', 'c.bg', 4.5],
  ['Data block values', 'c.detail', 'c.bg', 4.5],
  ['Data block units >FL200', 'c.detailDim', 'c.bg', 4.5],
  ['Traffic symbol (normal)', 'c.level', 'c.bg', 3],
  ['Selected target', 'c.target', 'c.bg', 4.5],
  ['Special marker/label', 'c.special', 'c.bg', 4.5],
  ['Warning marker/label', 'c.alert', 'c.bg', 4.5],
  ['Active runway (accent)', 'c.accent', 'c.bg', 4.5]
];

function table(style, theme, opts) {
  const r = MA.style.resolve(style, theme, opts);
  const toastBg = over(r.css['--toast-bg'], r.css['--bg']);
  const get = (k) => {
    if (k.indexOf('c.') === 0) return r.c[k.slice(2)];
    let v = r.css[k] !== undefined ? r.css[k] : (k === '--call-color' ? 'var(--target)' : undefined);
    if (v === undefined) throw new Error('token ' + k);
    const m = /^var\((--[\w-]+)\)$/.exec(v);
    if (m) v = r.css[m[1]];
    return k === '--toast-bg' ? toastBg : v;
  };
  return { get };
}

const args = process.argv.slice(2).filter((a) => a !== '-v');
const verbose = process.argv.indexOf('-v') >= 0 || args.length > 0;
const combos = [];
const styles = args[0] ? [args[0]] : Object.keys(MA.STYLES);
const themes = args[1] ? [args[1]] : ['dark', 'light'];
const accents = args[0] ? [''] : [''].concat(Object.keys(MA.ACCENTS), ['#ff8800', '#336699', '#ffffff', '#000000']);
styles.forEach((s) => themes.forEach((t) => accents.forEach((a) => combos.push([s, t, a]))));

let fails = 0, checked = 0;
combos.forEach(([s, t, a]) => {
  const tb = table(s, t, { accent: a });
  const head = s + ' / ' + t + (a ? ' / accent ' + a : '');
  const lines = [];
  ROWS.forEach(([label, fk, bk, min]) => {
    const r = ratio(tb.get(fk), tb.get(bk));
    checked++;
    if (r < min) { fails++; lines.push('  LOW ' + label.padEnd(30) + r.toFixed(2).padStart(6) + ' : 1   (min ' + min + ')'); }
    else if (verbose) lines.push('  ok  ' + label.padEnd(30) + r.toFixed(2).padStart(6) + ' : 1   (min ' + min + ')');
  });
  if (lines.length) console.log('\n' + head.toUpperCase() + '\n' + lines.join('\n'));
});
// setup page (css/setup.css, guided setup): fixed colour pairs, checked only in the full run
if (!args[0]) {
  const SETUP = [
    ['Setup body text', '#e9e4d8', '#050607', 4.5],
    ['Setup lead text', '#c2bfb5', '#050607', 4.5],
    ['Setup card text', '#c2bfb5', '#101216', 4.5],
    ['Setup secondary text', '#9a9ea4', '#0a0b0d', 4.5],
    ['Setup secondary on field', '#9a9ea4', '#0e1013', 4.5],
    ['Setup placeholder', '#7d8187', '#0e1013', 4.5],
    ['Setup amber on bg', '#ffb547', '#050607', 4.5],
    ['Setup amber on panel', '#ffb547', '#0a0b0d', 4.5],
    ['Setup button label', '#120c02', '#ffb547', 4.5],
    ['Setup error text', '#ff7a7a', '#050607', 4.5],
    ['Setup status on dark', '#c2bfb5', '#050607', 4.5],
    ['Setup URL text', '#ffb547', '#0e1013', 4.5],
    ['Setup QR panel (dark on light)', '#050607', '#f4efe3', 4.5]
  ];
  SETUP.forEach(([label, fg, bg, min]) => {
    const r = ratio(fg, bg);
    checked++;
    if (r < min) { fails++; console.log('SETUP LOW ' + label.padEnd(30) + r.toFixed(2).padStart(6) + ' : 1   (min ' + min + ')'); }
    else if (verbose) console.log('SETUP ok  ' + label.padEnd(30) + r.toFixed(2).padStart(6) + ' : 1   (min ' + min + ')');
  });
}
console.log('\n' + combos.length + ' combinations, ' + checked + ' checks: ' + (fails ? fails + ' below target' : 'all at or above target'));
process.exit(fails ? 1 : 0);
