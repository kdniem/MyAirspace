/* Style table: every look is DATA. Adding a style = adding one entry to STYLES below.
   Role tokens per palette (hex), the rest is derived by resolve():
     bg panel ink quiet line   surfaces and text (ink = normal data, quiet = labels)
     accent                    signature colour (board values, active runway); user-overridable (accent=)
     target                    selected / target (the featured aircraft)       cockpit semantics:
     caution warning special   amber / red / magenta                           white normal, green active,
     ok moderate               status OK (green); moderate = yellow (weather)  cyan target, amber caution,
     water land                map tones                                       red warning, magenta special
   Palettes: dark and light (a style without `light` is dark only: it stays dark in light mode).
   Seven looks, each with its own identity (hue family, type, line weight, symbol, trail, data block, density).
   Old ids (atc, terminal, …) are aliases, see ALIAS: old links keep working.
   Loaded before config.js, ES2017 only (old TV browsers). */
var MA = window.MA || {};
window.MA = MA;

(function (MA) {
  var MONO = '"IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';
  var SANS = '"Helvetica Neue", Helvetica, Arial, "Segoe UI", Roboto, "Liberation Sans", sans-serif';

  /* Per look:
     font, weight, caps, track   typography class: family, weight, upper-case labels, label letter-spacing (em)
     plane    size factor of the aircraft symbol          lw     line weight factor (outlines, leaders, rose)
     trail    'taper' (fading line) | 'dots' | 'dash' | 'none';  trailW  its width factor
     symbol   'glyph' (silhouette by type) | 'ring' | 'dot' | 'box' | 'cross' | 'diamond'
     block    data block: 'plain' (text on a leader) | 'frame' (outlined) | 'tab' (filled, accent bar)
     br       corner radius of badges in px at 1080p; badge 'brand' (livery colour) | 'mono' (outline)
     sweep    rotating radar sweep (round scope feel)     grid   square grid under the map
     arc      compass rose only as an arc of +/- this many degrees (Airbus ND); 0 = full rose
     halo     false: no dark outline behind text and symbols (night vision)
     ringRole, mainRing   palette role for the range rings and the main ring (airspace)
     airportSpecial  airport codes in the special colour (chart)
     fixedAccent      the accent is not user-overridable
     css     extra CSS custom properties (corner radius, board borders) */
  var STYLES = {
    tower: {
      name: 'Tower', info: 'ATC-Radarschirm: Phosphorgrün, runder Schwenk', font: 'mono', weight: 400, caps: false, track: 0.2,
      theme: 'dark', plane: 1, lw: 0.8, trail: 'dots', trailW: 1, symbol: 'ring', block: 'plain', br: 2, badge: 'mono',
      sweep: true, css: { '--radius': '0.4vh', '--val-color': 'var(--accent)', '--unit-color': 'var(--sub)' },
      dark: { bg: '#010b05', panel: '#03150b', ink: '#b9ffd3', quiet: '#58b07a', line: '#0f3a21', accent: '#40ffd0',
        target: '#e8fff2', caution: '#ffd166', warning: '#ff5d4d', special: '#ff8ad8', moderate: '#d4f25c', ok: '#40ffd0',
        water: '#0a2a18', land: '#7fbf98' }
    },
    fids: {
      name: 'FIDS', info: 'Flughafen-Anzeigetafel: Versalien, Split-Flap, Zeilenbänder', font: 'sans', weight: 600, caps: true, track: 0.08,
      theme: 'dark', plane: 0.9, lw: 1.3, trail: 'none', trailW: 1, symbol: 'dot', block: 'tab', br: 0, badge: 'brand',
      css: { '--radius': '0', '--val-color': 'var(--accent)', '--unit-color': 'var(--sub)', '--call-color': 'var(--accent)' },
      dark: { bg: '#0c0d10', panel: '#16181d', ink: '#f6eedb', quiet: '#a79c84', line: '#34302a', accent: '#ffb000',
        target: '#7fd6ff', caution: '#ff8a1f', warning: '#ff4b3e', special: '#ff7ad9', moderate: '#ffe14a', ok: '#9be36a',
        water: '#1c2430', land: '#4b463b' },
      light: { bg: '#efe9da', panel: '#e3dccb', ink: '#15130f', quiet: '#5a5242', line: '#c4bba5', accent: '#8a4a00',
        target: '#005f8f', caution: '#9a4a00', warning: '#b3261e', special: '#8d2a86', moderate: '#8f6d00', ok: '#1f6b3c',
        water: '#c8d2d9', land: '#fbf8f0' }
    },
    'efis-airbus': {
      name: 'Airbus', info: 'ND: Schwarz mit Weiß, Grün, Cyan und Magenta, Bogen', font: 'sans', weight: 500, caps: false, track: 0.02,
      theme: 'dark', plane: 0.95, lw: 0.7, trail: 'taper', trailW: 0.8, symbol: 'glyph', block: 'plain', br: 6, badge: 'brand', arc: 60,
      css: { '--radius': '1vh', '--val-color': 'var(--accent)', '--unit-color': 'var(--target)' },
      dark: { bg: '#000000', panel: '#06080a', ink: '#ffffff', quiet: '#9fa9b1', line: '#1f272e', accent: '#4cff3c',
        target: '#3fd8ff', caution: '#ffb100', warning: '#ff4d42', special: '#ff44cc', moderate: '#f5e04a', ok: '#4cff3c',
        water: '#0f2a36', land: '#6f8590' },
      light: { bg: '#eef0f1', panel: '#e0e4e6', ink: '#0d1317', quiet: '#4d5960', line: '#c5ccd0', accent: '#0a6e2a',
        target: '#006a96', caution: '#8f5300', warning: '#b3261e', special: '#9a2a90', moderate: '#8f6d00', ok: '#0a6e2a',
        water: '#a9c0cc', land: '#ffffff' }
    },
    'eicam-boeing': {
      name: 'Boeing', info: 'EICAS: Blaugrau, Weiß und Cyan, eckige Module, kräftige Schrift', font: 'sans', weight: 600, caps: false, track: 0.03,
      theme: 'dark', plane: 1.08, lw: 1.3, trail: 'dash', trailW: 1.4, symbol: 'box', block: 'frame', br: 0, badge: 'brand',
      css: { '--radius': '0', '--val-color': 'var(--accent)', '--unit-color': 'var(--target)' },
      dark: { bg: '#0c1620', panel: '#142230', ink: '#e9f1f8', quiet: '#8fa3b8', line: '#2a3d52', accent: '#8fe6ff',
        target: '#ffffff', caution: '#ffb52e', warning: '#ff5348', special: '#ff7ae0', moderate: '#f2d94a', ok: '#6fe39a',
        water: '#1a3a52', land: '#5f7589' },
      light: { bg: '#dfe6ee', panel: '#cdd7e2', ink: '#0c1822', quiet: '#44566a', line: '#b3c0cd', accent: '#005f80',
        target: '#0b2233', caution: '#7a4700', warning: '#a31f17', special: '#9a2a90', moderate: '#8f6d00', ok: '#11703d',
        water: '#9db6cb', land: '#ffffff' }
    },
    'chart-paper': {
      name: 'Karte', info: 'Luftfahrtkarte auf Papier: Tinte, Magenta-Luftraum, Versalien', font: 'mono', weight: 500, caps: true, track: 0.12,
      theme: 'light', plane: 1, lw: 0.9, trail: 'none', trailW: 1, symbol: 'cross', block: 'plain', br: 0, badge: 'mono',
      ringRole: 'accent', mainRing: 'special', airportSpecial: true,
      css: { '--radius': '0', '--val-color': 'var(--accent)', '--unit-color': 'var(--sub)' },
      light: { bg: '#f1ede0', panel: '#e6e0cf', ink: '#1b2a4a', quiet: '#55607a', line: '#cbc3ad', accent: '#1f4e9c',
        target: '#0b6e99', caution: '#8a5200', warning: '#b3261e', special: '#a0197c', moderate: '#8f6d00', ok: '#1f6b3f',
        water: '#b9d3e4', land: '#fbf8ee' },
      dark: { bg: '#0c1424', panel: '#121c30', ink: '#dfe7f5', quiet: '#8d9bb8', line: '#243352', accent: '#7fb2f0',
        target: '#5fd0e8', caution: '#f0b04a', warning: '#ff6a5e', special: '#e57ac8', moderate: '#f0dc55', ok: '#6fdc8c',
        water: '#1d3a5a', land: '#7d93b8' }
    },
    'nvg-night': {
      name: 'Nacht', info: 'Nachtsicht: nur Rot und Dunkelgrün, ohne Schein, sehr dunkel', font: 'mono', weight: 600, caps: false, track: 0.04,
      theme: 'dark', fixedAccent: true, plane: 1.1, lw: 1, trail: 'taper', trailW: 1.3, symbol: 'glyph', block: 'plain', br: 3,
      badge: 'mono', halo: false,
      css: { '--radius': '0.3vh', '--val-color': 'var(--ink)', '--unit-color': 'var(--quiet)', '--head': '#000000' },
      dark: { bg: '#000000', panel: '#070100', ink: '#d4503c', quiet: '#cc4a36', line: '#2a0d08', accent: '#3f9e5a',
        target: '#ff8a6e', caution: '#e0603a', warning: '#ff3b2b', special: '#ff8f7f', moderate: '#e0a060', ok: '#3f9e5a',
        water: '#1c0906', land: '#6a2219' }
    },
    'tactical-olive': {
      name: 'Taktik', info: 'Taktische Anzeige in Oliv: Raster, Schablonen-Versalien', font: 'mono', weight: 500, caps: true, track: 0.18,
      theme: 'dark', plane: 1, lw: 1.1, trail: 'dash', trailW: 1, symbol: 'diamond', block: 'frame', br: 0, badge: 'mono', grid: true,
      css: { '--radius': '0', '--val-color': 'var(--accent)', '--unit-color': 'var(--sub)' },
      dark: { bg: '#0b0c06', panel: '#14150b', ink: '#d8d39c', quiet: '#8f8b5c', line: '#2c2c19', accent: '#b9c46b',
        target: '#e8e0a0', caution: '#e0b040', warning: '#ff6e50', special: '#e48cd8', moderate: '#d9c35a', ok: '#b9c46b',
        water: '#1d2a1c', land: '#7d7f52' }
    }
  };

  // old style ids (links and bookmarks from before the redesign) -> the look they became
  var ALIAS = {
    atc: 'tower', terminal: 'fids', airbus: 'efis-airbus', boeing: 'eicam-boeing',
    chart: 'chart-paper', night: 'nvg-night', military: 'tactical-olive'
  };
  var DEFAULT_STYLE = 'tower';

  // accent=<name>: [dark, light] colours; accent=<hex> is adjusted to be readable
  var ACCENTS = {
    amber: ['#ffb547', '#8a4f00'], green: ['#6fe39a', '#1d6b3c'], cyan: ['#5fd0e8', '#00608a'],
    white: ['#f2f4f5', '#1b1f1c'], red: ['#ff6a5e', '#b3261e']
  };

  /* ---------- colour helpers ---------- */

  function rgb(h) {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  }
  function hex(c) {
    return '#' + c.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join('');
  }
  function mix(a, b, t) {
    var x = rgb(a), y = rgb(b);
    return hex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
  }
  function lum(h) {
    var v = rgb(h).map(function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  function ratio(a, b) {
    var l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  // Move fg towards white (dark surfaces) or black (light surfaces) until it reaches `min` on every surface.
  function ensure(fg, surfaces, min) {
    var toward = lum(surfaces[0]) < 0.3 ? '#ffffff' : '#000000', c = fg, t = 0;
    function ok(x) { return surfaces.every(function (s) { return ratio(x, s) >= min; }); }
    while (!ok(c) && t < 1) { t += 0.03; c = mix(fg, toward, t); }
    return c;
  }
  function rgba(h, a) { var c = rgb(h); return 'rgba(' + c[0] + ', ' + c[1] + ', ' + c[2] + ', ' + Math.max(0, Math.min(1, a)).toFixed(3) + ')'; }

  /* ---------- resolve ---------- */

  // canonical style id: new ids as they are, old ids through ALIAS, anything else null
  function canonical(name) {
    name = String(name || '');
    if (Object.prototype.hasOwnProperty.call(STYLES, name)) return name;
    if (Object.prototype.hasOwnProperty.call(ALIAS, name)) return ALIAS[name];
    return null;
  }

  function paletteFor(style, theme) {
    var st = STYLES[style];
    return (theme === 'light' ? st.light : st.dark) || st.dark || st.light;
  }

  function accentFor(P, light, accent, st) {
    if (!accent || st.fixedAccent) return P.accent;
    var base;
    if (ACCENTS[accent]) base = ACCENTS[accent][light ? 1 : 0];
    else if (/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(accent)) base = hex(rgb(accent));
    else return P.accent;
    return ensure(base, [P.bg, P.panel], 4.5);
  }

  /* opts: {accent, font, brightness}; returns CSS custom properties, the canvas palette and style flags */
  function resolve(style, theme, opts) {
    opts = opts || {};
    style = canonical(style) || DEFAULT_STYLE;
    var st = STYLES[style], P = paletteFor(style, theme), light = P === st.light;
    var br = typeof opts.brightness === 'number' ? opts.brightness : 1;
    var acc = accentFor(P, light, opts.accent, st);
    var surf = [P.bg, P.panel];
    function txt(t, on) { return ensure(mix(P.bg, P.ink, t), on || [P.bg], 4.5); }
    function a(base, v) { return rgba(base, v * br > 0.95 ? 0.95 : v * br); }
    // airline badges (js/airlines.js): neutral tile for unknown operators and types, thin edge against the surface
    var badgeBg = mix(P.panel, P.ink, 0.2), badgeFg = ensure(P.ink, [badgeBg], 4.5);
    var badgeEdge = ensure(mix(P.panel, P.ink, 0.5), [P.panel, P.bg], 3);
    var font = opts.font === 'sans' || opts.font === 'mono' ? opts.font : st.font;
    var fam = font === 'sans' ? SANS : MONO;
    var ringBase = st.ringRole ? P[st.ringRole] : P.ink, mainBase = st.mainRing ? P[st.mainRing] : P.ink;

    var css = {
      '--bg': P.bg, '--panel': P.panel, '--ink': P.ink, '--dim': P.quiet, '--quiet': P.quiet,
      '--sub': ensure(mix(P.ink, P.panel, 0.22), surf, 4.5),
      '--attrib': ensure(mix(P.bg, P.ink, 0.55), [P.bg], 4.5),
      '--line': P.line, '--faint': mix(P.bg, P.ink, 0.12), '--pager': mix(P.panel, P.ink, 0.22),
      '--idle': mix(P.panel, P.ink, 0.3),
      '--accent': acc, '--target': P.target, '--caution': P.caution, '--warning': P.warning,
      '--special': P.special, '--ok': P.ok, '--moderate': P.moderate,
      // weather radar steps (js/wxradar.js): light, moderate, heavy, very heavy
      '--wx1': P.ok, '--wx2': P.moderate, '--wx3': P.caution, '--wx4': P.warning,
      '--badge-bg': badgeBg, '--badge-fg': badgeFg, '--badge-edge': badgeEdge,
      '--toast-bg': rgba(P.panel, 0.96), '--toast-line': rgba(P.special, 0.7),
      '--zebra': rgba(P.ink, light ? 0.04 : 0.035), '--head': mix(P.panel, P.ink, light ? 0.025 : 0.07),
      '--font': fam, '--weight': String(st.weight || 500),
      '--lbl-track': (st.track || 0) + 'em', '--lbl-case': st.caps ? 'uppercase' : 'none'
    };
    for (var k in st.css) css[k] = st.css[k];

    // chart background (chartbg=1, js/chart.js): paper tone, airspace classes, navaids, obstacles.
    // Lines are checked against the paper at 3:1, labels at 4.5:1 (ensure moves them towards black or white).
    // The 'chart' style is already a paper look; the other styles get a muted, slightly darker tone.
    // On dark palettes the class colours are pulled towards the paper so the chart stays under the traffic.
    var paper = light ? P.bg : mix(P.bg, P.ink, 0.06), mute = light ? 0 : 0.45;
    function cls(col) { return ensure(mute ? mix(col, paper, mute) : col, [paper], 3); }
    var chart = {
      paper: paper,
      grid: ensure(mix(paper, P.ink, 0.4), [paper], 3),
      ctl: cls(P.target),                                      // controlled airspace: CTR, TMA, CTA, ATZ …
      res: cls(P.warning),                                     // restricted, TRA, TSA, MTA, alert, warning areas
      dng: cls(P.special),                                     // danger areas
      pro: cls(P.warning),                                     // prohibited areas
      oth: cls(P.quiet),                                       // other: parachute zones, protected areas …
      nav: ensure(mix(P.ink, P.target, 0.35), [paper], 4.5),   // VOR, NDB, DME symbols and labels
      obs: ensure(P.ink, [paper], 3),                          // obstacles
      label: ensure(P.ink, [paper], 4.5),
      labelDim: ensure(mix(paper, P.ink, 0.72), [paper], 4.5)
    };

    var wcol = mix(P.bg, P.water, br > 1 ? 1 : Math.max(0.35, br));
    var blockEdge = ensure(mix(P.bg, P.ink, 0.5), [P.bg], 3);
    var c = {
      bg: P.bg,
      land: [rgba(P.land, (light ? 0.8 : 0.1) * br), rgba(P.land, 0)],
      water: wcol, halo: P.bg, outline: st.halo !== false,
      ring: a(ringBase, st.ringRole ? 0.3 : (light ? 0.16 : 0.14)), ringMain: a(mainBase, st.mainRing ? 0.85 : (light ? 0.5 : 0.45)),
      tick: a(P.ink, light ? 0.55 : 0.5), tickMajor: a(P.ink, light ? 0.85 : 0.8),
      ringLabel: txt(0.62), tickLabel: txt(0.7),
      place: txt(0.6, [P.bg, P.water]), placeMajor: txt(0.86, [P.bg, P.water]), placeDot: a(P.ink, 0.5),
      runway: a(P.ink, 0.92), centerline: a(P.ink, light ? 0.3 : 0.26),
      // focus view (js/airport.js): apron and taxiways muted; lines 3:1, labels 4.5:1 against the background
      apron: a(P.ink, light ? 0.075 : 0.06), apronEdge: ensure(mix(P.bg, P.ink, 0.45), [P.bg], 3),
      taxi: ensure(mix(P.bg, P.ink, 0.5), [P.bg], 3), terminal: a(P.ink, light ? 0.13 : 0.1),
      terminalEdge: ensure(mix(P.bg, P.ink, 0.55), [P.bg], 3), stand: ensure(mix(P.bg, P.ink, 0.6), [P.bg], 3),
      gateLabel: txt(0.74),
      airport: st.airportSpecial ? P.special : txt(0.86),
      home: P.ink, ink: rgb(P.ink), accent: rgb(acc), active: [0.8, 0.45],
      level: rgb(P.ink), target: rgb(P.target), special: rgb(P.special), alert: rgb(P.warning), caution: rgb(P.caution),
      label: P.ink, labelDim: txt(0.72), detail: txt(0.8), detailDim: txt(0.62),
      quiet: P.quiet,
      high: light ? 0.6 : 0.55,
      // look: symbol, trail, data block, sweep, grid, rose arc (see the table above)
      plane: st.plane || 1, lw: st.lw || 1, trailW: st.trailW || 1,
      symbol: st.symbol || 'glyph', trail: st.trail || 'taper', block: st.block || 'plain',
      sweep: !!st.sweep, grid: st.grid ? a(P.ink, light ? 0.1 : 0.07) : null, arc: st.arc || 0,
      blockEdge: blockEdge, blockFill: rgba(P.panel, 0.92),
      badgeR: st.br || 0, badgeMono: st.badge === 'mono',
      badgeBg: badgeBg, badgeFg: badgeFg, badgeEdge: badgeEdge, weight: st.weight || 500, font: fam,
      bgHex: P.bg, panelHex: P.panel, accentHex: acc, targetHex: P.target, specialHex: P.special, warningHex: P.warning,
      chart: chart,
      // weather radar: the four step colours (role tokens) and the alpha of the overlay, below aircraft and labels
      wx: [P.ok, P.moderate, P.caution, P.warning], wxAlpha: light ? 0.62 : 0.42
    };
    return { css: css, c: c, style: style, theme: light ? 'light' : 'dark', font: font, fam: fam };
  }

  function apply(root, r) {
    for (var k in r.css) root.style.setProperty(k, r.css[k]);
    root.setAttribute('data-style', r.style);
  }

  MA.STYLES = STYLES;
  MA.ACCENTS = ACCENTS;
  MA.style = {
    names: function () { return Object.keys(STYLES); },
    canonical: canonical, aliases: ALIAS, defaultStyle: DEFAULT_STYLE,
    resolve: resolve, apply: apply, ensure: ensure, ratio: ratio, mix: mix,
    fonts: { mono: MONO, sans: SANS },
    defaultTheme: function (name) { var s = canonical(name); return (s && STYLES[s].theme) || 'dark'; }
  };
})(window.MA);
