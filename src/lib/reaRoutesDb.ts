/** GeoAISWEB CV_REA / CV_REH — rotas especiais VFR (AIC). */

export type ReaRouteKind = "rea" | "reh";

/**
 * Campos do WFS. O GeoAISWEB nomeia os extremos do eixo como `fixo_*`
 * (não `ponto_*`).
 */
export type ReaRouteProps = {
  id?: number;
  tipo?: string | null;
  nome?: string | null;
  trecho?: number | null;
  classe?: string | null;
  fca?: string | null;
  ats?: string | null;
  semi_largura?: number | null;
  rumoa_to_b?: number | null;
  rumob_to_a?: number | null;
  altmax?: number | null;
  altmin?: number | null;
  altcomp?: number | null;
  altmaxa_to_b?: number | null;
  altmina_to_b?: number | null;
  altmaxb_to_a?: number | null;
  altminb_to_a?: number | null;
  altcompa_to_b?: number | null;
  altcompb_to_a?: number | null;
  fixo_a_lat?: number | null;
  fixo_a_lon?: number | null;
  fixo_b_lat?: number | null;
  fixo_b_lon?: number | null;
  fixo_a_nome?: string | null;
  fixo_b_nome?: string | null;
  /** Aliases caso algum layer use ponto_*. */
  ponto_a_lat?: number | null;
  ponto_a_lon?: number | null;
  ponto_b_lat?: number | null;
  ponto_b_lon?: number | null;
  ponto_a_nome?: string | null;
  ponto_b_nome?: string | null;
  carta_nome?: string | null;
  identificador?: string | null;
  eixokey?: string | null;
};

export type ReaRouteFeature = {
  type: "Feature";
  id?: string | number;
  properties: ReaRouteProps;
  geometry: {
    type: string;
    coordinates?: unknown;
  } | null;
};

export type ReaRouteCollection = {
  type: "FeatureCollection";
  features: ReaRouteFeature[];
};

const GEOAISWEB_WFS = "https://geoaisweb.decea.mil.br/geoserver/ows";
const DEV_PROXY_BASE = "/geoaisweb-proxy/geoserver/ows";
const APP_WFS_PROXY = "/api/geoaisweb/wfs";
const REA_IDB_NAME = "gfv-rea-routes";
const REA_IDB_STORE = "collections";
const REA_IDB_VERSION = 1;
const FULL_REFRESH_TTL_MS = 24 * 60 * 60 * 1000;
const BBOX_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const LAYER_BY_KIND: Record<ReaRouteKind, { wfs: string; fallback: string }> = {
  rea: { wfs: "ICA:CV_REA_BR_COMPLETO", fallback: "/geo/cv-rea-br.json" },
  reh: { wfs: "ICA:CV_REH_BR_COMPLETO", fallback: "/geo/cv-reh-br.json" },
};

const cache: Partial<Record<ReaRouteKind, ReaRouteCollection>> = {};
const inflight: Partial<Record<ReaRouteKind, Promise<ReaRouteCollection>>> = {};
const cacheLoadedAt: Partial<Record<ReaRouteKind, number>> = {};
const bboxInflight = new Map<string, Promise<ReaRouteFeature[]>>();
let idbPromise: Promise<IDBDatabase | null> | null = null;

function asCollection(data: unknown): ReaRouteCollection {
  const raw = data as ReaRouteCollection;
  const features = Array.isArray(raw?.features) ? raw.features : [];
  return { type: "FeatureCollection", features };
}

