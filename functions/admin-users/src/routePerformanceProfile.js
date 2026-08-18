"use strict";

const { haversineM, NM_IN_M } = require("./reaCorridorRoute");

const DEFAULT_FLIGHT_PERFORMANCE = {
  cruiseSpeedKt: 90,
  cruiseBurnPerHour: 20,
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

function plannedAlt(wp, fallback) {
  if (wp?.altitudeFt != null && Number.isFinite(wp.altitudeFt)) return Math.round(wp.altitudeFt);
  return Math.round(fallback);
}

function altitudeRefMode(wp) {
  const ref = String(wp?.altitudeRef || "")
    .trim()
    .toLowerCase();
  if (ref === "as" || ref === "start" || ref === "i") return "as";
  if (ref === "be" || ref === "before" || ref === "arrive" || ref === "b") return "be";
  if (ref === "ae" || ref === "after" || ref === "a") return "ae";
  return "bs";
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

function levelFor(ctx, nm, alt, x, kind, label) {
  if (nm <= 0.001) return x;
  const h = nm / Math.max(ctx.perf.cruiseSpeedKt, 1e-6);
  ctx.eteHours += h;
  ctx.totals.cruiseHours += h;
  const xEnd = x + nm;
  pushPoint(ctx, xEnd, alt, kind, label);
  return xEnd;
}

function applyChange(ctx, alt, target, x, xLegEnd, timing) {
  if (Math.abs(target - alt) < 1) return { x, alt, done: true };
  const remain = Math.max(0, xLegEnd - x);
  const man = maneuverToAltitude(ctx, alt, target, x, remain, timing);
  return { x: man.x, alt: man.alt, done: man.done };
}

function closeLeg(ctx, x, alt, xLegEnd, isLast, label) {
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
  let pendingAlt = null;
  pushPoint(ctx, 0, alt, "origin", waypoints[0]?.label);

  const fly = (target, xLegEnd, timing) => {
    const applied = applyChange(ctx, alt, target, x, xLegEnd, timing);
    x = applied.x;
    alt = applied.alt;
    maxLevel = Math.max(maxLevel, alt);
    pendingAlt = applied.done ? null : target;
    return applied.done;
  };

  for (let i = 1; i < waypoints.length; i++) {
    const fromWp = waypoints[i - 1];
    const toWp = waypoints[i];
    const nextWp = waypoints[i + 1];
    const isLast = i === waypoints.length - 1;
    const xLegEnd = x + legDistancesNm[i - 1];
    const fromMode = altitudeRefMode(fromWp);
    const toMode = altitudeRefMode(toWp);
    const nextMode = nextWp ? altitudeRefMode(nextWp) : null;
    const fromAlt = plannedAlt(fromWp, alt);
    const toAlt = plannedAlt(toWp, alt);
    const nextAlt = nextWp ? plannedAlt(nextWp, alt) : toAlt;
    const nextIsDest = i + 1 === waypoints.length - 1;

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
        settings.descentRateFpm,
        settings.descentSpeedKt,
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
    } else if (nextMode === "bs" && nextWp && !nextIsDest && !holdThroughPoint) {
      fly(nextAlt, xLegEnd, "arrive");
    }

    x = closeLeg(ctx, x, alt, xLegEnd, false, toWp.label);
  }

  const lastWp = waypoints[waypoints.length - 1];
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
    ctx.totals.climbHours * Math.max(0, settings.climbBurnPerHour) +
    ctx.totals.cruiseHours * Math.max(0, settings.cruiseBurnPerHour) +
    ctx.totals.descentHours * Math.max(0, settings.descentBurnPerHour);

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

module.exports = {
  DEFAULT_FLIGHT_PERFORMANCE,
  buildRoutePerformanceProfile,
  altitudeChangeDistanceNm,
  altitudeChangeHours,
  altitudeRefMode,
};
