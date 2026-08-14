import {
  corridorDisplayName,
  endpointA,
  endpointB,
  numOrNull,
  resolveReaAltitudes,
  type ReaRouteFeature,
} from "./reaRoutesDb";
import { asGeoPoly, destinationPoint, type GeoPoly } from "./geoClip";

export type LegCorridorInfo = {
  name: string;
  altMax: number | null;
  altMin: number | null;
  geometry?: ReaRouteFeature["geometry"];
  endpointA?: { lat: number; lng: number } | null;
  endpointB?: { lat: number; lng: number } | null;
  halfWidthM?: number | null;
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

/** Quantos pontos amostrados ao longo do trecho caem dentro do polígono. */
function samplesInsideCount(
  feature: ReaRouteFeature,
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  // Evita extremos: um waypoint no endpoint do corredor não deve “puxar” o trecho de saída.
  const ts = [0.2, 0.35, 0.5, 0.65, 0.8];
  let inside = 0;
  for (const t of ts) {
    const lat = from.lat + (to.lat - from.lat) * t;
    const lng = from.lng + (to.lng - from.lng) * t;
    if (geometryContains(feature, lat, lng)) inside += 1;
  }
  return inside;
}

/**
 * Identifica o corredor REA/REH do trecho.
 *
 * Só considera corredor se:
 * - os dois extremos batem com os endpoints do corredor, OU
 * - a maior parte do trecho (amostras) está dentro da geometria.
 *
 * Um único extremo com o nome do corredor (ex.: sair em B rumo a C) NÃO basta —
 * isso evitava falso positivo na tabela/perfil após deixar o corredor.
 */
export function matchReaCorridorForLeg(
  from: { lat: number; lng: number; label?: string; reaName?: string },
  to: { lat: number; lng: number; label?: string; reaName?: string },
  features: ReaRouteFeature[],
): LegCorridorInfo | null {
  if (!features.length) return null;
  const fromNames = new Set([normName(from.reaName), normName(from.label)].filter(Boolean));
  const toNames = new Set([normName(to.reaName), normName(to.label)].filter(Boolean));

  let best: { score: number; info: LegCorridorInfo } | null = null;

  for (const feature of features) {
    const props = feature.properties || {};
    const name = corridorDisplayName(props.nome);
    if (!name) continue;
    const a = endpointA(props);
    const b = endpointB(props);
    const aName = normName(a.name);
    const bName = normName(b.name);

    const bothEnds =
      Boolean(aName && bName) &&
      ((fromNames.has(aName) && toNames.has(bName)) || (fromNames.has(bName) && toNames.has(aName)));
    const insideCount = samplesInsideCount(feature, from, to);
    // Maioria das amostras (≥3/5) dentro do polígono.
    const mostlyInside = insideCount >= 3;

    if (!bothEnds && !mostlyInside) continue;

    let score = 0;
    if (bothEnds) score += 100;
    score += insideCount * 10;
    if (fromNames.has(normName(name)) || toNames.has(normName(name))) score += 5;

    const { max, min } = resolveReaAltitudes(props);
    const aPt =
      a.lat != null && a.lon != null ? { lat: a.lat, lng: a.lon } : null;
    const bPt =
      b.lat != null && b.lon != null ? { lat: b.lat, lng: b.lon } : null;
    const info: LegCorridorInfo = {
      name,
      altMax: max,
      altMin: min,
      geometry: feature.geometry,
      endpointA: aPt,
      endpointB: bPt,
      halfWidthM: Math.max(600, numOrNull(props.semi_largura) ?? 1400),
    };
    if (!best || score > best.score) best = { score, info };
  }
  return best?.info ?? null;
}

export function reaFeatureToCorridor(feature: ReaRouteFeature): LegCorridorInfo | null {
  const props = feature.properties || {};
  const a = endpointA(props);
  const b = endpointB(props);
  const aPt = a.lat != null && a.lon != null ? { lat: a.lat, lng: a.lon } : null;
  const bPt = b.lat != null && b.lon != null ? { lat: b.lat, lng: b.lon } : null;
  if (!aPt && !bPt && !feature.geometry) return null;
  const name =
    corridorDisplayName(props.nome) ||
    corridorDisplayName(props.identificador) ||
    [a.name, b.name].filter(Boolean).join(" – ") ||
    "REA";
  const { max, min } = resolveReaAltitudes(props);
  return {
    name,
    altMax: max,
    altMin: min,
    geometry: feature.geometry,
    endpointA: aPt,
    endpointB: bPt,
    halfWidthM: Math.max(600, numOrNull(props.semi_largura) ?? 1400),
  };
}

function corridorVolumeKey(corridor: LegCorridorInfo): string {
  const a = corridor.endpointA;
  const b = corridor.endpointB;
  if (a && b) {
    return `${corridor.name}|${a.lat.toFixed(5)},${a.lng.toFixed(5)}|${b.lat.toFixed(5)},${b.lng.toFixed(5)}`;
  }
  return `${corridor.name}|${JSON.stringify(corridor.geometry ?? null).slice(0, 180)}`;
}

export function uniqueCorridorVolumes(corridors: Array<LegCorridorInfo | null | undefined>): LegCorridorInfo[] {
  const map = new Map<string, LegCorridorInfo>();
  for (const corridor of corridors) {
    if (!corridor?.name) continue;
    if (!corridor.geometry && !(corridor.endpointA && corridor.endpointB)) continue;
    const key = corridorVolumeKey(corridor);
    if (!map.has(key)) map.set(key, corridor);
  }
  return [...map.values()];
}

function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const dλ = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Retângulo de largura constante (igual ao mapa 2D) — mais estável que o polígono WFS. */
export function corridorPrismGeometry(corridor: LegCorridorInfo): GeoPoly | null {
  const a = corridor.endpointA;
  const b = corridor.endpointB;
  if (a && b) {
    const hw = Math.max(200, corridor.halfWidthM ?? 1400);
    const brg = bearingDeg(a.lat, a.lng, b.lat, b.lng);
    const aL = destinationPoint(a.lat, a.lng, brg - 90, hw);
    const aR = destinationPoint(a.lat, a.lng, brg + 90, hw);
    const bL = destinationPoint(b.lat, b.lng, brg - 90, hw);
    const bR = destinationPoint(b.lat, b.lng, brg + 90, hw);
    return {
      type: "Polygon",
      coordinates: [
        [
          [aL.lng, aL.lat],
          [bL.lng, bL.lat],
          [bR.lng, bR.lat],
          [aR.lng, aR.lat],
          [aL.lng, aL.lat],
        ],
      ],
    };
  }
  return asGeoPoly(corridor.geometry, { maxRingPts: 400 });
}
