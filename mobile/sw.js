const CACHE_NAME = 'billops-mobile-v2';
const SHELL = ['./', 'index.html', 'manifest.json', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// Network-first : le shell est toujours rechargé frais quand il y a du réseau,
// le cache ne sert que de secours hors-ligne (évite de rester bloqué sur une vieille version).
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;
  event.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
      return res;
    }).catch(() => caches.match(req))
  );
});

// Rappel qu'une prestation commence — pas de contenu chiffré (payload-less),
// texte fixe pour éviter d'implémenter le déchiffrement RFC 8291 côté client.
self.addEventListener('push', (event) => {
  event.waitUntil(
    self.registration.showNotification('Bill Ops', {
      body: "Une prestation commence — ouvre l'app pour pointer ton arrivée.",
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: 'booking-start'
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./index.html');
    })
  );
});
