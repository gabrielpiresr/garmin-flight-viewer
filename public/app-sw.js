const CACHE_NAME = "gfv-app-shell-v4";
const APP_SHELL_URLS = [
  "/",
  "/offline/diario-bordo",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/favicon-48.png",
  "/screenshots/desktop-wide.png",
  "/screenshots/mobile-narrow.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function networkFirstWithShellFallback(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (await cache.match("/offline/diario-bordo")) || (await cache.match("/"));
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstWithShellFallback(request));
    return;
  }

  if (url.pathname.startsWith("/assets/") || url.pathname.endsWith(".js") || url.pathname.endsWith(".css")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/favicon-48.png" ||
    url.pathname === "/icon.svg" ||
    url.pathname === "/icon-192.png" ||
    url.pathname === "/icon-512.png" ||
    url.pathname === "/screenshots/desktop-wide.png" ||
    url.pathname === "/screenshots/mobile-narrow.png"
  ) {
    event.respondWith(cacheFirst(request));
  }
});
