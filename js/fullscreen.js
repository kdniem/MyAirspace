/* Fullscreen button for desktop browsers.
   Appears when the mouse moves and fades out after 3 s; the F key and a double click toggle too.
   Hidden where there is no Fullscreen API (iPhone, many TV browsers) or when the page already
   runs as an installed app. Colours follow the theme variables, with fallbacks. */
(function () {
  var de = document.documentElement;
  var request = de.requestFullscreen || de.webkitRequestFullscreen;
  var exit = document.exitFullscreen || document.webkitExitFullscreen;
  var enabled = document.fullscreenEnabled || document.webkitFullscreenEnabled;
  if (!request || !exit || !enabled) return;
  if (navigator.standalone) return;
  if (window.matchMedia && window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches) return;

  var HIDE_MS = 3000;
  var ICON_ENTER = '<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_EXIT = '<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var style = document.createElement('style');
  style.textContent =
    '#fs-btn{position:fixed;left:2vw;top:50%;transform:translateY(-50%);z-index:60;display:flex;align-items:center;' +
    'padding:1.1vh 1.4vw 1.1vh 1.1vw;border:1px solid var(--faint,#2a2e33);border-radius:5vh;' +
    'background:var(--panel,#0a0b0d);color:var(--ink,#e9e4d8);font:500 1.7vh var(--mono,"IBM Plex Mono",monospace);' +
    'letter-spacing:.14em;text-transform:uppercase;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .3s ease}' +
    '#fs-btn.on{opacity:.95;pointer-events:auto}' +
    '#fs-btn:hover,#fs-btn:focus{border-color:var(--amber,#ffb547);outline:none}' +
    '#fs-btn i{display:block;width:2.6vh;height:2.6vh;margin-right:.9vw}' +
    'body.fs-ui,body.fs-ui *{cursor:default !important}';
  document.head.appendChild(style);

  var btn = document.createElement('button');
  btn.id = 'fs-btn';
  btn.type = 'button';
  btn.innerHTML = '<i></i><span></span>';
  document.body.appendChild(btn);
  var icon = btn.firstChild, label = btn.lastChild;

  function isFs() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }

  function paint() {
    var fs = isFs();
    icon.innerHTML = fs ? ICON_EXIT : ICON_ENTER;
    label.textContent = fs ? 'Vollbild beenden' : 'Vollbild';
    btn.setAttribute('aria-label', label.textContent);
  }

  function toggle() {
    var p;
    try { p = isFs() ? exit.call(document) : request.call(de); } catch (e) { return; }
    if (p && p.catch) p.catch(function () {});     // refused (no user gesture, policy): stay as is
  }

  var timer = null, hover = false;
  function show() {
    btn.classList.add('on');
    document.body.classList.add('fs-ui');
    clearTimeout(timer);
    timer = setTimeout(hide, HIDE_MS);
  }
  function hide() {
    if (hover) { timer = setTimeout(hide, HIDE_MS); return; }
    btn.classList.remove('on');
    document.body.classList.remove('fs-ui');
  }

  btn.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });
  btn.addEventListener('mouseenter', function () { hover = true; });
  btn.addEventListener('mouseleave', function () { hover = false; show(); });
  document.addEventListener('mousemove', show);
  document.addEventListener('touchstart', show, { passive: true });
  document.addEventListener('dblclick', function (e) { if (e.target !== btn) toggle(); });
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) toggle();
  });
  document.addEventListener('fullscreenchange', function () { paint(); show(); });
  document.addEventListener('webkitfullscreenchange', function () { paint(); show(); });

  paint();
})();
