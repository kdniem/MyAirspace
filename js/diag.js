/* Diagnostics log, kept on this device only (ES2017 classic script, no network, no dependencies).
   A ring buffer of at most 500 events in localStorage 'ma.diag' (in memory only when storage is blocked).
   Entries older than 72 h are dropped; writes are batched to at most one per second.
   Event: { t: ISO time UTC, k: kind, c: code, m: text (<= 120 chars), d: number or null }
   Kinds: data (failed poll, or the success that ends an outage), status (online/stale/offline),
   net (browser online/offline, tab visible/hidden), stall (frame gap > 2 s), error (script/promise
   error: file, line, message), sw (service worker registration), boot (version, style, theme, size),
   wake (wake lock on/off).
   d is in milliseconds where it means a time (request duration, data gap, data age, frame gap), else null.
   Privacy: only the four fields above are ever stored. Text is scrubbed (URLs, coordinates, callsign-like
   codes, and lat/lon/label/title/callsign/hex values removed). No location, IP address, callsign or flight
   data is logged. Nothing is sent anywhere.
   Viewing: ?diag=1 on the TV page shows a panel (summary of 24 h, last 30 events). On the setup page
   (section Erweitert) the log can be downloaded as .txt (user click only) or cleared; ?diag=export opens that section. */
