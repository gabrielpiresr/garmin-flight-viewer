/**
 * Consultas à coleção "runways" no Appwrite.
 * Os dados vêm do CSV runways_brasil_com_cabeceiras.csv importado via
 * scripts/import-runways.mjs.
 */

import { Query } from "appwrite";
import { RUNWAYS_COL_ID, databases, isAppwriteConfigured } from "./appwrite";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

export type RunwayEnd = {
  ident: string;          // ex: "10L", "28R", "09"
  lat: number | null;
  lon: number | null;
  headingTrue: number | null;
  elevationFt: number | null;
};

export type RunwayRecord = {
  $id: string;
  airportIdent: string;
  le: RunwayEnd;
  he: RunwayEnd;
  lengthFt: number | null;
  surface: string | null;
  closed: boolean;
};

function isReady(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && RUNWAYS_COL_ID);
}

function toRunwayRecord(doc: Record<string, unknown>): RunwayRecord {
  const n = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    return null;
  };
  const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

  return {
    $id: s(doc.$id),
    airportIdent: s(doc.airport_ident).toUpperCase(),
    le: {
      ident: s(doc.le_ident),
      lat: n(doc.le_lat),
      lon: n(doc.le_lon),
      headingTrue: n(doc.le_heading_true),
      elevationFt: n(doc.le_elevation_ft),
    },
    he: {
      ident: s(doc.he_ident),
      lat: n(doc.he_lat),
      lon: n(doc.he_lon),
      headingTrue: n(doc.he_heading_true),
      elevationFt: n(doc.he_elevation_ft),
    },
    lengthFt: n(doc.length_ft),
    surface: typeof doc.surface === "string" ? doc.surface.trim() : null,
    closed: Boolean(doc.closed),
  };
}

/**
 * Busca todas as pistas de um aeródromo pelo código ICAO.
 * Retorna lista vazia se o aeródromo não constar na base.
 */
export async function findRunwaysByAirport(icao: string): Promise<RunwayRecord[]> {
  if (!isReady() || !databases || !DB_ID || !RUNWAYS_COL_ID) return [];
  const code = icao.trim().toUpperCase();
  if (!code) return [];
  try {
    const res = await databases.listDocuments(DB_ID, RUNWAYS_COL_ID, [
      Query.equal("airport_ident", code),
      Query.limit(20),
    ]);
    return res.documents.map(doc => toRunwayRecord(doc as unknown as Record<string, unknown>));
  } catch {
    return [];
  }
}
