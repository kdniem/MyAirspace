/* Configuration from URL parameters. Nothing personal is stored in the code:
   put your home coordinates into the URL, e.g. ?lat=53.5511&lon=9.9937&r=20 */
var MA = window.MA || {};
window.MA = MA;

(function () {
  var q = new URLSearchParams(location.search);
  // saved settings from the overlay (js/prefs.js; empty without it, e.g. in setup.html): the address always wins
  var S = (MA.prefs && MA.prefs.stored) || {};

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

  // airport=: three letters, upper-cased; anything else is HAM. js/airport.js checks it against MA.features.airports.
  function airportCode(v) {
    var up = String(v || '').toUpperCase();
    return /^[A-Z]{3}$/.test(up) ? up : 'HAM';
  }

  // views=radar,board,airport: the rotation order (duplicates weight a view); invalid entries are dropped silently
  var VIEW_NAMES = ['radar', 'board', 'airport'];
  function viewList(name) {
    var out = [];
    String(q.get(name) || '').toLowerCase().split(',').forEach(function (x) {
      x = x.trim();
      if (VIEW_NAMES.indexOf(x) >= 0) out.push(x);
    });
    return out;
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
  var style = (q.get('style') || S.style || '').toLowerCase();
  if (!STY.hasOwnProperty(style)) style = 'atc';
  var accent = (q.get('accent') || '').toLowerCase().replace('#', '');
  if (!(MA.ACCENTS && MA.ACCENTS.hasOwnProperty(accent)) && !/^([0-9a-f]{3}|[0-9a-f]{6})$/.test(accent)) accent = '';
  else if (/^[0-9a-f]{3,6}$/.test(accent) && !(MA.ACCENTS && MA.ACCENTS.hasOwnProperty(accent))) accent = '#' + accent;

  // element toggles: show=a,b (only these) / hide=a,b / single flags (rings=0 …); datablock is the old "labels"
  var KEYS = ['weather', 'labels', 'trails', 'rings', 'places', 'board', 'clock', 'ground', 'compass', 'logos'];
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
  // wx=radar is the weather radar overlay (below), not the weather box: only other values toggle the box
  if (q.has('wx') && !/^radar$/i.test(q.get('wx'))) show.weather = bool('wx', show.weather);
  // saved toggles (overlay Ebenen): only for the elements the address does not mention
  var P = MA.prefs || { mentions: function () { return false; } };
  ['labels', 'trails', 'places', 'weather'].forEach(function (k) {
    if (typeof S[k] === 'boolean' && !P.mentions(location.search, k)) show[k] = S[k];
  });

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

  // motion=off|calm|full (js/motion.js): calm by default, off when the system asks for reduced motion
  var reducedMotion = false;
  try { reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { reducedMotion = false; }
  var motionArg = (q.get('motion') || '').toLowerCase();
  var motion = /^(off|calm|full)$/.test(motionArg) ? motionArg : (reducedMotion ? 'off' : 'calm');
  var view = /^(radar|board|auto|airport)$/.test(str('view', '')) ? str('view', '') : (S.view || 'auto');
  var THEME = /^(dark|light|auto)$/.test(str('theme', '')) ? str('theme', '') : (S.theme || (STY[style].theme || 'dark'));

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
    demo: bool('demo', !(q.has('lat') && q.has('lon')) && view !== 'airport'),   // the focus view needs no home location
    rotateSec: num('rotate', 20, 3, 120),       // seconds per aircraft on the board
    trailMin: show.trails ? num('trail', 4, 0, 30) : 0, // trail length in minutes
    night: hours('night', '23-6'),              // dim the screen at night
    nightLevel: num('dim', 0.45, 0.1, 1),
    labels: show.labels,                        // aircraft data blocks on the map
    places: show.places,                        // town names on the map
    title: str('title', '').slice(0, 32),       // optional second line under the place name
    style: style,                               // atc | terminal | chart | airbus | boeing | night | military
    chartbg: bool('chartbg', S.chartbg === true),            // aeronautical-chart background: airspaces, navaids, grid (js/chart.js), off by default
    accent: accent,                             // '' (style default) | preset name | '#rrggbb'
    font: pick('font', /^(mono|sans)$/, STY[style].font || 'mono'),
    show: show,                                 // element toggles
    fields: fields,                             // data block fields in order
    speedUnit: pick('speed', /^(kt|kmh)$/, 'kt'),
    pressure: pick('pressure', /^(hpa|inhg)$/, 'hpa'),
    timeMode: pick('time', /^(utc|local|both)$/, 'both'),
    brightness: num('brightness', typeof S.brightness === 'number' ? S.brightness : 1, 0.5, 1.2),
    motion: motion,                             // off | calm | full (js/motion.js)
    orient: 'north',                            // track-up is not built: north-up only
    view: view,                                 // radar | board | airport: one fixed view; auto: the rotation below
    // the rotation, in order: views=radar,board,airport (view=auto). A fixed view is a one-entry list. An empty or
    // one-entry views= falls back to the old rotation radar,board.
    views: view !== 'auto' ? [view] : (viewList('views').length >= 2 ? viewList('views') : ['radar', 'board']),
    airport: airportCode(str('airport', 'HAM')),  // focus view: HAM | XFW | FRA | FMO | CPH, checked against MA.features in js/airport.js (unknown = HAM)
    boardSec: num('boardsec', 40, 5, 600),      // rotation: seconds on the Anzeigetafel
    radarSec: num('radarsec', 240, 10, 3600),   // rotation: seconds on the radar
    airportSec: num('airportsec', 60, 10, 3600), // rotation: seconds on the focus view
    theme: THEME, // auto: light from sunrise to sunset
    wxRadar: str('wx', '').toLowerCase() === 'radar'   // weather radar overlay (js/wxradar.js), default off
  };
})();
