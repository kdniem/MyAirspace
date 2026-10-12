/* MyAirspace setup page: builds the TV URL, live preview and QR code.
   Plain modern JS, no build step, no framework. Nothing is stored. */
(function () {
  'use strict';

  // Must match the defaults in js/config.js: only differing values go into the URL.
  const DEF = { r: 25, label: 'Hamburg', units: 'ft', trail: 4, night: '23-6', speed: 'kt', pressure: 'hpa', time: 'both', style: 'atc' };
  const PASSTHROUGH = ['poll', 'rotate', 'dim', 'provider', 'proxy', 'orient'];  // advanced, kept if present
  const MAc = window.MA || {};
  const STY = MAc.STYLES || { atc: { name: 'ATC', info: '', font: 'mono', theme: 'dark' } };
  const cfg0 = MAc.config || {};          // js/config.js parsed this page's own query: validated options
  const defTheme = (s) => (STY[s] && STY[s].theme) || 'dark';
  const defFont = (s) => (STY[s] && STY[s].font) || 'mono';
  const ELEMENTS = [
    ['weather', 'Wetter', 'Kompakter METAR, QNH und Betriebsrichtung'],
    ['labels', 'Datenblöcke', 'Rufzeichen, Höhe und Speed an jedem Flugzeug'],
    ['trails', 'Flugspuren', 'Verlauf hinter den Flugzeugen'],
    ['rings', 'Entfernungsringe', 'Ringe mit km-Beschriftung'],
    ['compass', 'Kompassrose', 'Gradskala und Nordpfeil am Außenring'],
    ['places', 'Ortsnamen', 'Städte und Orte auf der Karte'],
    ['ground', 'Flugzeuge am Boden', 'Kleine Quadrate an den Flughäfen'],
    ['board', 'Tafel unten', 'Das nächste Flugzeug als Anzeigetafel'],
    ['clock', 'Uhr', 'Lokalzeit und UTC']
  ];
  const FIELDS = [['callsign', 'Rufzeichen'], ['fl', 'Höhe'], ['gs', 'Speed'], ['type', 'Muster'], ['route', 'Route'], ['reg', 'Kennz.']];
  const DEF_FIELDS = ['callsign', 'fl', 'gs', 'type'];
  const ACCENT_NAMES = [['', 'Stil'], ['amber', 'Bernstein'], ['green', 'Grün'], ['cyan', 'Cyan'], ['white', 'Weiß'], ['red', 'Rot']];
  const NOMINATIM = 'https://nominatim.openstreetmap.org/';
  const PREVIEW_W = 1280;

  const $ = (id) => document.getElementById(id);
  const el = {
    geo: $('geo'), geoStatus: $('geo-status'),
    search: $('search'), results: $('results'), searchStatus: $('search-status'),
    airports: $('airports'), lat: $('lat'), lon: $('lon'), round: $('round'),
    label: $('label'), radius: $('radius'), radiusOut: $('radius-out'),
    trail: $('trail'), trailOut: $('trail-out'),
    title: $('title'), brightness: $('brightness'), brightnessOut: $('brightness-out'),
    styles: $('styles'), accents: $('accents'), accentOut: $('accent-out'), fields: $('fields'), elements: $('elements'),
    night: $('night'), nightHours: $('night-hours'), nightFrom: $('night-from'), nightTo: $('night-to'),
    preview: $('preview'), frame: $('frame'),
    url: $('url'), urlEmpty: $('url-empty'), copy: $('copy'), open: $('open'), qr: $('qr')
  };

  let labelTouched = false;   // user typed a label: don't overwrite it on location picks
  const extra = {};           // passthrough params from setup.html?…

  /* ---------- init ---------- */

  for (let h = 0; h < 24; h++) {
    const txt = String(h).padStart(2, '0') + ' Uhr';
    el.nightFrom.add(new Option(txt, h));
    el.nightTo.add(new Option(txt, h));
  }

  const airports = (window.MA && MA.features && MA.features.airports) || [];
  airports.forEach((a) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.lat = a.lat;
    b.dataset.lon = a.lon;
    b.innerHTML = '<span></span><small></small>';
    b.firstChild.textContent = a.code;
    b.lastChild.textContent = a.name;
    b.addEventListener('click', () => {
      setLocation(a.lat, a.lon, a.name);
      el.geoStatus.textContent = '';
    });
    el.airports.appendChild(b);
  });

  /* ---------- data-driven controls: styles, accents, data block fields, element toggles ---------- */

  const fieldsSel = (cfg0.fields || DEF_FIELDS).slice();

  function radio(name, value, checked, cls) {
    const l = document.createElement('label');
    l.className = cls;
    l.innerHTML = '<input type="radio" name="' + name + '" value="' + value + '"' + (checked ? ' checked' : '') + '>';
    return l;
  }

  Object.keys(STY).forEach((key) => {
    const l = radio('style', key, key === (cfg0.style || DEF.style), 'stylecard');
    let sw = '';
    if (MAc.style) {
      const c = MAc.style.resolve(key, defTheme(key)).css;
      sw = '<span class="sw" style="background:' + c['--bg'] + ';border-color:' + c['--line'] + '">' +
        '<i style="background:' + c['--ink'] + '"></i><i style="background:' + c['--accent'] + '"></i>' +
        '<i style="background:' + c['--target'] + '"></i><i style="background:' + c['--special'] + '"></i></span>';
    }
    l.insertAdjacentHTML('beforeend', sw + '<b></b><small></small>');
    l.querySelector('b').textContent = STY[key].name;
    l.querySelector('small').textContent = STY[key].info;
    el.styles.appendChild(l);
  });

  ACCENT_NAMES.forEach((a) => {
    const l = radio('accent', a[0], a[0] === (cfg0.accent && /^#/.test(cfg0.accent) ? '#' : (cfg0.accent || '')), 'swatch');
    const col = a[0] ? MAc.ACCENTS[a[0]][0] : 'transparent';
    l.insertAdjacentHTML('beforeend', '<span class="dotc' + (a[0] ? '' : ' auto') + '" style="background:' + col + '"></span><small></small>');
    l.querySelector('small').textContent = a[1];
    l.title = a[1];
    el.accents.appendChild(l);
  });
  (function customSwatch() {
    const l = radio('accent', '#', false, 'swatch swatch-custom');
    l.insertAdjacentHTML('beforeend', '<span class="dotc" id="accent-dot"></span><input id="accent-hex" type="text" maxlength="7" placeholder="#RRGGBB" autocomplete="off" spellcheck="false" aria-label="Eigene Akzentfarbe als Hex-Wert">');
    el.accents.appendChild(l);
  })();

  function renderFields() {
    el.fields.textContent = '';
    FIELDS.forEach((f) => {
      const i = fieldsSel.indexOf(f[0]);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip chip-field' + (i >= 0 ? ' on' : '');
      b.setAttribute('aria-pressed', i >= 0 ? 'true' : 'false');
      b.innerHTML = '<em></em><span></span>';
      b.firstChild.textContent = i >= 0 ? String(i + 1) : '';
      b.lastChild.textContent = f[1];
      b.addEventListener('click', () => {
        const k = fieldsSel.indexOf(f[0]);
        if (k >= 0) { if (fieldsSel.length > 1) fieldsSel.splice(k, 1); } else fieldsSel.push(f[0]);
        renderFields();
        update();
      });
      el.fields.appendChild(b);
    });
  }
  renderFields();

  const toggles = {};
  ELEMENTS.forEach((e) => {
    const l = document.createElement('label');
    l.className = 'switch';
    l.innerHTML = '<input type="checkbox"><span class="track" aria-hidden="true"></span><span><b></b><small></small></span>';
    const inp = l.querySelector('input');
    inp.checked = !cfg0.show || cfg0.show[e[0]] !== false;
    l.querySelector('b').textContent = e[1];
    l.querySelector('small').textContent = e[2];
    inp.addEventListener('change', update);
    toggles[e[0]] = inp;
    el.elements.appendChild(l);
  });

  function pick(name, val) {
    const r = document.querySelector('input[name="' + name + '"][value="' + val + '"]');
    if (r) r.checked = true;
  }

  // Prefill from setup.html?lat=…&… so an existing TV URL can be edited.
  (function prefill() {
    const q = new URLSearchParams(location.search);
    const lat = parseFloat(q.get('lat')), lon = parseFloat(q.get('lon'));
    if (validLat(lat) && validLon(lon)) { el.lat.value = lat; el.lon.value = lon; }
    if (q.get('label')) { el.label.value = q.get('label'); labelTouched = true; }
    const r = parseFloat(q.get('r'));
    el.radius.value = isNaN(r) ? DEF.r : Math.min(80, Math.max(5, r));
    const t = parseFloat(q.get('trail'));
    el.trail.value = isNaN(t) ? DEF.trail : Math.min(30, Math.max(0, t));
    const units = q.get('units') === 'm' ? 'm' : 'ft';
    document.querySelector('input[name="units"][value="' + units + '"]').checked = true;
    pick('theme', cfg0.theme || 'dark');
    pick('font', cfg0.font || defFont(cfg0.style || DEF.style));
    pick('speed', cfg0.speedUnit || DEF.speed);
    pick('pressure', cfg0.pressure || DEF.pressure);
    pick('time', cfg0.timeMode || DEF.time);
    el.title.value = cfg0.title || '';
    el.brightness.value = Math.round((cfg0.brightness || 1) * 100);
    if (cfg0.accent && /^#/.test(cfg0.accent)) {
      pick('accent', '#');
      $('accent-hex').value = cfg0.accent;
    }
    const night = q.get('night') || DEF.night;
    const m = /^(\d{1,2})-(\d{1,2})$/.exec(night);
    el.night.checked = !!m;
    const def = /^(\d+)-(\d+)$/.exec(DEF.night);
    el.nightFrom.value = m ? +m[1] % 24 : +def[1];
    el.nightTo.value = m ? +m[2] % 24 : +def[2];
    PASSTHROUGH.forEach((k) => { if (q.has(k)) extra[k] = q.get(k); });
  })();

  function isOff(v) { return v === '0' || v === 'false' || v === 'off' || v === 'no'; }
  function validLat(v) { return typeof v === 'number' && isFinite(v) && v >= -90 && v <= 90; }
  function validLon(v) { return typeof v === 'number' && isFinite(v) && v >= -180 && v <= 180; }
  function parseCoord(s) {
    s = String(s).trim().replace(',', '.');
    return /^-?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : NaN;
  }

  /* ---------- location ---------- */

  function setLocation(lat, lon, name) {
    el.lat.value = +lat.toFixed(5);
    el.lon.value = +lon.toFixed(5);
    if (name && !labelTouched) el.label.value = name.slice(0, 24);
    update();
  }

  el.geo.addEventListener('click', () => {
    if (!navigator.geolocation) {
      geoMsg('Dieser Browser kann den Standort nicht bestimmen.', 'err');
      return;
    }
    if (window.isSecureContext === false) {
      geoMsg('Standort geht nur über https. Bitte unten eingeben.', 'err');
      return;
    }
    el.geo.classList.add('busy');
    geoMsg('Bestimme Standort…');
    navigator.geolocation.getCurrentPosition((pos) => {
      el.geo.classList.remove('busy');
      const { latitude, longitude, accuracy } = pos.coords;
      setLocation(latitude, longitude, labelTouched ? '' : 'Zuhause');
      geoMsg('Standort übernommen' + (accuracy ? ' (± ' + Math.round(accuracy) + ' m).' : '.'));
      if (!labelTouched) reverseName(latitude, longitude);
    }, (err) => {
      el.geo.classList.remove('busy');
      const msg = {
        1: 'Zugriff auf den Standort verweigert. Erlaube ihn in den Browser-Einstellungen oder gib ihn unten ein.',
        2: 'Standort nicht verfügbar. Bitte suchen oder unten eingeben.',
        3: 'Zeitüberschreitung beim Bestimmen des Standorts.'
      }[err && err.code] || 'Standort konnte nicht bestimmt werden.';
      geoMsg(msg, 'err');
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  });

  function geoMsg(text, kind) {
    el.geoStatus.textContent = text;
    el.geoStatus.className = 'status' + (kind ? ' ' + kind : '');
  }

  [el.lat, el.lon].forEach((inp) => inp.addEventListener('input', update));

  /* ---------- Nominatim (usage policy: max 1 request/s, debounced, no autocomplete spam) ---------- */

  let nextSlot = 0;
  let searchCtrl = null;
  let searchTimer = 0;
  let searchSeq = 0;

  async function nominatim(path, params, signal) {
    const now = Date.now();
    const wait = Math.max(0, nextSlot - now);
    nextSlot = now + wait + 1100;
    if (wait) await new Promise((r) => setTimeout(r, wait));
    if (signal && signal.aborted) throw new DOMException('aborted', 'AbortError');
    const qs = new URLSearchParams(Object.assign({ format: 'json', 'accept-language': 'de' }, params));
    const res = await fetch(NOMINATIM + path + '?' + qs, { signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  el.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const text = el.search.value.trim();
    if (text.length < 3) {
      if (searchCtrl) searchCtrl.abort();
      showResults([]);
      searchMsg('');
      return;
    }
    searchTimer = setTimeout(() => runSearch(text), 600);
  });
  el.search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(searchTimer);
      if (el.search.value.trim().length >= 3) runSearch(el.search.value.trim());
    } else if (e.key === 'Escape') {
      showResults([]);
    }
  });

  async function runSearch(text) {
    if (searchCtrl) searchCtrl.abort();
    searchCtrl = new AbortController();
    const seq = ++searchSeq;
    searchMsg('Suche…');
    try {
      const list = await nominatim('search', { q: text, limit: 5 }, searchCtrl.signal);
      if (seq !== searchSeq) return;
      showResults(Array.isArray(list) ? list : []);
      searchMsg(list.length ? '' : 'Nichts gefunden.');
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      if (seq !== searchSeq) return;
      showResults([]);
      searchMsg('Suche gerade nicht erreichbar. Nutze den Standort-Knopf oder gib die Koordinaten ein.', 'warn');
    }
  }

  function showResults(list) {
    el.results.textContent = '';
    list.forEach((r) => {
      const lat = parseFloat(r.lat), lon = parseFloat(r.lon);
      if (!validLat(lat) || !validLon(lon)) return;
      const parts = String(r.display_name || '').split(',').map((s) => s.trim());
      const name = r.name || parts[0] || '';
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<span></span><small></small>';
      b.firstChild.textContent = name;
      b.lastChild.textContent = parts.slice(1).join(', ');
      b.addEventListener('click', () => {
        setLocation(lat, lon, name);
        showResults([]);
        el.search.value = name;
        searchMsg('');
      });
      li.appendChild(b);
      el.results.appendChild(li);
    });
    el.results.hidden = !el.results.children.length;
  }

  function searchMsg(text, kind) {
    el.searchStatus.textContent = text;
    el.searchStatus.className = 'status' + (kind ? ' ' + kind : '');
  }

  async function reverseName(lat, lon) {
    try {
      const r = await nominatim('reverse', { lat: lat.toFixed(2), lon: lon.toFixed(2), zoom: 10 });
      const a = (r && r.address) || {};
      const name = a.suburb || a.city_district || a.village || a.town || a.city || a.municipality || '';
      if (name && !labelTouched) {
        el.label.value = name.slice(0, 24);
        update();
      }
    } catch (e) { /* keep "Zuhause" */ }
  }

  /* ---------- display settings ---------- */

  el.label.addEventListener('input', () => {
    labelTouched = el.label.value.trim() !== '';
    update();
  });
  [el.radius, el.trail, el.round, el.night, el.nightFrom, el.nightTo, el.brightness]
    .forEach((inp) => inp.addEventListener(inp.type === 'range' ? 'input' : 'change', update));
  el.title.addEventListener('input', update);
  document.querySelectorAll('input[name="units"], input[name="theme"], input[name="font"], input[name="speed"], input[name="pressure"], input[name="time"], input[name="accent"]')
    .forEach((r) => r.addEventListener('change', update));
  // a style brings its own default look: switch theme and font along (theme unless set to automatic)
  document.querySelectorAll('input[name="style"]').forEach((r) => r.addEventListener('change', () => {
    if (checked('theme') !== 'auto') pick('theme', defTheme(r.value));
    pick('font', defFont(r.value));
    update();
  }));
  $('accent-hex').addEventListener('input', () => { pick('accent', '#'); update(); });
  $('accent-hex').addEventListener('focus', () => { pick('accent', '#'); update(); });

  /* ---------- URL ---------- */

  function readLocation() {
    const lat = parseCoord(el.lat.value), lon = parseCoord(el.lon.value);
    const latOk = validLat(lat), lonOk = validLon(lon);
    el.lat.classList.toggle('invalid', el.lat.value.trim() !== '' && !latOk);
    el.lon.classList.toggle('invalid', el.lon.value.trim() !== '' && !lonOk);
    return latOk && lonOk ? { lat, lon } : null;
  }

  function fmtCoord(v) {
    return String(+v.toFixed(el.round.checked ? 2 : 4));
  }

  function checked(name) {
    const r = document.querySelector('input[name="' + name + '"]:checked');
    return r ? r.value : '';
  }

  // accent=<name> or a typed hex value without '#'; '' = the style's own accent
  function accentValue() {
    const v = checked('accent');
    if (v !== '#') return v;
    const h = $('accent-hex').value.trim().replace('#', '').toLowerCase();
    return /^([0-9a-f]{3}|[0-9a-f]{6})$/.test(h) ? h : '';
  }

  function buildParams(loc) {
    const p = new URLSearchParams();
    if (loc) {
      p.set('lat', fmtCoord(loc.lat));
      p.set('lon', fmtCoord(loc.lon));
    }
    const r = +el.radius.value;
    if (r !== DEF.r) p.set('r', r);
    const label = el.label.value.trim();
    if (label && label.toLowerCase() !== DEF.label.toLowerCase()) p.set('label', label);
    const units = document.querySelector('input[name="units"]:checked').value;
    if (units !== DEF.units) p.set('units', units);
    const style = checked('style');
    if (style !== DEF.style) p.set('style', style);
    const theme = checked('theme');
    if (theme !== defTheme(style)) p.set('theme', theme);
    const acc = accentValue();
    if (acc) p.set('accent', acc);
    const br = +el.brightness.value;
    if (br !== 100) p.set('brightness', +(br / 100).toFixed(2));
    const font = checked('font');
    if (font !== defFont(style)) p.set('font', font);
    ['speed', 'pressure', 'time'].forEach((k) => { const v = checked(k); if (v !== DEF[k]) p.set(k, v); });
    const title = el.title.value.trim();
    if (title) p.set('title', title);
    ELEMENTS.forEach((e) => { if (!toggles[e[0]].checked) p.set(e[0], '0'); });
    if (fieldsSel.join() !== DEF_FIELDS.join()) p.set('datablock', fieldsSel.join(','));
    const trail = +el.trail.value;
    if (trail !== DEF.trail) p.set('trail', trail);
    const night = el.night.checked ? el.nightFrom.value + '-' + el.nightTo.value : 'off';
    if (night !== DEF.night) p.set('night', night);
    Object.keys(extra).forEach((k) => p.set(k, extra[k]));
    return p;
  }

  function tvUrl(params) {
    const base = new URL('./', location.href).href;   // …/MyAirspace/ on Pages, / on Vercel
    const qs = params.toString();
    return qs ? base + '?' + qs : base;
  }

  let currentUrl = '';

  function update() {
    el.radiusOut.textContent = el.radius.value + ' km';
    el.trailOut.textContent = +el.trail.value === 0 ? 'aus' : el.trail.value + ' min';
    el.nightHours.classList.toggle('off', !el.night.checked);
    el.brightnessOut.textContent = el.brightness.value + ' %';
    const av = checked('accent'), ac = ACCENT_NAMES.filter((a) => a[0] === av)[0];
    el.accentOut.textContent = ac ? ac[1] : (accentValue() ? '#' + accentValue() : 'Eigene');
    $('accent-dot').style.background = accentValue() ? '#' + accentValue() : 'transparent';

    const loc = readLocation();
    const params = buildParams(loc);
    document.querySelectorAll('.chip').forEach((c) => {
      c.classList.toggle('on', !!loc && Math.abs(loc.lat - c.dataset.lat) < 1e-4 && Math.abs(loc.lon - c.dataset.lon) < 1e-4);
    });

    if (loc) {
      currentUrl = tvUrl(params);
      el.url.textContent = currentUrl;
      el.open.href = currentUrl;
      el.urlEmpty.hidden = true;
      el.copy.disabled = false;
      el.open.classList.remove('disabled');
      renderQr(currentUrl);
    } else {
      currentUrl = '';
      el.url.textContent = '';
      el.urlEmpty.hidden = false;
      el.copy.disabled = true;
      el.open.classList.add('disabled');
      renderQr('');
    }
    el.copy.textContent = 'Kopieren';
    schedulePreview(params);
  }

  /* ---------- QR ---------- */

  let qrText = null;
  function renderQr(text) {
    if (text === qrText) return;
    qrText = text;
    if (!text || !MA.qr) {
      el.qr.innerHTML = '';
      el.qr.classList.add('empty');
      return;
    }
    try {
      el.qr.innerHTML = MA.qr.svg(text, { dark: '#050607', light: '#f4efe3', border: 2 });
      el.qr.classList.remove('empty');
    } catch (e) {
      el.qr.innerHTML = '';
      el.qr.classList.add('empty');
    }
  }

  /* ---------- copy ---------- */

  el.copy.addEventListener('click', async () => {
    if (!currentUrl) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(currentUrl);
      ok = true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = currentUrl;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
    }
    el.copy.textContent = ok ? 'Kopiert ✓' : 'Bitte markieren';
    if (!ok) window.getSelection().selectAllChildren(el.url);
  });

  /* ---------- live preview (throttled: one reload per 1.5 s at most) ---------- */

  let pvUrl = '';
  let pvLast = 0;
  let pvTimer = 0;

  function schedulePreview(params) {
    const p = new URLSearchParams(params);
    p.set('demo', new URLSearchParams(location.search).get('demo') === '1' ? '1' : '0');
    const url = 'index.html?' + p.toString();
    clearTimeout(pvTimer);
    if (url === pvUrl) return;
    const wait = Math.max(400, pvLast + 1500 - Date.now());
    pvTimer = setTimeout(() => {
      pvLast = Date.now();
      pvUrl = url;
      el.frame.src = url;
    }, pvUrl ? wait : 0);
  }

  function scalePreview() {
    const w = el.preview.clientWidth;
    if (w) el.frame.style.transform = 'scale(' + (w / PREVIEW_W) + ')';
  }
  if (window.ResizeObserver) new ResizeObserver(scalePreview).observe(el.preview);
  else window.addEventListener('resize', scalePreview);
  scalePreview();

  update();

  /* ---------- privacy notices (kept separate from the rest of the page logic) ---------- */
  (function () {
    function note(text, after, cls) {
      const p = document.createElement('p');
      p.className = cls;
      p.textContent = text;
      after.parentNode.insertBefore(p, after.nextSibling);
      return p;
    }
    note('Suchtexte und Standort gehen an Nominatim (OpenStreetMap).', el.searchStatus, 'status');
    const sw = el.round.closest('label') || el.round;
    const warn = note('Ohne Rundung steht dein genauer Standort in der Adresse (und in Lesezeichen).', sw, 'status warn');
    const sync = () => { warn.hidden = el.round.checked; };
    el.round.addEventListener('change', sync);
    sync();
  })();
})();
