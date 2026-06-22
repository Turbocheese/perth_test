// Service Worker for Perth Trip 2026
const CACHE_VERSION = "v2";
const CACHE_NAME = `perth-trip-${CACHE_VERSION}`;

// Core app shell - cached eagerly on install
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./script.js",
  "./manifest.json",
  "./icon.svg",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
];

// Live data APIs - always try the network first, fall back to cache
const NETWORK_FIRST_HOSTS = ["api.open-meteo.com", "api.exchangerate-api.com"];

// Install - cache the app shell
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      console.log("📦 Caching app shell");
      // allSettled so one failed URL (e.g. a flaky CDN) doesn't block install
      return Promise.allSettled(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => {
            console.warn("⚠️ Failed to cache:", url, err);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

// Fetch strategy:
// - Network-first for live data APIs (weather, exchange rate)
// - Cache-first (stale-while-revalidate) for everything else
self.addEventListener("fetch", function (event) {
  const requestUrl = new URL(event.request.url);

  // Only handle GET requests; let everything else pass through
  if (event.request.method !== "GET") return;

  if (NETWORK_FIRST_HOSTS.includes(requestUrl.hostname)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(staleWhileRevalidate(event.request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) {
      console.log("📡 Offline - serving cached data for", request.url);
      return cached;
    }
    throw err;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    // Return cached immediately, update cache in background
    networkFetch;
    return cached;
  }

  const networkResponse = await networkFetch;
  if (networkResponse) return networkResponse;

  // Nothing cached and network failed - offline fallback for page navigations
  if (request.mode === "navigate") {
    return new Response(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Offline</title>
      <style>body{font-family:system-ui;text-align:center;padding:3rem 1.5rem;color:#444}
      h1{font-size:1.4rem}</style></head>
      <body><h1>📡 You're offline</h1><p>Perth Trip 2026 couldn't load this page. Reconnect and try again.</p></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  return new Response("", { status: 503, statusText: "Offline" });
}

// Activate - clean old caches
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (cacheNames) {
      return Promise.all(
        cacheNames.map(function (cacheName) {
          if (cacheName !== CACHE_NAME) {
            console.log("🗑️ Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});
