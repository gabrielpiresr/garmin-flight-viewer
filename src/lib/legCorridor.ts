import {
  corridorDisplayName,
  endpointA,
  endpointB,
  resolveReaAltitudes,
  type ReaRouteFeature,
} from "./reaRoutesDb";
import { haversineM } from "./flightPlanningRoute";

export type LegCorridorInfo = {
  name: string;
  altMax: number | null;
  altMin: number | null;
};

function pointInRing(lat: number, lng: number, ring: number[][]): boolean {
  // ray casting; ring as [lon, lat][]
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]!;
    const yi = ring[i]![1]!;
    const xj = ring[j]![0]!;
    const yj = ring[j]![1]!;
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-15) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function geometryContains(feature: ReaRouteFeature, lat: number, lng: number): boolean {
  const g = feature.geometry;
  if (!g?.coordinates) return false;
  if (g.type === "Polygon") {
    const ring = (g.coordinates as number[][][])[0];
    return ring ? pointInRing(lat, lng, ring) : false;
  }
  if (g.type === "MultiPolygon") {
    for (const poly of g.coordinates as number[][][][]) {
      const ring = poly[0];
      if (ring && pointInRing(lat, lng, ring)) return true;
    }
  }
  return false;
}

function normName(value: string | null | undefined): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

/**
 * Identifica o corredor REA/REH do trecho (por nomes dos extremos ou geometria no meio).
 */
export function matchReaCorridorForLeg(
  from: { lat: number; lng: number; label?: string; reaName?: string },
  to: { lat: number; lng: number; label?: string; reaName?: string },
  features: ReaRouteFeature[],
): LegCorridorInfo | null {
  if (!features.length) return null;
  const fromNames = new Set([normName(from.reaName), normName(from.label)].filter(Boolean));
  const toNames = new Set([normName(to.reaName), normName(to.label)].filter(Boolean));
  const mid = { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2 };

  let best: { score: number; info: LegCorridorInfo } | null = null;

  for (const feature of features) {
    const props = feature.properties || {};
    const name = corridorDisplayName(props.nome);
    if (!name) continue;
    const a = endpointA(props);
    const b = endpointB(props);
    const aName = normName(a.name);
    const bName = normName(b.name);
    let score = 0;

    if (aName && bName) {
      const ab =
        (fromNames.has(aName) && toNames.has(bName)) || (fromNames.has(bName) && toNames.has(aName));
      if (ab) score += 100;
      else if (fromNames.has(aName) || fromNames.has(bName) || toNames.has(aName) || toNames.has(bName)) {
        score += 40;
      }
    }
    if (fromNames.has(normName(name)) || toNames.has(normName(name))) score += 30;
    if (geometryContains(feature, mid.lat, mid.lng)) score += 50;
    else if (a.lat != null && a.lon != null && b.lat != null && b.lon != null) {
      // Proximidade do eixo (médio) — 1.5 NM
      const dA = haversineM(mid, { lat: a.lat, lng: a.lon });
      const dB = haversineM(mid, { lat: b.lat, lng: b.lon });
      const axis = haversineM({ lat: a.lat, lng: a.lon }, { lat: b.lat, lng: b.lon });
      if (axis > 0 && dA + dB < axis + 1852 * 1.5) score += 25;
    }

    if (score < 40) continue;
    const { max, min } = resolveReaAltitudes(props);
    const info: LegCorridorInfo = { name, altMax: max, altMin: min };
    if (!best || score > best.score) best = { score, info };
  }

  return best?.info ?? null;
}
