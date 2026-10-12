/* MyAirspace setup page engine: builds the TV URL, live preview and QR code from the form controls.
   Plain modern JS, no build step, no framework. Nothing is stored here (the wizard in js/onboarding.js keeps
   its progress in sessionStorage only). All wording comes from MA.COPY (js/onboarding.js). */
(function () {
  'use strict';

  // Must match the defaults in js/config.js: only differing values go into the URL.
  const DEF = { r: 25, label: 'Hamburg', units: 'ft', trail: 4, night: '23-6', speed: 'kt', pressure: 'hpa', time: 'both', style: 'atc' };
  const PASSTHROUGH = ['poll', 'rotate', 'dim', 'provider', 'orient'];  // advanced, kept if present
  const MAc = window.MA || {};
  const STY = MAc.STYLES || { atc: { name: 'ATC', info: '', font: 'mono', theme: 'dark' } };
  const cfg0 = MAc.config || {};          // js/config.js parsed this page's own query: validated options
  const defTheme = (s) => (STY[s] && STY[s].theme) || 'dark';
  const defFont = (s) => (STY[s] && STY[s].font) || 'mono';
  const COPY = MAc.COPY;
  const ELEMENTS = COPY.elements;
  const FIELDS = COPY.fields;
  const DEF_FIELDS = ['callsign', 'fl', 'gs', 'type'];
  const ACCENT_NAMES = [['', COPY.accentAuto], ['amber', 'Bernstein'], ['green', 'Grün'], ['cyan', 'Cyan'], ['white', 'Weiß'], ['red', 'Rot']];
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
    styles: $('styles'), accents: $('accents'), accentOut: $('accent-out'), fields: $('fields'), elements: $('elements'), elementsMain: $('elements-main'),
    placeCard: $('place-card'), placeName: $('place-name'), placeCoords: $('place-coords'), radiusHint: $('radius-hint'),
    copyStatus: $('copy-status'), previewNote: $('preview-note'),
    night: $('night'), nightHours: $('night-hours'), nightFrom: $('night-from'), nightTo: $('night-to'),
    preview: $('preview'), frame: $('frame'),
    url: $('url'), urlEmpty: $('url-empty'), copy: $('copy'), open: $('open'), qr: $('qr')
  };

  // sentences that live in the HTML but are edited in MA.COPY
  $('geo-text').textContent = COPY.location.geo;
  $('round-title').textContent = COPY.location.roundTitle;
  $('round-hint').textContent = COPY.location.roundHint;
  $('round-warn').textContent = COPY.location.roundWarn;
  $('privacy-note').textContent = COPY.location.privacy;
  $('theme-hint').textContent = COPY.themeHint;
  $('units-hint').textContent = COPY.unitsHint;
  $('qr-note').textContent = COPY.result.qr;
  $('copy').textContent = COPY.result.copy;
  $('share').textContent = COPY.result.shareBtn;
  $('open').textContent = COPY.result.test;

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
    l.insertAdjacentHTML('beforeend', '<canvas class="mini" width="480" height="270" aria-hidden="true"></canvas><b></b><small></small>');
    l.querySelector('b').textContent = STY[key].name;
    l.querySelector('small').textContent = COPY.styles[key] || STY[key].info;
    l.dataset.style = key;
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
    (e[3] ? el.elementsMain : el.elements).appendChild(l);
  });

  // chart background (chartbg=1): its own switch, off by default, so it is not an element of ELEMENTS
  toggles.chartbg = $('chartbg');
  toggles.chartbg.checked = !!cfg0.chartbg;
  toggles.chartbg.addEventListener('change', update);
  $('chartbg-name').textContent = COPY.chartbg.label;
  $('chartbg-hint').textContent = COPY.chartbg.hint;

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
    const view = q.get('view');
    pick('view', ['auto', 'radar', 'board', 'airport'].indexOf(view) >= 0 ? view : 'auto');
    const ap = (q.get('airport') || 'HAM').toUpperCase();
    pick('airport', ['HAM', 'XFW', 'FRA', 'FMO', 'CPH'].indexOf(ap) >= 0 ? ap : 'HAM');
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
      geoMsg(COPY.location.noApi, 'err');
      return;
    }
    if (window.isSecureContext === false) {
      geoMsg(COPY.location.insecure, 'err');
      return;
    }
    el.geo.classList.add('busy');
    geoMsg(COPY.location.busy);
    navigator.geolocation.getCurrentPosition((pos) => {
      el.geo.classList.remove('busy');
      const { latitude, longitude, accuracy } = pos.coords;
      setLocation(latitude, longitude, labelTouched ? '' : COPY.location.placeHome);
      geoMsg(COPY.location.ok(accuracy ? Math.round(accuracy) : 0));
      if (!labelTouched) reverseName(latitude, longitude);
    }, (err) => {
      el.geo.classList.remove('busy');
      const msg = {
        1: COPY.location.denied,
        2: COPY.location.unavailable,
        3: COPY.location.timeout
      }[err && err.code] || COPY.location.failed;
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
    searchMsg(COPY.location.searching);
    try {
      const list = await nominatim('search', { q: text, limit: 5 }, searchCtrl.signal);
      if (seq !== searchSeq) return;
      showResults(Array.isArray(list) ? list : []);
      searchMsg(list.length ? '' : COPY.location.nothing);
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      if (seq !== searchSeq) return;
      showResults([]);
      searchMsg(COPY.location.searchDown, 'warn');
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
  document.querySelectorAll('input[name="view"], input[name="airport"], input[name="units"], input[name="theme"], input[name="font"], input[name="speed"], input[name="pressure"], input[name="time"], input[name="accent"]')
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
    if (toggles.chartbg.checked) p.set('chartbg', '1');
    if (fieldsSel.join() !== DEF_FIELDS.join()) p.set('datablock', fieldsSel.join(','));
    const trail = +el.trail.value;
    if (trail !== DEF.trail) p.set('trail', trail);
    const view = checked('view');
    if (view !== 'auto') p.set('view', view);
    if (view === 'airport' && checked('airport') !== 'HAM') p.set('airport', checked('airport'));
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
  let lastLoc = false;
  let lastParams = new URLSearchParams();

  function update() {
    const view = checked('view');
    document.getElementById('airport-field').style.display = view === 'airport' ? '' : 'none';
    document.getElementById('view-hint').textContent = COPY.viewHint[view] || '';
    el.radiusOut.textContent = el.radius.value + ' km';
    el.trailOut.textContent = +el.trail.value === 0 ? 'aus' : el.trail.value + ' min';
    el.nightHours.classList.toggle('off', !el.night.checked);
    el.brightnessOut.textContent = el.brightness.value + ' %';
    const av = checked('accent'), ac = ACCENT_NAMES.filter((a) => a[0] === av)[0];
    el.accentOut.textContent = ac ? ac[1] : (accentValue() ? '#' + accentValue() : 'Eigene');
    $('accent-dot').style.background = accentValue() ? '#' + accentValue() : 'transparent';

    const loc = readLocation();
    const params = buildParams(loc);
    document.querySelectorAll('#airports .chip').forEach((c) => {
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
    el.copy.textContent = COPY.result.copy;
    el.copyStatus.textContent = '';
    el.radiusHint.textContent = COPY.radiusHint(+el.radius.value);
    el.placeCard.classList.toggle('empty', !loc);
    if (!loc) {
      el.placeName.textContent = COPY.location.placeNone;
      el.placeCoords.textContent = '';
    } else {
      el.placeName.textContent = el.label.value.trim() || COPY.location.placeFallback;
      el.placeCoords.textContent = params.get('lat') + '° N, ' + params.get('lon') + '° O';
    }
    lastLoc = !!loc;
    lastParams = params;
    paintMinis();
    schedulePreview();
    document.dispatchEvent(new CustomEvent('ma:update', { detail: { loc: !!loc, url: currentUrl } }));
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
    el.copy.textContent = ok ? COPY.result.copied : COPY.result.copyFail;
    el.copyStatus.textContent = ok ? COPY.result.copiedSay : COPY.result.copyFailSay;
    el.copyStatus.className = 'status' + (ok ? '' : ' warn');
    if (!ok) window.getSelection().selectAllChildren(el.url);
  });

  /* ---------- live preview (throttled: one reload per 1.5 s at most) ---------- */

  let pvUrl = '';
  let pvLast = 0;
  let pvTimer = 0;
  let pvOn = false;          // the wizard switches the preview on for the steps that show it (no reload cost elsewhere)
  let pvDemo = false;        // welcome step: always the demo traffic, never the user's place

  function schedulePreview() {
    clearTimeout(pvTimer);
    if (!pvOn) {
      if (pvUrl) { pvUrl = ''; el.frame.src = 'about:blank'; }
      return;
    }
    const p = new URLSearchParams(lastParams);
    const setupDemo = new URLSearchParams(location.search).get('demo') === '1';
    const demo = setupDemo || pvDemo || !lastLoc;
    if (pvDemo) ['lat', 'lon', 'label', 'title', 'r'].forEach((k) => p.delete(k));   // the demo traffic flies over Hamburg
    p.set('demo', demo ? '1' : '0');
    el.previewNote.textContent = demo ? (pvDemo ? COPY.preview.demo : COPY.preview.demoSetup) : COPY.preview.live;
    const url = 'index.html?' + p.toString();
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

  /* ---------- mini previews on the style cards (drawn from the same palettes the TV page uses) ---------- */

  let miniKey = '';
  let themeTouched = false;
  document.querySelectorAll('input[name="theme"]').forEach((r) => r.addEventListener('change', () => { themeTouched = true; paintMinis(); }));
  function paintMinis() {
    // every card shows its own default look until the person picks a theme by hand
    const theme = themeTouched ? (checked('theme') === 'light' ? 'light' : 'dark') : '';
    const acc = accentValue();
    const key = theme + '|' + acc;
    if (key === miniKey || !MAc.style) return;
    miniKey = key;
    el.styles.querySelectorAll('.stylecard').forEach((card) => {
      try { drawMini(card.querySelector('canvas'), card.dataset.style, theme || defTheme(card.dataset.style), acc); } catch (e) { /* decorative only */ }
    });
  }

  function drawMini(cv, key, theme, accent) {
    const r = MAc.style.resolve(key, theme, { accent: accent });
    const c = r.c, css = r.css, W = cv.width, H = cv.height, g = cv.getContext('2d');
    const rgbs = (a) => 'rgb(' + a[0] + ',' + a[1] + ',' + a[2] + ')';
    const cx = W * 0.5, cy = H * 0.52, R = H * 0.4;
    g.clearRect(0, 0, W, H);
    g.fillStyle = c.bg;
    g.fillRect(0, 0, W, H);
    // river
    g.strokeStyle = c.water;
    g.lineWidth = H * 0.07;
    g.lineCap = 'round';
    g.beginPath(); g.moveTo(-10, H * 0.82); g.bezierCurveTo(W * 0.25, H * 0.55, W * 0.4, H * 0.95, W * 0.62, H * 0.78); g.bezierCurveTo(W * 0.78, H * 0.66, W * 0.9, H * 0.8, W + 10, H * 0.7); g.stroke();
    // rings and compass ticks
    g.lineWidth = 2;
    [0.33, 0.66].forEach((f) => { g.strokeStyle = c.ring; g.beginPath(); g.arc(cx, cy, R * f, 0, Math.PI * 2); g.stroke(); });
    g.strokeStyle = c.ringMain; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
    for (let d = 0; d < 360; d += 10) {
      const a = d * Math.PI / 180, big = d % 30 === 0, r0 = R + 4, r1 = R + (big ? 16 : 9);
      g.strokeStyle = big ? c.tickMajor : c.tick;
      g.lineWidth = big ? 3 : 2;
      g.beginPath(); g.moveTo(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0); g.lineTo(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1); g.stroke();
    }
    // runway with approach line
    g.strokeStyle = c.centerline; g.lineWidth = 2; g.setLineDash([8, 8]);
    g.beginPath(); g.moveTo(cx - R * 0.12, cy + R * 0.38); g.lineTo(cx - R * 0.62, cy + R * 0.9); g.stroke();
    g.setLineDash([]);
    g.strokeStyle = c.runway; g.lineWidth = 5; g.lineCap = 'butt';
    g.beginPath(); g.moveTo(cx - R * 0.12, cy + R * 0.38); g.lineTo(cx + R * 0.2, cy + R * 0.03); g.stroke();
    g.strokeStyle = css['--accent']; g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx - R * 0.12, cy + R * 0.38); g.lineTo(cx - R * 0.3, cy + R * 0.58); g.stroke();
    // aircraft
    const sym = c.symbol || 'chevron';
    const unit = H / 270;
    const plane = (x, y, hdg, color, fill, trailN) => {
      const a = (hdg + 180) * Math.PI / 180;
      for (let i = 1; i <= trailN; i++) {
        const tx = x + Math.sin(a) * i * 17 * unit * 1.6, ty = y - Math.cos(a) * i * 17 * unit * 1.6;
        g.globalAlpha = 1 - i / (trailN + 1.5);
        g.fillStyle = color; g.strokeStyle = color;
        if (c.trail === 'line') { if (i === 1) { g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(a) * trailN * 27 * unit, y - Math.cos(a) * trailN * 27 * unit); g.stroke(); } }
        else { g.beginPath(); g.arc(tx, ty, 3 * unit * 1.6, 0, Math.PI * 2); g.fill(); }
      }
      g.globalAlpha = 1;
      g.save(); g.translate(x, y); g.rotate(hdg * Math.PI / 180);
      const s = 12 * unit * 1.6;
      g.fillStyle = color; g.strokeStyle = color; g.lineWidth = 3.2 * c.lw; g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath();
      if (sym === 'diamond') { g.moveTo(0, -s); g.lineTo(s * 0.75, 0); g.lineTo(0, s); g.lineTo(-s * 0.75, 0); g.closePath(); fill ? g.fill() : g.stroke(); }
      else if (sym === 'triangle') { g.moveTo(0, -s); g.lineTo(s * 0.8, s * 0.8); g.lineTo(-s * 0.8, s * 0.8); g.closePath(); fill ? g.fill() : g.stroke(); }
      else if (sym === 'arrow') { g.moveTo(0, -s * 1.1); g.lineTo(s * 0.75, s * 0.9); g.lineTo(0, s * 0.4); g.lineTo(-s * 0.75, s * 0.9); g.closePath(); g.fill(); }
      else if (sym === 'square') { g.rect(-s * 0.7, -s * 0.7, s * 1.4, s * 1.4); fill ? g.fill() : g.stroke(); }
      else { g.lineWidth = 4 * c.lw; g.moveTo(-s * 0.85, s * 0.8); g.lineTo(0, -s * 0.85); g.lineTo(s * 0.85, s * 0.8); g.stroke(); g.beginPath(); g.arc(0, s * 0.1, 2.5, 0, Math.PI * 2); g.fill(); }
      g.restore();
    };
    plane(cx - R * 0.7, cy - R * 0.45, 95, rgbs(c.level), false, 4);
    plane(cx + R * 0.62, cy + R * 0.3, 305, rgbs(c.level), false, 3);
    plane(cx + R * 0.42, cy - R * 0.5, 215, rgbs(c.target), true, 4);
    plane(cx - R * 0.15, cy - R * 0.72, 140, rgbs(c.special), false, 0);
    // data block of the target
    const fs = Math.round(H * 0.085);
    g.font = c.weight + ' ' + fs + 'px ' + c.font;
    g.textBaseline = 'alphabetic';
    g.fillStyle = rgbs(c.target);
    g.fillText('DLH8NA', cx + R * 0.42 + 26, cy - R * 0.5 - 12);
    g.fillStyle = c.detail;
    g.fillText('FL070 160', cx + R * 0.42 + 26, cy - R * 0.5 - 12 + fs * 1.1);
    // header and board strip
    g.fillStyle = c.label;
    g.font = c.weight + ' ' + Math.round(H * 0.09) + 'px ' + c.font;
    g.fillText('HAMBURG', 16, H * 0.12);
    g.fillStyle = css['--panel'];
    g.fillRect(0, H * 0.86, W, H * 0.14);
    g.fillStyle = css['--ink'];
    g.font = c.weight + ' ' + Math.round(H * 0.075) + 'px ' + c.font;
    g.fillText('DLH8NA', 16, H * 0.955);
    g.fillStyle = css['--accent'];
    g.fillText('MUC > HAM', W * 0.4, H * 0.955);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { miniKey = ''; paintMinis(); });

  /* ---------- API for the wizard (js/onboarding.js) ---------- */

  MA.setup = {
    state() {
      const st = STY[checked('style')] || {};
      return { loc: lastLoc, url: currentUrl, label: el.label.value.trim(), styleName: st.name || '', radius: +el.radius.value, query: lastParams.toString() };
    },
    preview(o) {
      pvOn = !!o.on;
      pvDemo = !!o.demo;
      schedulePreview();
    }
  };

  const syncWarn = () => { $('round-warn').hidden = el.round.checked; };
  el.round.addEventListener('change', syncWarn);
  syncWarn();
  update();
})();
