/* Guided setup (Einrichtungs-Assistent) on setup.html.
   1. MA.COPY: every sentence of the journey in one place (also read by js/setup.js). Edit words here.
   2. Resume: the wizard remembers its step and choices in sessionStorage only (this tab, gone when it closes).
   3. Controller: shows one step at a time (welcome, location, look, content, TV, done) or all settings at once
      ("Alle Einstellungen"). Every control stays where it is in setup.html; js/setup.js builds the URL.
   Loaded before js/config.js (so a resumed session can fill the address before the page reads it).
   Deep links: setup.html#standort | #look | #inhalt | #fernseher | #fertig | #alle, ?wizard=0 (all settings),
   ?wizard=1 (start over), ?demo=1 (demo traffic in the preview). An address with lat and lon opens all settings. */
(function () {
  'use strict';
  const MA = window.MA = window.MA || {};

  /* ======================================================================
     COPY: plain, warm German ("du"), aviation terms explained once.
     ====================================================================== */
  const COPY = MA.COPY = {
    docTitle: 'MyAirspace einrichten',
    stepOf: (n, total, name) => 'Schritt ' + n + ' von ' + total + ' · ' + name,

    steps: {
      welcome: {
        name: 'Willkommen', eyebrow: 'Willkommen',
        title: 'Dein Luftraum auf dem Fernseher.',
        lead: 'MyAirspace zeigt live, welche Flugzeuge gerade über dir fliegen: ruhig wie ein Radar im Tower. Du richtest es einmal am Handy ein, in etwa zwei Minuten.',
        next: 'Los geht’s'
      },
      standort: {
        name: 'Standort', eyebrow: 'Schritt 1',
        title: 'Von wo schaust du in den Himmel?',
        lead: 'Dein Standort ist die Mitte des Radars. Meist ist das dein Zuhause.',
        next: 'Weiter'
      },
      look: {
        name: 'Look', eyebrow: 'Schritt 2',
        title: 'Welcher Look gefällt dir?',
        lead: 'Tippe einen Stil an. Die Vorschau zeigt ihn sofort.',
        next: 'Weiter'
      },
      inhalt: {
        name: 'Inhalt', eyebrow: 'Schritt 3',
        title: 'Was soll zu sehen sein?',
        lead: 'Die Voreinstellung passt für die meisten. Schalte aus, was dich stört.',
        next: 'Weiter'
      },
      fernseher: {
        name: 'Fernseher', eyebrow: 'Schritt 4',
        title: 'Jetzt auf den Fernseher',
        lead: 'Das ist deine persönliche Adresse. Öffne sie im Browser deines Fernsehers.',
        next: 'Weiter'
      },
      fertig: {
        name: 'Fertig', eyebrow: 'Schritt 5',
        title: 'Geschafft!',
        lead: 'Dein Radar ist bereit. Teste es kurz, dann kannst du dich zurücklehnen.',
        next: 'Testen'
      }
    },
    all: { eyebrow: '', next: '' },

    nav: {
      back: 'Zurück',
      expertWelcome: 'Ich kenne mich aus → alle Einstellungen',
      expert: 'Alle Einstellungen',
      guided: '← Zur geführten Einrichtung',
      needLocation: 'Wähle zuerst einen Ort, dann geht es weiter.'
    },

    promises: [
      'Kostenlos und ohne Konto',
      'Nichts wird auf einem Server gespeichert: alles steckt in einer Adresse',
      'Läuft im Browser deines Fernsehers'
    ],

    preview: {
      demo: 'Live-Demo mit Beispiel-Verkehr über Hamburg.',
      live: 'Live-Daten von deinem Standort. Aktualisiert sich nach jeder Änderung.',
      demoSetup: 'Demo-Verkehr über Hamburg. Aktualisiert sich nach jeder Änderung.'
    },

    location: {
      geo: 'Meinen Standort verwenden',
      geoAgain: 'Standort neu bestimmen',
      busy: 'Bestimme Standort…',
      ok: (acc) => 'Standort übernommen' + (acc ? ' (± ' + acc + ' m).' : '.'),
      noApi: 'Dieser Browser kann den Standort nicht bestimmen. Suche einen Ort oder wähle einen Flughafen.',
      insecure: 'Standort geht nur über eine sichere Verbindung (https). Suche einen Ort oder gib ihn selbst ein.',
      denied: 'Der Zugriff wurde abgelehnt. Erlaube ihn in den Browser-Einstellungen oder suche einen Ort.',
      unavailable: 'Dein Standort ist gerade nicht verfügbar. Suche einen Ort oder wähle einen Flughafen.',
      timeout: 'Das dauert zu lange. Versuche es noch einmal oder suche einen Ort.',
      failed: 'Der Standort konnte nicht bestimmt werden. Suche einen Ort.',
      searching: 'Suche…',
      nothing: 'Nichts gefunden. Probiere einen größeren Ort in der Nähe.',
      searchDown: 'Die Ortssuche ist gerade nicht erreichbar. Nimm den Standort-Knopf oder wähle einen Flughafen.',
      placeNone: 'Noch kein Ort gewählt',
      placeFallback: 'Dein Standort',
      placeHome: 'Zuhause',
      roundTitle: 'Auf etwa 1 km runden',
      roundHint: 'Deine genaue Adresse landet so nicht im Link.',
      roundWarn: 'Ohne Rundung steht dein genauer Standort im Link und in Lesezeichen.',
      privacy: 'Dein Standort bleibt in der Adresse. Ortssuche und Ortsname fragen Nominatim von OpenStreetMap an: dorthin gehen der Suchtext bzw. deine auf etwa 1 km gerundete Position.'
    },

    // style names come from js/styles.js; here the sentence for a first-time user
    styles: {
      tower: 'Wie der Radarschirm im Tower. Phosphorgrün auf Schwarz, runder Schwenk, feine Linien.',
      fids: 'Wie die Anzeigetafel am Flughafen. Holzkohle und Warmweiß mit Bernstein, große Versalien.',
      'efis-airbus': 'Wie im Airbus-Cockpit. Schwarz, Grün, Cyan und Magenta, der Kompass als Bogen.',
      'eicam-boeing': 'Wie die Anzeigen einer Boeing. Blaugrau, Weiß und Cyan, eckige Kacheln.',
      'chart-paper': 'Wie eine Luftfahrtkarte aus Papier. Tinte und Magenta, hell und übersichtlich.',
      'nvg-night': 'Nachtsicht: nur Rot und Dunkelgrün, ohne Schein. Blendet am Abend nicht.',
      'tactical-olive': 'Wie eine taktische Anzeige in Oliv. Raster und Schablonenschrift.'
    },
    themeHint: 'Automatisch: hell zwischen Sonnenauf- und -untergang an deinem Standort, nachts dunkel.',
    accentAuto: 'Stil',

    // [key, label, hint, shown in the simple list]
    elements: [
      ['weather', 'Wetter', 'Wind, Sicht und Luftdruck vom Flughafen (METAR)', true],
      ['ground', 'Flugzeuge am Boden', 'Parkende und rollende Flugzeuge am Flughafen', true],
      ['trails', 'Spuren', 'Eine Linie zeigt, woher ein Flugzeug kommt', true],
      ['board', 'Anzeigetafel', 'Unten: das nächste Flugzeug mit Route und Höhe', true],
      ['clock', 'Uhr', 'Ortszeit und UTC (die Zeit der Luftfahrt)', true],
      ['compass', 'Kompass', 'Gradskala rund um den Radar', true],
      ['labels', 'Datenblöcke', 'Rufzeichen, Höhe und Tempo am Flugzeug', false],
      ['rings', 'Entfernungsringe', 'Ringe mit km-Beschriftung', false],
      ['places', 'Ortsnamen', 'Städte und Orte auf der Karte', false],
      // not a show= flag: on writes wx=radar (opt-in, see js/wxradar.js), off writes nothing
      ['wxradar', 'Wetterradar', 'Niederschlag über der Karte in Cockpit-Farben (Daten DWD, Deutschland)', false]
    ],
    // the aeronautical-chart background (chartbg=1): one switch in the settings, off by default
    chartbg: {
      label: 'Luftfahrtkarte als Hintergrund',
      hint: 'Lufträume, Funkfeuer und Hindernisse, dazu ein Gradnetz wie auf einer Papierkarte. Aus lassen, wenn es zu voll wirkt.'
    },
    fields: [['callsign', 'Rufzeichen'], ['fl', 'Höhe'], ['gs', 'Tempo'], ['type', 'Muster'], ['route', 'Route'], ['reg', 'Kennz.']],
    unitsHint: 'Piloten rechnen in Fuß und Knoten. 1 Knoten sind etwa 1,85 km/h.',
    viewHint: {
      radar: 'Nur der Radar, ohne Tafel.',
      board: 'Nur die Tafel mit den letzten Überflügen.',
      airport: 'Der Flughafen in der Mitte: Vorfeld, kurze Anflug- und Abflugschneisen und die Flugzeuge im Umkreis von 12 km. Der Standort wird dafür nicht gebraucht.',
      rot2: 'Radar und Tafel wechseln sich ab, wie bisher. Wie lange jede Ansicht bleibt, stellst du unten ein.',
      rot3: 'Radar, Tafel und Flughafen wechseln sich ab. Den Flughafen wählst du unten aus. Ohne Standort läuft der Radar mit Beispieldaten.'
    },
    radiusHint: (km) => 'So weit schaut der Radar. ' + (km <= 15 ? 'Nah dran: vor allem Flugzeuge direkt über dir.' : (km <= 40 ? 'Gut für Stadt und Flughafen.' : 'Weiter Blick: viele Flugzeuge, dafür kleiner.')),

    result: {
      copy: 'Kopieren',
      copied: 'Kopiert ✓',
      copiedSay: 'Adresse kopiert.',
      copyFail: 'Bitte markieren',
      copyFailSay: 'Kopieren hat nicht geklappt. Markiere die Adresse und kopiere sie von Hand.',
      shareBtn: 'Link teilen',
      shareTitle: 'MyAirspace',
      shareText: 'Mein Luftraum für den Fernseher:',
      test: 'Testen',
      qr: 'QR-Code: Auf dem Handy, Tablet oder Computer scannen, um die Adresse dort zu öffnen. Am Fernseher tippst du die Adresse ein.',
      deviceLabel: 'Wo soll es laufen?'
    },

    devices: [
      { id: 'tv', name: 'Smart-TV', sub: 'Samsung, LG, Android TV, Fire TV',
        intro: '',
        steps: [
          'Öffne den Browser am Fernseher (oft „Internet“ oder „Web Browser“).',
          'Gib die Adresse ein. Tipp: Viele Fernseher-Apps haben eine Handy-Tastatur (SmartThings, LG ThinQ, Google TV).',
          'Speichere ein Lesezeichen (Stern oder „Zu Favoriten“). Dann ist es beim nächsten Mal sofort da.',
          'Schalte den Browser auf Vollbild, falls er eine Leiste zeigt.'
        ] },
      { id: 'appletv', name: 'Apple TV', sub: 'per AirPlay vom iPhone, iPad oder Mac',
        intro: 'Der Apple TV hat selbst keinen Browser. Du spiegelst deinen Bildschirm per AirPlay.',
        steps: [
          'Öffne die Adresse in Safari auf iPhone, iPad oder Mac.',
          'Mac: Safari auf Vollbild stellen (grüner Knopf oben links). iPhone und iPad: Teilen, dann „Zum Home-Bildschirm“, dann startet es als Vollbild-App.',
          'Öffne das Kontrollzentrum und tippe auf „Bildschirmsynchronisierung“.',
          'Wähle deinen Apple TV aus der Liste.'
        ] },
      { id: 'computer', name: 'Computer', sub: 'Windows, Mac, Linux',
        intro: '',
        steps: [
          'Öffne die Adresse im Browser.',
          'Bewege die Maus und klicke links auf „Vollbild“, oder drücke die Taste F.',
          'Mit Esc kommst du zurück.',
          'Setze ein Lesezeichen (Strg+D oder Cmd+D).'
        ] },
      { id: 'phone', name: 'Handy oder iPad', sub: 'als App auf dem Home-Bildschirm',
        intro: '',
        steps: [
          'Tippe auf „Testen“, damit die Seite einmal geöffnet war.',
          'iPhone und iPad: Teilen, dann „Zum Home-Bildschirm“. Android: Menü, dann „App installieren“ oder „Zum Startbildschirm“.',
          'Starte MyAirspace vom Home-Bildschirm. Es öffnet sich im Vollbild, am schönsten im Querformat.'
        ] }
    ],

    tipsIntro: '',
    recap: (label, styleName, km) => (label ? label + ' · ' : '') + 'Stil ' + styleName + ' · Radius ' + km + ' km',
    tips: [
      { title: 'Nachts wird es dunkler', text: 'Von 23 bis 6 Uhr dimmt der Bildschirm von selbst. Die Zeiten änderst du unter „Alle Einstellungen“.' },
      { title: 'Look schnell wechseln', text: 'Hänge an die Adresse &style=nvg-night an, oder ändere den Wert nach style=. Möglich sind tower, fids, efis-airbus, eicam-boeing, chart-paper, nvg-night und tactical-olive (die alten Namen atc, terminal, airbus, boeing, chart, night und military funktionieren weiter).' },
      { title: 'Später ändern', text: 'Der Fernseher merkt sich nur die letzte Adresse. Alles Wichtige steckt in der Adresse, speichere sie als Lesezeichen. Zum Ändern öffnest du diese Seite einfach noch einmal.' }
    ]
  };

  /* ======================================================================
     Resume (sessionStorage only) and entry point
     ====================================================================== */
  const SKEY = 'ma.wz';
  const ORDER = ['welcome', 'standort', 'look', 'inhalt', 'fernseher', 'fertig'];
  const HASH = { willkommen: 'welcome', standort: 'standort', look: 'look', inhalt: 'inhalt', fernseher: 'fernseher', fertig: 'fertig', alle: 'all' };
  const HASH_OF = { welcome: 'willkommen', standort: 'standort', look: 'look', inhalt: 'inhalt', fernseher: 'fernseher', fertig: 'fertig', all: 'alle' };
  const NEEDS_LOC = { fernseher: true, fertig: true };
  const WITH_PREVIEW = { welcome: true, look: true, inhalt: true, all: true };

  function readSaved() { try { const v = JSON.parse(sessionStorage.getItem(SKEY) || 'null'); return v && typeof v === 'object' ? v : null; } catch (e) { return null; } }
  function writeSaved(v) { try { sessionStorage.setItem(SKEY, JSON.stringify(v)); } catch (e) { /* storage blocked: no resume, nothing else changes */ } }
  function clearSaved() { try { sessionStorage.removeItem(SKEY); } catch (e) { /* ignore */ } }

  const q0 = new URLSearchParams(location.search);
  const origSearch = location.search;
  const deep = q0.has('lat') && q0.has('lon');
  const wzParam = q0.get('wizard');
  const hash0 = Object.prototype.hasOwnProperty.call(HASH, location.hash.slice(1)) ? HASH[location.hash.slice(1)] : '';
  let startId = '';
  let resumed = false;

  if (wzParam === '1') clearSaved();
  const sv = wzParam === '1' || deep || wzParam === '0' ? null : readSaved();
  if (sv && typeof sv.q === 'string' && Object.prototype.hasOwnProperty.call(HASH_OF, sv.step)) {
    // resume: the saved choices go back into the address before config.js and setup.js read it
    // (the address the person sees is cleaned up again in init())
    const merged = new URLSearchParams(sv.q);
    q0.forEach((v, k) => { if (!merged.has(k)) merged.set(k, v); });
    try { history.replaceState(history.state, '', location.pathname + '?' + merged.toString() + location.hash); } catch (e) { /* ignore */ }
    resumed = true;
    startId = hash0 || sv.step;
  } else if (hash0) startId = hash0;
  else if (wzParam === '0' || deep) startId = 'all';
  else startId = 'welcome';

  /* ======================================================================
     Controller
     ====================================================================== */
  const $ = (id) => document.getElementById(id);
  const body = document.body;
  let cur = '';
  let depth = (history.state && history.state.ma && history.state.depth) || 0;

  function setup() { return MA.setup || { state: () => ({ loc: false, url: '', label: '', styleName: '', radius: 25, query: '' }), preview() {} }; }
  const hasLoc = () => !!setup().state().loc;

  function fillHeads() {
    ORDER.forEach((id) => {
      const sec = $('step-' + id), c = COPY.steps[id];
      sec.querySelector('.eyebrow').textContent = c.eyebrow;
      sec.querySelector('h2').textContent = c.title;
      sec.querySelector('.lead').textContent = c.lead;
    });
    const ul = $('promises');
    COPY.promises.forEach((t) => {
      const li = document.createElement('li');
      li.textContent = t;
      ul.appendChild(li);
    });
  }

  function fillTips() {
    const ol = $('tips');
    COPY.tips.forEach((t) => {
      const li = document.createElement('li');
      const b = document.createElement('b');
      b.textContent = t.title;
      const p = document.createElement('p');
      p.appendChild(document.createTextNode(t.text));
      if (t.code) {
        p.appendChild(document.createTextNode(' '));
        const c = document.createElement('code');
        c.textContent = t.code;
        p.appendChild(c);
        p.appendChild(document.createTextNode(t.after || ''));
      }
      li.appendChild(b);
      li.appendChild(p);
      ol.appendChild(li);
    });
  }

  /* device chooser: one radio per device, the steps below follow the choice */
  const ICONS = {
    tv: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    appletv: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M6 20.5h12M9 13l3-3.5 3 3.5z"/>',
    computer: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20M9 16v4M15 16v4"/>',
    phone: '<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18.5h2"/>'
  };
  function fillDevices() {
    const wrap = $('devices');
    COPY.devices.forEach((d, i) => {
      const l = document.createElement('label');
      l.className = 'device';
      l.innerHTML = '<input type="radio" name="device" value="' + d.id + '"' + (i === 0 ? ' checked' : '') + '>' +
        '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[d.id] + '</svg><b></b><small></small>';
      l.querySelector('b').textContent = d.name;
      l.querySelector('small').textContent = d.sub;
      wrap.appendChild(l);
    });
    wrap.addEventListener('change', showDevice);
    showDevice();
  }
  function showDevice() {
    const sel = document.querySelector('input[name="device"]:checked');
    const d = COPY.devices.filter((x) => x.id === (sel && sel.value))[0] || COPY.devices[0];
    $('device-intro').textContent = d.intro;
    $('device-intro').hidden = !d.intro;
    const ol = $('device-steps');
    ol.textContent = '';
    d.steps.forEach((s) => {
      const li = document.createElement('li');
      li.textContent = s;
      ol.appendChild(li);
    });
  }

  /* share via the system sheet (phones, some desktops) */
  function initShare() {
    const btn = $('share');
    if (!navigator.share) return;
    btn.hidden = false;
    btn.addEventListener('click', () => {
      const url = setup().state().url;
      if (!url) return;
      navigator.share({ title: COPY.result.shareTitle, text: COPY.result.shareText, url: url }).catch(() => { /* cancelled */ });
    });
  }

  function setNext(label, disabled) {
    const n = $('wz-next');
    n.textContent = label;
    n.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    n.classList.toggle('is-off', !!disabled);
  }

  function render() {
    const mode = cur === 'all' ? 'all' : 'wizard';
    body.setAttribute('data-mode', mode);
    body.setAttribute('data-step', cur);
    const loc = hasLoc();
    body.classList.toggle('has-loc', loc);

    ORDER.forEach((id) => {
      const show = mode === 'all' ? (id !== 'welcome' && id !== 'fertig') : id === cur;
      $('step-' + id).hidden = !show;
    });
    if (mode === 'all') $('coords').open = true;

    const idx = ORDER.indexOf(cur);          // 0 welcome … 5 fertig
    const nav = $('wz-nav');
    nav.hidden = mode === 'all';
    $('progress').hidden = mode === 'all' || idx < 1;
    $('wz-guided').hidden = mode !== 'all';
    $('wz-guided').textContent = COPY.nav.guided;
    $('wz-all').parentNode.hidden = mode === 'all';
    $('wz-all').textContent = cur === 'welcome' ? COPY.nav.expertWelcome : COPY.nav.expert;

    if (mode === 'wizard') {
      const c = COPY.steps[cur];
      const total = ORDER.length - 1;
      $('wz-step').textContent = idx > 0 ? COPY.stepOf(idx, total, c.name) : '';
      const dots = $('wz-dots').children;
      for (let i = 0; i < dots.length; i++) dots[i].className = i + 1 < idx ? 'done' : (i + 1 === idx ? 'cur' : '');
      $('wz-back').hidden = idx === 0;
      const last = cur === 'fertig';
      $('wz-next').hidden = last;
      $('wz-test').hidden = !last;
      $('wz-test').textContent = COPY.result.test;
      if (!last) setNext(c.next, cur === 'standort' && !loc);
      $('wz-hint').textContent = cur === 'standort' && !loc ? COPY.nav.needLocation : '';
      document.title = c.name + ' · ' + COPY.docTitle;
    } else {
      document.title = COPY.nav.expert + ' · ' + COPY.docTitle;
    }

    // show the preview column first: a frame loaded while hidden would size its canvas to 0 px
    const wantPv = !!WITH_PREVIEW[cur];
    $('side').hidden = !wantPv;
    body.classList.toggle('pv', wantPv);
    setup().preview({ on: wantPv, demo: cur === 'welcome' });
    refreshRecap();
  }

  function refreshRecap() {
    const s = setup().state();
    $('recap').textContent = COPY.recap(s.label, s.styleName, s.radius);
    $('wz-test').href = s.url || './';
  }

  function go(id, opts) {
    opts = opts || {};
    if (!Object.prototype.hasOwnProperty.call(HASH_OF, id)) id = 'welcome';
    if (NEEDS_LOC[id] && !hasLoc()) id = 'standort';
    const changed = id !== cur;
    cur = id;
    render();
    persist();
    if (opts.history === 'push') {
      depth++;
      try { history.pushState({ ma: 1, depth: depth }, '', '#' + HASH_OF[id]); } catch (e) { /* ignore */ }
    } else if (opts.history === 'replace') {
      try { history.replaceState({ ma: 1, depth: depth }, '', '#' + HASH_OF[id]); } catch (e) { /* ignore */ }
    }
    if (changed && !opts.quiet) {
      const sec = $(id === 'all' ? 'step-standort' : 'step-' + id);
      const h = sec.querySelector('h2');
      if (h) h.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }

  function persist() {
    const s = setup().state();
    writeSaved({ step: cur, q: s.query || '' });
  }

  // In-app Back replaces the current history entry instead of calling history.back(): the step changes at
  // once and deterministically, and browser Back/Forward still re-render through the popstate listener.
  function back() {
    const i = ORDER.indexOf(cur);
    depth = Math.max(0, depth - 1);
    go(ORDER[Math.max(0, i - 1)], { history: 'replace' });
  }

  function next() {
    const i = ORDER.indexOf(cur);
    if (cur === 'standort' && !hasLoc()) {
      $('wz-hint').textContent = COPY.nav.needLocation;
      const g = $('geo');
      if (g) g.focus();
      return;
    }
    if (i >= 0 && i < ORDER.length - 1) go(ORDER[i + 1], { history: 'push' });
  }

  function init() {
    fillHeads();
    fillTips();
    fillDevices();
    initShare();
    $('wz-back').addEventListener('click', back);
    $('wz-next').addEventListener('click', next);
    $('wz-all').addEventListener('click', () => go('all', { history: 'push' }));
    $('wz-guided').addEventListener('click', (e) => { e.preventDefault(); go('welcome', { history: 'push' }); });

    document.addEventListener('ma:update', () => {
      body.classList.toggle('has-loc', hasLoc());
      if (cur === 'standort') {
        setNext(COPY.steps.standort.next, !hasLoc());
        if (hasLoc()) $('wz-hint').textContent = '';
      }
      $('wz-test').href = setup().state().url || './';
      refreshRecap();
      persist();
    });

    window.addEventListener('popstate', () => {
      const id = HASH[location.hash.slice(1)] || 'welcome';
      const st = history.state;
      depth = st && st.ma ? st.depth || 0 : 0;
      go(id, { history: 'none' });
    });

    // the address was filled from a resumed session: show the clean address again
    if (resumed) {
      try { history.replaceState(history.state, '', location.pathname + origSearch + '#' + HASH_OF[startId]); } catch (e) { /* ignore */ }
    }
    go(startId, { history: 'replace', quiet: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
