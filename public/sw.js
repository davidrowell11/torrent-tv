// Minimal service worker so the web app can be installed (e.g. on a Chromebook).
// It caches the app shell only; it never caches downloads or API responses.
const SHELL = 'torrent-tv-shell-v1';
self.addEventListener('install', (e) => e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['./', './index.html', './icon.svg']))));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL).map((k) => caches.delete(k))))));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.mode === 'navigate' && url.origin === location.origin) {
    e.respondWith(fetch(e.request).catch(() => caches.match('./index.html')));
  }
});
