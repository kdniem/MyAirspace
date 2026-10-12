/* Tests for api/proxy.js with mock req/res and a stubbed fetch. Run: node tools/tests/proxy-test.mjs */
import assert from 'node:assert/strict';
import handler from '../../api/proxy.js';

let calls = [];
let upstream = () => ({ status: 200, ct: 'application/json', body: '{"ac":[]}' });
let throwing = false;
globalThis.fetch = async (url, opts) => {
  calls.push({ url, opts });
  if (throwing) throw new Error('network');
  const u = upstream(url);
  return {
    status: u.status, ok: u.status >= 200 && u.status < 300,
    headers: { get: (k) => ({ 'content-type': u.ct, 'retry-after': u.retryAfter }[k.toLowerCase()] ?? null) },
    text: async () => u.body
  };
};

async function call(target, { origin, method = 'GET' } = {}) {
  const headers = {};
  if (origin) headers.origin = origin;
  const res = {
    code: 200, h: {}, body: undefined,
    setHeader(k, v) { this.h[k.toLowerCase()] = v; },
    status(c) { this.code = c; return this; },
    json(o) { this.h['content-type'] = 'application/json; charset=utf-8'; this.body = JSON.stringify(o); return this; },
    send(b) { this.body = b; return this; },
    end() { return this; }
  };
  await handler({ method, headers, query: { url: target } }, res);
  return res;
}
const ORIGIN = 'https://kdniem.github.io';
let n = 0;
async function t(name, fn) { calls = []; upstream = () => ({ status: 200, ct: 'application/json', body: '{"ac":[]}' }); await fn(); n++; console.log('ok  ' + name); }

