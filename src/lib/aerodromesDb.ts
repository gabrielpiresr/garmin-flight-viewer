import { Query } from "appwrite";
import { AERODROMES_COL_ID, databases, isAppwriteConfigured } from "./appwrite";
import {
  AVGAS_RE,
  JET_RE,
  NIGHT_NEGATIVE_RE,
  NIGHT_OPS_RE,
  PAVED_SURFACE_RE,
  UNPAVED_SURFACE_RE,
} from "./aerodromeFilterPatterns";
import { getCachedAerodromeOps } from "./aerodromeOpsEnrichment";

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
  /** Maior comprimento de pista conhecido (metros). */
  maxRunwayLengthM: number | null;
  /** Pelo menos uma pista pavimentada (asfalto/concreto/etc.). */
  pavedRunway: boolean;
  /** Operação noturna / H24 / HN no campo de operação. */
  nightOps: boolean;
  /** source_types inclui "public". */
  isPublic: boolean;
  /** AVGAS / PF detectado no cadastro local (null = desconhecido). */
  hasAvgas: boolean | null;
  /** JET / TF detectado no cadastro local (null = desconhecido). */
  hasJet: boolean | null;
};

export type AerodromeMapFilter = {
  minRunwayLengthM: number | null;
  pavedOnly: boolean;
  nightOpsOnly: boolean;
  publicOnly: boolean;
  avgasOnly: boolean;
  jetOnly: boolean;
};

export const EMPTY_AERODROME_MAP_FILTER: AerodromeMapFilter = {
  minRunwayLengthM: null,
  pavedOnly: false,
  nightOpsOnly: false,
  publicOnly: false,
  avgasOnly: false,
  jetOnly: false,
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

function parseLengthMeters(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    // Heurística: valores grandes em pés (> 8000) são raros no BR; > 50 e < 8000 → metros
    if (value > 50 && value < 8000) return Math.round(value);
    if (value >= 8000) return Math.round(value * 0.3048); // provavelmente pés
    return Math.round(value);
  }
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase().replace(",", ".");
  if (!text) return null;
  const num = Number(text.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(num) || num <= 0) return null;
  if (/\bft\b|pés|pes\b/.test(text)) return Math.round(num * 0.3048);
  return Math.round(num);
}

function collectRunwaysFromRaw(raw: unknown): Array<{ lengthM: number | null; surface: string | null }> {
  const out: Array<{ lengthM: number | null; surface: string | null }> = [];
  const visit = (node: unknown) => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    if ("length" in obj || "surface" in obj || "length_ft" in obj || "lengthM" in obj) {
      const lengthFt =
        typeof obj.length_ft === "number" && Number.isFinite(obj.length_ft) ? obj.length_ft : null;
      const lengthM =
        parseLengthMeters(obj.lengthM) ??
        parseLengthMeters(obj.length) ??
        (lengthFt != null ? Math.round(lengthFt * 0.3048) : null);
      const surface =
        typeof obj.surface === "string"
          ? obj.surface
          : typeof obj.superficie === "string"
            ? obj.superficie
            : null;
      if (lengthM != null || surface) out.push({ lengthM, surface });
    }
    for (const value of Object.values(obj)) {
      if (value && typeof value === "object") visit(value);
    }
  };
  visit(raw);
  return out;
}

function detectNightFromRaw(raw: unknown, operation: string | null): boolean {
  if (NIGHT_OPS_RE.test(operation || "")) return true;

  const nightValues: string[] = [];
  const visit = (node: unknown, keyHint = "") => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, keyHint);
      return;
    }
    if (typeof node !== "object") return;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const k = key.toLowerCase();
      const isNightKey = /noturn|night|noite/.test(k);
      if (isNightKey && (typeof value === "string" || typeof value === "number")) {
        nightValues.push(String(value).trim());
      }
      if (value && typeof value === "object") visit(value, k);
    }
  };
  visit(raw);

  for (const value of nightValues) {
    if (!value || NIGHT_NEGATIVE_RE.test(value)) continue;
    // ANAC costuma gravar "VFR", "IFR", "VFR/IFR" na coluna noturna
    if (NIGHT_OPS_RE.test(value) || /^(vfr|ifr|vfr\s*\/\s*ifr|h24|hn|s|sim|yes)$/i.test(value)) {
      return true;
    }
  }

  // Cadastro público: "VFR Diurno/Noturno" etc.
  if (/\bdiurno\s*\/\s*noturn/i.test(operation || "")) return true;
  return false;
}

function detectFuelFlags(rawText: string): { hasAvgas: boolean | null; hasJet: boolean | null } {
  if (!rawText.trim()) return { hasAvgas: null, hasJet: null };
  const hasAvgas = AVGAS_RE.test(rawText) ? true : null;
  const hasJet = JET_RE.test(rawText) ? true : null;
  if (hasAvgas == null && hasJet == null && /\bsem\s+combust/i.test(rawText)) {
    return { hasAvgas: false, hasJet: false };
  }
  return { hasAvgas, hasJet };
}

