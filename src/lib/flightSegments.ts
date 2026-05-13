import type { ChartRow } from "./telemetryCharts";
import type {
  FlightEvent,
  FlightSegment,
  LandingMetrics,
  TakeoffMetrics,
} from "../types/flight";
import type { FlightPoint } from "../types/flight";

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

// ─── event detection ─────────────────────────────────────────────────────────

/** Index of ROTATION or null. */
function findRotation(data: ChartRow[], after: number): number | null {
  for (let i = Math.max(after + 3, 3); i < data.length; i++) {
    const gs = get(data[i]!, "gsKt");
    const pitch = get(data[i]!, "pitchDeg");
    const pitchPrev = get(data[i - 3]!, "pitchDeg");
    const agl = get(data[i]!, "heightAglFt");
    if (
      gs !== null && gs > 45 &&
      pitch !== null && pitch > 3 &&
      pitchPrev !== null && (pitch - pitchPrev) > 2 &&
      (agl === null || agl === 0)
    ) return i;
  }
  return null;
}

/** Index of LIFTOFF (after rotation). */
function findLiftoff(data: ChartRow[], afterIdx: number): number | null {
  for (let i = afterIdx; i < Math.min(afterIdx + 60, data.length); i++) {
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

/**
 * Index of TOUCHDOWN: first of a 3-consecutive-sample window where
 * AGL === 0 (exactly), GndSpd > 30 kt AND decelerating, VSpd stable
 * (|VSpd| < 200 fpm, |ΔVSpd| < 80 fpm).
 *
 * Requiring AGL === 0 (not null) + deceleration prevents false positives
 * during the takeoff climb (AGL reads 0 for ~30s after liftoff) and
 * during level cruise (VSpd ≈ 0 but GndSpd is constant, not decreasing).
 */
function findTouchdown(data: ChartRow[], after: number): number | null {
  const stable = (v: number, vp: number) =>
    Math.abs(v) < 200 && Math.abs(v - vp) < 80;

  for (let i = after + 1; i < data.length - 2; i++) {
    const agl  = get(data[i]!, "heightAglFt");
    const gs   = get(data[i]!, "gsKt");
    const gs1  = get(data[i + 1]!, "gsKt");

    // AGL must be exactly 0 (sensor on ground), not null (unknown) or > 0 (airborne)
    if (agl !== 0 || gs === null || gs < 30 || gs1 === null || gs1 >= gs) continue;

    const vsPrev = get(data[i - 1]!, "vertSpeedFpm");
    const vs0    = get(data[i]!, "vertSpeedFpm");
    const vs1    = get(data[i + 1]!, "vertSpeedFpm");
    const vs2    = get(data[i + 2]!, "vertSpeedFpm");
    if (vsPrev === null || vs0 === null || vs1 === null || vs2 === null) continue;

    if (stable(vs0, vsPrev) && stable(vs1, vs0) && stable(vs2, vs1)) return i;
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
  const agl100Idx = findAglAfter(100);
  const agl500Idx = findAglAfter(500);

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
  const agl100Idx = findAglAfter(100);
  const agl500Idx = findAglAfter(500);

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

export function detectFlightSegments(
  data: ChartRow[],
  chartTimeBaseMs: number | null,
  points: FlightPoint[],
): FlightSegment[] {
  if (data.length < 10 || chartTimeBaseMs === null) return [];

  const segments: FlightSegment[] = [];
  const ONE_SEC = data.length > 1 ? (data[1]!.x - data[0]!.x) : 1000;

  interface TakeoffGroup { rotIdx: number; liftIdx: number; ftIdx: number | null; }
  interface TouchdownGroup { tdIdx: number; }

  const takeoffs: TakeoffGroup[] = [];
  const touchdowns: TouchdownGroup[] = [];

  let searchFrom = 0;
  while (searchFrom < data.length) {
    const rotIdx = findRotation(data, searchFrom);
    if (rotIdx === null) break;

    const liftIdx = findLiftoff(data, rotIdx);
    if (liftIdx === null) { searchFrom = rotIdx + 1; continue; }

    const altAtLiftoff = get(data[liftIdx]!, "gpsAltFt") ?? 0;
    const ftIdx = find50ft(data, liftIdx, altAtLiftoff);

    takeoffs.push({ rotIdx, liftIdx, ftIdx });

    const tdIdx = findTouchdown(data, liftIdx + 1);
    if (tdIdx !== null) {
      touchdowns.push({ tdIdx });
      searchFrom = tdIdx + 5;
    } else {
      searchFrom = liftIdx + 1;
    }
  }

  let touchdownSearchFrom = 0;
  while (touchdownSearchFrom < data.length) {
    const tdIdx = findTouchdown(data, touchdownSearchFrom);
    if (tdIdx === null) break;
    if (!touchdowns.some((td) => td.tdIdx === tdIdx)) {
      touchdowns.push({ tdIdx });
    }
    touchdownSearchFrom = tdIdx + 5;
  }
  touchdowns.sort((a, b) => a.tdIdx - b.tdIdx);
  const uniqueTouchdowns: TouchdownGroup[] = [];
  touchdowns.forEach((td) => {
    const duplicate = uniqueTouchdowns.some(
      (seen) => Math.abs(data[td.tdIdx]!.x - data[seen.tdIdx]!.x) < 30_000,
    );
    if (!duplicate) {
      uniqueTouchdowns.push(td);
    }
  });
  touchdowns.length = 0;
  touchdowns.push(...uniqueTouchdowns);

  const usedTd = new Set<number>();
  // Takeoffs that are part of a TGL segment should not appear as standalone takeoffs.
  const consumedTakeoffs = new Set<number>();

  function pushLandingSegment(id: string, tdIdx: number) {
    const tdStartX = Math.max(0, data[tdIdx]!.x - 300 * ONE_SEC);
    const tdEndX = Math.min(data[data.length - 1]!.x, data[tdIdx]!.x + 30 * ONE_SEC);
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
    });
  }

  takeoffs.forEach((to, ti) => {
    // Find first unused touchdown after this liftoff
    const paired = touchdowns.find((td) => !usedTd.has(td.tdIdx) && td.tdIdx > to.liftIdx);
    if (paired) usedTd.add(paired.tdIdx);

    if (consumedTakeoffs.has(ti)) {
      if (paired) {
        pushLanding(ti);
      }
      return;
    }

    const nextTo = takeoffs[ti + 1];
    const climbAfterTouchdownIdx =
      paired !== undefined ? findAglClimbAfterTouchdown(data, paired.tdIdx) : null;
    const isTgl =
      paired !== undefined &&
      climbAfterTouchdownIdx !== null;

    if (isTgl && paired && climbAfterTouchdownIdx !== null) {
      const nextTglTakeoff =
        nextTo !== undefined &&
        nextTo.rotIdx > paired.tdIdx &&
        data[nextTo.rotIdx]!.x - data[paired.tdIdx]!.x <= 90_000
          ? nextTo
          : undefined;
      if (nextTglTakeoff !== undefined) {
        consumedTakeoffs.add(ti + 1);
      }

      const nextLiftIdx = nextTglTakeoff?.liftIdx ?? findLiftoff(data, paired.tdIdx);
      const nextAlt = nextLiftIdx !== null ? get(data[nextLiftIdx]!, "gpsAltFt") ?? 0 : 0;
      const nextFtIdx =
        nextLiftIdx !== null ? find50ft(data, nextLiftIdx, nextAlt) : climbAfterTouchdownIdx;
      const segmentEndIdx = nextLiftIdx ?? climbAfterTouchdownIdx;

      const startX = Math.max(0, data[paired.tdIdx]!.x - 300 * ONE_SEC);
      const endX = Math.min(data[data.length - 1]!.x, data[segmentEndIdx]!.x + 240 * ONE_SEC);

      const events: FlightEvent[] = [
        { type: "touchdown", xMs: data[paired.tdIdx]!.x, label: "Touchdown", color: COLORS.touchdown, rowIdx: paired.tdIdx },
        ...(nextTglTakeoff !== undefined
          ? [{ type: "rotation" as const, xMs: data[nextTglTakeoff.rotIdx]!.x, label: "Rotation", color: COLORS.rotation, rowIdx: nextTglTakeoff.rotIdx }]
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

      segments.push({
        id: `tgl-${ti}`,
        type: "tgl",
        label: `TGL ${formatTimeFromX(data[paired.tdIdx]!.x, chartTimeBaseMs)}`,
        startX,
        endX,
        events,
        takeoffMetrics:
          nextTglTakeoff !== undefined
            ? computeTakeoffMetrics(data, points, chartTimeBaseMs, nextTglTakeoff.rotIdx, nextTglTakeoff.liftIdx, nextTglTakeoff.ftIdx)
            : computeTglTakeoffMetrics(data, points, chartTimeBaseMs, paired.tdIdx, nextLiftIdx, climbAfterTouchdownIdx),
        landingMetrics: computeLandingMetrics(data, points, chartTimeBaseMs, paired.tdIdx),
      });

      pushTakeoff(ti, to);
    } else {
      pushTakeoff(ti, to);

      if (paired) {
        pushLanding(ti);
      }
    }

    function pushTakeoff(idx: number, takeoff: TakeoffGroup) {
      const startX = Math.max(0, data[takeoff.rotIdx]!.x - 30 * ONE_SEC);
      const endX = Math.min(data[data.length - 1]!.x, data[takeoff.rotIdx]!.x + 240 * ONE_SEC);

      segments.push({
        id: `takeoff-${idx}`,
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

    function pushLanding(idx: number) {
      if (!paired) return;
      pushLandingSegment(`landing-${idx}`, paired.tdIdx);
    }
  });

  touchdowns.forEach((td, idx) => {
    if (!usedTd.has(td.tdIdx)) {
      pushLandingSegment(`landing-extra-${idx}`, td.tdIdx);
    }
  });

  segments.sort((a, b) => a.startX - b.startX);
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
