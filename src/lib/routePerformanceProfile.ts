import type { FlightPlanWaypoint } from "../types/flightPlanning";
import { haversineM } from "./flightPlanningRoute";

const NM_IN_M = 1852;

export type FlightPerformanceSettings = {
  cruiseSpeedKt: number;
  cruiseBurnPerHour: number;
  cruiseAltitudeFt: number;
  climbSpeedKt: number;
  climbRateFpm: number;
  climbBurnPerHour: number;
  descentSpeedKt: number;
  descentRateFpm: number;
  descentBurnPerHour: number;
};

export const DEFAULT_FLIGHT_PERFORMANCE: FlightPerformanceSettings = {
  cruiseSpeedKt: 90,
  cruiseBurnPerHour: 20,
  cruiseAltitudeFt: 3500,
  climbSpeedKt: 70,
  climbRateFpm: 500,
  climbBurnPerHour: 24,
  descentSpeedKt: 90,
  descentRateFpm: 500,
  descentBurnPerHour: 12,
};

export type ProfilePhasePoint = {
  xNm: number;
  altFt: number;
  kind: "origin" | "toc" | "tod" | "destination" | "waypoint" | "level";
  label?: string;
  /** Cumulative ETE from departure to this point (hours). */
  eteHours?: number;
};

export type RoutePhaseMarker = {
  xNm: number;
  altFt: number;
  lat: number;
  lng: number;
  label: string;
  eteHours?: number;
};

export type RoutePerformanceProfile = {
  totalDistanceNm: number;
  startAltFt: number;
  endAltFt: number;
  cruiseAltFt: number;
  climbNm: number;
  descentNm: number;
  cruiseNm: number;
  profile: ProfilePhasePoint[];
  phaseMarkers: RoutePhaseMarker[];
  toc: RoutePhaseMarker | null;
  tod: RoutePhaseMarker | null;
  eteHours: number | null;
  fuelEstimate: number | null;
  climbHours: number | null;
  cruiseHours: number | null;
  descentHours: number | null;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function altitudeChangeDistanceNm(
  deltaFt: number,
  rateFpm: number,
  speedKt: number,
): number {
  const dAlt = Math.abs(deltaFt);
  if (!(dAlt > 0) || !(rateFpm > 0) || !(speedKt > 0)) return 0;
  return (dAlt / (rateFpm * 60)) * speedKt;
}

export function altitudeChangeHours(deltaFt: number, rateFpm: number): number {
  const dAlt = Math.abs(deltaFt);
  if (!(dAlt > 0) || !(rateFpm > 0)) return 0;
  return dAlt / (rateFpm * 60);
}

export function pointAlongRoute(
  waypoints: FlightPlanWaypoint[],
  xNm: number,
): { lat: number; lng: number } | null {
  if (waypoints.length < 2) {
    return waypoints[0] ? { lat: waypoints[0].lat, lng: waypoints[0].lng } : null;
  }
  const targetM = Math.max(0, xNm) * NM_IN_M;
  let walked = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1]!;
    const b = waypoints[i]!;
    const seg = haversineM(a, b);
    if (walked + seg >= targetM || i === waypoints.length - 1) {
      const t = seg > 0 ? clamp((targetM - walked) / seg, 0, 1) : 0;
      return {
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
      };
    }
    walked += seg;
  }
  const last = waypoints[waypoints.length - 1]!;
  return { lat: last.lat, lng: last.lng };
}

function fieldElev(wp: FlightPlanWaypoint | undefined, fallback: number): number {
  if (wp?.fieldElevFt != null && Number.isFinite(wp.fieldElevFt)) return Math.round(wp.fieldElevFt);
  if (wp?.altitudeFt != null && Number.isFinite(wp.altitudeFt)) return Math.round(wp.altitudeFt);
  return Math.round(fallback);
}

