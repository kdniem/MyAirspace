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
    'font-size:1.5vh;letter-spacing:0.06em;color:var(--attrib);opacity:0;pointer-events:none;' +
    'transition:opacity 2.5s ease;white-space:nowrap';
  stage.appendChild(el);
  setTimeout(function () { el.style.opacity = '1'; }, 600);
  setTimeout(function () { el.style.opacity = '0'; }, 20000);
  setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 23000);
})();
