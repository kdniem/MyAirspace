// Run: node tools/tests/diag-test.cjs .
// Unit test of the local diagnostics log (js/diag.js), run as a classic script in a vm context:
// ring buffer cap (500), pruning (72 h), privacy (no lat/lon/label/title/callsign in stored events,
// export or panel text), the 24 h summary for a scripted outage, stall detection, blocked storage,
// hook presence in the app, and that the version matches sw.js.
const vm = require('vm'), fs = require('fs'), assert = require('assert');
const ROOT = process.argv[2] || '.';
const T = Date.UTC(2026, 9, 12, 10, 0, 0);     // a fixed "now"
const H = 3600 * 1000;
let n = 0;
function t(name, fn) { fn(); n++; console.log('ok  ' + name); }

// A fresh copy of js/diag.js. The document starts in 'loading' so the start (boot, panel, setup box)
// runs only when a test calls ctx.__dcl (after the clock is set).
function fresh(opts) {
  opts = opts || {};
  const data = {};
  const store = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { data[k] = String(v); },
    removeItem(k) { delete data[k]; },
    data
  };
  const dcl = [];
  const listeners = {};
  const ctx = {
    console, Math, JSON, Date, Array, Object, String, Number, Error, RegExp, isNaN, isFinite, parseInt, parseFloat,
    URLSearchParams,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0,
    location: { search: opts.search || '', pathname: '/' },
    document: {
      readyState: 'loading', visibilityState: 'visible',
      addEventListener(type, fn) { if (type === 'DOMContentLoaded') dcl.push(fn); },
      getElementById() { return null; }
    },
    innerWidth: 1280, innerHeight: 720,
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); }
  };
  ctx.__listeners = listeners;
  ctx.window = ctx; ctx.self = ctx; ctx.top = opts.embedded ? {} : ctx;
  if (opts.noStorage) Object.defineProperty(ctx, 'localStorage', { get() { throw new Error('SecurityError'); } });
  else ctx.localStorage = store;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(ROOT + '/js/diag.js', 'utf8'), ctx, { filename: 'js/diag.js' });
  ctx.__dcl = dcl;
  ctx.__store = store;
  return ctx;
}
function started(ctx, at) {
  let now = at;
  ctx.MA.diag._setClock(() => now);
  ctx.__dcl.forEach((f) => f());     // boot, panel, setup box
  return { D: ctx.MA.diag, setNow(x) { now = x; } };
}

// ---------- ring buffer ----------
t('ring buffer keeps at most 500 events, the newest', () => {
  const { D } = started(fresh(), T);
  D.clear();
  for (let i = 0; i < 600; i++) D._logAt(T + i, 'net', 'online', 'n' + i, null);
  assert.strictEqual(D.events().length, 500);
  assert.strictEqual(D.events()[0].m, 'n100');
  assert.strictEqual(D.events()[499].m, 'n599');
});

t('entries older than 72 h are pruned', () => {
  const ctx = fresh(); const { D, setNow } = started(ctx, T);
  D.clear();
  D._logAt(T, 'net', 'online', 'a', null);            // fresh now
  D._logAt(T + 50 * H, 'net', 'online', 'b', null);
  setNow(T + 73 * H);
  D._prune();
  const left = D.events().map((e) => e.m);
  assert.deepEqual(left, ['b'], 'a (73 h old) pruned, b (23 h old) kept: ' + left.join(','));
  D._flush();
  assert.ok(!/"m":"a"/.test(ctx.__store.data['ma.diag'] || ''), 'pruned entry not written');
});

t('writes are batched: one timer for many events, storage is written on flush', () => {
  const ctx = fresh(); const { D } = started(ctx, T);
  D.clear();
  for (let i = 0; i < 20; i++) D.log('net', 'online', 'x' + i);
  assert.strictEqual(ctx.__store.data['ma.diag'], undefined, 'nothing written before the flush');
  D._flush();
  assert.strictEqual(JSON.parse(ctx.__store.data['ma.diag']).length, 20);
});

