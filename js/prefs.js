/* Saved dashboard settings from the settings overlay (js/settings.js), kept under ONE localStorage key, ma.settings.
   Loaded in <head> after styles.js and before config.js: config.js takes a saved value only where the address
   has no parameter for it, so existing links and setup.html URLs keep their meaning and win.
   Only the keys in FIELDS are stored, never a location (no lat/lon). Storage can throw (private mode, blocked
   site data): every access is guarded and the page runs with its defaults.
   Not loaded by setup.html (its preview must show what the address says). Classic script, ES2017. */
(function () {
  var MA = window.MA = window.MA || {};
  var KEY = 'ma.settings';
  var THEMES = /^(dark|light|auto)$/;
  var VIEWS = /^(radar|board|auto|airport)$/;

  // value checks: anything invalid is dropped, so a damaged entry can never break the page
  var FIELDS = {
    style: function (v) { return typeof v === 'string' && MA.STYLES && Object.prototype.hasOwnProperty.call(MA.STYLES, v) ? v : undefined; },
    theme: function (v) { return typeof v === 'string' && THEMES.test(v) ? v : undefined; },
    brightness: function (v) { return typeof v === 'number' && v >= 0.5 && v <= 1.2 ? Math.round(v * 100) / 100 : undefined; },
    view: function (v) { return typeof v === 'string' && VIEWS.test(v) ? v : undefined; },
    chartbg: bool, labels: bool, trails: bool, places: bool, weather: bool
  };
  function bool(v) { return typeof v === 'boolean' ? v : undefined; }

  // URL parameters that decide a stored key (the names js/config.js reads)
  var PARAMS = {
    style: ['style'], theme: ['theme'], brightness: ['brightness'], view: ['view'], font: ['font'], chartbg: ['chartbg'],
    labels: ['labels', 'datablock', 'datablocks'], trails: ['trails', 'trail'], places: ['places'], weather: ['weather', 'wx']
  };
  var ELEMENT = { labels: true, trails: true, places: true, weather: true };
  var ALIAS = { datablock: 'labels', datablocks: 'labels', trail: 'trails', place: 'places', wx: 'weather' };

  // true when the address itself sets this key; the stored value then does not apply (it is kept)
  function mentions(search, key) {
    var q;
    try { q = new URLSearchParams(search || ''); } catch (e) { return false; }
    var names = PARAMS[key] || [key];
    for (var i = 0; i < names.length; i++) {
      // wx=radar is the weather radar overlay (js/wxradar.js), not the weather box
      if (q.has(names[i]) && !(names[i] === 'wx' && /^radar$/i.test(q.get('wx')))) return true;
    }
    if (ELEMENT[key]) {
      if (q.has('show')) return true;   // show= lists every element on the page
      var hide = (q.get('hide') || '').toLowerCase().split(',');
      for (var j = 0; j < hide.length; j++) {
        var n = hide[j].trim();
        if ((ALIAS[n] || n) === key) return true;
      }
    }
    return false;
  }

  // object -> only the valid stored keys (pure, used by the tests too)
  function clean(o) {
    var out = {};
    if (!o || typeof o !== 'object') return out;
    Object.keys(FIELDS).forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(o, k)) return;
      var v = FIELDS[k](o[k]);
      if (v !== undefined) out[k] = v;
    });
    return out;
  }

  function read() {
    try { return clean(JSON.parse(window.localStorage.getItem(KEY))); } catch (e) { return {}; }
  }
  function write(obj) {
    try { window.localStorage.setItem(KEY, JSON.stringify(clean(obj))); return true; } catch (e) { return false; }
  }
  function save(key, value) {
    var s = read();
    if (FIELDS.hasOwnProperty(key)) {
      var v = FIELDS[key](value);
      if (v === undefined) delete s[key]; else s[key] = v;
    }
    return write(s);
  }
  function clear() {
    try { window.localStorage.removeItem(KEY); return true; } catch (e) { return false; }
  }

  var embedded = true;
  try { embedded = window.top !== window.self; } catch (e) { embedded = true; }

  MA.prefs = {
    // saved values for config.js; nothing applies inside an embedded page (the setup preview)
    stored: embedded ? {} : read(),
    clean: clean,
    mentions: mentions,
    read: read,
    write: write,
    save: save,
    clear: clear
  };
})();
