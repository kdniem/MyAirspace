/* Second view: "Anzeigetafel" with the latest passes and today's statistics.
   Alternates with the radar (view=auto), or is forced with view=board / view=radar.
   The radar keeps running underneath; this only crossfades an overlay. */
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

  var state = { shown: false, since: 0, rendered: 0, timers: [] };

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
      };
      if (animate) later(apply, 350 + i * 110); else apply();
    });
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
    state.since = now;
    state.rendered = now;
    document.body.classList.add('view-board');
    renderTitle(now);
    renderStats();
    renderRows(true);
  }

  function hide(now) {
    state.shown = false;
    state.since = now;
    document.body.classList.remove('view-board');
    later(clear, 1800); // after the crossfade
  }

  function tick(now) {
    if (!state.since) state.since = now;
    var mode = cfg.view;
    if (mode === 'radar' || mode === 'airport') return;   // the focus view has no overlay
    if (mode === 'board') {
      if (!state.shown) show(now);
    } else if (state.shown) {
      if (now - state.since >= cfg.boardSec * 1000) { hide(now); return; }
    } else if (now - state.since >= cfg.radarSec * 1000 && MA.log.count() > 0) {
      show(now);
      return;
    }
    if (state.shown && now - state.rendered >= REFRESH_MS) {
      state.rendered = now;
      renderTitle(now);
      renderStats();
      renderRows(false);
    }
  }

  MA.views = {
    tick: tick,
    current: function () { return state.shown ? 'board' : 'radar'; }
  };
})(window.MA);
