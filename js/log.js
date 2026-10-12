/* Daily log of every pass through the radius (MA.config.radiusKm), kept in
   localStorage per calendar day. One entry per pass: an aircraft that comes
   back after a longer gap (e.g. the next rotation) counts again. */
(function (MA) {
  var cfg = MA.config;
  var PREFIX = 'myairspace.log.';
  var MAX_ENTRIES = 2000;
  var NEW_PASS_MS = 20 * 60 * 1000;   // gap after which the same hex is a new pass
  var SAVE_MS = 10 * 1000;            // throttle localStorage writes

  // Rough size order (length/wingspan/MTOW) of large types for "Größter".
  var SIZE = {
    A388: 100, B748: 96, B744: 94, B742: 93, A337: 91, A3ST: 90, AN12: 60,
    B77W: 88, A35K: 88, B779: 87, A346: 86, B77L: 85, B772: 84, B773: 84,
    A359: 82, B78X: 81, A345: 80, A343: 79, A339: 78, A333: 78, B789: 77,
    MD11: 76, A332: 75, A342: 74, B788: 73, B764: 72, B763: 70, B762: 68,
    A400: 66, A310: 65, A306: 64, IL76: 64, C17: 80, B753: 58, B752: 56
  };

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(t) {
    var d = new Date(t);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function prevDayKey(t) {
    var d = new Date(t);
    return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 12).getTime());
  }

  // All storage access is guarded: private mode, disabled storage or a full quota must never break the radar.
  function store() {
    try { return window.localStorage || null; } catch (e) { return null; }
  }
  function read(key) {
    var s = store();
    if (!s) return null;
    try {
      var data = JSON.parse(s.getItem(key));
      return data && data.entries && data.entries.length !== undefined ? data.entries : null;
    } catch (e) { return null; }
  }
  function write(key, list) {
    var s = store();
    if (!s) return false;
    try { s.setItem(key, JSON.stringify({ v: 1, entries: list })); return true; } catch (e) { return false; }
  }
  // keep only today and yesterday
  function prune(now) {
    var s = store();
    if (!s) return;
    try {
      var keep = {}, drop = [];
      keep[PREFIX + dayKey(now)] = true;
      keep[PREFIX + prevDayKey(now)] = true;
      for (var i = 0; i < s.length; i++) {
        var k = s.key(i);
        if (k && k.indexOf(PREFIX) === 0 && !keep[k]) drop.push(k);
      }
      drop.forEach(function (k) { s.removeItem(k); });
    } catch (e) { /* ignore */ }
  }

  var day = null, entries = [], open = {}, dirty = false, savedAt = 0;

  function load(now) {
    day = dayKey(now);
    entries = read(PREFIX + day) || [];
    open = {};
    entries.forEach(function (e) {
      if (!open[e.hex] || open[e.hex].last < e.last) open[e.hex] = e;
    });
    dirty = false;
    savedAt = now;
    prune(now);
  }

  function save(now) {
    if (!dirty || !day) return;
    if (!write(PREFIX + day, entries)) {
      // quota: drop yesterday and retry once
      var s = store();
      try { if (s) s.removeItem(PREFIX + prevDayKey(now)); } catch (e) { /* ignore */ }
      write(PREFIX + day, entries);
    }
    dirty = false;
    savedAt = now;
  }

  function cap() {
    if (entries.length <= MAX_ENTRIES) return;
    entries.sort(function (a, b) { return a.last - b.last; });
    entries = entries.slice(entries.length - MAX_ENTRIES);
    open = {};
    entries.forEach(function (e) { open[e.hex] = e; });
  }

  function observe(list, now) {
    if (day === null) load(now);
    if (dayKey(now) !== day) {
      save(now);
      load(now);
    }
    for (var i = 0; i < list.length; i++) {
      var ac = list[i];
      if (!ac || !ac.hex || !(ac.dist <= cfg.radiusKm)) continue;
      var e = open[ac.hex];
      if (!e || now - e.last > NEW_PASS_MS) {
        e = { hex: ac.hex, cs: '', al: '', t: '', reg: '', from: '', to: '',
          first: now, last: now, dmin: 1e9, tmin: now, altC: null, amin: null, amax: null, ph: 'level' };
        entries.push(e);
        open[ac.hex] = e;
      }
      e.last = now;
      if (ac.callsign) { e.cs = ac.callsign; e.al = MA.fmt.airline(ac.callsign) || e.al; }
      if (ac.type) e.t = ac.type;
      if (ac.reg) e.reg = ac.reg;
      var alt = typeof ac.alt === 'number' ? ac.alt : null;
      if (alt !== null) {
        if (e.amin === null || alt < e.amin) e.amin = alt;
        if (e.amax === null || alt > e.amax) e.amax = alt;
      }
      if (ac.dist < e.dmin) {
        e.dmin = ac.dist;
        e.tmin = now;
        e.altC = alt;
        e.ph = MA.fmt.phase(ac);
      }
      // routes arrive asynchronously: fill in (or refresh) the leg while the aircraft is in range
      var leg = MA.data && MA.data.leg ? MA.data.leg(ac) : null;
      if (leg && leg[0] && leg[1]) { e.from = leg[0].code || ''; e.to = leg[1].code || ''; }
      dirty = true;
    }
    cap();
    if (dirty && now - savedAt >= SAVE_MS) save(now);
  }

  function status(ph, alt) {
    var low = alt !== null && alt !== undefined && alt < 12000;
    if (ph === 'down' && low) return 'LANDUNG';
    if (ph === 'up' && low) return 'START';
    return 'ÜBERFLUG';
  }

  // newest pass first; ordered by entry into the radius so rows stay put while an aircraft is still approaching
  function recent(n) {
    var list = entries.slice();
    list.sort(function (a, b) { return b.first - a.first || b.tmin - a.tmin; });
    return list.slice(0, n || 10);
  }

  function top(counts) {
    var best = null;
    for (var k in counts) if (!best || counts[k] > best.n) best = { name: k, n: counts[k] };
    return best;
  }

  function stats() {
    var airlines = {}, types = {}, lowest = null, nearest = null, biggest = null;
    entries.forEach(function (e) {
      if (e.al) airlines[e.al] = (airlines[e.al] || 0) + 1;
      if (e.t) types[e.t] = (types[e.t] || 0) + 1;
      if (e.altC !== null && e.altC !== undefined && (!lowest || e.altC < lowest.alt)) lowest = { alt: e.altC, cs: e.cs || e.reg || e.hex };
      if (e.dmin < 1e9 && (!nearest || e.dmin < nearest.km)) nearest = { km: e.dmin, cs: e.cs || e.reg || e.hex };
      var size = SIZE[e.t];
      if (size && (!biggest || size > biggest.size)) biggest = { type: e.t, cs: e.cs || e.reg || e.hex, size: size };
    });
    return {
      count: entries.length,
      topAirline: top(airlines),
      topType: top(types),
      lowest: lowest,
      nearest: nearest,
      biggest: biggest
    };
  }

  function flush() { save(Date.now()); }
  if (window.addEventListener) {
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flush();
    });
  }

  MA.log = {
    observe: observe,
    recent: recent,
    stats: stats,
    status: status,
    count: function () { return entries.length; },
    entries: function () { return entries; },
    save: function (now) { dirty = true; save(now || Date.now()); },
    _reset: function () { day = null; entries = []; open = {}; dirty = false; savedAt = 0; },
    _key: function (t) { return PREFIX + dayKey(t); }
  };
})(window.MA);
