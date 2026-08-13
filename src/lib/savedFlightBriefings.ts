import type { AiswebAirportBundle } from "../types/aisweb";
import type { FlightBriefingAiReport } from "../types/flightBriefingAi";
import type { FlightPlanInfoSection } from "../types/flightPlanning";

const DB_NAME = "gfv_saved_flight_briefings";
const DB_VERSION = 1;
const STORE_NAME = "briefings";
const INDEX_KEY = "gfv_saved_flight_briefings_index_v1";
const MAX_BRIEFINGS = 40;

export type SavedFlightBriefingAirport = {
  role: "origem" | "destino" | "alternativo";
  icao: string;
  bundle: AiswebAirportBundle;
  note?: string;
};

export type SavedFlightBriefing = {
  id: string;
  name: string;
  /** Saved route id this briefing is linked to (null = unlinked / draft). */
  routeId: string | null;
  origin: string;
  destination: string;
  alternates: string[];
  sections: FlightPlanInfoSection[];
  airports: SavedFlightBriefingAirport[];
  aiReport: FlightBriefingAiReport | null;
  aiReportId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SavedFlightBriefingIndexItem = {
  id: string;
  name: string;
  routeId: string | null;
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
    request.onerror = () => reject(request.error ?? new Error("Falha ao abrir IndexedDB de briefings."));
  });
}

async function storeRequest<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const request = run(tx.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha no armazenamento de briefings."));
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("Falha na transação de briefings."));
    };
  });
}

function readIndex(): SavedFlightBriefingIndexItem[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedFlightBriefingIndexItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeIndex(items: SavedFlightBriefingIndexItem[]) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(items.slice(0, MAX_BRIEFINGS)));
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `brf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function slimBundle(bundle: AiswebAirportBundle): AiswebAirportBundle {
  return {
    ...bundle,
    charts: (bundle.charts || []).map((c) => ({ ...c })),
  };
}

function toIndexItem(briefing: SavedFlightBriefing): SavedFlightBriefingIndexItem {
  return {
    id: briefing.id,
    name: briefing.name,
    routeId: briefing.routeId,
    origin: briefing.origin,
    destination: briefing.destination,
    createdAt: briefing.createdAt,
    updatedAt: briefing.updatedAt,
  };
}

export function suggestBriefingName(origin: string, destination: string): string {
  const dep = (origin || "").trim().toUpperCase() || "DEP";
  const arr = (destination || "").trim().toUpperCase() || "ARR";
  return `Briefing ${dep} – ${arr}`;
}

export function listSavedFlightBriefingIndex(): SavedFlightBriefingIndexItem[] {
  return readIndex().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function listBriefingsForRoute(routeId: string | null | undefined): SavedFlightBriefingIndexItem[] {
  const id = String(routeId || "").trim();
  if (!id) return [];
  return listSavedFlightBriefingIndex().filter((item) => item.routeId === id);
}

export async function getSavedFlightBriefing(id: string): Promise<SavedFlightBriefing | null> {
  if (!id) return null;
  return (await storeRequest("readonly", (store) => store.get(id))) ?? null;
}

export async function saveFlightBriefing(
  input: Omit<SavedFlightBriefing, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
    createdAt?: string;
  },
): Promise<SavedFlightBriefing> {
  const now = new Date().toISOString();
  const id = input.id || newId();
  const existing = input.id ? await getSavedFlightBriefing(input.id) : null;
  const briefing: SavedFlightBriefing = {
    id,
    name: (input.name || "").trim() || suggestBriefingName(input.origin, input.destination),
    routeId: input.routeId ? String(input.routeId) : null,
    origin: input.origin,
    destination: input.destination,
    alternates: [...(input.alternates || [])],
    sections: [...(input.sections || [])],
    airports: (input.airports || []).map((a) => ({
      ...a,
      bundle: slimBundle(a.bundle),
    })),
    aiReport: input.aiReport ?? null,
    aiReportId: input.aiReportId ?? null,
    createdAt: existing?.createdAt || input.createdAt || now,
    updatedAt: now,
  };

  await storeRequest("readwrite", (store) => store.put(briefing));

  const index = readIndex().filter((item) => item.id !== id);
  index.unshift(toIndexItem(briefing));
  writeIndex(index);

  return briefing;
}

export async function deleteSavedFlightBriefing(id: string): Promise<void> {
  if (!id) return;
  try {
    await storeRequest("readwrite", (store) => store.delete(id));
  } catch {
    /* ignore */
  }
  writeIndex(readIndex().filter((item) => item.id !== id));
}
