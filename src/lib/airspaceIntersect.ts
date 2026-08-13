import { lookupAiswebIcao, queryAirspaceAlongRoute } from "./aiswebDb";
import { enrichAfisAdFromAisweb } from "./afisAdEnrichment";
import {
  isPointInsideFizCtrTma,
  loadAfisSuppressingAirspaces,
  markAfisCoverageFromFeatures,
  pointsBbox,
} from "./afisCoverage";
import {
  AFIS_AD_RADIUS_NM,
  AFIS_AD_UPPER_FL,
  airspaceFeatureToInfo,
  loadAirspaceFeaturesInBbox,
  type AirspaceInfo,
  type AirspaceLayerType,
} from "./airspaceLayersDb";
import { pickAirspaceFrequencies } from "./flightPlanFormat";
import { lookupTmaComFrequencies } from "./tmaComFrequencies";
import type { FlightPlanAirspaceFrequency, FlightPlanAirspaceHit } from "../types/flightPlanning";
import { haversineM, routeBoundingBox } from "./flightPlanningRoute";
import { altitudeAtDistanceNm, eteHoursAtDistanceNm, type ProfilePhasePoint } from "./routePerformanceProfile";
import { circlePolygon, clipGeometryToBbox, type GeoPoly } from "./geoClip";

type LatLng = { lat: number; lng: number };

export type AfisRouteAerodrome = {
  icao: string;
  lat: number | null;
  lng: number | null;
};

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

export type AirspaceVolume = {
  type: FlightPlanAirspaceHit["type"];
  ident: string;
  name: string;
  lowerFt: number | null;
  upperFt: number | null;
  geometry: GeoPoly;
  info?: AirspaceInfo;
  /** True when loaded for the terrain crop, not because the route intersects it. */
  offRoute?: boolean;
};

export type DetectAirspacesResult = {
  hits: FlightPlanAirspaceHit[];
  volumes: AirspaceVolume[];
};

export type DetectAirspacesOptions = {
  /** Performance profile used to sample planned altitude along the route. */
  performanceProfile?: ProfilePhasePoint[] | null;
  /**
   * Aeródromos próximos à rota — usados para gerar hits AFIS (Rádio/AFIS no ROTAER)
   * com círculo 27 NM / SFC–FL145 quando não há FIZ no GeoAISWEB.
   */
  aerodromes?: AfisRouteAerodrome[] | null;
};

const GEOAISWEB_WFS = "https://geoaisweb.decea.mil.br/geoserver/ows";
const DEV_PROXY_BASE = "/geoaisweb-proxy/geoserver/ows";
const APP_WFS_PROXY = "/api/geoaisweb/wfs";
const NM_IN_M = 1852;
const ALT_TOL_FT = 100;

