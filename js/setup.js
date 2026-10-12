/* MyAirspace setup page: builds the TV URL, live preview and QR code.
   Plain modern JS, no build step, no framework. Nothing is stored. */
(function () {
  'use strict';

  // Must match the defaults in js/config.js: only differing values go into the URL.
  const DEF = { r: 25, label: 'Hamburg', units: 'ft', theme: 'dark', trail: 4, night: '23-6', labels: true, places: true };
  const PASSTHROUGH = ['poll', 'rotate', 'dim', 'provider', 'proxy'];  // advanced, kept if present
  const NOMINATIM = 'https://nominatim.openstreetmap.org/';
  const PREVIEW_W = 1280;

  const $ = (id) => document.getElementById(id);
  const el = {
    geo: $('geo'), geoStatus: $('geo-status'),
    search: $('search'), results: $('results'), searchStatus: $('search-status'),
    airports: $('airports'), lat: $('lat'), lon: $('lon'), round: $('round'),
    label: $('label'), radius: $('radius'), radiusOut: $('radius-out'),
    trail: $('trail'), trailOut: $('trail-out'),
    labels: $('labels'), places: $('places'),
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
    const theme = /^(light|auto)$/.test(q.get('theme')) ? q.get('theme') : 'dark';
    document.querySelector('input[name="theme"][value="' + theme + '"]').checked = true;
    el.labels.checked = !isOff(q.get('labels'));
    el.places.checked = !isOff(q.get('places'));
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
      const r = await nominatim('reverse', { lat: lat.toFixed(3), lon: lon.toFixed(3), zoom: 12 });
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
  [el.radius, el.trail, el.round, el.labels, el.places, el.night, el.nightFrom, el.nightTo]
    .forEach((inp) => inp.addEventListener(inp.type === 'range' ? 'input' : 'change', update));
  document.querySelectorAll('input[name="units"], input[name="theme"]').forEach((r) => r.addEventListener('change', update));

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
    const theme = document.querySelector('input[name="theme"]:checked').value;
    if (theme !== DEF.theme) p.set('theme', theme);
    const trail = +el.trail.value;
    if (trail !== DEF.trail) p.set('trail', trail);
    const night = el.night.checked ? el.nightFrom.value + '-' + el.nightTo.value : 'off';
    if (night !== DEF.night) p.set('night', night);
    if (!el.labels.checked) p.set('labels', '0');
    if (!el.places.checked) p.set('places', '0');
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
    p.set('demo', '0');
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
})();
