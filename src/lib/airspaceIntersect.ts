import { lookupAiswebIcao, queryAirspaceAlongRoute } from "./aiswebDb";
import { pickAirspaceFrequencies } from "./flightPlanFormat";
import type { FlightPlanAirspaceHit } from "../types/flightPlanning";
import { haversineM, routeBoundingBox } from "./flightPlanningRoute";

type LatLng = { lat: number; lng: number };

type Ring = Array<[number, number]>; // [lng, lat]

type GeoJsonGeometry =
  | { type: "Polygon"; coordinates: Ring[] }
  | { type: "MultiPolygon"; coordinates: Ring[][] }
  | { type: string; coordinates?: unknown };

type GeoJsonFeature = {
  type: "Feature";
  id?: string | number;
  properties?: Record<string, unknown> | null;
  geometry: GeoJsonGeometry | null;
};

type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

const GEOAISWEB_WFS = "https://geoaisweb.decea.mil.br/geoserver/ows";
const DEV_PROXY_BASE = "/geoaisweb-proxy/geoserver/ows";
const NM_IN_M = 1852;

const AIRSPACE_LAYERS: Array<{ type: FlightPlanAirspaceHit["type"]; layer: string }> = [
  { type: "CTA", layer: "ICA:CTA" },
  { type: "TMA", layer: "ICA:TMA" },
  { type: "CTR", layer: "ICA:CTR" },
  { type: "ATZ", layer: "ICA:ATZ" },
];

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

function geometryContainsPoint(geometry: GeoJsonGeometry | null, lng: number, lat: number): boolean {
  if (!geometry) return false;
  if (geometry.type === "Polygon") return pointInPolygon(lng, lat, geometry.coordinates as Ring[]);
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates as Ring[][]).some((poly) => pointInPolygon(lng, lat, poly));
  }
  return false;
}

function routeIntersectsGeometry(points: LatLng[], geometry: GeoJsonGeometry | null): boolean {
  if (!geometry || points.length === 0) return false;
  for (const p of points) {
    if (geometryContainsPoint(geometry, p.lng, p.lat)) return true;
  }
  return false;
}

function densifyRoute(points: LatLng[], maxStepM = 4000): LatLng[] {
  if (points.length < 2) return points;
  const out: LatLng[] = [points[0]!];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const dist = haversineM(a, b);
    const steps = Math.max(1, Math.ceil(dist / maxStepM));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      out.push({
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
      });
    }
  }
  return out;
}

function cumulativeDistanceNm(points: LatLng[]): number[] {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1]! + haversineM(points[i - 1]!, points[i]!) / NM_IN_M);
  }
  return cum;
}

function firstEntryDistanceNm(
  points: LatLng[],
  cumNm: number[],
  geometry: GeoJsonGeometry | null,
): number | null {
  if (!geometry) return null;
  for (let i = 0; i < points.length; i++) {
    if (geometryContainsPoint(geometry, points[i]!.lng, points[i]!.lat)) {
      return cumNm[i] ?? null;
    }
  }
  return null;
}

function formatLimit(value: unknown, unit: unknown): string | null {
  if (value == null || value === "") return null;
  const u = String(unit || "").toUpperCase();
  const n = Number(value);
  if (u === "FL" && Number.isFinite(n)) return `FL${String(Math.round(n)).padStart(3, "0")}`;
  if (Number.isFinite(n)) return `${Math.round(n)} ${u || "FT"}`.trim();
  return String(value);
}

function featureToHit(
  type: FlightPlanAirspaceHit["type"],
  feature: GeoJsonFeature,
  entryDistanceNm: number | null,
): FlightPlanAirspaceHit {
  const props = feature.properties || {};
  const ident = String(props.ident || props.icao || feature.id || "").trim() || "—";
  const name = String(props.nam || props.name || props.txtname || ident).trim();
  const lower =
    formatLimit(props.lowerlimi1 ?? props.lowerlimit, props.lowerlimit) ||
    formatLimit(props.lowerlimi1, props.codedistv1);
  const upper =
    formatLimit(props.upperlimit, props.uplimituni || props.uomdistver) ||
    formatLimit(props.upperlimit, props.uplimituni);
  return {
    type,
    ident,
    name,
    lower,
    upper,
    fir: props.relatedfir ? String(props.relatedfir) : null,
    entryDistanceNm,
    frequencies: [],
  };
}

function hitKey(hit: FlightPlanAirspaceHit): string {
  return `${hit.type}:${hit.ident}:${hit.name}`;
}

