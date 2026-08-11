import type { FlightPlanWaypoint } from "../types/flightPlanning";
import type { FlightPlanLeg } from "./flightPlanningRoute";
import type { RouteElevationPoint } from "./routeElevationDb";
import {
  altitudeAtDistanceNm,
  eteHoursAtDistanceNm,
  type ProfilePhasePoint,
} from "./routePerformanceProfile";

export type VerticalProfileChartPoint = {
  xNm: number;
  terrainFt: number | null;
  plannedFt: number | null;
  /** Planned altitude only at waypoint Xs (for triangle markers). */
  waypointFt: number | null;
  label?: string;
  eteHours?: number | null;
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export type WaypointDistanceMark = {
  xNm: number;
  label: string;
  altitudeFt: number | null;
};

/** Cumulative distance marks for each route waypoint (for X-axis ticks / reference lines). */
export function buildWaypointDistanceMarks(
  waypoints: FlightPlanWaypoint[],
  legs: FlightPlanLeg[],
): WaypointDistanceMark[] {
  if (waypoints.length === 0) return [];
  const marks: WaypointDistanceMark[] = [
    {
      xNm: 0,
      label: waypoints[0]?.label || "ORIG",
      altitudeFt:
        waypoints[0]?.altitudeFt != null && Number.isFinite(waypoints[0].altitudeFt)
          ? Math.round(waypoints[0].altitudeFt)
          : null,
    },
  ];
  for (const leg of legs) {
    marks.push({
      xNm: leg.cumulativeDistanceNm,
      label: leg.to.label || `WP${leg.toIndex + 1}`,
      altitudeFt:
        leg.to.altitudeFt != null && Number.isFinite(leg.to.altitudeFt)
          ? Math.round(leg.to.altitudeFt)
          : null,
    });
  }
  return marks;
}

export function buildTerrainSeries(
  terrain: RouteElevationPoint[],
  totalDistanceNm: number,
): Array<{ xNm: number; terrainFt: number | null }> {
  if (!Number.isFinite(totalDistanceNm) || totalDistanceNm <= 0) return [];
  return terrain.map((p) => ({
    xNm: Math.max(0, Math.min(1, p.distanceFraction)) * totalDistanceNm,
    terrainFt: p.elevFt != null && Number.isFinite(p.elevFt) ? Math.round(p.elevFt) : null,
  }));
}

function interpolateAt(
  series: Array<{ xNm: number; value: number | null }>,
  xNm: number,
): number | null {
  if (series.length === 0) return null;
  if (xNm <= series[0]!.xNm) return series[0]!.value;
  const last = series[series.length - 1]!;
  if (xNm >= last.xNm) return last.value;
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1]!;
    const b = series[i]!;
    if (xNm > b.xNm) continue;
    if (a.value == null || b.value == null) return a.value ?? b.value;
    if (b.xNm === a.xNm) return b.value;
    const t = (xNm - a.xNm) / (b.xNm - a.xNm);
    return Math.round(lerp(a.value, b.value, t));
  }
  return last.value;
}

/**
 * Merge terrain + climb/cruise/descent performance profile into a recharts series.
 */
export function buildVerticalProfileChartData(input: {
  waypoints: FlightPlanWaypoint[];
  legs: FlightPlanLeg[];
  terrain: RouteElevationPoint[];
  totalDistanceNm: number;
  performanceProfile?: ProfilePhasePoint[] | null;
}): VerticalProfileChartPoint[] {
  const { waypoints, legs, terrain, totalDistanceNm, performanceProfile } = input;
  if (!Number.isFinite(totalDistanceNm) || totalDistanceNm <= 0 || waypoints.length < 2) {
    return [];
  }

  const terrainSeries = buildTerrainSeries(terrain, totalDistanceNm);
  const marks = buildWaypointDistanceMarks(waypoints, legs);
  const markByX = new Map(marks.map((m) => [Number(m.xNm.toFixed(4)), m]));

  const plannedSeries: Array<{ xNm: number; value: number | null }> =
    performanceProfile && performanceProfile.length >= 2
      ? performanceProfile.map((p) => ({ xNm: p.xNm, value: p.altFt }))
      : marks.map((m) => ({
          xNm: m.xNm,
          value: m.altitudeFt,
        }));

  const terrainForInterp = terrainSeries.map((p) => ({ xNm: p.xNm, value: p.terrainFt }));

  const xSet = new Set<number>();
  for (const p of terrainSeries) xSet.add(Number(p.xNm.toFixed(4)));
  for (const p of plannedSeries) xSet.add(Number(p.xNm.toFixed(4)));
  for (const m of marks) xSet.add(Number(m.xNm.toFixed(4)));
  xSet.add(0);
  xSet.add(Number(totalDistanceNm.toFixed(4)));

  const xs = [...xSet].sort((a, b) => a - b);

  return xs.map((xNm) => {
    const key = Number(xNm.toFixed(4));
    const mark = markByX.get(key);
    const plannedFt =
      performanceProfile && performanceProfile.length >= 2
        ? altitudeAtDistanceNm(performanceProfile, xNm)
        : interpolateAt(plannedSeries, xNm);
    return {
      xNm,
      terrainFt: interpolateAt(terrainForInterp, xNm),
      plannedFt,
      waypointFt: mark ? plannedFt : null,
      label: mark?.label,
      eteHours:
        performanceProfile && performanceProfile.length >= 2
          ? eteHoursAtDistanceNm(performanceProfile, xNm)
          : null,
    };
  });
}

export type CorridorBand = {
  name: string;
  x0Nm: number;
  x1Nm: number;
  altMin: number;
  altMax: number;
};

/** Build corridor altitude bands along the route for the vertical profile. */
export function buildCorridorBands(
  legs: FlightPlanLeg[],
  corridors: Array<{ name: string; altMax: number | null; altMin: number | null } | null | undefined>,
): CorridorBand[] {
  const bands: CorridorBand[] = [];
  let prevCum = 0;
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i]!;
    const corridor = corridors[leg.toIndex] ?? corridors[i + 1] ?? null;
    const x0 = prevCum;
    const x1 = leg.cumulativeDistanceNm;
    prevCum = x1;
    if (!corridor) continue;
    let altMin = corridor.altMin;
    let altMax = corridor.altMax;
    if (altMin == null && altMax == null) continue;
    if (altMin == null && altMax != null) altMin = altMax;
    if (altMax == null && altMin != null) altMax = altMin;
    let lo = Math.round(altMin!);
    let hi = Math.round(altMax!);
    if (lo === hi) {
      lo -= 100;
      hi += 100;
    }
    if (lo > hi) {
      const t = lo;
      lo = hi;
      hi = t;
    }
    bands.push({
      name: corridor.name,
      x0Nm: x0,
      x1Nm: x1,
      altMin: lo,
      altMax: hi,
    });
  }
  return bands;
}
