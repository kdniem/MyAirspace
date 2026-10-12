/* App loop: polling, smoothing, featured-aircraft rotation, ambient housekeeping. */
(function (MA) {
  var cfg = MA.config;
  var STALE_MS = 60 * 1000;      // drop aircraft not updated for a minute
  var MAX_EXTRAP_MS = 20 * 1000; // stop dead-reckoning after 20 s without data
  var TRAIL_JUMP_KM = 5;         // break trails on implausible jumps
  var TRAIL_STEP_MS = 2000;      // trail sampling interval (keeps segment count low on TV browsers)

  var radar = new MA.Radar(document.getElementById('radar'), cfg);
  var board = new MA.Board(cfg);
  var feed = new MA.data.Feed(cfg);

  var aircraft = {};             // hex -> state
  var visible = [];              // aircraft in view, nearest first
  var featured = { hex: null, idx: 0, since: 0 };
  var status = { ok: false, lastOk: 0, failures: 0 };

  document.getElementById('place').textContent = cfg.label;
  MA.weather.start(cfg);         // METAR + runway in use, see js/weather.js

  /* ---------- data ---------- */

  function ingest(list) {
    var now = Date.now();
    list.forEach(function (n) {
      if (n.onGround) return;
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
      for (var k in n) if (k !== 'trail') ac[k] = n[k];
      ac.seen = now;
    });
    MA.weather.observe(list, now); // runway-in-use votes from low traffic
    for (var hex in aircraft) {
      if (now - aircraft[hex].seen > STALE_MS) delete aircraft[hex];
    }
    MA.data.lookupRoutes(nearest(), cfg.demo);
  }

  function poll() {
    var started = Date.now();
    feed.fetch(cfg.lat, cfg.lon, radar.coverKm()).then(function (list) {
      ingest(list);
      status.ok = true;
      status.lastOk = Date.now();
      status.failures = 0;
    }, function (err) {
      status.ok = false;
      status.failures++;
      if (window.console) console.warn('[MyAirspace] no data:', err && err.message);
    }).then(function () {
      var p = feed.provider();
      document.getElementById('attrib').textContent = p.attrib + ' · Karte: Natural Earth, OurAirports';
      var interval = Math.max(cfg.pollSec, p.minPollSec) * 1000;
      if (!cfg.demo && !cfg.proxy) interval = Math.max(interval, 8000); // be gentle with shared public proxies
      if (!status.ok) interval = Math.min(60000, interval * Math.pow(1.6, status.failures)); // back off
      setTimeout(poll, Math.max(500, interval - (Date.now() - started)));
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
    var k = Math.min(1, dt / 600); // ease displayed position towards the prediction
    var trailMs = cfg.trailMin * 60 * 1000;
    visible = [];
    for (var hex in aircraft) {
      var ac = aircraft[hex];
      var age = Math.min(MAX_EXTRAP_MS, Math.max(0, now - ac.ts));
      var plat = ac.lat, plon = ac.lon;
      if (ac.track !== null && ac.gs > 30) {
        var p = MA.geo.dest(ac.lat, ac.lon, ac.track, ac.gs * 1.852 * age / 3600000);
        plat = p[0]; plon = p[1];
      }
      ac.dlat += (plat - ac.dlat) * k;
      ac.dlon += (plon - ac.dlon) * k;
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

  // Rotate through the nearest aircraft; jump to a newcomer that is very close.
  function pickFeatured(now) {
    var inRange = visible.filter(function (ac) { return ac.dist <= cfg.radiusKm * 1.15; });
    var cand = inRange.slice(0, 4);
    if (!cand.length) { featured.hex = null; return null; }
    var curIdx = -1;
    for (var i = 0; i < cand.length; i++) if (cand[i].hex === featured.hex) curIdx = i;
    var due = now - featured.since > cfg.rotateSec * 1000;
    var closeNew = cand[0].hex !== featured.hex && cand[0].dist < 4 && now - featured.since > 3000;
    if (curIdx < 0 || closeNew) curIdx = 0;
    else if (due) curIdx = (curIdx + 1) % cand.length;
    if (cand[curIdx].hex !== featured.hex || due) {
      featured.hex = cand[curIdx].hex;
      featured.since = now;
    }
    featured.idx = curIdx;
    featured.count = cand.length;
    featured.inRange = inRange.length;
    return cand[curIdx];
  }

  var lastFrame = Date.now(), lastBoard = 0;
  function frame() {
    var now = Date.now();
    advance(now, now - lastFrame);
    lastFrame = now;
    var feat = pickFeatured(now);
    radar.render(visible, feat && feat.hex, now, MA.weather.active());

    if (now - lastBoard > 1000) {
      lastBoard = now;
      if (feat) board.show(feat, featured.idx, featured.count);
      else if (!status.ok && status.failures > 0) board.empty('OFFLINE', 'Neuer Versuch läuft…');
      else if (status.lastOk) board.empty('RUHE', 'Kein Flugverkehr im Umkreis');
      else board.empty('------', 'Verbinde…');
      updateSummary(now);
    }
    requestAnimationFrame(frame);
  }

  /* ---------- chrome ---------- */

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function updateSummary(now) {
    var d = new Date(now);
    document.getElementById('clock').textContent = pad(d.getHours()) + ':' + pad(d.getMinutes());
    var dot = document.getElementById('status-dot');
    var txt = document.getElementById('summary-text');
    var n = featured.inRange || 0;
    if (!status.lastOk) {
      dot.className = status.failures ? 'dot err' : 'dot';
      txt.textContent = status.failures ? 'Keine Verbindung' : 'Verbinde…';
      return;
    }
    var age = (now - status.lastOk) / 1000;
    dot.className = 'dot ' + (age < 30 ? 'ok' : (age < 120 ? 'warn' : 'err'));
    txt.textContent = (n === 1 ? '1 Flugzeug' : n + ' Flugzeuge') + ' · ' + cfg.radiusKm + ' km';
  }

  // OLED burn-in protection: drift the whole stage a few pixels; dim at night.
  var stage = document.getElementById('stage');
  function ambient() {
    var dx = Math.round(Math.random() * 12 - 6), dy = Math.round(Math.random() * 12 - 6);
    stage.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    var h = new Date().getHours(), n = cfg.night, night = false;
    if (n) night = n.from > n.to ? (h >= n.from || h < n.to) : (h >= n.from && h < n.to);
    stage.style.opacity = night ? cfg.nightLevel : 1;
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
