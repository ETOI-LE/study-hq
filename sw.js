// Offline support: cache the app shell, serve it cache-first, update in the background.
const CACHE = 'study-hq-v1';
const FILES = [
  './', './index.html', './manifest.webmanifest', './icons/icon.svg', './css/styles.css',
  './js/app.js', './js/db.js', './js/store.js', './js/logic.js', './js/ui.js', './js/session.js',
  './js/data-ib.js', './js/backup.js', './js/sample.js',
  './js/views/onboarding.js', './js/views/today.js', './js/views/focus.js',
  './js/views/mistakes.js', './js/views/topics.js', './js/views/settings.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // Network first so updates show up straight away; the cache is the offline fallback.
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});
