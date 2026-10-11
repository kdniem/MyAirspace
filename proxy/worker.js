/* Optional CORS proxy for MyAirspace as a Cloudflare Worker (free plan is plenty).
   Deploy, then open the app with ?proxy=https://<name>.<account>.workers.dev
   Only the flight-data APIs below are relayed. */
const ALLOWED = ['api.adsb.lol', 'api.airplanes.live', 'opensky-network.org'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const target = new URL(request.url).searchParams.get('url');
    let url;
    try { url = new URL(target); } catch (e) { return new Response('missing ?url=', { status: 400, headers: CORS }); }
    if (url.protocol !== 'https:' || !ALLOWED.includes(url.hostname)) {
      return new Response('host not allowed', { status: 403, headers: CORS });
    }

    const init = { method: request.method, headers: { 'User-Agent': 'MyAirspace (+github.com/kdniem/MyAirspace)' } };
    if (request.method === 'POST') {
      init.headers['Content-Type'] = 'application/json';
      init.body = await request.text();
    }
    const upstream = await fetch(url.toString(), init);
    const res = new Response(upstream.body, upstream);
    for (const k in CORS) res.headers.set(k, CORS[k]);
    res.headers.set('Cache-Control', 'no-store');
    return res;
  }
};
