/* Live traffic providers. All are free and keyless; every provider is normalised
   to one aircraft model:
   { hex, callsign, reg, type, desc, category, lat, lon, alt (ft), onGround,
     gs (kt), track (deg), vrate (ft/min), squawk, ts (ms epoch of position) } */
(function (MA) {
  var KM_PER_NM = 1.852;

  function trim(s) { return s ? String(s).trim() : ''; }

  /* Retry-After as milliseconds: only the delta-seconds form (the proxy sends that), capped at
     two minutes; anything else counts as "not given" (0). */
  function parseRetryAfter(v) {
    if (typeof v !== 'string' || !/^\s*\d{1,6}\s*$/.test(v)) return 0;
    return Math.min(120, parseInt(v, 10)) * 1000;
  }

  /* Delay before the next poll (ms), a pure function so it can be tested (tools/tests/poll-test.cjs).
     baseMs: normal interval; failures: failed polls in a row; recover: polls still to be taken
     gently after a recovery; retryAfterMs: the server's Retry-After (0 = none); jitter: 0..1 (0.5 = none).
     Failing: exponential back-off up to 60 s, never sooner than Retry-After (up to 120 s).
     Recovering: back to the normal interval step by step (+50 % per remaining step), so a feed that
     was just throttled is not hit at full rate right away. Normal: exactly baseMs. */
  function pollDelay(o) {
    var base = o.baseMs, d = base;
    var jitter = typeof o.jitter === 'number' ? o.jitter : 0.5;
    if (o.failures > 0) {
      d = Math.min(60000, base * Math.pow(1.6, o.failures));
      if (o.retryAfterMs > 0) d = Math.max(d, Math.min(o.retryAfterMs, 120000));
    } else if (o.recover > 0) {
      d = base * (1 + 0.5 * o.recover);
    }
    return Math.round(d * (1 + 0.2 * (jitter - 0.5)));
  }

  function fetchJson(url, opts, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; reject(new Error('timeout')); }
      }, timeoutMs || 8000);
      fetch(url, opts).then(function (res) {
        if (!res.ok) {
          var e = new Error('HTTP ' + res.status);
          e.status = res.status;
          e.retryAfter = parseRetryAfter(res.headers && res.headers.get && res.headers.get('Retry-After'));
          throw e;
        }
        return res.json();
      }).then(function (json) {
        if (!done) { done = true; clearTimeout(timer); resolve(json); }
      }, function (err) {
        if (!done) { done = true; clearTimeout(timer); reject(err); }
      });
    });
  }

  /* Most flight APIs send no CORS headers, so browsers block direct calls.
     Each request goes through the own proxy (api/proxy.js on Vercel), then direct. Public
     CORS proxies (third parties see the request) are used only with ?public=1. The first
     route that works is remembered per endpoint, in memory only (never in localStorage). */
  var PUBLIC_PROXIES = [
    function (u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); },
    function (u) { return 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(u); }
  ];
  var preferred = {}; // host -> route index

  function proxyRoutes(post, directFirst) {
    var own = MA.config.proxy;
    var direct = function (u) { return u; };    // only for endpoints known to send CORS (route API)
    if (post) return [direct];                  // no proxy relays POST
    var list = MA.config.public ? PUBLIC_PROXIES.slice() : [];
    if (own) {
      var ownRoute = function (u) { return own + (own.indexOf('?') >= 0 ? '&' : '?') + 'url=' + encodeURIComponent(u); };
      ownRoute.own = true;
      list.unshift(ownRoute);
    }
    // no direct request to flight or weather providers: they would see the visitor's IP and position
    return directFirst ? [direct].concat(list) : list;
  }

  // `valid` rejects error bodies that arrive as HTTP 200 (e.g. a rate-limited
  // proxy), so the next route is tried instead of showing an empty sky.
  function getJson(url, opts, timeoutMs, valid, directFirst) {
    var post = !!(opts && opts.method === 'POST');
    // remember the working route per endpoint (host + first path segments), not per host:
    // adsb.lol's route API sends CORS headers, its aircraft API does not
    var host = url.split('/').slice(2, 5).join('/') + (post ? ' post' : '');
    var list = proxyRoutes(post, directFirst);
    if (!list.length) return Promise.reject(new Error('no route without the own proxy'));
    var start = Math.min(preferred[host] || 0, list.length - 1);
    var n = 0, retried = false, retryAfter = 0;
    function attempt() {
      var i = (start + n) % list.length;
      var via = list[i]('').split('/')[2] || 'direct';
      return fetchJson(list[i](url), opts, timeoutMs).then(function (json) {
        if (valid && !valid(json)) throw new Error('unexpected response via ' + via);
        return json;
      }).then(function (json) {
        if (preferred[host] !== i && window.console) console.info('[MyAirspace] ' + host + ' via ' + via);
        preferred[host] = i;
        return json;
      }, function (err) {
        if (err && err.retryAfter) retryAfter = Math.max(retryAfter, err.retryAfter);
        // own proxy hiccup (5xx, network, timeout): one more try after a short pause. Not after a 429:
        // the next regular poll is the retry, and an immediate second request only adds load
        if (list[i].own && !retried && (!err.status || err.status >= 500)) {
          retried = true;
          return new Promise(function (r) { setTimeout(r, 1500); }).then(attempt);
        }
        retried = false;
        n++;
        if (n >= list.length) { if (retryAfter && !err.retryAfter) err.retryAfter = retryAfter; throw err; }
        return attempt();
      });
    }
    return attempt();
  }

  function isReadsb(json) { return !!json && Array.isArray(json.ac); }

  /* When did an aircraft really have this position? A response can be old when it comes from
     a cache (CDN, public CORS proxies), so the time of arrival says nothing; the server's own
     timestamps do. `offset` = server clock - local clock. Cached responses only make the
     observed offset smaller, so the maximum of the recent observations is the best estimate. */
  var clockObs = [];
  function clockOffset(serverNowMs, rxMs) {
    if (typeof serverNowMs !== 'number' || !isFinite(serverNowMs)) return null;
    clockObs.push(serverNowMs - rxMs);
    if (clockObs.length > 12) clockObs.shift();
    return Math.max.apply(null, clockObs);
  }
  // fixServerMs: the server-side time of the position; never later than the arrival (rx)
  function fixTime(fixServerMs, offset, rx, fallback) {
    if (offset === null || typeof fixServerMs !== 'number' || !isFinite(fixServerMs)) return fallback;
    return Math.min(rx, fixServerMs - offset);
  }

  // readsb "v2" format used by adsb.lol and airplanes.live
  function parseReadsb(json) {
    var now = Date.now();
    var srv = json.now;                          // server time, ms (seconds on some servers)
    if (typeof srv === 'number' && srv < 1e11) srv *= 1000;
    var off = clockOffset(srv, now);
    var out = [];
    var list = json.ac || json.aircraft || [];
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (typeof a.lat !== 'number' || typeof a.lon !== 'number') continue;
      var ground = a.alt_baro === 'ground';
      var alt = ground ? 0 : (typeof a.alt_baro === 'number' ? a.alt_baro :
        (typeof a.alt_geom === 'number' ? a.alt_geom : null));
      var vrate = typeof a.baro_rate === 'number' ? a.baro_rate :
        (typeof a.geom_rate === 'number' ? a.geom_rate : 0);
      out.push({
        hex: a.hex,
        callsign: trim(a.flight),
        reg: trim(a.r),
        type: trim(a.t),
        desc: trim(a.desc),
        category: a.category || '',
        lat: a.lat,
        lon: a.lon,
        alt: alt,
        onGround: ground,
        gs: typeof a.gs === 'number' ? a.gs : 0,
        track: typeof a.track === 'number' ? a.track : (typeof a.true_heading === 'number' ? a.true_heading : null),
        vrate: vrate,
        squawk: a.squawk || '',
        ts: fixTime(srv - (a.seen_pos || 0) * 1000, off, now, now - (a.seen_pos || 0) * 1000)
      });
    }
    return out;
  }

  // OpenSky state vectors (indices per https://openskynetwork.github.io/opensky-api/)
  function parseOpenSky(json) {
    var now = Date.now();
    var srv = typeof json.time === 'number' ? json.time * 1000 : null;
    var off = clockOffset(srv, now);
    var out = [];
    var states = json.states || [];
    for (var i = 0; i < states.length; i++) {
      var s = states[i];
      if (s[5] === null || s[6] === null) continue;
      var altM = s[7] !== null ? s[7] : s[13];
      out.push({
        hex: s[0],
        callsign: trim(s[1]),
        reg: '', type: '', desc: '', category: '',
        lat: s[6],
        lon: s[5],
        alt: altM === null ? null : altM * 3.28084,
        onGround: !!s[8],
        gs: s[9] === null ? 0 : s[9] * 1.94384,
        track: s[10],
        vrate: s[11] === null ? 0 : s[11] * 196.85,
        squawk: s[14] || '',
        ts: fixTime((s[3] || json.time || 0) * 1000, off, now,
          now - Math.max(0, (json.time || 0) - (s[3] || json.time || 0)) * 1000)
      });
    }
    return out;
  }

  var PROVIDERS = {
    adsblol: {
      name: 'adsb.lol', attrib: 'Daten: adsb.lol · ODbL', minPollSec: 2,
      fetch: function (lat, lon, km) {
        var nm = Math.min(250, Math.ceil(km / KM_PER_NM));
        return getJson('https://api.adsb.lol/v2/point/' + lat.toFixed(4) + '/' + lon.toFixed(4) + '/' + nm,
          undefined, 8000, isReadsb)
          .then(parseReadsb);
      }
    },
    airplaneslive: {
      name: 'airplanes.live', attrib: 'Daten: airplanes.live', minPollSec: 2,
      fetch: function (lat, lon, km) {
        var nm = Math.min(250, Math.ceil(km / KM_PER_NM));
        return getJson('https://api.airplanes.live/v2/point/' + lat.toFixed(4) + '/' + lon.toFixed(4) + '/' + nm,
          undefined, 8000, isReadsb)
          .then(parseReadsb);
      }
    },
    opensky: {
      name: 'OpenSky', attrib: 'Daten: The OpenSky Network', minPollSec: 30, // anonymous credits are scarce
      fetch: function (lat, lon, km) {
        var dLat = km / 111.32;
        var dLon = km / (111.32 * Math.cos(lat * Math.PI / 180));
        var url = 'https://opensky-network.org/api/states/all?lamin=' + (lat - dLat).toFixed(3) +
          '&lomin=' + (lon - dLon).toFixed(3) + '&lamax=' + (lat + dLat).toFixed(3) +
          '&lomax=' + (lon + dLon).toFixed(3);
        return getJson(url, undefined, 12000, function (j) { return j && typeof j.time === 'number'; })
          .then(parseOpenSky);
      }
    },
    demo: {
      name: 'Demo', attrib: 'Demo-Modus · simulierte Daten', minPollSec: 1,
      fetch: function () { return Promise.resolve(parseReadsb(MA.demo.snapshot())); }
    }
  };

  var ORDER = ['adsblol', 'airplaneslive', 'opensky'];
  var PRIMARY_RETRY_MS = 5 * 60 * 1000;

  /* Picks a provider, falls through the list on failure and periodically
     retries the preferred one. */
  function Feed(cfg) {
    this.cfg = cfg;
    // airplanes.live and OpenSky cannot be reached through the own proxy: opt-in only (?public=1)
    var usable = function (k) { return !!PROVIDERS[k] && (k === 'adsblol' || cfg.public); };
    if (cfg.demo) this.order = ['demo'];
    else if (usable(cfg.provider)) this.order = [cfg.provider];
    else this.order = cfg.public ? ORDER.slice() : ['adsblol'];
    this.idx = 0;
    this.lastSwitch = 0;
  }

  Feed.prototype.provider = function () { return PROVIDERS[this.order[this.idx]]; };

  Feed.prototype.fetch = function (lat, lon, km) {
    var self = this;
    // Requests may pass through third-party proxies: only send the home
    // position rounded to ~1 km and widen the radius to compensate.
    lat = Math.round(lat * 100) / 100;
    lon = Math.round(lon * 100) / 100;
    km += 1.5;
    if (self.idx > 0 && Date.now() - self.lastSwitch > PRIMARY_RETRY_MS) {
      self.idx = 0;
      self.lastSwitch = Date.now();
    }
    var tried = 0;
    function attempt() {
      var p = self.provider();
      return p.fetch(lat, lon, km).catch(function (err) {
        tried++;
        if (tried >= self.order.length) throw err;
        self.idx = (self.idx + 1) % self.order.length;
        self.lastSwitch = Date.now();
        if (window.console) console.warn('[MyAirspace] ' + p.name + ' failed (' + err.message + '), trying ' + self.provider().name);
        return attempt();
      });
    }
    return attempt();
  };

  /* Origin/destination lookup by callsign (adsb.lol route database), cached. */
  var routes = {};      // callsign -> { route: [{code, lat, lon}] | null, at: ms }
  var inflight = false;
  var ROUTE_TTL = 30 * 60 * 1000;

  function lookupRoutes(list, demo) {
    var now = Date.now();
    var want = [];
    for (var i = 0; i < list.length && want.length < 20; i++) {
      var ac = list[i];
      if (!MA.fmt.airlineCode(ac.callsign)) continue;
      var c = routes[ac.callsign];
      if (c && now - c.at < ROUTE_TTL) continue;
      want.push({ callsign: ac.callsign, lat: ac.lat, lng: ac.lon });
    }
    if (!want.length || inflight) return;

    if (demo) {
      for (var d = 0; d < want.length; d++) {
        var dr = MA.demo.route(want[d].callsign);
        routes[want[d].callsign] = { route: dr && dr.map(function (c) { return { code: c }; }), at: now };
      }
      return;
    }

    // One GET per callsign (public CORS proxies only relay GET), nearest first.
    inflight = true;
    var batch = want.slice(0, 4);
    Promise.all(batch.map(function (w) {
      var url = 'https://api.adsb.lol/api/0/route/' + encodeURIComponent(w.callsign) + '/' +
        w.lat.toFixed(3) + '/' + w.lng.toFixed(3);
      return getJson(url, undefined, 10000, function (r) { return r && (r.airport_codes || r.callsign); }, true).then(function (r) {
        routes[w.callsign] = { route: parseRoute(r), at: Date.now() };
      }, function () {
        // route lookup is optional; retry this callsign in two minutes
        routes[w.callsign] = { route: null, at: Date.now() - ROUTE_TTL + 120000 };
      });
    })).then(function () { inflight = false; });
  }

  // Route as a list of airports [{code, lat, lon}] (coordinates when the API has them).
  // `plausible: false` is kept: it is often right (e.g. charter flights), and leg() checks geometry.
  function parseRoute(r) {
    if (!r) return null;
    if (r._airports && r._airports.length > 1) {
      return r._airports.map(function (a) {
        return { code: a.iata || a.icao, lat: a.lat, lon: a.lon };
      });
    }
    var codes = r._airport_codes_iata;
    if (!codes || codes === 'unknown') codes = r.airport_codes;
    if (!codes || codes === 'unknown') return null;
    return codes.split('-').map(function (c) { return { code: c }; });
  }

  /* The leg the aircraft is flying now, e.g. NCE -> HAM for a HAM-NCE-HAM rotation:
     legs with the smallest detour via the aircraft position are candidates, and the
     one whose destination lies ahead (closest to the current track) wins. */
  function leg(ac) {
    var r = routes[ac.callsign] && routes[ac.callsign].route;
    if (!r || r.length < 2) return null;
    if (r.length === 2) return r;
    var g = MA.geo, i, legs = [];
    for (i = 0; i < r.length - 1; i++) {
      var a = r[i], b = r[i + 1];
      if (typeof a.lat !== 'number' || typeof b.lat !== 'number') {
        // no coordinates: descending means the last leg, otherwise the first
        return ac.vrate < -300 ? [r[r.length - 2], r[r.length - 1]] : [r[0], r[1]];
      }
      legs.push({
        from: a, to: b,
        detour: g.distKm(a.lat, a.lon, ac.lat, ac.lon) + g.distKm(ac.lat, ac.lon, b.lat, b.lon) - g.distKm(a.lat, a.lon, b.lat, b.lon)
      });
    }
    var min = Math.min.apply(null, legs.map(function (l) { return l.detour; }));
    var best = null, bestScore = -Infinity;
    legs.forEach(function (l) {
      if (l.detour > min + 50) return;
      var score = 0;
      if (ac.track !== null && ac.track !== undefined) {
        score = Math.cos((g.bearing(ac.lat, ac.lon, l.to.lat, l.to.lon) - ac.track) * Math.PI / 180);
      }
      // near an airport both directions of a rotation point the same way:
      // descending means arriving there, climbing means departing from there
      var dTo = g.distKm(ac.lat, ac.lon, l.to.lat, l.to.lon), dFrom = g.distKm(ac.lat, ac.lon, l.from.lat, l.from.lon);
      if (dTo < 60 && ac.vrate < -300) score += 1;
      if (dFrom < 60 && ac.vrate > 300) score += 1;
      if (score > bestScore) { bestScore = score; best = l; }
    });
    return best ? [best.from, best.to] : null;
  }

  MA.data = {
    Feed: Feed,
    providers: PROVIDERS,
    getJson: getJson,           // also used by js/weather.js
    pollDelay: pollDelay,
    parseRetryAfter: parseRetryAfter,
    lookupRoutes: lookupRoutes,
    route: function (callsign) {
      var c = routes[callsign];
      return c ? c.route : null;
    },
    leg: leg
  };
})(window.MA);