function plannedAlt(wp: FlightPlanWaypoint | undefined, fallback: number, cruiseFallback: number): number {
  if (wp?.altitudeFt != null && Number.isFinite(wp.altitudeFt)) return Math.round(wp.altitudeFt);
  if (cruiseFallback > 0) return Math.round(cruiseFallback);
  return Math.round(fallback);
}

function altitudeRefMode(wp: FlightPlanWaypoint | undefined): "start" | "before" | "after" {
  const ref = (wp as { altitudeRef?: string } | undefined)?.altitudeRef;
  if (ref === "start" || ref === "after") return ref;
  // Default is "before" (B) when unset; legacy "arrive" = before.
  return "before";
}

function isAfter(wp: FlightPlanWaypoint | undefined): boolean {
  return altitudeRefMode(wp) === "after";
}

function isStart(wp: FlightPlanWaypoint | undefined): boolean {
  return altitudeRefMode(wp) === "start";
}

type BuildCtx = {
  waypoints: FlightPlanWaypoint[];
  perf: FlightPerformanceSettings;
  profile: ProfilePhasePoint[];
  markers: RoutePhaseMarker[];
  totals: { climbNm: number; descentNm: number; climbHours: number; descentHours: number; cruiseHours: number };
  eteHours: number;
};

function pushPoint(
  ctx: BuildCtx,
  xNm: number,
  altFt: number,
  kind: ProfilePhasePoint["kind"],
  label?: string,
) {
  const last = ctx.profile[ctx.profile.length - 1];
  if (last && Math.abs(last.xNm - xNm) < 1e-6 && Math.abs(last.altFt - altFt) < 0.5) {
    last.kind = kind;
    last.eteHours = ctx.eteHours;
    if (label) last.label = label;
    return;
  }
  ctx.profile.push({
    xNm,
    altFt: Math.round(altFt),
    kind,
    label,
    eteHours: ctx.eteHours,
  });
}

function addMarker(ctx: BuildCtx, xNm: number, altFt: number, label: string) {
  const pos = pointAlongRoute(ctx.waypoints, xNm);
  if (!pos) return;
  ctx.markers.push({
    xNm,
    altFt: Math.round(altFt),
    lat: pos.lat,
    lng: pos.lng,
    label,
    eteHours: ctx.eteHours,
  });
}

type ManeuverTiming = "immediate" | "arrive";

/**
 * Climb or descend from→to within [x0, x0+availNm].
 * - immediate: start change at x0 (After — logo após o ponto); then plateau
 * - arrive: for descent, plateau then TOD so new altitude is reached at the end (Before)
 */
