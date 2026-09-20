/**
 * ORYQEN Production Service Worker (PWA Shell & Offline Asset Cache)
 * Version 2.0.0
 * Provides complete offline shell resilience, asset caching, and offline status handling.
 */

const CACHE_NAME = 'oryqen-static-v6';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css',
  'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js',
  'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js',
];

// Install: pre-cache critical UI shell
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('PWA Pre-cache notice:', err);
      });
    })
  );
});

// Activate: clean up outdated cache versions immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network-First with offline cache fallback
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // If API request, attempt Network-First with offline fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Return structured offline fallback for health or status requests
        if (url.pathname === '/api/health' || url.pathname === '/api/models/status') {
          return new Response(
            JSON.stringify({
              status: 'offline',
              app: 'ORYQEN',
              offline_ready: true,
              inference_mode: 'offline_local_model',
              has_internet: false,
              active_local_model: 'ORYQEN Local Core',
            }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(
          JSON.stringify({ error: 'Network request failed in offline mode' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // For static assets, use Network-First falling back to offline cache
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          event.request.method === 'GET' &&
          !url.protocol.startsWith('chrome-extension')
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/index.html');
          }
        });
      })
  );
});

