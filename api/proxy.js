/* CORS proxy for MyAirspace as a Vercel Function: /api/proxy?url=<target>.
   Only relays the flight-data and METAR APIs below, only for the app's own origins
   (requests without an Origin header, e.g. a test link in the browser, are allowed). */
const ALLOWED_HOSTS = ['api.adsb.lol', 'api.airplanes.live', 'opensky-network.org', 'aviationweather.gov'];
const ALLOWED_ORIGINS = [
  /^https:\/\/kdniem\.github\.io$/,
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/,
  /^http:\/\/localhost(:\d+)?$/
];

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.some(re => re.test(origin))) {
    return res.status(403).send('origin not allowed');
  }
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).send('GET only');

  let url;
  try { url = new URL(req.query.url); } catch (e) { return res.status(400).send('missing ?url='); }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.includes(url.hostname)) {
    return res.status(403).send('host not allowed');
  }

  try {
    const upstream = await fetch(url.toString(), {
      headers: { 'User-Agent': 'MyAirspace (+https://github.com/kdniem/MyAirspace)' },
      signal: AbortSignal.timeout(8000)
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    // a short CDN cache keeps several screens from multiplying upstream requests
    // (METAR changes at most every 30 min: cache it for 5 min)
    const maxAge = url.hostname === 'aviationweather.gov' ? 300 : 3;
    // stale-while-revalidate: if the upstream throttles us (429 from the shared Vercel address),
    // clients still get the last good answer; the app reads the real age from the server timestamps
    res.setHeader('Cache-Control', upstream.ok ? 'public, s-maxage=' + maxAge + ', stale-while-revalidate=' + (maxAge === 3 ? 20 : 600) : 'no-store');
    return res.status(upstream.status).send(body);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).send('upstream error');
  }
}
