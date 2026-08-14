import { fetchFr24TrackPointsForFlight } from "./attachFlightTelemetryFromFr24";
import { formatVideoAltitude } from "./videoTelemetry";
import { lngLatToEnu, type EnuOrigin } from "./route3d";
import type { FlightShareData, FlightShareTelemetryKind } from "./flightShareStickers";
import type { FlightPoint } from "../types/flight";
import type { AirspaceLayerType } from "./airspaceLayersDb";
import type { TerrainGrid } from "./terrainTiles";

export const FLYOVER_WIDTH = 720;
export const FLYOVER_HEIGHT = 1280;
export const FLYOVER_FPS = 30;
export const FLYOVER_EXAGGERATION = 4;
export const FLYOVER_PAD_DEG = 0.7;
export const FLYOVER_MAX_SAT_TILES = 160;
export const FLYOVER_SAT_MAX_ZOOM = 16;
export const FLYOVER_TERRAIN_MAX_TILES = 120;
export const FLYOVER_TERRAIN_MAX_ZOOM = 14;
export const FLYOVER_TERRAIN_TARGET_CELLS = 900;
export const FLYOVER_MAX_VOLUMES = 60;
export const FLYOVER_MAX_CORRIDORS = 80;
export const FLYOVER_MAX_LABELS = 12;
export const FLYOVER_MIN_PLAYBACK_RATE = 4;
export const FLYOVER_CHASE_END = 0.94;
export const FLYOVER_REVEAL_SECONDS = 5.2;
export const FLYOVER_REVEAL_LEAD_SECONDS = 1.6;
export const FLYOVER_DURATION_OPTIONS = [15, 30, 45, 60] as const;

export type FlyoverDurationSec = (typeof FLYOVER_DURATION_OPTIONS)[number];

export type FlyoverSample = {
  elapsedMs: number;
  lat: number;
  lon: number;
  altM: number;
  speedMs: number;
  headingDeg: number;
  distanceM: number;
};

export type FlyoverTrack = {
  samples: FlyoverSample[];
  durationMs: number;
  source: Exclude<FlightShareTelemetryKind, "none">;
};

export type FlyoverLabel = {
  text: string;
  x: number;
  y: number;
  z: number;
  color: string;
};

const FLYOVER_AIRSPACE_TYPES: AirspaceLayerType[] = [
  "TMA",
  "CTR",
  "ATZ",
  "FIZ",
  "CTA",
  "P",
  "R",
  "D",
  "FIR",
  "FIS",
];

export const FLYOVER_DEFAULT_HIDDEN_AIRSPACES = new Set<AirspaceLayerType>(FLYOVER_AIRSPACE_TYPES);

export function flyoverAirspaceTypes(): AirspaceLayerType[] {
  return FLYOVER_AIRSPACE_TYPES;
}

function gpsPoints(points: FlightPoint[]): FlightPoint[] {
  return points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = 6_371_008.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(s)));
}

function headingBetween(a: FlightPoint, b: FlightPoint): number {
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const dλ = ((b.lon - a.lon) * Math.PI) / 180;
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngleDeg(a: number, b: number, t: number): number {
  const delta = ((b - a + 540) % 360) - 180;
  return (a + delta * t + 360) % 360;
}

function downsample<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const out: T[] = [];
  const last = items.length - 1;
  for (let i = 0; i < max; i++) {
    const idx = Math.round((i / Math.max(1, max - 1)) * last);
    const item = items[idx];
    if (item && out[out.length - 1] !== item) out.push(item);
  }
  if (out[out.length - 1] !== items[last]) out.push(items[last]!);
  return out;
}

