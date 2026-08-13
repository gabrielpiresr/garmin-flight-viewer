import type { FlightPlanAirspaceFrequency } from "../types/flightPlanning";
import raw from "../data/tmaComFrequencies.json";

type TmaComEntry = {
  name: string;
  label: string;
  primary: string[];
  alternate: string[];
  emergency: string[];
};

type TmaComCatalog = {
  source: string;
  updatedAt: string;
  byIdent: Record<string, TmaComEntry>;
};

const catalog = raw as TmaComCatalog;

/** TMA designator from WFS ident (SBWI, SBWH_02 → SBWH). */
export function tmaDesignatorFromIdent(ident: string): string | null {
  const rawIdent = String(ident || "").trim().toUpperCase();
  const m = rawIdent.match(/^(SB[WX][A-Z])(?:_|$)/);
  if (m) return m[1]!;
  if (/^SB[WX][A-Z]$/.test(rawIdent)) return rawIdent;
  return null;
}

export function lookupTmaComFrequencies(ident: string): FlightPlanAirspaceFrequency[] {
  const designator = tmaDesignatorFromIdent(ident);
  if (!designator) return [];
  const entry = catalog.byIdent[designator];
  if (!entry) return [];

  const out: FlightPlanAirspaceFrequency[] = [];
  for (const mhz of entry.primary || []) {
    out.push({ service: entry.label || "CONTROLE", mhz });
  }
  for (const mhz of entry.alternate || []) {
    out.push({ service: `${entry.label || "CONTROLE"} ALTN`, mhz });
  }
  for (const mhz of entry.emergency || []) {
    out.push({ service: "EMERG", mhz });
  }
  return out;
}
