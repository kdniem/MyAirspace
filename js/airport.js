/* Focus view (view=airport, airport=HAM|XFW|FRA|FMO|CPH): one airport centred and zoomed to its apron.
   Static layer (apron, taxiways, terminals, hangars, runways, gates, stands) is cached per airport, size and
   theme by js/radar.js; per frame come the corridors (last 10 km of the runway centrelines), the aircraft
   within 12 km (airborne: symbol and data block on final/departure; on the ground: small symbols at their real
   place on the apron) and the operator badges. Data: MA.airportDetail (data/airport-detail.js, OpenStreetMap,
   ODbL) and the runway ends of MA.features (data/geo-features.js). Loaded after js/radar.js, ES2017. */
(function (MA) {
  var PI = Math.PI;
  var AIR_KM = 12;          // aircraft within this distance of the airport
  var CORRIDOR_KM = 10;     // length of the approach and departure corridors
  var MARGIN_KM = 0.6;      // margin around the apron box
  var MARGIN_RWY_KM = 2;    // margin around the runway ends (fallback)
  var FRAME = { left: 0.03, right: 0.97, top: 0.2, bottom: 0.86 };   // stage, fractions of the screen
  var state = { cfg: null, ap: null, counts: { anflug: 0, boden: 0 } };

  function find(code) {
    var list = MA.features.airports;
    for (var i = 0; i < list.length; i++) if (list[i].code === code) return list[i];
    return null;
  }
  // only codes of MA.features.airports count; anything else silently becomes HAM
  function resolve(code) { return find(code) || find('HAM') || MA.features.airports[0]; }

  /* Fitted box in km. The apron focus: the box of the apron, terminals and gates plus a margin, so that
     stands and gate references stay readable. (The runway ends alone span about 8 km at HAM and would
     leave the apron at a few hundred pixels.) Without apron data it falls back to the runway ends. */
  function bounds(ap, detail) {
    var pts = [], m = detail ? MARGIN_KM : MARGIN_RWY_KM;
    if (detail) {
      detail.apron.forEach(function (r) { pts = pts.concat(r); });
      detail.terminal.forEach(function (t) { pts = pts.concat(t.poly); });
      detail.gate.forEach(function (g) { pts.push(g.p); });
    }
    if (pts.length < 4) ap.runways.forEach(function (rw) { pts.push(rw.a, rw.b); });
    var minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    pts.forEach(function (p) {
      minLat = Math.min(minLat, p[0]); maxLat = Math.max(maxLat, p[0]);
      minLon = Math.min(minLon, p[1]); maxLon = Math.max(maxLon, p[1]);
    });
    var midLat = (minLat + maxLat) / 2, midLon = (minLon + maxLon) / 2, g = MA.geo;
    return {
      midLat: midLat, midLon: midLon,
      hKm: g.distKm(minLat, midLon, maxLat, midLon) + 2 * m,
      wKm: g.distKm(midLat, minLon, midLat, maxLon) + 2 * m
    };
  }

  // Called by main.js before the radar exists: the airport becomes the centre of data, distances and weather.
  function configure(cfg) {
    var ap = resolve(cfg.airport);
    state.cfg = cfg;
    cfg.airportCode = ap.code;
    cfg.lat = ap.lat;
    cfg.lon = ap.lon;
    cfg.radiusKm = AIR_KM;
    cfg.label = ap.name.toUpperCase();
    cfg.title = ap.code + ' · ' + ap.icao;
    cfg.show.board = false;                 // the focus view has no Tafel: the data block sits on the apron
    if (cfg.demo && MA.demo) MA.demo.anchor(ap);
  }

  // Called by Radar on construction: the layout target of the chosen airport.
  function target(cfg) {
    var ap = resolve(cfg.airportCode || cfg.airport);
    var detail = (MA.airportDetail && MA.airportDetail[ap.code]) || null, b = bounds(ap, detail);
    state.ap = {
      code: ap.code, ap: ap, radiusKm: AIR_KM, midLat: b.midLat, midLon: b.midLon, wKm: b.wKm, hKm: b.hKm,
      detail: detail
    };
    return state.ap;
  }

  // Per frame: aircraft within 12 km, ground traffic of this airport, and the featured one (pick.js rules).
  function frame(list, ground, now, featured) {
    var cfg = state.cfg, code = state.ap.code, air = [], gr = [], i;
    for (i = 0; i < list.length; i++) if (list[i].dist <= AIR_KM) air.push(list[i]);
    ground.forEach(function (g) {
      if (g.ap !== code) return;
      g.dist = MA.geo.distKm(cfg.lat, cfg.lon, g.lat, g.lon);
      g.fade = 1;
      gr.push(g);
    });
    var cands = air.concat(gr).sort(function (a, b) { return a.dist - b.dist; });
    var feat = MA.pick.next(featured, cands, now, cfg);
    var anflug = 0;
    air.forEach(function (ac) { if (MA.fmt.phase(ac) === 'down') anflug++; });
    state.counts = { anflug: anflug, boden: gr.length };
    return { air: air, ground: gr, feat: feat };
  }

  function counts() { return state.counts; }

  /* ---------- radar hooks: layout, static base, per frame ---------- */

  var Radar = MA.Radar;

  // fit the box of the airport into the stage; the box centre is the projection origin
  Radar.prototype.layoutAirport = function () {
    var a = this.airport, w = this.w, h = this.h;
    var left = w * FRAME.left, right = w * FRAME.right, top = h * FRAME.top, bottom = h * FRAME.bottom;
    this.cx = (left + right) / 2;
    this.cy = (top + bottom) / 2;
    this.areaBottom = bottom;
    this.ringPx = 0;
    this.pxPerKm = Math.min((right - left) / a.wKm, (bottom - top) / a.hKm);
    this.org = { lat: a.midLat, lon: a.midLon };
    this.cosLat = Math.cos(a.midLat * PI / 180);
    this.unit = h / 1080;
    this._base = null;
    this._prev = null;
  };

  function hit(a, b) {
    return a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
  }

  // static layer: everything that does not move (cached by Radar.base)
  Radar.prototype.drawAirportBase = function () {
    var ctx = this.ctx, u = this.unit, self = this, C = this.pal, A = this.airport, d = A.detail, pk = this.pxPerKm;
    var labels = this._avoid = [];
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, this.w, this.h);

    function ring(pts, closed) {
      ctx.beginPath();
      for (var i = 0; i < pts.length; i++) {
        var q = self.project(pts[i][0], pts[i][1]);
        if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]);
      }
      if (closed) ctx.closePath();
    }
    function centre(pts) {
      var la = 0, lo = 0;
      pts.forEach(function (p) { la += p[0]; lo += p[1]; });
      return self.project(la / pts.length, lo / pts.length);
    }
    // a label gets its place only when it touches no label placed before (greedy, in priority order)
    function place(x, y, w, h) {
      var r = [x - w / 2, y - h / 2, w, h];
      for (var i = 0; i < labels.length; i++) if (hit(r, labels[i])) return false;
      labels.push(r);
      return true;
    }
    function boxOf(pts) {
      var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      pts.forEach(function (p) {
        var q = self.project(p[0], p[1]);
        x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]);
      });
      return [x0, y0, x1 - x0, y1 - y0];
    }

    ctx.lineJoin = 'round';
    if (d) {
      // apron: muted fill with a fine edge
      d.apron.forEach(function (r) {
        ring(r, true);
        ctx.fillStyle = C.apron;
        ctx.fill();
        ctx.strokeStyle = C.apronEdge;
        ctx.lineWidth = 1 * u * C.lw;
        ctx.stroke();
      });
      // taxiways: lines at least 1.6 px at 1080p, about 20 m wide when zoomed
      ctx.lineCap = 'round';
      ctx.strokeStyle = C.taxi;
      ctx.lineWidth = Math.max(1.6 * u, 0.02 * pk) * C.lw;
      d.taxiway.forEach(function (t) { ring(t.pts, false); ctx.stroke(); });
      // hangars and terminals
      d.hangar.forEach(function (h) { ring(h.poly, true); ctx.fillStyle = C.terminal; ctx.fill(); ctx.strokeStyle = C.terminalEdge; ctx.lineWidth = 1 * u * C.lw; ctx.stroke(); });
      d.terminal.forEach(function (t) { ring(t.poly, true); ctx.fillStyle = C.terminal; ctx.fill(); ctx.strokeStyle = C.terminalEdge; ctx.lineWidth = 1.3 * u * C.lw; ctx.stroke(); });
      // runway surfaces from the map data
      ctx.lineCap = 'butt';
      ctx.strokeStyle = C.runway;
      ctx.lineWidth = Math.max(3 * u, 0.045 * pk);
      d.runway.forEach(function (r) { ring(r.pts, false); ctx.stroke(); });
    }

    // thresholds and designators from the runway ends (same drawing as the radar base)
    A.ap.runways.forEach(function (rw) {
      var p1 = self.project(rw.a[0], rw.a[1]), p2 = self.project(rw.b[0], rw.b[1]);
      var dx = p2[0] - p1[0], dy = p2[1] - p1[1], l = Math.sqrt(dx * dx + dy * dy) || 1;
      var wpx = Math.max(3 * u, 0.045 * pk), nx = -dy / l * (wpx / 2 + 3 * u), ny = dx / l * (wpx / 2 + 3 * u);
      ctx.strokeStyle = C.runway;
      ctx.lineWidth = 1.6 * u * C.lw;
      [p1, p2].forEach(function (p) { ctx.beginPath(); ctx.moveTo(p[0] - nx, p[1] - ny); ctx.lineTo(p[0] + nx, p[1] + ny); ctx.stroke(); });
      var ids = rw.id.split('/');
      if (ids.length === 2) {
        ctx.fillStyle = C.placeMajor;
        ctx.font = self.font(15, '600');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var da = self.desig(p1, [2 * p1[0] - p2[0], 2 * p1[1] - p2[1]]);
        var db = self.desig(p2, [2 * p2[0] - p1[0], 2 * p2[1] - p1[1]]);
        self.alongText(ids[0], da.x, da.y, da.ang);
        self.alongText(ids[1], db.x, db.y, db.ang);
      }
    });

    if (!d) return;
    // helipads, stands (dots) and gates (squares with their reference)
    ctx.strokeStyle = C.stand;
    ctx.fillStyle = C.stand;
    ctx.lineWidth = 1.2 * u * C.lw;
    d.helipad.forEach(function (h) { var q = self.project(h.p[0], h.p[1]); ctx.beginPath(); ctx.arc(q[0], q[1], 6 * u, 0, PI * 2); ctx.stroke(); });
    d.stand.forEach(function (s) { var q = self.project(s.p[0], s.p[1]); ctx.beginPath(); ctx.arc(q[0], q[1], 1.7 * u, 0, PI * 2); ctx.fill(); });
    ctx.font = self.font(14, '600');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // labels in priority order: terminals, gates, big hangars
    var named = {};   // a terminal often has several polygons: one label per name
    d.terminal.forEach(function (t) {
      if (!t.name || named[t.name]) return;
      named[t.name] = true;
      var c = centre(t.poly), tw = ctx.measureText(t.name).width + 14 * u;
      if (place(c[0], c[1], tw, 24 * u)) { ctx.fillStyle = C.placeMajor; self.label(t.name, c[0], c[1]); }
    });
    d.gate.forEach(function (g) {
      var q = self.project(g.p[0], g.p[1]);
      ctx.strokeStyle = C.stand;
      ctx.strokeRect(q[0] - 3 * u, q[1] - 3 * u, 6 * u, 6 * u);
      if (!g.ref) return;
      var tw = ctx.measureText(g.ref).width + 6 * u;
      if (place(q[0], q[1] - 13 * u, tw, 17 * u)) { ctx.fillStyle = C.gateLabel; self.label(g.ref, q[0], q[1] - 13 * u); }
    });
    d.hangar.forEach(function (h) {
      if (!h.name) return;
      var b = boxOf(h.poly);
      if (b[2] < 26 * u || b[3] < 14 * u) return;   // small sheds stay unlabelled
      var c = centre(h.poly), tw = ctx.measureText(h.name).width + 6 * u;
      if (place(c[0], c[1], tw, 16 * u)) {
        ctx.font = self.font(12, '');
        ctx.fillStyle = C.gateLabel;
        self.label(h.name, c[0], c[1]);
        ctx.font = self.font(14, '600');
      }
    });
  };

  // approach and departure corridors: the centrelines of every runway, 10 km out from each end, fading;
  // the runways in use (js/weather.js) brighter in the accent colour
  Radar.prototype.drawCorridors = function (active) {
    var ctx = this.ctx, u = this.unit, self = this, C = this.pal, g = MA.geo;
    ctx.lineWidth = 1.4 * u * C.lw;
    ctx.lineCap = 'butt';
    this.airport.ap.runways.forEach(function (rw) {
      var hdg = g.bearing(rw.a[0], rw.a[1], rw.b[0], rw.b[1]);
      var c1 = g.dest(rw.b[0], rw.b[1], hdg, CORRIDOR_KM), c2 = g.dest(rw.a[0], rw.a[1], hdg + 180, CORRIDOR_KM);
      var pa = self.project(rw.a[0], rw.a[1]), pb = self.project(rw.b[0], rw.b[1]);
      var q1 = self.project(c1[0], c1[1]), q2 = self.project(c2[0], c2[1]);
      if (ctx.setLineDash) ctx.setLineDash([6 * u, 6 * u]);
      [[pb, q1], [pa, q2]].forEach(function (seg) {
        ctx.strokeStyle = Radar.fadeLine(ctx, C.centerline, seg[0], seg[1]);
        ctx.beginPath();
        ctx.moveTo(seg[0][0], seg[0][1]);
        ctx.lineTo(seg[1][0], seg[1][1]);
        ctx.stroke();
      });
      if (ctx.setLineDash) ctx.setLineDash([]);
    });
    var code = this.airport.code, use = [];
    (active || []).forEach(function (r) {
      if (r.ap !== code) return;
      var brg = g.bearing(r.thr[0], r.thr[1], r.far[0], r.far[1]);
      use.push({ thr: r.thr, far: g.dest(r.thr[0], r.thr[1], brg, CORRIDOR_KM), rev: r.rev, est: r.est, end: r.end });
    });
    this.drawActive(use);
  };

  Radar.prototype.renderAirport = function (list, featuredHex, now, active, ground) {
    var ctx = this.ctx, u = this.unit, self = this, C = this.pal, show = this.show;
    ctx.drawImage(this.base(), 0, 0, this.w, this.h);
    this._prev = null;
    this.drawCorridors(active);

    // ground traffic: small symbols at their real place on the apron
    var gsz = 7.5 * u * C.plane;
    (ground || []).forEach(function (g) {
      var p = self.project(g.lat, g.lon);
      if (p[0] < 0 || p[1] < 0 || p[0] > self.w || p[1] > self.h) return;
      self.drawPlane(MA.glyphs.kind(g), p[0], p[1], typeof g.track === 'number' ? g.track : 0, gsz, Radar.rgba(C.level, 0.9), 1);
    });

    var items = [], pts = [], badges = [], blink = MA.motion.alertAlpha(now);   // emergency frame pulse (js/motion.js)
    var sorted = list.slice().sort(function (a, b) { return (b.alt || 0) - (a.alt || 0); });
    sorted.forEach(function (ac) {
      var phase = MA.fmt.phase(ac), high = (ac.alt || 0) > 20000, featured = ac.hex === featuredHex;
      var sp = ac.special, spCol = sp ? (sp.alert ? C.alert : C.special) : null;
      var baseA = ((featured || sp) ? 1 : (high ? C.high : 1)) * (typeof ac.fade === 'number' ? ac.fade : 1);
      var col = featured ? C.target : C.level;
      var p = self.project(ac.dlat, ac.dlon), gk = MA.glyphs.kind(ac);
      if (self.inHeader(p[0], p[1])) return;   // under the clock and summary: not drawn (still counted)
      self.drawTrail(ac, col, baseA, now);
      var size = (high ? 10.5 : 13) * u * C.plane * (featured ? 1.2 : 1);
      var reach = size * Math.max(MA.glyphs.len(gk), 0.9);
      if (sp) self.drawBrackets(p[0], p[1], reach * 1.45, Radar.rgba(spCol, sp.alert ? blink : 1), 1.6 * u * C.lw);
      self.drawPlane(gk, p[0], p[1], ac.track, size, Radar.rgba(sp ? spCol : col, 1), baseA);
      var onScreen = p[0] > 0 && p[0] < self.w && p[1] > 0 && p[1] < self.areaBottom + self.h * 0.02;
      // data block: final and departure traffic, and the featured one
      if ((show.labels !== false || featured) && onScreen && (phase === 'up' || phase === 'down' || featured)) {
        items.push({ ac: ac, p: p, size: reach, high: high, featured: featured, sp: sp, spCol: spCol, lines: self.blockLines(ac, phase) });
      }
      pts.push(p);
      var bi = self.badgeFor(ac);
      if (bi && onScreen) badges.push({ ac: ac, p: p, bi: bi, reach: reach, dim: high && !featured, fade: baseA });
    });

    // ground aircraft: the featured one gets its callsign; all with a known airline get the badge
    (ground || []).forEach(function (g) {
      var p = self.project(g.lat, g.lon);
      if (p[0] < 0 || p[1] < 0 || p[0] > self.w || p[1] > self.h) return;
      var featured = g.hex === featuredHex;
      if (featured) items.push({ ac: g, p: p, size: gsz * 2, high: false, featured: true, sp: null, spCol: null, lines: self.blockLines(g, '') });
      pts.push(p);
      var bi = self.badgeFor(g);
      if (bi) badges.push({ ac: g, p: p, bi: bi, reach: gsz * 1.2, dim: false, fade: 1 });   // off-screen ones are skipped above
    });

    var order = items.slice().sort(function (a, b) {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      return (a.ac.dist || 0) - (b.ac.dist || 0);
    });
    var placed = this.badgeRects(badges).slice(), drawn = [];
    order.forEach(function (it) {
      var m = self.measureBlock(it.lines, it.featured);
      var r = self.placeBlock(it, m, placed, pts);
      if (r.bad && !it.featured) return;
      placed.push(r.rect);
      it.m = m;
      it.r = r;
      drawn.push(it);
    });
    this.drawBadges(badges);
    drawn.forEach(function (it) {
      ctx.globalAlpha = typeof it.ac.fade === 'number' ? it.ac.fade : 1;
      self.drawBlock(it, it.m, it.r, now);
      ctx.globalAlpha = 1;
    });
  };

  MA.airport = {
    configure: configure,
    target: target,
    frame: frame,
    counts: counts,
    resolve: resolve
  };
})(window.MA);