async function fetchFallback(path: string): Promise<ReaRouteCollection> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Fallback REA falhou (${response.status})`);
  return asCollection(await response.json());
}

function openReaIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve) => {
    const request = indexedDB.open(REA_IDB_NAME, REA_IDB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(REA_IDB_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return idbPromise;
}

async function readStoredCollection(key: string, ttlMs: number): Promise<ReaRouteCollection | null> {
  const db = await openReaIdb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(REA_IDB_STORE, "readonly");
    const request = tx.objectStore(REA_IDB_STORE).get(key);
    request.onsuccess = () => {
      const row = request.result as { savedAt?: number; collection?: unknown } | undefined;
      if (!row?.savedAt || Date.now() - row.savedAt > ttlMs) {
        resolve(null);
        return;
      }
      const collection = asCollection(row.collection);
      resolve(collection.features.length ? collection : null);
    };
    request.onerror = () => resolve(null);
  });
}

async function writeStoredCollection(key: string, collection: ReaRouteCollection): Promise<void> {
  const db = await openReaIdb();
  if (!db || collection.features.length === 0) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(REA_IDB_STORE, "readwrite");
    tx.objectStore(REA_IDB_STORE).put({ key, savedAt: Date.now(), collection });
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

function fullCacheKey(kind: ReaRouteKind): string {
  return `${kind}:full`;
}

function bboxCacheKey(kind: ReaRouteKind, bbox: {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}): string {
  return `${kind}:bbox:${[
    bbox.minLng.toFixed(3),
    bbox.minLat.toFixed(3),
    bbox.maxLng.toFixed(3),
    bbox.maxLat.toFixed(3),
  ].join(",")}`;
}

function featureIdentity(feature: ReaRouteFeature): string {
  return String(feature.id ?? JSON.stringify(feature.properties));
}

function mergeIntoMemoryCache(kind: ReaRouteKind, features: ReaRouteFeature[]): ReaRouteCollection {
  const existing = cache[kind];
  if (!existing) {
    const collection = { type: "FeatureCollection" as const, features };
    cache[kind] = collection;
    cacheLoadedAt[kind] = Date.now();
    return collection;
  }
  const byId = new Map<string, ReaRouteFeature>();
  for (const f of existing.features) byId.set(featureIdentity(f), f);
  for (const f of features) byId.set(featureIdentity(f), f);
  const collection = { type: "FeatureCollection" as const, features: [...byId.values()] };
  cache[kind] = collection;
  cacheLoadedAt[kind] = Date.now();
  return collection;
}

async function fetchWfs(kind: ReaRouteKind, baseUrl: string, typeName: string, bbox?: {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}): Promise<ReaRouteCollection> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 12000);
  try {
    const params =
      baseUrl === APP_WFS_PROXY
        ? new URLSearchParams({ kind })
        : new URLSearchParams({
            service: "WFS",
            version: "1.0.0",
            request: "GetFeature",
            typeName,
            outputFormat: "application/json",
          });
    if (bbox) {
      params.set("bbox", `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`);
      params.set("maxFeatures", "500");
    }
    const response = await fetch(`${baseUrl}?${params.toString()}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`WFS ${typeName} falhou (${response.status})`);
    return asCollection(await response.json());
  } finally {
    window.clearTimeout(timer);
  }
}

function wfsBases(options?: { bbox?: boolean }): string[] {
  if (options?.bbox && !import.meta.env.DEV) return [APP_WFS_PROXY, GEOAISWEB_WFS];
  return import.meta.env.DEV ? [DEV_PROXY_BASE, GEOAISWEB_WFS] : [GEOAISWEB_WFS];
}

/** Carrega REA/REH. Prefere snapshot local; tenta WFS em background e notifica via onUpdate. */
export async function loadReaRoutes(
  kind: ReaRouteKind,
  options?: { onUpdate?: (collection: ReaRouteCollection) => void },
): Promise<ReaRouteCollection> {
  const hit = cache[kind];
  if (hit) {
    // Ainda tenta refrescar em background (snapshot local pode estar incompleto — ex.: TMA BH).
    if (Date.now() - (cacheLoadedAt[kind] ?? 0) > FULL_REFRESH_TTL_MS) {
      void refreshReaRoutesFromWfs(kind, options?.onUpdate);
    }
    return hit;
  }
  const pending = inflight[kind];
  if (pending) return pending;

  const spec = LAYER_BY_KIND[kind];
  const promise = (async () => {
    const persisted = await readStoredCollection(fullCacheKey(kind), FULL_REFRESH_TTL_MS);
    if (persisted?.features.length) {
      cache[kind] = persisted;
      cacheLoadedAt[kind] = Date.now();
      return persisted;
    }

    try {
      const fallback = await fetchFallback(spec.fallback);
      if (fallback.features.length > 0) {
        cache[kind] = fallback;
        cacheLoadedAt[kind] = Date.now();
        void writeStoredCollection(fullCacheKey(kind), fallback);
        void refreshReaRoutesFromWfs(kind, options?.onUpdate);
        return fallback;
      }
    } catch {
      // continue to live
    }

    for (const base of wfsBases()) {
      try {
        const collection = await fetchWfs(kind, base, spec.wfs);
        if (collection.features.length > 0) {
          cache[kind] = collection;
          cacheLoadedAt[kind] = Date.now();
          void writeStoredCollection(fullCacheKey(kind), collection);
          return collection;
        }
      } catch {
        // try next
      }
    }
    throw new Error(`Não foi possível carregar ${kind.toUpperCase()}.`);
  })();

  inflight[kind] = promise;
  try {
    return await promise;
  } finally {
    delete inflight[kind];
  }
}

