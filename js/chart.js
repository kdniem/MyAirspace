/* Chart background (URL option chartbg=1, off by default): a paper aeronautical-chart look for the radar.
   Data: data/chart-features.js (open data, built by tools/build-chart.py). Drawing: ours, nothing is copied from a chart.
   Hooks in js/radar.js, both inside the cached base layer (Radar.prototype.base), so there is no per-frame cost:
     under(radar)  right after the land tone: paper and a fine lat/lon graticule with ticks
     over(radar)   after the water: airspaces (class colours and line styles), navaids, tall obstacles, magnetic marker
   Labels only where they fit, never over the header. Aircraft, weather and the board are drawn later, on top.
   Classic script, ES2017 only (old TV browsers). */
(function (MA) {
  var PI = Math.PI;
  var STEPS = [1, 2, 5, 10, 15, 30, 60];   // graticule step in arc-minutes, the finest that fits

  function pal(R) {
    return MA.style.resolve(R.cfg.style, R.theme, { accent: R.cfg.accent, font: R.cfg.font, brightness: R.cfg.brightness }).c;
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function pad3(n) { return (n < 100 ? (n < 10 ? '00' : '0') : '') + n; }

  // text with a paper-coloured outline: readable over lines and water
  function txt(R, s, x, y, col, halo, px, weight, align) {
    var ctx = R.ctx;
    ctx.font = R.font(px, weight);
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3 * R.unit;
    ctx.strokeStyle = halo;
    ctx.strokeText(s, x, y);
    ctx.fillStyle = col;
    ctx.fillText(s, x, y);
  }

  function dash(ctx, d) { if (ctx.setLineDash) ctx.setLineDash(d); }

  function overlaps(a, list) {
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3]) return true;
    }
    return false;
  }

  /* ---------- under: paper and graticule ---------- */

  function graticule(R, ch, C) {
    var ctx = R.ctx, u = R.unit, lw = C.lw, bottom = R.areaBottom;
    var ky = 110.574, kx = 111.32 * Math.cos(R.cfg.lat * PI / 180);
    var pxPerMinLon = kx / 60 * R.pxPerKm, step = STEPS[STEPS.length - 1], i;
    for (i = 0; i < STEPS.length; i++) if (STEPS[i] * pxPerMinLon >= 56 * u) { step = STEPS[i]; break; }
    var majorEvery = step <= 2 ? 10 : (step <= 10 ? 30 : 60);
    var latTop = R.cfg.lat + R.cy / R.pxPerKm / ky, latBot = R.cfg.lat - (bottom - R.cy) / R.pxPerKm / ky;
    var lonLeft = R.cfg.lon - R.cx / R.pxPerKm / kx, lonRight = R.cfg.lon + (R.w - R.cx) / R.pxPerKm / kx;
    var k, m, p;

    // latitude lines (horizontal), labels on the left edge at the major lines
    for (k = Math.floor(latBot * 60 / step); k <= Math.ceil(latTop * 60 / step); k++) {
      m = k * step;
      p = R.project(m / 60, R.cfg.lon);
      if (p[1] < 0 || p[1] > bottom) continue;
      var major = m % majorEvery === 0;
      ctx.strokeStyle = ch.grid;
      ctx.lineWidth = (major ? 1.1 : 0.9) * u * lw;
      dash(ctx, major ? [] : [1.5 * u, 4 * u]);            // minor lines dotted: fine grid without a heavy screen
      ctx.beginPath(); ctx.moveTo(0, p[1]); ctx.lineTo(R.w, p[1]); ctx.stroke();
      if (major) {
        var am = Math.abs(m);
        txt(R, Math.floor(am / 60) + '°' + pad2(am % 60) + '′' + (m >= 0 ? 'N' : 'S'), 8 * u, p[1] - 9 * u, ch.labelDim, ch.paper, 13, '', 'left');
      }
    }
    // longitude lines (vertical), labels along the bottom edge of the radar area
    for (k = Math.floor(lonLeft * 60 / step); k <= Math.ceil(lonRight * 60 / step); k++) {
      m = k * step;
      p = R.project(R.cfg.lat, m / 60);
      if (p[0] < 0 || p[0] > R.w) continue;
      major = m % majorEvery === 0;
      ctx.strokeStyle = ch.grid;
      ctx.lineWidth = (major ? 1.1 : 0.9) * u * lw;
      dash(ctx, major ? [] : [1.5 * u, 4 * u]);
      ctx.beginPath(); ctx.moveTo(p[0], 0); ctx.lineTo(p[0], bottom); ctx.stroke();
      dash(ctx, []);
      if (major) {
        var al = Math.abs(m);
        txt(R, pad3(Math.floor(al / 60)) + '°' + pad2(al % 60) + '′' + (m >= 0 ? 'E' : 'W'), p[0] + 6 * u, bottom - 10 * u, ch.labelDim, ch.paper, 13, '', 'left');
      }
    }
  }

  function under(R) {
    if (!MA.chartData) return;
    var C = pal(R), ch = C.chart;
    R.ctx.fillStyle = ch.paper;
    R.ctx.fillRect(0, 0, R.w, R.h);
    graticule(R, ch, C);
  }

  /* ---------- over: airspaces, navaids, obstacles, magnetic marker ---------- */

  // line style per class: prohibited heavy solid, danger dash-dot, restricted dashed, controlled blue (CTR dashed)
  function lineStyle(t, c, ch, u, lw) {
    if (t === 'pro') return { col: ch.pro, w: 2.6 * u * lw, d: [] };
    if (t === 'dng') return { col: ch.dng, w: 1.6 * u * lw, d: [10 * u, 4 * u, 2 * u, 4 * u] };
    if (t === 'res') return { col: ch.res, w: 1.7 * u * lw, d: [7 * u, 4 * u] };
    if (t === 'oth') return { col: ch.oth, w: 1.2 * u * lw, d: [2 * u, 3 * u] };
    if (c === 'CTR' || c === 'MCTR') return { col: ch.ctl, w: 2 * u * lw, d: [9 * u, 5 * u] };
    return { col: ch.ctl, w: 1.6 * u * lw, d: [] };
  }

  // is (x, y) inside the projected polygon (even-odd)
  function inside(x, y, pts) {
    var c = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      if ((pts[i][1] > y) !== (pts[j][1] > y) && x < (pts[j][0] - pts[i][0]) * (y - pts[i][1]) / (pts[j][1] - pts[i][1]) + pts[i][0]) c = !c;
    }
    return c;
  }

  function airspaces(R, list, ch, C, placed) {
    var ctx = R.ctx, u = R.unit, lw = C.lw, labels = [], i;
    for (i = 0; i < list.length; i++) {
      var a = list[i], pts = [], x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, j;
      for (j = 0; j < a.p.length; j++) {
        var q = R.project(a.p[j][0], a.p[j][1]);
        pts.push(q);
        if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0];
        if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1];
      }
      if (x1 < 0 || y1 < 0 || x0 > R.w || y0 > R.areaBottom) continue;
      var s = lineStyle(a.t, a.c, ch, u, lw);
      ctx.strokeStyle = s.col;
      ctx.lineWidth = s.w;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'butt';
      dash(ctx, s.d);
      ctx.beginPath();
      for (j = 0; j < pts.length; j++) { if (j) ctx.lineTo(pts[j][0], pts[j][1]); else ctx.moveTo(pts[j][0], pts[j][1]); }
      ctx.closePath();
      ctx.stroke();
      dash(ctx, []);
      if (a.t !== 'oth' && x1 - x0 > 130 * u && y1 - y0 > 56 * u) labels.push({ a: a, pts: pts, x0: x0, y0: y0, x1: x1, y1: y1, area: (x1 - x0) * (y1 - y0) });
    }
    // labels: largest first, only where the box fits inside the polygon's own area, clear of others and the header
    labels.sort(function (p, q) { return q.area - p.area; });
    labels.forEach(function (L) {
      var cx = 0, cy = 0, k;
      for (k = 0; k < L.pts.length; k++) { cx += L.pts[k][0]; cy += L.pts[k][1]; }
      cx /= L.pts.length; cy /= L.pts.length;
      var u0 = R.unit;
      var cand = [[cx, cy], [(L.x0 + L.x1) / 2, (L.y0 + L.y1) / 2], [cx, cy + 40 * u0], [cx, cy - 40 * u0]], hit = null;
      for (k = 0; k < cand.length && !hit; k++) if (inside(cand[k][0], cand[k][1], L.pts)) hit = cand[k];
      if (!hit) return;
      var line1 = L.a.n.toUpperCase().slice(0, 24);
      var line2 = (L.a.lo ? L.a.lo + '–' : '') + (L.a.hi || '');
      ctx.font = R.font(15, '600');
      var w1 = ctx.measureText(line1).width;
      ctx.font = R.font(13, '');
      var w2 = ctx.measureText(line2).width;
      var bw = Math.max(w1, w2) + 10 * u, bh = 36 * u, bx = hit[0] - bw / 2, by = hit[1] - bh / 2;
      var box = [bx, by, bw, bh];
      if (bx < 0 || by < 0 || bx + bw > R.w || by + bh > R.areaBottom) return;
      if (R.inHeader(bx, by) || R.inHeader(bx + bw, by + bh) || overlaps(box, placed)) return;
      placed.push(box);
      R._avoid.push(box);
      txt(R, line1, hit[0], hit[1] - 8 * u, ch.label, ch.paper, 15, '600', 'center');
      txt(R, line2, hit[0], hit[1] + 9 * u, ch.labelDim, ch.paper, 13, '', 'center');
    });
  }

  function navaids(R, list, ch, C, placed) {
    var ctx = R.ctx, u = R.unit, lw = C.lw, i;
    for (i = 0; i < list.length; i++) {
      var n = list[i], p = R.project(n.lat, n.lon);
      if (p[0] < -40 || p[0] > R.w + 40 || p[1] < -40 || p[1] > R.areaBottom + 40) continue;
      if (R.inHeader(p[0], p[1])) continue;
      ctx.strokeStyle = ch.nav;
      ctx.fillStyle = ch.nav;
      ctx.lineWidth = 1.6 * u * lw;
      dash(ctx, []);
      ctx.beginPath();
      if (n.g === 'VOR') {                       // hexagon with a centre dot: VOR, VORTAC, DVOR
        for (var k = 0; k < 6; k++) {
          var ang = k * PI / 3 + PI / 6, hx = p[0] + Math.cos(ang) * 7 * u, hy = p[1] + Math.sin(ang) * 7 * u;
          if (k) ctx.lineTo(hx, hy); else ctx.moveTo(hx, hy);
        }
        ctx.closePath();
      } else if (n.g === 'NDB') {                // open circle: NDB
        ctx.arc(p[0], p[1], 5 * u, 0, PI * 2);
      } else {                                   // small square: DME
        ctx.rect(p[0] - 3.4 * u, p[1] - 3.4 * u, 6.8 * u, 6.8 * u);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p[0], p[1], 1.4 * u, 0, PI * 2);
      ctx.fill();
      // identifier and frequency to the right, only where they fit
      ctx.font = R.font(13, '600');
      var w = Math.max(ctx.measureText(n.id).width, n.f ? ctx.measureText(n.f).width : 0) + 6 * u;
      var box = [p[0] + 10 * u, p[1] - 9 * u, w, n.f ? 24 * u : 14 * u];
      if (overlaps(box, placed)) continue;
      placed.push(box);
      txt(R, n.id, p[0] + 10 * u, p[1] - 3 * u, ch.nav, ch.paper, 13, '600', 'left');
      if (n.f) txt(R, n.f, p[0] + 10 * u, p[1] + 9 * u, ch.nav, ch.paper, 12, '', 'left');
    }
  }

  // tall obstacles as small filled triangles; the tallest get their height (metres, top elevation)
  function obstacles(R, list, ch) {
    var ctx = R.ctx, u = R.unit, i;
    ctx.fillStyle = ch.obs;
    for (i = 0; i < list.length; i++) {
      var o = list[i], p = R.project(o[0], o[1]), s = 3.2 * u;
      if (p[0] < -10 || p[0] > R.w + 10 || p[1] < -10 || p[1] > R.areaBottom + 10) continue;
      ctx.beginPath();
      ctx.moveTo(p[0], p[1] - s * 1.2);
      ctx.lineTo(p[0] + s, p[1] + s * 0.8);
      ctx.lineTo(p[0] - s, p[1] + s * 0.8);
      ctx.closePath();
      ctx.fill();
    }
  }

  // magnetic north on the compass ring, from the declination of the nearest airport (the chart's second north)
  function magnetic(R, D, ch) {
    if (R.show.compass === false || !D.airports || !D.airports.length) return;
    var best = null, bd = 1e9, k;
    for (k = 0; k < D.airports.length; k++) {
      var a = D.airports[k], dy = (a.lat - R.cfg.lat) * 110.574, dx = (a.lon - R.cfg.lon) * 111.32 * R.cosLat;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < bd) { bd = d; best = a; }
    }
    if (!best || bd > 150) return;                       // too far from the data to say anything useful
    var u = R.unit, ctx = R.ctx, ang = best.decl * PI / 180, sx = Math.sin(ang), sy = -Math.cos(ang);
    ctx.strokeStyle = ch.label;
    ctx.lineWidth = 1.4 * u * pal(R).lw;
    dash(ctx, [3 * u, 3 * u]);
    ctx.beginPath();
    ctx.moveTo(R.cx + sx * R.ringPx * 0.84, R.cy + sy * R.ringPx * 0.84);
    ctx.lineTo(R.cx + sx * R.ringPx * 1.0, R.cy + sy * R.ringPx * 1.0);
    ctx.stroke();
    dash(ctx, []);
    var lab = 'MAG ' + (Math.abs(best.decl).toFixed(1).replace('.', ',')) + '° ' + (best.decl >= 0 ? 'E' : 'W');
    var lx = R.cx + sx * R.ringPx * 0.62 + 10 * u, ly = R.cy + sy * R.ringPx * 0.62;
    txt(R, lab, lx, ly, ch.label, ch.paper, 13, '600', 'left');
    R._avoid.push([lx - 4 * u, ly - 10 * u, 110 * u, 20 * u]);   // the place names keep clear of it
  }
  function over(R) {
    var D = MA.chartData;
    if (!D) return;
    var C = pal(R), ch = C.chart, placed = [], u = R.unit, k, p;
    // airport symbols are drawn later, on top of the base: the labels keep clear of them
    for (k = 0; k < (D.airports || []).length; k++) {
      p = R.project(D.airports[k].lat, D.airports[k].lon);
      placed.push([p[0] - 40 * u, p[1] - 40 * u, 120 * u, 80 * u]);
    }
    airspaces(R, D.airspaces || [], ch, C, placed);
    navaids(R, D.navaids || [], ch, C, placed);
    obstacles(R, D.obstacles || [], ch);
    magnetic(R, D, ch);
  }

  MA.chart = { under: under, over: over };
})(window.MA);
