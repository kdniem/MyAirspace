/* LED board: shows one aircraft at a time with a split-flap style scramble. */
(function (MA) {
  var GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  function $(id) { return document.getElementById(id); }

  // Scramble from the old to the new text, settling left to right.
  function flap(el, text, animate) {
    if (el._target === text) return;
    el._target = text;
    if (el._timer) clearInterval(el._timer);
    el._timer = null;
    if (animate === false) { el.textContent = text; return; }
    var frames = 0, total = 14;
    el._timer = setInterval(function () {
      frames++;
      var settled = Math.floor(text.length * frames / total);
      var s = '';
      for (var i = 0; i < text.length; i++) {
        var ch = text.charAt(i);
        s += (i < settled || ch === ' ' || /[^A-Z0-9]/.test(ch)) ? ch : GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));
      }
      el.textContent = s;
      if (frames >= total) {
        clearInterval(el._timer);
        el._timer = null;
        el.textContent = text;
      }
    }, 45);
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
      flight: $('b-flight'), airline: $('b-airline'),
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
      leds[i].className = 'val led' + (phase === 'down' ? ' down' : '') + (phase === 'idle' ? ' idle' : '');
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
    // scramble only when another aircraft is shown; live values just update
    var anim = this._hex !== ac.hex;
    this._hex = ac.hex;

    flap(e.flight, (ac.callsign || ac.reg || ac.hex).toUpperCase());
    setSub(e.airline, esc(f.airline(ac.callsign) || ac.reg || ''));

    var leg = MA.data.leg(ac);  // current leg only, e.g. NCE → HAM of HAM-NCE-HAM
    flap(e.route, leg ? leg[0].code + ' → ' + leg[1].code : '--- → ---');
    var badge = '', local = localAirports(cfg);
    if (leg) {
      if (local[leg[1].code]) badge = 'Anflug ' + esc(leg[1].code);
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

    flap(e.type, (ac.type || '----').toUpperCase());
    setSub(e.reg, esc([f.typeName(ac.type, ac.desc) !== ac.type ? f.typeName(ac.type, ac.desc) : '', ac.reg].filter(Boolean).join(' · ')));

    var alt = f.alt(ac.alt, cfg.units);
    flap(e.alt, alt.val, anim);
    setSub(e.vs, esc(alt.unit + ' \u00b7 ' + f.vs(ac.vrate)));

    flap(e.spd, String(Math.round(ac.gs || 0)), anim);
    setSub(e.spdSub, f.kmh(ac.gs || 0) + ' km/h');

    flap(e.dist, f.km(ac.dist), anim);
    setSub(e.dir, 'km · ' + f.compass(ac.brg) + ' · ' + Math.round(ac.brg) + '°');
  };

  Board.prototype.empty = function (title, sub) {
    var e = this.el;
    this._hex = null;
    this.pager(0, 0);
    this.setPhase('idle');
    flap(e.flight, title);
    setSub(e.airline, esc(sub || ''));
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
})(window.MA);