export function buildFlyoverTrack(
  points: FlightPoint[],
  source: Exclude<FlightShareTelemetryKind, "none">,
): FlyoverTrack | null {
  const gps = downsample(gpsPoints(points), 2_400);
  if (gps.length < 2) return null;

  const timed = gps.filter((p) => p.t != null && Number.isFinite(p.t));
  const useTime = timed.length >= 2;
  const t0 = useTime ? Math.min(...timed.map((p) => p.t!)) : 0;

  const samples: FlyoverSample[] = gps.map((point, index) => {
    const prev = gps[Math.max(0, index - 1)]!;
    const next = gps[Math.min(gps.length - 1, index + 1)]!;
    const heading =
      point.headingDeg != null && Number.isFinite(point.headingDeg)
        ? ((point.headingDeg % 360) + 360) % 360
        : headingBetween(prev, next === prev ? point : next);
    const elapsedMs = useTime
      ? Math.max(0, (point.t ?? t0) - t0)
      : index * 1000;
    const altM = point.altM != null && Number.isFinite(point.altM) ? point.altM : 0;
    const speedMs = point.speedMs != null && Number.isFinite(point.speedMs) ? point.speedMs : 0;
    return {
      elapsedMs,
      lat: point.lat,
      lon: point.lon,
      altM,
      speedMs,
      headingDeg: heading,
      distanceM: 0,
    };
  });

  samples.sort((a, b) => a.elapsedMs - b.elapsedMs);
  for (let i = 1; i < samples.length; i++) {
    if (samples[i]!.elapsedMs <= samples[i - 1]!.elapsedMs) {
      samples[i]!.elapsedMs = samples[i - 1]!.elapsedMs + 40;
    }
  }
  let traveled = 0;
  samples[0]!.distanceM = 0;
  for (let i = 1; i < samples.length; i++) {
    traveled += haversineM(samples[i - 1]!, samples[i]!);
    samples[i]!.distanceM = traveled;
  }
  smoothSampleHeadings(samples);

  const durationMs = Math.max(1_000, samples[samples.length - 1]!.elapsedMs);
  return { samples, durationMs, source };
}

function smoothSampleHeadings(samples: FlyoverSample[]): void {
  if (samples.length < 3) return;
  const alpha = 0.18;
  let heading = samples[0]!.headingDeg;
  for (let i = 1; i < samples.length; i++) {
    heading = lerpAngleDeg(heading, samples[i]!.headingDeg, alpha);
    samples[i]!.headingDeg = heading;
  }
  heading = samples[samples.length - 1]!.headingDeg;
  for (let i = samples.length - 2; i >= 0; i--) {
    heading = lerpAngleDeg(heading, samples[i]!.headingDeg, alpha);
    samples[i]!.headingDeg = lerpAngleDeg(samples[i]!.headingDeg, heading, 0.55);
  }
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

export function sampleFlyoverAt(track: FlyoverTrack, elapsedMs: number): FlyoverSample {
  const t = Math.min(track.durationMs, Math.max(0, elapsedMs));
  const samples = track.samples;
  if (t <= samples[0]!.elapsedMs) return samples[0]!;
  const last = samples[samples.length - 1]!;
  if (t >= last.elapsedMs) return last;

  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (samples[mid]!.elapsedMs <= t) lo = mid;
    else hi = mid - 1;
  }
  const i1 = lo;
  const i2 = Math.min(samples.length - 1, lo + 1);
  const i0 = Math.max(0, i1 - 1);
  const i3 = Math.min(samples.length - 1, i2 + 1);
  const a = samples[i1]!;
  const b = samples[i2]!;
  const p0 = samples[i0]!;
  const p3 = samples[i3]!;
  const span = Math.max(1, b.elapsedMs - a.elapsedMs);
  const u = Math.min(1, Math.max(0, (t - a.elapsedMs) / span));
  return {
    elapsedMs: t,
    lat: catmull(p0.lat, a.lat, b.lat, p3.lat, u),
    lon: catmull(p0.lon, a.lon, b.lon, p3.lon, u),
    altM: catmull(p0.altM, a.altM, b.altM, p3.altM, u),
    speedMs: lerp(a.speedMs, b.speedMs, u),
    headingDeg: lerpAngleDeg(a.headingDeg, b.headingDeg, u),
    distanceM: lerp(a.distanceM, b.distanceM, u),
  };
}