function maneuverToAltitude(
  ctx: BuildCtx,
  fromAlt: number,
  toAlt: number,
  x0: number,
  availNm: number,
  timing: ManeuverTiming = "arrive",
): { x: number; alt: number; remainNm: number } {
  const { perf, totals } = ctx;
  const delta = toAlt - fromAlt;
  if (Math.abs(delta) < 1 || availNm <= 0) {
    return { x: x0, alt: fromAlt, remainNm: availNm };
  }

  if (delta > 0) {
    // Climb always starts immediately, then plateau.
    let needNm = altitudeChangeDistanceNm(delta, perf.climbRateFpm, perf.climbSpeedKt);
    let hours = altitudeChangeHours(delta, perf.climbRateFpm);
    let reachAlt = toAlt;
    if (needNm > availNm && availNm > 0) {
      const ratio = availNm / needNm;
      needNm = availNm;
      hours *= ratio;
      reachAlt = Math.round(fromAlt + delta * ratio);
    }
    const tocX = x0 + needNm;
    ctx.eteHours += hours;
    totals.climbNm += needNm;
    totals.climbHours += hours;
    pushPoint(ctx, tocX, reachAlt, "toc", "TOC");
    addMarker(ctx, tocX, reachAlt, "TOC");
    return { x: tocX, alt: reachAlt, remainNm: Math.max(0, availNm - needNm) };
  }

  let needNm = altitudeChangeDistanceNm(-delta, perf.descentRateFpm, perf.descentSpeedKt);
  let hours = altitudeChangeHours(-delta, perf.descentRateFpm);
  let endAlt = toAlt;
  if (needNm > availNm && availNm > 0) {
    const ratio = availNm / needNm;
    needNm = availNm;
    hours *= ratio;
    endAlt = Math.round(fromAlt + delta * ratio);
  }

  if (timing === "immediate") {
    // After: descend right away, then plateau at the new level.
    pushPoint(ctx, x0, fromAlt, "tod", "TOD");
    addMarker(ctx, x0, fromAlt, "TOD");
    ctx.eteHours += hours;
    totals.descentNm += needNm;
    totals.descentHours += hours;
    const levelX = x0 + needNm;
    pushPoint(ctx, levelX, endAlt, "level");
    return { x: levelX, alt: endAlt, remainNm: Math.max(0, availNm - needNm) };
  }

  // Before: plateau first, then TOD so we reach the new altitude at the end.
  const plateauNm = Math.max(0, availNm - needNm);
  const todX = x0 + plateauNm;
  if (plateauNm > 0) {
    const cruiseH = plateauNm / Math.max(perf.cruiseSpeedKt, 1e-6);
    ctx.eteHours += cruiseH;
    totals.cruiseHours += cruiseH;
  }
  pushPoint(ctx, todX, fromAlt, "tod", "TOD");
  addMarker(ctx, todX, fromAlt, "TOD");
  ctx.eteHours += hours;
  totals.descentNm += needNm;
  totals.descentHours += hours;
  const endX = x0 + availNm;
  pushPoint(ctx, endX, endAlt, "level");
  return { x: endX, alt: endAlt, remainNm: 0 };
}

function levelFor(ctx: BuildCtx, nm: number, alt: number, x: number, kind: ProfilePhasePoint["kind"], label?: string) {
  if (nm <= 0.001) return x;
  const h = nm / Math.max(ctx.perf.cruiseSpeedKt, 1e-6);
  ctx.eteHours += h;
  ctx.totals.cruiseHours += h;
  const xEnd = x + nm;
  pushPoint(ctx, xEnd, alt, kind, label);
  return xEnd;
}

/**
 * Multi-leg vertical profile with start/before/after altitude semantics.
 * - start (I): begin climb/descent at the start of the leg TO the waypoint
 * - before (B, default): change on the leg TO the waypoint so you pass already at altitude
 *   (descent is delayed to arrive at the new level at the point)
 * - after (A): keep prior level until the waypoint, then start climb/descent immediately after it
 */
