import type { AltitudeRefMode, FlightPlanWaypoint } from "../types/flightPlanning";
import { haversineM } from "./flightPlanningRoute";

const NM_IN_M = 1852;

export type FlightPerformanceSettings = {
  cruiseSpeedKt: number;
  cruiseBurnPerHour: number;
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

function plannedAlt(wp: FlightPlanWaypoint | undefined, fallback: number): number {
  if (wp?.altitudeFt != null && Number.isFinite(wp.altitudeFt)) return Math.round(wp.altitudeFt);
  return Math.round(fallback);
}

function isAirportKind(wp: FlightPlanWaypoint | undefined): boolean {
  return wp?.kind === "airport" || wp?.kind === "origin" || wp?.kind === "destination";
}

/** AD intermediário (TGL) usa a elevação do campo no perfil, não o cruzeiro. */
function waypointProfileAlt(
  wp: FlightPlanWaypoint | undefined,
  fallback: number,
  asTgl: boolean,
): number {
  if (asTgl && isAirportKind(wp) && wp?.fieldElevFt != null && Number.isFinite(wp.fieldElevFt)) {
    return Math.round(wp.fieldElevFt);
  }
  return plannedAlt(wp, fallback);
}

export function altitudeRefMode(wp: FlightPlanWaypoint | undefined | null): AltitudeRefMode {
  const ref = String((wp as { altitudeRef?: string } | undefined)?.altitudeRef || "")
    .trim()
    .toLowerCase();
  if (ref === "as" || ref === "start" || ref === "i") return "as";
  if (ref === "be" || ref === "before" || ref === "arrive" || ref === "b") return "be";
  if (ref === "ae" || ref === "after" || ref === "a") return "ae";
  return "bs";
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
 * - immediate: start change at x0 (AS / AE)
 * - arrive: plateau then change so the new altitude is reached at the end (BS / BE)
 */
function maneuverToAltitude(
  ctx: BuildCtx,
  fromAlt: number,
  toAlt: number,
  x0: number,
  availNm: number,
  timing: ManeuverTiming = "arrive",
): { x: number; alt: number; remainNm: number; done: boolean } {
  const { perf, totals } = ctx;
  const delta = toAlt - fromAlt;
  if (Math.abs(delta) < 1) {
    return { x: x0, alt: fromAlt, remainNm: availNm, done: true };
  }
  if (availNm <= 0) {
    return { x: x0, alt: fromAlt, remainNm: 0, done: false };
  }

  const climb = delta > 0;
  const rate = climb ? perf.climbRateFpm : perf.descentRateFpm;
  const speed = climb ? perf.climbSpeedKt : perf.descentSpeedKt;
  const fullNm = altitudeChangeDistanceNm(Math.abs(delta), rate, speed);
  const fullHours = altitudeChangeHours(Math.abs(delta), rate);
  const changeNm = Math.min(fullNm, availNm);
  const ratio = fullNm > 0 ? changeNm / fullNm : 1;
  const hours = fullHours * ratio;
  const reachAlt = Math.round(fromAlt + delta * ratio);
  const done = Math.abs(reachAlt - toAlt) < 1;

  if (timing === "immediate") {
    if (!climb) {
      pushPoint(ctx, x0, fromAlt, "tod", "TOD");
      addMarker(ctx, x0, fromAlt, "TOD");
    }
    ctx.eteHours += hours;
    if (climb) {
      totals.climbNm += changeNm;
      totals.climbHours += hours;
    } else {
      totals.descentNm += changeNm;
      totals.descentHours += hours;
    }
    const levelX = x0 + changeNm;
    pushPoint(ctx, levelX, reachAlt, climb ? "toc" : "level", climb && done ? "TOC" : undefined);
    if (climb && done) addMarker(ctx, levelX, reachAlt, "TOC");
    return { x: levelX, alt: reachAlt, remainNm: Math.max(0, availNm - changeNm), done };
  }

  const plateauNm = Math.max(0, availNm - fullNm);
  if (plateauNm > 0) {
    const cruiseH = plateauNm / Math.max(perf.cruiseSpeedKt, 1e-6);
    ctx.eteHours += cruiseH;
    totals.cruiseHours += cruiseH;
  }
  const changeX = x0 + plateauNm;
  pushPoint(ctx, changeX, fromAlt, climb ? "level" : "tod", climb ? undefined : "TOD");
  if (!climb) addMarker(ctx, changeX, fromAlt, "TOD");
  ctx.eteHours += hours;
  if (climb) {
    totals.climbNm += changeNm;
    totals.climbHours += hours;
  } else {
    totals.descentNm += changeNm;
    totals.descentHours += hours;
  }
  const endX = changeX + changeNm;
  pushPoint(ctx, endX, reachAlt, climb ? "toc" : "level", climb && done ? "TOC" : undefined);
  if (climb && done) addMarker(ctx, endX, reachAlt, "TOC");
  return { x: endX, alt: reachAlt, remainNm: Math.max(0, availNm - (plateauNm + changeNm)), done };
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

function applyChange(
  ctx: BuildCtx,
  alt: number,
  target: number,
  x: number,
  xLegEnd: number,
  timing: ManeuverTiming,
): { x: number; alt: number; done: boolean } {
  if (Math.abs(target - alt) < 1) return { x, alt, done: true };
  const remain = Math.max(0, xLegEnd - x);
  const man = maneuverToAltitude(ctx, alt, target, x, remain, timing);
  return { x: man.x, alt: man.alt, done: man.done };
}

function closeLeg(
  ctx: BuildCtx,
  x: number,
  alt: number,
  xLegEnd: number,
  isLast: boolean,
  label: string | undefined,
): number {
  const remain = Math.max(0, xLegEnd - x);
  if (remain > 0.001) {
    return levelFor(ctx, remain, alt, x, isLast ? "destination" : "level", label);
  }
  const lastPt = ctx.profile[ctx.profile.length - 1];
  if (lastPt && Math.abs(lastPt.xNm - xLegEnd) < 0.05) {
    lastPt.kind = isLast ? "destination" : lastPt.kind;
    lastPt.label = label;
    lastPt.eteHours = ctx.eteHours;
  } else {
    pushPoint(ctx, xLegEnd, alt, isLast ? "destination" : "waypoint", label);
  }
  return xLegEnd;
}

/**
 * Perfil vertical BS / AS / BE / AE:
 * - BS (padrão): conclui a mudança no ponto anterior, antes de começar o segmento
 * - AS: começa a mudança logo após iniciar o segmento (legado I)
 * - BE: conclui a mudança no ponto final do segmento (legado B)
 * - AE: começa a mudança logo após passar o ponto (legado A)
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
  let pendingAlt: number | null = null;
  pushPoint(ctx, 0, alt, "origin", waypoints[0]?.label);

  const fly = (target: number, xLegEnd: number, timing: ManeuverTiming) => {
    const applied = applyChange(ctx, alt, target, x, xLegEnd, timing);
    x = applied.x;
    alt = applied.alt;
    maxLevel = Math.max(maxLevel, alt);
    pendingAlt = applied.done ? null : target;
    return applied.done;
  };

  for (let i = 1; i < waypoints.length; i++) {
    const fromWp = waypoints[i - 1]!;
    const toWp = waypoints[i]!;
    const nextWp = waypoints[i + 1];
    const isLast = i === waypoints.length - 1;
    const xLegEnd = x + legDistancesNm[i - 1]!;
    const fromMode = altitudeRefMode(fromWp);
    const toMode = altitudeRefMode(toWp);
    const nextMode = nextWp ? altitudeRefMode(nextWp) : null;
    const nextIsDest = i + 1 === waypoints.length - 1;
    const fromAlt = waypointProfileAlt(fromWp, alt, i > 1);
    const toAlt = waypointProfileAlt(toWp, alt, !isLast);
    const nextAlt = nextWp ? waypointProfileAlt(nextWp, alt, !nextIsDest) : toAlt;

    if (pendingAlt != null && Math.abs(alt - pendingAlt) >= 1) {
      fly(pendingAlt, xLegEnd, "immediate");
    } else {
      pendingAlt = null;
    }

    if (i > 1 && fromMode === "ae") {
      fly(fromAlt, xLegEnd, "immediate");
    }

    if (isLast) {
      const remain = Math.max(0, xLegEnd - x);
      const descentNm = altitudeChangeDistanceNm(
        Math.max(0, alt - endFieldFt),
        perf.descentRateFpm,
        perf.descentSpeedKt,
      );
      const levelNm = Math.max(0, remain - descentNm);
      if (levelNm > 0.001) {
        x = levelFor(ctx, levelNm, alt, x, "level");
      }
      if (Math.abs(alt - endFieldFt) >= 1) {
        fly(endFieldFt, xLegEnd, "immediate");
      }
      x = closeLeg(ctx, x, alt, xLegEnd, true, toWp.label);
      continue;
    }

    if (toMode === "as" || (toMode === "bs" && i === 1)) {
      fly(toAlt, xLegEnd, "immediate");
    } else if (toMode === "bs" && i > 1 && Math.abs(alt - toAlt) >= 1) {
      fly(toAlt, xLegEnd, "immediate");
    }

    const holdThroughPoint = toMode === "ae";
    if (toMode === "be") {
      fly(toAlt, xLegEnd, "arrive");
    } else if (
      nextMode === "bs" &&
      nextWp &&
      !nextIsDest &&
      !holdThroughPoint
    ) {
      fly(nextAlt, xLegEnd, "arrive");
    }

    x = closeLeg(ctx, x, alt, xLegEnd, false, toWp.label);
  }

  const lastWp = waypoints[waypoints.length - 1]!;
  const last = ctx.profile[ctx.profile.length - 1];
  if (!last || Math.abs(last.xNm - totalDistanceNm) > 0.001) {
    pushPoint(ctx, totalDistanceNm, alt, "destination", lastWp.label);
  } else {
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
    endAltFt: Math.round(alt),
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
