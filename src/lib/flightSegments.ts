import type { ChartRow } from "./telemetryCharts";
import type {
  FlightEvent,
  FlightSegment,
  LandingMetrics,
  TakeoffMetrics,
} from "../types/flight";
import type { FlightPoint } from "../types/flight";
import { detectTrafficPattern } from "./trafficPattern";

// ─── helpers ─────────────────────────────────────────────────────────────────

function n(v: number | null | undefined): number | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  return v;
}

function get(row: ChartRow, key: string): number | null {
  return n(row[key] as number | null | undefined);
}

function haversineM(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Segment from points[] by epoch-ms window. */
function pointsInWindow(
  points: FlightPoint[],
  chartTimeBaseMs: number,
  startX: number,
  endX: number,
): FlightPoint[] {
  const t0 = chartTimeBaseMs + startX;
  const t1 = chartTimeBaseMs + endX;
  return points.filter((p) => p.t !== null && p.t >= t0 && p.t <= t1);
}

/** Cumulative GPS distance (ft) between two row indices via points[]. */
function distanceFtBetween(
  points: FlightPoint[],
  chartTimeBaseMs: number,
  xA: number,
  xB: number,
): number | null {
  const seg = pointsInWindow(points, chartTimeBaseMs, xA, xB);
  if (seg.length < 2) return null;
  let d = 0;
  for (let i = 1; i < seg.length; i++) {
    d += haversineM(seg[i - 1]!, seg[i]!);
  }
  return d * 3.28084; // m → ft
}

/** Normalise angle difference to [0, 180]. */
function angleDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

function estimateSampleIntervalMs(data: ChartRow[]): number {
  const diffs: number[] = [];
  for (let i = 1; i < data.length; i++) {
    const diff = data[i]!.x - data[i - 1]!.x;
    if (diff > 0 && diff <= 10_000) diffs.push(diff);
  }
  if (diffs.length === 0) return 1000;

  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)] ?? 1000;
}

function indexAtOrAfterX(data: ChartRow[], x: number): number {
  const idx = data.findIndex((row) => row.x >= x);
  return idx >= 0 ? idx : data.length - 1;
}

function smoothedGpsAltFt(data: ChartRow[], idx: number, radius = 3): number | null {
  let sum = 0;
  let count = 0;
  for (let i = Math.max(0, idx - radius); i <= Math.min(data.length - 1, idx + radius); i++) {
    const alt = get(data[i]!, "gpsAltFt");
    if (alt !== null) {
      sum += alt;
      count++;
    }
  }
  return count > 0 ? sum / count : null;
}

function smoothedAltExtreme(
  data: ChartRow[],
  startIdx: number,
  endIdx: number,
  mode: "min" | "max",
): { idx: number | null; value: number | null } {
  let bestIdx: number | null = null;
  let bestValue: number | null = null;
  const start = Math.max(0, startIdx);
  const end = Math.min(data.length - 1, endIdx);
  for (let i = start; i <= end; i++) {
    const alt = smoothedGpsAltFt(data, i);
    if (alt === null) continue;
    if (
      bestValue === null ||
      (mode === "min" ? alt < bestValue : alt > bestValue)
    ) {
      bestValue = alt;
      bestIdx = i;
    }
  }
  return { idx: bestIdx, value: bestValue };
}

function hasUnreliableAgl(data: ChartRow[]): boolean {
  const altitudes = data
    .map((row) => get(row, "gpsAltFt"))
    .filter((value): value is number => value !== null);
  if (altitudes.length < 60) return false;

  const minAlt = Math.min(...altitudes);
  let impossibleGroundRows = 0;
  let airborneRowsWithMissingAgl = 0;

  for (const row of data) {
    const alt = get(row, "gpsAltFt");
    const agl = get(row, "heightAglFt");
    const gs = get(row, "gsKt");
    if (alt === null || gs === null || gs < 45) continue;

    if (agl === 0 && alt > minAlt + 500) impossibleGroundRows++;
    if (agl === null && alt > minAlt + 500) airborneRowsWithMissingAgl++;
  }

  return impossibleGroundRows >= 5 || airborneRowsWithMissingAgl >= 30;
}

const MAX_TOUCHDOWN_AGL_FT = 600;
const MAX_TOUCHDOWN_RELATIVE_ALT_FT = 600;
const MAX_TOUCHDOWN_AGL_WITHOUT_ALT_FT = 1200;

interface TouchdownDetectionContext {
  fieldElevationFt: number | null;
}

function estimateFieldElevationFt(data: ChartRow[]): number | null {
  const altitudes = data
    .map((row) => get(row, "gpsAltFt"))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  if (altitudes.length === 0) return null;

  return altitudes[Math.floor(altitudes.length * 0.05)] ?? altitudes[0] ?? null;
}

function createTouchdownDetectionContext(data: ChartRow[]): TouchdownDetectionContext {
  return { fieldElevationFt: estimateFieldElevationFt(data) };
}

function isImplausiblyHighTouchdownCandidate(
  data: ChartRow[],
  idx: number,
  context: TouchdownDetectionContext | undefined,
): boolean {
  const agl = get(data[idx]!, "heightAglFt");
  if (agl === null || agl <= MAX_TOUCHDOWN_AGL_FT) return false;

  const alt = smoothedGpsAltFt(data, idx);
  const fieldElevationFt = context?.fieldElevationFt ?? null;
  if (alt === null || fieldElevationFt === null) return agl > MAX_TOUCHDOWN_AGL_WITHOUT_ALT_FT;

  return alt > fieldElevationFt + MAX_TOUCHDOWN_RELATIVE_ALT_FT;
}

// ─── event detection ─────────────────────────────────────────────────────────

/** Index of ROTATION or null. */
function findRotation(
  data: ChartRow[],
  after: number,
  options: { ignoreAgl?: boolean } = {},
): number | null {
  const { ignoreAgl = false } = options;
  for (let i = Math.max(after + 3, 3); i < data.length; i++) {
    const gs = get(data[i]!, "gsKt");
    const pitch = get(data[i]!, "pitchDeg");
    const pitchPrev = get(data[i - 3]!, "pitchDeg");
    const agl = get(data[i]!, "heightAglFt");
    if (
      gs !== null && gs > 45 &&
      pitch !== null && pitch > 3 &&
      pitchPrev !== null && (pitch - pitchPrev) > 2 &&
      (ignoreAgl || agl === null || agl === 0)
    ) return i;
  }
  return null;
}

/** Index of LIFTOFF (after rotation). */
function findLiftoff(data: ChartRow[], afterIdx: number, withinRows = 60): number | null {
  for (let i = afterIdx; i < Math.min(afterIdx + withinRows, data.length); i++) {
    const velU = get(data[i]!, "velUMps");
    const gs = get(data[i]!, "gsKt");
    if (velU !== null && velU > 1.0 && gs !== null && gs > 45) return i;
  }
  return null;
}

/** Index where gpsAltFt >= altAtLiftoff + 50. */
function find50ft(
  data: ChartRow[],
  liftoffIdx: number,
  altAtLiftoff: number,
): number | null {
  for (let i = liftoffIdx; i < Math.min(liftoffIdx + 300, data.length); i++) {
    const alt = get(data[i]!, "gpsAltFt");
    if (alt !== null && alt >= altAtLiftoff + 50) return i;
  }
  return null;
}

function findAltitudeGainAfter(data: ChartRow[], baseIdx: number, gainFt: number, withinRows = 900): number | null {
  const baseAlt = get(data[baseIdx]!, "gpsAltFt");
  if (baseAlt === null) return null;

  for (let i = baseIdx; i < Math.min(baseIdx + withinRows, data.length); i++) {
    const alt = get(data[i]!, "gpsAltFt");
    if (alt !== null && alt >= baseAlt + gainFt) return i;
  }

  return null;
}

function hasRecentAirborne(data: ChartRow[], idx: number): boolean {
  for (let i = Math.max(0, idx - 60); i < idx; i++) {
    const agl = get(data[i]!, "heightAglFt");
    if (agl !== null && agl > 50) return true;
  }
  return false;
}

