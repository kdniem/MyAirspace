/* Canvas renderer: radar map centred on home, palette per colour theme (js/theme.js). */
(function (MA) {
  // Text colours are checked by tools/contrast.mjs (>= 4.5:1 on the background).
  var PALETTES = {
    dark: {
      bg: '#050607',
      land: ['rgba(170, 185, 195, 0.11)', 'rgba(170, 185, 195, 0)'],   // lighter land tone around home
      water: '#2f5468',
      halo: '#050607',                       // outline behind map labels (readable over water/rings)
      ring: 'rgba(233, 228, 216, 0.12)',
      ringMain: 'rgba(233, 228, 216, 0.32)',
      ringLabel: 'rgba(233, 228, 216, 0.56)',
      place: 'rgba(233, 228, 216, 0.58)',
      placeMajor: 'rgba(233, 228, 216, 0.86)',
      runway: 'rgba(233, 228, 216, 0.92)',
      centerline: 'rgba(233, 228, 216, 0.24)',
      airport: 'rgba(233, 228, 216, 0.82)',
      home: '#e9e4d8',
      ink: [233, 228, 216],                  // home pulse, active approaches
      active: [0.6, 0.34],                   // runway in use: observed / wind estimate
      up: [255, 181, 71],
      down: [99, 211, 232],
      level: [233, 228, 216],
      special: [199, 139, 255],  // special aircraft halo (js/special.js)
      alert: [255, 93, 93],      // emergency squawks
      label: 'rgba(233, 228, 216, 0.92)',
      labelDim: 'rgba(233, 228, 216, 0.64)',
      detail: 'rgba(233, 228, 216, 0.74)',
      detailDim: 'rgba(233, 228, 216, 0.56)',
      high: 0.55,                            // glyph alpha above FL200
      glow: 0.9                              // featured aircraft shadow
    },
    light: {
      bg: '#f4f2ec',
      land: ['rgba(255, 255, 255, 0.8)', 'rgba(255, 255, 255, 0)'],
      water: '#a6bccc',
      halo: '#f4f2ec',
      ring: 'rgba(27, 29, 32, 0.14)',
      ringMain: 'rgba(27, 29, 32, 0.36)',
      ringLabel: '#5c6065',
      place: '#5c6065',
      placeMajor: '#25282c',
      runway: 'rgba(27, 29, 32, 0.92)',
      centerline: 'rgba(27, 29, 32, 0.3)',
      airport: '#25282c',
      home: '#1b1d20',
      ink: [27, 29, 32],
      active: [0.62, 0.36],
      up: [168, 82, 0],
      down: [0, 104, 138],
      level: [27, 29, 32],
      special: [122, 63, 196],
      alert: [196, 30, 30],
      label: '#1b1d20',
      labelDim: '#4a4e53',
      detail: '#3b3f44',
      detailDim: '#5c6065',
      high: 0.6,
      glow: 0.35
    }
  };
  var C = PALETTES.dark;
  var MONO = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';

  function Radar(canvas, cfg) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cfg = cfg;
    this.cosLat = Math.cos(cfg.lat * Math.PI / 180);
    this.setTheme(MA.theme ? MA.theme.current() : 'dark', false);
    this.resize();
    var self = this;
    if (MA.theme) MA.theme.onChange(function (name, fade) { self.setTheme(name, fade); });
  }

  // Switch the palette; with `fade` the old base layer is crossfaded out (see render).
  Radar.prototype.setTheme = function (name, fade) {
    if (!PALETTES[name]) name = 'dark';
    if (name === this.theme) return;
    this.theme = name;
    C = PALETTES[name];
    this._prev = fade && this._base ? this._base : null;
    this._fadeAt = Date.now();
    this._base = null;
  };

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

  // Map label with an outline in the background colour: stays readable over water and rings.
  Radar.prototype.label = function (text, x, y) {
    var ctx = this.ctx;
    ctx.lineWidth = 4 * this.unit;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = C.halo;
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
  };

  Radar.prototype.drawBase = function () {
    var ctx = this.ctx, u = this.unit, self = this;
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
      var pts = wtr.pts, minW = (wtr.kind === 'coast' ? 2 : 2.5) * u;
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

    // range rings
    var step = this.niceStep();
    var maxKm = this.coverKm();
    ctx.font = Math.round(15 * u) + 'px ' + MONO;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (var km = step; km <= maxKm; km += step) {
      var r = km * this.pxPerKm;
      var main = Math.abs(km - this.cfg.radiusKm) < 0.01;
      ctx.strokeStyle = main ? C.ringMain : C.ring;
      ctx.lineWidth = (main ? 1.5 : 1) * u;
      if (ctx.setLineDash) ctx.setLineDash(km > this.cfg.radiusKm ? [2 * u, 8 * u] : []);
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, r, 0, Math.PI * 2);
      ctx.stroke();
      var a = -Math.PI / 4;
      var lx = this.cx + Math.cos(a) * r + 8 * u, ly = this.cy + Math.sin(a) * r;
      if (lx < this.w - 80 * u && ly > 24 * u) {
        if (ctx.setLineDash) ctx.setLineDash([]);
        ctx.fillStyle = C.ringLabel;
        this.label(String(km).replace('.', ',') + ' km', lx, ly);
      }
    }
    if (ctx.setLineDash) ctx.setLineDash([]);

    // north tick
    ctx.strokeStyle = C.ringMain;
    ctx.lineWidth = 1.5 * u;
    ctx.beginPath();
    ctx.moveTo(this.cx, this.cy - this.ringPx - 10 * u);
    ctx.lineTo(this.cx, this.cy - this.ringPx + 6 * u);
    ctx.stroke();
    ctx.fillStyle = C.ringLabel;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('N', this.cx, this.cy - this.ringPx - 14 * u);

    // places: major towns larger and brighter
    if (this.cfg.places) {
      ctx.textBaseline = 'middle';
      MA.features.places.forEach(function (p) {
        var q = self.project(p.lat, p.lon);
        if (q[0] < 0 || q[0] > self.w || q[1] < 0 || q[1] > self.h) return;
        if (Math.abs(q[0] - self.cx) < 70 * u && Math.abs(q[1] - self.cy) < 16 * u) return; // keep home marker clear
        ctx.fillStyle = p.major ? C.placeMajor : C.place;
        ctx.font = (p.major ? '500 ' : '') + Math.round((p.major ? 18 : 15) * u) + 'px ' + MONO;
        self.label(p.name.toUpperCase().split('').join(String.fromCharCode(8202)), q[0], q[1]);
      });
    }

    // airports: extended centrelines (the approach paths), runways, code
    MA.features.airports.forEach(function (ap) {
      ap.runways.forEach(function (rw) {
        // runway ends a/b; centrelines extend 18 km beyond each end
        var hdg = MA.geo.bearing(rw.a[0], rw.a[1], rw.b[0], rw.b[1]);
        var c1 = MA.geo.dest(rw.b[0], rw.b[1], hdg, 18), c2 = MA.geo.dest(rw.a[0], rw.a[1], hdg + 180, 18);
        var p1 = self.project(rw.b[0], rw.b[1]), p2 = self.project(rw.a[0], rw.a[1]);
        var q1 = self.project(c1[0], c1[1]), q2 = self.project(c2[0], c2[1]);
        ctx.strokeStyle = C.centerline;
        ctx.lineWidth = 1.5 * u;
        ctx.lineCap = 'butt';
        if (ctx.setLineDash) ctx.setLineDash([6 * u, 6 * u]);
        ctx.beginPath();
        ctx.moveTo(q1[0], q1[1]); ctx.lineTo(p1[0], p1[1]);
        ctx.moveTo(p2[0], p2[1]); ctx.lineTo(q2[0], q2[1]);
        ctx.stroke();
        if (ctx.setLineDash) ctx.setLineDash([]);
        ctx.strokeStyle = C.runway;
        ctx.lineWidth = Math.max(4 * u, 0.08 * self.pxPerKm);
        ctx.beginPath();
        ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]);
        ctx.stroke();
      });
      var a = self.project(ap.lat, ap.lon);
      ctx.fillStyle = C.airport;
      ctx.font = '500 ' + Math.round(16 * u) + 'px ' + MONO;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      self.label(ap.code, a[0] + 2 * self.pxPerKm, a[1] + 1.2 * self.pxPerKm);
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

  /* Runways in use (js/weather.js): the approach centreline on the arrival side, brighter
     than the base one and fading out from the threshold. Drawn per frame over the cached
     base (two dashed lines are cheap); `rev` follows the base's drawing direction so the
     dashes line up. Wind-only estimates are dimmer. */
  Radar.prototype.drawActive = function (list) {
    var ctx = this.ctx, u = this.unit;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var p = this.project(r.thr[0], r.thr[1]), q = this.project(r.far[0], r.far[1]);
      var grd = ctx.createLinearGradient(p[0], p[1], q[0], q[1]);
      grd.addColorStop(0, rgba(C.ink, C.active[r.est ? 1 : 0]));
      grd.addColorStop(1, rgba(C.ink, 0.04));
      ctx.strokeStyle = grd;
      ctx.lineWidth = 2.5 * u;
      ctx.lineCap = 'butt';
      if (ctx.setLineDash) ctx.setLineDash([6 * u, 6 * u]);
      ctx.beginPath();
      if (r.rev) { ctx.moveTo(q[0], q[1]); ctx.lineTo(p[0], p[1]); } else { ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
      ctx.stroke();
    }
    if (ctx.setLineDash) ctx.setLineDash([]);
  };

  /* list: aircraft with display position (dlat/dlon), trail, dist; featured: hex;
     active: runways in use from MA.weather.active() (optional) */
  Radar.prototype.render = function (list, featuredHex, now, active) {
    var ctx = this.ctx, u = this.unit, self = this;
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

    // home marker with slow pulse
    var pulse = (now % 4000) / 4000;
    ctx.strokeStyle = rgba(C.ink, 0.6 * (1 - pulse));
    ctx.lineWidth = 2 * u;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, 6 * u + pulse * 28 * u, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = C.home;
    ctx.lineWidth = 1.5 * u;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, 9 * u, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = C.home;
    ctx.beginPath();
    ctx.arc(this.cx, this.cy, 4.5 * u, 0, Math.PI * 2);
    ctx.fill();

    // special aircraft halo pulse, computed once per frame (alerts pulse twice as fast)
    var glow = 0.5 + 0.5 * Math.sin(now * Math.PI / 900);
    var glowFast = 0.5 + 0.5 * Math.sin(now * Math.PI / 450);

    // high traffic first so low (interesting) traffic draws on top
    var sorted = list.slice().sort(function (a, b) { return (b.alt || 0) - (a.alt || 0); });

    sorted.forEach(function (ac) {
      var phase = MA.fmt.phase(ac);
      var col = C[phase];
      var high = (ac.alt || 0) > 20000;
      var baseA = high ? C.high : 1;
      var featured = ac.hex === featuredHex;
      var sp = ac.special, spCol = sp ? (sp.alert ? C.alert : C.special) : null;
      if (featured || sp) baseA = 1;

      // trail: fades out with age, tapers towards the tail, ends at the glyph
      var tr = ac.trail;
      if (tr.length) {
        var maxAge = self.cfg.trailMin * 60000 || 1;
        var head = (featured ? 3 : 2.2) * u;
        var cur = self.project(ac.dlat, ac.dlon);
        ctx.lineCap = 'round';
        for (var i = 0; i < tr.length; i++) {
          var a = self.project(tr[i][0], tr[i][1]);
          var b = i + 1 < tr.length ? self.project(tr[i + 1][0], tr[i + 1][1]) : cur;
          var fresh = Math.max(0, 1 - (now - tr[i][2]) / maxAge);
          ctx.lineWidth = Math.max(0.6 * u, head * (0.35 + 0.65 * fresh));
          ctx.strokeStyle = rgba(col, 0.7 * fresh * fresh * baseA);
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.stroke();
        }
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
        ctx.shadowColor = rgba(col, C.glow);
        ctx.shadowBlur = 14 * u;
      }
      if (sp) {
        // special aircraft: soft pulsing disc + expanding ring (no shadowBlur/gradients: cheap on TVs)
        var g = sp.alert ? glowFast : glow;
        ctx.fillStyle = rgba(spCol, 0.1 + 0.1 * g);
        ctx.beginPath();
        ctx.arc(p[0], p[1], size * (1.5 + 0.35 * g), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = rgba(spCol, 0.6 * (1 - g));
        ctx.lineWidth = 1.5 * u;
        ctx.beginPath();
        ctx.arc(p[0], p[1], size * (1.6 + 1.2 * g), 0, Math.PI * 2);
        ctx.stroke();
      }
      self.drawPlane(p[0], p[1], ac.track, size, rgba(col, baseA), MA.fmt.isRotorcraft(ac));
      ctx.shadowBlur = 0;

      if (self.cfg.labels || featured) {
        var lx = p[0] + size * 1.6, ly = p[1] - size * 0.4;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.font = '500 ' + Math.round((featured ? 19 : 16) * u) + 'px ' + MONO;
        ctx.fillStyle = sp ? rgba(spCol, 1) : (featured ? rgba(col, 1) : (high ? C.labelDim : C.label));
        ctx.fillText(ac.callsign || ac.reg || ac.hex.toUpperCase(), lx, ly);
        ctx.font = Math.round((featured ? 15 : 13) * u) + 'px ' + MONO;
        ctx.fillStyle = high && !featured ? C.detailDim : C.detail;
        var arrow = phase === 'up' ? ' ↑' : (phase === 'down' ? ' ↓' : '');
        ctx.fillText(MA.fmt.altShort(ac.alt) + arrow + (ac.type ? '  ' + ac.type : ''), lx, ly + 18 * u * (featured ? 1.15 : 1));
      }
    });
  };

  Radar.palettes = PALETTES; // for tools/contrast.mjs
  MA.Radar = Radar;
})(window.MA);