const AIRSPACE_LAYERS: Array<{ type: FlightPlanAirspaceHit["type"]; layer: string; kind: string }> = [
  { type: "FIR", layer: "ICA:fir", kind: "fir" },
  { type: "FIS", layer: "ICA:fis", kind: "fis" },
  { type: "TMA", layer: "ICA:TMA", kind: "tma" },
  { type: "CTA", layer: "ICA:CTA", kind: "cta" },
  { type: "CTR", layer: "ICA:CTR", kind: "ctr" },
  { type: "ATZ", layer: "ICA:ATZ", kind: "atz" },
  { type: "FIZ", layer: "ICA:fiz", kind: "fiz" },
  { type: "P", layer: "ICA:eac_p", kind: "eac_p" },
  { type: "R", layer: "ICA:eac_r", kind: "eac_r" },
  { type: "D", layer: "ICA:eac_d", kind: "eac_d" },
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
  // EAC (P/R/D): lowerlimit/upperlimit + uom_llimit/uom_ulimit
  // CTA/TMA/…: lowerlimi1 + codedistv1 / upperlimit + uplimituni
  const isEac = Boolean(props.uom_llimit || props.uom_ulimit || props.tipo === "P" || props.tipo === "R" || props.tipo === "D");

  const lowerFt = isEac
    ? parseAirspaceLimitFt(props.lowerlimit ?? props.lowerlimi1, props.uom_llimit)
    : parseAirspaceLimitFt(props.lowerlimi1 ?? props.lowerlimit, props.lowerlimit) ??
      parseAirspaceLimitFt(props.lowerlimi1, props.codedistv1);
  const upperFt = isEac
    ? parseAirspaceLimitFt(props.upperlimit, props.uom_ulimit)
    : parseAirspaceLimitFt(props.upperlimit, props.uplimituni || props.uomdistver) ??
      parseAirspaceLimitFt(props.upperlimit, props.uplimituni);

  const formatLimit = (value: unknown, unit: unknown): string | null => {
    if (value == null || value === "") return null;
    const u = String(unit || "").toUpperCase();
    const n = Number(value);
    if (u === "FL" && Number.isFinite(n)) return `FL${String(Math.round(n)).padStart(3, "0")}`;
    if (u === "SFC" || String(value).toUpperCase() === "SFC") return "Superfície";
    if (Number.isFinite(n) && n === 0 && (u === "FT" || u === "SFC" || !u)) return "Superfície";
    if (Number.isFinite(n)) return `${Math.round(n)} ${u || "FT"}`.trim();
    return String(value);
  };

  const lower = isEac
    ? formatLimit(props.lowerlimit ?? props.lowerlimi1, props.uom_llimit)
    : formatLimit(props.lowerlimi1 ?? props.lowerlimit, props.lowerlimit) ||
      formatLimit(props.lowerlimi1, props.codedistv1);
  const upper = isEac
    ? formatLimit(props.upperlimit, props.uom_ulimit)
    : formatLimit(props.upperlimit, props.uplimituni || props.uomdistver) ||
      formatLimit(props.upperlimit, props.uplimituni);
  return { lower, upper, lowerFt, upperFt };
}

