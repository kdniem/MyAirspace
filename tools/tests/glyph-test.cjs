// Run: node tools/tests/glyph-test.cjs .
// Unit test of the glyph choice (js/glyphs.js MA.glyphs.kind), run as classic scripts in a vm context with
// js/format.js for the rotorcraft check. Covers the mapping fixed for SU95 (Superjet, not a fighter) and a few
// anchors per silhouette family, so a regex change that moves a common type is noticed.
const vm = require('vm'), fs = require('fs'), assert = require('assert');
const ROOT = process.argv[2] || '.';
let n = 0;
function t(name, fn) { fn(); n++; console.log('ok  ' + name); }

const ctx = { window: { MA: {} }, console };
ctx.MA = ctx.window.MA;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(ROOT + '/js/format.js', 'utf8'), ctx, { filename: 'js/format.js' });
vm.runInContext(fs.readFileSync(ROOT + '/js/glyphs.js', 'utf8'), ctx, { filename: 'js/glyphs.js' });
const kind = (type, category) => ctx.MA.glyphs.kind({ type: type, category: category || '' });

t('SU95 (Superjet 100) is a regional jet, not a fighter', () => {
  assert.strictEqual(kind('SU95', 'A3'), 'regional');
});

t('Sukhoi fighters keep the fighter silhouette', () => {
  assert.strictEqual(kind('SU35', 'A3'), 'fighter');
  assert.strictEqual(kind('SU30', 'A3'), 'fighter');
});

t('anchors per family: narrow, regional, wide, jumbo, prop, biz, small, fighter, heli', () => {
  assert.strictEqual(kind('A320', 'A3'), 'narrow');
  assert.strictEqual(kind('E175', 'A2'), 'regional');
  assert.strictEqual(kind('B789', 'A5'), 'wide');
  assert.strictEqual(kind('A388', 'A5'), 'jumbo');
  assert.strictEqual(kind('AT76', 'A2'), 'prop');
  assert.strictEqual(kind('C130', 'A5'), 'prop');
  assert.strictEqual(kind('C56X', 'A2'), 'biz');
  assert.strictEqual(kind('C172', 'A1'), 'small');
  assert.strictEqual(kind('EUFI', 'A3'), 'fighter');
  assert.strictEqual(kind('EC35', 'A7'), 'heli');
});

t('category fallback when the type is unknown', () => {
  assert.strictEqual(kind('', 'A5'), 'wide');
  assert.strictEqual(kind('', 'A2'), 'regional');
  assert.strictEqual(kind('', 'A1'), 'small');
  assert.strictEqual(kind('ZZZZ', 'A3'), 'narrow');
});

console.log(n + ' glyph tests passed');
