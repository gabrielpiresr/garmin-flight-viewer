export type VideoTelemetryWidget =
  | "route"
  | "altitude"
  | "speed"
  | "heading"
  | "altitudeChart"
  | "speedChart";

export type VideoTelemetryPoint = {
  timeMs: number;
  lat: number;
  lon: number;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
};

export type VideoTelemetryPayload = {
  version?: number;
  points?: VideoTelemetryPoint[];
};

export function parseVideoTelemetryJson(value: string | null | undefined): VideoTelemetryPoint[] {
  if (!value?.trim()) return [];
  try {
    const parsed = JSON.parse(value) as VideoTelemetryPayload;
    return (parsed.points ?? [])
      .filter((point) => Number.isFinite(point.timeMs) && Number.isFinite(point.lat) && Number.isFinite(point.lon))
      .sort((a, b) => a.timeMs - b.timeMs);
  } catch {
    return [];
  }
}

export function parseAvailableWidgets(value: string | null | undefined): VideoTelemetryWidget[] {
  if (!value?.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isVideoTelemetryWidget);
  } catch {
    return [];
  }
}

export function isVideoTelemetryWidget(value: unknown): value is VideoTelemetryWidget {
  return (
    value === "route" ||
    value === "altitude" ||
    value === "speed" ||
    value === "heading" ||
    value === "altitudeChart" ||
    value === "speedChart"
  );
}

export function pointAtVideoTime(points: VideoTelemetryPoint[], currentTimeSec: number): VideoTelemetryPoint | null {
  if (points.length === 0) return null;
  const target = currentTimeSec * 1000;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (points[mid]!.timeMs <= target) lo = mid;
    else hi = mid - 1;
  }
  return points[lo] ?? null;
}

export function formatVideoSpeed(value: number | null): string {
  if (!Number.isFinite(value)) return "-";
  const kt = (value as number) * 1.94384;
  return `${Math.round(kt)} kt`;
}

export function formatVideoAltitude(value: number | null): string {
  if (!Number.isFinite(value)) return "-";
  return `${Math.round((value as number) * 3.28084).toLocaleString("pt-BR")} ft`;
}

export function formatVideoHeading(value: number | null): string {
  if (!Number.isFinite(value)) return "-";
  return `${Math.round(value as number)}°`;
}

export function speedMpsToKt(value: number | null): number | null {
  if (!Number.isFinite(value)) return null;
  return (value as number) * 1.94384;
}

export function altitudeMToFt(value: number | null): number | null {
  if (!Number.isFinite(value)) return null;
  return (value as number) * 3.28084;
}

export type AirspeedArcLimits = {
  whiteMin: number | null;
  whiteMax: number | null;
  greenMin: number | null;
  greenMax: number | null;
  yellowMin: number | null;
  yellowMax: number | null;
  vne: number | null;
};

/** Arredonda VS para degraus de 50 fpm (igual fita HUD). */
export function roundVerticalSpeedFpm(value: number | null): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.round((value as number) / 50) * 50;
}

export function formatVerticalSpeedFpm(value: number | null): string {
  const rounded = roundVerticalSpeedFpm(value);
  if (rounded == null) return "-";
  if (Math.abs(rounded) >= 1000) return `${(rounded / 1000).toFixed(1)}k`;
  return `${rounded}`;
}

const VS_MIN_WINDOW_MS = 5000;

/** Vertical speed in ft/min from altitude change over a wider time window (more stable). */
export function verticalSpeedFpmAtTime(points: VideoTelemetryPoint[], currentTimeSec: number): number | null {
  if (points.length < 2) return null;
  const targetMs = currentTimeSec * 1000;
  let idx = 0;
  while (idx < points.length - 1 && points[idx + 1]!.timeMs < targetMs) idx += 1;

  let lo = idx;
  let hi = idx;
  while (lo > 0 || hi < points.length - 1) {
    const span = points[hi]!.timeMs - points[lo]!.timeMs;
    if (span >= VS_MIN_WINDOW_MS) break;
    if (lo === 0 && hi === points.length - 1) break;
    if (lo > 0) lo -= 1;
    if (hi < points.length - 1) hi += 1;
  }

  const start = points[lo]!;
  const end = points[hi]!;
  const altStart = altitudeMToFt(start.altitude);
  const altEnd = altitudeMToFt(end.altitude);
  if (altStart == null || altEnd == null) return null;
  const dtMin = (end.timeMs - start.timeMs) / 60000;
  if (dtMin <= 0) return null;
  return (altEnd - altStart) / dtMin;
}