await t('allowed path passes', async () => {
  const r = await call('https://api.adsb.lol/v2/point/53.55/9.99/20', { origin: ORIGIN });
  assert.equal(r.code, 200);
  assert.equal(r.body, '{"ac":[]}');
  assert.equal(r.h['access-control-allow-origin'], ORIGIN);
  assert.match(r.h['cache-control'], /^public, s-maxage=3, stale-while-revalidate=30, stale-if-error=120$/);
  assert.equal(r.h.vary, 'Origin');
});
await t('all allowlisted host/path pairs pass', async () => {
  for (const u of ['https://api.adsb.lol/api/0/route/DLH1/53.1/9.1', 'https://api.airplanes.live/v2/point/50/8/10',
    'https://opensky-network.org/api/states/all?lamin=1&lomin=2&lamax=3&lomax=4', 'https://aviationweather.gov/api/data/metar?ids=EDDH&format=json']) {
    assert.equal((await call(u, { origin: ORIGIN })).code, 200, u);
  }
});
await t('wrong path -> 403', async () => {
  for (const u of ['https://api.adsb.lol/v2/hex/abc', 'https://api.airplanes.live/api/0/route/x', 'https://opensky-network.org/api/flights/all',
    'https://api.adsb.lol/v2/point/../../admin', 'https://aviationweather.gov/']) {
    assert.equal((await call(u, { origin: ORIGIN })).code, 403, u);
  }
  assert.equal(calls.length, 0);
});
await t('other host / scheme -> 403', async () => {
  assert.equal((await call('https://evil.example/v2/point/1/2/3', { origin: ORIGIN })).code, 403);
  assert.equal((await call('https://api.adsb.lol.evil.example/v2/point/1/2/3', { origin: ORIGIN })).code, 403);
  assert.equal((await call('http://api.adsb.lol/v2/point/1/2/3', { origin: ORIGIN })).code, 403);
  assert.equal(calls.length, 0);
});
await t('userinfo and port rejected', async () => {
  assert.equal((await call('https://user:pw@api.adsb.lol/v2/point/1/2/3', { origin: ORIGIN })).code, 403);
  assert.equal((await call('https://user@api.adsb.lol/v2/point/1/2/3', { origin: ORIGIN })).code, 403);
  assert.equal((await call('https://api.adsb.lol:8443/v2/point/1/2/3', { origin: ORIGIN })).code, 403);
  assert.equal(calls.length, 0);
});
await t('origins', async () => {
  const u = 'https://api.adsb.lol/v2/point/1/2/3';
  assert.equal((await call(u, { origin: 'https://evil.example' })).code, 403);
  assert.equal((await call(u, { origin: 'https://evil.vercel.app' })).code, 403);
  assert.equal((await call(u, { origin: 'https://kdniem.github.io.evil.example' })).code, 403);
  for (const o of ['https://myairspace-nu.vercel.app', 'http://localhost', 'http://localhost:8000', 'http://127.0.0.1:5173']) {
    assert.equal((await call(u, { origin: o })).code, 200, o);
  }
  assert.equal((await call(u)).code, 200);
  const bad = await call(u, { origin: 'https://evil.example' });
  assert.ok(!/html/.test(bad.h['content-type']));
});
await t('redirect handled as 502 and not followed', async () => {
  upstream = () => ({ status: 302, ct: 'text/html', body: '<a>moved</a>' });
  const r = await call('https://api.adsb.lol/v2/point/1/2/3', { origin: ORIGIN });
  assert.equal(r.code, 502);
  assert.equal(calls[0].opts.redirect, 'manual');
  assert.ok(!r.body.includes('moved'));
});
await t('non-JSON upstream -> 502 bad upstream', async () => {
  upstream = () => ({ status: 200, ct: 'text/html', body: '<html>hi</html>' });
  const r = await call('https://api.adsb.lol/v2/point/1/2/3', { origin: ORIGIN });
  assert.equal(r.code, 502);
  assert.equal(r.body, '{"error":"bad upstream"}');
});
await t('upstream 429 -> 429, other errors generic', async () => {
  upstream = () => ({ status: 429, ct: 'text/html', body: 'secret upstream page' });
  let r = await call('https://api.adsb.lol/v2/point/1/2/3', { origin: ORIGIN });
  assert.equal(r.code, 429);
  assert.ok(!r.body.includes('secret'));
  assert.equal(r.h['retry-after'], undefined);
  upstream = () => ({ status: 429, ct: 'text/html', body: 'x', retryAfter: '17' });
  r = await call('https://api.adsb.lol/v2/point/1/2/3', { origin: ORIGIN });
  assert.equal(r.code, 429);
  assert.equal(r.h['retry-after'], '17');
  for (const bad of ['Wed, 21 Oct 2026 07:28:00 GMT', '-5', '1e9', '']) {   // only plain seconds are passed on
    upstream = () => ({ status: 429, ct: 'text/html', body: 'x', retryAfter: bad });
    assert.equal((await call('https://api.adsb.lol/v2/point/1/2/3', { origin: ORIGIN })).h['retry-after'], undefined, bad);
  }
  upstream = () => ({ status: 429, ct: 'text/html', body: 'x', retryAfter: '99999' });
  assert.equal((await call('https://api.adsb.lol/v2/point/1/2/3', { origin: ORIGIN })).h['retry-after'], '120');
  upstream = () => ({ status: 500, ct: 'application/json', body: '{"upstream":"detail"}' });
  r = await call('https://api.adsb.lol/v2/point/1/2/3', { origin: ORIGIN });
  assert.equal(r.code, 502);
  assert.ok(!r.body.includes('detail'));
});
await t('errors are never cacheable', async () => {
  const statuses = [429, 500, 503, 302, 404];
  for (const st of statuses) {
    upstream = () => ({ status: st, ct: 'application/json', body: '{"ac":[]}' });
    const r = await call('https://api.adsb.lol/v2/point/1/2/3', { origin: ORIGIN });
    assert.equal(r.h['cache-control'], 'no-store', 'status ' + st);
  }
  upstream = () => ({ status: 200, ct: 'text/html', body: 'not json' });
  assert.equal((await call('https://api.adsb.lol/v2/point/1/2/3', { origin: ORIGIN })).h['cache-control'], 'no-store');
  assert.equal((await call('https://evil.example/x', { origin: ORIGIN })).h['cache-control'], 'no-store');
  assert.equal((await call('https://api.adsb.lol/v2/point/1/2/3', { origin: 'https://evil.example' })).h['cache-control'], 'no-store');
  throwing = true;
  try { assert.equal((await call('https://api.adsb.lol/v2/point/1/2/3', { origin: ORIGIN })).h['cache-control'], 'no-store'); }
  finally { throwing = false; }
});
await t('CORS exposes Retry-After; METAR cache is longer', async () => {
  const r = await call('https://aviationweather.gov/api/data/metar?ids=EDDH', { origin: ORIGIN });
  assert.equal(r.h['access-control-expose-headers'], 'Retry-After');
  assert.equal(r.h['cache-control'], 'public, s-maxage=300, stale-while-revalidate=600, stale-if-error=3600');
});
await t('content-type forced JSON and hardening headers', async () => {
  upstream = () => ({ status: 200, ct: 'text/html', body: '{"a":1}' });
  const r = await call('https://aviationweather.gov/api/data/metar?ids=EDDH', { origin: ORIGIN });
  assert.equal(r.code, 200);
  assert.equal(r.h['content-type'], 'application/json; charset=utf-8');
  assert.equal(r.h['x-content-type-options'], 'nosniff');
  assert.equal(r.h['content-security-policy'], "default-src 'none'; sandbox");
  assert.equal(r.h['referrer-policy'], 'no-referrer');
  assert.match(r.h['cache-control'], /s-maxage=300/);
});
await t('lat/lon rounded and radius clamped', async () => {
  await call('https://api.adsb.lol/v2/point/53.551187/9.993682/20', { origin: ORIGIN });
  assert.equal(calls[0].url, 'https://api.adsb.lol/v2/point/53.55/9.99/20');
  await call('https://api.airplanes.live/v2/point/-33.9999/151.2/9999?x=1', { origin: ORIGIN });
  assert.equal(calls[1].url, 'https://api.airplanes.live/v2/point/-34.00/151.20/250');
  assert.equal((await call('https://api.adsb.lol/v2/point/abc/1/2', { origin: ORIGIN })).code, 400);
});
await t('method handling', async () => {
  assert.equal((await call('https://api.adsb.lol/v2/point/1/2/3', { origin: ORIGIN, method: 'POST' })).code, 405);
  assert.equal((await call('https://api.adsb.lol/v2/point/1/2/3', { origin: ORIGIN, method: 'OPTIONS' })).code, 204);
  assert.equal((await call(undefined, { origin: ORIGIN })).code, 400);
});

