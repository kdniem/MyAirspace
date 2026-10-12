/* CORS proxy for MyAirspace as a Vercel Function: /api/proxy?url=<target>.
   Only relays a few read-only JSON endpoints (host AND path allowlist below), only for the
   app's own origins (requests without an Origin header, e.g. a test link in the browser,
   are allowed). Responses are always re-labelled as JSON; anything else is rejected. */
const ALLOWED = {
  'api.adsb.lol': ['/v2/point/', '/api/0/route/'],
  'api.airplanes.live': ['/v2/point/'],
  'opensky-network.org': ['/api/states/all'],
  'aviationweather.gov': ['/api/data/metar']
};
const ALLOWED_ORIGINS = [
  /^https:\/\/kdniem\.github\.io$/,
  /^https:\/\/myairspace-nu\.vercel\.app$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/
];
const MAX_RADIUS_NM = 250;
const POINT_PATH = /^\/v2\/point\/(-?\d{1,3}(?:\.\d+)?)\/(-?\d{1,3}(?:\.\d+)?)\/(\d{1,5})$/;

// errors are never cacheable: the CDN must not store them (and a failed revalidation must not
// replace the last good answer that stale-while-revalidate / stale-if-error keep serving)
function fail(res, status, error, retryAfterSec) {
  res.setHeader('Cache-Control', 'no-store');
  if (retryAfterSec) res.setHeader('Retry-After', String(retryAfterSec));
  return res.status(status).json({ error });
}

// /v2/point/<lat>/<lon>/<nm>: round to 2 decimals (~1 km) and clamp the radius so that
// cache keys collapse; returns null when the path is malformed
function normalizePoint(pathname) {
  const m = POINT_PATH.exec(pathname);
  if (!m) return null;
  const lat = parseFloat(m[1]), lon = parseFloat(m[2]), nm = parseInt(m[3], 10);
  if (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180) || !(nm >= 1)) return null;
  return '/v2/point/' + lat.toFixed(2) + '/' + lon.toFixed(2) + '/' + Math.min(nm, MAX_RADIUS_NM);
}

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Vary', 'Origin');

  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.some(re => re.test(origin))) {
    return fail(res, 403, 'origin not allowed');
  }
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Retry-After');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return fail(res, 405, 'GET only');

  const raw = req.query && req.query.url;
  let url;
  try { url = new URL(typeof raw === 'string' ? raw : ''); } catch (e) { return fail(res, 400, 'missing ?url='); }
  const prefixes = Object.prototype.hasOwnProperty.call(ALLOWED, url.hostname) ? ALLOWED[url.hostname] : null;
  if (url.protocol !== 'https:' || !prefixes || url.port || url.username || url.password ||
      !prefixes.some(p => url.pathname.startsWith(p))) {
    return fail(res, 403, 'target not allowed');
  }
  if (url.pathname.startsWith('/v2/point/')) {
    const path = normalizePoint(url.pathname);
    if (!path) return fail(res, 400, 'bad point path');
    url.pathname = path;
    url.search = '';
  }

  try {
    const upstream = await fetch(url.toString(), {
      headers: { 'User-Agent': 'MyAirspace (+https://github.com/kdniem/MyAirspace)', Accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(8000)
    });
    if (upstream.status === 429) {
      // pass a plain seconds value of Retry-After on (bounded), so the app can back off accordingly
      const ra = upstream.headers && upstream.headers.get ? upstream.headers.get('retry-after') : null;
      const sec = typeof ra === 'string' && /^\d{1,6}$/.test(ra) ? Math.min(120, Math.max(1, parseInt(ra, 10))) : 0;
      return fail(res, 429, 'rate limited', sec);
    }
    if (!upstream.ok) return fail(res, 502, 'upstream error');   // includes 3xx (redirects are not followed)
    const text = await upstream.text();
    try { JSON.parse(text); } catch (e) { return fail(res, 502, 'bad upstream'); }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // A short CDN cache keeps several screens from multiplying upstream requests. Past s-maxage the CDN
    // still serves the last good answer while it revalidates (stale-while-revalidate), and for a while
    // longer if the revalidation fails, e.g. 429 from the shared Vercel address (stale-if-error). The
    // app reads the real age of the data from the server timestamps in the answer.
    // METAR changes at most every 30 min: 5 min fresh, stale up to 10 min, 1 h on errors.
    const metar = url.hostname === 'aviationweather.gov';
    res.setHeader('Cache-Control', 'public, s-maxage=' + (metar ? 300 : 3) +
      ', stale-while-revalidate=' + (metar ? 600 : 30) + ', stale-if-error=' + (metar ? 3600 : 120));
    return res.status(200).send(text);
  } catch (e) {
    return fail(res, 502, 'upstream error');
  }
}
