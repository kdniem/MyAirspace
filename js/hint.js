/* First-run help on the TV page (ES2017, no interaction possible on a TV).
   Without lat/lon in the URL this is the empty state: a calm full-screen welcome with the address of the
   setup page and a QR code. It never goes away (there is nothing to show yet); simulated traffic keeps
   moving behind it (js/config.js switches demo on when there is no location). A deliberate ?demo=1
   shows the plain demo without the overlay. Colours come from the style variables.
   With lat/lon, once per device (localStorage ma.tvSeen): a short "ready" line for ~12 s.
   Never shown inside the setup preview. */
(function () {
  var q = new URLSearchParams(location.search);
  var stage = document.getElementById('stage');
  if (!stage) return;
  try { if (window.top !== window.self) return; } catch (e) { return; }
  var dir = location.pathname.replace(/[^\/]*$/, '');
  var setupUrl = location.origin + dir + 'setup.html';
  var shortUrl = location.host + dir + 'setup.html';

  // all words on the TV page that belong to the first-run help
  var COPY = {
    brand: 'MYAIRSPACE',
    title: 'Willkommen bei MyAirspace',
    lead: 'Richte es in 2 Minuten ein:',
    scan: 'Code mit dem Handy scannen',
    or: 'oder diese Adresse öffnen',
    ready: 'Alles bereit. Einstellungen ändern: '
  };

  var calm = false;
  try { calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { calm = false; }
  var fade = calm ? '0s' : '2.5s';

  // a desktop browser (wide, with a mouse or trackpad) gets a compact card in px; a TV keeps the sizes in vh
  var desk = false;
  try { desk = !!(window.matchMedia && window.matchMedia('(min-width: 1280px) and (pointer: fine)').matches); } catch (e) { desk = false; }
  function S(vh, px) { return desk ? px + 'px' : vh + 'vh'; }

  function box(id, css) {
    var el = document.createElement('div');
    el.id = id;
    el.style.cssText = 'position:absolute;opacity:0;pointer-events:none;transition:opacity ' + fade + ' ease;' + css;
    return el;
  }
  function line(text, css) {
    var d = document.createElement('div');
    d.textContent = text;
    d.style.cssText = css;
    return d;
  }

  if (!(q.has('lat') && q.has('lon')) && q.get('view') !== 'airport') {   // the focus view needs no home location
    if (q.has('demo')) return;   // asked for the plain demo on purpose

    // veil over the moving demo traffic, content on a solid panel so text contrast does not depend on what flies by
    var el = box('hint', 'left:0;top:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;' +
      'padding:var(--safe-y) var(--safe-x);background:rgba(0,0,0,0.0);z-index:30');
    var veil = document.createElement('div');
    veil.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;background:var(--bg);opacity:0.72';
    el.appendChild(veil);
    var card = document.createElement('div');
    card.style.cssText = 'position:relative;display:flex;align-items:center;gap:' + S(6, 56) + ';padding:' + S(5, 48) + ' ' + S(6, 64) + ';' +
      'background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);color:var(--ink);max-width:100%' +
      (desk ? ';box-sizing:border-box;width:min(980px,100%);border-radius:14px' : '');

    var text = document.createElement('div');
    text.style.cssText = 'max-width:' + S(56, 520);
    text.appendChild(line(COPY.brand, 'font-size:' + S(1.8, 13) + ';letter-spacing:0.4em;color:var(--sub);margin-bottom:' + S(2.4, 22)));
    text.appendChild(line(COPY.title, 'font-size:' + S(5, 38) + ';line-height:1.15;letter-spacing:0.02em;color:var(--ink)'));
    text.appendChild(line(COPY.lead, 'font-size:' + S(2.8, 20) + ';line-height:1.35;margin-top:' + S(2.4, 22) + ';color:var(--ink)'));
    text.appendChild(line(shortUrl, 'font-size:' + S(3, 22) + ';margin-top:' + S(3, 26) + ';color:var(--accent);word-break:break-all'));
    text.appendChild(line(COPY.or, 'font-size:' + S(1.8, 14) + ';margin-top:' + S(1, 8) + ';color:var(--sub)'));

    var qrBox = document.createElement('div');
    qrBox.style.cssText = 'flex:none;text-align:center';
    if (window.MA && MA.qr) {
      try {
        var qr = document.createElement('div');
        qr.style.cssText = 'width:' + S(30, 250) + ';height:' + S(30, 250);
        qr.innerHTML = MA.qr.svg(setupUrl, { dark: '#050607', light: '#f4efe3', border: 2 });
        var svg = qr.firstChild;
        if (svg && svg.style) svg.style.cssText = 'width:100%;height:100%;display:block;border-radius:' + S(0.6, 8);
        qrBox.appendChild(qr);
        qrBox.appendChild(line(COPY.scan, 'font-size:' + S(1.8, 14) + ';margin-top:' + S(1.6, 14) + ';color:var(--sub)'));
        card.appendChild(qrBox);
      } catch (e) { /* text only */ }
    }
    card.insertBefore(text, card.firstChild);
    el.appendChild(card);
    stage.appendChild(el);
    setTimeout(function () { el.style.opacity = '1'; }, 600);
    return;
  }

  if (q.get('view') === 'airport') return;   // the focus view keeps its bottom line for the METAR
  var seen = false;
  try { seen = localStorage.getItem('ma.tvSeen') === '1'; localStorage.setItem('ma.tvSeen', '1'); } catch (e) { seen = true; }
  if (seen) return;
  var ready = box('hint', 'left:var(--safe-x);bottom:calc(var(--safe-y) - 1.4vh);font-size:1.5vh;' +
    'letter-spacing:0.06em;color:var(--attrib);white-space:nowrap');
  ready.textContent = COPY.ready + shortUrl;
  stage.appendChild(ready);
  setTimeout(function () { ready.style.opacity = '1'; }, 600);
  setTimeout(function () { ready.style.opacity = '0'; }, 12000);
  setTimeout(function () { if (ready.parentNode) ready.parentNode.removeChild(ready); }, 15000);
})();
