/* Canvas renderer: dark radar map centred on home. */
(function (MA) {
  var C = {
    bg: '#050607',
    water: '#121c23',
    ring: 'rgba(255, 255, 255, 0.07)',
    ringMain: 'rgba(255, 255, 255, 0.13)',
    ringLabel: 'rgba(255, 255, 255, 0.22)',
    place: 'rgba(255, 255, 255, 0.20)',
    placeMajor: 'rgba(255, 255, 255, 0.30)',
    runway: 'rgba(233, 228, 216, 0.55)',
    centerline: 'rgba(233, 228, 216, 0.10)',
    airport: 'rgba(233, 228, 216, 0.45)',
    home: '#e9e4d8',
    up: [255, 181, 71],
    down: [99, 211, 232],
    level: [233, 228, 216],
    label: 'rgba(233, 228, 216, 0.78)',
    labelDim: 'rgba(233, 228, 216, 0.45)'
  };
  var MONO = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';

  function Radar(canvas, cfg) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cfg = cfg;
    this.cosLat = Math.cos(cfg.lat * Math.PI / 180);
    this.resize();
  }

  Radar.prototype.resize = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w;
    this.h = h;
    // radar area: everything above the LED board (bottom ~22% of the screen)
    var areaBottom = h * 0.765;
    this.cx = w / 2;
    this.cy = areaBottom / 2 + h * 0.015;
    this.ringPx = areaBottom / 2 - h * 0.04;
    this.pxPerKm = this.ringPx / this.cfg.radiusKm;
    this.unit = h / 1080; // base size unit, 1 at Full HD
    this._base = null;
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

  Radar.prototype.drawBase = function () {
    var ctx = this.ctx, u = this.unit, self = this;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, this.w, this.h);

    // soft centre glow
    var grd = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, this.ringPx * 1.6);
    grd.addColorStop(0, 'rgba(255, 255, 255, 0.035)');
    grd.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, this.w, this.h);

    // water
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = C.water;
    MA.features.water.forEach(function (wtr) {
      var pts = wtr.pts;
      for (var i = 0; i < pts.length - 1 + (wtr.closed ? 1 : 0); i++) {
        var a = pts[i], b = pts[(i + 1) % pts.length];
        var p1 = self.project(a[0], a[1]), p2 = self.project(b[0], b[1]);
        ctx.lineWidth = Math.max(1.5 * u, (a[2] + b[2]) / 2 * 0.7 * self.pxPerKm);
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

    // range rings
    var step = this.niceStep();
    var maxKm = this.coverKm();
    ctx.lineWidth = 1;
    ctx.font = Math.round(12 * u) + 'px ' + MONO;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (var km = step; km <= maxKm; km += step) {
      var r = km * this.pxPerKm;
      var main = Math.abs(km - this.cfg.radiusKm) < 0.01;
      ctx.strokeStyle = main ? C.ringMain : C.ring;
      if (ctx.setLineDash) ctx.setLineDash(km > this.cfg.radiusKm ? [2 * u, 8 * u] : []);
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, r, 0, Math.PI * 2);
      ctx.stroke();
      var a = -Math.PI / 4;
      var lx = this.cx + Math.cos(a) * r + 6 * u, ly = this.cy + Math.sin(a) * r;
      if (lx < this.w - 60 * u && ly > 0) {
        ctx.fillStyle = C.ringLabel;
        ctx.fillText(String(km).replace('.', ',') + ' km', lx, ly);
      }
    }
    if (ctx.setLineDash) ctx.setLineDash([]);

    // north tick
    ctx.strokeStyle = C.ringMain;
    ctx.beginPath();
    ctx.moveTo(this.cx, this.cy - this.ringPx - 10 * u);
    ctx.lineTo(this.cx, this.cy - this.ringPx + 6 * u);
    ctx.stroke();
    ctx.fillStyle = C.ringLabel;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('N', this.cx, this.cy - this.ringPx - 14 * u);

    // places
    if (this.cfg.places) {
      ctx.textBaseline = 'middle';
      MA.features.places.forEach(function (p) {
        var q = self.project(p.lat, p.lon);
        if (q[0] < 0 || q[0] > self.w || q[1] < 0 || q[1] > self.h) return;
        if (Math.abs(q[0] - self.cx) < 60 * u && Math.abs(q[1] - self.cy) < 14 * u) return; // keep home marker clear
        ctx.fillStyle = p.major ? C.placeMajor : C.place;
        ctx.font = Math.round((p.major ? 14 : 12) * u) + 'px ' + MONO;
        ctx.fillText(p.name.toUpperCase().split('').join(String.fromCharCode(8202)), q[0], q[1]);
      });
    }

    // airports: extended centrelines (the approach paths), runways, code
    MA.features.airports.forEach(function (ap) {
      ap.runways.forEach(function (rw) {
        var half = rw.len / 2000;
        var e1 = MA.geo.dest(rw.lat, rw.lon, rw.hdg, half), e2 = MA.geo.dest(rw.lat, rw.lon, rw.hdg + 180, half);
        var c1 = MA.geo.dest(rw.lat, rw.lon, rw.hdg, half + 18), c2 = MA.geo.dest(rw.lat, rw.lon, rw.hdg + 180, half + 18);
        var p1 = self.project(e1[0], e1[1]), p2 = self.project(e2[0], e2[1]);
        var q1 = self.project(c1[0], c1[1]), q2 = self.project(c2[0], c2[1]);
        ctx.strokeStyle = C.centerline;
        ctx.lineWidth = 1;
        if (ctx.setLineDash) ctx.setLineDash([6 * u, 6 * u]);
        ctx.beginPath();
        ctx.moveTo(q1[0], q1[1]); ctx.lineTo(p1[0], p1[1]);
        ctx.moveTo(p2[0], p2[1]); ctx.lineTo(q2[0], q2[1]);
        ctx.stroke();
        if (ctx.setLineDash) ctx.setLineDash([]);
        ctx.strokeStyle = C.runway;
        ctx.lineWidth = Math.max(2.5 * u, 0.06 * self.pxPerKm);
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]);
        ctx.stroke();
      });
      var a = self.project(ap.lat, ap.lon);
      ctx.fillStyle = C.airport;
      ctx.font = '500 ' + Math.round(13 * u) + 'px ' + MONO;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(ap.code, a[0] + 2 * self.pxPerKm, a[1] + 1.2 * self.pxPerKm);
    });
  };

  // Cache static layers in an offscreen canvas.
  Radar.prototype.base = function () {
    if (this._baseKey === this.w + 'x' + this.h && this._base) return this._base;
    var off = document.createElement('canvas');
    off.width = this.canvas.width;
    off.height = this.canvas.height;
    var real = this.ctx;
    this.ctx = off.getContext('2d');
    this.ctx.setTransform(this.canvas.width / this.w, 0, 0, this.canvas.height / this.h, 0, 0);
    this.drawBase();
    this.ctx = real;
    this._base = off;
    this._baseKey = this.w + 'x' + this.h;
    return off;
  };

  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')'; }

  Radar.prototype.drawPlane = function (x, y, hdg, size, color, rotor) {
    var ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    if (rotor) {
      ctx.lineWidth = 1.5 * this.unit;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.75, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.rotate((hdg || 0) * Math.PI / 180);
    var s = size;
    ctx.beginPath();
    ctx.moveTo(0, -s);                 // nose
    ctx.lineTo(s * 0.12, -s * 0.55);
    ctx.lineTo(s * 0.12, -s * 0.18);
    ctx.lineTo(s * 0.95, s * 0.22);    // right wing
    ctx.lineTo(s * 0.95, s * 0.36);
    ctx.lineTo(s * 0.12, s * 0.16);
    ctx.lineTo(s * 0.1, s * 0.66);
    ctx.lineTo(s * 0.38, s * 0.86);    // tail
    ctx.lineTo(s * 0.38, s * 0.98);
    ctx.lineTo(0, s * 0.88);
    ctx.lineTo(-s * 0.38, s * 0.98);
    ctx.lineTo(-s * 0.38, s * 0.86);
    ctx.lineTo(-s * 0.1, s * 0.66);
    ctx.lineTo(-s * 0.12, s * 0.16);
    ctx.lineTo(-s * 0.95, s * 0.36);
    ctx.lineTo(-s * 0.95, s * 0.22);
    ctx.lineTo(-s * 0.12, -s * 0.18);
    ctx.lineTo(-s * 0.12, -s * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  /* list: aircraft with display position (dlat/dlon), trail, dist; featured: hex */
  Radar.prototype.render = function (list, featuredHex, now) {
    var ctx = this.ctx, u = this.unit, self = this;
    ctx.drawImage(this.base(), 0, 0, this.w, this.h);

    // home marker with slow pulse
    var pulse = (now % 4000) / 4000;
    ctx.strokeStyle = 'rgba(233, 228, 216,' + (0.35 * (1 - pulse)).toFixed(3) + ')';
    ctx.lineWidth = 1.5 * u;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, 5 * u + pulse * 26 * u, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = C.home;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, 4 * u, 0, Math.PI * 2);
    ctx.fill();

    // high traffic first so low (interesting) traffic draws on top
    var sorted = list.slice().sort(function (a, b) { return (b.alt || 0) - (a.alt || 0); });

    sorted.forEach(function (ac) {
      var phase = MA.fmt.phase(ac);
      var col = C[phase];
      var high = (ac.alt || 0) > 20000;
      var baseA = high ? 0.5 : 1;
      var featured = ac.hex === featuredHex;
      if (featured) baseA = 1;

      // trail
      var tr = ac.trail;
      if (tr.length > 1) {
        ctx.lineWidth = (featured ? 2.2 : 1.6) * u;
        ctx.lineCap = 'round';
        for (var i = 1; i < tr.length; i++) {
          var a = self.project(tr[i - 1][0], tr[i - 1][1]);
          var b = self.project(tr[i][0], tr[i][1]);
          var k = i / tr.length;
          ctx.strokeStyle = rgba(col, 0.42 * k * baseA);
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.stroke();
        }
        // connect last fix to the moving glyph
        var last = self.project(tr[tr.length - 1][0], tr[tr.length - 1][1]);
        var cur = self.project(ac.dlat, ac.dlon);
        ctx.strokeStyle = rgba(col, 0.42 * baseA);
        ctx.beginPath();
        ctx.moveTo(last[0], last[1]);
        ctx.lineTo(cur[0], cur[1]);
        ctx.stroke();
      }

      var p = self.project(ac.dlat, ac.dlon);
      var size = (high ? 8 : 11) * u * (featured ? 1.25 : 1);

      if (featured) {
        // dashed line to home + ring
        ctx.strokeStyle = rgba(col, 0.28);
        ctx.lineWidth = 1 * u;
        if (ctx.setLineDash) ctx.setLineDash([3 * u, 6 * u]);
        ctx.beginPath();
        ctx.moveTo(self.cx, self.cy);
        ctx.lineTo(p[0], p[1]);
        ctx.stroke();
        if (ctx.setLineDash) ctx.setLineDash([]);
        ctx.strokeStyle = rgba(col, 0.55);
        ctx.lineWidth = 1.5 * u;
        ctx.beginPath();
        ctx.arc(p[0], p[1], size * 2.1, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowColor = rgba(col, 0.9);
        ctx.shadowBlur = 14 * u;
      }
      self.drawPlane(p[0], p[1], ac.track, size, rgba(col, baseA), MA.fmt.isRotorcraft(ac));
      ctx.shadowBlur = 0;

      if (self.cfg.labels || featured) {
        var lx = p[0] + size * 1.6, ly = p[1] - size * 0.4;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.font = '500 ' + Math.round((featured ? 16 : 13) * u) + 'px ' + MONO;
        ctx.fillStyle = featured ? rgba(col, 1) : (high ? C.labelDim : C.label);
        ctx.fillText(ac.callsign || ac.reg || ac.hex.toUpperCase(), lx, ly);
        ctx.font = Math.round((featured ? 13 : 11) * u) + 'px ' + MONO;
        ctx.fillStyle = high && !featured ? 'rgba(233,228,216,0.3)' : 'rgba(233,228,216,0.55)';
        var arrow = phase === 'up' ? ' ↑' : (phase === 'down' ? ' ↓' : '');
        ctx.fillText(MA.fmt.altShort(ac.alt) + arrow + (ac.type ? '  ' + ac.type : ''), lx, ly + 15 * u * (featured ? 1.15 : 1));
      }
    });
  };

  MA.Radar = Radar;
})(window.MA);