function toAerodrome(doc: Record<string, unknown>): Aerodrome {
  const latitudeText = (doc.latitude_text as string | null | undefined) ?? null;
  const longitudeText = (doc.longitude_text as string | null | undefined) ?? null;
  const sourceTypes = parseSourceTypes(doc.source_types);
  const operation = (doc.operation as string | null | undefined) ?? null;
  const rawJson = typeof doc.source_raw_json === "string" ? doc.source_raw_json : "";
  let raw: unknown = null;
  if (rawJson) {
    try {
      raw = JSON.parse(rawJson);
    } catch {
      raw = null;
    }
  }
  const runways = collectRunwaysFromRaw(raw);
  let maxRunwayLengthM: number | null = null;
  let pavedRunway = false;
  for (const rwy of runways) {
    if (rwy.lengthM != null && (maxRunwayLengthM == null || rwy.lengthM > maxRunwayLengthM)) {
      maxRunwayLengthM = rwy.lengthM;
    }
    const surface = rwy.surface || "";
    if (PAVED_SURFACE_RE.test(surface)) pavedRunway = true;
    else if (!UNPAVED_SURFACE_RE.test(surface) && /asp|conc|pav/i.test(surface)) pavedRunway = true;
  }
  const fuel = detectFuelFlags(`${rawJson}\n${operation || ""}`);
  const icao = ((doc.icao as string | null | undefined) ?? "").trim().toUpperCase();
  const enriched = icao ? getCachedAerodromeOps(icao) : null;
  return {
    id: doc.$id as string,
    sourceTypes,
    icao,
    ciad: ((doc.ciad as string | null | undefined) ?? "").trim().toUpperCase(),
    name: ((doc.name as string | null | undefined) ?? "").trim(),
    municipality: ((doc.municipality as string | null | undefined) ?? "").trim(),
    uf: ((doc.uf as string | null | undefined) ?? "").trim().toUpperCase(),
    latitudeText,
    longitudeText,
    latitudeGeoPoint: toNumber(doc.latitude_geopoint) ?? coordinateTextToDecimal(latitudeText),
    longitudeGeoPoint: toNumber(doc.longitude_geopoint) ?? coordinateTextToDecimal(longitudeText),
    altitudeText: (doc.altitude_text as string | null | undefined) ?? null,
    operation,
    maxRunwayLengthM,
    pavedRunway,
    nightOps: enriched?.nightOps ?? detectNightFromRaw(raw, operation),
    isPublic: sourceTypes.includes("public"),
    hasAvgas: enriched ? enriched.hasAvgas : fuel.hasAvgas,
    hasJet: enriched ? enriched.hasJet : fuel.hasJet,
  };
}

/** Filtra aeródromos para o mapa (campos opcionais; desconhecidos falham no critério ativo). */
export function filterAerodromesForMap(aerodromes: Aerodrome[], filter: AerodromeMapFilter): Aerodrome[] {
  const minLen = filter.minRunwayLengthM != null && filter.minRunwayLengthM > 0 ? filter.minRunwayLengthM : null;
  if (
    minLen == null &&
    !filter.pavedOnly &&
    !filter.nightOpsOnly &&
    !filter.publicOnly &&
    !filter.avgasOnly &&
    !filter.jetOnly
  ) {
    return aerodromes;
  }
  return aerodromes.filter((ad) => {
    const enriched = ad.icao ? getCachedAerodromeOps(ad.icao) : null;
    const nightOps = enriched?.nightOps ?? ad.nightOps;
    const hasAvgas = enriched ? enriched.hasAvgas : ad.hasAvgas;
    const hasJet = enriched ? enriched.hasJet : ad.hasJet;
    if (minLen != null) {
      if (ad.maxRunwayLengthM == null || ad.maxRunwayLengthM < minLen) return false;
    }
    if (filter.pavedOnly && !ad.pavedRunway) return false;
    if (filter.nightOpsOnly && !nightOps) return false;
    if (filter.publicOnly && !ad.isPublic) return false;
    if (filter.avgasOnly && hasAvgas !== true) return false;
    if (filter.jetOnly && hasJet !== true) return false;
    return true;
  });
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

export { parseFieldElevationFt } from "./fieldElevation";

export function buildAerodromeOptions(aerodromes: Aerodrome[]): AerodromeOption[] {
  return aerodromes
    .filter((aerodrome) => aerodrome.icao)
    .map((aerodrome) => ({ ...aerodrome, label: optionLabel(aerodrome) }))
    .sort((a, b) => a.icao.localeCompare(b.icao) || a.name.localeCompare(b.name));
}
