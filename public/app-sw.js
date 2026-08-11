const CACHE_NAME = "gfv-app-shell-v8";
const MAP_TILE_CACHE_MAX_ITEMS = 9000;
const MAP_TILE_PREFETCH_CONCURRENCY = 8;
const MAP_TILE_CACHES = {
  wac: "gfv-geoaisweb-wac-v2",
  rea: "gfv-geoaisweb-rea-chart-v2",
  reh: "gfv-geoaisweb-reh-chart-v2",
};
const MAP_TILE_CACHE_NAMES = new Set(Object.values(MAP_TILE_CACHES));
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
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME && !MAP_TILE_CACHE_NAMES.has(key))
            .map((key) => caches.delete(key)),
        ),
      )
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

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || Response.error();
  }
}

function geoaiswebLayerSet(url) {
  if (url.origin === self.location.origin && url.pathname === "/api/geoaisweb/wms") {
    const layerSet = (url.searchParams.get("layerSet") || "").toLowerCase();
    return MAP_TILE_CACHES[layerSet] ? layerSet : null;
  }

  const isGeoaisweb = url.origin === "https://geoaisweb.decea.mil.br";
  const isDevProxy = url.origin === self.location.origin && url.pathname.startsWith("/geoaisweb-proxy/");
  if (!isGeoaisweb && !isDevProxy) return null;
  if (!url.pathname.includes("/geoserver/ows")) return null;
  if ((url.searchParams.get("request") || "").toLowerCase() !== "getmap") return null;
  if (!(url.searchParams.get("format") || "").toLowerCase().startsWith("image/")) return null;
  const layers = url.searchParams.get("layers") || "";
  if (/\bICA:WAC_/.test(layers)) return "wac";
  if (/\bICA:CCV_REA_/.test(layers)) return "rea";
  if (/\bICA:CCV_REH_/.test(layers)) return "reh";
  return null;
}

function mapTileCacheName(url) {
  const layerSet = geoaiswebLayerSet(url);
  return layerSet ? MAP_TILE_CACHES[layerSet] : null;
}

function normalizedMapTileRequest(request) {
  const url = new URL(request.url);
  const sorted = new URLSearchParams([...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b)));
  url.search = sorted.toString();
  return new Request(url.href, {
    method: "GET",
    mode: request.mode,
    credentials: request.credentials,
    cache: "default",
    redirect: request.redirect,
    referrer: request.referrer,
    integrity: request.integrity,
  });
}

async function trimMapTileCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAP_TILE_CACHE_MAX_ITEMS) return;
  await Promise.all(keys.slice(0, keys.length - MAP_TILE_CACHE_MAX_ITEMS).map((key) => cache.delete(key)));
}

async function fetchAndStoreMapTile(cache, request) {
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") {
    await cache.put(request, response.clone());
    void trimMapTileCache(cache);
  }
  return response;
}

async function staleWhileRevalidateMapTile(cacheName, request) {
  const normalized = normalizedMapTileRequest(request);
  const cache = await caches.open(cacheName);
  const cached = await cache.match(normalized);
  const refresh = fetchAndStoreMapTile(cache, normalized).catch(() => null);
  if (cached) {
    void cache.put(normalized, cached.clone()).catch(() => {});
    return cached;
  }
  const response = await refresh;
  return response || Response.error();
}

async function prefetchMapTiles(urls) {
  const queue = [...urls];
  async function worker() {
    while (queue.length) {
      const rawUrl = queue.shift();
      if (!rawUrl) continue;
      try {
        const url = new URL(rawUrl, self.location.origin);
        const cacheName = mapTileCacheName(url);
        if (!cacheName) continue;
        const request = normalizedMapTileRequest(new Request(url.href));
        const cache = await caches.open(cacheName);
        if (await cache.match(request)) continue;
        await fetchAndStoreMapTile(cache, request);
      } catch {
        // Ignore malformed prefetch URLs and transient network failures.
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(MAP_TILE_PREFETCH_CONCURRENCY, queue.length) }, () => worker()),
  );
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "GFV_PREFETCH_MAP_TILES" || !Array.isArray(data.urls)) return;
  event.waitUntil(prefetchMapTiles(data.urls.slice(0, 240)));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  const mapCacheName = mapTileCacheName(url);
  if (mapCacheName) {
    event.respondWith(staleWhileRevalidateMapTile(mapCacheName, request));
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstWithShellFallback(request));
    return;
  }

  // Só /assets/ tem hash no nome do arquivo (imutável) — cache-first é seguro.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Demais .js/.css têm URL fixa (ex.: o CSS do Tailwind no servidor de dev):
  // cache-first servia versão velha a cada F5 e a tela carregava "sem cores".
  if (url.pathname.endsWith(".js") || url.pathname.endsWith(".css")) {
    event.respondWith(networkFirst(request));
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
