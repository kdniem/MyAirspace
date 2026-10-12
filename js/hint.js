/* Tiny hint on the TV page: without lat/lon in the URL, point to the setup page for ~20 s. */
(function () {
  var q = new URLSearchParams(location.search);
  if (q.has('lat') && q.has('lon')) return;
  var stage = document.getElementById('stage');
  if (!stage) return;
  var dir = location.pathname.replace(/[^\/]*$/, '');
  var el = document.createElement('div');
  el.id = 'hint';
  el.textContent = 'Einrichten: ' + location.host + dir + 'setup.html';
  el.style.cssText = 'position:absolute;left:var(--safe-x);bottom:calc(var(--safe-y) - 1.4vh);' +
    'font-size:1.15vh;letter-spacing:0.14em;color:#6d7176;opacity:0;pointer-events:none;' +
    'transition:opacity 2.5s ease;white-space:nowrap';
  stage.appendChild(el);
  setTimeout(function () { el.style.opacity = '0.8'; }, 600);
  setTimeout(function () { el.style.opacity = '0'; }, 20000);
  setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 23000);
})();
