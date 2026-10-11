/* Live traffic providers. All are free and keyless; every provider is normalised
   to one aircraft model:
   { hex, callsign, reg, type, desc, category, lat, lon, alt (ft), onGround,
     gs (kt), track (deg), vrate (ft/min), squawk, ts (ms epoch of position) } */
(function (MA) {
  var KM_PER_NM = 1.852;

  function trim(s) { return s ? String(s).trim() : ''; }

  function fetchJson(url, opts, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; reject(new Error('timeout')); }
      }, timeoutMs || 8000);
      fetch(url, opts).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }).then(function (json) {
        if (!done) { done = true; clearTimeout(timer); resolve(json); }
      }, function (err) {
        if (!done) { done = true; clearTimeout(timer); reject(err); }
      });
    });
  }

  /* Most flight APIs send no CORS headers, so browsers block direct calls.
     Each request goes through the own proxy (api/proxy.js on Vercel) if configured, then
     public CORS proxies, then direct. The first route that works is remembered per host. */
  var PUBLIC_PROXIES = [
    function (u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); },
    function (u) { return 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(u); }
  ];
  var preferred = {}; // host -> route index

  function proxyRoutes(post, directFirst) {
    var own = MA.config.proxy;
    var direct = function (u) { return u; };    // last unless the endpoint is known to send CORS
    if (post) return [direct];                  // no proxy relays POST
    var list = PUBLIC_PROXIES.slice();
    if (own) list.unshift(function (u) { return own + (own.indexOf('?') >= 0 ? '&' : '?') + 'url=' + encodeURIComponent(u); });
    return directFirst ? [direct].concat(list) : list.concat([direct]);
  }

  // `valid` rejects error bodies that arrive as HTTP 200 (e.g. a rate-limited
  // proxy), so the next route is tried instead of showing an empty sky.
  function getJson(url, opts, timeoutMs, valid, directFirst) {
    var post = !!(opts && opts.method === 'POST');
    // remember the working route per endpoint (host + first path segments), not per host:
    // adsb.lol's route API sends CORS headers, its aircraft API does not
    var host = url.split('/').slice(2, 5).join('/') + (post ? ' post' : '');
    var list = proxyRoutes(post, directFirst);
    var start = Math.min(preferred[host] || 0, list.length - 1);
    var n = 0;
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
        n++;
        if (n >= list.length) throw err;
        return attempt();
      });
    }
    return attempt();
  }

  function isReadsb(json) { return !!json && Array.isArray(json.ac); }

  // readsb "v2" format used by adsb.lol and airplanes.live
  function parseReadsb(json) {
    var now = Date.now();
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
        ts: now - (a.seen_pos || 0) * 1000
      });
    }
    return out;
  }

  // OpenSky state vectors (indices per https://openskynetwork.github.io/opensky-api/)
  function parseOpenSky(json) {
    var now = Date.now();
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
        ts: now - Math.max(0, (json.time || 0) - (s[3] || json.time || 0)) * 1000
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
    if (cfg.demo) this.order = ['demo'];
    else if (PROVIDERS[cfg.provider]) this.order = [cfg.provider];
    else this.order = ORDER.slice();
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
  var routes = {};      // callsign -> { route: [IATA...] | null, at: ms }
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
        routes[want[d].callsign] = { route: MA.demo.route(want[d].callsign), at: now };
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

  function parseRoute(r) {
    if (!r || r.plausible === false || r.plausible === 0) return null;
    var codes = r._airport_codes_iata;
    if (!codes && r._airports && r._airports.length > 1) {
      codes = r._airports.map(function (a) { return a.iata || a.icao; }).join('-');
    }
    if (!codes) codes = r.airport_codes;
    if (!codes || codes === 'unknown') return null;
    return codes.split('-');
  }

  MA.data = {
    Feed: Feed,
    providers: PROVIDERS,
    lookupRoutes: lookupRoutes,
    route: function (callsign) {
      var c = routes[callsign];
      return c ? c.route : null;
    }
  };
})(window.MA);
