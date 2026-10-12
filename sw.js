/* MyAirspace service worker: keeps the app shell available offline.
   Network-first for the shell only; flight APIs, proxies, search and fonts are never touched.
   Bump VERSION when the shell file list changes; every deploy is picked up anyway (network-first). */
var VERSION = 'v7';
var CACHE = 'myairspace-shell-' + VERSION;
var SHELL = [
  './', 'index.html', 'setup.html', 'datenschutz.html', 'manifest.webmanifest',
  'css/style.css', 'css/setup.css',
  'data/geo-features.js',
  'fonts/fonts.css', 'fonts/ibm-plex-mono-400.woff2', 'fonts/ibm-plex-mono-500.woff2', 'fonts/ibm-plex-mono-600.woff2',
  'js/pwa.js', 'js/styles.js', 'js/config.js', 'js/theme.js', 'js/hint.js', 'js/geo.js', 'js/format.js', 'js/airlines.js', 'js/special.js', 'js/pick.js', 'js/demo.js',
  'js/data.js', 'js/weather.js', 'js/glyphs.js', 'js/radar.js', 'js/board.js', 'js/log.js', 'js/views.js', 'js/main.js', 'js/fullscreen.js',
  'js/qr.js', 'js/setup.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon.svg'
];
var SHELL_URLS = SHELL.map(function (p) { return new URL(p, self.registration.scope).href; });

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // one by one: a single missing file must not break the install
    return Promise.all(SHELL_URLS.map(function (u) {
      return c.add(new Request(u, { cache: 'reload' })).catch(function () {});
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) {
      if (k.indexOf('myairspace-shell-') === 0 && k !== CACHE) return caches.delete(k);
    }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.indexOf('/api/') !== -1) return;
  url.search = '';
  url.hash = '';
  var key = url.href;
  if (req.mode !== 'navigate' && SHELL_URLS.indexOf(key) === -1) return;
  e.respondWith(fetch(req).then(function (res) {
    if (res.ok && res.type === 'basic') {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(key, copy); });
    }
    return res;
  }).catch(function () {
    return caches.match(key).then(function (hit) {
      if (hit || req.mode !== 'navigate') return hit || Response.error();
      return caches.match(new URL('./', self.registration.scope).href).then(function (root) {
        return root || Response.error();
      });
    });
  }));
});
