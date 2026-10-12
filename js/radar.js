/* Canvas renderer: radar / navigation display centred on home.
   Colours and symbol shapes come from the style table (js/styles.js) via MA.style.resolve(),
   so this file knows roles (ink, target, special, accent …) and no hard-coded look.
   Drawing language: ATC position symbols with history dots, a data block on a thin leader line,
   a compass rose with degree ticks on the outer ring, ICAO-chart style runways and airport symbols. */
(function (MA) {
  var C = null;                      // resolved canvas palette of the current style and theme
  var PI = Math.PI;

  function Radar(canvas, cfg) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cfg = cfg;
    this.show = cfg.show || { rings: true, compass: true, places: true, ground: true, labels: true, trails: true };
    this.cosLat = Math.cos(cfg.lat * PI / 180);
    this.setTheme(MA.theme ? MA.theme.current() : 'dark', false);
    this.resize();
    var self = this;
    if (MA.theme) MA.theme.onChange(function (name, fade) { self.setTheme(name, fade); });
  }

  // Switch the palette; with `fade` the old base layer is crossfaded out (see render).
  Radar.prototype.setTheme = function (name, fade) {
    if (name === this.theme && C) return;
    this.theme = name;
    C = MA.style.resolve(this.cfg.style, name, { accent: this.cfg.accent, font: this.cfg.font, brightness: this.cfg.brightness }).c;
    this._prev = fade && this._base ? this._base : null;
    this._fadeAt = Date.now();
    this._base = null;
  };

  Radar.prototype.font = function (px, weight) {
    return (weight || '') + ' ' + Math.round(px * this.unit) + 'px ' + C.font;
  };

  Radar.prototype.resize = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w;
    this.h = h;
    // radar area: everything above the board (bottom ~22% of the screen); full height without a board
    var areaBottom = this.show.board === false ? h * 0.93 : h * 0.765;
    this.areaBottom = areaBottom;
    this.cx = w / 2;
    this.cy = areaBottom / 2 + h * 0.015;
    // the compass rose (ticks and labels) lives outside the main ring
    this.ringPx = areaBottom / 2 - h * (this.show.compass === false ? 0.04 : 0.075);
    this.pxPerKm = this.ringPx / this.cfg.radiusKm;
    this.unit = h / 1080; // base size unit, 1 at Full HD
    this._base = null;
    this._prev = null;
  };

  // km needed to cover the whole screen from home (for data fetch radius)
  Radar.prototype.coverKm = function () {
    var dx = Math.max(this.cx, this.w - this.cx), dy = Math.max(this.cy, this.h - this.cy);
    return Math.sqrt(dx * dx + dy * dy) / this.pxPerKm;
  };

  Radar.prototype.project = function (lat, lon) {
    var xKm = (lon - this.cfg.lon) * 111.32 * this.cosLat;
    var yKm = (lat - this.cfg.lat) * 110.574;
    return [this.cx + xKm * this.pxPerKm, this.cy - yKm * this.pxPerKm];
  };

  Radar.prototype.niceStep = function () {
    var target = this.cfg.radiusKm / 2.5;
    var steps = [1, 2, 2.5, 5, 10, 15, 20, 25, 50, 100];
    for (var i = 0; i < steps.length; i++) if (steps[i] >= target) return steps[i];
    return 100;
  };

  // header areas (brand top left, clock and weather top right): map names and rose labels keep clear
  Radar.prototype.inHeader = function (x, y) {
    if (x < this.w * 0.3 && y < this.h * 0.13) return true;
    return x > this.w * 0.55 && y < this.h * 0.245;
  };

  Radar.prototype.headerRects = function () {
    var w = this.w, h = this.h;
    return [[0, 0, w * 0.3, h * 0.13], [w * 0.55, 0, w * 0.45, h * 0.255]];
  };

  // Map label with an outline in the background colour: stays readable over water and rings.
  Radar.prototype.label = function (text, x, y, outline) {
    var ctx = this.ctx;
    ctx.lineWidth = (outline || 4) * this.unit;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = C.halo;
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
  };

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // text rotated along a line, never upside down
  Radar.prototype.alongText = function (text, x, y, ang) {
    var ctx = this.ctx;
    if (ang > PI / 2) ang -= PI; else if (ang < -PI / 2) ang += PI;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    this.label(text, 0, 0, 3.5);
    ctx.restore();
  };

  // position and angle of a runway designator, 14 units beyond the threshold
  Radar.prototype.desig = function (thr, away) {
    var dx = away[0] - thr[0], dy = away[1] - thr[1], l = Math.sqrt(dx * dx + dy * dy) || 1;
    var d = 15 * this.unit;
    return { x: thr[0] + dx / l * d, y: thr[1] + dy / l * d, ang: Math.atan2(-dy, -dx) };
  };

  Radar.prototype.drawRose = function () {
    var ctx = this.ctx, u = this.unit, R = this.ringPx, cx = this.cx, cy = this.cy, lw = C.lw;
    ctx.lineCap = 'butt';
    for (var d = 0; d < 360; d += 5) {
      var major = d % 30 === 0, mid = d % 10 === 0;
      var len = (major ? 15 : (mid ? 9 : 5)) * u;
      var a = d * PI / 180, sx = Math.sin(a), sy = -Math.cos(a);
      ctx.strokeStyle = major ? C.tickMajor : C.tick;
      ctx.lineWidth = (major ? 1.7 : 1) * u * lw;
      ctx.beginPath();
      ctx.moveTo(cx + sx * R, cy + sy * R);
      ctx.lineTo(cx + sx * (R + len), cy + sy * (R + len));
      ctx.stroke();
      if (!major) continue;
      var rr = R + len + 12 * u, tx = cx + sx * rr, ty = cy + sy * rr;
      if (d === 0) ty -= 3 * u;
      if (this.inHeader(tx, ty)) continue;
      var card = d % 90 === 0;
      ctx.fillStyle = card ? C.placeMajor : C.tickLabel;
      ctx.font = this.font(card ? 17 : 13, card ? '600' : '');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      this.label(card ? 'NESW'.charAt(d / 90) : pad2(d / 10), tx, ty, 4);
      if (card) this._avoid.push([tx - 12 * u, ty - 12 * u, 24 * u, 24 * u]);
    }
    // north arrow: solid arrowhead on the 000 tick
    ctx.fillStyle = C.tickMajor;
    ctx.beginPath();
    ctx.moveTo(cx, cy - R - 20 * u);
    ctx.lineTo(cx + 6 * u, cy - R - 5 * u);
    ctx.lineTo(cx - 6 * u, cy - R - 5 * u);
    ctx.closePath();
    ctx.fill();
  };

  Radar.prototype.drawBase = function () {
    var ctx = this.ctx, u = this.unit, self = this, show = this.show, lw = C.lw;
    this._avoid = [];
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, this.w, this.h);

    // land: a lighter tone around home, fading out towards the screen edges
    var grd = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, this.ringPx * 1.9);
    grd.addColorStop(0, C.land[0]);
    grd.addColorStop(1, C.land[1]);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, this.w, this.h);

    // water: rivers and coasts at least 2.5 / 2 px at 1080p, the Elbe at its real width
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = C.water;
    MA.features.water.forEach(function (wtr) {
      var pts = wtr.pts, minW = (wtr.kind === 'coast' ? 2 : 2.5) * u * lw;
      for (var i = 0; i < pts.length - 1 + (wtr.closed ? 1 : 0); i++) {
        var a = pts[i], b = pts[(i + 1) % pts.length];
        var p1 = self.project(a[0], a[1]), p2 = self.project(b[0], b[1]);
        ctx.lineWidth = Math.max(minW, (a[2] + b[2]) / 2 * 0.8 * self.pxPerKm);
        ctx.beginPath();
        ctx.moveTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.stroke();
      }
      if (wtr.closed) {
        ctx.fillStyle = C.water;
        ctx.beginPath();
        pts.forEach(function (p, i) {
          var q = self.project(p[0], p[1]);
          if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]);
        });
        ctx.closePath();
        ctx.fill();
      }
    });

    // range rings, labelled at 45 degrees below the east axis (clear of header and traffic labels)
    if (show.rings !== false) {
      var step = this.niceStep(), maxKm = this.coverKm();
      ctx.font = this.font(14);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      for (var km = step; km <= maxKm; km += step) {
        var r = km * this.pxPerKm;
        var main = Math.abs(km - this.cfg.radiusKm) < 0.01;
        ctx.strokeStyle = main ? C.ringMain : C.ring;
        ctx.lineWidth = (main ? 1.6 : 1) * u * lw;
        if (ctx.setLineDash) ctx.setLineDash(km > this.cfg.radiusKm ? [2 * u, 8 * u] : (main ? [] : [10 * u, 6 * u]));
        ctx.beginPath();
        ctx.arc(this.cx, this.cy, r, 0, PI * 2);
        ctx.stroke();
        var lx = this.cx + Math.cos(PI / 4) * r + 6 * u, ly = this.cy + Math.sin(PI / 4) * r;
        if (lx < this.w - 80 * u && ly < this.areaBottom - 12 * u) {
          if (ctx.setLineDash) ctx.setLineDash([]);
          ctx.fillStyle = C.ringLabel;
          this.label(String(km).replace('.', ',') + ' km', lx, ly);
        }
      }
      if (ctx.setLineDash) ctx.setLineDash([]);
      // the main ring (your radius) is always drawn: it is the base of the compass rose
      ctx.strokeStyle = C.ringMain;
      ctx.lineWidth = 1.6 * u * lw;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, this.ringPx, 0, PI * 2);
      ctx.stroke();
    }

    if (show.compass !== false) this.drawRose();

    // places: dot and name, major towns larger and brighter
    if (show.places !== false) {
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      MA.features.places.forEach(function (p) {
        var q = self.project(p.lat, p.lon);
        if (q[0] < 0 || q[0] > self.w || q[1] < 0 || q[1] > self.areaBottom + self.h * 0.1) return;
        if (self.inHeader(q[0], q[1])) return;
        var hit = false;
        self._avoid.forEach(function (r) { if (q[0] > r[0] - 60 * u && q[0] < r[0] + r[2] + 10 * u && Math.abs(q[1] - (r[1] + r[3] / 2)) < 12 * u) hit = true; });
        if (hit) return;
        if (Math.abs(q[0] - self.cx) < 70 * u && Math.abs(q[1] - self.cy) < 16 * u) return; // keep home marker clear
        ctx.fillStyle = C.placeDot;
        ctx.beginPath();
        ctx.arc(q[0], q[1], (p.major ? 3 : 2.2) * u, 0, PI * 2);
        ctx.fill();
        ctx.fillStyle = p.major ? C.placeMajor : C.place;
        ctx.font = self.font(p.major ? 17 : 14, p.major ? '500' : '');
        var nm = p.name.toUpperCase().split('').join(String.fromCharCode(8202));
        self.label(nm, q[0] + 8 * u, q[1]);
        self._avoid.push([q[0], q[1] - 9 * u, ctx.measureText(nm).width + 10 * u, 18 * u]);
      });
    }

    // airports: approach centrelines, runways with thresholds and designators, reference symbol, ICAO code
    MA.features.airports.forEach(function (ap) {
      var rws = ap.runways.map(function (rw) {
        return { rw: rw, p1: self.project(rw.a[0], rw.a[1]), p2: self.project(rw.b[0], rw.b[1]) };
      });
      rws.forEach(function (r) {
        // runway ends a/b; centrelines extend 18 km beyond each end
        var rw = r.rw, hdg = MA.geo.bearing(rw.a[0], rw.a[1], rw.b[0], rw.b[1]);
        var c1 = MA.geo.dest(rw.b[0], rw.b[1], hdg, 18), c2 = MA.geo.dest(rw.a[0], rw.a[1], hdg + 180, 18);
        var q1 = self.project(c1[0], c1[1]), q2 = self.project(c2[0], c2[1]);
        ctx.lineWidth = 1.4 * u * lw;
        ctx.lineCap = 'butt';
        if (ctx.setLineDash) ctx.setLineDash([6 * u, 6 * u]);
        // centrelines fade out with distance from the runway end
        [[r.p2, q1], [r.p1, q2]].forEach(function (seg) {
          ctx.strokeStyle = fadeLine(ctx, C.centerline, seg[0], seg[1]);
          ctx.beginPath();
          ctx.moveTo(seg[0][0], seg[0][1]); ctx.lineTo(seg[1][0], seg[1][1]);
          ctx.stroke();
        });
        if (ctx.setLineDash) ctx.setLineDash([]);
      });
      rws.forEach(function (r) {
        var wpx = Math.max(5 * u, 0.06 * self.pxPerKm);
        ctx.strokeStyle = C.runway;
        ctx.lineWidth = wpx;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(r.p1[0], r.p1[1]); ctx.lineTo(r.p2[0], r.p2[1]);
        ctx.stroke();
        // threshold bars across both ends
        var dx = r.p2[0] - r.p1[0], dy = r.p2[1] - r.p1[1], l = Math.sqrt(dx * dx + dy * dy) || 1;
        var nx = -dy / l * (wpx / 2 + 3.5 * u), ny = dx / l * (wpx / 2 + 3.5 * u);
        ctx.lineWidth = 1.6 * u * lw;
        [r.p1, r.p2].forEach(function (p) {
          ctx.beginPath();
          ctx.moveTo(p[0] - nx, p[1] - ny); ctx.lineTo(p[0] + nx, p[1] + ny);
          ctx.stroke();
        });
        // designators ("05" at end a, "23" at end b), rotated along the runway
        var ids = r.rw.id.split('/');
        if (l > 22 * u && ids.length === 2) {
          ctx.fillStyle = C.placeMajor;
          ctx.font = self.font(14, '600');
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          var da = self.desig(r.p1, r.p2.map(function (v, i) { return 2 * r.p1[i] - v; }));
          var db = self.desig(r.p2, r.p1.map(function (v, i) { return 2 * r.p2[i] - v; }));
          self.alongText(ids[0], da.x, da.y, da.ang);
          self.alongText(ids[1], db.x, db.y, db.ang);
        }
      });
      // reference symbol: circle with the runway directions crossing it
      var a = self.project(ap.lat, ap.lon);
      ctx.strokeStyle = C.airport;
      ctx.lineWidth = 1.6 * u * lw;
      ctx.beginPath();
      ctx.arc(a[0], a[1], 8 * u, 0, PI * 2);
      ctx.stroke();
      rws.forEach(function (r) {
        var dx = r.p2[0] - r.p1[0], dy = r.p2[1] - r.p1[1], l = Math.sqrt(dx * dx + dy * dy) || 1;
        ctx.beginPath();
        ctx.moveTo(a[0] - dx / l * 13 * u, a[1] - dy / l * 13 * u);
        ctx.lineTo(a[0] + dx / l * 13 * u, a[1] + dy / l * 13 * u);
        ctx.stroke();
      });
      ctx.fillStyle = C.airport;
      ctx.font = self.font(16, '600');
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      self.label(ap.icao || ap.code, a[0] + 13 * u, a[1] + 18 * u);
    });
  };

  // Cache static layers in an offscreen canvas (per size and theme).
  Radar.prototype.base = function () {
    var key = this.w + 'x' + this.h + ':' + this.theme;
    if (this._baseKey === key && this._base) return this._base;
    var off = document.createElement('canvas');
    off.width = this.canvas.width;
    off.height = this.canvas.height;
    var real = this.ctx;
    this.ctx = off.getContext('2d');
    this.ctx.setTransform(this.canvas.width / this.w, 0, 0, this.canvas.height / this.h, 0, 0);
    this.drawBase();
    this.ctx = real;
    this._base = off;
    this._baseKey = key;
    return off;
  };

  // 'rgba(r, g, b, a)' string -> gradient from p (full) to q (transparent)
  function fadeLine(ctx, css, p, q) {
    var m = css.match(/[\d.]+/g);
    var g = ctx.createLinearGradient(p[0], p[1], q[0], q[1]);
    g.addColorStop(0, 'rgba(' + m[0] + ',' + m[1] + ',' + m[2] + ',' + m[3] + ')');
    g.addColorStop(1, 'rgba(' + m[0] + ',' + m[1] + ',' + m[2] + ',0)');
    return g;
  }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')'; }

  /* Position symbol. shape: chevron | diamond | triangle | arrow | square; `fill` for the selected target. */
  Radar.prototype.drawSymbol = function (shape, x, y, hdg, s, color, fill, rotor) {
    var ctx = this.ctx, u = this.unit, lw = C.lw;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (rotor) {                                  // helicopters: ring with centre dot
      ctx.lineWidth = 1.6 * u * lw;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.3, 0, PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.8, 0, PI * 2);
      ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.rotate((hdg || 0) * PI / 180);
    ctx.lineWidth = 1.7 * u * lw;
    ctx.beginPath();
    if (shape === 'diamond') {
      ctx.moveTo(0, -s); ctx.lineTo(s * 0.75, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.75, 0); ctx.closePath();
      if (fill) ctx.fill(); else ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0, -s * 2.1); ctx.stroke();      // track vector
    } else if (shape === 'triangle') {
      ctx.moveTo(0, -s); ctx.lineTo(s * 0.8, s * 0.8); ctx.lineTo(-s * 0.8, s * 0.8); ctx.closePath();
      if (fill) ctx.fill(); else ctx.stroke();
    } else if (shape === 'arrow') {
      ctx.moveTo(0, -s * 1.1); ctx.lineTo(s * 0.75, s * 0.9); ctx.lineTo(0, s * 0.4); ctx.lineTo(-s * 0.75, s * 0.9); ctx.closePath();
      ctx.fill();
    } else if (shape === 'square') {
      ctx.rect(-s * 0.7, -s * 0.7, s * 1.4, s * 1.4);
      if (fill) ctx.fill(); else ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -s * 0.7); ctx.lineTo(0, -s * 1.9); ctx.stroke();
    } else {                                      // chevron: open V with a centre dot
      ctx.lineWidth = 2.2 * u * lw;
      ctx.moveTo(-s * 0.85, s * 0.8); ctx.lineTo(0, -s * 0.85); ctx.lineTo(s * 0.85, s * 0.8);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(0, s * 0.1, 1.3 * u, 0, PI * 2); ctx.fill();
    }
    ctx.restore();
  };

  // Frame (corner brackets) around a special aircraft: discreet, no glow.
  Radar.prototype.drawBrackets = function (x, y, h, color, width) {
    var ctx = this.ctx, k = h * 0.55;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (c) {
      ctx.moveTo(x + c[0] * h, y + c[1] * (h - k));
      ctx.lineTo(x + c[0] * h, y + c[1] * h);
      ctx.lineTo(x + c[0] * (h - k), y + c[1] * h);
    });
    ctx.stroke();
  };

  /* Runways in use (js/weather.js): the approach centreline on the arrival side, brighter
     than the base one and fading out from the threshold, in the accent colour ("active").
     Drawn per frame over the cached base; `rev` follows the base's drawing direction so the
     dashes line up. Wind-only estimates are dimmer. The designator is redrawn in the accent. */
  Radar.prototype.drawActive = function (list) {
    var ctx = this.ctx, u = this.unit;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var p = this.project(r.thr[0], r.thr[1]), q = this.project(r.far[0], r.far[1]);
      var grd = ctx.createLinearGradient(p[0], p[1], q[0], q[1]);
      grd.addColorStop(0, rgba(C.accent, C.active[r.est ? 1 : 0]));
      grd.addColorStop(1, rgba(C.accent, 0.04));
      ctx.strokeStyle = grd;
      ctx.lineWidth = 2.4 * u * C.lw;
      ctx.lineCap = 'butt';
      if (ctx.setLineDash) ctx.setLineDash([6 * u, 6 * u]);
      ctx.beginPath();
      if (r.rev) { ctx.moveTo(q[0], q[1]); ctx.lineTo(p[0], p[1]); } else { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
      ctx.stroke();
      if (ctx.setLineDash) ctx.setLineDash([]);
      if (r.end && this.show.rings !== false) {
        var d = this.desig(p, q);
        ctx.fillStyle = rgba(C.accent, 1);
        ctx.font = this.font(14, '600');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        this.alongText(r.end, d.x, d.y, d.ang);
      }
    }
    if (ctx.setLineDash) ctx.setLineDash([]);
  };

  // Aircraft on the ground at airports: small hollow squares with a heading tick.
  Radar.prototype.drawGround = function (list) {
    var ctx = this.ctx, u = this.unit;
    ctx.save();
    ctx.strokeStyle = rgba(C.level, 0.6);
    ctx.lineWidth = 1.3 * u * C.lw;
    for (var i = 0; i < list.length; i++) {
      var g = list[i], p = this.project(g.lat, g.lon);
      if (p[0] < 0 || p[1] < 0 || p[0] > this.w || p[1] > this.h) continue;
      var s = 3.6 * u;
      ctx.strokeRect(p[0] - s, p[1] - s, s * 2, s * 2);
      if (typeof g.track === 'number' && g.gs > 3) {
        var r = g.track * PI / 180;
        ctx.beginPath();
        ctx.moveTo(p[0] + Math.sin(r) * s, p[1] - Math.cos(r) * s);
        ctx.lineTo(p[0] + Math.sin(r) * s * 3, p[1] - Math.cos(r) * s * 3);
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  /* ---------- data blocks ---------- */

  // Lines of segments [[text, role]]: callsign / FL arrow gs / type / route / reg, order from cfg.fields.
  Radar.prototype.blockLines = function (ac, phase) {
    var f = MA.fmt, cfg = this.cfg, lines = [], last = null;
    var arrow = phase === 'up' ? '↑' : (phase === 'down' ? '↓' : '');
    cfg.fields.forEach(function (k) {
      var seg = null, merge = false;
      if (k === 'callsign') seg = [[ac.callsign || ac.reg || ac.hex.toUpperCase(), 'main']];
      else if (k === 'fl') {
        var a = f.altShort(ac.alt, cfg.units);
        if (a) { seg = [[a, 'val']]; if (arrow) seg.push([arrow, 'val']); merge = true; }
      } else if (k === 'gs') {
        if (typeof ac.gs === 'number') { var s = f.speed(ac.gs, cfg.speedUnit); seg = [[s.val, 'val'], [s.unit, 'unit']]; merge = true; }
      } else if (k === 'type') { if (ac.type) seg = [[ac.type, 'unit']]; }
      else if (k === 'reg') { if (ac.reg) seg = [[ac.reg, 'unit']]; }
      else if (k === 'route') {
        var leg = MA.data && MA.data.leg ? MA.data.leg(ac) : null;
        if (leg) seg = [[leg[0].code + '-' + leg[1].code, 'unit']];
      }
      if (!seg) return;
      if (merge && last && last.merge) {
        last.segs.push([' ', 'unit']);
        last.segs = last.segs.concat(seg);
      } else {
        last = { segs: seg, merge: merge };
        lines.push(last);
      }
    });
    if (ac.special) lines.push({ segs: [[ac.special.label, 'special']] });
    return lines;
  };

  Radar.prototype.measureBlock = function (lines, big) {
    var ctx = this.ctx, u = this.unit, w = 0, wt = String(C.weight);
    var fm = this.font(big ? 21 : 18, wt), fd = this.font(big ? 17 : 15, '');
    lines.forEach(function (ln, i) {
      var tw = 0;
      ln.segs.forEach(function (sg) {
        ctx.font = sg[1] === 'main' || sg[1] === 'special' ? fm : fd;
        sg.w = ctx.measureText(sg[0]).width;
        tw += sg.w;
      });
      ln.w = tw;
      if (tw > w) w = tw;
    });
    var lh = (big ? 23 : 19.5) * u;
    return { w: w, h: lines.length * lh, lh: lh, fm: fm, fd: fd };
  };

  function overlap(a, b) {
    var x = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
    var y = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
    return x > 0 && y > 0 ? x * y : 0;
  }

  // Four leader directions; keep the old one while it is free, else take the least crowded.
  var QUADS = [[1, -1], [1, 1], [-1, -1], [-1, 1]];
  Radar.prototype.placeBlock = function (it, m, placed, pts) {
    var u = this.unit, self = this, best = 0, bestScore = 1e12;
    function rectFor(q) {
      var sx = QUADS[q][0], sy = QUADS[q][1], ex = it.p[0] + sx * 15 * u, ey = it.p[1] + sy * 15 * u, pd = 4 * u;
      var x0 = sx > 0 ? ex + pd : ex - pd - m.w, y0 = sy < 0 ? ey - m.h + 5 * u : ey - 5 * u;
      return { ex: ex, ey: ey, rect: [x0 - 3 * u, y0 - 2 * u, m.w + 6 * u, m.h + 4 * u], x0: x0, y0: y0, sx: sx, sy: sy };
    }
    function score(r, q) {
      var s = q * 0.5, i;
      for (i = 0; i < placed.length; i++) s += overlap(r.rect, placed[i]) * 4;
      var av = self._avoid || [];
      for (i = 0; i < av.length; i++) s += overlap(r.rect, av[i]) * 3;
      for (i = 0; i < pts.length; i++) {
        if (pts[i] === it.p) continue;
        s += overlap(r.rect, [pts[i][0] - 9 * u, pts[i][1] - 9 * u, 18 * u, 18 * u]) * 6;
      }
      if (r.rect[0] < 4 * u || r.rect[0] + r.rect[2] > self.w - 4 * u || r.rect[1] < 4 * u ||
        r.rect[1] + r.rect[3] > self.areaBottom + self.h * 0.02) s += 5000;
      var hd = self.headerRects();
      for (i = 0; i < hd.length; i++) if (overlap(r.rect, hd[i])) s += 2500;
      return s;
    }
    function clamp(r) {
      var dx = Math.max(4 * u - r.rect[0], 0) - Math.max(r.rect[0] + r.rect[2] - (self.w - 4 * u), 0);
      var dy = Math.max(4 * u - r.rect[1], 0);
      r.rect[0] += dx; r.rect[1] += dy; r.x0 += dx; r.y0 += dy;
      // never on top of the header texts: slide down below them, the leader line follows
      var hd = self.headerRects();
      for (var i = 0; i < hd.length; i++) {
        if (!overlap(r.rect, hd[i])) continue;
        var d2 = hd[i][1] + hd[i][3] + 4 * u - r.rect[1];
        r.rect[1] += d2; r.y0 += d2;
      }
      var lim = self.areaBottom - r.rect[3];
      if (r.rect[1] > lim) { var d3 = lim - r.rect[1]; r.rect[1] += d3; r.y0 += d3; }
      r.ey = Math.min(Math.max(r.ey, r.rect[1] + 6 * u), r.rect[1] + r.rect[3] - 6 * u);
      return r;
    }
    var cur = it.ac._q || 0, curR = rectFor(cur), curS = score(curR, 0);
    curR.bad = false;
    if (curS < 1) return curR;
    var out = curR;
    for (var q = 0; q < 4; q++) {
      var r = rectFor(q), sc = score(r, q === cur ? 0 : 1);
      if (sc < bestScore) { bestScore = sc; best = q; out = r; }
    }
    it.ac._q = best;
    out.bad = bestScore >= 2000;   // would sit on the header or off screen
    return clamp(out);
  };

  Radar.prototype.drawBlock = function (it, m, r, now) {
    var ctx = this.ctx, u = this.unit, lw = C.lw, ac = it.ac;
    var col = it.sp ? rgba(it.spCol, 1) : (it.featured ? rgba(C.target, 1) : (it.high ? C.labelDim : C.label));
    // leader line
    var dx = r.ex - it.p[0], dy = r.ey - it.p[1], l = Math.sqrt(dx * dx + dy * dy), k = (it.size * 1.3) / l;
    ctx.strokeStyle = it.featured ? rgba(C.target, 0.75) : (it.sp ? rgba(it.spCol, 0.8) : rgba(C.level, it.high ? 0.35 : 0.5));
    ctx.lineWidth = 1.1 * u * lw;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(it.p[0] + dx * k, it.p[1] + dy * k);
    ctx.lineTo(r.ex, r.ey);
    ctx.lineTo(r.ex + r.sx * 3.5 * u, r.ey);
    ctx.stroke();
    if (it.featured) {   // selected track: thin frame around its block
      ctx.strokeStyle = rgba(C.target, 0.8);
      ctx.lineWidth = 1.2 * u * lw;
      ctx.strokeRect(r.rect[0] + 0.5, r.rect[1] + 0.5, r.rect[2], r.rect[3]);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    var y = r.y0 + m.lh * 0.78;
    for (var i = 0; i < it.lines.length; i++) {
      var ln = it.lines[i], x = r.x0;
      if (r.sx < 0) x = r.x0 + (m.w - ln.w);   // right-aligned when the block sits left of the symbol
      for (var j = 0; j < ln.segs.length; j++) {
        var sg = ln.segs[j], main = sg[1] === 'main', spl = sg[1] === 'special';
        ctx.font = main || spl ? m.fm : m.fd;
        ctx.fillStyle = spl ? rgba(it.spCol, 1) : (main ? col : (sg[1] === 'val' ? (it.high && !it.featured ? C.detailDim : C.detail) : C.detailDim));
        ctx.lineWidth = 3.5 * u;
        ctx.strokeStyle = C.halo;
        ctx.strokeText(sg[0], x, y);
        ctx.fillText(sg[0], x, y);
        x += sg.w;
      }
      y += m.lh;
    }
  };

  /* list: aircraft with display position (dlat/dlon), trail, dist; featured: hex;
     active: runways in use from MA.weather.active() (optional) */
  Radar.prototype.render = function (list, featuredHex, now, active, ground) {
    var ctx = this.ctx, u = this.unit, self = this, show = this.show, lw = C.lw;
    ctx.drawImage(this.base(), 0, 0, this.w, this.h);
    if (this._prev) {
      // theme switch: crossfade the old base layer out
      var fade = 1 - (now - this._fadeAt) / (MA.theme ? MA.theme.fadeMs : 1500);
      if (fade > 0) {
        ctx.globalAlpha = fade;
        ctx.drawImage(this._prev, 0, 0, this.w, this.h);
        ctx.globalAlpha = 1;
      } else this._prev = null;
    }
    if (active && active.length) this.drawActive(active);
    if (show.ground !== false && ground && ground.length) this.drawGround(ground);

    // home: static reference symbol (circle, cross hairs, centre dot)
    ctx.strokeStyle = C.home;
    ctx.fillStyle = C.home;
    ctx.lineWidth = 1.5 * u * lw;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, 7 * u, 0, PI * 2);
    ctx.moveTo(this.cx - 14 * u, this.cy); ctx.lineTo(this.cx - 4 * u, this.cy);
    ctx.moveTo(this.cx + 4 * u, this.cy); ctx.lineTo(this.cx + 14 * u, this.cy);
    ctx.moveTo(this.cx, this.cy - 14 * u); ctx.lineTo(this.cx, this.cy - 4 * u);
    ctx.moveTo(this.cx, this.cy + 4 * u); ctx.lineTo(this.cx, this.cy + 14 * u);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, 2 * u, 0, PI * 2);
    ctx.fill();

    var blink = 0.6 + 0.4 * Math.sin(now * PI / 500);      // emergency squawk: slow blink
    var items = [], pts = [];

    // high traffic first so low (interesting) traffic draws on top
    var sorted = list.slice().sort(function (a, b) { return (b.alt || 0) - (a.alt || 0); });

    sorted.forEach(function (ac) {
      var phase = MA.fmt.phase(ac);
      var high = (ac.alt || 0) > 20000;
      var featured = ac.hex === featuredHex;
      var sp = ac.special, spCol = sp ? (sp.alert ? C.alert : C.special) : null;
      var baseA = (featured || sp) ? 1 : (high ? C.high : 1);
      var col = featured ? C.target : C.level;

      // history: dots every 15 s (ATC) or a thin fading line, ends at the symbol
      var tr = ac.trail;
      if (tr.length && show.trails !== false) {
        var maxAge = self.cfg.trailMin * 60000 || 1, i;
        if (C.trail === 'dots') {
          for (i = 0; i < tr.length; i++) {
            if (i && Math.floor(tr[i][2] / 15000) === Math.floor(tr[i - 1][2] / 15000)) continue;
            var fresh = Math.max(0, 1 - (now - tr[i][2]) / maxAge);
            var q = self.project(tr[i][0], tr[i][1]);
            ctx.fillStyle = rgba(col, (0.25 + 0.65 * fresh) * baseA);
            ctx.beginPath();
            ctx.arc(q[0], q[1], (1.1 + 1.1 * fresh) * u * lw, 0, PI * 2);
            ctx.fill();
          }
        } else {
          var cur = self.project(ac.dlat, ac.dlon), head = 1.6 * u * lw;
          ctx.lineCap = 'round';
          // samples are joined by quadratic curves through segment midpoints: no visible corners
          var pp = [];
          for (i = 0; i < tr.length; i++) pp.push(self.project(tr[i][0], tr[i][1]));
          pp.push(cur);
          var last = pp.length - 1;
          for (i = 0; i < last; i++) {
            var a = i === 0 ? pp[0] : [(pp[i - 1][0] + pp[i][0]) / 2, (pp[i - 1][1] + pp[i][1]) / 2];
            var b = i === last - 1 ? pp[last] : [(pp[i][0] + pp[i + 1][0]) / 2, (pp[i][1] + pp[i + 1][1]) / 2];
            var fr = Math.max(0, 1 - (now - tr[i][2]) / maxAge);
            ctx.lineWidth = Math.max(0.6 * u, head * (0.35 + 0.65 * fr));
            ctx.strokeStyle = rgba(col, 0.8 * Math.pow(fr, 1.5) * baseA);
            ctx.beginPath();
            ctx.moveTo(a[0], a[1]);
            ctx.quadraticCurveTo(pp[i][0], pp[i][1], b[0], b[1]);
            ctx.stroke();
          }
        }
      }

      var p = self.project(ac.dlat, ac.dlon);
      var size = (high ? 7 : 9) * u * (featured ? 1.2 : 1);
      var rotor = MA.fmt.isRotorcraft(ac);

      if (featured) {
        // range / bearing line to home with its readout
        ctx.strokeStyle = rgba(C.target, 0.4);
        ctx.lineWidth = 1 * u * lw;
        if (ctx.setLineDash) ctx.setLineDash([2 * u, 5 * u]);
        ctx.beginPath();
        ctx.moveTo(self.cx, self.cy);
        ctx.lineTo(p[0], p[1]);
        ctx.stroke();
        if (ctx.setLineDash) ctx.setLineDash([]);
        if (show.compass !== false && typeof ac.brg === 'number') {   // bearing marker on the rose
          var ba = ac.brg * PI / 180, bx = self.cx + Math.sin(ba) * self.ringPx, by = self.cy - Math.cos(ba) * self.ringPx;
          ctx.save();
          ctx.translate(bx, by);
          ctx.rotate(ba);
          ctx.fillStyle = rgba(C.target, 1);
          ctx.beginPath();
          ctx.moveTo(0, 0); ctx.lineTo(5.5 * u, -12 * u); ctx.lineTo(-5.5 * u, -12 * u);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
      if (sp) self.drawBrackets(p[0], p[1], size * 1.9, rgba(spCol, sp.alert ? blink : 1), 1.6 * u * lw);

      var fill = featured || (C.symbol === 'diamond' && !high) || !!sp;
      self.drawSymbol(C.symbol, p[0], p[1], ac.track, size, rgba(sp ? spCol : col, baseA), fill, rotor);

      var onScreen = p[0] > 0 && p[0] < self.w && p[1] > 0 && p[1] < self.areaBottom + self.h * 0.02;
      if ((self.cfg.labels || featured) && onScreen) {
        var lines = self.blockLines(ac, phase);
        if (lines.length) items.push({ ac: ac, p: p, size: size, high: high, featured: featured, sp: sp, spCol: spCol, lines: lines });
      }
      pts.push(p);
    });

    // data blocks: the selected aircraft claims its spot first, then nearest first
    var order = items.slice().sort(function (a, b) {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      return (a.ac.dist || 0) - (b.ac.dist || 0);
    });
    var placed = [];
    order.forEach(function (it) {
      var m = self.measureBlock(it.lines, it.featured);
      var r = self.placeBlock(it, m, placed, pts);
      if (r.bad && !it.featured) { it.skip = true; return; }   // no room: the symbol stays, the block is left out
      placed.push(r.rect);
      it.m = m; it.r = r;
    });
    items.forEach(function (it) { if (!it.skip) self.drawBlock(it, it.m, it.r, now); });

    // range readout of the selected aircraft, on its line to home
    items.forEach(function (it) {
      if (!it.featured || typeof it.ac.dist !== 'number') return;
      var mx = (self.cx + it.p[0]) / 2, my = (self.cy + it.p[1]) / 2;
      if (Math.abs(it.p[0] - self.cx) + Math.abs(it.p[1] - self.cy) < 90 * u) return;
      ctx.font = self.font(13, '');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = rgba(C.target, 1);
      self.label(('00' + Math.round(it.ac.brg) % 360).slice(-3) + '° ' + MA.fmt.km(it.ac.dist) + ' km', mx, my - 9 * u, 3.5);
    });
  };

  MA.Radar = Radar;
})(window.MA);
