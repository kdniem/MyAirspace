/* Home-screen app support (loaded before config.js, ES2017, no dependencies).
   An installed app starts at the manifest's start_url ("./") without the user's
   lat/lon, so the last TV URL is remembered and restored when launched as an app. */
(function () {
  /* The own proxy and the rule for ?proxy= live here because this script runs first;
     js/config.js uses the same helper. Accepted: the default proxy, 'off', or an https
     *.vercel.app URL on the own project host. Anything else is ignored. */
  var MA = window.MA = window.MA || {};
  var DEFAULT_PROXY = MA.DEFAULT_PROXY = 'https://myairspace-nu.vercel.app/api/proxy';
  var OWN_HOST = /^https:\/\/([a-z0-9.-]+\.vercel\.app)(?:[\/?#]|$)/.exec(DEFAULT_PROXY)[1];
  MA.proxyOk = function (v) {
    if (v === DEFAULT_PROXY || v === 'off') return true;
    var m = /^https:\/\/([a-z0-9.-]+\.vercel\.app)(?::443)?\/api\/proxy$/i.exec(v || '');
    return !!m && m[1].toLowerCase() === OWN_HOST;
  };

  var KEY = 'ma.lastQuery';
  var q = location.search;
  var embedded = false;
  try { embedded = window.top !== window.self; } catch (e) { embedded = true; }

  function installed() {
    if (window.navigator.standalone === true) return true;
    if (!window.matchMedia) return false;
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches;
  }

  try {
    if (/[?&]lat=/.test(q) && /[?&]lon=/.test(q)) {
      if (!embedded) localStorage.setItem(KEY, q);   // not from the setup preview
    } else if (!q && installed()) {
      var saved = localStorage.getItem(KEY);
      if (saved && saved.charAt(0) === '?') {
        var sq = new URLSearchParams(saved);
        if (sq.has('proxy') && !MA.proxyOk(sq.get('proxy'))) { sq.delete('proxy'); saved = '?' + sq.toString(); }
        location.replace(location.pathname + saved);
        return;
      }
    }
  } catch (e) { /* storage blocked: just run with the defaults */ }

  var local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || local) && !embedded) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
