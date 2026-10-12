/* Weather radar overlay data as a Vercel Function: GET /api/radar.
   The server fetches ONE fixed open-data file from Deutscher Wetterdienst (DWD, opendata.dwd.de,
   composite WN, newest observed frame), decodes it (lib/dwd-radar.js) and answers with a compact
   lat/lon grid of reflectivity levels. The request carries no parameters: the viewer's position and
   the browser's query never leave the device, and every viewer gets the same cached answer.
   Unlike api/proxy.js this function relays nothing: the upstream URL is a constant, not a parameter. */
import { radarFromTar } from '../lib/dwd-radar.js';

const SOURCE = 'https://opendata.dwd.de/weather/radar/composite/wn/composite_wn__LATEST.tar';
const ALLOWED_ORIGINS = [
  /^https:\/\/kdniem\.github\.io$/,
  /^https:\/\/myairspace-nu\.vercel\.app$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/
];
const MAX_BYTES = 4 * 1024 * 1024;     // the newest archive is about 0.75 MB
const MAX_AGE_S = 15 * 60;             // older observations are refused (the client hides them too)

function fail(res, status, error) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ error });
}

// Streamed read with a byte counter: a chunked response without Content-Length cannot grow past MAX_BYTES
async function readLimited(resp) {
  const len = Number(resp.headers && resp.headers.get ? resp.headers.get('content-length') : 0);
  if (len > MAX_BYTES) throw new Error('too large');
  if (!resp.body || typeof resp.body.getReader !== 'function') throw new Error('no body');
  const reader = resp.body.getReader();
  const parts = [];
  let total = 0;
  for (;;) {
    const step = await reader.read();
    if (step.done) break;
    total += step.value.length;
    if (total > MAX_BYTES) {
      try { await reader.cancel(); } catch (e) { /* the upstream may already be closed */ }
      throw new Error('too large');
    }
    parts.push(Buffer.from(step.value));
  }
  return Buffer.concat(parts, total);
}

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Vary', 'Origin');

  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.some(re => re.test(origin))) return fail(res, 403, 'origin not allowed');
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return fail(res, 405, 'GET only');

  try {
    const upstream = await fetch(SOURCE, {
      headers: { 'User-Agent': 'MyAirspace (+https://github.com/kdniem/MyAirspace)' },
      redirect: 'manual',
      signal: AbortSignal.timeout(15000)
    });
    if (!upstream.ok) return fail(res, 502, 'upstream error');   // includes redirects (not followed)
    const body = await readLimited(upstream);
    const out = radarFromTar(body, Date.now());
    const ageS = (Date.now() - Date.parse(out.obs)) / 1000;
    if (!(ageS < MAX_AGE_S)) return fail(res, 502, 'stale upstream');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // a new frame every 5 minutes: fresh for 2 min on the CDN, the last good answer for 5 min more while
    // it revalidates, and 15 min if the upstream fails (the client shows the observation time)
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300, stale-if-error=900');
    return res.status(200).send(JSON.stringify(out));
  } catch (e) {
    return fail(res, 502, 'upstream error');
  }
}