function sortChronological(hits: FlightPlanAirspaceHit[]): FlightPlanAirspaceHit[] {
  return [...hits].sort((a, b) => {
    const da = a.entryDistanceNm ?? Number.POSITIVE_INFINITY;
    const db = b.entryDistanceNm ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name, "pt-BR");
  });
}

async function fetchLayerFeatures(
  baseUrl: string,
  layer: string,
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number },
): Promise<GeoJsonFeature[]> {
  const params = new URLSearchParams({
    service: "WFS",
    version: "1.0.0",
    request: "GetFeature",
    typeName: layer,
    bbox: `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`,
    outputFormat: "application/json",
    maxFeatures: "250",
  });
  const response = await fetch(`${baseUrl}?${params.toString()}`);
  if (!response.ok) throw new Error(`WFS ${layer} falhou (${response.status})`);
  const data = (await response.json()) as GeoJsonFeatureCollection;
  return Array.isArray(data.features) ? data.features : [];
}

async function detectAirspacesClientSide(points: LatLng[]): Promise<FlightPlanAirspaceHit[]> {
  const dense = densifyRoute(points, 3500);
  const cumNm = cumulativeDistanceNm(dense);
  const bbox = routeBoundingBox(dense, 0.4);
  if (!bbox) return [];

  const bases = [DEV_PROXY_BASE, GEOAISWEB_WFS];
  let lastError: unknown = null;

  for (const base of bases) {
    try {
      const collections = await Promise.all(
        AIRSPACE_LAYERS.map(async ({ type, layer }) => {
          const features = await fetchLayerFeatures(base, layer, bbox);
          return features
            .filter((f) => routeIntersectsGeometry(dense, f.geometry))
            .map((f) => featureToHit(type, f, firstEntryDistanceNm(dense, cumNm, f.geometry)));
        }),
      );
      const map = new Map<string, FlightPlanAirspaceHit>();
      for (const hit of collections.flat()) {
        const prev = map.get(hitKey(hit));
        if (!prev || (hit.entryDistanceNm ?? Infinity) < (prev.entryDistanceNm ?? Infinity)) {
          map.set(hitKey(hit), hit);
        }
      }
      return sortChronological([...map.values()]);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Falha ao consultar espaço aéreo.");
}

function icaoFromAirspaceIdent(ident: string): string | null {
  const raw = String(ident || "").trim().toUpperCase();
  if (/^[A-Z]{4}$/.test(raw)) return raw;
  const prefix = raw.match(/^([A-Z]{4})(?:_|$)/);
  return prefix ? prefix[1]! : null;
}

/** Attach APP/TWR/GND/ATIS from AISWEB ROTAER for CTR/ATZ (and TMA when ICAO-like). */
export async function enrichAirspaceFrequencies(
  hits: FlightPlanAirspaceHit[],
): Promise<FlightPlanAirspaceHit[]> {
  const icaoSet = new Set<string>();
  for (const hit of hits) {
    if (hit.type === "CTA") continue;
    const icao = icaoFromAirspaceIdent(hit.ident);
    if (icao) icaoSet.add(icao);
  }

  const freqByIcao = new Map<string, FlightPlanAirspaceHit["frequencies"]>();
  await Promise.all(
    [...icaoSet].map(async (icao) => {
      try {
        const bundle = await lookupAiswebIcao(icao);
        freqByIcao.set(icao, pickAirspaceFrequencies(bundle.rotaer?.frequencies));
      } catch {
        freqByIcao.set(icao, []);
      }
    }),
  );

  return hits.map((hit) => {
    const icao = icaoFromAirspaceIdent(hit.ident);
    if (!icao) return hit;
    const frequencies = freqByIcao.get(icao) || [];
    if (!frequencies.length) return hit;
    return { ...hit, frequencies };
  });
}

/** Prefer client/proxy WFS; fall back to Appwrite function (production). */
export async function detectAirspacesAlongRoute(
  points: LatLng[],
): Promise<FlightPlanAirspaceHit[]> {
  if (points.length === 0) return [];

  let hits: FlightPlanAirspaceHit[];
  try {
    hits = await detectAirspacesClientSide(points);
  } catch {
    hits = await queryAirspaceAlongRoute(points);
  }
  return enrichAirspaceFrequencies(hits);
}

export function sampleRoutePoints(points: LatLng[], maxPoints = 100): LatLng[] {
  if (points.length <= maxPoints) return points;
  const out: LatLng[] = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round(i * step);
    out.push(points[idx]!);
  }
  return out;
}
