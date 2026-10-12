/* Weather radar overlay in the look of a cockpit weather radar: precipitation returns on the map in
   four avionics steps (leicht, mäßig, stark, sehr stark), a small legend and a range readout.
   Data: Deutscher Wetterdienst composite, observed reflectivity, through our own /api/radar function
   (api/radar.js). The request carries no position: the viewer's location never leaves the browser.
   Opt-in: wx=radar (default off). ?demo=1 shows synthetic cells, labelled as demo, never in live mode.
   The layer is rendered into an off-screen canvas once per refresh (every 5 min) and per size or theme
   change; each frame only blits it (js/radar.js). Nothing here is stored in localStorage.
   Loaded after js/data.js and before js/radar.js. */
(function (MA) {
  var PERIOD_MS = 5 * 60 * 1000;        // refresh (the composite is new every 5 min)
  var RETRY_MS = 60 * 1000;             // after a failed request
  var MAX_AGE_MS = 15 * 60 * 1000;      // older observations are hidden, not shown as current
  var TIMEOUT_MS = 10000;
  var MIN_CLASS = 4;                    // level 4 = 20 dBZ: below that nothing is drawn (drizzle noise)

  var cfg = null;
  var data = null;                      // {obs: ms, grid, levels: Uint8Array, demo: bool}
  var stamp = 0;                        // changes with every new answer
  var cacheKey = '', cache = null;      // the off-screen layer and its key
  var legend = null, lastLegend = '';
  var drawnRects = 0;                   // rectangles in the last layer (for the browser test)

  /* 5-dBZ level -> step 0..3 (leicht 20-34, mäßig 35-44, stark 45-54, sehr stark 55 and more), -1 = none.
     Level L covers [5L, 5L+5) dBZ, the server caps at 15 (75 dBZ). */
  function stepOf(level) {
    if (level < MIN_CLASS) return -1;
    if (level < 7) return 0;
    if (level < 9) return 1;
    if (level < 11) return 2;
    return 3;
  }

  // run-length decode, the inverse of encodeRuns in lib/dwd-radar.js
  function decodeRuns(runs, n) {
    var out = new Uint8Array(n), k = 0;
    if (!runs || !runs.length || runs.length % 2) throw new Error('bad runs');
    for (var p = 0; p < runs.length; p += 2) {
      var v = runs[p], len = runs[p + 1];
      if (typeof v !== 'number' || typeof len !== 'number' || len < 0 || k + len > n) throw new Error('bad runs');
      for (var q = 0; q < len; q++) out[k++] = v;
    }
    if (k !== n) throw new Error('bad runs');
    return out;
  }

  // the answer of /api/radar, checked before it is used
  function parseAnswer(j) {
    if (!j || j.v !== 1 || typeof j.obs !== 'string' || !j.grid || !j.runs) throw new Error('bad answer');
    var g = j.grid;
    var nums = [g.north, g.west, g.dlat, g.dlon, g.rows, g.cols];
    for (var i = 0; i < nums.length; i++) if (typeof nums[i] !== 'number' || !isFinite(nums[i])) throw new Error('bad grid');
    if (!(g.rows > 0 && g.cols > 0 && g.rows * g.cols <= 2000000)) throw new Error('bad grid');
    var t = Date.parse(j.obs);
    if (!isFinite(t)) throw new Error('bad time');
    return { obs: t, grid: { north: g.north, west: g.west, dlat: g.dlat, dlon: g.dlon, rows: g.rows, cols: g.cols },
      levels: decodeRuns(j.runs, g.rows * g.cols), demo: false };
  }

  /* Demo only (?demo=1): three synthetic storm cells around home, on a small grid of their own.
     The result is labelled "DEMO" in the legend. */
  function demoData(c) {
    var step = 0.02, dlon = 0.03, rows = 80, cols = 100;
    var north = c.lat + step * rows / 2, west = c.lon - dlon * cols / 2;
    var cells = [
      { la: c.lat + 0.05, lo: c.lon - 0.06, s: 0.05, dbz: 47 },
      { la: c.lat - 0.09, lo: c.lon + 0.12, s: 0.07, dbz: 34 },
      { la: c.lat + 0.14, lo: c.lon + 0.09, s: 0.02, dbz: 58 }
    ];
    var lv = new Uint8Array(rows * cols);
    for (var r = 0; r < rows; r++) {
      for (var k = 0; k < cols; k++) {
        var la = north - (r + 0.5) * step, lo = west + (k + 0.5) * dlon, best = 0;
        for (var z = 0; z < cells.length; z++) {
          var dy = la - cells[z].la, dx = (lo - cells[z].lo) * Math.cos(c.lat * Math.PI / 180);
          var d2 = (dx * dx + dy * dy) / (cells[z].s * cells[z].s);
          var dbz = cells[z].dbz * Math.exp(-d2);
          if (dbz > best) best = dbz;
        }
        var lvl = best >= 15 ? Math.min(15, Math.floor(best / 5)) : 0;
        lv[r * cols + k] = lvl;
      }
    }
    return { obs: Date.now(), grid: { north: north, west: west, dlat: step, dlon: dlon, rows: rows, cols: cols },
      levels: lv, demo: true };
  }

  function endpoint() {
    var p = cfg.proxy;                  // ?proxy=off: no network at all, so no radar either
    return p ? p.replace(/\/proxy(\?[\s\S]*)?$/, '/radar') : '';
  }

  function setData(d) {
    data = d;
    stamp++;
    cache = null;
    updateLegend();
  }

  var timer = null;
  function schedule(ms) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(load, ms);
  }

  function load() {
    if (cfg.demo) { setData(demoData(cfg)); return; }   // synthetic, shown only with ?demo=1
    var url = endpoint();
    if (!url) { updateLegend(); return; }
    // A timeout stops the wait and schedules a retry; an answer that arrives later is ignored. (No
    // AbortController: the TV compatibility scan requires guards for it, and the server caps its own wait.)
    var done = false;
    var guard = setTimeout(function () {
      if (done) return;
      done = true;
      if (window.console) console.warn('[MyAirspace] radar: timeout');
      schedule(RETRY_MS);
      updateLegend();
    }, TIMEOUT_MS);
    fetch(url, { headers: { Accept: 'application/json' } }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (j) {
      if (done) return;
      done = true;
      clearTimeout(guard);
      setData(parseAnswer(j));
      schedule(PERIOD_MS);
    }).catch(function (err) {      // also a malformed answer: it is retried, not left unhandled
      if (done) return;
      done = true;
      clearTimeout(guard);
      if (window.console) console.warn('[MyAirspace] radar:', err && err.message);
      schedule(RETRY_MS);
      updateLegend();
    });
  }

  /* ---------- legend ---------- */

  function hhmm(ms) {
    var d = new Date(ms);
    return ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2);
  }

  function ageText(ms) {
    var min = Math.max(0, Math.round((Date.now() - ms) / 60000));
    return min < 1 ? 'gerade' : 'vor ' + min + ' min';
  }

  // the legend shows the state honestly: demo label, observation time, age, or that no data is shown
  function updateLegend() {
    if (!legend) return;
    var head = legend.head, foot = legend.foot, box = legend.box;
    var on = !!cfg.wxRadar;
    box.style.display = on ? '' : 'none';
    if (!on) return;
    var fresh = data && (Date.now() - data.obs) < MAX_AGE_MS;
    var rng = 'RNG ' + (cfg.radiusKm >= 10 ? Math.round(cfg.radiusKm) : cfg.radiusKm) + ' km · 360°';
    var text;
    if (!data) text = 'Radar lädt…';
    else if (data.demo) text = 'DEMO · simulierter Regen · ' + rng;
    else if (!fresh) text = 'Radar veraltet · ' + hhmm(data.obs) + ' UTC';
    else text = 'Daten: DWD · ' + hhmm(data.obs) + ' UTC · ' + ageText(data.obs) + ' · ' + rng;
    if (text !== lastLegend) { foot.textContent = text; lastLegend = text; }
    head.textContent = 'Niederschlag';
    box.className = 'wx-legend' + (data && data.demo ? ' demo' : '');
  }

  function buildLegend() {
    var box = document.getElementById('wx-legend');
    if (!box) return;
    legend = { box: box, head: document.getElementById('wx-legend-head'), foot: document.getElementById('wx-legend-foot') };
  }

  /* ---------- layer ---------- */

  /* Off-screen canvas with the cells in screen space; rebuilt only when the answer, the size, the
     theme or the viewport geometry changes. Runs of equal step are drawn as one rectangle per row. */
  function layer(radar) {
    if (!data || !radar || !radar.palette || !radar.palette.wx) return null;
    var fresh = data.demo || (Date.now() - data.obs) < MAX_AGE_MS;
    if (!fresh) return null;
    var key = [stamp, radar.w, radar.h, radar.theme, radar.cx, radar.cy, radar.pxPerKm, radar.canvas.width].join('|');
    if (cache && key === cacheKey) return cache;
    var off = document.createElement('canvas');
    off.width = radar.canvas.width;
    off.height = radar.canvas.height;
    var ctx = off.getContext('2d');
    ctx.setTransform(radar.canvas.width / radar.w, 0, 0, radar.canvas.height / radar.h, 0, 0);
    var g = data.grid, cols = g.cols, lv = data.levels, cols4 = radar.palette.wx;
    var w = radar.w, h = radar.h, rects = 0;
    for (var r = 0; r < g.rows; r++) {
      var latT = g.north - r * g.dlat, latB = latT - g.dlat;
      var yT = radar.project(latT, g.west)[1], yB = radar.project(latB, g.west)[1];
      if (yB < -2 || yT > h + 2) continue;               // row outside the screen
      var k = 0;
      while (k < cols) {
        var s = stepOf(lv[r * cols + k]);
        if (s < 0) { k++; continue; }
        var k2 = k + 1;
        while (k2 < cols && stepOf(lv[r * cols + k2]) === s) k2++;
        var xL = radar.project(latT, g.west + k * g.dlon)[0], xR = radar.project(latT, g.west + k2 * g.dlon)[0];
        if (xR > -2 && xL < w + 2) {
          ctx.fillStyle = cols4[s];
          ctx.fillRect(xL - 0.5, Math.min(yT, yB) - 0.5, xR - xL + 1, Math.abs(yB - yT) + 1);
          rects++;
        }
        k = k2;
      }
    }
    cache = off;
    cacheKey = key;
    drawnRects = rects;
    return off;
  }

  MA.wxradar = {
    start: function (c) {
      cfg = c;
      buildLegend();
      updateLegend();
      if (!c.wxRadar) return;
      load();
      setInterval(updateLegend, 30000);
    },
    layer: layer,
    // for tests
    _info: function () { return { rects: drawnRects, demo: !!(data && data.demo), stamp: stamp }; },
    _decodeRuns: decodeRuns,
    _parseAnswer: parseAnswer,
    _stepOf: stepOf,
    _demo: demoData
  };
})(window.MA);
