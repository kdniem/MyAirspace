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
  // setup.html does not load pwa.js (it would restore saved settings), so fall back to a plain rule
  var DEFAULT_PROXY = MA.DEFAULT_PROXY || 'https://myairspace-nu.vercel.app/api/proxy';
  var proxyOk = MA.proxyOk || function (v) { return v === DEFAULT_PROXY || v === 'off'; };
  function proxy() {
    var v = str('proxy', DEFAULT_PROXY);
    if (!proxyOk(v)) v = DEFAULT_PROXY;
    return v === 'off' ? '' : v;
  }

  /* ---- looks and options (js/styles.js holds the style table) ---- */
  var STY = MA.STYLES || { atc: {} };
  function pick(name, re, def) {
    var v = (q.get(name) || '').toLowerCase();
    return re.test(v) ? v : def;
  }
  var style = (q.get('style') || '').toLowerCase();
  if (!STY.hasOwnProperty(style)) style = 'atc';
  var accent = (q.get('accent') || '').toLowerCase().replace('#', '');
  if (!(MA.ACCENTS && MA.ACCENTS.hasOwnProperty(accent)) && !/^([0-9a-f]{3}|[0-9a-f]{6})$/.test(accent)) accent = '';
  else if (/^[0-9a-f]{3,6}$/.test(accent) && !(MA.ACCENTS && MA.ACCENTS.hasOwnProperty(accent))) accent = '#' + accent;

  // element toggles: show=a,b (only these) / hide=a,b / single flags (rings=0 …); datablock is the old "labels"
  var KEYS = ['weather', 'labels', 'trails', 'rings', 'places', 'board', 'clock', 'ground', 'compass'];
  var ALIAS = { datablock: 'labels', datablocks: 'labels', label: 'labels', trail: 'trails', wx: 'weather', ring: 'rings', place: 'places' };
  function list(name) {
    return (q.get(name) || '').toLowerCase().split(',').map(function (x) { return ALIAS[x.trim()] || x.trim(); });
  }
  var show = {};
  KEYS.forEach(function (k) { show[k] = true; });
  if (q.has('show')) {
    var only = list('show');
    KEYS.forEach(function (k) { show[k] = only.indexOf(k) >= 0; });
  }
  list('hide').forEach(function (k) { if (show.hasOwnProperty(k)) show[k] = false; });
  KEYS.forEach(function (k) { if (q.has(k)) show[k] = bool(k, show[k]); });
  if (q.has('wx')) show.weather = bool('wx', show.weather);

  // datablock=callsign,fl,gs,type: fields and their order; datablock=0 switches the labels off
  var FIELDS = ['callsign', 'fl', 'gs', 'type', 'route', 'reg'];
  var FALIAS = { alt: 'fl', speed: 'gs', flight: 'callsign', cs: 'callsign', typ: 'type' };
  var fields = ['callsign', 'fl', 'gs', 'type'];
  var db = (q.get('datablock') || '').toLowerCase();
  if (db === '0' || db === 'off' || db === 'false' || db === 'no') show.labels = false;
  else if (db && db !== '1' && db !== 'on' && db !== 'true' && db !== 'yes') {
    var f = [];
    db.split(',').forEach(function (x) {
      x = FALIAS[x.trim()] || x.trim();
      if (FIELDS.indexOf(x) >= 0 && f.indexOf(x) < 0) f.push(x);
    });
    if (f.length) fields = f.slice(0, 5);
  }

  MA.config = {
    lat: num('lat', 53.5511, -90, 90),          // default: Hamburg city centre
    lon: num('lon', 9.9937, -180, 180),
    radiusKm: num('r', 25, 3, 200),             // radius of the main ring
    pollSec: num('poll', 5, 2, 120),
    label: str('label', 'Hamburg').slice(0, 32).toUpperCase(),
    units: str('units', 'ft') === 'm' ? 'm' : 'ft',
    provider: str('provider', 'auto'),          // auto | adsblol | airplaneslive | opensky
    proxy: proxy(),                             // own CORS proxy, see api/proxy.js
    public: q.get('public') === '1',            // opt-in: public CORS proxies and the other providers
    // no location in the address = the empty state: simulated traffic behind the welcome overlay (js/hint.js)
    demo: bool('demo', !(q.has('lat') && q.has('lon'))),
    rotateSec: num('rotate', 9, 3, 120),        // LED board rotation
    trailMin: show.trails ? num('trail', 4, 0, 30) : 0, // trail length in minutes
    night: hours('night', '23-6'),              // dim the screen at night
    nightLevel: num('dim', 0.45, 0.1, 1),
    labels: show.labels,                        // aircraft data blocks on the map
    places: show.places,                        // town names on the map
    title: str('title', '').slice(0, 32),       // optional second line under the place name
    style: style,                               // atc | terminal | chart | airbus | boeing | night | military
    accent: accent,                             // '' (style default) | preset name | '#rrggbb'
    font: pick('font', /^(mono|sans)$/, STY[style].font || 'mono'),
    show: show,                                 // element toggles
    fields: fields,                             // data block fields in order
    speedUnit: pick('speed', /^(kt|kmh)$/, 'kt'),
    pressure: pick('pressure', /^(hpa|inhg)$/, 'hpa'),
    timeMode: pick('time', /^(utc|local|both)$/, 'both'),
    brightness: num('brightness', 1, 0.5, 1.2),
    orient: 'north',                            // track-up is not built: north-up only
    view: /^(radar|board|auto)$/.test(str('view', '')) ? str('view', '') : 'auto', // radar | board | auto
    boardSec: num('boardsec', 40, 5, 600),      // auto: seconds on the Anzeigetafel
    radarSec: num('radarsec', 240, 10, 3600),   // auto: seconds on the radar
    theme: /^(dark|light|auto)$/.test(str('theme', '')) ? str('theme', '') : (STY[style].theme || 'dark') // auto: light from sunrise to sunset
  };
})();
