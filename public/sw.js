const CACHE_NAME = "agri-pwa-v1";
const urlsToCache = [
  "/",
  "/dashboard",
  "/dashboard/products",
  "/dashboard/sales",
  "/dashboard/sales/history",
  "/manifest.json",
  "/icon.png",
  "/icon-circle-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.map((name) => {
          if (name !== CACHE_NAME) return caches.delete(name);
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      // Network first for API, Cache first for pages
      if (event.request.url.includes("/api/")) {
        return fetch(event.request)
          .then((res) => {
            // cache api response
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
            return res;
          })
          .catch(() => cached);
      }
      return cached || fetch(event.request).catch(() => cached);
    })
  );
});