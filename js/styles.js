/* Style table: every look is DATA. Adding a style = adding one entry to STYLES below.
   Role tokens per palette (hex), the rest is derived by resolve():
     bg panel ink quiet line   surfaces and text (ink = normal data, quiet = labels)
     accent                    signature colour (board values, active runway); user-overridable (accent=)
     target                    selected / target (the featured aircraft)       cockpit semantics:
     caution warning special   amber / red / magenta                           white normal, green active,
     ok                        status OK (green)                               cyan target, amber caution,
     water land                map tones                                       red warning, magenta special
   Palettes: dark and light (a style without `light` uses its dark palette in light mode).
   Loaded before config.js, ES2017 only (old TV browsers). */
var MA = window.MA || {};
window.MA = MA;

(function (MA) {
  var MONO = '"IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';
  var SANS = '"Helvetica Neue", Helvetica, Arial, "Segoe UI", Roboto, "Liberation Sans", sans-serif';

  /* plane: size factor of the aircraft glyph (js/glyphs.js)   trail: always a fading line, trailW its width factor
     lw: line weight factor   br: corner radius of badges in px at 1080p (matches --radius)   badge: brand | mono
     css: extra CSS custom properties for this look */
  var STYLES = {
    atc: {
      name: 'ATC', info: 'Tower-Radarschirm', font: 'mono', theme: 'dark',
      plane: 1, trail: 'line', trailW: 1.15, lw: 1, br: 3, weight: 500,
      css: { '--radius': '0.3vh', '--val-color': 'var(--accent)', '--unit-color': 'var(--sub)' },
      dark: { bg: '#040706', panel: '#09110d', ink: '#e6eee8', quiet: '#8fa597', line: '#1c2a22', accent: '#7fd99a',
        target: '#5fd0e8', caution: '#f0b04a', warning: '#ff6a60', special: '#e57ad8', ok: '#7fd99a',
        water: '#1f3d44', land: '#9fb8a8' },
      light: { bg: '#f2f0e8', panel: '#e6e3d8', ink: '#1b1f1c', quiet: '#565d58', line: '#cbc7ba', accent: '#1d6b3c',
        target: '#005f86', caution: '#8f5000', warning: '#b81d1d', special: '#9b1c8a', ok: '#1d6b3c',
        water: '#a9bfc9', land: '#ffffff' }
    },
    terminal: {
      name: 'Terminal', info: 'Anzeigetafel (FIDS)', font: 'sans', theme: 'dark',
      plane: 1.05, trail: 'line', trailW: 1, lw: 1, br: 0, weight: 600,
      css: { '--radius': '0', '--val-color': 'var(--accent)', '--unit-color': 'var(--sub)', '--call-color': 'var(--accent)' },
      dark: { bg: '#071426', panel: '#0c1d38', ink: '#f4f6fa', quiet: '#9db0cc', line: '#1d3358', accent: '#ffd23f',
        target: '#6fd3ff', caution: '#ffb03a', warning: '#ff6b5e', special: '#f08be0', ok: '#5fdc8a',
        water: '#1d4468', land: '#6f8fc0' },
      light: { bg: '#eef1f6', panel: '#dfe5ee', ink: '#0b1c3a', quiet: '#4a5a78', line: '#c3ccdb', accent: '#7a5200',
        target: '#00588a', caution: '#8f5200', warning: '#b3261e', special: '#8d2a86', ok: '#1c6b3c',
        water: '#a9bfd6', land: '#ffffff' }
    },
    chart: {
      name: 'Karte', info: 'Luftfahrtkarte', font: 'mono', theme: 'light',
      plane: 1, trail: 'line', trailW: 1.1, lw: 1, br: 0, weight: 500, airportSpecial: true,
      css: { '--radius': '0', '--val-color': 'var(--accent)', '--unit-color': 'var(--sub)' },
      light: { bg: '#f1ede0', panel: '#e6e0cf', ink: '#1a2433', quiet: '#55606f', line: '#cfc7b2', accent: '#1a4f9a',
        target: '#0b6e99', caution: '#8a5200', warning: '#b3261e', special: '#9c1c6b', ok: '#1f6b3f',
        water: '#b5d1e3', land: '#ffffff' },
      dark: { bg: '#0c121b', panel: '#131b27', ink: '#dfe6ef', quiet: '#8e9bb0', line: '#243145', accent: '#7fb2f0',
        target: '#5fd0e8', caution: '#f0b04a', warning: '#ff6a5e', special: '#e57ac8', ok: '#6fdc8c',
        water: '#23425e', land: '#8aa0c0' }
    },
    airbus: {
      name: 'Airbus', info: 'ND + ECAM', font: 'sans', theme: 'dark',
      plane: 0.95, trail: 'line', trailW: 0.9, lw: 0.85, br: 0, weight: 500,
      css: { '--radius': '0', '--val-color': 'var(--accent)', '--unit-color': 'var(--target)' },
      dark: { bg: '#000000', panel: '#07090c', ink: '#f2f4f5', quiet: '#9aa4ad', line: '#1c2228', accent: '#4be37f',
        target: '#3fd8ff', caution: '#ffb100', warning: '#ff4d42', special: '#ee64e0', ok: '#4be37f',
        water: '#17394a', land: '#8aa0a8' },
      light: { bg: '#eef0f1', panel: '#e0e4e6', ink: '#12181c', quiet: '#4d5960', line: '#c5ccd0', accent: '#0a6e36',
        target: '#006a96', caution: '#8f5300', warning: '#b3261e', special: '#9a2a90', ok: '#0a6e36',
        water: '#a9c0cc', land: '#ffffff' }
    },
    boeing: {
      name: 'Boeing', info: 'ND + EICAS', font: 'sans', theme: 'dark',
      plane: 1.05, trail: 'line', trailW: 1.15, lw: 1.2, br: 5, weight: 600,
      css: { '--radius': '0.5vh', '--val-color': 'var(--accent)', '--unit-color': 'var(--target)' },
      dark: { bg: '#0b1118', panel: '#121b26', ink: '#eef2f6', quiet: '#93a1b2', line: '#223042', accent: '#5be08a',
        target: '#4cc9f0', caution: '#ffb52e', warning: '#ff5348', special: '#e46ad9', ok: '#5be08a',
        water: '#1c3f58', land: '#90a4bc' },
      light: { bg: '#e9edf1', panel: '#dbe1e8', ink: '#101820', quiet: '#4b5866', line: '#bcc6d1', accent: '#11703d',
        target: '#00608c', caution: '#8f5300', warning: '#b3261e', special: '#9a2a90', ok: '#11703d',
        water: '#a7bcd0', land: '#ffffff' }
    },
    night: {
      name: 'Nacht', info: 'Rot und Dunkelgrün, blendfrei', font: 'mono', theme: 'dark', fixedAccent: true,
      plane: 1, trail: 'line', trailW: 1.1, lw: 1, br: 3, weight: 500, badge: 'mono',
      css: { '--radius': '0.3vh', '--val-color': 'var(--ink)', '--unit-color': 'var(--sub)' },
      dark: { bg: '#000000', panel: '#080303', ink: '#e0604b', quiet: '#d0563f', line: '#2a0f0b', accent: '#4aa862',
        target: '#4aa862', caution: '#e0604b', warning: '#ff8a76', special: '#ff8a76', ok: '#4aa862',
        water: '#3a1a14', land: '#e0604b' }
    },
    military: {
      name: 'Militär', info: 'Taktische Anzeige, Oliv', font: 'mono', theme: 'dark',
      plane: 1, trail: 'line', trailW: 1.1, lw: 1, br: 0, weight: 500,
      css: { '--radius': '0', '--val-color': 'var(--accent)', '--unit-color': 'var(--sub)' },
      dark: { bg: '#0a0e08', panel: '#10160c', ink: '#d3dbb4', quiet: '#8e9973', line: '#232c1a', accent: '#a7c957',
        target: '#8fd6c8', caution: '#e0b040', warning: '#ff6e50', special: '#e48cd8', ok: '#a7c957',
        water: '#1f3328', land: '#9aa878' }
    }
  };

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
    if (!STYLES[style]) style = 'atc';
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

    var css = {
      '--bg': P.bg, '--panel': P.panel, '--ink': P.ink, '--dim': P.quiet,
      '--sub': ensure(mix(P.ink, P.panel, 0.22), surf, 4.5),
      '--attrib': ensure(mix(P.bg, P.ink, 0.55), [P.bg], 4.5),
      '--line': P.line, '--faint': mix(P.bg, P.ink, 0.12), '--pager': mix(P.panel, P.ink, 0.22),
      '--idle': mix(P.panel, P.ink, 0.3),
      '--accent': acc, '--target': P.target, '--caution': P.caution, '--warning': P.warning,
      '--special': P.special, '--ok': P.ok,
      '--badge-bg': badgeBg, '--badge-fg': badgeFg, '--badge-edge': badgeEdge,
      '--toast-bg': rgba(P.panel, 0.96), '--toast-line': rgba(P.special, 0.7),
      '--zebra': rgba(P.ink, light ? 0.04 : 0.035), '--head': mix(P.panel, P.ink, light ? 0.025 : 0.07),
      '--font': fam, '--weight': String(st.weight || 500)
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
    var c = {
      bg: P.bg,
      land: [rgba(P.land, (light ? 0.8 : 0.1) * br), rgba(P.land, 0)],
      water: wcol, halo: P.bg,
      ring: a(P.ink, light ? 0.16 : 0.14), ringMain: a(P.ink, light ? 0.5 : 0.45),
      tick: a(P.ink, light ? 0.55 : 0.5), tickMajor: a(P.ink, light ? 0.85 : 0.8),
      ringLabel: txt(0.62), tickLabel: txt(0.7),
      place: txt(0.6, [P.bg, P.water]), placeMajor: txt(0.86, [P.bg, P.water]), placeDot: a(P.ink, 0.5),
      runway: a(P.ink, 0.92), centerline: a(P.ink, light ? 0.3 : 0.26),
      airport: st.airportSpecial ? P.special : txt(0.86),
      home: P.ink, ink: rgb(P.ink), accent: rgb(acc), active: [0.8, 0.45],
      level: rgb(P.ink), target: rgb(P.target), special: rgb(P.special), alert: rgb(P.warning), caution: rgb(P.caution),
      label: P.ink, labelDim: txt(0.72), detail: txt(0.8), detailDim: txt(0.62),
      quiet: P.quiet,
      high: light ? 0.6 : 0.55,
      plane: st.plane || 1, trail: 'line', trailW: st.trailW || 1, lw: st.lw || 1, badgeR: st.br || 0, badgeMono: st.badge === 'mono',
      badgeBg: badgeBg, badgeFg: badgeFg, badgeEdge: badgeEdge, weight: st.weight || 500, font: fam,
      bgHex: P.bg, panelHex: P.panel, accentHex: acc, targetHex: P.target, specialHex: P.special, warningHex: P.warning,
      chart: chart
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
    resolve: resolve, apply: apply, ensure: ensure, ratio: ratio, mix: mix,
    fonts: { mono: MONO, sans: SANS },
    defaultTheme: function (name) { return (STYLES[name] && STYLES[name].theme) || 'dark'; }
  };
})(window.MA);
