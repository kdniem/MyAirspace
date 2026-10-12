/* Aircraft glyphs: top-down silhouettes drawn with plain canvas path commands (no Path2D, no SVG strings).
   Each glyph is a half outline [x, y] from the nose to the tail (right side, x >= 0), mirrored on draw.
   Unit space: nose at y = -1, tail at y = +1, so the glyph is 2 units long; draw() scales by s (half length).
     pods:  engine nacelles [x, y0, y1, halfWidth]   props: propeller discs [x, y, halfWidth]
   MA.glyphs.kind(ac) picks the glyph from the ICAO type designator (ADS-B category as fallback). */
(function (MA) {
  var G = {
    // A320 / B737 class: swept wing, tailplane
    narrow: { len: 1,
      o: [[0, -1], [0.05, -0.97], [0.09, -0.9], [0.105, -0.75], [0.11, -0.12], [0.98, 0.3], [0.98, 0.41], [0.11, 0.2],
        [0.1, 0.7], [0.4, 0.9], [0.4, 0.99], [0.06, 0.93], [0.03, 1], [0, 1]] },
    // regional jets: same family, smaller wing
    regional: { len: 0.84,
      o: [[0, -1], [0.06, -0.97], [0.1, -0.9], [0.115, -0.75], [0.12, -0.05], [0.88, 0.3], [0.88, 0.41], [0.12, 0.22],
        [0.11, 0.62], [0.38, 0.88], [0.38, 0.98], [0.07, 0.93], [0.03, 1], [0, 1]] },
    // A330 / B777 / B787: longer, fuller wing, two engines
    wide: { len: 1.2,
      o: [[0, -1], [0.06, -0.97], [0.11, -0.9], [0.13, -0.7], [0.135, -0.22], [1, 0.36], [1, 0.5], [0.135, 0.3],
        [0.12, 0.7], [0.42, 0.91], [0.42, 1], [0.07, 0.95], [0.03, 1], [0, 1]],
      pods: [[0.36, -0.12, 0.12, 0.055]] },
    // B747 / A380 / A340: four engines
    jumbo: { len: 1.36,
      o: [[0, -1], [0.07, -0.97], [0.125, -0.9], [0.145, -0.7], [0.15, -0.26], [1, 0.34], [1, 0.48], [0.15, 0.3],
        [0.13, 0.7], [0.44, 0.91], [0.44, 1], [0.08, 0.95], [0.03, 1], [0, 1]],
      pods: [[0.3, -0.18, 0.04, 0.05], [0.58, -0.02, 0.2, 0.05]] },
    // business jets: small, swept, engines at the tail
    biz: { len: 0.74,
      o: [[0, -1], [0.05, -0.96], [0.085, -0.85], [0.1, -0.5], [0.1, -0.05], [0.88, 0.3], [0.88, 0.42], [0.1, 0.18],
        [0.1, 0.7], [0.34, 0.88], [0.34, 0.98], [0.06, 0.93], [0.03, 1], [0, 1]],
      pods: [[0.2, 0.34, 0.76, 0.06]] },
    // turboprops (ATR, Dash 8, A400M): straight wing, engines with propellers
    prop: { len: 0.86,
      o: [[0, -1], [0.06, -0.97], [0.1, -0.88], [0.11, -0.6], [0.11, -0.22], [0.96, -0.2], [0.96, 0.02], [0.11, 0.06],
        [0.1, 0.72], [0.36, 0.85], [0.36, 0.97], [0.06, 0.95], [0.03, 1], [0, 1]],
      pods: [[0.34, -0.5, 0.04, 0.055], [0.66, -0.48, 0.04, 0.055]],
      props: [[0.34, -0.52, 0.11], [0.66, -0.5, 0.11]] },
    // light aircraft (C172, PA-28, DA40): straight high wing, nose propeller
    small: { len: 0.62,
      o: [[0, -0.98], [0.07, -0.95], [0.12, -0.8], [0.13, -0.4], [0.13, -0.32], [1, -0.32], [1, -0.02], [0.13, -0.02],
        [0.1, 0.62], [0.42, 0.84], [0.42, 0.96], [0.06, 0.95], [0.03, 1], [0, 1]],
      props: [[0, -1.02, 0.3]] },
    // fighters / delta
    fighter: { len: 0.74,
      o: [[0, -1], [0.05, -0.8], [0.1, -0.3], [0.14, 0], [0.9, 0.66], [0.9, 0.8], [0.18, 0.7], [0.14, 0.9], [0.06, 1], [0, 1]] }
  };

  var WIDE = /^(A30B|A306|A310|A33\d|A338|A339|A35\d|A35K|A3ST|A337|B76\d|B77\d|B78\d|B78X|MD11|DC10|L101|IL96|C17)$/;
  var JUMBO = /^(A388|B74\d|B74[SFRD]|A34\d|A225|A124|AN22|AN12)$/;
  var BIZ = /^(C5\d\d|C25[A-C]|C56X|C68[0A]|C7[05]0|CL[3-6]0|GL\d\d|GLEX|GLF\d|G[2-6]\d\d|FA\d[0-9X]|F9\d\d|F2TH|E5[05]P|LJ\d\d|H25[A-C]|PRM1|SF50|EA50|BE40|HDJT|PC24|C25M|CL30)$/;
  var REGIONAL = /^(E1\d\d|E2\d\d|E7\d\d|E75[LS]|E29\d|CRJ[1-9X]|CRJX|BCS[13]|SU95|AR\d\d|RJ\d\d|F100|F70|DH8[A-D]x|MD8\d|MD9\d|B717|BAE\d|B461|B462|B463)$/;
  var PROP = /^(AT[4-7]\d|AT7[2-6]|DH8[A-D]|DHC[5-8]|SB20|SF34|F50|F27|JS\d\d|B190|E120|D328|C130|C30J|A400|PC12|C208|TBM\d|P180|BE20|BE9\w|SW\d|AN2\d|L410|DO28|C295|C212|CN35)$/;
  var SMALL = /^(C1\d\d|C2[0-4]\d|P28\w|PA\d\d|DA\d\d|SR2\d|M20\w|BE3\d|BE5\d|BE6\d|RV\d|AA5|AC\d\d|G115|TB\d\d|S22T|SIRA|PC6|PC7|JAB\d|FK\d\d|DR40|C77R|PA46|AT3\d|COL\d|CH\d\d|DV20|ULAC|GLID|H47|TRIN|CRUZ|SLG\w|ASK\d|DISC|LS\d|DG\d\d|ASG\w|ARCE)$/;
  var FIGHTER = /^(EUFI|F16|F35|F18|F15|TOR|F14|M346|HAWK|T38|J\d\d|MIG\w|SU\d\d|RFAL|GR4|F22|A10)$/;

  // glyph kind from the ICAO type designator; the ADS-B emitter category helps when the type is unknown
  function kind(ac) {
    if (MA.fmt && MA.fmt.isRotorcraft(ac)) return 'heli';
    var t = String(ac.type || '').toUpperCase(), cat = ac.category || '';
    if (t) {
      if (JUMBO.test(t)) return 'jumbo';
      if (WIDE.test(t)) return 'wide';
      if (FIGHTER.test(t)) return 'fighter';
      if (BIZ.test(t)) return 'biz';
      if (PROP.test(t)) return 'prop';
      if (REGIONAL.test(t)) return 'regional';
      if (SMALL.test(t)) return 'small';
      if (/^(A31[89]|A32\d|A19N|A20N|A21N|B73\w|B37M|B38M|B39M|B3XM|B75\w|BCS|A22\w)$/.test(t)) return 'narrow';
    }
    if (cat === 'A5') return 'wide';
    if (cat === 'A2') return 'regional';
    if (cat === 'A1' || cat === 'B1' || cat === 'B4' || cat === 'B6') return 'small';
    return 'narrow';
  }

  function build(ctx, g, s) {
    var o = g.o, i;
    ctx.beginPath();
    ctx.moveTo(0, o[0][1] * s);
    for (i = 1; i < o.length; i++) ctx.lineTo(o[i][0] * s, o[i][1] * s);
    for (i = o.length - 2; i > 0; i--) ctx.lineTo(-o[i][0] * s, o[i][1] * s);
    ctx.closePath();
    if (g.pods) {
      for (i = 0; i < g.pods.length; i++) {
        var p = g.pods[i], w = p[3] * s, y0 = p[1] * s, h = (p[2] - p[1]) * s;
        ctx.rect(p[0] * s - w, y0, w * 2, h);
        ctx.rect(-p[0] * s - w, y0, w * 2, h);
      }
    }
  }

  function heliBody(ctx, s) {
    // fuselage, tail boom and tail rotor as one closed shape
    ctx.beginPath();
    ctx.moveTo(0, -0.62 * s);
    ctx.quadraticCurveTo(0.2 * s, -0.55 * s, 0.2 * s, -0.2 * s);
    ctx.quadraticCurveTo(0.18 * s, 0.2 * s, 0.05 * s, 0.4 * s);
    ctx.lineTo(0.05 * s, 0.9 * s);
    ctx.lineTo(0.17 * s, 0.9 * s);
    ctx.lineTo(0.17 * s, 1 * s);
    ctx.lineTo(-0.17 * s, 1 * s);
    ctx.lineTo(-0.17 * s, 0.9 * s);
    ctx.lineTo(-0.05 * s, 0.9 * s);
    ctx.lineTo(-0.05 * s, 0.4 * s);
    ctx.quadraticCurveTo(-0.18 * s, 0.2 * s, -0.2 * s, -0.2 * s);
    ctx.quadraticCurveTo(-0.2 * s, -0.55 * s, 0, -0.62 * s);
    ctx.closePath();
  }

  /* Draw glyph `k` at (x, y), rotated to `hdg` degrees. s = half length in px before the class factor.
     o: {fill, edge, edgeW (px halo outside the shape), lw (px for stroked details), alpha} */
  function draw(ctx, k, x, y, hdg, s, o) {
    var PI = Math.PI;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((hdg || 0) * PI / 180);
    ctx.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (k === 'heli') {
      var r = s * 0.95, c = -0.08 * s;
      heliBody(ctx, s * 0.95);
      ctx.strokeStyle = o.edge; ctx.lineWidth = o.edgeW * 2; ctx.stroke();
      ctx.fillStyle = o.fill; ctx.fill();
      // main rotor: two crossing blades and a faint disc
      ctx.strokeStyle = o.fill;
      ctx.globalAlpha = (o.alpha === undefined ? 1 : o.alpha) * 0.4;
      ctx.lineWidth = Math.max(1, o.lw * 0.7);
      ctx.beginPath(); ctx.arc(0, c, r, 0, PI * 2); ctx.stroke();
      ctx.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
      var a = PI / 4, dx = Math.cos(a) * r, dy = Math.sin(a) * r;
      ctx.beginPath();
      ctx.moveTo(-dx, c - dy); ctx.lineTo(dx, c + dy);
      ctx.moveTo(dx, c - dy); ctx.lineTo(-dx, c + dy);
      ctx.strokeStyle = o.edge; ctx.lineWidth = o.lw * 1.5 + o.edgeW * 2; ctx.stroke();
      ctx.strokeStyle = o.fill; ctx.lineWidth = o.lw * 1.5; ctx.stroke();
      ctx.restore();
      return;
    }
    var g = G[k] || G.narrow, sc = s * g.len;
    build(ctx, g, sc);
    ctx.strokeStyle = o.edge;
    ctx.lineWidth = o.edgeW * 2;
    ctx.stroke();
    ctx.fillStyle = o.fill;
    ctx.fill();
    if (g.props) {
      ctx.strokeStyle = o.fill;
      ctx.lineWidth = Math.max(1, o.lw);
      ctx.beginPath();
      for (var i = 0; i < g.props.length; i++) {
        var p = g.props[i];
        ctx.moveTo(p[0] * sc - p[2] * sc, p[1] * sc); ctx.lineTo(p[0] * sc + p[2] * sc, p[1] * sc);
        if (p[0]) { ctx.moveTo(-p[0] * sc - p[2] * sc, p[1] * sc); ctx.lineTo(-p[0] * sc + p[2] * sc, p[1] * sc); }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  MA.glyphs = { kind: kind, draw: draw, kinds: Object.keys(G).concat(['heli']),
    // relative size of a glyph kind (half length factor), used by the radar for the leader offset
    len: function (k) { return k === 'heli' ? 0.95 : (G[k] || G.narrow).len; } };
})(window.MA);
