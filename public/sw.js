const CACHE = 'al-farooq-zarghi-v1-offline';
const PRECACHE = [
  '/login',
  '/manifest.json',
  '/logo.png',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // 1. NEVER cache API, non-GET, external, chrome-extension
  if (
    url.pathname.startsWith('/api') ||
    req.method !== 'GET' ||
    url.origin !== location.origin ||
    url.protocol === 'chrome-extension:'
  ) {
    return;
  }

  // 2. PAGES (navigate) -> Network First + offline fallback
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && res.headers.get('content-type')?.includes('text/html')) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE);
          const cached = await cache.match(req);
          if (cached) return cached;
          const login = await cache.match('/login');
          if (login) return login;
          return new Response('Offline - Please connect to Al-Farooq Shop', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
          });
        })
    );
    return;
  }

  // 3. ASSETS (js/css/images/fonts) -> Cache First
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (!res.ok || (res.type !== 'basic' && res.type !== 'cors')) {
            return res;
          }
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
          return res;
        })
        .catch(() => {
          if (req.destination === 'image') {
            return new Response('', { status: 503, statusText: 'Offline Image' });
          }
          return new Response('', { status: 503, statusText: 'Offline' });
        });
    })
  );
});