// ---------- privacy ----------
t('no lat/lon/label/title/callsign reaches the stored log, the export or the panel text', () => {
  const ctx = fresh(); const { D } = started(ctx, T);
  D.clear();
  // object form: only k, c, m, d are read
  D.log({ k: 'boot', c: 'v-test', m: 'Radar', d: 5, lat: 53.5511, lon: 9.9937, label: 'Hamburg', title: 'Zuhause', callsign: 'DLH123', hex: '3c6444' });
  // message form: values that look like leaks are scrubbed
  D.log('error', 'js', 'app.js:12 Fehler lat=53.5511&lon=9.9937 label=Hamburg title=Zuhause DLH123 https://x.example/api?lat=53.5511&lon=9.9937 Pos 53.551123');
  D.log('data', 'adsb.lol', 'Zeitüberschreitung', 800);
  D._flush();
  const raw = ctx.__store.data['ma.diag'];
  for (const bad of ['53.5511', '9.9937', 'Hamburg', 'Zuhause', 'DLH123', '3c6444', '53.551123', 'x.example', 'lat=', 'label=']) {
    assert.ok(raw.indexOf(bad) < 0, 'stored log contains ' + bad + ': ' + raw);
  }
  D.events().forEach((e) => assert.deepEqual(Object.keys(e).sort(), ['c', 'd', 'k', 'm', 't'], 'only the four fields plus time'));
  const exp = D.exportText();
  assert.ok(exp.indexOf('53.5511') < 0 && exp.indexOf('DLH123') < 0 && exp.indexOf('Hamburg') < 0, 'export is clean');
  assert.strictEqual(D.events()[0].k, 'boot');
  assert.strictEqual(D.events()[0].c, 'v-test');
  assert.strictEqual(D.events()[0].d, 5);
});

t('thrown error or rejection carrying a flight JSON snippet: only file, line and error name are stored', () => {
  const ctx = fresh(); const { D } = started(ctx, T);
  D.clear();
  const flight = '{"hex":"3c6444","callsign":"DLH123","lat":53.5511,"lon":9.9937,"alt_baro":38000,"r":"D-AIBB"}';
  const err = new TypeError('no route for ' + flight);
  ctx.__listeners.error.forEach((fn) => fn({ message: 'Uncaught ' + err.message, filename: 'https://x.example/js/main.js?lat=53.5511', lineno: 42, error: err }));
  const rej = { name: 'Error', message: flight };
  ctx.__listeners.unhandledrejection.forEach((fn) => fn({ reason: rej }));
  const anon = { message: flight };                     // no usable name: a fixed category
  ctx.__listeners.unhandledrejection.forEach((fn) => fn({ reason: anon }));
  const bad = { name: 'Bad Name ' + flight };           // a name that is not an identifier is not stored
  ctx.__listeners.unhandledrejection.forEach((fn) => fn({ reason: bad }));
  D._flush();
  const raw = ctx.__store.data['ma.diag'];
  for (const bad2 of ['DLH123', '3c6444', '53.5511', '9.9937', 'D-AIBB', 'alt_baro', 'no route', 'flight', 'x.example', '38000']) {
    assert.ok(raw.indexOf(bad2) < 0, 'storage contains ' + bad2 + ': ' + raw);
  }
  const errs = D.events().filter((e) => e.k === 'error');
  assert.ok(errs.some((e) => e.m === 'main.js:42 TypeError'), JSON.stringify(errs));
  assert.ok(errs.some((e) => e.m === 'Error' && e.c === 'promise'));
  assert.ok(errs.some((e) => e.m === 'Promise' && e.c === 'promise'));
  assert.ok(errs.every((e) => e.m.length <= 120));
});

t('the same error in a row is counted in d, not stored again', () => {
  const ctx = fresh(); const { D } = started(ctx, T);
  D.clear();
  for (let i = 0; i < 50; i++) ctx.__listeners.error.forEach((fn) => fn({ filename: '/js/radar.js', lineno: 7, error: new RangeError('x') }));
  const errs = D.events().filter((e) => e.k === 'error');
  assert.strictEqual(errs.length, 1);
  assert.strictEqual(errs[0].d, 50);
  assert.strictEqual(D.summary(T).errors, 50);
});

t('unknown kinds are dropped; a message is at most 120 characters', () => {
  const ctx = fresh(); const { D } = started(ctx, T);
  D.clear();
  ['constructor', 'toString', '__proto__', 'secret'].forEach((k) => D.log(k, 'x', 'y'));
  assert.strictEqual(D.events().length, 0);
  D.log('net', 'online', 'a'.repeat(300));
  assert.ok(D.events()[0].m.length <= 120);
});

t('stored data from an older version is cleaned on load (extra fields dropped)', () => {
  const ctx = fresh();
  ctx.__store.data['ma.diag'] = JSON.stringify([{ t: new Date(T).toISOString(), k: 'net', c: 'online', m: 'alt', d: null, lat: 53.5, lon: 9.9, label: 'Hamburg' }]);
  started(ctx, T);
  const ev = ctx.MA.diag.events();
  assert.strictEqual(ev.length, 1);
  assert.deepEqual(Object.keys(ev[0]).sort(), ['c', 'd', 'k', 'm', 't']);
});

