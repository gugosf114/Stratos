const CACHE = 'stratos-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/images/logo.png',
  '/images/logo-nav.png',
  '/images/van.png',
  '/images/jet.png',
  '/images/airport.png',
  '/images/icon-192.png',
  '/images/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
