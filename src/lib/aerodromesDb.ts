import { Query } from "appwrite";
import { AERODROMES_COL_ID, databases, isAppwriteConfigured } from "./appwrite";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

export type Aerodrome = {
  id: string;
  sourceTypes: string[];
  icao: string;
  ciad: string;
  name: string;
  municipality: string;
  uf: string;
  latitudeText: string | null;
  longitudeText: string | null;
  latitudeGeoPoint: number | null;
  longitudeGeoPoint: number | null;
  altitudeText: string | null;
  operation: string | null;
};

export type AerodromeOption = Aerodrome & {
  label: string;
};

function isReady(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && AERODROMES_COL_ID);
}

function parseSourceTypes(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
}

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toAerodrome(doc: Record<string, unknown>): Aerodrome {
  return {
    id: doc.$id as string,
    sourceTypes: parseSourceTypes(doc.source_types),
    icao: ((doc.icao as string | null | undefined) ?? "").trim().toUpperCase(),
    ciad: ((doc.ciad as string | null | undefined) ?? "").trim().toUpperCase(),
    name: ((doc.name as string | null | undefined) ?? "").trim(),
    municipality: ((doc.municipality as string | null | undefined) ?? "").trim(),
    uf: ((doc.uf as string | null | undefined) ?? "").trim().toUpperCase(),
    latitudeText: (doc.latitude_text as string | null | undefined) ?? null,
    longitudeText: (doc.longitude_text as string | null | undefined) ?? null,
    latitudeGeoPoint: toNumber(doc.latitude_geopoint),
    longitudeGeoPoint: toNumber(doc.longitude_geopoint),
    altitudeText: (doc.altitude_text as string | null | undefined) ?? null,
    operation: (doc.operation as string | null | undefined) ?? null,
  };
}

function optionLabel(aerodrome: Aerodrome): string {
  const place = [aerodrome.municipality, aerodrome.uf].filter(Boolean).join("/");
  return [
    aerodrome.icao,
    aerodrome.name,
    place ? `(${place})` : "",
  ].filter(Boolean).join(" ");
}

export async function listAerodromes(): Promise<Aerodrome[]> {
  if (!isReady() || !databases || !DB_ID || !AERODROMES_COL_ID) return [];
  const rows: Aerodrome[] = [];
  let cursor: string | undefined;
  do {
    const queries = [Query.orderAsc("icao"), Query.limit(100)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(DB_ID, AERODROMES_COL_ID, queries);
    rows.push(...res.documents.map((doc) => toAerodrome(doc as unknown as Record<string, unknown>)));
    cursor = res.documents.length === 100 ? res.documents[res.documents.length - 1]?.$id : undefined;
  } while (cursor);
  return rows.sort((a, b) => a.icao.localeCompare(b.icao) || a.name.localeCompare(b.name));
}

export function buildAerodromeOptions(aerodromes: Aerodrome[]): AerodromeOption[] {
  return aerodromes
    .filter((aerodrome) => aerodrome.icao)
    .map((aerodrome) => ({ ...aerodrome, label: optionLabel(aerodrome) }))
    .sort((a, b) => a.icao.localeCompare(b.icao) || a.name.localeCompare(b.name));
}
