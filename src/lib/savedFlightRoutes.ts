import { Query } from "appwrite";
import {
  account,
  databases,
  ID,
  isAppwriteConfigured,
  Permission,
  Role,
} from "./appwrite";
import type { FlightPlanWaypoint } from "../types/flightPlanning";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;
const COL_ID =
  (import.meta.env.VITE_APPWRITE_SAVED_FLIGHT_ROUTES_COL_ID as string | undefined) ??
  "saved_flight_routes";

const LOCAL_STORAGE_KEY = "gfv_saved_flight_routes_v1";
const MIGRATED_FLAG_KEY = "gfv_saved_flight_routes_migrated_v1";
const MAX_ROUTES = 40;

export type SavedRouteArea = {
  id: string;
  name: string;
  sourceText: string;
  points: Array<{ lat: number; lng: number }>;
};

export type SavedFlightRoute = {
  id: string;
  name: string;
  waypoints: FlightPlanWaypoint[];
  /** ICAOs de aeródromos alternativos do briefing. */
  alternates: string[];
  customAreas: SavedRouteArea[];
  cruiseSpeedKt: number | null;
  fuelBurnPerHour: number | null;
  fuelUnit: string;
  createdAt: string;
  updatedAt: string;
};

function isConfigured(): boolean {
  return Boolean(isAppwriteConfigured && databases && account && DB_ID && COL_ID);
}

async function requireUserId(): Promise<string> {
  if (!account) throw new Error("Appwrite não configurado.");
  const me = await account.get();
  return me.$id;
}

function ownerPermissions(userId: string): string[] {
  return [
    Permission.read(Role.user(userId)),
    Permission.update(Role.user(userId)),
    Permission.delete(Role.user(userId)),
  ];
}

function normalizeAlternates(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const icao = String(item || "")
      .trim()
      .toUpperCase();
    if (icao.length === 4 && !out.includes(icao)) out.push(icao);
  }
  return out;
}

function normalizeCustomAreas(raw: unknown): SavedRouteArea[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedRouteArea[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<SavedRouteArea>;
    const points = Array.isArray(row.points)
      ? row.points.filter(
          (p): p is { lat: number; lng: number } =>
            p != null &&
            typeof p === "object" &&
            Number.isFinite(Number((p as { lat?: unknown }).lat)) &&
            Number.isFinite(Number((p as { lng?: unknown }).lng)),
        ).map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }))
      : [];
    if (points.length < 3) continue;
    out.push({
      id: String(row.id || `area_${out.length + 1}`),
      name: String(row.name || "Área").trim() || "Área",
      sourceText: String(row.sourceText || ""),
      points,
    });
  }
  return out;
}

/** Aceita array legado de waypoints ou `{ waypoints, alternates, customAreas }`. */
function parseRoutePayload(raw: unknown): {
  waypoints: FlightPlanWaypoint[];
  alternates: string[];
  customAreas: SavedRouteArea[];
} {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return { waypoints: [], alternates: [], customAreas: [] };
    }
  }
  if (Array.isArray(parsed)) {
    return { waypoints: parsed as FlightPlanWaypoint[], alternates: [], customAreas: [] };
  }
  if (parsed && typeof parsed === "object") {
    const obj = parsed as { waypoints?: unknown; alternates?: unknown; customAreas?: unknown; areas?: unknown };
    return {
      waypoints: Array.isArray(obj.waypoints) ? (obj.waypoints as FlightPlanWaypoint[]) : [],
      alternates: normalizeAlternates(obj.alternates),
      customAreas: normalizeCustomAreas(obj.customAreas ?? obj.areas),
    };
  }
  return { waypoints: [], alternates: [], customAreas: [] };
}

function encodeRoutePayload(
  waypoints: FlightPlanWaypoint[],
  alternates: string[] | undefined,
  customAreas?: SavedRouteArea[],
): string {
  return JSON.stringify({
    waypoints: waypoints.map((w) => ({ ...w })),
    alternates: normalizeAlternates(alternates),
    customAreas: normalizeCustomAreas(customAreas),
  });
}

function docToRoute(doc: Record<string, unknown>): SavedFlightRoute {
  const payload = parseRoutePayload(doc.waypoints_json);
  return {
    id: String(doc.$id || ""),
    name: String(doc.name || "Rota sem nome"),
    waypoints: payload.waypoints,
    alternates: payload.alternates,
    customAreas: payload.customAreas,
    cruiseSpeedKt:
      doc.cruise_speed_kt != null && Number.isFinite(Number(doc.cruise_speed_kt))
        ? Number(doc.cruise_speed_kt)
        : null,
    fuelBurnPerHour:
      doc.fuel_burn_per_hour != null && Number.isFinite(Number(doc.fuel_burn_per_hour))
        ? Number(doc.fuel_burn_per_hour)
        : null,
    fuelUnit: String(doc.fuel_unit || "L"),
    createdAt: String(doc.created_at || doc.$createdAt || ""),
    updatedAt: String(doc.updated_at || doc.$updatedAt || ""),
  };
}

