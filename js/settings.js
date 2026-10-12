/* Settings overlay on the dashboard: a small gear bottom left (above the flight board), opened by a tap or
   click on it or by the key S. Choices: Stil, Thema, Helligkeit, Ansicht, Karte (Luftfahrtkarte),
   Ebenen (Datenblöcke, Spuren, Ortsnamen, Wetter). Most apply at once. Ansicht "Flughafen", and any change
   to or from it, takes effect after "Neu laden", and the page says so.
   Values are saved in localStorage by js/prefs.js; the address still wins over them.
   Loaded after views.js and before main.js; the radar is reached through MA.radar (js/main.js) at change time.
   Not shown in the setup preview, without a pointer or touch (TV welcome), or when show= hides board or clock.
   Classic script, ES2017. */
(function (MA) {
  var cfg = MA.config;
  var prefs = MA.prefs;
  if (!cfg || !cfg.show || !prefs) return;

  var embedded = true;
  try { embedded = window.top !== window.self; } catch (e) { embedded = true; }
  var pointer = false;
  try {
    pointer = !!(window.matchMedia && (window.matchMedia('(any-pointer: fine)').matches || window.matchMedia('(any-pointer: coarse)').matches)) ||
      ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
  } catch (e) { pointer = false; }
  var chromeHidden = cfg.show.board === false || cfg.show.clock === false;
  if (embedded || !pointer || chromeHidden) return;
  if (cfg.wxRadar) document.body.classList.add('wx-radar');   // the rain legend sits above the board: the gear moves up (css)

  // what this page load started with: the focus view is laid out at start, so it changes only after a reload
  var loadedView = cfg.view;
  var runView = cfg.view;
  var trailDefault = cfg.trailMin || 4;          // Spuren switched on again: the length the page started with
  var weatherStarted = cfg.show.weather !== false;

  var COPY = {
    gear: 'Einstellungen', title: 'Einstellungen', close: 'Schließen',
    reload: 'wirkt nach Neuladen', reloadBtn: 'Neu laden', fixed: 'von der Adresse festgelegt',
    hint: 'Gespeichert auf diesem Gerät. Angaben in der Adresse haben Vorrang.',
    reset: 'Gespeicherte löschen'
  };

  // the values the controls show; they follow the page, the address is the start
  var val = {
    style: cfg.style, theme: cfg.theme, brightness: cfg.brightness, view: cfg.view,
    chartbg: !!cfg.chartbg, labels: !!cfg.show.labels, trails: !!cfg.show.trails,
    places: !!cfg.show.places, weather: cfg.show.weather !== false
  };

  var ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
    '<path d="M12 2.8l1.5 2.6 2.9-.6.6 2.9 2.6 1.5-1.2 2.7 1.2 2.7-2.6 1.5-.6 2.9-2.9-.6L12 21.2l-1.5-2.6-2.9.6-.6-2.9-2.6-1.5 1.2-2.7-1.2-2.7 2.6-1.5.6-2.9 2.9.6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';

  function styleOptions() {
    return Object.keys(MA.STYLES).map(function (k) {
      return '<option value="' + k + '">' + MA.STYLES[k].name + ' · ' + MA.STYLES[k].info + '</option>';
    }).join('');
  }
  function row(id, label, control, key) {
    return '<div class="set-row"><label class="set-lbl" for="' + id + '">' + label + '</label><div class="set-ctl">' + control +
      '<small class="set-note" id="note-' + key + '" hidden></small></div></div>';
  }
  function check(id, label, key) {
    return '<label class="set-check"><input type="checkbox" id="' + id + '" aria-describedby="note-' + key + '"><span>' + label + '</span></label>' +
      '<small class="set-note set-note-b" id="note-' + key + '" hidden></small>';
  }

  var HTML = '<div class="set-panel" role="dialog" aria-modal="true" aria-labelledby="set-title">' +
    '<div class="set-head"><h2 id="set-title" class="set-title">' + COPY.title + '</h2>' +
    '<button type="button" id="set-close" class="set-x" aria-label="' + COPY.close + '"><span aria-hidden="true">&times;</span></button></div>' +
    '<div class="set-body">' +
    row('set-style', 'Stil', '<select id="set-style" class="set-in" aria-describedby="note-style">' + styleOptions() + '</select>', 'style') +
    row('set-theme', 'Thema', '<select id="set-theme" class="set-in" aria-describedby="note-theme">' +
      '<option value="dark">Dunkel</option><option value="light">Hell</option><option value="auto">Automatisch</option></select>', 'theme') +
    row('set-brightness', 'Helligkeit', '<div class="set-range"><input id="set-brightness" type="range" min="0.5" max="1.2" step="0.05" aria-describedby="note-brightness">' +
      '<output id="set-brightness-out" for="set-brightness"></output></div>', 'brightness') +
    row('set-view', 'Ansicht', '<select id="set-view" class="set-in" aria-describedby="note-view">' +
      '<option value="auto">Wechselnd</option><option value="radar">Radar</option><option value="board">Tafel</option>' +
      '<option value="airport">Flughafen</option></select>', 'view') +
    '<fieldset class="set-group"><legend>Karte</legend>' +
      check('set-chartbg', 'Luftfahrtkarte als Hintergrund', 'chartbg') + '</fieldset>' +
    '<fieldset class="set-group"><legend>Ebenen</legend>' +
      check('set-labels', 'Datenblöcke', 'labels') + check('set-trails', 'Spuren', 'trails') +
      check('set-places', 'Ortsnamen', 'places') + check('set-weather', 'Wetter', 'weather') + '</fieldset>' +
    '</div>' +
    '<div class="set-foot"><p class="set-hint">' + COPY.hint + '</p>' +
    '<div class="set-actions"><button type="button" id="set-reload" class="set-btn set-primary" hidden>' + COPY.reloadBtn + '</button>' +
    '<button type="button" id="set-reset" class="set-btn">' + COPY.reset + '</button></div></div>' +
    '</div>';

  var btn = document.createElement('button');
  btn.id = 'set-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', COPY.gear);
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'set-layer');
  btn.innerHTML = ICON;
  document.body.appendChild(btn);

  var layer = document.createElement('div');
  layer.id = 'set-layer';
  layer.className = 'set-layer';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = HTML;
  document.body.appendChild(layer);
  var panel = layer.querySelector('.set-panel');

  function $(id) { return document.getElementById(id); }
  var E = {
    style: $('set-style'), theme: $('set-theme'), brightness: $('set-brightness'), bout: $('set-brightness-out'),
    view: $('set-view'), chartbg: $('set-chartbg'), labels: $('set-labels'), trails: $('set-trails'),
    places: $('set-places'), weather: $('set-weather'), reload: $('set-reload'), reset: $('set-reset'), close: $('set-close')
  };

  /* ---------- live changes: each one touches the page state the code reads at run time ---------- */

  function applyLook() {               // palette, fonts and style tokens (js/theme.js, js/radar.js)
    MA.theme.refresh();
    if (MA.radar) MA.radar.refresh();
  }

  var SET = {
    style: function (v) {
      cfg.style = v;
      if (!prefs.mentions(location.search, 'font')) cfg.font = MA.STYLES[v].font;   // the style's font, unless the address sets one
      applyLook();
    },
    theme: function (v) { MA.theme.setMode(v); },
    brightness: function (v) { cfg.brightness = v; applyLook(); },
    view: function (v) {
      if (v === 'airport' || loadedView === 'airport') return;   // needs a reload: see sync()
      cfg.view = v;
      runView = v;
    },
    chartbg: function (v) { cfg.chartbg = v; if (MA.radar) MA.radar.resize(); },   // rebuilds the cached base layer
    labels: function (v) { cfg.labels = v; cfg.show.labels = v; },
    trails: function (v) { cfg.show.trails = v; cfg.trailMin = v ? trailDefault : 0; },
    places: function (v) { cfg.places = v; cfg.show.places = v; if (MA.radar) MA.radar.resize(); },
    weather: function (v) {
      cfg.show.weather = v;
      if (v) {
        document.body.classList.remove('no-weather');
        if (!weatherStarted) { weatherStarted = true; MA.weather.start(cfg); }   // it was never started: no second loop
      } else {
        document.body.classList.add('no-weather');
      }
    }
  };

  function change(key, v) {
    val[key] = v;
    SET[key](v);
    prefs.save(key, v);
    sync();
  }

  /* ---------- controls ---------- */

  var KEYS = ['style', 'theme', 'brightness', 'view', 'chartbg', 'labels', 'trails', 'places', 'weather'];

  function sync() {
    E.style.value = val.style;
    E.theme.value = val.theme;
    E.brightness.value = String(val.brightness);
    E.bout.textContent = Math.round(val.brightness * 100) + ' %';
    E.view.value = val.view;
    E.chartbg.checked = val.chartbg;
    E.labels.checked = val.labels;
    E.trails.checked = val.trails;
    E.places.checked = val.places;
    E.weather.checked = val.weather;
    var reload = val.view !== runView;           // the chosen view is not running yet
    E.reload.hidden = !reload;
    KEYS.forEach(function (k) {
      var parts = [];
      if (k === 'view' && reload) parts.push(COPY.reload);
      if (prefs.mentions(location.search, k)) parts.push(COPY.fixed);
      var el = $('note-' + k);
      el.textContent = parts.join(' · ');
      el.hidden = !parts.length;
    });
  }

  [['style', E.style], ['theme', E.theme], ['view', E.view]].forEach(function (pair) {
    pair[1].addEventListener('change', function () { change(pair[0], pair[1].value); });
  });
  ['chartbg', 'labels', 'trails', 'places', 'weather'].forEach(function (k) {
    E[k].addEventListener('change', function () { change(k, E[k].checked); });
  });
  E.brightness.addEventListener('input', function () { change('brightness', Math.round(parseFloat(E.brightness.value) * 100) / 100); });
  E.reload.addEventListener('click', function () { location.reload(); });
  E.reset.addEventListener('click', function () { prefs.clear(); location.reload(); });
  E.close.addEventListener('click', function () { close(); });
  layer.addEventListener('click', function (e) { if (e.target === layer) close(); });   // tap or click on the backdrop

  /* ---------- open, close, focus ---------- */

  var isOpen = false, returnTo = null, hover = false, timer = 0;
  var HIDE_MS = 3000, FIRST_MS = 6000;   // the gear: faint, shown on movement or touch, and for a few seconds on load

  function reveal() {
    btn.classList.add('on');
    clearTimeout(timer);
    timer = setTimeout(tick, HIDE_MS);
  }
  function tick() {
    if (hover || isOpen) { timer = setTimeout(tick, HIDE_MS); return; }
    btn.classList.remove('on');
  }

  function focusables() {
    return Array.prototype.slice.call(panel.querySelectorAll('button, select, input')).filter(function (el) {
      return !el.disabled && el.offsetParent !== null;
    });
  }
  function focusFirst() {
    var list = focusables();
    if (list.length) list[0].focus();
  }

  function open() {
    if (isOpen) return;
    returnTo = document.activeElement && document.activeElement !== document.body ? document.activeElement : btn;
    isOpen = true;
    sync();
    layer.classList.add('open');
    layer.setAttribute('aria-hidden', 'false');
    btn.setAttribute('aria-expanded', 'true');
    reveal();
    focusFirst();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    layer.classList.remove('open');
    layer.setAttribute('aria-hidden', 'true');
    btn.setAttribute('aria-expanded', 'false');
    var back = returnTo && document.body.contains(returnTo) ? returnTo : btn;
    back.focus();
    reveal();
  }

  btn.addEventListener('click', function () { if (isOpen) close(); else open(); });
  btn.addEventListener('mouseenter', function () { hover = true; reveal(); });
  btn.addEventListener('mouseleave', function () { hover = false; reveal(); });
  document.addEventListener('mousemove', reveal);
  document.addEventListener('touchstart', reveal, { passive: true });

  // focus stays inside the dialog while it is open
  layer.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;
    var list = focusables();
    if (!list.length) { e.preventDefault(); return; }
    var first = list[0], last = list[list.length - 1], a = document.activeElement;
    if (e.shiftKey && (a === first || !layer.contains(a))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (a === last || !layer.contains(a))) { e.preventDefault(); first.focus(); }
  });
  document.addEventListener('focusin', function (e) {
    if (isOpen && !layer.contains(e.target)) focusFirst();
  });

  function typing(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    var t = el.tagName;
    return t === 'TEXTAREA' || t === 'SELECT' || (t === 'INPUT' && el.type !== 'checkbox' && el.type !== 'range');
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.key === 'Esc') {
      if (isOpen) { e.preventDefault(); close(); }
      return;
    }
    if ((e.key === 's' || e.key === 'S') && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e.target)) {
      e.preventDefault();
      if (isOpen) close(); else open();
    }
  });

  sync();
  reveal();
  clearTimeout(timer);
  timer = setTimeout(tick, FIRST_MS);

  MA.settings = {
    open: open,
    close: close,
    isOpen: function () { return isOpen; }
  };
})(window.MA);
