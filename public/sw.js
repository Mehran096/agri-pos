const CACHE = 'al-farooq-v4';
const PRECACHE = [
  '/login',
  '/offline',
  '/',
  '/dashboard',
  '/dashboard/sales',
  '/dashboard/products',
  '/dashboard/sales/history',
  '/logo.png',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.error("Al-Farooq precache failed:", err);
        // Don't fail install completely - skip missing files
        return self.skipWaiting();
      })
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

  // PAGES -> Network First, then Cache, then /offline, then /login
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
          // Try exact page
          const cached = await cache.match(req);
          if (cached) return cached;
          // Try offline branded page
          const offline = await cache.match('/offline');
          if (offline) return offline;
          // Fallback to login (your start_url)
          const login = await cache.match('/login');
          if (login) return login;
          // Last resort - home
          const home = await cache.match('/');
          if (home) return home;
          
          return new Response(`
            <html><body style="font-family:system-ui;text-align:center;padding:40px">
              <img src="/logo.png" style="width:80px;height:80px;border-radius:50%;border:2px solid #166534"/>
              <h1>Al-Farooq Zarghi Shop</h1>
              <p>الفاروق زرعی سٹور - Offline</p>
              <p style="color:#666">Please connect to internet once</p>
              <p style="font-size:12px;color:#999">0333-9426374</p>
            </body></html>`, {
            status: 200,
            headers: { 'Content-Type': 'text/html' }
          });
        })
    );
    return;
  }

  // ASSETS -> Cache First, then Network
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (!res.ok || (res.type !== 'basic' && res.type !== 'cors' && res.type !== 'default')) {
            return res;
          }
          // Don't cache Next.js chunk if 404
          if (url.pathname.includes('_next/static') || url.pathname === '/logo.png' || url.pathname === '/manifest.json') {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone));
          } else if (res.headers.get('content-type')?.includes('javascript') || res.headers.get('content-type')?.includes('css')) {
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