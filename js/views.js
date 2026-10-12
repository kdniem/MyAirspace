/* Second view: "Anzeigetafel" with the latest passes and today's statistics.
   Part of the rotation (view=auto, views=radar,board,airport, see js/rotation.js), or forced with view=board.
   The radar keeps running underneath; this only crossfades an overlay. The focus view (airport) is a canvas
   mode switched by js/main.js, which asks MA.views.current() every frame. */
(function (MA) {
  var cfg = MA.config;
  var ROWS = 10;
  var REFRESH_MS = 5000;
  var DAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  var MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August',
    'September', 'Oktober', 'November', 'Dezember'];
  var COLS = ['time', 'flight', 'airline', 'type', 'route', 'alt', 'dist', 'status'];

  function $(id) { return document.getElementById(id); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var el = { heading: $('lv-heading'), date: $('lv-date'), rows: $('lv-rows'), stats: $('lv-stats') };
  $('lv-h-alt').textContent = cfg.units === 'm' ? 'ALT M' : 'ALT FT';
  var rows = [];
  for (var i = 0; i < ROWS; i++) {
    var row = document.createElement('div');
    row.className = 'lv-row';
    var cells = {};
    COLS.forEach(function (c) {
      var d = document.createElement('div');
      d.className = 'c c-' + c + ' led';
      row.appendChild(d);
      cells[c] = d;
      if (c === 'airline') {   // badge in front of the airline name: the flap text lives in its own span
        d.className = 'c c-airline';
        var b = document.createElement('span'), t = document.createElement('span');
        b.className = 'logo';
        t.className = 'lv-airline';
        d.appendChild(b);
        d.appendChild(t);
        cells.logo = b;
        cells[c] = t;
      }
    });
    el.rows.appendChild(row);
    rows.push({ el: row, cells: cells });
  }

  var state = { shown: false, rendered: 0, timers: [] };
  // the rotation: [radar, board, airport] with their durations (config radarsec, boardsec, airportsec)
  var sched = MA.rotation.create(cfg.views, {
    radar: cfg.radarSec * 1000, board: cfg.boardSec * 1000, airport: cfg.airportSec * 1000
  });

  function rowTexts(e) {
    var f = MA.fmt, d = new Date(e.tmin);
    var alt = f.alt(e.altC, cfg.units);
    return {
      logo: MA.badge.html(MA.badge.info({ callsign: e.cs, type: e.t }), MA.STYLES[cfg.style].badge === 'mono'),
      time: pad(d.getHours()) + ':' + pad(d.getMinutes()),
      flight: (e.cs || e.reg || e.hex).toUpperCase(),
      airline: (e.al || '—').toUpperCase(),
      type: (e.t || '—').toUpperCase(),
      route: e.from && e.to ? e.from + ' → ' + e.to : '—',
      alt: alt.val,
      dist: f.km(e.dmin),
      status: MA.log.status(e.ph, e.altC)
    };
  }

  function later(fn, ms) { state.timers.push(setTimeout(fn, ms)); }

  function renderRows(animate) {
    var list = MA.log.recent(ROWS);
    rows.forEach(function (r, i) {
      var e = list[i];
      var texts = e ? rowTexts(e) : null;
      var cls = 'lv-row' + (e ? ' ph-' + e.ph : ' empty') + (i === 0 && e ? ' newest' : '');
      var id = e ? e.hex + '@' + e.first : '';
      var anim = animate || r.id !== id;
      r.id = id;
      var apply = function () {
        r.el.className = cls;
        COLS.forEach(function (c) { MA.flap(r.cells[c], texts ? texts[c] : '', anim); });
        var lg = texts ? texts.logo : '';
        if (r.cells.logo._html !== lg) { r.cells.logo._html = lg; r.cells.logo.innerHTML = lg; }
        // a new passing at the top while the table is up: one light sweep across that row (css/motion.css)
        if (!animate && i === 0 && e && anim && MA.motion.enabled()) sweepRow(r.el);
      };
      if (animate) later(apply, 350 + i * 110); else apply();
    });
  }

  function sweepRow(el) {
    el.className += ' hl';
    later(function () { el.className = el.className.replace(' hl', ''); }, MA.motion.rowHighlightMs());
  }

  function stat(label, value, extra) {
    return '<div class="st"><div class="st-l">' + esc(label) + '</div><div class="st-v">' + esc(value) + '</div>' +
      '<div class="st-x">' + esc(extra || '') + '</div></div>';
  }

  function renderStats() {
    var s = MA.log.stats(), f = MA.fmt, parts = [];
    parts.push(stat('Heute', String(s.count), (s.count === 1 ? 'Überflug' : 'Überflüge') + ' · ' + cfg.radiusKm + ' km'));
    if (s.topAirline) parts.push(stat('Häufigste Airline', s.topAirline.name, s.topAirline.n + '×'));
    if (s.topType) parts.push(stat('Häufigstes Muster', f.typeName(s.topType.name), s.topType.n + '×'));
    if (s.lowest) {
      var a = f.alt(s.lowest.alt, cfg.units);
      parts.push(stat('Tiefster', a.unit === 'ft' || a.unit === 'm' ? a.val + ' ' + a.unit : a.val, s.lowest.cs));
    }
    if (s.nearest) parts.push(stat('Nächster', f.km(s.nearest.km) + ' km', s.nearest.cs));
    if (s.biggest) parts.push(stat('Größter', s.biggest.type, s.biggest.cs));
    var html = parts.join('');
    if (el.stats._html !== html) { el.stats._html = html; el.stats.innerHTML = html; }
  }

  function renderTitle(now) {
    var d = new Date(now);
    MA.flap(el.heading, 'LETZTE ÜBERFLÜGE · ' + cfg.label);
    el.date.textContent = DAYS[d.getDay()] + ', ' + d.getDate() + '. ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  // reset the flap targets so the next appearance scrambles in again
  function clear() {
    state.timers.forEach(clearTimeout);
    state.timers = [];
    rows.forEach(function (r) {
      r.id = null;
      COLS.forEach(function (c) { MA.flap(r.cells[c], '', false); });
      r.cells.logo._html = '';
      r.cells.logo.innerHTML = '';
    });
    MA.flap(el.heading, '', false);
  }

  function show(now) {
    state.shown = true;
    state.rendered = now;
    document.body.classList.add('view-board');
    renderTitle(now);
    renderStats();
    renderRows(true);
  }

  function hide() {
    state.shown = false;
    document.body.classList.remove('view-board');
    later(clear, 1800); // after the crossfade
  }

  // Called once a second by js/main.js. The schedule decides; the board overlay follows it.
  function tick(now) {
    if (cfg.view === 'auto') {
      sched.tick(now, MA.log.count() > 0);
      var cur = sched.name();
      if (cur === 'board' && !state.shown) show(now);
      else if (cur !== 'board' && state.shown) hide();
    } else if (cfg.view === 'board') {            // a fixed view, possibly switched live in the settings overlay
      if (!state.shown) show(now);
    } else if (state.shown) hide();
    if (state.shown && now - state.rendered >= REFRESH_MS) {
      state.rendered = now;
      renderTitle(now);
      renderStats();
      renderRows(false);
    }
  }

  MA.views = {
    tick: tick,
    current: function () { return sched.name(); }   // 'radar' | 'board' | 'airport'
  };
})(window.MA);