function hasFutureAirborne(data: ChartRow[], idx: number, within = 90): boolean {
  for (let i = idx + 1; i <= Math.min(data.length - 1, idx + within); i++) {
    const agl = get(data[i]!, "heightAglFt");
    if (agl !== null && agl > 50) return true;
  }
  return false;
}

function findAirborneAfterLiftoff(data: ChartRow[], liftoffIdx: number, minAglFt = 50): number | null {
  for (let i = liftoffIdx + 1; i < Math.min(data.length, liftoffIdx + 180); i++) {
    const agl = get(data[i]!, "heightAglFt");
    if (agl !== null && agl > minAglFt) return i;
  }
  return null;
}

function slowsBelowGroundSpeed(data: ChartRow[], idx: number, thresholdKt: number, within = 60): boolean {
  for (let i = idx; i <= Math.min(data.length - 1, idx + within); i++) {
    const gs = get(data[i]!, "gsKt");
    if (gs !== null && gs < thresholdKt) return true;
  }
  return false;
}

function hasSustainedLowGroundSpeed(
  data: ChartRow[],
  idx: number,
  thresholdKt: number,
  within = 60,
  minRows = 10,
): boolean {
  let run = 0;
  for (let i = idx; i <= Math.min(data.length - 1, idx + within); i++) {
    const gs = get(data[i]!, "gsKt");
    run = gs !== null && gs < thresholdKt ? run + 1 : 0;
    if (run >= minRows) return true;
  }
  return false;
}

function hasGroundRollBeforeTakeoff(data: ChartRow[], rotIdx: number): boolean {
  for (let i = rotIdx; i >= Math.max(0, rotIdx - 90); i--) {
    const gs = get(data[i]!, "gsKt");
    if (gs !== null && gs < 25) return true;
  }
  return false;
}

const TOUCHDOWN_MIN_PLAUSIBLE_IAS_KT = 40;

function findIasBelowTouchdownFloor(data: ChartRow[], startIdx: number, endIdx: number): number | null {
  const start = Math.max(0, startIdx);
  const end = Math.min(data.length - 1, endIdx);
  let firstBelow: number | null = null;

  for (let i = start; i <= end; i++) {
    const ias = get(data[i]!, "iasKt");
    if (ias === null) continue;

    if (ias < TOUCHDOWN_MIN_PLAUSIBLE_IAS_KT && firstBelow === null) {
      firstBelow = i;
    }

    const prevIas = i > start ? get(data[i - 1]!, "iasKt") : null;
    if (
      ias < TOUCHDOWN_MIN_PLAUSIBLE_IAS_KT &&
      prevIas !== null &&
      prevIas >= TOUCHDOWN_MIN_PLAUSIBLE_IAS_KT
    ) {
      return i;
    }
  }

  return firstBelow;
}

function refineTouchdownCandidate(data: ChartRow[], idx: number): number {
  const fullStopRollout = hasSustainedLowGroundSpeed(data, idx, 25, 60);
  const touchAndGoRollout = hasFutureAirborne(data, idx, 90);
  const lateRollout = isLateRolloutSpeed(data, idx);
  if (!fullStopRollout && !touchAndGoRollout && !lateRollout) return idx;

  const referenceAlt =
    smoothedAltExtreme(data, idx - 10, idx + 10, "min").value ??
    smoothedGpsAltFt(data, idx);
  const speedValleyIdx = touchAndGoRollout ? localSpeedValleyIdx(data, idx) : null;
  const searchEnd =
    speedValleyIdx !== null && speedValleyIdx < idx
      ? Math.max(Math.max(0, idx - 45), speedValleyIdx - 1)
      : idx;
  let impactIdx: number | null = null;
  let impactG: number | null = null;

  for (let i = Math.max(0, idx - 45); i <= searchEnd; i++) {
    const candidateAlt = smoothedGpsAltFt(data, i);
    if (referenceAlt !== null && candidateAlt !== null && candidateAlt > referenceAlt + 150) continue;

    const gs = get(data[i]!, "gsKt");
    const ias = get(data[i]!, "iasKt");
    if (gs === null || gs < 35 || gs > 75) continue;
    if (ias !== null && (ias < 30 || ias > 85)) continue;

    const recentMinVs = minVerticalSpeed(data, i - 45, i);
    if (recentMinVs === null || recentMinVs > -250) continue;

    const normG = get(data[i]!, "normG");
    if (normG !== null && normG >= 1.1 && (impactG === null || normG >= impactG)) {
      impactG = normG;
      impactIdx = i;
    }
  }

  if (impactIdx !== null) return impactIdx;
  if (touchAndGoRollout && !fullStopRollout && !lateRollout) return idx;

  for (let i = Math.max(0, idx - 45); i <= searchEnd; i++) {
    const candidateAlt = smoothedGpsAltFt(data, i);
    if (referenceAlt !== null && candidateAlt !== null && candidateAlt > referenceAlt + 150) continue;

    const gs = get(data[i]!, "gsKt");
    const ias = get(data[i]!, "iasKt");
    const vs = get(data[i]!, "vertSpeedFpm");
    if (
      gs !== null &&
      gs >= 35 &&
      gs <= 60 &&
      (ias === null || (ias >= 30 && ias <= 70)) &&
      vs !== null &&
      Math.abs(vs) <= 150
    ) {
      return i;
    }
  }

  const currentIas = get(data[idx]!, "iasKt");
  if (currentIas !== null && currentIas < TOUCHDOWN_MIN_PLAUSIBLE_IAS_KT) {
    const floorIdx = findIasBelowTouchdownFloor(data, Math.max(0, idx - 60), searchEnd);
    if (floorIdx !== null) return floorIdx;
  }

  return idx;
}

function isPlausibleTouchdownSpeed(data: ChartRow[], idx: number): boolean {
  const gs = get(data[idx]!, "gsKt");
  const ias = get(data[idx]!, "iasKt");
  return (gs !== null && gs >= 35) || (ias !== null && ias >= 35);
}

function isLateRolloutSpeed(data: ChartRow[], idx: number): boolean {
  const gs = get(data[idx]!, "gsKt");
  const ias = get(data[idx]!, "iasKt");
  return (gs !== null && gs <= 25) || (ias !== null && ias <= 25);
}

function localSpeedValleyIdx(data: ChartRow[], idx: number, lookBehind = 30, lookAhead = 20): number | null {
  const gsMinIdx = minMetricIdx(data, idx - lookBehind, idx + lookAhead, "gsKt");
  const iasMinIdx = minMetricIdx(data, idx - lookBehind, idx + lookAhead, "iasKt");
  if (gsMinIdx === null) return iasMinIdx;
  if (iasMinIdx === null) return gsMinIdx;

  const gs = get(data[gsMinIdx]!, "gsKt") ?? Number.POSITIVE_INFINITY;
  const ias = get(data[iasMinIdx]!, "iasKt") ?? Number.POSITIVE_INFINITY;
  return gs <= ias ? gsMinIdx : iasMinIdx;
}

function findTglRotationAfterTouchdown(data: ChartRow[], tdIdx: number, fallbackRotIdx?: number): number | null {
  const speedValleyIdx = localSpeedValleyIdx(data, tdIdx, 0, 45);
  const startIdx = Math.max(tdIdx + 1, (speedValleyIdx ?? tdIdx) + 1);
  const endIdx = Math.min(data.length - 1, tdIdx + 90);

  for (let i = startIdx; i <= endIdx; i++) {
    const gs = get(data[i]!, "gsKt");
    const previousGs = averageMetric(data, i - 5, i - 1, "gsKt");
    const velU = get(data[i]!, "velUMps");
    const vs = get(data[i]!, "vertSpeedFpm");
    const pitch = get(data[i]!, "pitchDeg");
    const alt = smoothedGpsAltFt(data, i);
    const previousAlt = smoothedGpsAltFt(data, i - 3);

    if (
      gs !== null &&
      gs > 45 &&
      previousGs !== null &&
      gs >= previousGs + 1.5 &&
      pitch !== null &&
      pitch > 3 &&
      ((velU !== null && velU > 0.5) || (vs !== null && vs > 100)) &&
      (alt === null || previousAlt === null || alt >= previousAlt)
    ) {
      return i;
    }
  }

  if (fallbackRotIdx !== undefined && fallbackRotIdx >= startIdx) return fallbackRotIdx;
  return null;
}