function readLocalRoutes(): SavedFlightRoute[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is SavedFlightRoute =>
          item != null &&
          typeof item === "object" &&
          typeof (item as SavedFlightRoute).id === "string" &&
          typeof (item as SavedFlightRoute).name === "string" &&
          Array.isArray((item as SavedFlightRoute).waypoints),
      )
      .map((item) => ({
        ...item,
        alternates: normalizeAlternates((item as SavedFlightRoute).alternates),
        customAreas: normalizeCustomAreas((item as SavedFlightRoute).customAreas),
      }));
  } catch {
    return [];
  }
}

function clearLocalRoutes() {
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    localStorage.setItem(MIGRATED_FLAG_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function suggestRouteName(waypoints: FlightPlanWaypoint[]): string {
  if (waypoints.length === 0) return "Nova rota";
  const first = waypoints[0]?.label?.trim() || "DEP";
  const last = waypoints[waypoints.length - 1]?.label?.trim() || "ARR";
  if (waypoints.length === 1) return first;
  return `${first} – ${last}`;
}

export async function listSavedFlightRoutes(): Promise<SavedFlightRoute[]> {
  if (!isConfigured() || !databases || !DB_ID || !COL_ID) return [];
  const userId = await requireUserId();
  const res = await databases.listDocuments(DB_ID, COL_ID, [
    Query.equal("user_id", userId),
    Query.orderDesc("updated_at"),
    Query.limit(MAX_ROUTES),
  ]);
  return (res.documents as unknown as Record<string, unknown>[]).map(docToRoute);
}

export async function getSavedFlightRoute(id: string): Promise<SavedFlightRoute | null> {
  if (!isConfigured() || !databases || !DB_ID || !COL_ID || !id) return null;
  try {
    const doc = (await databases.getDocument(DB_ID, COL_ID, id)) as unknown as Record<string, unknown>;
    const userId = await requireUserId();
    if (String(doc.user_id || "") !== userId) return null;
    return docToRoute(doc);
  } catch {
    return null;
  }
}

export async function saveFlightRoute(input: {
  id?: string;
  name: string;
  waypoints: FlightPlanWaypoint[];
  alternates?: string[];
  customAreas?: SavedRouteArea[];
  cruiseSpeedKt?: number | null;
  fuelBurnPerHour?: number | null;
  fuelUnit?: string;
}): Promise<SavedFlightRoute> {
  if (!isConfigured() || !databases || !DB_ID || !COL_ID) {
    throw new Error("Persistência de rotas não configurada (Appwrite).");
  }
  const userId = await requireUserId();
  const now = new Date().toISOString();
  const name = input.name.trim() || "Rota sem nome";
  const payload = {
    user_id: userId,
    name,
    waypoints_json: encodeRoutePayload(input.waypoints, input.alternates, input.customAreas),
    cruise_speed_kt: input.cruiseSpeedKt ?? null,
    fuel_burn_per_hour: input.fuelBurnPerHour ?? null,
    fuel_unit: input.fuelUnit || "L",
    updated_at: now,
  };
  const perms = ownerPermissions(userId);
  const existingId = input.id?.trim();

  if (existingId) {
    try {
      const existing = (await databases.getDocument(
        DB_ID,
        COL_ID,
        existingId,
      )) as unknown as Record<string, unknown>;
      if (String(existing.user_id || "") === userId) {
        const doc = (await databases.updateDocument(DB_ID, COL_ID, existingId, payload)) as unknown as Record<
          string,
          unknown
        >;
        return docToRoute(doc);
      }
    } catch {
      /* create below */
    }
  }

  const doc = (await databases.createDocument(
    DB_ID,
    COL_ID,
    existingId || ID.unique(),
    { ...payload, created_at: now },
    perms,
  )) as unknown as Record<string, unknown>;
  return docToRoute(doc);
}

export async function deleteSavedFlightRoute(id: string): Promise<void> {
  if (!isConfigured() || !databases || !DB_ID || !COL_ID || !id) return;
  const userId = await requireUserId();
  try {
    const existing = (await databases.getDocument(DB_ID, COL_ID, id)) as unknown as Record<string, unknown>;
    if (String(existing.user_id || "") !== userId) return;
    await databases.deleteDocument(DB_ID, COL_ID, id);
  } catch {
    /* ignore missing */
  }
}

/** One-shot: copy localStorage routes into the user account, then clear local. */
export async function migrateLocalSavedFlightRoutesIfNeeded(): Promise<number> {
  if (!isConfigured()) return 0;
  try {
    if (localStorage.getItem(MIGRATED_FLAG_KEY) === "1") return 0;
  } catch {
    return 0;
  }
  const local = readLocalRoutes();
  if (!local.length) {
    clearLocalRoutes();
    return 0;
  }
  let migrated = 0;
  for (const route of local.slice(0, MAX_ROUTES)) {
    try {
      await saveFlightRoute({
        name: route.name,
        waypoints: route.waypoints,
        alternates: route.alternates,
        customAreas: route.customAreas,
        cruiseSpeedKt: route.cruiseSpeedKt,
        fuelBurnPerHour: route.fuelBurnPerHour,
        fuelUnit: route.fuelUnit,
      });
      migrated += 1;
    } catch {
      /* keep going */
    }
  }
  clearLocalRoutes();
  return migrated;
}
