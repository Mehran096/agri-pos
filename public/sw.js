
const CACHE = 'al-farooq-v5';

const PRECACHE = [
  '/offline',
  '/manifest.json',
  '/logo.png',
  '/',
  '/login'
];

// Pages that we try to cache but we don't fail if they redirect
const OPTIONAL_PRECACHE = [
  '/dashboard',
  '/dashboard/sales',
  '/dashboard/products',
  '/dashboard/sales/history'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      // 1. Critical files - try but don't fail build
      await Promise.allSettled(
        PRECACHE.map(async (url) => {
          try {
            const req = new Request(url, { cache: 'no-cache' });
            const res = await fetch(req);
            if (res.ok) await cache.put(req, res);
          } catch {
            // ignore - will be cached on first visit
          }
        })
      );

      // 2. Optional pages - silent
      await Promise.allSettled(
        OPTIONAL_PRECACHE.map(async (url) => {
          try {
            const res = await fetch(url, { cache: 'no-cache' });
            if (res.ok && res.headers.get('content-type')?.includes('text/html')) {
              await cache.put(url, res);
            }
          } catch {
            // ignore
          }
        })
      );
    }).then(() => self.skipWaiting())
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

  if (
    url.pathname.startsWith('/api') ||
    req.method !== 'GET' ||
    url.origin !== location.origin ||
    url.protocol === 'chrome-extension:' ||
    url.pathname.startsWith('/_next/webpack-hmr')
  ) {
    return;
  }

  // PAGES -> Network First
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

          const offline = await cache.match('/offline');
          if (offline) return offline;

          const login = await cache.match('/login');
          if (login) return login;

          const home = await cache.match('/');
          if (home) return home;

          return new Response(
            `<html><body style="font-family:system-ui;text-align:center;padding:40px">
              <img src="/logo.png" style="width:80px;height:80px;border-radius:50%;border:2px solid #166534"/>
              <h1>Al-Farooq Zarghi Shop</h1>
              <p>الفاروق زرعی سٹور - Offline</p>
              <p style="color:#666">Please connect to internet once</p>
              <p style="font-size:12px;color:#999">0333-9426374</p>
            </body></html>`,
            { status: 200, headers: { 'Content-Type': 'text/html' } }
          );
        })
    );
    return;
  }

  // ASSETS -> Cache First
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (!res.ok) return res;
          if (res.type !== 'basic' && res.type !== 'cors' && res.type !== 'default') return res;

          if (
            url.pathname.includes('_next/static') ||
            url.pathname === '/logo.png' ||
            url.pathname === '/manifest.json' ||
            req.destination === 'style' ||
            req.destination === 'script'
          ) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => {
          if (req.destination === 'image') {
            return caches.match('/logo.png');
          }
          return new Response('', { status: 503, statusText: 'Offline - Al-Farooq' });
        });
    })
  );
});