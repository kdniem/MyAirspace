/* Colour theme (dark | light | auto) and style tokens: sets data-theme and the CSS custom properties.
   dark | light | auto (light from sunrise to sunset at the configured place).
   Loaded in <head> right after config.js, so data-theme is set before the first paint.
   CSS colours live in custom properties (css/style.css), the canvas palette in js/radar.js. */
(function (MA) {
  var cfg = MA.config;
  var root = document.documentElement;
  var CHECK_MS = 3 * 60 * 1000;
  var FADE_MS = 1800;
  var RAD = Math.PI / 180;
  var listeners = [], current = null, fadeTimer = 0;

  /* Sunrise / sunset after NOAA's "General Solar Position Calculations" (accuracy ~1–2 min
     at mid latitudes). Returns ms timestamps for the UTC calendar day of `t`,
     or {polar: 'day' | 'night'} when the sun does not rise or set that day. */
  function sun(t, lat, lon) {
    var d = new Date(t);
    var day0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    var doy = Math.round((day0 - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5) + 1;
    var g = 2 * Math.PI / 365 * (doy - 1);   // fractional year at noon
    var eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    var decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) -
      0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) -
      0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    var phi = lat * RAD;
    var cosH = Math.cos(90.833 * RAD) / (Math.cos(phi) * Math.cos(decl)) - Math.tan(phi) * Math.tan(decl);
    if (cosH > 1) return { polar: 'night' };
    if (cosH < -1) return { polar: 'day' };
    var h = Math.acos(cosH) / RAD;            // hour angle in degrees
    return {
      rise: day0 + (720 - 4 * (lon + h) - eqt) * 60000,
      set: day0 + (720 - 4 * (lon - h) - eqt) * 60000
    };
  }

  // Daylight at time t; yesterday and tomorrow cover days that wrap around UTC midnight.
  function isDay(t, lat, lon) {
    var s = sun(t, lat, lon);
    if (s.polar) return s.polar === 'day';
    for (var k = -1; k <= 1; k++) {
      var x = k ? sun(t + k * 864e5, lat, lon) : s;
      if (!x.polar && t >= x.rise && t < x.set) return true;
    }
    return false;
  }

  function resolve(t) {
    if (cfg.theme !== 'auto') return cfg.theme;
    return isDay(t, cfg.lat, cfg.lon) ? 'light' : 'dark';
  }

  function apply(name, fade) {
    if (name === current) return;
    current = name;
    if (fade) {
      // .theme-fade (css/style.css) turns on colour transitions for the switch only
      root.className = (root.className.replace(/\s*theme-fade/g, '') + ' theme-fade').trim();
      clearTimeout(fadeTimer);
      fadeTimer = setTimeout(function () { root.className = root.className.replace(/\s*theme-fade/g, '').trim(); }, FADE_MS + 400);
    }
    root.setAttribute('data-theme', name);
    // role tokens of the chosen style for this theme -> CSS custom properties (js/styles.js)
    var res = MA.style.resolve(cfg.style, name, { accent: cfg.accent, font: cfg.font, brightness: cfg.brightness });
    MA.style.apply(root, res);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', res.c.bg);
    for (var i = 0; i < listeners.length; i++) listeners[i](name, fade);
  }

  apply(resolve(Date.now()), false);
  if (cfg.theme === 'auto') setInterval(function () { apply(resolve(Date.now()), true); }, CHECK_MS);

  MA.theme = {
    current: function () { return current; },
    onChange: function (fn) { listeners.push(fn); },
    fadeMs: FADE_MS,
    sun: sun,
    isDay: isDay,
    set: function (name) { apply(name, true); }   // for tests and the console
  };
})(window.MA);