t('scrub removes URLs, coordinates, callsign-like codes and parameter values', () => {
  const s = fresh().MA.diag._scrub;
  assert.strictEqual(s('https://api.adsb.lol/v2/point/53.5511/9.9937/25'), '[url]');
  assert.ok(s('Fehler bei 53.5511 Nord').indexOf('53.5511') < 0);
  assert.strictEqual(s('DLH123 steigt'), '# steigt');
  assert.strictEqual(s('HTTP 429'), 'HTTP 429');
});

t('embedded (setup preview) logs nothing', () => {
  const ctx = fresh({ embedded: true }); const { D } = started(ctx, T);
  D.log('net', 'online', 'x');
  D.status({ ok: true, lastOk: T, dataAt: T, failures: 0 }, T);
  assert.strictEqual(D.events().length, 0);
});

t('blocked storage: the log works in memory and never throws', () => {
  const ctx = fresh({ noStorage: true }); const { D } = started(ctx, T);
  D.clear();
  D.log('net', 'online', 'a');
  D.log('net', 'offline', 'b');
  D._flush();
  assert.strictEqual(D.events().length, 2);
  assert.strictEqual(ctx.__store.data['ma.diag'], undefined);
});

// ---------- scripted outage and the 24 h summary ----------
t('summary counts for a scripted outage', () => {
  const ctx = fresh(); const { D, setNow } = started(ctx, T);
  D.clear();
  const st = { ok: false, lastOk: 0, dataAt: 0, failures: 0, recover: 0, retryAfterMs: 0, nextAt: 0 };
  const at = (s, fn) => { setNow(T + s * 1000); fn(T + s * 1000); };
  at(0, (now) => { D.data(true, { name: 'adsb.lol', ms: 120 }); Object.assign(st, { ok: true, lastOk: now, dataAt: now, failures: 0 }); D.status(st, now); });
  at(5, (now) => { D.data(false, { name: 'adsb.lol', ms: 800, err: { status: 429, retryAfter: 30000 } }); st.failures = 1; D.status(st, now); });
  at(10, (now) => { D.data(false, { name: 'adsb.lol', ms: 700, err: { status: 429 } }); st.failures = 2; D.status(st, now); });
  at(20, (now) => { D.data(false, { name: 'adsb.lol', ms: 40, err: new TypeError('Failed to fetch') }); st.failures = 3; D.status(st, now); });
  at(25, () => D.log('net', 'offline', 'Netzwerk getrennt'));
  at(26, () => D.log('net', 'online', 'Netzwerk wieder verbunden'));
  at(30, (now) => { D.status(st, now); });                       // data 30 s old: stale
  at(40, (now) => { D.data(false, { name: 'adsb.lol', ms: 600, err: { status: 429 } }); st.failures = 4; D.status(st, now); });
  at(60, () => D.log('error', 'js', 'diag-test.js:1 Testfehler'));
  at(120, (now) => { D.status(st, now); });                      // 120 s old: offline
  at(150, (now) => { D.data(true, { name: 'adsb.lol', ms: 130 }); Object.assign(st, { ok: true, lastOk: now, dataAt: now, failures: 0 }); D.status(st, now); });
  const s = D.summary(T + 150 * 1000);
  assert.strictEqual(s.fails, 4, 'failed polls');
  assert.deepEqual(s.failsByStatus, { '429': 3, '0': 1 }, 'failures by status');
  assert.strictEqual(s.recoveries, 2, 'successes that ended a run (first one and the recovery)');
  assert.strictEqual(s.longestGapS, 150, 'longest gap without data');
  assert.strictEqual(s.toStale, 1);
  assert.strictEqual(s.toOffline, 1);
  assert.strictEqual(s.toOnline, 1, 'back online after offline');
  assert.strictEqual(s.netOffline, 1);
  assert.strictEqual(s.netOnline, 1);
  assert.strictEqual(s.errors, 1);
  assert.strictEqual(s.stalls, 0);
  const lines = D.lines(s).join('\n');
  assert.ok(lines.indexOf('längste Lücke ohne Daten: 2 min 30 s') >= 0, lines);
  assert.ok(lines.indexOf('HTTP 429: 3') >= 0 && lines.indexOf('ohne Antwort: 1') >= 0, lines);
});

