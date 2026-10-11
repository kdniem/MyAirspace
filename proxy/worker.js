/* CORS proxy for MyAirspace as a Cloudflare Worker (free plan is plenty).
   Only relays the flight-data APIs below, only for the app's own origin
   (requests without an Origin header, e.g. a test link typed into the
   browser, are allowed too). */
const ALLOWED_HOSTS = ['api.adsb.lol', 'api.airplanes.live', 'opensky-network.org'];
const ALLOWED_ORIGINS = [/^https:\/\/kdniem\.github\.io$/, /^http:\/\/localhost(:\d+)?$/];

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin');
    if (origin && !ALLOWED_ORIGINS.some(re => re.test(origin))) {
      return new Response('origin not allowed', { status: 403 });
    }
    const headers = cors(origin);
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (request.method !== 'GET') return new Response('GET only', { status: 405, headers });

    let url;
    try { url = new URL(new URL(request.url).searchParams.get('url')); } catch (e) {
      return new Response('missing ?url=', { status: 400, headers });
    }
    if (url.protocol !== 'https:' || !ALLOWED_HOSTS.includes(url.hostname)) {
      return new Response('host not allowed', { status: 403, headers });
    }

    // a short edge cache keeps several screens from multiplying upstream requests
    const upstream = await fetch(url.toString(), {
      headers: { 'User-Agent': 'MyAirspace (+https://github.com/kdniem/MyAirspace)' },
      cf: { cacheTtl: 3, cacheEverything: true }
    });
    const res = new Response(upstream.body, upstream);
    for (const k in headers) res.headers.set(k, headers[k]);
    return res;
  }
};