(function () {
  var MA = window.MA = window.MA || {};
  var VERSION = 'v12';            // must match VERSION in sw.js (tools/tests/diag-test.cjs checks it)
  var KEY = 'ma.diag';
  var MAX_EVENTS = 500;
  var KEEP_MS = 72 * 3600 * 1000;
  var WINDOW_MS = 24 * 3600 * 1000;
  var STALL_MS = 2000;            // frame gap that counts as a stall
  var STALL_LOG_GAP_MS = 10000;   // at most one stall entry per 10 s
  var WARN_AGE_S = 30, ERR_AGE_S = 120;   // same thresholds as js/main.js (WARN_AGE_S, ERR_AGE_S)
  var MSG_MAX = 120;
  var KINDS = { data: 1, status: 1, net: 1, stall: 1, error: 1, sw: 1, boot: 1, wake: 1 };

  var clock = function () { return Date.now(); };
  function nowMs() { return clock(); }

  // the preview on the setup page is an iframe of the TV page: it logs nothing
  var embedded = true;
  try { embedded = window.top !== window.self; } catch (e) { embedded = true; }

  var storage = null;
  try { storage = window.localStorage || null; } catch (e) { storage = null; }
  var storeOk = !!storage;
  var mem = [];
  var pending = false;
  var lastState = null;           // last status reported (online / stale / offline)
  var prevData = null;            // 'ok' | 'fail' | null, this page load only
  var lastOkAt = 0;
  var lastFrameAt = 0, lastStallAt = 0;
  var boxCount = null, boxMsg = null, panelSum = null, panelList = null;

  function el(tag, css, text) {
    var n = document.createElement(tag);
    if (css) n.className = css;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }
  function iso(t) {
    var d = new Date(t);
    return isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
  }
  function hms(t) {
    var d = new Date(t), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  // Removes what must never be in the log, even when a caller passes it in a message.
  function scrub(v) {
    return String(v)
      .replace(/https?:\/\/\S+/gi, '[url]')
      .replace(/(lat|lon|label|title|callsign|hex|squawk|flight)=\S*/gi, '')
      .replace(/-?\d{1,3}\.\d{3,}/g, '#')          // coordinates
      .replace(/\b[A-Z]{3}\d{1,4}[A-Z]{0,2}\b/g, '#')  // callsign-like codes
      .replace(/\s+/g, ' ')
      .trim();
  }

  function prune(now) {
    var cut = now - KEEP_MS;
    mem = mem.filter(function (e) { return Date.parse(e.t) >= cut; });
  }

  function record(t, k, c, m, d) {
    if (embedded || !Object.prototype.hasOwnProperty.call(KINDS, k)) return;
    mem.push({
      t: iso(t),
      k: k,
      c: typeof c === 'number' && isFinite(c) ? Math.round(c) : scrub(c == null ? '' : c).slice(0, 16),
      m: scrub(m == null ? '' : m).slice(0, MSG_MAX),
      d: typeof d === 'number' && isFinite(d) ? Math.round(d) : null
    });
    prune(nowMs());
    if (mem.length > MAX_EVENTS) mem.splice(0, mem.length - MAX_EVENTS);
    touch();
  }

  /* ---------- storage: batched, at most one write per second ---------- */

  function touch() {
    if (pending) return;
    pending = true;
    setTimeout(flush, 1000);
  }
  function save() {
    if (!storeOk) return;
    try { storage.setItem(KEY, JSON.stringify(mem)); } catch (e) { storeOk = false; }
  }
  function flush() {
    pending = false;
    prune(nowMs());
    save();
    refresh();
  }
  function load() {
    if (!storage) return;
    try {
      var raw = storage.getItem(KEY);
      var arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return;
      mem = arr.filter(function (o) {
        return o && typeof o === 'object' && typeof o.t === 'string' && !isNaN(Date.parse(o.t)) &&
          Object.prototype.hasOwnProperty.call(KINDS, o.k);
      }).map(function (o) {   // only the four known fields survive a load
        return { t: o.t, k: o.k, c: typeof o.c === 'number' ? o.c : scrub(o.c == null ? '' : o.c).slice(0, 16),
          m: scrub(o.m == null ? '' : o.m).slice(0, MSG_MAX), d: typeof o.d === 'number' ? o.d : null };
      });
    } catch (e) { storeOk = false; mem = []; }
  }

  /* ---------- hooks (called from js/data.js, js/main.js, js/pwa.js) ---------- */

  // One poll of the aircraft feed. Failures are logged each time; a success is logged only when it
  // ends a failure run (or is the first one of this page load). d = gap since the last success (ms).
  function data(ok, info) {
    if (embedded) return;
    info = info || {};
    var t = nowMs(), name = info.name || '?';
    if (ok) {
      if (prevData !== 'ok') {
        var gap = lastOkAt ? t - lastOkAt : 0;
        record(t, 'data', 'ok', name + (prevData === 'fail' ? ' · wieder da' : ' · erste Antwort') +
          (gap ? ' · Lücke ' + Math.round(gap / 1000) + ' s' : ''), gap);
      }
      prevData = 'ok';
      lastOkAt = t;
      return;
    }
    var err = info.err || {};
    var ra = err.retryAfter ? Math.round(err.retryAfter / 1000) : 0;
    record(t, 'data', err.status || 0, name + ' · ' + errName(err) + (ra ? ' · Retry-After ' + ra + ' s' : ''), info.ms);
    prevData = 'fail';
  }
  function errName(err) {
    if (err.status) return 'HTTP ' + err.status;
    var m = String(err.message || '');
    if (m === 'timeout') return 'Zeitüberschreitung';
    if (/unexpected/.test(m)) return 'ungültige Antwort';
    if (err.name === 'SyntaxError') return 'ungültiges JSON';
    return 'keine Verbindung';
  }

  // Connection state as the screen shows it (js/main.js updateSummary); only changes are logged.
  function status(st, now) {
    if (embedded || !st) return;
    var t = now == null ? nowMs() : now, state, ageMs = 0;
    if (!st.lastOk) {
      if (!st.failures) return;               // still connecting: nothing to report yet
      state = 'offline';
    } else {
      ageMs = Math.max(0, t - st.dataAt);
      var age = ageMs / 1000;
      state = age >= ERR_AGE_S ? 'offline' : (age >= WARN_AGE_S ? 'stale' : 'online');
    }
    if (state === lastState) return;
    lastState = state;
    var txt = state === 'online' ? 'Daten frisch' :
      state === 'stale' ? 'Daten ' + Math.round(ageMs / 1000) + ' s alt' :
      st.lastOk ? 'keine Verbindung · Daten ' + Math.round(ageMs / 1000) + ' s alt' : 'keine Verbindung seit Start';
    record(t, 'status', state, txt, st.lastOk ? ageMs : null);
  }

  // Called once per animation frame: a frame gap over 2 s is a stall (tab hidden is not counted).
  function frame(now) {
    if (embedded) return;
    var t = now == null ? nowMs() : now;
    var gap = lastFrameAt ? t - lastFrameAt : 0;
    lastFrameAt = t;
    if (gap > STALL_MS && t - lastStallAt > STALL_LOG_GAP_MS) {
      lastStallAt = t;
      record(t, 'stall', 'frame', 'Bildwiederholung ausgesetzt', gap);
    }
  }

  // Generic entry for the other hooks, e.g. log('wake', 'an', 'Wake Lock aktiv').
  // Object form: only k, c, m and d are read; any other field (lat, lon, label, title, callsign ...) is ignored.
  function log(a, b, c, d) {
    if (a && typeof a === 'object') { record(nowMs(), a.k, a.c, a.m, a.d); return; }
    record(nowMs(), a, b, c, d);
  }

  /* ---------- summary: pure, tested in tools/tests/diag-test.cjs ---------- */

  function summarize(evs, now) {
    var from = now - WINDOW_MS;
    var s = { fails: 0, failsByStatus: {}, recoveries: 0, longestGapS: 0, toOffline: 0, toStale: 0, toOnline: 0,
      errors: 0, stalls: 0, longestStallS: 0, netOffline: 0, netOnline: 0 };
    var longest = 0, prev = null;
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i], t = Date.parse(e.t);
      if (!(t >= from && t <= now)) continue;
      if (e.k === 'data') {
        if (e.c === 'ok') { s.recoveries++; if (e.d) longest = Math.max(longest, e.d); }
        else {
          s.fails++;
          var key = String(e.c);
          s.failsByStatus[key] = (s.failsByStatus[key] || 0) + 1;
        }
      } else if (e.k === 'status') {
        if (prev !== null && prev !== e.c) {
          if (e.c === 'offline') s.toOffline++;
          else if (e.c === 'stale') s.toStale++;
          else if (e.c === 'online') s.toOnline++;
        }
        if (e.c !== 'online' && e.d) longest = Math.max(longest, e.d);
        prev = e.c;
      } else if (e.k === 'error') {
        s.errors++;
      } else if (e.k === 'stall') {
        s.stalls++;
        if (e.d) s.longestStallS = Math.max(s.longestStallS, Math.round(e.d / 1000));
      } else if (e.k === 'net') {
        if (e.c === 'offline') s.netOffline++;
        else if (e.c === 'online') s.netOnline++;
      }
    }
    s.longestGapS = Math.round(longest / 1000);
    return s;
  }
  function durText(sec) {
    return sec < 60 ? sec + ' s' : Math.floor(sec / 60) + ' min ' + (sec % 60) + ' s';
  }
  function summaryLines(s) {
    var parts = [];
    Object.keys(s.failsByStatus).forEach(function (k) {
      parts.push((k === '0' ? 'ohne Antwort' : 'HTTP ' + k) + ': ' + s.failsByStatus[k]);
    });
    return [
      'Letzte 24 h · Abfragen fehlgeschlagen: ' + s.fails + (parts.length ? ' (' + parts.join(', ') + ')' : ''),
      'längste Lücke ohne Daten: ' + durText(s.longestGapS) + ' · offline ' + s.toOffline + '× · veraltet ' +
        s.toStale + '× · wieder online ' + s.toOnline + '×',
      'Netz getrennt ' + s.netOffline + '× · Fehler ' + s.errors + ' · Bildhänger ' + s.stalls +
        (s.stalls ? ' (längster ' + durText(s.longestStallS) + ')' : '')
    ];
  }

  /* ---------- TV panel: ?diag=1 ---------- */

  function mountPanel() {
    if (embedded || !document.getElementById('radar')) return;
    var q = new URLSearchParams(location.search);
    if (q.get('diag') !== '1') return;
    // top-left under the brand block, above the board; the last 30 events in two columns of 15
    var panel = el('div');
    panel.id = 'diag-panel';
    // right edge stays left of the header's meta column (METAR line starts near 62 % of the width)
    panel.style.cssText = 'position:fixed;left:2.4vw;top:84px;width:min(720px,56vw);z-index:40;' +
      'pointer-events:none;background:rgba(5,6,7,0.9);color:#cfd8cc;border:1px solid #2b3530;border-radius:6px;' +
      'padding:10px 14px;box-sizing:border-box;font:13px/1.4 "IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace;';
    var head = el('div', '', 'DIAGNOSE · lokal, nicht übertragen · Zeit Ortszeit');
    head.style.cssText = 'color:#8fa39a;letter-spacing:0.08em;margin-bottom:4px';
    panelSum = el('div');
    panelSum.style.cssText = 'color:#e8eee6;margin-bottom:6px;white-space:pre-line';
    panelList = el('div');
    panelList.style.cssText = 'overflow:hidden;white-space:nowrap';
    panelCols = [el('div'), el('div')];
    panelCols.forEach(function (c) {
      c.style.cssText = 'float:left;width:50%;overflow:hidden;padding-right:12px;box-sizing:border-box';
      panelList.appendChild(c);
    });
    panel.appendChild(head);
    panel.appendChild(panelSum);
    panel.appendChild(panelList);
    document.body.appendChild(panel);
    refreshPanel();
    setInterval(refreshPanel, 5000);
  }
  var panelCols = null;
  function refreshPanel() {
    if (!panelSum) return;
    panelSum.textContent = summaryLines(summarize(mem, nowMs())).join('\n');
    panelCols.forEach(function (c) { while (c.firstChild) c.removeChild(c.firstChild); });
    mem.slice(-30).reverse().forEach(function (e, i) {
      var row = el('div', '', hms(Date.parse(e.t)) + '  ' + pad(e.k, 6) + ' ' + pad(e.c, 4) + ' ' + e.m);
      // failures and errors stand out; successes and state changes stay neutral
      row.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:' +
        (e.k === 'error' ? '#ff7a7a' : (e.k === 'stall' || (e.k === 'data' && e.c !== 'ok')) ? '#ffb547' : '#cfd8cc');
      panelCols[i < 15 ? 0 : 1].appendChild(row);
    });
  }

  /* ---------- setup page: Erweitert, ?diag=export ---------- */

  function mountSetup() {
    var box = document.getElementById('diag-box');
    if (!box) return;
    var q = new URLSearchParams(location.search);
    box.textContent = '';
    box.appendChild(el('p', 'note', 'Ein Protokoll über Verbindungsabbrüche, Fehler und Neustarts. Es bleibt auf diesem Gerät und wird nirgends hingeschickt. Es enthält keinen Standort, keine Rufzeichen, keine IP-Adresse und keine Flugdaten. Höchstens 500 Einträge aus 72 Stunden.'));
    boxCount = el('p', 'status');
    boxCount.setAttribute('role', 'status');
    var row = el('div', 'actions');
    var bDl = el('button', 'btn btn-lg', 'Diagnoseprotokoll herunterladen');
    bDl.type = 'button';
    var bClr = el('button', 'btn btn-lg', 'Protokoll leeren');
    bClr.type = 'button';
    row.appendChild(bDl);
    row.appendChild(bClr);
    boxMsg = el('p', 'status');
    boxMsg.setAttribute('role', 'status');
    box.appendChild(boxCount);
    box.appendChild(row);
    box.appendChild(boxMsg);
    bDl.addEventListener('click', download);
    bClr.addEventListener('click', clearLog);
    refreshBox();
    if (q.get('diag') === 'export') {   // shows the section only; nothing is downloaded without a click
      for (var n = box.parentNode; n; n = n.parentNode) if (n.tagName === 'DETAILS') n.open = true;
      try { bDl.focus(); } catch (e) { /* ignore */ }
    }
  }
  function refreshBox() {
    if (!boxCount) return;
    boxCount.textContent = 'Gespeicherte Einträge: ' + mem.length +
      (storeOk ? '' : ' · Browser-Speicher nicht verfügbar, das Protokoll gilt nur bis zum Schließen dieser Seite');
  }
  function refresh() {
    refreshBox();
    refreshPanel();
  }
  function exportText() {
    var now = nowMs();
    var lines = ['MyAirspace Diagnoseprotokoll', 'Version: ' + VERSION, 'Erstellt (UTC): ' + iso(now),
      'Einträge: ' + mem.length + ' (höchstens 500, 72 Stunden)',
      'Enthält keine Standort-, Rufzeichen- oder IP-Daten. Nichts davon wurde übertragen.', '',
      'Zusammenfassung'].concat(summaryLines(summarize(mem, now)), ['',
      'Zeit (UTC)                 Art     Code  Meldung  [d = Millisekunden]']);
    mem.forEach(function (e) {
      lines.push(e.t + '  ' + pad(e.k, 6) + '  ' + pad(e.c, 4) + '  ' + e.m + (e.d === null ? '' : '  [d=' + e.d + ']'));
    });
    return lines.join('\n') + '\n';
  }
  function download() {
    try {
      var text = exportText();
      var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      var stamp = iso(nowMs());
      a.href = url;
      a.download = 'myairspace-diagnose-' + stamp.slice(0, 10).replace(/-/g, '') + '-' + stamp.slice(11, 16).replace(':', '') + '.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      if (boxMsg) boxMsg.textContent = 'Protokoll heruntergeladen (' + mem.length + ' Einträge).';
    } catch (e) {
      if (boxMsg) boxMsg.textContent = 'Download ist in diesem Browser nicht möglich.';
    }
  }
  function clearLog() {
    if (!window.confirm('Diagnoseprotokoll wirklich leeren?')) return;
    mem = [];
    if (storage) { try { storage.removeItem(KEY); } catch (e) { /* ignore */ } }
    refresh();
    if (boxMsg) boxMsg.textContent = 'Protokoll geleert.';
  }

  /* ---------- start ---------- */

  function boot() {
    var c = MA.config || {};
    var page = document.getElementById('radar') ? (c.demo ? 'Demo' : 'Radar') : 'Einrichtung';
    var size = (window.innerWidth || '?') + 'x' + (window.innerHeight || '?');
    record(nowMs(), 'boot', VERSION, page + ' · Stil ' + (c.style || '-') + ' · ' + (c.theme || '-') + ' · ' + size, null);
  }
  function init() {
    boot();
    mountPanel();
    mountSetup();
  }

  // listeners that only record (no state of the app is read or changed)
  window.addEventListener('online', function () { record(nowMs(), 'net', 'online', 'Netzwerk wieder verbunden', null); });
  window.addEventListener('offline', function () { record(nowMs(), 'net', 'offline', 'Netzwerk getrennt', null); });
  document.addEventListener('visibilitychange', function () {
    var hidden = document.visibilityState === 'hidden';
    lastFrameAt = 0;                       // a hidden tab stops frames: not a stall
    record(nowMs(), 'net', hidden ? 'verborgen' : 'sichtbar', hidden ? 'Seite im Hintergrund' : 'Seite wieder sichtbar', null);
  });
  window.addEventListener('error', function (e) {
    var file = String(e.filename || '').split('/').pop().split('?')[0] || '?';
    var line = e.lineno || 0;
    record(nowMs(), 'error', 'js', file + ':' + line + ' ' + (e.message || 'Fehler'), null);
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason, msg;
    try { msg = r && r.message ? r.message : String(r); } catch (x) { msg = 'Promise abgelehnt'; }
    record(nowMs(), 'error', 'promise', msg, null);
  });
  window.addEventListener('pagehide', function () { if (pending) flush(); });

  function guard(fn) {   // diagnostics must never break the app
    return function () { try { return fn.apply(this, arguments); } catch (e) { return undefined; } };
  }

  load();
  prune(nowMs());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', guard(init));
  else guard(init)();

  MA.diag = {
    VERSION: VERSION,
    log: guard(log),
    data: guard(data),
    status: guard(status),
    frame: guard(frame),
    summary: function (now) { return summarize(mem, now == null ? nowMs() : now); },
    summarize: summarize,            // pure: (events, now) -> summary, tested
    lines: summaryLines,
    events: function () { return mem.slice(); },
    clear: function () { mem = []; if (storage) { try { storage.removeItem(KEY); } catch (e) { /* ignore */ } } },
    exportText: exportText,
    // tests only: injectable clock, direct access to the time-stamped log, pruning and flushing
    _setClock: function (fn) { clock = fn; },
    _logAt: function (t, k, c, m, d) { record(t, k, c, m, d); },
    _prune: function () { prune(nowMs()); },
    _flush: function () { flush(); },
    _scrub: scrub
  };
})();
