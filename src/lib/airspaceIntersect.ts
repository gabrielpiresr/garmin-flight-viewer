import { lookupAiswebIcao, queryAirspaceAlongRoute } from "./aiswebDb";
import { pickAirspaceFrequencies } from "./flightPlanFormat";
import type { FlightPlanAirspaceHit } from "../types/flightPlanning";
import { haversineM, routeBoundingBox } from "./flightPlanningRoute";
import { altitudeAtDistanceNm, type ProfilePhasePoint } from "./routePerformanceProfile";

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

export type DetectAirspacesOptions = {
  /** Performance profile used to sample planned altitude along the route. */
  performanceProfile?: ProfilePhasePoint[] | null;
};

const GEOAISWEB_WFS = "https://geoaisweb.decea.mil.br/geoserver/ows";
const DEV_PROXY_BASE = "/geoaisweb-proxy/geoserver/ows";
const NM_IN_M = 1852;
const ALT_TOL_FT = 100;

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

/** Parse display/WFS limit text or raw value+unit into feet MSL. */
export function parseAirspaceLimitFt(value: unknown, unit?: unknown): number | null {
  if (value == null || value === "") return null;
  const u = String(unit ?? "").trim().toUpperCase();
  const raw = String(value).trim().toUpperCase();
  if (!raw || raw === "—" || raw === "-") return null;
  if (/^(SFC|GND|SURFACE|SUPERF)/.test(raw) || u === "SFC" || u === "GND") return 0;
  if (/^(UNL|UNLIMITED|UNLTD)/.test(raw) || u === "UNL") return 999_999;

  const flFromText = raw.match(/FL\s*(\d+)/);
  if (flFromText) return Number(flFromText[1]) * 100;
  if (u === "FL") {
    const n = Number(String(value).replace(/[^\d.-]/g, ""));
    if (Number.isFinite(n)) return Math.round(n) * 100;
  }

  const n = Number(String(value).replace(/[^\d.-]/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  if (u === "FT" || u === "FEET" || u === "" || /\bFT\b/.test(raw)) return Math.round(n);
  if (u === "M" || u === "MT" || u === "METER" || u === "METRE") return Math.round(n / 0.3048);
  return Math.round(n);
}

function altitudeOverlapsBand(
  altFt: number,
  lowerFt: number | null,
  upperFt: number | null,
  tol = ALT_TOL_FT,
): boolean {
  const lo = lowerFt ?? 0;
  const hi = upperFt ?? 999_999;
  if (lo > hi) return altFt >= hi - tol && altFt <= lo + tol;
  return altFt >= lo - tol && altFt <= hi + tol;
}

function featureVerticalLimits(props: Record<string, unknown>): {
  lower: string | null;
  upper: string | null;
  lowerFt: number | null;
  upperFt: number | null;
} {
  const lowerFt =
    parseAirspaceLimitFt(props.lowerlimi1 ?? props.lowerlimit, props.lowerlimit) ??
    parseAirspaceLimitFt(props.lowerlimi1, props.codedistv1);
  const upperFt =
    parseAirspaceLimitFt(props.upperlimit, props.uplimituni || props.uomdistver) ??
    parseAirspaceLimitFt(props.upperlimit, props.uplimituni);

  const formatLimit = (value: unknown, unit: unknown): string | null => {
    if (value == null || value === "") return null;
    const u = String(unit || "").toUpperCase();
    const n = Number(value);
    if (u === "FL" && Number.isFinite(n)) return `FL${String(Math.round(n)).padStart(3, "0")}`;
    if (Number.isFinite(n)) return `${Math.round(n)} ${u || "FT"}`.trim();
    return String(value);
  };

  const lower =
    formatLimit(props.lowerlimi1 ?? props.lowerlimit, props.lowerlimit) ||
    formatLimit(props.lowerlimi1, props.codedistv1);
  const upper =
    formatLimit(props.upperlimit, props.uplimituni || props.uomdistver) ||
    formatLimit(props.upperlimit, props.uplimituni);
  return { lower, upper, lowerFt, upperFt };
}

function firstVerticalEntryDistanceNm(
  points: LatLng[],
  cumNm: number[],
  altsFt: Array<number | null>,
  geometry: GeoJsonGeometry | null,
  lowerFt: number | null,
  upperFt: number | null,
): number | null {
  if (!geometry) return null;
  const hasBand = lowerFt != null || upperFt != null;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    if (!geometryContainsPoint(geometry, p.lng, p.lat)) continue;
    if (!hasBand) return cumNm[i] ?? null;
    const alt = altsFt[i];
    if (alt == null || !Number.isFinite(alt)) continue;
    if (altitudeOverlapsBand(alt, lowerFt, upperFt)) return cumNm[i] ?? null;
  }
  return null;
}

function featureToHit(
  type: FlightPlanAirspaceHit["type"],
  feature: GeoJsonFeature,
  entryDistanceNm: number | null,
): FlightPlanAirspaceHit {
  const props = feature.properties || {};
  const ident = String(props.ident || props.icao || feature.id || "").trim() || "—";
  const name = String(props.nam || props.name || props.txtname || ident).trim();
  const limits = featureVerticalLimits(props);
  return {
    type,
    ident,
    name,
    lower: limits.lower,
    upper: limits.upper,
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

function sampleAltsAlongRoute(
  cumNm: number[],
  profile: ProfilePhasePoint[] | null | undefined,
): Array<number | null> {
  if (!profile?.length) return cumNm.map(() => null);
  return cumNm.map((x) => altitudeAtDistanceNm(profile, x));
}

/** Keep hits whose planned altitude at entry overlaps published vertical limits. */
export function filterAirspaceHitsByAltitude(
  hits: FlightPlanAirspaceHit[],
  profile: ProfilePhasePoint[] | null | undefined,
): FlightPlanAirspaceHit[] {
  if (!profile?.length) return hits;
  return hits.filter((hit) => {
    const lo = parseAirspaceLimitFt(hit.lower);
    const hi = parseAirspaceLimitFt(hit.upper);
    if (lo == null && hi == null) return true;
    const x = hit.entryDistanceNm ?? 0;
    const alt = altitudeAtDistanceNm(profile, x);
    if (alt == null || !Number.isFinite(alt)) return true;
    return altitudeOverlapsBand(alt, lo, hi);
  });
}

async function detectAirspacesClientSide(
  points: LatLng[],
  options?: DetectAirspacesOptions,
): Promise<FlightPlanAirspaceHit[]> {
  const dense = densifyRoute(points, 3500);
  const cumNm = cumulativeDistanceNm(dense);
  const altsFt = sampleAltsAlongRoute(cumNm, options?.performanceProfile);
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
            .map((f) => {
              const props = f.properties || {};
              const limits = featureVerticalLimits(props);
              const entry = firstVerticalEntryDistanceNm(
                dense,
                cumNm,
                altsFt,
                f.geometry,
                limits.lowerFt,
                limits.upperFt,
              );
              if (entry == null) return null;
              return featureToHit(type, f, entry);
            })
            .filter((h): h is FlightPlanAirspaceHit => h != null);
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
  options?: DetectAirspacesOptions,
): Promise<FlightPlanAirspaceHit[]> {
  if (points.length === 0) return [];

  let hits: FlightPlanAirspaceHit[];
  try {
    hits = await detectAirspacesClientSide(points, options);
  } catch {
    hits = await queryAirspaceAlongRoute(points);
    hits = filterAirspaceHitsByAltitude(hits, options?.performanceProfile);
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
