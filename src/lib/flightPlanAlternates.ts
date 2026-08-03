import type { Aerodrome } from "./aerodromesDb";
import { listAerodromes } from "./aerodromesDb";
import { haversineM } from "./flightPlanningRoute";

export type AlternateSuggestion = {
  icao: string;
  name: string;
  municipality: string;
  uf: string;
  distanceNm: number;
  near: "destino" | "origem" | "rota";
};

let aerodromeCache: Aerodrome[] | null = null;
let aerodromeCacheAt = 0;
const CACHE_TTL_MS = 10 * 60 * 1000;

async function loadAerodromesCached(): Promise<Aerodrome[]> {
  if (aerodromeCache && Date.now() - aerodromeCacheAt < CACHE_TTL_MS) return aerodromeCache;
  const rows = await listAerodromes();
  aerodromeCache = rows.filter(
    (a) =>
      a.icao &&
      a.latitudeGeoPoint != null &&
      a.longitudeGeoPoint != null &&
      Number.isFinite(a.latitudeGeoPoint) &&
      Number.isFinite(a.longitudeGeoPoint),
  );
  aerodromeCacheAt = Date.now();
  return aerodromeCache;
}

/** Suggest alternates near destination (primary) and origin, excluding already selected. */
export async function suggestAlternateAerodromes(options: {
  origin?: { lat: number; lng: number; icao?: string } | null;
  destination?: { lat: number; lng: number; icao?: string } | null;
  excludeIcaos?: string[];
  limit?: number;
  maxNm?: number;
}): Promise<AlternateSuggestion[]> {
  const limit = options.limit ?? 6;
  const maxNm = options.maxNm ?? 80;
  const exclude = new Set((options.excludeIcaos || []).map((c) => c.toUpperCase()));
  if (options.origin?.icao) exclude.add(options.origin.icao.toUpperCase());
  if (options.destination?.icao) exclude.add(options.destination.icao.toUpperCase());

  const anchors: Array<{ near: AlternateSuggestion["near"]; point: { lat: number; lng: number } }> = [];
  if (options.destination) anchors.push({ near: "destino", point: options.destination });
  if (options.origin) anchors.push({ near: "origem", point: options.origin });
  if (!anchors.length) return [];

  try {
    const rows = await loadAerodromesCached();
    const scored: AlternateSuggestion[] = [];
    for (const ad of rows) {
      const icao = ad.icao.toUpperCase();
      if (exclude.has(icao) || icao.length !== 4) continue;
      let best: AlternateSuggestion | null = null;
      for (const anchor of anchors) {
        const nm =
          haversineM(
            { lat: ad.latitudeGeoPoint!, lng: ad.longitudeGeoPoint! },
            anchor.point,
          ) / 1852;
        if (nm > maxNm) continue;
        if (!best || nm < best.distanceNm) {
          best = {
            icao,
            name: ad.name,
            municipality: ad.municipality,
            uf: ad.uf,
            distanceNm: nm,
            near: anchor.near,
          };
        }
      }
      if (best) scored.push(best);
    }
    scored.sort((a, b) => {
      const preferDest = Number(a.near !== "destino") - Number(b.near !== "destino");
      if (preferDest !== 0) return preferDest;
      return a.distanceNm - b.distanceNm;
    });
    const seen = new Set<string>();
    const out: AlternateSuggestion[] = [];
    for (const item of scored) {
      if (seen.has(item.icao)) continue;
      seen.add(item.icao);
      out.push(item);
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}
