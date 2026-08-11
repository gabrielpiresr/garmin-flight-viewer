import type { AiswebAirportBundle } from "../types/aisweb";
import type {
  FlightPlanAirspaceHit,
  FlightPlanInfoSection,
  FlightPlanRouteSummary,
  FlightPlanRouteTableRow,
} from "../types/flightPlanning";

const DB_NAME = "gfv_offline_briefing";
const DB_VERSION = 1;
const STORE_NAME = "briefings";
const INDEX_KEY = "gfv_offline_briefing_index";

export type OfflineFlightBriefingAirport = {
  role: "origem" | "destino" | "alternativo";
  icao: string;
  bundle: AiswebAirportBundle;
  /** Manual note shown on summary / PDF / offline page. */
  note?: string;
};

export type OfflineFlightBriefing = {
  id: string;
  createdAt: string;
  updatedAt: string;
  origin: string;
  destination: string;
  alternates: string[];
  sections: FlightPlanInfoSection[];
  airports: OfflineFlightBriefingAirport[];
  routeSummary: FlightPlanRouteSummary | null;
  airspaces: FlightPlanAirspaceHit[];
  cruiseSpeedKt: number | null;
  fuelBurnPerHour: number | null;
  fuelUnit: string;
  routeText: string;
  mapImageDataUrl: string | null;
  verticalProfileSvg?: string | null;
  routeTableRows?: FlightPlanRouteTableRow[] | null;
  metUpdatedAt: string | null;
};

type BriefingIndexItem = {
  id: string;
  origin: string;
  destination: string;
  createdAt: string;
  updatedAt: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha ao abrir IndexedDB."));
  });
}

async function storeRequest<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const request = run(tx.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha no armazenamento offline."));
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("Falha na transação offline."));
    };
  });
}

function readIndex(): BriefingIndexItem[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BriefingIndexItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeIndex(items: BriefingIndexItem[]) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(items.slice(0, 20)));
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `brf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Strip heavy chart payloads; keep list metadata for offline reading. */
function slimBundle(bundle: AiswebAirportBundle): AiswebAirportBundle {
  return {
    ...bundle,
    charts: (bundle.charts || []).map((c) => ({
      ...c,
      // keep link for online open; no binary cache here
    })),
  };
}

export function offlineBriefingPath(id: string): string {
  return `/offline/briefing/${encodeURIComponent(id)}`;
}

export async function saveOfflineFlightBriefing(
  input: Omit<OfflineFlightBriefing, "id" | "createdAt" | "updatedAt" | "metUpdatedAt"> & {
    id?: string;
  },
): Promise<OfflineFlightBriefing> {
  const now = new Date().toISOString();
  const id = input.id || newId();
  const briefing: OfflineFlightBriefing = {
    ...input,
    id,
    createdAt: now,
    updatedAt: now,
    metUpdatedAt: now,
    airports: input.airports.map((a) => ({
      ...a,
      bundle: slimBundle(a.bundle),
    })),
  };

  await storeRequest("readwrite", (store) => store.put(briefing));

  const index = readIndex().filter((item) => item.id !== id);
  index.unshift({
    id,
    origin: briefing.origin,
    destination: briefing.destination,
    createdAt: briefing.createdAt,
    updatedAt: briefing.updatedAt,
  });
  writeIndex(index);

  return briefing;
}

export async function getOfflineFlightBriefing(id: string): Promise<OfflineFlightBriefing | null> {
  if (!id) return null;
  return (await storeRequest("readonly", (store) => store.get(id))) ?? null;
}

export async function updateOfflineBriefingMets(
  id: string,
  metsByIcao: Record<string, AiswebAirportBundle["met"]>,
): Promise<OfflineFlightBriefing | null> {
  const current = await getOfflineFlightBriefing(id);
  if (!current) return null;
  const now = new Date().toISOString();
  const next: OfflineFlightBriefing = {
    ...current,
    updatedAt: now,
    metUpdatedAt: now,
    airports: current.airports.map((airport) => {
      const met = metsByIcao[airport.icao];
      if (!met) return airport;
      return {
        ...airport,
        bundle: { ...airport.bundle, met },
      };
    }),
  };
  await storeRequest("readwrite", (store) => store.put(next));
  const index = readIndex().map((item) =>
    item.id === id ? { ...item, updatedAt: now } : item,
  );
  writeIndex(index);
  return next;
}

export function listOfflineBriefingIndex(): BriefingIndexItem[] {
  return readIndex();
}
