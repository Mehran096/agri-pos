// KILLER - deletes all caches and unregisters itself to fix crash loop
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Delete ALL caches (agri-pwa-v1, sona-shop-v3-no-flash, etc)
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      
      // Unregister this service worker
      await self.registration.unregister();
      
      // Reload all open tabs to clear SW
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => {
        client.navigate(client.url);
      });
    })()
  );
});