function minVerticalSpeed(data: ChartRow[], startIdx: number, endIdx: number): number | null {
  let min: number | null = null;
  for (let i = Math.max(0, startIdx); i <= Math.min(data.length - 1, endIdx); i++) {
    const vs = get(data[i]!, "vertSpeedFpm");
    if (vs !== null) min = min === null ? vs : Math.min(min, vs);
  }
  return min;
}

function averageMetric(data: ChartRow[], startIdx: number, endIdx: number, key: string): number | null {
  let sum = 0;
  let count = 0;
  for (let i = Math.max(0, startIdx); i <= Math.min(data.length - 1, endIdx); i++) {
    const value = get(data[i]!, key);
    if (value !== null) {
      sum += value;
      count++;
    }
  }
  return count > 0 ? sum / count : null;
}

function minMetric(data: ChartRow[], startIdx: number, endIdx: number, key: string): number | null {
  let min: number | null = null;
  for (let i = Math.max(0, startIdx); i <= Math.min(data.length - 1, endIdx); i++) {
    const value = get(data[i]!, key);
    if (value !== null) min = min === null ? value : Math.min(min, value);
  }
  return min;
}

function maxMetric(data: ChartRow[], startIdx: number, endIdx: number, key: string): number | null {
  let max: number | null = null;
  for (let i = Math.max(0, startIdx); i <= Math.min(data.length - 1, endIdx); i++) {
    const value = get(data[i]!, key);
    if (value !== null) max = max === null ? value : Math.max(max, value);
  }
  return max;
}

