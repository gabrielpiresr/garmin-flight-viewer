"use strict";

const { haversineM, NM_IN_M } = require("./reaCorridorRoute");

const DEFAULT_FLIGHT_PERFORMANCE = {
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

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function altitudeChangeDistanceNm(deltaFt, rateFpm, speedKt) {
  const dAlt = Math.abs(deltaFt);
  if (!(dAlt > 0) || !(rateFpm > 0) || !(speedKt > 0)) return 0;
  return (dAlt / (rateFpm * 60)) * speedKt;
}

function altitudeChangeHours(deltaFt, rateFpm) {
  const dAlt = Math.abs(deltaFt);
  if (!(dAlt > 0) || !(rateFpm > 0)) return 0;
  return dAlt / (rateFpm * 60);
}

function pointAlongRoute(waypoints, xNm) {
  if (waypoints.length < 2) {
    return waypoints[0] ? { lat: waypoints[0].lat, lng: waypoints[0].lng } : null;
  }
  const targetM = Math.max(0, xNm) * NM_IN_M;
  let walked = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1];
    const b = waypoints[i];
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
  const last = waypoints[waypoints.length - 1];
  return { lat: last.lat, lng: last.lng };
}

function fieldElev(wp, fallback) {
  if (wp?.fieldElevFt != null && Number.isFinite(wp.fieldElevFt)) return Math.round(wp.fieldElevFt);
  if (wp?.altitudeFt != null && Number.isFinite(wp.altitudeFt)) return Math.round(wp.altitudeFt);
  return Math.round(fallback);
}

function plannedAlt(wp, fallback, cruiseFallback) {
  if (wp?.altitudeFt != null && Number.isFinite(wp.altitudeFt)) return Math.round(wp.altitudeFt);
  if (cruiseFallback > 0) return Math.round(cruiseFallback);
  return Math.round(fallback);
}

function altitudeRefMode(wp) {
  const ref = wp?.altitudeRef;
  if (ref === "start" || ref === "after") return ref;
  return "before";
}

function isAfter(wp) {
  return altitudeRefMode(wp) === "after";
}

function isStart(wp) {
  return altitudeRefMode(wp) === "start";
}

function pushPoint(ctx, xNm, altFt, kind, label) {
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

function addMarker(ctx, xNm, altFt, label) {
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

function maneuverToAltitude(ctx, fromAlt, toAlt, x0, availNm, timing = "arrive") {
  const { perf, totals } = ctx;
  const delta = toAlt - fromAlt;
  if (Math.abs(delta) < 1 || availNm <= 0) {
    return { x: x0, alt: fromAlt, remainNm: availNm };
  }

  if (delta > 0) {
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
    pushPoint(ctx, x0, fromAlt, "tod", "TOD");
    addMarker(ctx, x0, fromAlt, "TOD");
    ctx.eteHours += hours;
    totals.descentNm += needNm;
    totals.descentHours += hours;
    const levelX = x0 + needNm;
    pushPoint(ctx, levelX, endAlt, "level");
    return { x: levelX, alt: endAlt, remainNm: Math.max(0, availNm - needNm) };
  }

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

function levelFor(ctx, nm, alt, x, kind, label) {
  if (nm <= 0.001) return x;
  const h = nm / Math.max(ctx.perf.cruiseSpeedKt, 1e-6);
  ctx.eteHours += h;
  ctx.totals.cruiseHours += h;
  const xEnd = x + nm;
  pushPoint(ctx, xEnd, alt, kind, label);
  return xEnd;
}

function buildRoutePerformanceProfile(waypoints, perf) {
  if (waypoints.length < 2) return null;

  const settings = { ...DEFAULT_FLIGHT_PERFORMANCE, ...(perf || {}) };
  const legDistancesNm = [];
  let totalDistanceNm = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const d = haversineM(waypoints[i - 1], waypoints[i]) / NM_IN_M;
    legDistancesNm.push(d);
    totalDistanceNm += d;
  }
  if (!(totalDistanceNm > 0)) return null;

  const startAltFt = fieldElev(waypoints[0], 0);
  const endFieldFt = fieldElev(waypoints[waypoints.length - 1], startAltFt);
  const cruiseFallback = Math.round(settings.cruiseAltitudeFt) || 0;

  const ctx = {
    waypoints,
    perf: settings,
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
    const legNm = legDistancesNm[i - 1];
    const fromWp = waypoints[i - 1];
    const toWp = waypoints[i];
    const isLast = i === waypoints.length - 1;
    const xLegEnd = x + legNm;
    let remain = legNm;

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

    let arriveTarget;
    if (isLast) {
      arriveTarget = endFieldFt;
    } else if (isAfter(toWp)) {
      arriveTarget = alt;
    } else {
      arriveTarget = plannedAlt(toWp, alt, cruiseFallback);
    }

    if (isLast) {
      const legCruise = plannedAlt(toWp, alt, cruiseFallback);
      const cruiseTarget = Math.max(legCruise, endFieldFt);
      maxLevel = Math.max(maxLevel, cruiseTarget);

      if (arriveTarget < cruiseTarget) {
        let finalDescentNm = altitudeChangeDistanceNm(
          cruiseTarget - endFieldFt,
          settings.descentRateFpm,
          settings.descentSpeedKt,
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
          const hours = altitudeChangeHours(alt - endFieldFt, settings.descentRateFpm);
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

    if (Math.abs(arriveTarget - alt) >= 1) {
      const timing = isStart(toWp) ? "immediate" : "arrive";
      const man = maneuverToAltitude(ctx, alt, arriveTarget, x, remain, timing);
      x = man.x;
      alt = man.alt;
      remain = Math.max(0, xLegEnd - x);
    }

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

  const lastWp = waypoints[waypoints.length - 1];
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
    ctx.totals.climbHours * Math.max(0, settings.climbBurnPerHour) +
    ctx.totals.cruiseHours * Math.max(0, settings.cruiseBurnPerHour) +
    ctx.totals.descentHours * Math.max(0, settings.descentBurnPerHour);

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

module.exports = {
  DEFAULT_FLIGHT_PERFORMANCE,
  buildRoutePerformanceProfile,
  altitudeChangeDistanceNm,
  altitudeChangeHours,
};
