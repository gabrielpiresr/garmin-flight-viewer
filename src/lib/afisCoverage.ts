import {
  loadAirspaceFeaturesInBbox,
  type AirspaceFeature,
} from "./airspaceLayersDb";

type LatLng = { lat: number; lng: number };
type Ring = Array<[number, number]>;
type Bbox = { minLng: number; minLat: number; maxLng: number; maxLat: number };

/** Camadas que já cobrem o AD — nesse caso não plotamos círculo AFIS 27 NM. */
const SUPPRESS_TYPES = ["FIZ", "CTR", "TMA"] as const;

const coverageByIcao = new Map<string, { covered: boolean; updatedAt: number }>();
const TTL_MS = 6 * 60 * 60 * 1000;

function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0];
    const yi = ring[i]![1];
    const xj = ring[j]![0];
    const yj = ring[j]![1];
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lng: number, lat: number, rings: Ring[]): boolean {
  if (!rings.length) return false;
  if (!pointInRing(lng, lat, rings[0]!)) return false;
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(lng, lat, rings[i]!)) return false;
  }
  return true;
}

export function geometryContainsLatLng(
  geometry: AirspaceFeature["geometry"] | null | undefined,
  lat: number,
  lng: number,
): boolean {
  if (!geometry) return false;
  if (geometry.type === "Polygon") {
    return pointInPolygon(lng, lat, geometry.coordinates as Ring[]);
  }
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates as Ring[][]).some((poly) => pointInPolygon(lng, lat, poly));
  }
  return false;
}

/** Carrega FIZ + CTR + TMA no bbox (uma vez por viewport / rota). */
export async function loadAfisSuppressingAirspaces(bbox: Bbox): Promise<AirspaceFeature[]> {
  const parts = await Promise.all(
    SUPPRESS_TYPES.map((type) => loadAirspaceFeaturesInBbox(type, bbox)),
  );
  return parts.flat();
}

export function isPointInsideFizCtrTma(
  lat: number,
  lng: number,
  features: AirspaceFeature[],
): boolean {
  for (const f of features) {
    if (geometryContainsLatLng(f.geometry, lat, lng)) return true;
  }
  return false;
}

export function getCachedAfisCoverage(icao: string): boolean | null {
  const code = icao.trim().toUpperCase();
  const hit = coverageByIcao.get(code);
  if (!hit) return null;
  if (Date.now() - hit.updatedAt > TTL_MS) return null;
  return hit.covered;
}

export function setCachedAfisCoverage(icao: string, covered: boolean): void {
  const code = icao.trim().toUpperCase();
  if (!code) return;
  coverageByIcao.set(code, { covered, updatedAt: Date.now() });
}

/**
 * Marca cobertura FIZ/CTR/TMA para uma lista de ADs usando features já carregadas.
 * Retorna o Set de ICAOs cobertos (não devem plotar AFIS).
 */
export function markAfisCoverageFromFeatures(
  ads: Array<{ icao: string; lat: number; lng: number }>,
  features: AirspaceFeature[],
): Set<string> {
  const covered = new Set<string>();
  for (const ad of ads) {
    const icao = ad.icao.trim().toUpperCase();
    if (!icao) continue;
    const inside = isPointInsideFizCtrTma(ad.lat, ad.lng, features);
    setCachedAfisCoverage(icao, inside);
    if (inside) covered.add(icao);
  }
  return covered;
}

/** Bbox mínimo em torno de pontos (para checagem na rota). */
export function pointsBbox(points: LatLng[], padDeg = 0.05): Bbox | null {
  if (!points.length) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  return {
    minLng: minLng - padDeg,
    minLat: minLat - padDeg,
    maxLng: maxLng + padDeg,
    maxLat: maxLat + padDeg,
  };
}
