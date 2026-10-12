/* Configuration from URL parameters. Nothing personal is stored in the code:
   put your home coordinates into the URL, e.g. ?lat=53.5511&lon=9.9937&r=20 */
var MA = window.MA || {};
window.MA = MA;

(function () {
  var q = new URLSearchParams(location.search);

  function num(name, def, min, max) {
    var v = parseFloat(q.get(name));
    if (isNaN(v)) return def;
    return Math.min(max, Math.max(min, v));
  }
  function str(name, def) {
    var v = q.get(name);
    return v === null || v === '' ? def : v;
  }
  function bool(name, def) {
    var v = q.get(name);
    if (v === null) return def;
    return !(v === '0' || v === 'false' || v === 'off' || v === 'no');
  }

  // "23-6" -> {from: 23, to: 6}; "off" -> null
  function hours(name, def) {
    var v = str(name, def);
    var m = /^(\d{1,2})-(\d{1,2})$/.exec(v);
    return m ? { from: +m[1], to: +m[2] } : null;
  }

  // Own proxy (api/proxy.js on Vercel), DEFAULT_PROXY and the validation rule are in js/pwa.js.
  // ?proxy=off: no proxy, direct requests only (fails for most APIs because of CORS).
  // Any ?proxy= value that is not the default, 'off' or the own project's URL is ignored.
  var DEFAULT_PROXY = MA.DEFAULT_PROXY;
  function proxy() {
    var v = str('proxy', DEFAULT_PROXY);
    if (!MA.proxyOk(v)) v = DEFAULT_PROXY;
    return v === 'off' ? '' : v;
  }

  MA.config = {
    lat: num('lat', 53.5511, -90, 90),          // default: Hamburg city centre
    lon: num('lon', 9.9937, -180, 180),
    radiusKm: num('r', 25, 3, 200),             // radius of the main ring
    pollSec: num('poll', 5, 2, 120),
    label: str('label', 'Hamburg').toUpperCase(),
    units: str('units', 'ft') === 'm' ? 'm' : 'ft',
    provider: str('provider', 'auto'),          // auto | adsblol | airplaneslive | opensky
    proxy: proxy(),                             // own CORS proxy, see api/proxy.js
    public: q.get('public') === '1',            // opt-in: public CORS proxies and the other providers
    demo: bool('demo', false),
    rotateSec: num('rotate', 9, 3, 120),        // LED board rotation
    trailMin: num('trail', 4, 0, 30),           // trail length in minutes
    night: hours('night', '23-6'),              // dim the screen at night
    nightLevel: num('dim', 0.45, 0.1, 1),
    labels: bool('labels', true),               // aircraft labels on the map
    places: bool('places', true),               // town names on the map
    view: /^(radar|board|auto)$/.test(str('view', '')) ? str('view', '') : 'auto', // radar | board | auto
    boardSec: num('boardsec', 40, 5, 600),      // auto: seconds on the Anzeigetafel
    radarSec: num('radarsec', 240, 10, 3600),   // auto: seconds on the radar
    theme: /^(dark|light|auto)$/.test(str('theme', '')) ? str('theme', '') : 'dark' // auto: light from sunrise to sunset
  };
})();
