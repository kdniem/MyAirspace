// Run: node tools/tests/nodata-test.cjs .
// State test of the degraded-data notice (js/nodata.js): shown while the last poll failed on every source,
// removed by the first successful poll, text set with textContent only. Also checks the wiring in index.html,
// js/main.js and the service worker shell list. The visible check in a real page is in tools/tests/browser.mjs.
const vm = require('vm'), fs = require('fs'), assert = require('assert');
const ROOT = process.argv[2] || '.';
let n = 0;
function t(name, fn) { fn(); n++; console.log('ok  ' + name); }

const ctx = { window: { MA: {} }, console };
ctx.MA = ctx.window.MA;
vm.createContext(ctx);
const src = fs.readFileSync(ROOT + '/js/nodata.js', 'utf8');
vm.runInContext(src, ctx, { filename: 'js/nodata.js' });
const N = ctx.MA.nodata;

function el() { return { textContent: '', hidden: false, innerHTML: 'unset' }; }

t('the notice text is the agreed German sentence', () => {
  assert.strictEqual(N.TEXT, 'Keine Flugdaten – Quelle nicht erreichbar, neuer Versuch läuft');
});

t('wanted: only while the last poll failed (failures > 0)', () => {
  assert.strictEqual(N.wanted(null), false);
  assert.strictEqual(N.wanted({ failures: 0, lastOk: 0 }), false, 'still connecting: no notice');
  assert.strictEqual(N.wanted({ failures: 1, lastOk: 0 }), true, 'first failure, nothing ever received');
  assert.strictEqual(N.wanted({ failures: 3, lastOk: 12345 }), true, 'failing after earlier data');
  assert.strictEqual(N.wanted({ failures: 0, lastOk: 12345 }), false, 'recovered: removed');
});

t('apply shows the notice with textContent and hides it again after recovery', () => {
  const e = el();
  assert.strictEqual(N.apply(e, { failures: 2, lastOk: 0 }), true);
  assert.strictEqual(e.hidden, false);
  assert.strictEqual(e.textContent, N.TEXT);
  assert.strictEqual(N.apply(e, { failures: 0, lastOk: 99 }), false);
  assert.strictEqual(e.hidden, true, 'removed after a successful poll');
  assert.strictEqual(e.innerHTML, 'unset', 'innerHTML is never written');
});

t('apply without the element (other pages) returns the state and does not throw', () => {
  assert.strictEqual(N.apply(null, { failures: 1 }), true);
  assert.strictEqual(N.apply(undefined, null), false);
});

t('source: textContent only, no innerHTML, no ES2018+ syntax', () => {
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML/.test(src), 'no HTML sinks');
  assert.ok(!/\?\.|\?\?|=>|\bclass\s|\blet\b|\bconst\b/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), 'ES2017 only');
});

t('wiring: index.html has the element and loads nodata.js before main.js; main.js updates it; sw.js shell lists it', () => {
  const html = fs.readFileSync(ROOT + '/index.html', 'utf8');
  assert.ok(/<div id="nodata"[^>]*\bhidden\b/.test(html), 'notice element starts hidden');
  assert.ok(html.indexOf('js/nodata.js') > 0 && html.indexOf('js/nodata.js') < html.indexOf('js/main.js'));
  const main = fs.readFileSync(ROOT + '/js/main.js', 'utf8');
  assert.ok(/MA\.nodata\.apply\(document\.getElementById\('nodata'\)/.test(main));
  const sw = fs.readFileSync(ROOT + '/sw.js', 'utf8');
  assert.ok(/'js\/nodata\.js'/.test(sw), 'nodata.js in the service worker shell list');
});

console.log(n + ' nodata tests passed');
