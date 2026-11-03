const CACHE_NAME = 'dubai-climate-v2';
const STATIC_ASSETS = [
  './',
  'index.html',
  'offline.html',
  'manifest.webmanifest',
  'src/css/styles.css',
  'src/js/app.js',
  'src/js/locations.js',
  'src/js/weather-api.js',
  'src/js/share.js',
  'public/favicon.svg',
  'public/og-image.svg',
  'public/icons/icon-192.svg',
  'public/icons/icon-512.svg',
  'public/icons/icon-maskable.svg',
  'public/icons/apple-touch-icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => { if (key !== CACHE_NAME) return caches.delete(key); }))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Network-First with cache fallback for the Open-Meteo weather API
  if (url.hostname.endsWith('open-meteo.com')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200) {
            const resClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          return new Response(JSON.stringify({ error: 'offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }

  // Stale-While-Revalidate for app assets; offline.html for failed page loads
  const isNavigation = event.request.mode === 'navigate';
  event.respondWith(
    caches.match(event.request, { ignoreSearch: isNavigation }).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => {
          if (isNavigation) return caches.match('offline.html');
        });
      return cachedResponse || fetchPromise;
    })
  );
});