async function refreshReaRoutesFromWfs(
  kind: ReaRouteKind,
  onUpdate?: (collection: ReaRouteCollection) => void,
): Promise<void> {
  const spec = LAYER_BY_KIND[kind];
  for (const base of wfsBases()) {
    try {
      const live = await fetchWfs(kind, base, spec.wfs);
      if (live.features.length === 0) continue;
      const prev = cache[kind]?.features.length ?? 0;
      cache[kind] = live;
      cacheLoadedAt[kind] = Date.now();
      void writeStoredCollection(fullCacheKey(kind), live);
      if (live.features.length !== prev) onUpdate?.(live);
      return;
    } catch {
      // try next
    }
  }
}

/** Busca REA/REH só na viewport (completa gaps do snapshot local, ex. TMA BH). */
export async function loadReaRoutesInBbox(
  kind: ReaRouteKind,
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number },
): Promise<ReaRouteFeature[]> {
  const key = bboxCacheKey(kind, bbox);
  const pending = bboxInflight.get(key);
  if (pending) return pending;

  const stored = await readStoredCollection(key, BBOX_CACHE_TTL_MS);
  if (stored?.features.length) {
    mergeIntoMemoryCache(kind, stored.features);
    return stored.features;
  }

  const spec = LAYER_BY_KIND[kind];
  const request = (async () => {
    for (const base of wfsBases({ bbox: true })) {
      try {
        const collection = await fetchWfs(kind, base, spec.wfs, bbox);
        if (collection.features.length > 0) {
          mergeIntoMemoryCache(kind, collection.features);
          void writeStoredCollection(key, collection);
          return collection.features;
        }
      } catch {
        // try next
      }
    }
    return [];
  })();

  bboxInflight.set(key, request);
  try {
    return await request;
  } finally {
    bboxInflight.delete(key);
  }
}

export function getCachedReaRoutes(kind: ReaRouteKind): ReaRouteCollection | null {
  return cache[kind] ?? null;
}

export function numOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function endpointA(props: ReaRouteProps): {
  lat: number | null;
  lon: number | null;
  name: string;
} {
  return {
    lat: numOrNull(props.fixo_a_lat ?? props.ponto_a_lat),
    lon: numOrNull(props.fixo_a_lon ?? props.ponto_a_lon),
    name: String(props.fixo_a_nome ?? props.ponto_a_nome ?? "").trim(),
  };
}

export function endpointB(props: ReaRouteProps): {
  lat: number | null;
  lon: number | null;
  name: string;
} {
  return {
    lat: numOrNull(props.fixo_b_lat ?? props.ponto_b_lat),
    lon: numOrNull(props.fixo_b_lon ?? props.ponto_b_lon),
    name: String(props.fixo_b_nome ?? props.ponto_b_nome ?? "").trim(),
  };
}

/** Altitudes do trecho no formato da carta (máx / mín). */
export function resolveReaAltitudes(props: ReaRouteProps): { max: number | null; min: number | null } {
  const max =
    numOrNull(props.altmax) ??
    numOrNull(props.altmaxa_to_b) ??
    numOrNull(props.altmaxb_to_a) ??
    numOrNull(props.altcompa_to_b) ??
    numOrNull(props.altcomp);
  const min =
    numOrNull(props.altmin) ??
    numOrNull(props.altmina_to_b) ??
    numOrNull(props.altminb_to_a) ??
    numOrNull(props.altcompb_to_a) ??
    (numOrNull(props.altcomp) != null && numOrNull(props.altmax) == null ? numOrNull(props.altcomp) : null);
  return { max, min };
}

export function formatReaHeading(deg: number | null | undefined): string | null {
  const n = numOrNull(deg);
  if (n == null) return null;
  return `${String(Math.round(((n % 360) + 360) % 360)).padStart(3, "0")}°`;
}

export function corridorDisplayName(nome: string | null | undefined): string {
  return String(nome || "").trim().toUpperCase();
}

export function pointKey(lat: number, lon: number, name: string): string {
  return `${name.trim().toUpperCase()}|${lat.toFixed(4)}|${lon.toFixed(4)}`;
}

export type ReaFixPoint = { lat: number; lon: number; name: string };

/** Pontos nomeados únicos dos eixos REA/REH (para alinhar rota FPL truncada). */
export function collectReaFixPoints(features: ReaRouteFeature[]): ReaFixPoint[] {
  const seen = new Set<string>();
  const out: ReaFixPoint[] = [];
  for (const feature of features) {
    const props = feature.properties || {};
    for (const end of [endpointA(props), endpointB(props)]) {
      if (end.lat == null || end.lon == null || !end.name) continue;
      const key = pointKey(end.lat, end.lon, end.name);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ lat: end.lat, lon: end.lon, name: end.name });
    }
  }
  return out;
}
