const CACHE = 'seedlingspeaks-v1';
const PRECACHE = ['/', '/app'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

// Network-first for API calls, cache-first for static assets
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || e.request.url.includes('/api/')) return; // never cache API calls
  e.respondWith(
    fetch(e.request).catch(async () => {
      const cached = await caches.match(e.request);
      if (cached) return cached;
      return new Response('Offline', {
        status: 503,
        statusText: 'Offline',
        headers: { 'Content-Type': 'text/plain' },
      });
    })
  );
});