function occupancySegments(
  count: number,
  cumNm: number[],
  isInside: (i: number) => boolean,
): Array<{ fromNm: number; toNm: number }> {
  const segments: Array<{ fromNm: number; toNm: number }> = [];
  let start: number | null = null;
  let last: number | null = null;
  for (let i = 0; i < count; i++) {
    if (isInside(i)) {
      if (start == null) start = cumNm[i] ?? 0;
      last = cumNm[i] ?? start;
    } else if (start != null && last != null) {
      segments.push({ fromNm: start, toNm: Math.max(start, last) });
      start = null;
      last = null;
    }
  }
  if (start != null && last != null) {
    segments.push({ fromNm: start, toNm: Math.max(start, last) });
  }
  return segments;
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

function lateralOccupancyNm(
  points: LatLng[],
  cumNm: number[],
  geometry: GeoJsonGeometry | null,
): Array<{ fromNm: number; toNm: number }> {
  if (!geometry) return [];
  return occupancySegments(points.length, cumNm, (i) => {
    const p = points[i]!;
    return geometryContainsPoint(geometry, p.lng, p.lat);
  });
}

function featureToHit(
  type: FlightPlanAirspaceHit["type"],
  feature: GeoJsonFeature,
  entryDistanceNm: number | null,
  extras?: {
    occupancyNm?: Array<{ fromNm: number; toNm: number }>;
    exitDistanceNm?: number | null;
    lowerFt?: number | null;
    upperFt?: number | null;
    altitudeMiss?: boolean;
  },
): FlightPlanAirspaceHit {
  const props = feature.properties || {};
  const isEac = type === "P" || type === "R" || type === "D";
  const ident =
    String((isEac ? props.id : null) || props.ident || props.icao || feature.id || "").trim() || "—";
  const name = String(props.nome || props.nam || props.name || props.txtname || ident).trim();
  const limits = featureVerticalLimits(props);
  const remarkText = props.txtrmk_loc ? String(props.txtrmk_loc) : null;
  const frequencies =
    type === "FIS" ? parseFrequencyRemarks(remarkText) : ([] as FlightPlanAirspaceFrequency[]);
  const occupancyNm = extras?.occupancyNm?.length ? extras.occupancyNm : undefined;
  const lastSeg = occupancyNm?.[occupancyNm.length - 1];
  return {
    type,
    ident,
    name,
    lower: limits.lower,
    upper: limits.upper,
    lowerFt: extras?.lowerFt ?? limits.lowerFt,
    upperFt: extras?.upperFt ?? limits.upperFt,
    fir: props.fir
      ? String(props.fir)
      : props.relatedfir
        ? String(props.relatedfir)
        : null,
    entryDistanceNm,
    exitDistanceNm: extras?.exitDistanceNm ?? lastSeg?.toNm ?? null,
    occupancyNm,
    frequencies,
    altitudeMiss: Boolean(extras?.altitudeMiss),
  };
}

/** ETE along the planned profile at the airspace entry distance. */
export function airspaceEntryEteHours(
  hit: FlightPlanAirspaceHit,
  profile: ProfilePhasePoint[] | null | undefined,
): number | null {
  if (hit.entryDistanceNm == null || !Number.isFinite(hit.entryDistanceNm) || !profile?.length) {
    return null;
  }
  return eteHoursAtDistanceNm(profile, hit.entryDistanceNm);
}

export function airspacesEnteredVertically(hits: FlightPlanAirspaceHit[]): FlightPlanAirspaceHit[] {
  return hits.filter((hit) => !hit.altitudeMiss);
}

function parseFrequencyRemarks(text: string | null): FlightPlanAirspaceFrequency[] {
  if (!text) return [];
  const found = [
    ...text.matchAll(/(?:frequ[eê]ncia|freq(?:uency)?)\s*[:=]?\s*(\d{2,3}(?:[.,]\d{1,3})?)/gi),
  ]
    .map((m) => String(m[1] || "").replace(",", "."))
    .filter(Boolean);
  const unique = [...new Set(found)];
  return unique.map((mhz) => ({ service: "FIS", mhz }));
}

function hitKey(hit: FlightPlanAirspaceHit): string {
  return `${hit.type}:${hit.ident}:${hit.name}`;
}

function volumeFromHit(
  hit: FlightPlanAirspaceHit,
  geometry: { type: string; coordinates?: unknown } | null | undefined,
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number },
): AirspaceVolume | null {
  const clipped = clipGeometryToBbox(geometry, bbox);
  if (!clipped) return null;
  return {
    type: hit.type,
    ident: hit.ident,
    name: hit.name,
    lowerFt: hit.lowerFt ?? null,
    upperFt: hit.upperFt ?? null,
    geometry: clipped,
  };
}

