import type { FlightPlanRouteTableRow, FlightPlanWaypoint } from "../types/flightPlanning";
import type { FlightPlanLeg } from "./flightPlanningRoute";
import {
  formatBearingDeg,
  formatEteClock,
  haversineM,
} from "./flightPlanningRoute";
import type { LegCorridorInfo } from "./legCorridor";
import {
  altitudeAtDistanceNm,
  eteHoursAtDistanceNm,
  type RoutePerformanceProfile,
} from "./routePerformanceProfile";

const NM_IN_M = 1852;

export type RouteTableViewRow =
  | {
      kind: "waypoint";
      key: string;
      wpIndex: number;
      wp: FlightPlanWaypoint;
      leg: FlightPlanLeg | null;
      corridor: LegCorridorInfo | null;
    }
  | {
      kind: "toc" | "tod";
      key: string;
      label: "TOC" | "TOD";
      lat: number;
      lng: number;
      altFt: number;
      xNm: number;
      bearing: string;
      distanceNm: number;
      cumulativeNm: number;
      eteHours: number | null;
      cumulativeEteHours: number | null;
      fuel: number | null;
      cumulativeFuel: number | null;
    };

function waypointCumNm(waypoints: FlightPlanWaypoint[], index: number): number {
  let cum = 0;
  for (let i = 1; i <= index && i < waypoints.length; i++) {
    cum += haversineM(waypoints[i - 1]!, waypoints[i]!) / NM_IN_M;
  }
  return cum;
}

function interpolateFuel(
  performance: RoutePerformanceProfile | null | undefined,
  xNm: number,
  burnPerHour: number | null,
): number | null {
  if (burnPerHour == null || !(burnPerHour > 0)) return null;
  const hours = performance?.profile?.length
    ? eteHoursAtDistanceNm(performance.profile, xNm)
    : null;
  if (hours == null || !Number.isFinite(hours)) {
    const cruise = performance?.eteHours;
    const totalDistanceNm = performance?.totalDistanceNm;
    if (cruise == null || totalDistanceNm == null || !(totalDistanceNm > 0)) return null;
    return (xNm / totalDistanceNm) * cruise * burnPerHour;
  }
  return hours * burnPerHour;
}

export function buildRouteTableViewRows(
  waypoints: FlightPlanWaypoint[],
  legs: FlightPlanLeg[],
  legCorridors: Array<LegCorridorInfo | null | undefined>,
  performance: RoutePerformanceProfile | null | undefined,
  burnPerHour: number | null = null,
): RouteTableViewRow[] {
  const rows: RouteTableViewRow[] = [];
  const markers = [...(performance?.phaseMarkers ?? [])]
    .filter((m) => m.label === "TOC" || m.label === "TOD")
    .sort((a, b) => a.xNm - b.xNm);
  let markerIdx = 0;

  const flushMarkersBefore = (limitNm: number, afterWpIndex: number) => {
    while (markerIdx < markers.length) {
      const m = markers[markerIdx]!;
      if (m.xNm >= limitNm - 1e-4) break;
      const prevCum = waypointCumNm(waypoints, afterWpIndex);
      if (m.xNm <= prevCum + 0.05) {
        markerIdx += 1;
        continue;
      }
      const prevWp = waypoints[afterWpIndex];
      const nextWp = waypoints[afterWpIndex + 1];
      const bearing =
        prevWp && nextWp ? formatBearingDeg(legs[afterWpIndex]?.bearingDeg ?? 0) : "—";
      const ete = m.eteHours ?? (performance?.profile ? eteHoursAtDistanceNm(performance.profile, m.xNm) : null);
      const fuel = interpolateFuel(performance, m.xNm, burnPerHour);
      rows.push({
        kind: m.label === "TOC" ? "toc" : "tod",
        key: `${m.label}-${m.xNm.toFixed(3)}-${markerIdx}`,
        label: m.label === "TOC" ? "TOC" : "TOD",
        lat: m.lat,
        lng: m.lng,
        altFt: m.altFt,
        xNm: m.xNm,
        bearing,
        distanceNm: Math.max(0, m.xNm - prevCum),
        cumulativeNm: m.xNm,
        eteHours: ete,
        cumulativeEteHours: ete,
        fuel,
        cumulativeFuel: fuel,
      });
      markerIdx += 1;
    }
  };

  for (let idx = 0; idx < waypoints.length; idx++) {
    const wp = waypoints[idx]!;
    const cum = waypointCumNm(waypoints, idx);
    if (idx > 0) flushMarkersBefore(cum, idx - 1);
    rows.push({
      kind: "waypoint",
      key: `wp-${idx}-${wp.lat}-${wp.lng}`,
      wpIndex: idx,
      wp,
      leg: idx > 0 ? legs[idx - 1] ?? null : null,
      corridor: idx > 0 ? legCorridors[idx] ?? null : null,
    });
  }
  if (waypoints.length >= 2) {
    flushMarkersBefore(waypointCumNm(waypoints, waypoints.length - 1) + 1e-3, waypoints.length - 2);
  }
  return rows;
}

