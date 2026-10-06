const CACHE = 'sona-shop-v4-offline';
const PRECACHE = [
  '/login',
  '/manifest.json',
  '/icon-circle-180.png',
  '/icon-circle-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Skip API, non-GET, external - critical for auth
  if (url.pathname.startsWith('/api') || req.method !== 'GET' || url.origin !== location.origin) {
    return;
  }

  // Pages -> Network first = no auth loop crash + offline fallback
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('/login')))
    );
    return;
  }

  // Assets (JS/CSS/images) -> Cache first = offline working
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(req, clone));
          }
          return res;
        })
        .catch(() => {
          // Offline and not cached - return nothing (no crash)
          return new Response('', { status: 503, statusText: 'Offline' });
        });
    })
  );
});