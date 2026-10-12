/* Which aircraft the board shows ("featured"): calm selection, pure logic without DOM or timers.
     MA.pick.create()                          -> state
     MA.pick.next(state, list, now, cfg)       -> the featured aircraft of `list` (or null); updates state
   list: aircraft nearest first, each {hex, dist (km), fade (0..1), special: {alert}|null};
   cfg: {radiusKm, rotateSec}. State fields for the caller: hex, idx, count, inRange.
   Rules (tested in tools/tests/pick-test.cjs):
   - minimum dwell 12 s before any switch, except a NEW emergency squawk (7700/7600/7500) which jumps at once
   - the current aircraft stays while it is inside the radius and among the 6 nearest (no switching on rank changes)
   - rotation after rotateSec to the least recently shown of the 4 nearest, ties by hex (stable order); an aircraft
     shown within the last 30 s is not shown again (no A-B-A), unless the current one has left
   - a very close newcomer (< 2 km) takes over only if the current one is farther than 6 km or leaving
   - special (non-emergency) aircraft entering the radius jump the queue once per 30 min, at most once per two rotation slots */
(function (MA) {
  var FADE_MIN = 0.3;            // below this opacity an aircraft is no longer picked
  var MIN_DWELL_MS = 12000;
  var REPEAT_MS = 30000;         // do not return to an aircraft shown less than this long ago
  var SPECIAL_REPEAT_MS = 30 * 60 * 1000;
  var KEEP_RANK = 6;
  var POOL = 4;
  var TREND_MS = 3000;           // distance trend (leaving or approaching) is sampled this often

  function create() {
    return { hex: null, since: 0, jumpAt: -1e12, idx: 0, count: 0, inRange: 0, reason: '',
      jumped: {}, lastActive: {}, trend: {} };
  }

  function sortPool(cands, st) {
    return cands.slice().sort(function (a, b) {
      var la = st.lastActive[a.hex] || 0, lb = st.lastActive[b.hex] || 0;
      if (la !== lb) return la - lb;
      return a.hex < b.hex ? -1 : (a.hex > b.hex ? 1 : 0);
    });
  }

  function recent(st, hex, now) {
    return st.lastActive[hex] !== undefined && now - st.lastActive[hex] < REPEAT_MS;
  }

  function next(st, list, now, cfg) {
    var radius = cfg.radiusKm, rotMs = cfg.rotateSec * 1000, i, ac;
    var inRange = [];
    for (i = 0; i < list.length; i++) {
      ac = list[i];
      if (ac.dist <= radius * 1.15 && ac.fade >= FADE_MIN) inRange.push(ac);
    }
    // distance trend per aircraft
    var seen = {};
    for (i = 0; i < inRange.length; i++) {
      ac = inRange[i];
      seen[ac.hex] = true;
      var t = st.trend[ac.hex];
      if (!t) st.trend[ac.hex] = { d: ac.dist, t: now, leave: false };
      else if (now - t.t >= TREND_MS) { t.leave = ac.dist > t.d + 0.03; t.d = ac.dist; t.t = now; }
    }
    for (var h in st.trend) if (!seen[h]) delete st.trend[h];
    for (h in st.jumped) if (now - st.jumped[h] > SPECIAL_REPEAT_MS) delete st.jumped[h];
    for (h in st.lastActive) if (now - st.lastActive[h] > 10 * 60 * 1000) delete st.lastActive[h];

    st.inRange = inRange.length;
    if (!inRange.length) { st.hex = null; st.count = 0; st.idx = 0; return null; }

    var rankOf = {};
    for (i = 0; i < inRange.length; i++) rankOf[inRange[i].hex] = i;
    var cur = st.hex !== null && rankOf[st.hex] !== undefined ? inRange[rankOf[st.hex]] : null;
    var pool = inRange.slice(0, POOL);
    var dwell = now - st.since;
    var target = null, reason = '';

    // emergency squawk inside the radius: the one thing that may interrupt a dwell
    var alertAc = null;
    for (i = 0; i < inRange.length && inRange[i].dist <= radius; i++) {
      var e = inRange[i];
      if (e.special && e.special.alert && !st.jumped[e.hex]) { alertAc = e; break; }
    }
    if (alertAc) {
      st.jumped[alertAc.hex] = now;
      if (!cur || alertAc.hex !== cur.hex) { target = alertAc; reason = 'emergency'; }
    }

    if (!target && !cur) {
      // the featured aircraft left: take the least recently shown, preferring one not shown a moment ago
      var all = sortPool(pool, st), fresh = all.filter(function (c) { return !recent(st, c.hex, now); });
      target = (fresh.length ? fresh : all)[0];
      reason = 'left';
    }

    if (!target && dwell >= MIN_DWELL_MS) {
      // special aircraft (not emergencies) entering the radius: once per 30 min, rate limited
      var sp = null;
      if (now - st.jumpAt >= rotMs * 2) {
        for (i = 0; i < inRange.length && inRange[i].dist <= radius; i++) {
          var c = inRange[i];
          if (c.special && !st.jumped[c.hex] && c.hex !== cur.hex && !recent(st, c.hex, now)) { sp = c; break; }
        }
      }
      if (sp) { st.jumped[sp.hex] = now; target = sp; reason = 'special'; }
      var near = inRange[0];
      if (!target && near.hex !== cur.hex && near.dist < 2 && near.dist <= radius && !recent(st, near.hex, now) &&
        (cur.dist > 6 || (st.trend[cur.hex] && st.trend[cur.hex].leave))) { target = near; reason = 'close'; }
      if (!target) {
        // the jumped-to special keeps its slot for one rotation even beyond the 6 nearest
        var slot = st.since === st.jumpAt && dwell < rotMs;
        var keep = cur.dist <= radius && (rankOf[cur.hex] < KEEP_RANK || slot);
        if (dwell >= rotMs || !keep) {
          var cand = sortPool(pool, st).filter(function (c) { return c.hex !== cur.hex && !recent(st, c.hex, now); });
          if (cand.length) { target = cand[0]; reason = keep ? 'rotate' : 'out'; }
        }
      }
    }

    if (target && (!cur || target.hex !== cur.hex)) {
      if (cur) st.lastActive[cur.hex] = now;
      st.hex = target.hex;
      st.since = now;
      st.reason = reason;
      if (reason === 'emergency' || reason === 'special') st.jumpAt = now;
      cur = target;
    }
    st.lastActive[st.hex] = now;

    // pager: the pool plus the current one, in stable hex order
    var shown = pool.slice();
    if (shown.indexOf(cur) < 0) shown.push(cur);
    shown.sort(function (a, b) { return a.hex < b.hex ? -1 : (a.hex > b.hex ? 1 : 0); });
    st.count = shown.length;
    st.idx = shown.indexOf(cur);
    return cur;
  }

  MA.pick = { create: create, next: next, MIN_DWELL_MS: MIN_DWELL_MS };
})(window.MA);
