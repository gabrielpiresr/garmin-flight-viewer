import polygonClipping from "polygon-clipping";
import type { Polygon as PcPolygon } from "polygon-clipping";

export type LngLatPair = [number, number];
export type LngLatRing = LngLatPair[];
export type GeoPolygon = { type: "Polygon"; coordinates: LngLatRing[] };
export type GeoMultiPolygon = { type: "MultiPolygon"; coordinates: LngLatRing[][] };
export type GeoPoly = GeoPolygon | GeoMultiPolygon;

export type LngLatBbox = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

const EARTH_RADIUS_M = 6_371_008.8;
const MAX_RING_PTS = 96;

function asPair(value: unknown): LngLatPair | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lng = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return [lng, lat];
}

function closeRing(ring: LngLatRing): LngLatRing {
  if (ring.length < 3) return ring;
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, [first[0], first[1]]];
}

function simplifyRing(ring: LngLatRing, maxPts = MAX_RING_PTS): LngLatRing {
  const closed = closeRing(ring);
  if (closed.length <= maxPts) return closed;
  const lastIdx = closed.length - 1;
  const inner = lastIdx;
  const out: LngLatRing = [];
  const step = inner / (maxPts - 1);
  for (let i = 0; i < maxPts - 1; i++) {
    out.push(closed[Math.round(i * step)]!);
  }
  out.push(closed[0]!);
  return closeRing(out);
}

function cleanRing(raw: unknown, maxPts = MAX_RING_PTS): LngLatRing | null {
  if (!Array.isArray(raw)) return null;
  const ring: LngLatRing = [];
  for (const pt of raw) {
    const pair = asPair(pt);
    if (pair) ring.push(pair);
  }
  if (ring.length < 3) return null;
  return simplifyRing(ring, maxPts);
}

function polygonFromRings(raw: unknown, maxPts = MAX_RING_PTS): LngLatRing[] | null {
  if (!Array.isArray(raw) || !raw.length) return null;
  const rings: LngLatRing[] = [];
  for (const ring of raw) {
    const cleaned = cleanRing(ring, maxPts);
    if (cleaned) rings.push(cleaned);
  }
  return rings.length ? rings : null;
}

export function asGeoPoly(
  geometry: { type: string; coordinates?: unknown } | null | undefined,
  options?: { maxRingPts?: number },
): GeoPoly | null {
  if (!geometry?.coordinates) return null;
  const maxPts = options?.maxRingPts ?? MAX_RING_PTS;
  if (geometry.type === "Polygon") {
    const rings = polygonFromRings(geometry.coordinates, maxPts);
    return rings ? { type: "Polygon", coordinates: rings } : null;
  }
  if (geometry.type === "MultiPolygon") {
    if (!Array.isArray(geometry.coordinates)) return null;
    const polys: LngLatRing[][] = [];
    for (const poly of geometry.coordinates) {
      const rings = polygonFromRings(poly, maxPts);
      if (rings) polys.push(rings);
    }
    if (!polys.length) return null;
    if (polys.length === 1) return { type: "Polygon", coordinates: polys[0]! };
    return { type: "MultiPolygon", coordinates: polys };
  }
  return null;
}

function toPcGeom(poly: GeoPoly): PcPolygon | PcPolygon[] {
  return poly.type === "Polygon" ? poly.coordinates : poly.coordinates;
}

function fromPcGeom(multi: LngLatRing[][]): GeoPoly | null {
  if (!multi.length) return null;
  const polys = multi
    .map((rings) => rings.map((ring) => simplifyRing(ring)).filter((ring) => ring.length >= 4))
    .filter((rings) => rings.length > 0);
  if (!polys.length) return null;
  if (polys.length === 1) return { type: "Polygon", coordinates: polys[0]! };
  return { type: "MultiPolygon", coordinates: polys };
}

function bboxPolygon(bbox: LngLatBbox): PcPolygon {
  const { minLng, minLat, maxLng, maxLat } = bbox;
  return [
    [
      [minLng, minLat],
      [maxLng, minLat],
      [maxLng, maxLat],
      [minLng, maxLat],
      [minLng, minLat],
    ],
  ];
}

export function clipGeometryToBbox(
  geometry: { type: string; coordinates?: unknown } | null | undefined,
  bbox: LngLatBbox,
): GeoPoly | null {
  const poly = asGeoPoly(geometry);
  if (!poly) return null;
  try {
    const clipped = polygonClipping.intersection(toPcGeom(poly), bboxPolygon(bbox));
    return fromPcGeom(clipped);
  } catch {
    return poly;
  }
}

export function destinationPoint(
  lat: number,
  lng: number,
  bearingDeg: number,
  distanceM: number,
): { lat: number; lng: number } {
  const δ = distanceM / EARTH_RADIUS_M;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lng * Math.PI) / 180;
  const sinφ1 = Math.sin(φ1);
  const cosφ1 = Math.cos(φ1);
  const sinδ = Math.sin(δ);
  const cosδ = Math.cos(δ);
  const φ2 = Math.asin(sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * sinδ * cosφ1, cosδ - sinφ1 * Math.sin(φ2));
  return { lat: (φ2 * 180) / Math.PI, lng: (((λ2 * 180) / Math.PI + 540) % 360) - 180 };
}

export function circlePolygon(lat: number, lng: number, radiusM: number, steps = 48): GeoPolygon {
  const ring: LngLatRing = [];
  const n = Math.max(12, steps);
  for (let i = 0; i < n; i++) {
    const p = destinationPoint(lat, lng, (i * 360) / n, radiusM);
    ring.push([p.lng, p.lat]);
  }
  ring.push(ring[0]!);
  return { type: "Polygon", coordinates: [ring] };
}