t('summary ignores events outside the 24 h window and is a pure function', () => {
  const ev = [
    { t: new Date(T - 25 * H).toISOString(), k: 'data', c: 503, m: 'alt', d: 5 },
    { t: new Date(T - 1 * H).toISOString(), k: 'data', c: 429, m: 'neu', d: 5 },
    { t: new Date(T - 1 * H + 1).toISOString(), k: 'data', c: 'ok', m: 'wieder', d: 90000 },
    { t: new Date(T - 2 * H).toISOString(), k: 'status', c: 'offline', m: '', d: 200000 }
  ];
  const before = JSON.stringify(ev);
  const s = fresh().MA.diag.summarize(ev, T);
  assert.strictEqual(s.fails, 1);
  assert.deepEqual(s.failsByStatus, { '429': 1 });
  assert.strictEqual(s.recoveries, 1);
  assert.strictEqual(s.longestGapS, 200, 'offline age 200 s is larger than the 90 s recovery gap');
  assert.strictEqual(JSON.stringify(ev), before, 'input not modified');
});

t('stall: frame gap over 2 s is logged once per 10 s, gap in ms; hidden tab does not count', () => {
  const ctx = fresh(); const { D, setNow } = started(ctx, T);
  D.clear();
  setNow(T); D.frame(T);
  setNow(T + 2500); D.frame(T + 2500);
  setNow(T + 2600); D.frame(T + 2600);                 // within 10 s of the last entry: not logged again
  setNow(T + 20000); D.frame(T + 20000);
  const stalls = D.events().filter((e) => e.k === 'stall');
  assert.strictEqual(stalls.length, 2);
  assert.strictEqual(stalls[0].d, 2500);
  assert.strictEqual(D.summary(T + 20000).stalls, 2);
});

t('fallback source: fb when an answer comes from a fallback, pri on return; time on fallback is summarised', () => {
  const ctx = fresh(); const { D, setNow } = started(ctx, T);
  D.clear();
  const at = (s, fn) => { setNow(T + s * 1000); fn(T + s * 1000); };
  at(0, () => D.data(true, { name: 'adsb.lol', ms: 100, fallback: false }));            // primary: no event (first answer)
  at(10, () => D.data(true, { name: 'airplanes.live', ms: 100, fallback: true }));      // fb
  at(20, () => D.data(true, { name: 'airplanes.live', ms: 100, fallback: true }));      // same source: no new event
  at(50, () => D.data(true, { name: 'adsb.lol', ms: 100, fallback: false }));           // pri after 40 s
  at(60, () => D.data(true, { name: 'opensky', ms: 100, fallback: true }));             // fb again
  const ev = D.events().filter((e) => e.k === 'data' && (e.c === 'fb' || e.c === 'pri'));
  assert.deepEqual(ev.map((e) => e.c), ['fb', 'pri', 'fb'], 'codes: ' + ev.map((e) => e.c).join(','));
  assert.strictEqual(ev[0].m, 'airplanes.live · Ausweichquelle');
  const s = D.summary(T + 70 * 1000);
  assert.strictEqual(s.fallbacks, 2);
  assert.strictEqual(s.fallbackS, 40 + 10, 'first fallback 40 s, second still open for 10 s');
  assert.strictEqual(s.fails, 0, 'fallback entries are not failures');
  assert.strictEqual(s.recoveries, 1, 'only the first answer of the page load counts as a recovery');
  assert.ok(D.lines(s).join('\n').indexOf('Ausweichquelle: 2× · davon 50 s') >= 0, D.lines(s).join('\n'));
});

// ---------- app integration ----------
t('version matches sw.js', () => {
  const sw = fs.readFileSync(ROOT + '/sw.js', 'utf8');
  const m = /var VERSION = '([^']+)'/.exec(sw);
  assert.ok(m, 'sw.js VERSION found');
  assert.strictEqual(fresh().MA.diag.VERSION, m[1]);
  assert.ok(/js\/diag\.js/.test(sw), 'diag.js in the service worker shell list');
});

t('index.html loads js/diag.js before the feed; hooks are present and guarded', () => {
  const html = fs.readFileSync(ROOT + '/index.html', 'utf8');
  assert.ok(html.indexOf('js/diag.js') > 0 && html.indexOf('js/diag.js') < html.indexOf('js/data.js'));
  const data = fs.readFileSync(ROOT + '/js/data.js', 'utf8');
  const main = fs.readFileSync(ROOT + '/js/main.js', 'utf8');
  const pwa = fs.readFileSync(ROOT + '/js/pwa.js', 'utf8');
  assert.ok(/if \(MA\.diag\) MA\.diag\.data\(/.test(data));
  assert.ok(/fallback: self\.idx > 0/.test(data), 'answer source is passed to the log');
  assert.ok(/if \(MA\.diag\) MA\.diag\.status\(/.test(main) && /if \(MA\.diag\) MA\.diag\.frame\(/.test(main));
  assert.ok(/MA\.diag\.log\('wake'/.test(main));
  assert.ok(/MA\.diag\.log\('sw'/.test(pwa));
});

console.log(n + ' tests passed');