export function flyoverVideoDurationSec(flightDurationMs: number, targetSec: FlyoverDurationSec): number {
  const flightSec = Math.max(1, flightDurationMs / 1000);
  const rate = Math.max(FLYOVER_MIN_PLAYBACK_RATE, flightSec / targetSec);
  return Math.max(4, flightSec / rate);
}

export function flyoverSpanM(points: Array<{ lat: number; lng: number }>, origin: EnuOrigin): number {
  let max = 600;
  for (const point of points) {
    const p = lngLatToEnu(point.lat, point.lng, origin);
    max = Math.max(max, Math.hypot(p.x, p.z));
  }
  return Math.max(1_400, max * 2.35);
}

export function formatFlyoverElapsed(elapsedMs: number): string {
  const totalSec = Math.max(0, Math.floor(elapsedMs / 1000));
  const ss = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) {
    return `${String(totalMin).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export function icaosFromShareData(data: FlightShareData): string[] {
  const chunks = [data.displayInfo.fromTo];
  for (const leg of data.meta?.legs ?? []) {
    chunks.push(leg.dep, leg.arr);
  }
  const text = chunks.join(" ").toUpperCase();
  const codes = [...new Set(text.match(/\b[A-Z]{4}\b/g) ?? [])];
  const br = codes.filter((code) => code.startsWith("S"));
  return br.length ? br : codes;
}

export type FlyoverTerrainCacheEntry = {
  grid: TerrainGrid;
  satelliteCanvas: HTMLCanvasElement | null;
};

const flyoverTerrainCache = new Map<string, FlyoverTerrainCacheEntry>();

export function flyoverTerrainCacheKey(flightId: string, source: string, sampleCount: number): string {
  return `${flightId}:${source}:${sampleCount}:p70`;
}

export function getFlyoverTerrainCache(key: string): FlyoverTerrainCacheEntry | undefined {
  return flyoverTerrainCache.get(key);
}

export function setFlyoverTerrainCache(key: string, entry: FlyoverTerrainCacheEntry): void {
  flyoverTerrainCache.set(key, entry);
}

export function formatFlyoverDistanceNm(distanceM: number): string {
  const nm = Math.max(0, distanceM) / 1852;
  return `${nm.toFixed(1)} nm`;
}

export function flyoverHudValues(sample: FlyoverSample): { distance: string; altitude: string; time: string } {
  return {
    distance: formatFlyoverDistanceNm(sample.distanceM),
    altitude: formatVideoAltitude(sample.altM),
    time: formatFlyoverElapsed(sample.elapsedMs),
  };
}

export function flyoverFileName(data: FlightShareData): string {
  const date = (data.displayInfo.flightDateIso || "voo").replace(/[^\d-]/g, "").slice(0, 10) || "voo";
  const ident = (data.displayInfo.aircraft || "aeronave")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 16) || "aeronave";
  return `flyover-${date}-${ident}.mp4`;
}

export async function resolveFlyoverTrack(shareData: FlightShareData): Promise<
  { ok: true; track: FlyoverTrack } | { ok: false; error: string }
> {
  const existing = buildFlyoverTrack(
    shareData.points,
    shareData.telemetryKind === "fr24" ? "fr24" : "garmin",
  );
  if (existing) return { ok: true, track: existing };

  try {
    const fetched = await fetchFr24TrackPointsForFlight(shareData.flightId);
    if (!fetched.ok) {
      return { ok: false, error: fetched.error.message || "Não há trilha GPS neste voo." };
    }
    const track = buildFlyoverTrack(fetched.points, "fr24");
    if (!track) return { ok: false, error: "Não há trilha GPS neste voo." };
    return { ok: true, track };
  } catch (error) {
    return {
      ok: false,
      error: (error as Error).message || "Não há trilha GPS neste voo.",
    };
  }
}

export function trackWaypoints(track: FlyoverTrack): Array<{ lat: number; lng: number }> {
  return track.samples.map((s) => ({ lat: s.lat, lng: s.lon }));
}