function minMetricIdx(data: ChartRow[], startIdx: number, endIdx: number, key: string): number | null {
  let bestIdx: number | null = null;
  let min: number | null = null;
  for (let i = Math.max(0, startIdx); i <= Math.min(data.length - 1, endIdx); i++) {
    const value = get(data[i]!, key);
    if (value !== null && (min === null || value < min)) {
      min = value;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function hasTouchdownSpeedSignature(
  data: ChartRow[],
  idx: number,
  mode: "tgl" | "landing",
): boolean {
  const preGs = averageMetric(data, idx - 30, idx - 10, "gsKt");
  const touchdownGs = averageMetric(data, idx - 3, idx + 3, "gsKt");
  const postGs = averageMetric(data, idx + 5, idx + 25, "gsKt");
  const preIas = averageMetric(data, idx - 30, idx - 10, "iasKt");
  const touchdownIas = averageMetric(data, idx - 3, idx + 3, "iasKt");
  const postIas = averageMetric(data, idx + 5, idx + 25, "iasKt");
  const minGs = minMetric(data, idx - 20, idx + 20, "gsKt");
  const minIas = minMetric(data, idx - 20, idx + 20, "iasKt");
  const rolloutStop = slowsBelowGroundSpeed(data, idx, 10, 180);

  const touchdownSpeed =
    (touchdownGs !== null && touchdownGs <= 70) ||
    (touchdownIas !== null && touchdownIas <= 70) ||
    (minGs !== null && minGs <= 62) ||
    (minIas !== null && minIas <= 62) ||
    rolloutStop;

  const decelerated =
    (preGs !== null && touchdownGs !== null && preGs - touchdownGs >= 5) ||
    (preIas !== null && touchdownIas !== null && preIas - touchdownIas >= 5) ||
    rolloutStop;

  if (!touchdownSpeed || !decelerated) return false;
  if (mode === "landing") return rolloutStop || slowsBelowGroundSpeed(data, idx, 25, 120);

  const recovered =
    (postGs !== null && touchdownGs !== null && postGs - touchdownGs >= 4) ||
    (postIas !== null && touchdownIas !== null && postIas - touchdownIas >= 4);
  return recovered;
}

function hasAltitudeValleyTouchdownSignature(data: ChartRow[], idx: number): boolean {
  const preGs = averageMetric(data, idx - 30, idx - 10, "gsKt");
  const touchdownGs = averageMetric(data, idx - 3, idx + 3, "gsKt");
  const preIas = averageMetric(data, idx - 30, idx - 10, "iasKt");
  const touchdownIas = averageMetric(data, idx - 3, idx + 3, "iasKt");
  const gs = get(data[idx]!, "gsKt");
  const ias = get(data[idx]!, "iasKt");
  const recentMinVs = minVerticalSpeed(data, idx - 45, idx);
  const localMinGs = minMetric(data, idx - 20, idx + 20, "gsKt");
  const localMinIas = minMetric(data, idx - 20, idx + 20, "iasKt");

  const touchdownSpeed =
    (gs !== null && gs <= 75) ||
    (ias !== null && ias <= 75) ||
    (touchdownGs !== null && touchdownGs <= 70) ||
    (touchdownIas !== null && touchdownIas <= 70);
  const approachDecel =
    (preGs !== null && touchdownGs !== null && preGs - touchdownGs >= 5) ||
    (preIas !== null && touchdownIas !== null && preIas - touchdownIas >= 5);
  const localSpeedDip =
    (localMinGs !== null && localMinGs <= 62) ||
    (localMinIas !== null && localMinIas <= 62);
  const recentDescent = recentMinVs !== null && recentMinVs <= -250;

  return touchdownSpeed && (approachDecel || localSpeedDip) && recentDescent;
}

function findAltitudeClimbAfterTouchdown(
  data: ChartRow[],
  touchdownIdx: number,
  withinMs = 150_000,
  minGainFt = 120,
): number | null {
  const touchdownX = data[touchdownIdx]?.x;
  const touchdownAlt = smoothedGpsAltFt(data, touchdownIdx);
  if (touchdownX === undefined || touchdownAlt === null) return null;

  for (let i = touchdownIdx + 1; i < data.length; i++) {
    if (data[i]!.x - touchdownX > withinMs) break;

    const alt = smoothedGpsAltFt(data, i);
    const velU = get(data[i]!, "velUMps");
    const vs = get(data[i]!, "vertSpeedFpm");
    if (
      alt !== null &&
      alt >= touchdownAlt + minGainFt &&
      ((velU !== null && velU > 0.8) || (vs !== null && vs > 150))
    ) {
      return i;
    }
  }

  return null;
}

function isAltitudeValleyTouchdown(
  data: ChartRow[],
  idx: number,
  context?: TouchdownDetectionContext,
): boolean {
  if (idx < 30 || idx + 5 >= data.length) return false;
  if (isImplausiblyHighTouchdownCandidate(data, idx, context)) return false;

  const alt = smoothedGpsAltFt(data, idx);
  const gs = get(data[idx]!, "gsKt");
  if (alt === null || gs === null || gs < 20) return false;

  const localMin = smoothedAltExtreme(data, idx - 15, idx + 15, "min");
  if (localMin.idx !== idx) return false;

  const previousHigh = smoothedAltExtreme(data, idx - 180, idx - 20, "max");
  if (previousHigh.value === null) return false;

  const futureHigh = smoothedAltExtreme(data, idx + 20, idx + 180, "max");
  const descentFt = previousHigh.value - alt;
  const climbFt = futureHigh.value !== null ? futureHigh.value - alt : 0;
  const rolloutStop = slowsBelowGroundSpeed(data, idx, 10, 180);
  const speedSignature = hasTouchdownSpeedSignature(data, idx, rolloutStop ? "landing" : "tgl");
  const altitudeValleySignature = hasAltitudeValleyTouchdownSignature(data, idx);

  if (descentFt < 250) return false;
  if (!rolloutStop && climbFt < 100) return false;
  if (!speedSignature && !altitudeValleySignature) return false;

  const recentMinVs = minVerticalSpeed(data, idx - 45, idx);
  const touchdownLikeSpeed =
    gs >= 35 ||
    rolloutStop ||
    (recentMinVs !== null && recentMinVs < -250);

  return touchdownLikeSpeed;
}

function collectAltitudeTouchdowns(
  data: ChartRow[],
  context?: TouchdownDetectionContext,
): number[] {
  const candidates: number[] = [];

  for (let i = 30; i < data.length - 5; i++) {
    if (isAltitudeValleyTouchdown(data, i, context)) candidates.push(i);
  }

  candidates.sort((a, b) => a - b);

  const deduped: number[] = [];
  for (const idx of candidates) {
    const previousIdx = deduped[deduped.length - 1];
    if (previousIdx === undefined || data[idx]!.x - data[previousIdx]!.x >= TOUCHDOWN_DEDUPE_MS) {
      deduped.push(idx);
      continue;
    }

    const previousAlt = smoothedGpsAltFt(data, previousIdx) ?? Number.POSITIVE_INFINITY;
    const currentAlt = smoothedGpsAltFt(data, idx) ?? Number.POSITIVE_INFINITY;
    if (currentAlt < previousAlt) {
      deduped[deduped.length - 1] = idx;
    }
  }

  return deduped;
}

function isStableRolloutTouchdown(data: ChartRow[], idx: number): boolean {
  if (idx < 1 || idx + 2 >= data.length) return false;

  const stable = (v: number, vp: number) =>
    Math.abs(v) < 200 && Math.abs(v - vp) < 80;

  const agl = get(data[idx]!, "heightAglFt");
  const gs = get(data[idx]!, "gsKt");
  const gs1 = get(data[idx + 1]!, "gsKt");

  // AGL must be exactly 0 (sensor on ground), not null (unknown) or > 0 (airborne)
  if (agl !== 0 || gs === null || gs < 30 || gs1 === null || gs1 >= gs) return false;

  const vsPrev = get(data[idx - 1]!, "vertSpeedFpm");
  const vs0 = get(data[idx]!, "vertSpeedFpm");
  const vs1 = get(data[idx + 1]!, "vertSpeedFpm");
  const vs2 = get(data[idx + 2]!, "vertSpeedFpm");
  if (vsPrev === null || vs0 === null || vs1 === null || vs2 === null) return false;

  return stable(vs0, vsPrev) && stable(vs1, vs0) && stable(vs2, vs1);
}

function isTouchAndGoRecoveryTouchdown(data: ChartRow[], idx: number): boolean {
  if (idx < 3 || idx + 3 >= data.length) return false;

  const agl = get(data[idx]!, "heightAglFt");
  const gs = get(data[idx]!, "gsKt");
  const gsBefore = get(data[idx - 3]!, "gsKt");
  const gsAfter = get(data[idx + 1]!, "gsKt");
  const vs = get(data[idx]!, "vertSpeedFpm");
  const vsAfter = get(data[idx + 3]!, "vertSpeedFpm");
  const impactG = get(data[idx + 1]!, "normG");
  const recentMinVs = minVerticalSpeed(data, idx - 20, idx);

  return (
    agl === 0 &&
    gs !== null &&
    gs >= 30 &&
    gsBefore !== null &&
    gsAfter !== null &&
    gsBefore - gsAfter >= 2 &&
    vs !== null &&
    vs <= -150 &&
    vsAfter !== null &&
    vsAfter > -100 &&
    recentMinVs !== null &&
    recentMinVs <= -250 &&
    hasRecentAirborne(data, idx) &&
    (impactG === null || impactG > 1.05)
  );
}

function isAglTransitionTouchdown(data: ChartRow[], idx: number): boolean {
  if (idx < 1 || idx + 2 >= data.length) return false;

  const agl = get(data[idx]!, "heightAglFt");
  const gs = get(data[idx]!, "gsKt");
  const gsNext = get(data[idx + 1]!, "gsKt");
  const aglIndicatesGround = agl === 0;
  const aglDroppedOut = agl === null;
  if ((!aglIndicatesGround && !aglDroppedOut) || gs === null || gsNext === null) return false;
  if (gs < 20 && !aglDroppedOut) return false;

  let previousAirborneIdx: number | null = null;
  for (let i = idx - 1; i >= Math.max(0, idx - 45); i--) {
    const previousAgl = get(data[i]!, "heightAglFt");
    if (previousAgl !== null && previousAgl > 50) {
      previousAirborneIdx = i;
      break;
    }
  }
  if (previousAirborneIdx === null) return false;

  const previousGs = get(data[previousAirborneIdx]!, "gsKt");
  const decelerating = previousGs !== null ? gs <= previousGs + 5 : true;
  const recentMinVs = minVerticalSpeed(data, idx - 45, idx);
  const recentDescent = recentMinVs !== null && recentMinVs <= -150;
  const futureAirborne = hasFutureAirborne(data, idx);
  const rollout = gsNext <= gs || !futureAirborne;
  const missingAglRollout = aglDroppedOut && !futureAirborne && (gs <= 25 || slowsBelowGroundSpeed(data, idx, 10));
  const missingAglFullStop =
    aglDroppedOut &&
    (gs <= 35 || slowsBelowGroundSpeed(data, idx, 25, 30)) &&
    hasSustainedLowGroundSpeed(data, idx, 25, 60);

  return recentDescent && decelerating && (aglIndicatesGround ? rollout : missingAglRollout || missingAglFullStop);
}

function isGpsFieldRolloutTouchdown(
  data: ChartRow[],
  idx: number,
  context: TouchdownDetectionContext | undefined,
): boolean {
  if (idx < 60 || idx + 30 >= data.length) return false;
  if (isImplausiblyHighTouchdownCandidate(data, idx, context)) return false;

  const fieldElevationFt = context?.fieldElevationFt ?? null;
  const alt = smoothedGpsAltFt(data, idx);
  const gs = get(data[idx]!, "gsKt");
  const ias = get(data[idx]!, "iasKt");
  if (fieldElevationFt === null || alt === null || gs === null) return false;
  if (alt > fieldElevationFt + 350) return false;
  if (gs < 25 || gs > 58) return false;
  if (ias !== null && ias > 65) return false;

  const previousHighFt = maxMetric(data, idx - 240, idx - 30, "gpsAltFt");
  const recentMinVs = minVerticalSpeed(data, idx - 180, idx);
  const lowSpeedRollout = hasSustainedLowGroundSpeed(data, idx, 25, 180, 8);
  if (previousHighFt === null || previousHighFt - alt < 300) return false;
  if (recentMinVs === null || recentMinVs > -250) return false;
  if (!lowSpeedRollout) return false;

  return true;
}

function refineGpsFieldRolloutTouchdown(
  data: ChartRow[],
  idx: number,
  context: TouchdownDetectionContext | undefined,
): number {
  const fieldElevationFt = context?.fieldElevationFt ?? null;
  if (fieldElevationFt === null) return idx;

  for (let i = Math.max(60, idx - 90); i <= idx; i++) {
    if (isImplausiblyHighTouchdownCandidate(data, i, context)) continue;

    const alt = smoothedGpsAltFt(data, i);
    const gs = get(data[i]!, "gsKt");
    const ias = get(data[i]!, "iasKt");
    if (alt === null || gs === null) continue;
    if (alt > fieldElevationFt + 350) continue;
    if (gs < 25 || gs > 58) continue;
    if (ias !== null && ias > 65) continue;

    const previousHighFt = maxMetric(data, i - 240, i - 30, "gpsAltFt");
    const recentMinVs = minVerticalSpeed(data, i - 180, i);
    if (previousHighFt === null || previousHighFt - alt < 300) continue;
    if (recentMinVs === null || recentMinVs > -250) continue;
    if (!hasSustainedLowGroundSpeed(data, i, 25, 180, 8)) continue;

    return i;
  }

  return idx;
}

function findGpsFieldRolloutTouchdownAfter(
  data: ChartRow[],
  idx: number,
  context: TouchdownDetectionContext | undefined,
  withinRows = 180,
): number | null {
  for (let i = idx; i <= Math.min(data.length - 1, idx + withinRows); i++) {
    if (isGpsFieldRolloutTouchdown(data, i, context)) {
      return refineGpsFieldRolloutTouchdown(data, i, context);
    }
  }

  return null;
}

/**
 * Index of TOUCHDOWN.
 *
 * Most landings are found once rollout is stable: AGL === 0, ground speed is
 * decreasing, and VSpd has settled. Touch-and-goes can leave the runway again
 * before VSpd becomes stable, so a second detector accepts the touchdown impact
 * pattern: recent descent, brief deceleration, and fast VSpd recovery.
 *
 * @param end  Optional upper bound (inclusive). Defaults to `data.length - 4`.
 */
export function findTouchdown(data: ChartRow[], after: number, end?: number): number | null {
  return findTouchdownWithOptions(data, after, {
    end,
    touchdownContext: createTouchdownDetectionContext(data),
  });
}

function findTouchdownWithOptions(
  data: ChartRow[],
  after: number,
  options: {
    end?: number;
    allowAltitudeTouchdown?: boolean;
    touchdownContext?: TouchdownDetectionContext;
  } = {},
): number | null {
  const { end, allowAltitudeTouchdown = true, touchdownContext } = options;
  const limit = end !== undefined ? Math.min(end, data.length - 4) : data.length - 4;
  const acceptableTouchdownIdx = (idx: number) =>
    !isImplausiblyHighTouchdownCandidate(data, idx, touchdownContext);

  for (let i = after + 1; i <= limit; i++) {
    if (!acceptableTouchdownIdx(i)) continue;

    if (isStableRolloutTouchdown(data, i)) {
      const refinedIdx = refineTouchdownCandidate(data, i);
      const candidateIdx = refinedIdx > after ? refinedIdx : i;
      if (acceptableTouchdownIdx(candidateIdx)) return candidateIdx;
      continue;
    }

    if (isTouchAndGoRecoveryTouchdown(data, i)) {
      for (let j = i + 1; j <= Math.min(i + 10, limit); j++) {
        if (!acceptableTouchdownIdx(j)) continue;
        if (isStableRolloutTouchdown(data, j)) {
          const refinedIdx = refineTouchdownCandidate(data, j);
          const candidateIdx = refinedIdx > after ? refinedIdx : j;
          if (acceptableTouchdownIdx(candidateIdx)) return candidateIdx;
          continue;
        }
      }
      return i;
    }

    if (isAglTransitionTouchdown(data, i)) {
      const refinedIdx = refineTouchdownCandidate(data, i);
      const candidateIdx = refinedIdx > after ? refinedIdx : i;
      if (acceptableTouchdownIdx(candidateIdx)) return candidateIdx;
      continue;
    }

    if (allowAltitudeTouchdown && isAltitudeValleyTouchdown(data, i, touchdownContext)) {
      const refinedIdx = refineTouchdownCandidate(data, i);
      const candidateIdx = refinedIdx > after ? refinedIdx : i;
      if (acceptableTouchdownIdx(candidateIdx)) return candidateIdx;
    }
  }
  return null;
}

// ─── metrics ─────────────────────────────────────────────────────────────────

/** Index where AGL indicates a climb after touchdown. */
function findAglClimbAfterTouchdown(
  data: ChartRow[],
  touchdownIdx: number,
  withinMs = 90_000,
  minAglFt = 100,
): number | null {
  const touchdownX = data[touchdownIdx]?.x;
  if (touchdownX === undefined) return null;

  for (let i = touchdownIdx + 1; i < data.length; i++) {
    if (data[i]!.x - touchdownX > withinMs) break;

    const agl = get(data[i]!, "heightAglFt");
    if (agl !== null && agl > minAglFt) return i;
  }

  return null;
}

function computeTakeoffMetrics(
  data: ChartRow[],
  points: FlightPoint[],
  chartTimeBaseMs: number,
  rotIdx: number,
  liftIdx: number,
  ftIdx: number | null,
): TakeoffMetrics {
  const rot = data[rotIdx]!;
  const lift = data[liftIdx]!;

  // Ground roll: start of roll (first gsKt > 5 before rotation) → liftoff
  let rollStartIdx = rotIdx;
  for (let i = rotIdx; i >= Math.max(0, rotIdx - 120); i--) {
    const gs = get(data[i]!, "gsKt");
    if (gs !== null && gs < 10) { rollStartIdx = i + 1; break; }
  }
  const groundRollFt = distanceFtBetween(
    points, chartTimeBaseMs,
    data[rollStartIdx]!.x, data[liftIdx]!.x,
  );
  const groundRollDurationSec = (data[liftIdx]!.x - data[rollStartIdx]!.x) / 1000;

  const findAglAfter = (thresholdFt: number): number | null => {
    for (let i = liftIdx; i < Math.min(liftIdx + 900, data.length); i++) {
      const agl = get(data[i]!, "heightAglFt");
      if (agl !== null && agl >= thresholdFt) return i;
    }
    return null;
  };
  const liftoffAgl = get(lift, "heightAglFt");
  const useAglFromLiftoff = liftoffAgl === null || liftoffAgl <= 50;
  const agl100Idx = (useAglFromLiftoff ? findAglAfter(100) : null) ?? findAltitudeGainAfter(data, liftIdx, 100);
  const agl500Idx = (useAglFromLiftoff ? findAglAfter(500) : null) ?? findAltitudeGainAfter(data, liftIdx, 500);

  // Rotation pitch rate (deg/s — CSV is 1 Hz)
  const pitchNow = get(rot, "pitchDeg");
  const pitchPrev = get(data[rotIdx - 1]!, "pitchDeg");
  const rotationPitchRateDs =
    pitchNow !== null && pitchPrev !== null ? pitchNow - pitchPrev : null;

  // At 50ft metrics
  let at50DistFromRotFt: number | null = null;
  let at50IasKt: number | null = null;
  let at50PitchDeg: number | null = null;
  let at50VspdFpm: number | null = null;
  if (ftIdx !== null) {
    at50DistFromRotFt = distanceFtBetween(
      points, chartTimeBaseMs,
      data[rotIdx]!.x, data[ftIdx]!.x,
    );
    at50IasKt = get(data[ftIdx]!, "iasKt");
    at50PitchDeg = get(data[ftIdx]!, "pitchDeg");
    at50VspdFpm = get(data[ftIdx]!, "vertSpeedFpm");
  }

  return {
    groundRollFt,
    groundRollDurationSec,
    timeToAgl100Sec: agl100Idx !== null ? (data[agl100Idx]!.x - data[rollStartIdx]!.x) / 1000 : null,
    timeToAgl500Sec: agl500Idx !== null ? (data[agl500Idx]!.x - data[rollStartIdx]!.x) / 1000 : null,
    rotationIasKt: get(rot, "iasKt"),
    rotationPitchRateDs,
    liftoffIasKt: get(lift, "iasKt"),
    rpmAtLiftoff: get(lift, "rpm"),
    mapAtLiftoff: get(lift, "mapInHg"),
    fuelFlowAtLiftoff: get(lift, "fuelFlowGph"),
    at50DistFromRotFt,
    at50IasKt,
    at50PitchDeg,
    at50VspdFpm,
  };
}

function computeTglTakeoffMetrics(
  data: ChartRow[],
  points: FlightPoint[],
  chartTimeBaseMs: number,
  touchdownIdx: number,
  liftIdx: number | null,
  climbIdx: number,
): TakeoffMetrics {
  const liftoffRow = liftIdx !== null ? data[liftIdx]! : data[climbIdx]!;
  const altAtLiftoff = get(liftoffRow, "gpsAltFt") ?? get(data[touchdownIdx]!, "gpsAltFt") ?? 0;
  const ftIdx = liftIdx !== null ? find50ft(data, liftIdx, altAtLiftoff) ?? climbIdx : climbIdx;
  const rollEndIdx = liftIdx ?? climbIdx;

  const findAglAfter = (thresholdFt: number): number | null => {
    for (let i = touchdownIdx; i < Math.min(touchdownIdx + 900, data.length); i++) {
      const agl = get(data[i]!, "heightAglFt");
      if (agl !== null && agl >= thresholdFt) return i;
    }
    return null;
  };
  const touchdownAgl = get(data[touchdownIdx]!, "heightAglFt");
  const useAglFromTouchdown = touchdownAgl === null || touchdownAgl <= 50;
  const agl100Idx = (useAglFromTouchdown ? findAglAfter(100) : null) ?? findAltitudeGainAfter(data, touchdownIdx, 100);
  const agl500Idx = (useAglFromTouchdown ? findAglAfter(500) : null) ?? findAltitudeGainAfter(data, touchdownIdx, 500);

  return {
    groundRollFt: distanceFtBetween(
      points,
      chartTimeBaseMs,
      data[touchdownIdx]!.x,
      data[rollEndIdx]!.x,
    ),
    groundRollDurationSec: (data[rollEndIdx]!.x - data[touchdownIdx]!.x) / 1000,
    timeToAgl100Sec: agl100Idx !== null ? (data[agl100Idx]!.x - data[touchdownIdx]!.x) / 1000 : null,
    timeToAgl500Sec: agl500Idx !== null ? (data[agl500Idx]!.x - data[touchdownIdx]!.x) / 1000 : null,
    rotationIasKt: null,
    rotationPitchRateDs: null,
    liftoffIasKt: get(liftoffRow, "iasKt"),
    rpmAtLiftoff: get(liftoffRow, "rpm"),
    mapAtLiftoff: get(liftoffRow, "mapInHg"),
    fuelFlowAtLiftoff: get(liftoffRow, "fuelFlowGph"),
    at50DistFromRotFt: distanceFtBetween(
      points,
      chartTimeBaseMs,
      data[touchdownIdx]!.x,
      data[ftIdx]!.x,
    ),
    at50IasKt: get(data[ftIdx]!, "iasKt"),
    at50PitchDeg: get(data[ftIdx]!, "pitchDeg"),
    at50VspdFpm: get(data[ftIdx]!, "vertSpeedFpm"),
  };
}

function computeLandingMetrics(
  data: ChartRow[],
  points: FlightPoint[],
  chartTimeBaseMs: number,
  tdIdx: number,
): LandingMetrics {
  const td = data[tdIdx]!;

  // Final approach window: 60 s before touchdown
  const finalStart = Math.max(0, tdIdx - 60);
  const finalRows = data.slice(finalStart, tdIdx);

  // Descent path angle (degrees) — approach phase
  const vsArr = finalRows.map((r) => get(r, "vertSpeedFpm")).filter((v): v is number => v !== null && v < -50);
  const gsArr = finalRows.map((r) => get(r, "gsKt")).filter((v): v is number => v !== null && v > 20);
  let descentPathDeg: number | null = null;
  if (vsArr.length > 5 && gsArr.length > 5) {
    const meanVsFpm = vsArr.reduce((a, b) => a + b, 0) / vsArr.length;
    const meanGsKt = gsArr.reduce((a, b) => a + b, 0) / gsArr.length;
    const meanVsMs = meanVsFpm * 0.00508;   // ft/min → m/s
    const meanGsMs = meanGsKt * 0.514444;   // kt → m/s
    descentPathDeg = Math.abs((Math.atan2(Math.abs(meanVsMs), meanGsMs) * 180) / Math.PI);
  }

  const descentPathAltFt = get(data[finalStart]!, "gpsAltFt");

  const iasArr = finalRows.map((r) => get(r, "iasKt")).filter((v): v is number => v !== null);
  const rpmArr = finalRows.map((r) => get(r, "rpm")).filter((v): v is number => v !== null);

  const vsAll = finalRows.map((r) => get(r, "vertSpeedFpm")).filter((v): v is number => v !== null);
  const maxDescentRateFpm = vsAll.length ? Math.min(...vsAll) : null;

  // 50 ft point (search backward from touchdown)
  const tdAlt = get(td, "gpsAltFt");
  let ft50Idx: number | null = null;
  if (tdAlt !== null) {
    for (let i = tdIdx; i >= finalStart; i--) {
      const alt = get(data[i]!, "gpsAltFt");
      if (alt !== null && alt >= tdAlt + 50) { ft50Idx = i; break; }
    }
  }

  let at50IasKt: number | null = null;
  let at50PitchDeg: number | null = null;
  let flareDurationSec: number | null = null;
  let flareDistFt: number | null = null;
  if (ft50Idx !== null) {
    at50IasKt = get(data[ft50Idx]!, "iasKt");
    at50PitchDeg = get(data[ft50Idx]!, "pitchDeg");
    // flare = 50ft to touchdown (1 Hz CSV → index diff = seconds)
    flareDurationSec = tdIdx - ft50Idx;
    flareDistFt = distanceFtBetween(
      points, chartTimeBaseMs,
      data[ft50Idx]!.x, td.x,
    );
  }

  // Pitch oscillations during flare (direction changes)
  let pitchOscillations: number | null = null;
  if (ft50Idx !== null) {
    const flareRows = data.slice(ft50Idx, tdIdx + 1);
    let changes = 0;
    let prevDir = 0;
    for (let i = 1; i < flareRows.length; i++) {
      const p0 = get(flareRows[i - 1]!, "pitchDeg");
      const p1 = get(flareRows[i]!, "pitchDeg");
      if (p0 !== null && p1 !== null) {
        const dir = p1 > p0 ? 1 : p1 < p0 ? -1 : 0;
        if (dir !== 0 && prevDir !== 0 && dir !== prevDir) changes++;
        if (dir !== 0) prevDir = dir;
      }
    }
    pitchOscillations = changes;
  }

  // Touchdown metrics
  const tdIasKt = get(td, "iasKt");
  const tdGsKt = get(td, "gsKt");
  const tdVertSpeedFpm = get(td, "vertSpeedFpm");
  const tdPitchDeg = get(td, "pitchDeg");
  const normG = get(td, "normG");
  const tdImpactG = normG;
  let tdImpactLabel: 'Low' | 'Medium' | 'High' | null = null;
  if ((tdImpactG !== null && tdImpactG > 1.6) || (tdVertSpeedFpm !== null && tdVertSpeedFpm < -400)) {
    tdImpactLabel = 'High';
  } else if ((tdImpactG !== null && tdImpactG > 1.3) || (tdVertSpeedFpm !== null && tdVertSpeedFpm < -200)) {
    tdImpactLabel = 'Medium';
  } else if (tdImpactG !== null || tdVertSpeedFpm !== null) {
    tdImpactLabel = 'Low';
  }

  const hdg = get(td, "hdgMag");
  const trk = get(td, "trackDeg");
  const tdCrabAngleDeg = hdg !== null && trk !== null ? angleDiff(hdg, trk) : null;

  // LDA: touchdown to rollout stop (gsKt < 5)
  let ldaFt: number | null = null;
  let stopIdx: number | null = null;
  for (let i = tdIdx; i < Math.min(tdIdx + 180, data.length); i++) {
    const gs = get(data[i]!, "gsKt");
    if (gs !== null && gs < 5) { stopIdx = i; break; }
  }
  if (stopIdx !== null) {
    ldaFt = distanceFtBetween(points, chartTimeBaseMs, td.x, data[stopIdx]!.x);
  }

  // Max braking G: max deceleration in kt/s (÷ 19.62 to get G's — 1 G ≈ 19.62 kt/s)
  let maxBrakingG: number | null = null;
  const endRoll = stopIdx ?? Math.min(tdIdx + 60, data.length - 1);
  for (let i = tdIdx + 1; i <= endRoll; i++) {
    const gs0 = get(data[i - 1]!, "gsKt");
    const gs1 = get(data[i]!, "gsKt");
    if (gs0 !== null && gs1 !== null) {
      const decelG = (gs0 - gs1) / 19.62;  // 1 Hz CSV → Δt = 1 s
      if (decelG > 0 && (maxBrakingG === null || decelG > maxBrakingG)) {
        maxBrakingG = decelG;
      }
    }
  }

  return {
    descentPathDeg,
    descentPathAltFt,
    iasMinKt: iasArr.length ? Math.min(...iasArr) : null,
    iasMaxKt: iasArr.length ? Math.max(...iasArr) : null,
    maxDescentRateFpm,
    rpmMin: rpmArr.length ? Math.min(...rpmArr) : null,
    rpmMax: rpmArr.length ? Math.max(...rpmArr) : null,
    at50IasKt,
    at50PitchDeg,
    flareDurationSec,
    flareDistFt,
    pitchOscillations,
    tdIasKt,
    tdGsKt,
    tdVertSpeedFpm,
    tdPitchDeg,
    tdImpactG,
    tdImpactLabel,
    tdCrabAngleDeg,
    ldaFt,
    maxBrakingG: maxBrakingG !== null ? Math.round(maxBrakingG * 100) / 100 : null,
  };
}

// ─── main export ─────────────────────────────────────────────────────────────

const COLORS: Record<string, string> = {
  rotation: "#fbbf24",
  liftoff: "#22d3ee",
  "50ft": "#34d399",
  touchdown: "#f87171",
};

const TOUCHDOWN_DEDUPE_MS = 75_000;
const TGL_TAKEOFF_WINDOW_MS = 90_000;
const TGL_TOUCHDOWN_OVERLAP_PRE_MS = 45_000;
const TGL_TOUCHDOWN_OVERLAP_LIFT_TOLERANCE_MS = 5_000;

interface TakeoffGroup { rotIdx: number; liftIdx: number; ftIdx: number | null; }
interface TouchdownGroup { tdIdx: number; }

function normalizeAircraftIdent(value: string | null | undefined): string {
  return String(value ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function hasAglSamples(data: ChartRow[]): boolean {
  return data.some((row) => get(row, "heightAglFt") !== null);
}

function isKnownReliableAglAircraft(aircraftIdent: string | null | undefined): boolean {
  const normalized = normalizeAircraftIdent(aircraftIdent);
  return Boolean(normalized && normalized !== "PSDZA");
}

function isKnownUnreliableAglAircraft(aircraftIdent: string | null | undefined): boolean {
  return normalizeAircraftIdent(aircraftIdent) === "PSDZA";
}

function chooseTouchdownRepresentative(
  data: ChartRow[],
  takeoffs: TakeoffGroup[],
  a: TouchdownGroup,
  b: TouchdownGroup,
): TouchdownGroup {
  const takeoffBetweenCandidates = takeoffs.some(
    (takeoff) =>
      takeoff.rotIdx > a.tdIdx &&
      takeoff.rotIdx < b.tdIdx &&
      data[takeoff.rotIdx]!.x - data[a.tdIdx]!.x <= TGL_TAKEOFF_WINDOW_MS,
  );
  if (takeoffBetweenCandidates) return a;

  if (isPlausibleTouchdownSpeed(data, a.tdIdx) && isLateRolloutSpeed(data, b.tdIdx)) return a;

  const aGs = get(data[a.tdIdx]!, "gsKt");
  const bGs = get(data[b.tdIdx]!, "gsKt");
  if (aGs !== null && bGs !== null && bGs <= aGs - 5) return b;
  if (aGs === null && bGs !== null) return b;
  return a;
}

function segmentPrimaryX(segment: FlightSegment): number {
  const primary =
    segment.type === "takeoff"
      ? segment.events.find((event) => event.type === "rotation") ?? segment.events.find((event) => event.type === "liftoff")
      : segment.events.find((event) => event.type === "touchdown");
  return primary?.xMs ?? segment.startX;
}

function isTakeoffPartOfTglTouchdown(data: ChartRow[], tdIdx: number, takeoff: TakeoffGroup): boolean {
  const tdX = data[tdIdx]!.x;
  const rotDelta = data[takeoff.rotIdx]!.x - tdX;
  const liftDelta = data[takeoff.liftIdx]!.x - tdX;

  if (rotDelta > 0 && rotDelta <= TGL_TAKEOFF_WINDOW_MS) return true;

  return (
    rotDelta >= -TGL_TOUCHDOWN_OVERLAP_PRE_MS &&
    liftDelta >= -TGL_TOUCHDOWN_OVERLAP_LIFT_TOLERANCE_MS &&
    liftDelta <= TGL_TAKEOFF_WINDOW_MS
  );
}

export function detectFlightSegments(
  data: ChartRow[],
  chartTimeBaseMs: number | null,
  points: FlightPoint[],
  options: { aircraftIdent?: string | null } = {},
): FlightSegment[] {
  if (data.length < 10 || chartTimeBaseMs === null) return [];

  const segments: FlightSegment[] = [];
  const SAMPLE_MS = estimateSampleIntervalMs(data);
  const aircraftIdent = options.aircraftIdent ?? null;
  const reliableAglAircraft = isKnownReliableAglAircraft(aircraftIdent);
  const knownUnreliableAglAircraft = isKnownUnreliableAglAircraft(aircraftIdent);
  const aglAvailable = hasAglSamples(data);
  const aglIsUnreliable = knownUnreliableAglAircraft || (reliableAglAircraft ? false : hasUnreliableAgl(data));
  const allowAltitudeFallback = knownUnreliableAglAircraft || (!reliableAglAircraft && (aglIsUnreliable || !aglAvailable));
  const requireAglForTgl = reliableAglAircraft && aglAvailable;
  const touchdownContext = createTouchdownDetectionContext(data);

  const takeoffs: TakeoffGroup[] = [];
  const touchdowns: TouchdownGroup[] = [];

  let searchFrom = 0;
  while (searchFrom < data.length) {
    const rotIdx = findRotation(data, searchFrom, { ignoreAgl: aglIsUnreliable });
    if (rotIdx === null) break;

    const liftIdx = findLiftoff(data, rotIdx);
    if (liftIdx === null) { searchFrom = rotIdx + 1; continue; }

    const altAtLiftoff = get(data[liftIdx]!, "gpsAltFt") ?? 0;
    const ftIdx = find50ft(data, liftIdx, altAtLiftoff);

    takeoffs.push({ rotIdx, liftIdx, ftIdx });

    const tdIdx = findTouchdownWithOptions(data, liftIdx + 1, {
      allowAltitudeTouchdown: allowAltitudeFallback,
      touchdownContext,
    });
    if (tdIdx !== null) {
      touchdowns.push({ tdIdx });
      searchFrom = tdIdx + 5;
    } else {
      searchFrom = Math.max(liftIdx + 1, findAirborneAfterLiftoff(data, liftIdx) ?? liftIdx + 1);
    }
  }

  let touchdownSearchFrom = 0;
  while (touchdownSearchFrom < data.length) {
    const tdIdx = findTouchdownWithOptions(data, touchdownSearchFrom, {
      allowAltitudeTouchdown: allowAltitudeFallback,
      touchdownContext,
    });
    if (tdIdx === null) break;
    if (!touchdowns.some((td) => td.tdIdx === tdIdx)) {
      touchdowns.push({ tdIdx });
    }
    touchdownSearchFrom = tdIdx + 5;
  }
  if (allowAltitudeFallback) {
    for (const tdIdx of collectAltitudeTouchdowns(data, touchdownContext)) {
      const refinedTdIdx = refineTouchdownCandidate(data, tdIdx);
      if (
        !isImplausiblyHighTouchdownCandidate(data, refinedTdIdx, touchdownContext) &&
        !touchdowns.some((td) => td.tdIdx === refinedTdIdx)
      ) {
        touchdowns.push({ tdIdx: refinedTdIdx });
      }
    }
  }

  const lastTakeoffLiftIdx = takeoffs.reduce<number | null>(
    (latest, takeoff) => latest === null || takeoff.liftIdx > latest ? takeoff.liftIdx : latest,
    null,
  );
  if (
    lastTakeoffLiftIdx !== null &&
    !touchdowns.some((td) => td.tdIdx > lastTakeoffLiftIdx)
  ) {
    const finalLandingIdx = findGpsFieldRolloutTouchdownAfter(
      data,
      lastTakeoffLiftIdx,
      touchdownContext,
      data.length - lastTakeoffLiftIdx - 1,
    );
    if (
      finalLandingIdx !== null &&
      !touchdowns.some((td) => Math.abs(data[td.tdIdx]!.x - data[finalLandingIdx]!.x) < TOUCHDOWN_DEDUPE_MS)
    ) {
      touchdowns.push({ tdIdx: finalLandingIdx });
    }
  }

  touchdowns.sort((a, b) => a.tdIdx - b.tdIdx);
  const uniqueTouchdowns: TouchdownGroup[] = [];
  touchdowns.forEach((td) => {
    const duplicateIndex = uniqueTouchdowns.findIndex(
      (seen) => Math.abs(data[td.tdIdx]!.x - data[seen.tdIdx]!.x) < TOUCHDOWN_DEDUPE_MS,
    );
    if (duplicateIndex < 0) {
      uniqueTouchdowns.push(td);
    } else {
      uniqueTouchdowns[duplicateIndex] = chooseTouchdownRepresentative(
        data,
        takeoffs,
        uniqueTouchdowns[duplicateIndex]!,
        td,
      );
    }
  });
  touchdowns.length = 0;
  touchdowns.push(...uniqueTouchdowns);

  // Takeoffs that are part of a TGL segment should not appear as standalone takeoffs.
  const tglTakeoffs = new Set<number>();

  function pushLandingSegment(id: string, tdIdx: number) {
    const tdStartX = Math.max(0, data[tdIdx]!.x - 300 * SAMPLE_MS);
    const tdEndX = Math.min(data[data.length - 1]!.x, data[tdIdx]!.x + 30 * SAMPLE_MS);
    const segStartIdx = indexAtOrAfterX(data, tdStartX);
    const trafficPattern = detectTrafficPattern(
      data,
      segStartIdx >= 0 ? segStartIdx : 0,
      tdIdx,
    ) ?? undefined;
    segments.push({
      id,
      type: "landing",
      label: `Pouso ${formatTimeFromX(data[tdIdx]!.x, chartTimeBaseMs!)}`,
      startX: tdStartX,
      endX: tdEndX,
      events: [
        { type: "touchdown", xMs: data[tdIdx]!.x, label: "Touchdown", color: COLORS.touchdown, rowIdx: tdIdx },
      ],
      landingMetrics: computeLandingMetrics(data, points, chartTimeBaseMs!, tdIdx),
      trafficPattern,
    });
  }

  function pushTakeoffSegment(id: string, takeoff: TakeoffGroup) {
    const startX = Math.max(0, data[takeoff.rotIdx]!.x - 30 * SAMPLE_MS);
    const endX = Math.min(data[data.length - 1]!.x, data[takeoff.rotIdx]!.x + 240 * SAMPLE_MS);

    segments.push({
      id,
      type: "takeoff",
      label: `Decolagem ${formatTimeFromX(data[takeoff.rotIdx]!.x, chartTimeBaseMs!)}`,
      startX,
      endX,
      events: [
        { type: "rotation", xMs: data[takeoff.rotIdx]!.x, label: "Rotation", color: COLORS.rotation, rowIdx: takeoff.rotIdx },
        { type: "liftoff",  xMs: data[takeoff.liftIdx]!.x, label: "Liftoff",  color: COLORS.liftoff,  rowIdx: takeoff.liftIdx },
        ...(takeoff.ftIdx !== null ? [{ type: "50ft" as const, xMs: data[takeoff.ftIdx]!.x, label: "50 ft", color: COLORS["50ft"], rowIdx: takeoff.ftIdx }] : []),
      ],
      takeoffMetrics: computeTakeoffMetrics(data, points, chartTimeBaseMs!, takeoff.rotIdx, takeoff.liftIdx, takeoff.ftIdx),
    });
  }

  function pushTglSegment(
    id: string,
    tdIdx: number,
    nextTglTakeoff: TakeoffGroup | undefined,
    climbAfterTouchdownIdx: number | null,
  ) {
    const tglRotationIdx = findTglRotationAfterTouchdown(data, tdIdx, nextTglTakeoff?.rotIdx);
    const detectedLiftIdx =
      tglRotationIdx !== null
        ? findLiftoff(data, tglRotationIdx, 120)
        : nextTglTakeoff?.liftIdx ?? findLiftoff(data, tdIdx, 120);
    const nextLiftIdx =
      detectedLiftIdx !== null && tglRotationIdx !== null && detectedLiftIdx < tglRotationIdx
        ? tglRotationIdx
        : detectedLiftIdx;
    const nextAlt =
      nextLiftIdx !== null
        ? get(data[nextLiftIdx]!, "gpsAltFt") ?? get(data[tdIdx]!, "gpsAltFt") ?? 0
        : get(data[tdIdx]!, "gpsAltFt") ?? 0;
    const altitude50Idx = nextLiftIdx !== null ? find50ft(data, nextLiftIdx, nextAlt) : null;
    const climbIdxAfterLift =
      nextLiftIdx !== null && climbAfterTouchdownIdx !== null && climbAfterTouchdownIdx >= nextLiftIdx
        ? climbAfterTouchdownIdx
        : null;
    const nextFtIdx = nextLiftIdx !== null ? altitude50Idx ?? climbIdxAfterLift : climbAfterTouchdownIdx;
    const segmentEndIdx = nextLiftIdx ?? climbAfterTouchdownIdx ?? tdIdx;

    const startX = Math.max(0, data[tdIdx]!.x - 300 * SAMPLE_MS);
    const endX = Math.min(data[data.length - 1]!.x, data[segmentEndIdx]!.x + 240 * SAMPLE_MS);

    const events: FlightEvent[] = [
      { type: "touchdown", xMs: data[tdIdx]!.x, label: "Touchdown", color: COLORS.touchdown, rowIdx: tdIdx },
      ...(tglRotationIdx !== null
        ? [{ type: "rotation" as const, xMs: data[tglRotationIdx]!.x, label: "Rotation", color: COLORS.rotation, rowIdx: tglRotationIdx }]
        : []),
      ...(nextLiftIdx !== null
        ? [{ type: "liftoff" as const, xMs: data[nextLiftIdx]!.x, label: "Liftoff", color: COLORS.liftoff, rowIdx: nextLiftIdx }]
        : []),
      ...(nextFtIdx !== null
        ? [{
            type: "50ft" as const,
            xMs: data[nextFtIdx]!.x,
            label: nextLiftIdx !== null ? "50 ft" : "AGL > 100 ft",
            color: COLORS["50ft"],
            rowIdx: nextFtIdx,
          }]
        : []),
    ];

    const tglSegStartIdx = indexAtOrAfterX(data, startX);
    const tglTrafficPattern = detectTrafficPattern(
      data,
      tglSegStartIdx >= 0 ? tglSegStartIdx : 0,
      tdIdx,
    ) ?? undefined;
    segments.push({
      id,
      type: "tgl",
      label: `TGL ${formatTimeFromX(data[tdIdx]!.x, chartTimeBaseMs!)}`,
      startX,
      endX,
      events,
      takeoffMetrics: computeTglTakeoffMetrics(data, points, chartTimeBaseMs!, tdIdx, nextLiftIdx, segmentEndIdx),
      landingMetrics: computeLandingMetrics(data, points, chartTimeBaseMs!, tdIdx),
      trafficPattern: tglTrafficPattern,
    });
  }

  touchdowns.forEach((td, idx) => {
    const nextTakeoffIdx = takeoffs.findIndex(
      (takeoff, takeoffIdx) =>
        !tglTakeoffs.has(takeoffIdx) &&
        takeoff.rotIdx > td.tdIdx &&
        data[takeoff.rotIdx]!.x - data[td.tdIdx]!.x <= TGL_TAKEOFF_WINDOW_MS,
    );
    const nextTglTakeoff = nextTakeoffIdx >= 0 ? takeoffs[nextTakeoffIdx] : undefined;
    const fallbackLiftIdx =
      nextTglTakeoff === undefined && !requireAglForTgl ? findLiftoff(data, td.tdIdx) : null;
    const climbAfterTouchdownIdx =
      (aglIsUnreliable ? null : findAglClimbAfterTouchdown(data, td.tdIdx)) ??
      (allowAltitudeFallback ? findAltitudeClimbAfterTouchdown(data, td.tdIdx) : null);
    const isTgl = nextTglTakeoff !== undefined || fallbackLiftIdx !== null || climbAfterTouchdownIdx !== null;

    if (isTgl) {
      takeoffs.forEach((takeoff, takeoffIdx) => {
        if (isTakeoffPartOfTglTouchdown(data, td.tdIdx, takeoff)) {
          tglTakeoffs.add(takeoffIdx);
        }
      });
      pushTglSegment(`tgl-${idx}`, td.tdIdx, nextTglTakeoff, climbAfterTouchdownIdx);
    } else {
      pushLandingSegment(`landing-${idx}`, td.tdIdx);
    }
  });

  takeoffs.forEach((takeoff, idx) => {
    if (!tglTakeoffs.has(idx) && (!aglIsUnreliable || hasGroundRollBeforeTakeoff(data, takeoff.rotIdx))) {
      pushTakeoffSegment(`takeoff-${idx}`, takeoff);
    }
  });

  segments.sort((a, b) => segmentPrimaryX(a) - segmentPrimaryX(b) || a.startX - b.startX);
  return segments;
}

function formatTimeFromX(xMs: number, baseMs: number): string {
  try {
    return new Date(baseMs + xMs).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
