/* LED board: shows one aircraft at a time with a split-flap style scramble. */
(function (MA) {
  function $(id) { return document.getElementById(id); }

  /* Split-flap, one behaviour for every cell (board and Anzeigetafel): the text scrambles and settles left to
     right. Timing and glyphs come from js/motion.js. There is one clock: flap() queues the cell and
     MA.flap.tick(now), called from the frame loop (js/main.js), advances all queued cells. So nothing runs in a
     hidden tab, and motion=off (or the same text again) sets the text at once. */
  var queue = [];
  function flap(el, text, animate) {
    if (el._target === text) return;
    el._target = text;
    if (animate === false || !MA.motion.enabled()) { el._queued = false; el.textContent = text; return; }
    el._text = text;
    el._t0 = undefined;   // the clock starts at the next tick
    el._step = -1;
    if (!el._queued) { el._queued = true; queue.push(el); }
    el.textContent = MA.motion.curves.flapText(text, 0, MA.motion.flap.steps, Math.random);
  }
  function tick(now) {
    if (!queue.length) return;
    var keep = [], F = MA.motion.flap, C = MA.motion.curves;
    for (var i = 0; i < queue.length; i++) {
      var el = queue[i];
      if (!el._queued) continue;
      if (el._t0 === undefined) el._t0 = now;
      var s = C.flapStep(now - el._t0, F.stepMs, F.steps);
      if (s !== el._step) {
        el._step = s;
        el.textContent = s >= F.steps ? el._text : C.flapText(el._text, s, F.steps, Math.random);
      }
      if (s >= F.steps) el._queued = false; else keep.push(el);
    }
    queue = keep;
  }

  function setSub(el, html) {
    if (el._html === html) return;
    el._html = html;
    el.innerHTML = html;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // Airports on the map within 60 km of home, by IATA and ICAO code (for the Anflug/Abflug badge).
  var localCache = null;
  function localAirports(cfg) {
    if (localCache) return localCache;
    localCache = {};
    MA.features.airports.forEach(function (ap) {
      if (MA.geo.distKm(cfg.lat, cfg.lon, ap.lat, ap.lon) <= 60) {
        localCache[ap.code] = true;
        if (ap.icao) localCache[ap.icao] = true;
      }
    });
    return localCache;
  }

  function Board(cfg) {
    this.cfg = cfg;
    this.el = {
      board: $('board'), pager: $('pager'),
      flight: $('b-flight'), logo: $('b-logo'), airline: $('b-airline'),
      route: $('b-route'), badge: $('b-badge'),
      type: $('b-type'), reg: $('b-reg'),
      alt: $('b-alt'), vs: $('b-vs'),
      spd: $('b-spd'), spdSub: $('b-spd-sub'),
      dist: $('b-dist'), dir: $('b-dir')
    };
  }

  Board.prototype.setPhase = function (phase) {
    var leds = this.el.board.querySelectorAll('.led');
    for (var i = 0; i < leds.length; i++) {
      leds[i].className = 'val led' + (phase === 'idle' ? ' idle' : '');
    }
  };

  Board.prototype.pager = function (idx, count) {
    var key = idx + '/' + count;
    if (this._pager === key) return;
    this._pager = key;
    var html = '';
    for (var i = 0; i < count; i++) html += '<span' + (i === idx ? ' class="on"' : '') + '></span>';
    this.el.pager.innerHTML = html;
  };

  Board.prototype.show = function (ac, idx, count) {
    var e = this.el, f = MA.fmt, cfg = this.cfg;
    this.pager(idx, count);
    this.setPhase(f.phase(ac));
    // scramble only when another aircraft is shown (flight, route, type and the values alike); live values just update
    var anim = this._hex !== ac.hex;
    this._hex = ac.hex;

    flap(e.flight, (ac.callsign || ac.reg || ac.hex).toUpperCase(), anim);
    // operator badge (js/airlines.js): flat tile with the airline code; type tile for private/GA flights
    setSub(e.logo, MA.badge.html(MA.badge.info(ac), MA.STYLES[cfg.style].badge === 'mono'));
    setSub(e.airline, esc(f.airline(ac.callsign) || ac.reg || ''));

    var leg = MA.data.leg(ac);  // current leg only, e.g. NCE → HAM of HAM-NCE-HAM
    flap(e.route, leg ? leg[0].code + ' → ' + leg[1].code : '--- → ---', anim);
    var badge = '', local = localAirports(cfg);
    if (leg) {
      // round trips (e.g. Airbus test flights XFW → XFW): the phase decides
      if (leg[0].code === leg[1].code && local[leg[0].code]) {
        badge = (ac.vrate > 300 ? 'Abflug ' : 'Anflug ') + esc(leg[0].code);
      } else if (local[leg[1].code]) badge = 'Anflug ' + esc(leg[1].code);
      else if (local[leg[0].code]) badge = 'Abflug ' + esc(leg[0].code);
      else badge = 'Überflug';
    }
    // special aircraft (js/special.js, incl. AIRBUS): label badge in front of the leg text
    var sp = ac.special;
    if (sp) {
      var cls = sp.alert ? ' alert' : (sp.key === 'airbus' ? '' : ' special');
      badge = '<span class="badge' + cls + '">' + esc(sp.label) + '</span>' + (badge ? ' ' + badge : '');
    }
    setSub(e.badge, badge);

    flap(e.type, (ac.type || '----').toUpperCase(), anim);
    setSub(e.reg, esc([f.typeName(ac.type, ac.desc) !== ac.type ? f.typeName(ac.type, ac.desc) : '', ac.reg].filter(Boolean).join(' · ')));

    var alt = f.alt(ac.alt, cfg.units);
    flap(e.alt, alt.val, anim);
    setSub(e.vs, '<span class="u">' + esc(alt.unit) + '</span>' + esc(' \u00b7 ' + f.vs(ac.vrate, cfg.units)));

    var gsv = f.speed(ac.gs, cfg.speedUnit);
    flap(e.spd, gsv.val, anim);
    setSub(e.spdSub, '<span class="u">' + esc(gsv.unit) + '</span> \u00b7 ' + esc(gsv.other));

    flap(e.dist, f.km(ac.dist), anim);
    setSub(e.dir, '<span class="u">km</span> \u00b7 ' + f.compass(ac.brg) + ' \u00b7 ' + ('00' + Math.round(ac.brg) % 360).slice(-3) + '\u00b0');
  };

  Board.prototype.empty = function (title, sub) {
    var e = this.el;
    this._hex = null;
    this.pager(0, 0);
    this.setPhase('idle');
    flap(e.flight, title);
    setSub(e.airline, esc(sub || ''));
    setSub(e.logo, '');
    flap(e.route, '--- → ---');
    setSub(e.badge, '');
    flap(e.type, '----');
    setSub(e.reg, '');
    flap(e.alt, '-----');
    setSub(e.vs, '');
    flap(e.spd, '---');
    setSub(e.spdSub, '');
    flap(e.dist, '--');
    setSub(e.dir, '');
  };

  MA.Board = Board;
  flap.tick = tick;   // called once per frame by js/main.js
  MA.flap = flap;
})(window.MA);
