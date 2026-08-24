// Stratos Ops service worker — scope /ops/
// Strategy: network-first for the app shell (always fresh when online, works offline),
// cache-first for brand images, passthrough for everything else (Firebase, fonts).
const VERSION = 'stratos-ops-v1.2.0';
const SHELL = [
  '/ops/',
  '/ops/index.html',
  '/ops/styles.css',
  '/ops/manifest.json',
  '/ops/js/main.js',
  '/ops/js/constants.js',
  '/ops/js/firebase.js',
  '/ops/js/util.js',
  '/ops/js/store.js',
  '/ops/js/annotate.js',
  '/ops/js/views/auth.js',
  '/ops/js/views/jobs.js',
  '/ops/js/views/job.js',
  '/ops/js/views/aircraft.js',
  '/ops/js/views/inventory.js',
  '/ops/js/views/team.js',
  '/ops/js/views/reports.js',
  '/ops/js/views/settings.js',
  '/images/logo-emblem.png',
  '/images/logo-flat-gold.png',
  '/images/icon-192.png',
  '/images/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => null))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith('stratos-ops-') && k !== VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/images/')) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(req, copy));
      return res;
    })));
    return;
  }

  if (url.pathname.startsWith('/ops/')) {
    e.respondWith(
      fetch(req, { cache: 'no-store' }).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() =>
        caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('/ops/index.html') : undefined))
      )
    );
  }
});
