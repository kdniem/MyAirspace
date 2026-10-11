/* Configuration from URL parameters. Nothing personal is stored in the code:
   put your home coordinates into the URL, e.g. ?lat=53.66&lon=10.05&r=20 */
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

  MA.config = {
    lat: num('lat', 53.5511, -90, 90),          // default: Hamburg city centre
    lon: num('lon', 9.9937, -180, 180),
    radiusKm: num('r', 25, 3, 200),             // radius of the main ring
    pollSec: num('poll', 5, 2, 120),
    label: str('label', 'Hamburg').toUpperCase(),
    units: str('units', 'ft') === 'm' ? 'm' : 'ft',
    provider: str('provider', 'auto'),          // auto | adsblol | airplaneslive | opensky
    proxy: /^https:\/\//.test(str('proxy', '')) ? str('proxy', '') : '', // own CORS proxy, see proxy/worker.js
    demo: bool('demo', false),
    rotateSec: num('rotate', 9, 3, 120),        // LED board rotation
    trailMin: num('trail', 4, 0, 30),           // trail length in minutes
    night: hours('night', '23-6'),              // dim the screen at night
    nightLevel: num('dim', 0.45, 0.1, 1),
    labels: bool('labels', true),               // aircraft labels on the map
    places: bool('places', true)                // town names on the map
  };
})();