function mergeHitsAndVolumes(
  items: Array<{ hit: FlightPlanAirspaceHit; volume: AirspaceVolume | null }>,
): DetectAirspacesResult {
  const hitMap = new Map<string, FlightPlanAirspaceHit>();
  const volumeMap = new Map<string, AirspaceVolume>();
  for (const item of items) {
    const key = hitKey(item.hit);
    const prev = hitMap.get(key);
    if (!prev || (item.hit.entryDistanceNm ?? Infinity) < (prev.entryDistanceNm ?? Infinity)) {
      hitMap.set(key, item.hit);
      if (item.volume) volumeMap.set(key, item.volume);
      else volumeMap.delete(key);
    }
  }
  return {
    hits: sortChronological([...hitMap.values()]),
    volumes: [...volumeMap.values()],
  };
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
  kind?: string,
): Promise<GeoJsonFeature[]> {
  const params =
    baseUrl === APP_WFS_PROXY
      ? new URLSearchParams({
          kind: String(kind || "").toLowerCase(),
          bbox: `${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}`,
          maxFeatures: "250",
        })
      : new URLSearchParams({
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
    const lo = hit.lowerFt ?? parseAirspaceLimitFt(hit.lower);
    const hi = hit.upperFt ?? parseAirspaceLimitFt(hit.upper);
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
): Promise<DetectAirspacesResult> {
  const dense = densifyRoute(points, 3500);
  const cumNm = cumulativeDistanceNm(dense);
  const altsFt = sampleAltsAlongRoute(cumNm, options?.performanceProfile);
  const bbox = routeBoundingBox(dense, 2.6);
  if (!bbox) return { hits: [], volumes: [] };

  const bases = import.meta.env.DEV
    ? [DEV_PROXY_BASE, GEOAISWEB_WFS]
    : [APP_WFS_PROXY, GEOAISWEB_WFS];
  let lastError: unknown = null;

  for (const base of bases) {
    try {
      const collections = await Promise.all(
        AIRSPACE_LAYERS.map(async ({ type, layer, kind }) => {
          const features = await fetchLayerFeatures(base, layer, bbox, kind);
          return features
            .map((f) => {
              const props = f.properties || {};
              const limits = featureVerticalLimits(props);
              const occupancyNm = lateralOccupancyNm(dense, cumNm, f.geometry);
              if (!occupancyNm.length) return null;
              const entry = firstVerticalEntryDistanceNm(
                dense,
                cumNm,
                altsFt,
                f.geometry,
                limits.lowerFt,
                limits.upperFt,
              );
              const hit = featureToHit(type, f, entry, {
                occupancyNm,
                lowerFt: limits.lowerFt,
                upperFt: limits.upperFt,
                altitudeMiss: entry == null,
              });
              return { hit, volume: volumeFromHit(hit, f.geometry, bbox) };
            })
            .filter((row): row is { hit: FlightPlanAirspaceHit; volume: AirspaceVolume | null } => row != null);
        }),
      );
      return mergeHitsAndVolumes(collections.flat());
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

/** CTR/ATZ/FIZ use AD ICAO. TMA COM comes from ROTAER FIR/TMA table (not AD TWR). */
function resolveFrequencyIcaoCandidate(hit: FlightPlanAirspaceHit): string | null {
  if (
    hit.type === "CTA" ||
    hit.type === "FIR" ||
    hit.type === "FIS" ||
    hit.type === "P" ||
    hit.type === "R" ||
    hit.type === "D" ||
    hit.type === "TMA"
  ) {
    return null;
  }
  return icaoFromAirspaceIdent(hit.ident);
}

/** Attach APP/TWR/GND/ATIS from AISWEB ROTAER; TMA uses ROTAER FIR/TMA CONTROLE table. */
export async function enrichAirspaceFrequencies(
  hits: FlightPlanAirspaceHit[],
): Promise<FlightPlanAirspaceHit[]> {
  const icaoByHitKey = new Map<string, string | null>();

  for (const hit of hits) {
    const key = hitKey(hit);
    if (hit.frequencies?.length || hit.type === "TMA") {
      icaoByHitKey.set(key, null);
      continue;
    }
    icaoByHitKey.set(key, resolveFrequencyIcaoCandidate(hit));
  }

  const icaoSet = new Set<string>();
  for (const icao of icaoByHitKey.values()) {
    if (icao) icaoSet.add(icao);
  }

  const freqByIcao = new Map<string, FlightPlanAirspaceFrequency[]>();
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
    if (hit.frequencies?.length) return hit;

    if (hit.type === "TMA") {
      const tmaFreqs = lookupTmaComFrequencies(hit.ident);
      return tmaFreqs.length ? { ...hit, frequencies: tmaFreqs } : hit;
    }

    const icao = icaoByHitKey.get(hitKey(hit));
    if (!icao) return hit;
    const all = freqByIcao.get(icao) || [];
    if (!all.length) return hit;
    return { ...hit, frequencies: all };
  });
}

/** Prefer client/proxy WFS; fall back to Appwrite function (production). */
export async function detectAirspacesAlongRoute(
  points: LatLng[],
  options?: DetectAirspacesOptions,
): Promise<DetectAirspacesResult> {
  if (points.length === 0) return { hits: [], volumes: [] };

  let hits: FlightPlanAirspaceHit[];
  let volumes: AirspaceVolume[] = [];
  try {
    const detected = await detectAirspacesClientSide(points, options);
    hits = detected.hits;
    volumes = detected.volumes;
  } catch {
    hits = await queryAirspaceAlongRoute(points);
    hits = filterAirspaceHitsByAltitude(hits, options?.performanceProfile);
  }
  const enriched = await enrichAirspaceFrequencies(hits);
  const afis = await detectAfisAdAlongRoute(points, options?.aerodromes ?? [], options);
  if (!afis.hits.length) {
    return { hits: enriched, volumes };
  }

  const existingKeys = new Set(enriched.map((h) => hitKey(h)));
  const merged = [...enriched];
  for (const hit of afis.hits) {
    if (existingKeys.has(hitKey(hit))) continue;
    merged.push(hit);
    existingKeys.add(hitKey(hit));
  }
  const volumeKeys = new Set(volumes.map((v) => `${v.type}:${v.ident}:${v.name}`));
  for (const volume of afis.volumes) {
    const key = `${volume.type}:${volume.ident}:${volume.name}`;
    if (volumeKeys.has(key)) continue;
    volumes.push(volume);
    volumeKeys.add(key);
  }
  return { hits: sortChronological(merged), volumes };
}

/**
 * AFIS / Rádio a partir do ROTAER: círculo 27 NM, SFC–FL145,
 * só quando o AD NÃO está dentro de FIZ / CTR / TMA (ex.: SBDO sim; SBCA não).
 */
export async function detectAfisAdAlongRoute(
  points: LatLng[],
  aerodromes: AfisRouteAerodrome[],
  options?: DetectAirspacesOptions,
): Promise<DetectAirspacesResult> {
  if (points.length === 0 || !aerodromes.length) return { hits: [], volumes: [] };

  const dense = densifyRoute(points, 6000);
  const cumNm = cumulativeDistanceNm(dense);
  const profile = options?.performanceProfile ?? null;
  const altsFt = dense.map((_, i) =>
    profile?.length ? altitudeAtDistanceNm(profile, cumNm[i]!) : null,
  );
  const radiusM = AFIS_AD_RADIUS_NM * NM_IN_M;
  const upperFt = AFIS_AD_UPPER_FL * 100;
  const box = routeBoundingBox(dense, AFIS_AD_RADIUS_NM / 60 + 0.2);
  if (!box) return { hits: [], volumes: [] };
  const { minLat, maxLat, minLng, maxLng } = box;

  const near: AfisRouteAerodrome[] = [];
  const seen = new Set<string>();
  for (const ad of aerodromes) {
    const icao = String(ad.icao || "")
      .trim()
      .toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(icao) || ad.lat == null || ad.lng == null) continue;
    if (seen.has(icao)) continue;
    if (ad.lat < minLat || ad.lat > maxLat || ad.lng < minLng || ad.lng > maxLng) continue;
    const center = { lat: ad.lat, lng: ad.lng };
    let inside = false;
    for (const p of dense) {
      if (haversineM(center, p) <= radiusM) {
        inside = true;
        break;
      }
    }
    if (!inside) continue;
    seen.add(icao);
    near.push({ icao, lat: ad.lat, lng: ad.lng });
    if (near.length >= 36) break;
  }
  if (!near.length) return { hits: [], volumes: [] };

  const coverBbox =
    pointsBbox(
      near.map((a) => ({ lat: a.lat!, lng: a.lng! })),
      0.08,
    ) || box;
  let suppressFeatures: Awaited<ReturnType<typeof loadAfisSuppressingAirspaces>> = [];
  try {
    suppressFeatures = await loadAfisSuppressingAirspaces(coverBbox);
    markAfisCoverageFromFeatures(
      near.map((a) => ({ icao: a.icao, lat: a.lat!, lng: a.lng! })),
      suppressFeatures,
    );
  } catch {
    suppressFeatures = [];
  }

  const hits: FlightPlanAirspaceHit[] = [];
  const volumes: AirspaceVolume[] = [];
  await Promise.all(
    near.map(async (ad) => {
      const enrich = await enrichAfisAdFromAisweb(ad.icao);
      if (!enrich?.hasAfisRadio) return;
      if (isPointInsideFizCtrTma(ad.lat!, ad.lng!, suppressFeatures)) return;

      const center = { lat: ad.lat!, lng: ad.lng! };
      const occupancyNm = occupancySegments(dense.length, cumNm, (i) => {
        return haversineM(center, dense[i]!) <= radiusM;
      });
      if (!occupancyNm.length) return;

      let entryDistanceNm: number | null = null;
      for (let i = 0; i < dense.length; i++) {
        if (haversineM(center, dense[i]!) > radiusM) continue;
        if (profile?.length) {
          const alt = altsFt[i];
          if (alt == null || !Number.isFinite(alt)) continue;
          if (!altitudeOverlapsBand(alt, 0, upperFt)) continue;
        }
        entryDistanceNm = cumNm[i] ?? null;
        break;
      }

      const mhzList = enrich.frequenciesMhz?.length
        ? enrich.frequenciesMhz
        : enrich.frequency
          ? [enrich.frequency.replace(/\s*MHz$/i, "").trim()]
          : [];
      const serviceLabel = enrich.callsign
        ? `RÁDIO ${enrich.callsign}`
        : enrich.service || "RÁDIO";
      const frequencies: FlightPlanAirspaceFrequency[] = mhzList.map((mhz) => ({
        service: serviceLabel,
        mhz: /mhz/i.test(mhz) ? mhz : `${mhz} MHz`,
      }));
      if (frequencies.length) {
        frequencies.push({ service: "EMERG", mhz: "121.500 MHz" });
      }

      const label = enrich.callsign
        ? `AFIS / Rádio ${enrich.callsign}`
        : `AFIS / Rádio ${ad.icao}`;
      hits.push({
        type: "AFIS",
        ident: ad.icao,
        name: label,
        lower: "Superfície",
        upper: `FL${String(AFIS_AD_UPPER_FL).padStart(3, "0")}`,
        lowerFt: 0,
        upperFt,
        fir: null,
        entryDistanceNm,
        exitDistanceNm: occupancyNm[occupancyNm.length - 1]?.toNm ?? null,
        occupancyNm,
        altitudeMiss: entryDistanceNm == null,
        frequencies,
      });
      const circle = circlePolygon(ad.lat!, ad.lng!, radiusM);
      const clipped = clipGeometryToBbox(circle, box);
      if (clipped) {
        volumes.push({
          type: "AFIS",
          ident: ad.icao,
          name: label,
          lowerFt: 0,
          upperFt,
          geometry: clipped,
        });
      }
    }),
  );

  return { hits: sortChronological(hits), volumes };
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

const AREA_VOLUME_TYPES: AirspaceLayerType[] = ["TMA", "CTR", "ATZ", "FIZ", "CTA", "P", "R", "D"];

function volumeKey(volume: Pick<AirspaceVolume, "type" | "ident" | "name">): string {
  return `${volume.type}:${volume.ident}:${volume.name}`;
}

/** Espaços aéreos no recorte (não só os cruzados pela rota). */
export async function loadAirspaceVolumesInBbox(
  bbox: { minLng: number; minLat: number; maxLng: number; maxLat: number },
  options?: { types?: AirspaceLayerType[]; maxTotal?: number },
): Promise<AirspaceVolume[]> {
  const types = options?.types ?? AREA_VOLUME_TYPES;
  const maxTotal = options?.maxTotal ?? 80;
  const collections = await Promise.all(
    types.map(async (type) => {
      const features = await loadAirspaceFeaturesInBbox(type, bbox);
      const out: AirspaceVolume[] = [];
      for (const feature of features.slice(0, 28)) {
        const clipped = clipGeometryToBbox(feature.geometry, bbox);
        if (!clipped) continue;
        const props = (feature.properties || {}) as Record<string, unknown>;
        const limits = featureVerticalLimits(props);
        const info = airspaceFeatureToInfo(feature);
        out.push({
          type: feature.layerType as AirspaceVolume["type"],
          ident: info.ident,
          name: info.name,
          lowerFt: limits.lowerFt,
          upperFt: limits.upperFt,
          geometry: clipped,
          info,
          offRoute: true,
        });
      }
      return out;
    }),
  );
  const seen = new Set<string>();
  const merged: AirspaceVolume[] = [];
  for (const volume of collections.flat()) {
    const key = volumeKey(volume);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(volume);
    if (merged.length >= maxTotal) break;
  }
  return merged;
}