export function buildFlightPlanRouteTableRows(input: {
  waypoints: FlightPlanWaypoint[];
  legs: FlightPlanLeg[];
  legCorridors: Array<LegCorridorInfo | null | undefined>;
  performance: RoutePerformanceProfile | null | undefined;
  waypointDisplayName: (wp: FlightPlanWaypoint) => string;
  fuelUnit: string;
  burnPerHour?: number | null;
}): FlightPlanRouteTableRow[] {
  const view = buildRouteTableViewRows(
    input.waypoints,
    input.legs,
    input.legCorridors,
    input.performance,
    input.burnPerHour ?? null,
  );
  let displayIndex = 0;
  return view.map((row) => {
    if (row.kind === "waypoint") {
      displayIndex += 1;
      const wp = row.wp;
      const leg = row.leg;
      const corridor = row.corridor;
      return {
        index: displayIndex,
        point: input.waypointDisplayName(wp),
        bearing: leg ? formatBearingDeg(leg.bearingDeg) : "—",
        altitude: wp.altitudeFt != null ? `${Math.round(wp.altitudeFt)} ft` : "—",
        corridor: corridor
          ? `${corridor.name} (${corridor.altMin ?? "—"}/${corridor.altMax ?? "—"})`
          : "—",
        distance: leg ? `${leg.distanceNm.toFixed(1)} nm` : "—",
        distanceAccum: leg ? `${leg.cumulativeDistanceNm.toFixed(1)} nm` : "—",
        ete: formatEteClock(leg?.eteHours ?? null),
        eteAccum: formatEteClock(leg?.cumulativeEteHours ?? null),
        fuel: leg?.fuelEstimate != null ? `${leg.fuelEstimate.toFixed(1)} ${input.fuelUnit}` : "—",
        fuelAccum:
          leg?.cumulativeFuel != null ? `${leg.cumulativeFuel.toFixed(1)} ${input.fuelUnit}` : "—",
        note: wp.note || "—",
      };
    }
    const altFromProfile =
      input.performance?.profile?.length != null
        ? altitudeAtDistanceNm(input.performance.profile, row.xNm)
        : row.altFt;
    return {
      index: 0,
      point: row.label,
      bearing: row.bearing,
      altitude: `${Math.round(altFromProfile ?? row.altFt)} ft`,
      corridor: "—",
      distance: `${row.distanceNm.toFixed(1)} nm`,
      distanceAccum: `${row.cumulativeNm.toFixed(1)} nm`,
      ete: formatEteClock(row.eteHours),
      eteAccum: formatEteClock(row.cumulativeEteHours),
      fuel: row.fuel != null ? `${row.fuel.toFixed(1)} ${input.fuelUnit}` : "—",
      fuelAccum: row.cumulativeFuel != null ? `${row.cumulativeFuel.toFixed(1)} ${input.fuelUnit}` : "—",
      note: row.label === "TOC" ? "Topo de subida" : "Topo de descida",
    };
  });
}