export function buildRoutePerformanceProfile(
  waypoints: FlightPlanWaypoint[],
  perf: FlightPerformanceSettings,
): RoutePerformanceProfile | null {
  if (waypoints.length < 2) return null;

  const legDistancesNm: number[] = [];
  let totalDistanceNm = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const d = haversineM(waypoints[i - 1]!, waypoints[i]!) / NM_IN_M;
    legDistancesNm.push(d);
    totalDistanceNm += d;
  }
  if (!(totalDistanceNm > 0)) return null;

  const startAltFt = fieldElev(waypoints[0], 0);
  const endFieldFt = fieldElev(waypoints[waypoints.length - 1], startAltFt);
  const cruiseFallback = Math.round(perf.cruiseAltitudeFt) || 0;

  const ctx: BuildCtx = {
    waypoints,
    perf,
    profile: [],
    markers: [],
    totals: { climbNm: 0, descentNm: 0, climbHours: 0, descentHours: 0, cruiseHours: 0 },
    eteHours: 0,
  };

  let x = 0;
  let alt = startAltFt;
  let maxLevel = startAltFt;
  pushPoint(ctx, 0, alt, "origin", waypoints[0]?.label);

  for (let i = 1; i < waypoints.length; i++) {
    const legNm = legDistancesNm[i - 1]!;
    const fromWp = waypoints[i - 1]!;
    const toWp = waypoints[i]!;
    const isLast = i === waypoints.length - 1;
    const xLegEnd = x + legNm;
    let remain = legNm;

    // 1) If leaving a waypoint marked "after", start climb/descent immediately after it.
    if (i > 1 && isAfter(fromWp)) {
      const afterAlt = plannedAlt(fromWp, alt, cruiseFallback);
      if (Math.abs(afterAlt - alt) >= 1) {
        const man = maneuverToAltitude(ctx, alt, afterAlt, x, remain, "immediate");
        x = man.x;
        alt = man.alt;
        remain = Math.max(0, xLegEnd - x);
        maxLevel = Math.max(maxLevel, alt);
      }
    }

    // 2) Target altitude for arriving at `toWp`
    let arriveTarget: number;
    if (isLast) {
      arriveTarget = endFieldFt;
    } else if (isAfter(toWp)) {
      // Arrive still at current level; toWp.altitudeFt applies after leaving.
      arriveTarget = alt;
    } else {
      arriveTarget = plannedAlt(toWp, alt, cruiseFallback);
    }

    // On last leg, if planned alt (corridor/cruise) is above field elev, cruise then descend.
    if (isLast) {
      const legCruise = plannedAlt(toWp, alt, cruiseFallback);
      const cruiseTarget = Math.max(legCruise, endFieldFt);
      maxLevel = Math.max(maxLevel, cruiseTarget);

      if (arriveTarget < cruiseTarget) {
        let finalDescentNm = altitudeChangeDistanceNm(
        cruiseTarget - endFieldFt,
        perf.descentRateFpm,
        perf.descentSpeedKt,
      );
      finalDescentNm = Math.min(remain, finalDescentNm);
        let availBefore = Math.max(0, remain - finalDescentNm);

        if (Math.abs(cruiseTarget - alt) >= 1 && availBefore > 0) {
          const man = maneuverToAltitude(ctx, alt, cruiseTarget, x, availBefore);
          x = man.x;
          alt = man.alt;
          availBefore = Math.max(0, xLegEnd - finalDescentNm - x);
        }
        if (availBefore > 0.001) {
          x = levelFor(ctx, availBefore, alt, x, "level");
        } else {
          x = xLegEnd - finalDescentNm;
        }

        if (Math.abs(alt - endFieldFt) >= 1) {
          pushPoint(ctx, x, alt, "tod", "TOD");
          addMarker(ctx, x, alt, "TOD");
          const hours = altitudeChangeHours(alt - endFieldFt, perf.descentRateFpm);
          ctx.eteHours += hours;
          ctx.totals.descentHours += hours;
          ctx.totals.descentNm += Math.max(0, xLegEnd - x);
          x = xLegEnd;
          alt = endFieldFt;
          pushPoint(ctx, x, alt, "destination", toWp.label);
        } else {
          x = xLegEnd;
          alt = endFieldFt;
          pushPoint(ctx, x, alt, "destination", toWp.label);
        }
        continue;
      }
    }

    maxLevel = Math.max(maxLevel, arriveTarget);

    // 3) Change to arriveTarget within this leg
    // start (I): begin immediately at leg start; before (B): arrive at altitude at the point
    if (Math.abs(arriveTarget - alt) >= 1) {
      const timing = isStart(toWp) ? "immediate" : "arrive";
      const man = maneuverToAltitude(ctx, alt, arriveTarget, x, remain, timing);
      x = man.x;
      alt = man.alt;
      remain = Math.max(0, xLegEnd - x);
    }

    // 4) Plateau to the waypoint
    if (remain > 0.001) {
      x = levelFor(ctx, remain, alt, x, isLast ? "destination" : "level", toWp.label);
    } else {
      x = xLegEnd;
      const lastPt = ctx.profile[ctx.profile.length - 1];
      if (lastPt && Math.abs(lastPt.xNm - x) < 0.05) {
        lastPt.kind = isLast ? "destination" : lastPt.kind;
        lastPt.label = toWp.label;
        lastPt.eteHours = ctx.eteHours;
      } else {
        pushPoint(ctx, x, alt, isLast ? "destination" : "waypoint", toWp.label);
      }
    }
  }

  const lastWp = waypoints[waypoints.length - 1]!;
  const last = ctx.profile[ctx.profile.length - 1];
  if (!last || Math.abs(last.xNm - totalDistanceNm) > 0.001) {
    pushPoint(ctx, totalDistanceNm, endFieldFt, "destination", lastWp.label);
  } else {
    last.altFt = endFieldFt;
    last.kind = "destination";
    last.label = lastWp.label;
    last.eteHours = ctx.eteHours;
  }

  ctx.profile.sort((a, b) => a.xNm - b.xNm || a.altFt - b.altFt);

  const cruiseNm = Math.max(0, totalDistanceNm - ctx.totals.climbNm - ctx.totals.descentNm);
  const eteHours = ctx.eteHours;
  const fuelEstimate =
    ctx.totals.climbHours * Math.max(0, perf.climbBurnPerHour) +
    ctx.totals.cruiseHours * Math.max(0, perf.cruiseBurnPerHour) +
    ctx.totals.descentHours * Math.max(0, perf.descentBurnPerHour);

  const tocs = ctx.markers.filter((m) => m.label === "TOC");
  const tods = ctx.markers.filter((m) => m.label === "TOD");

  return {
    totalDistanceNm,
    startAltFt,
    endAltFt: endFieldFt,
    cruiseAltFt: maxLevel,
    climbNm: ctx.totals.climbNm,
    descentNm: ctx.totals.descentNm,
    cruiseNm,
    profile: ctx.profile,
    phaseMarkers: ctx.markers,
    toc: tocs[0] ?? null,
    tod: tods[tods.length - 1] ?? null,
    eteHours: eteHours > 0 ? eteHours : null,
    fuelEstimate: fuelEstimate > 0 ? fuelEstimate : null,
    climbHours: ctx.totals.climbHours > 0 ? ctx.totals.climbHours : null,
    cruiseHours: ctx.totals.cruiseHours > 0 ? ctx.totals.cruiseHours : null,
    descentHours: ctx.totals.descentHours > 0 ? ctx.totals.descentHours : null,
  };
}

