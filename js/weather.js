/* Weather and runway in use ("Betriebsrichtung") for the airports near home.
   METAR from aviationweather.gov (no CORS headers, so via the proxy routes in data.js);
   the landing/departure direction is inferred from low traffic that climbs or descends
   along a runway, with the METAR wind as fallback. Optional: fails silently. */
(function (MA) {
  var g = MA.geo;
  var NEAR_KM = 60;                    // airports considered "local"
  var METAR_MS = 10 * 60 * 1000;       // METAR refresh
  var RETRY_MS = 2 * 60 * 1000;        // after a failed fetch
  var LOW_FT = 3000, VS_MIN = 200;     // evidence: low, clearly climbing or descending
  var RWY_KM = 15, XTRACK_KM = 1.5;    // HAM and XFW 05/23 are parallel, only ~2.3 km apart
  var TRACK_DEG = 25;
  var TAU_MS = 6 * 60 * 1000;          // vote decay
  var KEEP_MS = 15 * 60 * 1000;        // votes older than this are dropped
  var MIN_VOTE = 0.1;                  // ~one aircraft within the last 14 min
  var APPROACH_KM = 18;                // same length as the centrelines in radar.js

  var cfg = null;
  var airports = [];                   // within NEAR_KM, nearest first: {ap, runways}
  var metars = {};                     // icao -> METAR object
  var votes = {};                      // airport code -> { hex|kind: {end, kind, t} }
  var results = [];                    // last inferred state per airport
  var active = [];                     // approach centrelines for radar.js
  var els = null, shown = { metar: null, rwy: null };

  function adiff(a, b) {
    var d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  }

  // Runway geometry: a -> b heading belongs to the first designator ("05" of "05/23").
  function prepRunway(rw) {
    var mid = [(rw.a[0] + rw.b[0]) / 2, (rw.a[1] + rw.b[1]) / 2];
    return {
      id: rw.id, ids: rw.id.split('/'), a: rw.a, b: rw.b, mid: mid,
      hdg: g.bearing(rw.a[0], rw.a[1], rw.b[0], rw.b[1]),
      cosLat: Math.cos(mid[0] * Math.PI / 180)
    };
  }

  function init(c) {
    cfg = c;
    airports = [];
    votes = {};
    metars = {};
    results = [];
    active = [];
    MA.features.airports.forEach(function (ap) {
      var d = g.distKm(c.lat, c.lon, ap.lat, ap.lon);
      if (d <= NEAR_KM) airports.push({ ap: ap, dist: d, runways: ap.runways.map(prepRunway) });
    });
    airports.sort(function (x, y) { return x.dist - y.dist; });
  }

  /* ---------- runway inference ---------- */

  // Which runway end an aircraft is landing on / departing from, or null.
  function classify(ac, rw) {
    var x = (ac.lon - rw.mid[1]) * 111.32 * rw.cosLat;
    var y = (ac.lat - rw.mid[0]) * 110.574;
    if (x * x + y * y > RWY_KM * RWY_KM) return null;
    var ux = Math.sin(rw.hdg * Math.PI / 180), uy = Math.cos(rw.hdg * Math.PI / 180);
    var cross = Math.abs(x * uy - y * ux);
    if (cross > XTRACK_KM) return null;
    var idx;
    if (adiff(ac.track, rw.hdg) <= TRACK_DEG) idx = 0;
    else if (adiff(ac.track, rw.hdg + 180) <= TRACK_DEG) idx = 1;
    else return null;
    var ahead = (x * ux + y * uy) * (idx ? 1 : -1); // > 0: runway midpoint still ahead
    var kind = ac.vrate < -VS_MIN ? 'land' : 'start';
    if (kind === 'land' ? ahead < 0 : ahead > 0) return null;
    return { end: rw.ids[idx], kind: kind, cross: cross };
  }

  function observe(list, now) {
    if (!airports.length) return;
    list.forEach(function (ac) {
      if (ac.onGround || typeof ac.alt !== 'number' || ac.alt >= LOW_FT) return;
      if (typeof ac.track !== 'number' || Math.abs(ac.vrate || 0) <= VS_MIN) return;
      var best = null, bestAp = null;
      airports.forEach(function (n) {
        n.runways.forEach(function (rw) {
          var c = classify(ac, rw);
          if (c && (!best || c.cross < best.cross)) { best = c; bestAp = n.ap.code; }
        });
      });
      if (!best) return;
      var v = votes[bestAp] || (votes[bestAp] = {});
      v[ac.hex + '|' + best.kind] = { end: best.end, kind: best.kind, t: now };
    });
    update(now);
  }

  // Ends with a clear share of the decayed vote (parallels or mixed operation, e.g.
  // ["23", "33"]), sorted by designator so the line does not flicker as weights change.
  function winners(tally) {
    var top = 0, e;
    for (e in tally) top = Math.max(top, tally[e]);
    if (top < MIN_VOTE) return [];
    return Object.keys(tally).filter(function (x) { return tally[x] >= top * 0.4; }).sort();
  }

  // Runway end closest to the wind direction (landing and departing into the wind).
  function byWind(n, m) {
    if (!m || typeof m.wdir !== 'number' || !(m.wspd >= 3)) return null;
    var best = null, bestD = 999;
    n.runways.forEach(function (rw) {
      [0, 1].forEach(function (i) {
        var d = adiff(rw.hdg + i * 180, m.wdir);
        if (d < bestD) { bestD = d; best = rw.ids[i]; }
      });
    });
    return best;
  }

  function update(now) {
    results = [];
    active = [];
    airports.forEach(function (n) {
      var v = votes[n.ap.code] || {}, tally = { land: {}, start: {} };
      for (var k in v) {
        var age = now - v[k].t;
        if (age > KEEP_MS) { delete v[k]; continue; }
        var t = tally[v[k].kind];
        t[v[k].end] = (t[v[k].end] || 0) + Math.exp(-Math.max(0, age) / TAU_MS);
      }
      var r = { code: n.ap.code, land: winners(tally.land), start: winners(tally.start), est: false };
      if (!r.land.length && !r.start.length) {
        var w = byWind(n, metars[n.ap.icao]);
        if (!w) return;
        r = { code: n.ap.code, land: [w], start: [w], est: true };
      }
      results.push(r);
      // arrival side of each landing runway: from its threshold out along the approach
      n.runways.forEach(function (rw) {
        [0, 1].forEach(function (i) {
          if (r.land.indexOf(rw.ids[i]) < 0) return;
          var thr = i ? rw.b : rw.a;
          var far = g.dest(thr[0], thr[1], rw.hdg + (i ? 0 : 180), APPROACH_KM);
          active.push({ thr: thr, far: far, rev: !!i, est: r.est });
        });
      });
    });
    render(now);
  }

  /* ---------- METAR ---------- */

  function pad3(n) { return ('00' + Math.round(n)).slice(-3); }

  function visText(m) {
    var tok = (m.rawOb || '').split(' ');
    for (var i = 2; i < tok.length; i++) {
      var r = /^(\d{4})(NDV)?$/.exec(tok[i]);
      if (!r) continue;
      var v = +r[1];
      if (v >= 9999) return '10+ km';
      if (v >= 5000) return Math.round(v / 1000) + ' km';
      return v >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') + ' km' : v + ' m';
    }
    if (m.visib === '6+' || m.visib >= 6) return '10+ km';
    if (typeof m.visib === 'number') return (m.visib * 1.609).toFixed(1).replace('.', ',') + ' km';
    return '';
  }

  // e.g. "EDDH · 230° 12 G22 kt · 10+ km · Wolken 4200 ft · 14 °C · Q1013"
  function metarText(m, now) {
    var p = [m.icaoId];
    if (m.wspd === 0) p.push('windstill');
    else if (typeof m.wspd === 'number') {
      p.push((typeof m.wdir === 'number' ? pad3(m.wdir) + '°' : 'VRB') + ' ' + m.wspd +
        (m.wgst ? ' G' + m.wgst : '') + ' kt');
    }
    if (m.cover === 'CAVOK' || / CAVOK /.test(' ' + (m.rawOb || '') + ' ')) p.push('CAVOK');
    else {
      var vis = visText(m);
      if (vis) p.push(vis);
      var ceil = null;
      (m.clouds || []).forEach(function (c) {
        if (/^(BKN|OVC|OVX|VV)$/.test(c.cover) && typeof c.base === 'number' && (ceil === null || c.base < ceil)) ceil = c.base;
      });
      if (ceil !== null && ceil < 5000) p.push('Wolken ' + ceil + ' ft');
    }
    if (typeof m.temp === 'number') p.push(Math.round(m.temp) + ' °C');
    if (typeof m.altim === 'number') p.push('Q' + Math.round(m.altim));
    if (m.fltCat && m.fltCat !== 'VFR') p.push(m.fltCat);
    var age = now - m.obsTime * 1000;
    if (age > 3600 * 1000) {
      var min = Math.floor(age / 60000);
      p.push('vor ' + Math.floor(min / 60) + ':' + ('0' + min % 60).slice(-2) + ' h');
    }
    return p.join(' · ');
  }

  function validMetar(j) {
    return Array.isArray(j) && j.every(function (m) { return m && typeof m.icaoId === 'string'; });
  }

  function store(list) {
    list.forEach(function (m) { metars[m.icaoId] = m; });
    update(Date.now());
  }

  function fetchMetar() {
    if (cfg.demo) { store(MA.demo.metar()); return; } // offline, like the demo routes
    var ids = airports.map(function (n) { return n.ap.icao; }).join(',');
    MA.data.getJson('https://aviationweather.gov/api/data/metar?ids=' + ids + '&format=json',
      undefined, 10000, validMetar).then(function (list) {
      store(list);
      setTimeout(fetchMetar, METAR_MS);
    }, function (err) {
      if (window.console) console.warn('[MyAirspace] METAR:', err && err.message);
      setTimeout(fetchMetar, RETRY_MS);
    });
  }

  /* ---------- header ---------- */

  // Runway line as [text, bold] pieces; null marks the gap between airports.
  function rwyPieces() {
    var out = [];
    results.forEach(function (r, i) {
      if (i) out.push(null);
      out.push([r.code + ' \u25B8 ', false]);
      if (r.est) { out.push([r.land.join('/'), true], [' laut Wind', false]); return; }
      if (r.land.join() === r.start.join()) { out.push([r.land.join('/'), true], [' Landung & Start', false]); return; }
      if (r.land.length) out.push([r.land.join('/'), true], [' Landung', false]);
      if (r.land.length && r.start.length) out.push([' \u00B7 ', false]);
      if (r.start.length) out.push([r.start.join('/'), true], [' Start', false]);
    });
    return out;
  }

  function render(now) {
    if (!els) return;
    var m = airports.length && metars[airports[0].ap.icao];
    var mt = m ? metarText(m, now) : '';
    var pieces = rwyPieces(), key = JSON.stringify(pieces);
    if (mt !== shown.metar) { els.metar.textContent = mt; shown.metar = mt; }
    if (key !== shown.rwy) {
      shown.rwy = key;
      while (els.rwy.firstChild) els.rwy.removeChild(els.rwy.firstChild);
      pieces.forEach(function (p) {
        var node;
        if (!p) { node = document.createElement('span'); node.className = 'wx-gap'; }
        else if (p[1]) { node = document.createElement('b'); node.textContent = p[0]; }
        else node = document.createTextNode(p[0]);
        els.rwy.appendChild(node);
      });
    }
    els.box.style.display = mt || pieces.length ? '' : 'none';
  }

  MA.weather = {
    start: function (c) {
      init(c);
      if (!airports.length) return; // no airport near home: weather UI stays hidden
      els = {
        box: document.getElementById('wx'),
        metar: document.getElementById('wx-metar'),
        rwy: document.getElementById('wx-rwy')
      };
      fetchMetar();
    },
    observe: observe,
    // approach centrelines of the runways in use: [{thr, far, rev, est}]
    active: function () { return active; },
    // for tests
    _init: init,
    _store: function (list, now) { list.forEach(function (m) { metars[m.icaoId] = m; }); update(now); },
    _results: function () { return results; },
    _rwyText: function () { return rwyPieces().map(function (p) { return p ? p[0] : '   '; }).join(''); },
    _metarText: metarText
  };
})(window.MA);
