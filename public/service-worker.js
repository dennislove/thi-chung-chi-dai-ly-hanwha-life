// Self-destructing Service Worker
// This will force the browser to unregister the Service Worker, clear the cache, and reload the page.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    self.registration.unregister()
      .then(() => self.clients.matchAll())
      .then(clients => {
        clients.forEach(client => {
          if (client.url && 'navigate' in client) {
            client.navigate(client.url);
          }
        });
      })
      .then(() => {
        console.log('SW: Service worker successfully self-destructed and unregistered.');
      })
  );
});
