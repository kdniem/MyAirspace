/* First-run help on the TV page (ES2017, no interaction possible on a TV).
   Without lat/lon in the URL: a calm welcome panel with a QR code to the setup page for ~45 s.
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

  function show(el, hideAfter) {
    stage.appendChild(el);
    setTimeout(function () { el.style.opacity = '1'; }, 600);
    setTimeout(function () { el.style.opacity = '0'; }, hideAfter);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, hideAfter + 3000);
  }
  function box(id, css) {
    var el = document.createElement('div');
    el.id = id;
    el.style.cssText = 'position:absolute;opacity:0;pointer-events:none;transition:opacity 2.5s ease;' + css;
    return el;
  }

  if (!(q.has('lat') && q.has('lon'))) {
    var el = box('hint', 'left:var(--safe-x);top:50%;transform:translateY(-50%);display:flex;align-items:center;' +
      'gap:2.6vh;padding:2.6vh 3vh;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);color:var(--ink)');
    var text = document.createElement('div');
    text.style.cssText = 'max-width:34vh';
    var h = document.createElement('div');
    h.textContent = 'Willkommen bei MyAirspace';
    h.style.cssText = 'font-size:2.6vh;letter-spacing:0.06em;color:var(--accent);margin-bottom:1vh';
    var p = document.createElement('div');
    p.textContent = 'Scanne den Code mit dem Handy und stelle deinen Luftraum ein.';
    p.style.cssText = 'font-size:1.8vh;line-height:1.4';
    var u = document.createElement('div');
    u.textContent = shortUrl;
    u.style.cssText = 'font-size:1.6vh;margin-top:1.2vh;color:var(--sub);word-break:break-all';
    text.appendChild(h); text.appendChild(p); text.appendChild(u);
    if (window.MA && MA.qr) {
      try {
        var qr = document.createElement('div');
        qr.style.cssText = 'width:22vh;height:22vh;flex:none';
        qr.innerHTML = MA.qr.svg(setupUrl, { dark: '#050607', light: '#f4efe3', border: 2 });
        var svg = qr.firstChild;
        if (svg && svg.style) svg.style.cssText = 'width:100%;height:100%;display:block';
        el.appendChild(qr);
      } catch (e) { /* text only */ }
    }
    el.appendChild(text);
    show(el, 45000);
    return;
  }

  var seen = false;
  try { seen = localStorage.getItem('ma.tvSeen') === '1'; localStorage.setItem('ma.tvSeen', '1'); } catch (e) { seen = true; }
  if (seen) return;
  var ready = box('hint', 'left:var(--safe-x);bottom:calc(var(--safe-y) - 1.4vh);font-size:1.5vh;' +
    'letter-spacing:0.06em;color:var(--attrib);white-space:nowrap');
  ready.textContent = 'Alles bereit. Einstellungen ändern: ' + shortUrl;
  show(ready, 12000);
})();
