const CACHE_NAME = "sona-shop-v3-no-flash";

self.addEventListener("install", () => {
  // Don't pre-cache anything - that's what causes flash
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 1. NEVER cache these - always go network
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/") ||
    url.pathname.startsWith("/login") ||
    url.pathname.startsWith("/register") ||
    event.request.method !== "GET"
  ) {
    return; // browser will fetch normally, no SW
  }

  // 2. For pages - NETWORK FIRST (no flash), cache as fallback for offline
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful page for offline use only
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Only if offline, show cached
        return caches.match(event.request);
      })
  );
});