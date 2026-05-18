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
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function coordinateTextToDecimal(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const text = value.trim().toUpperCase();
  if (!text) return null;
  const decimal = Number(text.replace(",", ".").replace(/[^\d.-]/g, ""));
  if (Number.isFinite(decimal) && Math.abs(decimal) <= 180) return decimal;

  const numbers = text.match(/\d+(?:[,.]\d+)?/g)?.map((part) => Number(part.replace(",", "."))) ?? [];
  if (numbers.length === 0) return null;
  const degrees = numbers[0] ?? 0;
  const minutes = numbers[1] ?? 0;
  const seconds = numbers[2] ?? 0;
  const direction = text.match(/[NSEW]/)?.[0] ?? "";
  const sign = direction === "S" || direction === "W" || text.startsWith("-") ? -1 : 1;
  const parsed = sign * (degrees + minutes / 60 + seconds / 3600);
  return Number.isFinite(parsed) && Math.abs(parsed) <= 180 ? parsed : null;
}

function toAerodrome(doc: Record<string, unknown>): Aerodrome {
  const latitudeText = (doc.latitude_text as string | null | undefined) ?? null;
  const longitudeText = (doc.longitude_text as string | null | undefined) ?? null;
  return {
    id: doc.$id as string,
    sourceTypes: parseSourceTypes(doc.source_types),
    icao: ((doc.icao as string | null | undefined) ?? "").trim().toUpperCase(),
    ciad: ((doc.ciad as string | null | undefined) ?? "").trim().toUpperCase(),
    name: ((doc.name as string | null | undefined) ?? "").trim(),
    municipality: ((doc.municipality as string | null | undefined) ?? "").trim(),
    uf: ((doc.uf as string | null | undefined) ?? "").trim().toUpperCase(),
    latitudeText,
    longitudeText,
    latitudeGeoPoint: toNumber(doc.latitude_geopoint) ?? coordinateTextToDecimal(latitudeText),
    longitudeGeoPoint: toNumber(doc.longitude_geopoint) ?? coordinateTextToDecimal(longitudeText),
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

export async function listAerodromesByCodes(codes: string[]): Promise<Aerodrome[]> {
  if (!isReady() || !databases || !DB_ID || !AERODROMES_COL_ID) return [];
  const db = databases;
  const wantedCodes = Array.from(new Set(codes.map((code) => code.trim().toUpperCase()).filter(Boolean)));
  if (wantedCodes.length === 0) return [];

  const byId = new Map<string, Aerodrome>();
  await Promise.all(
    wantedCodes.flatMap((code) => [
      db.listDocuments(DB_ID, AERODROMES_COL_ID, [Query.equal("icao", code), Query.limit(10)]),
      db.listDocuments(DB_ID, AERODROMES_COL_ID, [Query.equal("ciad", code), Query.limit(10)]),
    ]),
  ).then((responses) => {
    responses.forEach((res) => {
      res.documents.forEach((doc) => {
        const aerodrome = toAerodrome(doc as unknown as Record<string, unknown>);
        byId.set(aerodrome.id, aerodrome);
      });
    });
  });

  return Array.from(byId.values()).sort((a, b) => a.icao.localeCompare(b.icao) || a.ciad.localeCompare(b.ciad) || a.name.localeCompare(b.name));
}

export function buildAerodromeOptions(aerodromes: Aerodrome[]): AerodromeOption[] {
  return aerodromes
    .filter((aerodrome) => aerodrome.icao)
    .map((aerodrome) => ({ ...aerodrome, label: optionLabel(aerodrome) }))
    .sort((a, b) => a.icao.localeCompare(b.icao) || a.name.localeCompare(b.name));
}
