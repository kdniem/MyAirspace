/* App loop: polling, smoothing, featured-aircraft rotation, ambient housekeeping. */
(function (MA) {
  var cfg = MA.config;
  var AIRPORT = cfg.view === 'airport' && !!MA.airport;   // focus view: js/airport.js (the airport is the centre)
  if (AIRPORT) { MA.airport.configure(cfg); document.body.className += ' view-airport'; }
  var STALE_MS = 60 * 1000;      // drop aircraft not updated for a minute
  var MAX_EXTRAP_MS = 20 * 1000; // stop dead-reckoning after 20 s without data, then fade out until STALE_MS
  var WARN_AGE_S = 30;           // data older than this: amber "Daten N s alt"
  var ERR_AGE_S = 120;           // older than this: red "Keine Verbindung"
  var TRAIL_JUMP_KM = 5;         // break trails on implausible jumps
  var TRAIL_STEP_MS = 2000;      // trail sampling interval (keeps segment count low on TV browsers)
  var SPECIAL_REPEAT_MS = 30 * 60 * 1000; // special aircraft: jump/toast once per hex per 30 min
  var TOAST_MS = 8000;

  var radar = new MA.Radar(document.getElementById('radar'), cfg);
  var board = new MA.Board(cfg);
  var feed = new MA.data.Feed(cfg);

  var aircraft = {};             // hex -> state
  var visible = [];              // aircraft in view, nearest first
  var ground = {};               // hex -> aircraft on the ground at a mapped airport (static, not extrapolated)
  var GROUND_KM = 4;             // within this distance of an airport reference point counts as "at the airport"
  var GROUND_STALE_MS = 90 * 1000;
  var featured = MA.pick.create();  // board selection state (js/pick.js); featured.jumped: special aircraft hex -> time of board jump
  var announced = {};              // special aircraft: hex -> time of toast
  // dataAt: time of the newest position in the last answer (a cached answer is old although it just arrived)
var status = { ok: false, lastOk: 0, dataAt: 0, failures: 0, recover: 0, retryAfterMs: 0, nextAt: 0 };

  document.getElementById('place').textContent = cfg.label;
  document.getElementById('title').textContent = cfg.title;
  // element toggles (config show=…): classes hide the parts in CSS
  ['board', 'clock', 'weather', 'logos'].forEach(function (k) {
    if (cfg.show[k] === false) document.body.className += ' no-' + k;
  });
  if (cfg.show.weather !== false) MA.weather.start(cfg);   // METAR + runway in use, see js/weather.js

  /* ---------- data ---------- */

  function ingest(list) {
    var now = Date.now();
    list.forEach(function (n) {
      if (n.onGround) { noteGround(n, now); return; }
      delete ground[n.hex];
      var ac = aircraft[n.hex];
      if (!ac) {
        ac = aircraft[n.hex] = { hex: n.hex, trail: [], dlat: n.lat, dlon: n.lon,
          dist: MA.geo.distKm(cfg.lat, cfg.lon, n.lat, n.lon) };
      }
      if (MA.geo.distKm(ac.dlat, ac.dlon, n.lat, n.lon) > TRAIL_JUMP_KM) {
        ac.trail = [];
        ac.dlat = n.lat;
        ac.dlon = n.lon;
      }
      // a response from a cache can carry older positions than we already have: keep the newer fix
      if (ac.ts !== undefined && n.ts < ac.ts) { ac.seen = now; return; }
      for (var k in n) if (k !== 'trail') ac[k] = n[k];
      ac.special = MA.special.classify(ac); // once per poll, not per frame
      ac.seen = now;
    });
    MA.weather.observe(list, now); // runway-in-use votes from low traffic
    for (var gh in ground) if (now - ground[gh].seen > GROUND_STALE_MS) delete ground[gh];
    for (var hex in aircraft) {
      if (now - aircraft[hex].seen > STALE_MS) delete aircraft[hex];
    }
    forget(announced, now);
    MA.data.lookupRoutes(nearest(), cfg.demo);
    var newest = 0;
    list.forEach(function (n) { if (typeof n.ts === 'number' && n.ts > newest) newest = n.ts; });
    status.dataAt = list.length ? Math.min(now, newest || now) : now;
  }

  // Aircraft on the ground are kept only at mapped airports; they are shown dimmed, never featured.
  function noteGround(n, now) {
    var aps = MA.features.airports;
    for (var i = 0; i < aps.length; i++) {
      if (MA.geo.distKm(aps[i].lat, aps[i].lon, n.lat, n.lon) <= GROUND_KM) {
        ground[n.hex] = { hex: n.hex, callsign: n.callsign, type: n.type, lat: n.lat, lon: n.lon,
          track: n.track, gs: n.gs, ap: aps[i].code, seen: now };
        return;
      }
    }
    delete ground[n.hex];
  }

  function groundList() {
    var out = [];
    for (var h in ground) out.push(ground[h]);
    return out;
  }

  function poll() {
    var started = Date.now();
    feed.fetch(cfg.lat, cfg.lon, radar.coverKm()).then(function (list) {
      ingest(list);
      // recovered: status resets at once; only the poll rate comes back gradually (see pollDelay)
      status.recover = status.failures ? Math.min(3, status.failures) : Math.max(0, status.recover - 1);
      status.ok = true;
      status.lastOk = Date.now();
      status.failures = 0;
      status.retryAfterMs = 0;
    }, function (err) {
      status.ok = false;
      status.failures++;
      status.retryAfterMs = (err && err.retryAfter) || 0;
      if (window.console) console.warn('[MyAirspace] no data:', err && err.message);
    }).then(function () {
      var p = feed.provider();
      document.getElementById('attrib').textContent = p.attrib + ' · Karte: Natural Earth, OurAirports' + (AIRPORT ? ' · © OpenStreetMap-Mitwirkende (ODbL)' : '') + (cfg.public ? ' · öffentliche Proxys (public=1)' : '');
      var interval = Math.max(cfg.pollSec, p.minPollSec) * 1000;
      if (!cfg.demo && !cfg.proxy) interval = Math.max(interval, 8000); // be gentle with shared public proxies
      // back off on failures (respecting Retry-After), come back to the normal rate gradually
      interval = MA.data.pollDelay({ baseMs: interval, failures: status.failures, recover: status.recover,
        retryAfterMs: status.retryAfterMs, jitter: Math.random() });
      var wait = Math.max(500, interval - (Date.now() - started));
      status.nextAt = Date.now() + wait;
      setTimeout(poll, wait);
      updateSummary(Date.now());
    });
  }

  /* ---------- per frame ---------- */

  function nearest() {
    var list = [];
    for (var hex in aircraft) list.push(aircraft[hex]);
    list.sort(function (a, b) { return a.dist - b.dist; });
    return list;
  }

  function advance(now, dt) {
    var trailMs = cfg.trailMin * 60 * 1000;
    visible = [];
    for (var hex in aircraft) {
      var ac = aircraft[hex];
      MA.geo.glide(ac, now, dt, MAX_EXTRAP_MS);
      // position older than MAX_EXTRAP_MS (feed down or answer from a cache): fade out instead of vanishing
      var posAge = now - (typeof ac.ts === 'number' ? ac.ts : ac.seen);
      ac.fade = posAge <= MAX_EXTRAP_MS ? 1 : Math.max(0, 1 - (posAge - MAX_EXTRAP_MS) / (STALE_MS - MAX_EXTRAP_MS));
      if (!ac.fade) { delete aircraft[hex]; continue; }
      // the trail is drawn from the smoothed on-screen position, independent of poll timing
      var last = ac.trail[ac.trail.length - 1];
      if (!last || now - last[2] >= TRAIL_STEP_MS) ac.trail.push([ac.dlat, ac.dlon, now]);
      while (ac.trail.length && ac.trail[0][2] < now - trailMs) ac.trail.shift();
      ac.dist =MA.geo.distKm(cfg.lat, cfg.lon, ac.dlat, ac.dlon);
      ac.brg = MA.geo.bearing(cfg.lat, cfg.lon, ac.dlat, ac.dlon);
      visible.push(ac);
    }
    visible.sort(function (a, b) { return a.dist - b.dist; });
  }

  function forget(map, now) {
    for (var hex in map) if (now - map[hex] > SPECIAL_REPEAT_MS) delete map[hex];
  }

  // Special aircraft inside the radius not yet in `done`: alerts first, then the nearest.
  function newSpecial(list, done) {
    var best = null;
    for (var i = 0; i < list.length && list[i].dist <= cfg.radiusKm; i++) {
      var ac = list[i];
      if (ac.special && !done[ac.hex] && (!best || (ac.special.alert && !best.special.alert))) best = ac;
    }
    return best;
  }

  // Which aircraft the board shows: calm, rule-based selection in js/pick.js (dwell, hysteresis, stable order)
  function pickFeatured(now) {
    return MA.pick.next(featured, visible, now, cfg);
  }

  /* ---------- special aircraft toast ---------- */

  var toast = { el: document.getElementById('toast'), until: 0, on: false };

  // Announce a special aircraft when it first enters the radius (once per hex per 30 min);
  // one toast at a time, alerts first, then the nearest.
  function announce(now) {
    if (toast.on && now > toast.until) { toast.on = false; toast.el.className = toast.el.className.replace(' on', ''); }
    if (toast.on || now < toast.until + 1500) return; // let the previous toast fade out
    var best = newSpecial(visible, announced);
    if (!best) return;
    announced[best.hex] = now;
    var f = MA.fmt, sp = best.special, phase = f.phase(best);
    var parts = [phase === 'down' ? 'im Anflug' : (phase === 'up' ? 'im Steigflug' : 'in Sicht')];
    if (sp.alert) parts.push('Squawk ' + best.squawk);
    parts.push(best.callsign || best.reg || best.hex.toUpperCase());
    parts.push(f.km(best.dist) + ' km ' + f.compass(best.brg));
    document.getElementById('toast-label').textContent = sp.label;
    document.getElementById('toast-text').textContent = parts.join(' · ');
    toast.el.className = 'toast' + (sp.alert ? ' alert' : '') + ' on';
    toast.on = true;
    toast.until = now + TOAST_MS;
  }

  var lastFrame = Date.now(), lastBoard = 0;
  function frame() {
    var now = Date.now();
    advance(now, now - lastFrame);
    lastFrame = now;
    var feat, air = null;
    if (AIRPORT) {
      air = MA.airport.frame(visible, groundList(), now, featured);
      feat = air.feat;
      radar.render(air.air, feat && feat.hex, now, MA.weather.active(), air.ground);
    } else {
      feat = pickFeatured(now);
      radar.render(visible, feat && feat.hex, now, MA.weather.active(), groundList());
    }

    if (now - lastBoard > 1000) {
      lastBoard = now;
      if (AIRPORT) { /* no Tafel in the focus view */ }
      else if (feat) board.show(feat, featured.idx, featured.count);
      else if (!status.lastOk && !status.failures) board.empty('------', 'Verbinde…');
      else if (status.lastOk ? (now - status.dataAt) / 1000 >= WARN_AGE_S : status.failures) {
        board.empty('OFFLINE', status.lastOk ? 'Daten veraltet' : 'Keine Verbindung');
      }
      else if (status.lastOk) board.empty('RUHE', 'Kein Flugverkehr im Umkreis');
      else board.empty('------', 'Verbinde…');
      updateSummary(now);
      announce(now);
      MA.log.observe(visible, now);
      MA.views.tick(now);
    }
    requestAnimationFrame(frame);
  }

  /* ---------- chrome ---------- */

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function updateSummary(now) {
    var d = new Date(now);
    var local = pad(d.getHours()) + ':' + pad(d.getMinutes());
    var utc = pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
    var big = cfg.timeMode === 'utc' ? utc : local;
    var clk = document.getElementById('clock'), tz = document.getElementById('clock-tz'), u = document.getElementById('utc');
    if (clk.textContent !== big) clk.textContent = big;
    tz.textContent = cfg.timeMode === 'utc' ? 'UTC' : 'LT';
    u.textContent = cfg.timeMode === 'both' ? 'UTC ' + utc + 'Z' : '';
    var dot = document.getElementById('status-dot');
    var txt = document.getElementById('summary-text');
    var n = featured.inRange || 0;
    var sum = txt.parentNode;
    function state(dotClass, level, text) {   // level: '' | 'warn' | 'err' also colours the text
      dot.className = 'dot' + (dotClass ? ' ' + dotClass : '');
      sum.className = 'summary' + (level ? ' ' + level : '');
      if (txt.textContent !== text) txt.textContent = text;
    }
    if (!status.lastOk) {
      if (status.failures) state('err', 'err', 'Keine Verbindung'); else state('', '', 'Verbinde…');
      return;
    }
    // age of the data itself, not of the last request: an answer from a cache can arrive fresh but be old
    var age = Math.max(0, (now - status.dataAt) / 1000);
    if (age >= WARN_AGE_S) {
      var ageTxt = age < 90 ? Math.round(age) + ' s' : Math.round(age / 60) + ' min';
      if (age >= ERR_AGE_S) state('err', 'err', 'Keine Verbindung · Daten ' + ageTxt + ' alt');
      else state('warn', 'warn', 'Daten ' + ageTxt + ' alt');
      return;
    }
    dot.className = 'dot ok';
    sum.className = 'summary';
    if (AIRPORT) {   // focus view: counts of this airport, attention first
      var k = MA.airport.counts();
      txt.textContent = k.anflug + ' im Anflug · ' + k.boden + ' am Boden';
      return;
    }
    var g = cfg.show.ground === false ? 0 : groundList().filter(function (a) {
      return MA.geo.distKm(cfg.lat, cfg.lon, a.lat, a.lon) <= cfg.radiusKm * 1.15;
    }).length;
    txt.textContent = (n === 1 ? '1 Flugzeug' : n + ' Flugzeuge') + ' · ' + cfg.radiusKm + ' km' +
      (g ? ' · ' + g + ' am Boden' : '');
  }

  // OLED burn-in protection: drift the whole stage a few pixels; dim at night.
  var stage = document.getElementById('stage'), dimEl = document.getElementById('dim');
  function ambient() {
    var dx = Math.round(Math.random() * 12 - 6), dy = Math.round(Math.random() * 12 - 6);
    stage.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    var h = new Date().getHours(), n = cfg.night, night = false;
    if (n) night = n.from > n.to ? (h >= n.from || h < n.to) : (h >= n.from && h < n.to);
    dimEl.style.opacity = night ? (1 - cfg.nightLevel).toFixed(2) : 0;   // black veil: dims both themes
  }

  // Keep the screen awake where supported (Safari 16.4+, Chrome 84+).
  var lock = null;
  function wake() {
    if (!navigator.wakeLock || document.visibilityState !== 'visible' || lock) return;
    navigator.wakeLock.request('screen').then(function (l) {
      lock = l;
      l.addEventListener('release', function () { lock = null; });
    }, function () {});
  }
  document.addEventListener('visibilitychange', wake);

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { radar.resize(); }, 150);
  });
  // web fonts change map label metrics: redraw the cached base once loaded
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { radar.resize(); });

  ambient();
  setInterval(ambient, 2 * 60 * 1000);
  wake();
  poll();
  requestAnimationFrame(frame);
})(window.MA);