/* ---- /api/radar (api/radar.js): one fixed DWD file, no client parameters ---- */
const { default: radarHandler } = await import('../../api/radar.js');
const fs = await import('node:fs');
const path = await import('node:path');
const { fileURLToPath } = await import('node:url');
const FIXTURE = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/wn-small-000.h5'));
function tarOf(name, data) {
  const h = Buffer.alloc(512, 0);
  h.write(name, 0, 'latin1');
  h.write(data.length.toString(8).padStart(11, '0') + '\0', 124, 'latin1');
  h.write('0', 156, 'latin1');
  return Buffer.concat([h, data, Buffer.alloc((512 - (data.length % 512)) % 512, 0), Buffer.alloc(1024, 0)]);
}
let radarTar = tarOf('composite_wn_20261012_1650_000-hd5', FIXTURE);
// the observation time of the fixture is 2026-10-12, so answers are stale by now: the handler refuses them
let radarFetch = null;
const realFetch = globalThis.fetch;
function stubRadar(status, body, headers = {}) {
  globalThis.fetch = async (url, opts) => {
    radarFetch = { url, opts };
    return {
      status, ok: status >= 200 && status < 300,
      headers: { get: (k) => headers[k.toLowerCase()] ?? null },
      body: new Response(body).body      // a stream, as the real fetch returns it
    };
  };
}
// a chunked upstream of `total` bytes without Content-Length, read by the handler through its stream
function stubStream(total, chunk = 1024 * 1024) {
  let sent = 0;
  globalThis.fetch = async (url, opts) => {
    radarFetch = { url, opts };
    return {
      status: 200, ok: true, headers: { get: () => null },
      body: new ReadableStream({
        pull(c) {
          if (sent >= total) { c.close(); return; }
          const n = Math.min(chunk, total - sent);
          sent += n;
          c.enqueue(new Uint8Array(n));
        }
      })
    };
  };
  return () => sent;
}
async function callRadar(url, { origin, method = 'GET' } = {}) {
  const headers = {};
  if (origin) headers.origin = origin;
  const res = {
    code: 200, h: {}, body: undefined,
    setHeader(k, v) { this.h[k.toLowerCase()] = v; },
    status(c) { this.code = c; return this; },
    json(o) { this.h['content-type'] = 'application/json; charset=utf-8'; this.body = JSON.stringify(o); return this; },
    send(b) { this.body = b; return this; },
    end() { return this; }
  };
  await radarHandler({ method, headers, query: url === undefined ? {} : url }, res);
  return res;
}
// the clock is pinned: the fixture's observation time is 2026-10-12T16:50:03Z
const FIXTURE_OBS = Date.parse('2026-10-12T16:50:03Z');
function pinClock(ms) { const real = Date.now; Date.now = () => ms; return () => { Date.now = real; }; }
await t('radar: fixed upstream URL, query ignored, origin rule and method rule', async () => {
  const unpin = pinClock(FIXTURE_OBS + 60 * 1000);
  try {
    stubRadar(200, radarTar);
    const r = await callRadar({ lat: '53.5', url: 'https://evil.example/x' }, { origin: ORIGIN });
    assert.equal(radarFetch.url, 'https://opendata.dwd.de/weather/radar/composite/wn/composite_wn__LATEST.tar');
    assert.equal(r.code, 200);
    assert.equal((await callRadar({}, { origin: 'https://evil.example' })).code, 403);
    assert.equal((await callRadar({}, { origin: ORIGIN, method: 'POST' })).code, 405);
    assert.equal((await callRadar({}, { origin: ORIGIN, method: 'OPTIONS' })).code, 204);
  } finally { unpin(); globalThis.fetch = realFetch; }
});
await t('radar: an observation older than 15 minutes is refused', async () => {
  const unpin = pinClock(FIXTURE_OBS + 16 * 60 * 1000);
  try {
    stubRadar(200, radarTar);
    const r = await callRadar({}, { origin: ORIGIN });
    assert.equal(r.code, 502);
    assert.equal(r.h['cache-control'], 'no-store');
  } finally { unpin(); globalThis.fetch = realFetch; }
});
await t('radar: upstream errors, redirects and oversize bodies are not cached', async () => {
  stubRadar(302, radarTar, { location: 'https://evil.example/' });
  assert.equal((await callRadar({}, { origin: ORIGIN })).code, 502);
  stubRadar(200, Buffer.from('not a tar at all, just text that is long enough to be read'));
  assert.equal((await callRadar({}, { origin: ORIGIN })).h['cache-control'], 'no-store');
  stubRadar(200, radarTar, { 'content-length': String(9 * 1024 * 1024) });
  assert.equal((await callRadar({}, { origin: ORIGIN })).code, 502);
  globalThis.fetch = async () => { throw new Error('network'); };
  assert.equal((await callRadar({}, { origin: ORIGIN })).code, 502);
  globalThis.fetch = realFetch;
});
await t('radar: a chunked body without Content-Length is cut off at the byte cap', async () => {
  const read = stubStream(9 * 1024 * 1024);     // 9 MB, no length header
  const r = await callRadar({}, { origin: ORIGIN });
  assert.equal(r.code, 502);
  assert.equal(r.h['cache-control'], 'no-store');
  // the stream reads ahead by a chunk or two; the handler stops at the cap, far short of the 9 MB body
  assert.ok(read() < 8 * 1024 * 1024, 'read stopped near the 4 MB cap, read ' + read());
  globalThis.fetch = realFetch;
});
await t('radar: a fresh observation is answered with the grid and a short CDN cache', async () => {
  // rewrite the frame's time to "now" in the fixture: one byte pair edit is not possible for HDF5, so the
  // staleness limit is checked through the clock instead
  const realNow = Date.now;
  const fixtureObs = Date.parse('2026-10-12T16:50:03Z');
  Date.now = () => fixtureObs + 60 * 1000;
  try {
    stubRadar(200, radarTar);
    const r = await callRadar({}, { origin: ORIGIN });
    assert.equal(r.code, 200);
    assert.equal(r.h['access-control-allow-origin'], ORIGIN);
    assert.equal(r.h['cache-control'], 'public, s-maxage=120, stale-while-revalidate=300, stale-if-error=900');
    assert.equal(r.h['content-type'], 'application/json; charset=utf-8');
    const j = JSON.parse(r.body);
    assert.equal(j.obs, '2026-10-12T16:50:03Z');
    assert.equal(j.grid.rows, 520);
    assert.equal(j.grid.cols, 580);
  } finally {
    Date.now = realNow;
    globalThis.fetch = realFetch;
  }
});
console.log(n + ' tests passed');