export function altitudeAtDistanceNm(profile: ProfilePhasePoint[], xNm: number): number | null {
  if (!profile.length) return null;
  if (xNm <= profile[0]!.xNm) return profile[0]!.altFt;
  const last = profile[profile.length - 1]!;
  if (xNm >= last.xNm) return last.altFt;
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1]!;
    const b = profile[i]!;
    if (xNm > b.xNm) continue;
    if (b.xNm === a.xNm) return b.altFt;
    const t = (xNm - a.xNm) / (b.xNm - a.xNm);
    return Math.round(a.altFt + (b.altFt - a.altFt) * t);
  }
  return last.altFt;
}

/** Interpolate cumulative ETE (hours) along the performance profile. */
export function eteHoursAtDistanceNm(profile: ProfilePhasePoint[], xNm: number): number | null {
  if (!profile.length) return null;
  const withEte = profile.filter((p) => p.eteHours != null && Number.isFinite(p.eteHours));
  if (!withEte.length) return null;
  if (xNm <= withEte[0]!.xNm) return withEte[0]!.eteHours ?? 0;
  const last = withEte[withEte.length - 1]!;
  if (xNm >= last.xNm) return last.eteHours ?? null;
  for (let i = 1; i < withEte.length; i++) {
    const a = withEte[i - 1]!;
    const b = withEte[i]!;
    if (xNm > b.xNm) continue;
    if (b.xNm === a.xNm) return b.eteHours ?? a.eteHours ?? null;
    const t = (xNm - a.xNm) / (b.xNm - a.xNm);
    const ea = a.eteHours ?? 0;
    const eb = b.eteHours ?? ea;
    return ea + (eb - ea) * t;
  }
  return last.eteHours ?? null;
}
