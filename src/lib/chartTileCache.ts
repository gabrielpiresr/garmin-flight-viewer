/**
 * Persistent chart-tile cache for WAC/REA/REH.
 * Memory LRU + IndexedDB so pan A→B→A reuses tiles even without the app Service Worker (DEV).
 */

const IDB_NAME = "gfv-chart-tiles";
const IDB_VERSION = 1;
const STORE = "tiles";
const MEMORY_MAX = 180;
const IDB_MAX_PER_SET = 2500;

type LayerSet = "wac" | "rea" | "reh" | "xyz";

type TileRecord = {
  key: string;
  layerSet: LayerSet;
  blob: Blob;
  savedAt: number;
};

const memory = new Map<string, Blob>();
const memoryOrder: string[] = [];
let dbPromise: Promise<IDBDatabase> | null = null;

function touchMemory(key: string, blob: Blob): void {
  if (memory.has(key)) {
    const idx = memoryOrder.indexOf(key);
    if (idx >= 0) memoryOrder.splice(idx, 1);
  }
  memory.set(key, blob);
  memoryOrder.push(key);
  while (memoryOrder.length > MEMORY_MAX) {
    const oldest = memoryOrder.shift();
    if (oldest) memory.delete(oldest);
  }
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("indexedDB unavailable"));
  }
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "key" });
        store.createIndex("layerSet", "layerSet", { unique: false });
        store.createIndex("savedAt", "savedAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IDB open failed"));
  });
  return dbPromise;
}

function detectLayerSet(url: string): LayerSet {
  try {
    const u = new URL(url, typeof location !== "undefined" ? location.origin : "http://local");
    if (u.pathname.startsWith("/charts/")) return "xyz";
    const set = (u.searchParams.get("layerSet") || "").toLowerCase();
    if (set === "wac" || set === "rea" || set === "reh") return set;
    const layers = u.searchParams.get("layers") || "";
    if (/ICA:WAC_/.test(layers) || layers === "wac") return "wac";
    if (/CCV_REA_/.test(layers) || layers === "rea") return "rea";
    if (/CCV_REH_/.test(layers) || layers === "reh") return "reh";
  } catch {
    // ignore
  }
  return "wac";
}

/** Stable cache key: sorted query for WMS, pathname for XYZ. */
export function chartTileCacheKey(url: string): string {
  try {
    const u = new URL(url, typeof location !== "undefined" ? location.origin : "http://local");
    if (u.pathname.startsWith("/charts/")) {
      return `${u.pathname}${u.search}`;
    }
    const sorted = new URLSearchParams([...u.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b)));
    return `${u.pathname}?${sorted.toString()}`;
  } catch {
    return url;
  }
}

async function idbGet(key: string): Promise<Blob | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => {
        const row = req.result as TileRecord | undefined;
        resolve(row?.blob || null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function trimIdb(layerSet: LayerSet): Promise<void> {
  try {
    const db = await openDb();
    const keys: { key: string; savedAt: number }[] = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const idx = tx.objectStore(STORE).index("layerSet");
      const req = idx.getAll(layerSet);
      req.onsuccess = () => {
        const rows = (req.result as TileRecord[]).map((r) => ({ key: r.key, savedAt: r.savedAt }));
        resolve(rows);
      };
      req.onerror = () => reject(req.error);
    });
    if (keys.length <= IDB_MAX_PER_SET) return;
    keys.sort((a, b) => a.savedAt - b.savedAt);
    const drop = keys.slice(0, keys.length - IDB_MAX_PER_SET);
    const db2 = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db2.transaction(STORE, "readwrite");
      for (const row of drop) tx.objectStore(STORE).delete(row.key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // best-effort
  }
}

async function idbPut(record: TileRecord): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    void trimIdb(record.layerSet);
  } catch {
    // best-effort
  }
}

export async function getCachedChartTile(url: string): Promise<Blob | null> {
  const key = chartTileCacheKey(url);
  const mem = memory.get(key);
  if (mem) {
    touchMemory(key, mem);
    return mem;
  }
  const blob = await idbGet(key);
  if (blob) touchMemory(key, blob);
  return blob;
}

export async function putCachedChartTile(url: string, blob: Blob): Promise<void> {
  const key = chartTileCacheKey(url);
  touchMemory(key, blob);
  await idbPut({
    key,
    layerSet: detectLayerSet(url),
    blob,
    savedAt: Date.now(),
  });
}

/**
 * Fetch a chart tile with memory/IDB cache-first.
 * Returns an object URL that the caller must revoke when done (or leave for GC via img).
 */
export async function loadChartTileObjectUrl(url: string): Promise<string> {
  const cached = await getCachedChartTile(url);
  if (cached) return URL.createObjectURL(cached);

  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`tile ${response.status}`);
  const blob = await response.blob();
  void putCachedChartTile(url, blob);
  return URL.createObjectURL(blob);
}
