import cvReaWhBh from "../../public/geo/cv-rea-wh-bh.json";
import cvReaWtCt from "../../public/geo/cv-rea-wt-ct.json";

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
  return `${kind}:full:v2`;
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

function mergeFeatureLists(base: ReaRouteFeature[], extra: ReaRouteFeature[]): ReaRouteFeature[] {
  if (!extra.length) return base;
  const byId = new Map<string, ReaRouteFeature>();
  for (const f of base) byId.set(featureIdentity(f), f);
  for (const f of extra) byId.set(featureIdentity(f), f);
  return [...byId.values()];
}

function localComplements(kind: ReaRouteKind): ReaRouteFeature[] {
  if (kind !== "rea") return [];
  return [...asCollection(cvReaWhBh).features, ...asCollection(cvReaWtCt).features];
}

function withLocalComplements(kind: ReaRouteKind, collection: ReaRouteCollection): ReaRouteCollection {
  const extra = localComplements(kind);
  if (!extra.length) return collection;
  return { type: "FeatureCollection", features: mergeFeatureLists(collection.features, extra) };
}

function featureIntersectsBbox(
  feature: ReaRouteFeature,
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number },
): boolean {
  const props = feature.properties || {};
  const ends = [endpointA(props), endpointB(props)];
  for (const end of ends) {
    if (end.lat == null || end.lon == null) continue;
    if (end.lon >= bbox.minLng && end.lon <= bbox.maxLng && end.lat >= bbox.minLat && end.lat <= bbox.maxLat) {
      return true;
    }
  }
  return false;
}

function rememberCollection(
  kind: ReaRouteKind,
  collection: ReaRouteCollection,
  persistFull = false,
): ReaRouteCollection {
  const merged = withLocalComplements(kind, collection);
  cache[kind] = merged;
  cacheLoadedAt[kind] = Date.now();
  if (persistFull) void writeStoredCollection(fullCacheKey(kind), merged);
  return merged;
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
    const merged = withLocalComplements(kind, hit);
    if (merged.features.length !== hit.features.length) cache[kind] = merged;
    if (Date.now() - (cacheLoadedAt[kind] ?? 0) > FULL_REFRESH_TTL_MS) {
      void refreshReaRoutesFromWfs(kind, options?.onUpdate);
    }
    return merged;
  }
  const pending = inflight[kind];
  if (pending) return pending;

  const spec = LAYER_BY_KIND[kind];
  const promise = (async () => {
    const persisted = await readStoredCollection(fullCacheKey(kind), FULL_REFRESH_TTL_MS);
    if (persisted?.features.length) {
      return rememberCollection(kind, persisted);
    }

    try {
      const fallback = await fetchFallback(spec.fallback);
      if (fallback.features.length > 0) {
        const merged = rememberCollection(kind, fallback, true);
        void refreshReaRoutesFromWfs(kind, options?.onUpdate);
        return merged;
      }
    } catch {
      // continue to live
    }

    for (const base of wfsBases()) {
      try {
        const collection = await fetchWfs(kind, base, spec.wfs);
        if (collection.features.length > 0) {
          return rememberCollection(kind, collection, true);
        }
      } catch {
        // try next
      }
    }

    const localOnly = localComplements(kind);
    if (localOnly.length) {
      return rememberCollection(kind, { type: "FeatureCollection", features: [] });
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
      const merged = rememberCollection(kind, live, true);
      if (merged.features.length !== prev) onUpdate?.(merged);
      return;
    } catch {
      // try next
    }
  }
}

/** Busca REA/REH na viewport. Completa o WFS com os complementos locais (TMA BH e Curitiba). */
export async function loadReaRoutesInBbox(
  kind: ReaRouteKind,
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number },
): Promise<ReaRouteFeature[]> {
  const key = bboxCacheKey(kind, bbox);
  const pending = bboxInflight.get(key);
  if (pending) return pending;

  const request = (async () => {
    const localHits = localComplements(kind).filter((feature) => featureIntersectsBbox(feature, bbox));
    const stored = await readStoredCollection(key, BBOX_CACHE_TTL_MS);
    if (stored?.features.length) {
      const merged = mergeFeatureLists(stored.features, localHits);
      mergeIntoMemoryCache(kind, merged);
      return merged;
    }

    const spec = LAYER_BY_KIND[kind];
    for (const base of wfsBases({ bbox: true })) {
      try {
        const collection = await fetchWfs(kind, base, spec.wfs, bbox);
        if (collection.features.length > 0) {
          const merged = mergeFeatureLists(collection.features, localHits);
          mergeIntoMemoryCache(kind, merged);
          void writeStoredCollection(key, { type: "FeatureCollection", features: merged });
          return merged;
        }
      } catch {
        // try next
      }
    }
    if (localHits.length) {
      mergeIntoMemoryCache(kind, localHits);
      return localHits;
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
  const hit = cache[kind];
  if (!hit) return null;
  const merged = withLocalComplements(kind, hit);
  if (merged.features.length !== hit.features.length) cache[kind] = merged;
  return merged;
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

/** Teto/piso no sentido do voo (A→B ou B→A). */
export function resolveReaAltitudesDirected(
  props: ReaRouteProps,
  dir: "ab" | "ba",
): { max: number | null; min: number | null } {
  if (dir === "ab") {
    const max =
      numOrNull(props.altmaxa_to_b) ??
      numOrNull(props.altcompa_to_b) ??
      numOrNull(props.altmax) ??
      numOrNull(props.altcomp);
    const min =
      numOrNull(props.altmina_to_b) ??
      numOrNull(props.altmin) ??
      (numOrNull(props.altcomp) != null && numOrNull(props.altmax) == null ? numOrNull(props.altcomp) : null);
    return { max, min };
  }
  const max =
    numOrNull(props.altmaxb_to_a) ??
    numOrNull(props.altcompb_to_a) ??
    numOrNull(props.altmax) ??
    numOrNull(props.altcomp);
  const min =
    numOrNull(props.altminb_to_a) ??
    numOrNull(props.altmin) ??
    (numOrNull(props.altcomp) != null && numOrNull(props.altmax) == null ? numOrNull(props.altcomp) : null);
  return { max, min };
}

/** Sentido publicado na carta. Sem rumo = trecho bidirecional. */
export function reaCorridorDirections(props: ReaRouteProps): { ab: boolean; ba: boolean } {
  const ab = numOrNull(props.rumoa_to_b);
  const ba = numOrNull(props.rumob_to_a);
  if (ab == null && ba == null) return { ab: true, ba: true };
  return { ab: ab != null, ba: ba != null };
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
