// Run: node tools/tests/poll-test.cjs .
// Unit test of the poll back-off (MA.data.pollDelay) and the Retry-After parser in js/data.js.
const vm = require('vm'), fs = require('fs'), assert = require('assert');
const ROOT = process.argv[2] || '.';
const ctx = { console, Math, JSON, Promise, setTimeout, clearTimeout, location: { search: '' } };
ctx.window = ctx;
ctx.MA = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(ROOT + '/js/data.js', 'utf8'), ctx, { filename: 'js/data.js' });
const { pollDelay, parseRetryAfter } = ctx.MA.data;
const P = (o) => pollDelay(Object.assign({ baseMs: 5000, failures: 0, recover: 0, retryAfterMs: 0 }, o));
let n = 0;
function t(name, fn) { fn(); n++; console.log('ok  ' + name); }

t('normal: exactly the base interval', () => assert.strictEqual(P({}), 5000));
t('failures back off exponentially, capped at 60 s', () => {
  const d = [1, 2, 3, 4, 5, 6, 10, 50].map((f) => P({ failures: f }));
  for (let i = 1; i < d.length; i++) assert.ok(d[i] >= d[i - 1]);
  assert.strictEqual(d[0], 8000);
  assert.strictEqual(d[d.length - 1], 60000);
});
t('Retry-After raises the delay but is capped at 120 s', () => {
  assert.strictEqual(P({ failures: 1, retryAfterMs: 30000 }), 30000);
  assert.strictEqual(P({ failures: 1, retryAfterMs: 2000 }), 8000);      // shorter than the back-off: ignored
  assert.strictEqual(P({ failures: 1, retryAfterMs: 999999 }), 120000);
  assert.strictEqual(P({ failures: 0, retryAfterMs: 30000 }), 5000);     // only while failing
});
t('recovery returns to the base rate step by step', () => {
  const steps = [3, 2, 1, 0].map((r) => P({ recover: r }));
  assert.deepStrictEqual(steps, [12500, 10000, 7500, 5000]);
});
t('jitter stays within +-10 %', () => {
  assert.strictEqual(P({ jitter: 0 }), 4500);
  assert.strictEqual(P({ jitter: 1 }), 5500);
  assert.strictEqual(P({ jitter: 0.5 }), 5000);
});
t('parseRetryAfter: plain seconds only, capped', () => {
  assert.strictEqual(parseRetryAfter('17'), 17000);
  assert.strictEqual(parseRetryAfter(' 5 '), 5000);
  assert.strictEqual(parseRetryAfter('99999'), 120000);
  for (const v of [null, undefined, '', '-3', '1.5', 'abc', 'Wed, 21 Oct 2026 07:28:00 GMT', 7]) assert.strictEqual(parseRetryAfter(v), 0, String(v));
});
t('simulated outage and recovery: delays rise, then fall to base', () => {
  let failures = 0, recover = 0; const seq = [];
  const poll = (ok) => {
    if (ok) { recover = failures ? Math.min(3, failures) : Math.max(0, recover - 1); failures = 0; } else failures++;
    seq.push(P({ failures, recover }));
  };
  [false, false, false, true, true, true, true, true].forEach(poll);
  assert.ok(seq[2] > seq[0]);
  assert.ok(seq[3] < seq[2] && seq[3] > 5000);
  assert.strictEqual(seq[seq.length - 1], 5000);
});
console.log(n + ' tests passed');
