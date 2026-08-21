import type { FlightPlanRouteSummary, FlightPlanWaypoint } from "../types/flightPlanning";
import { parseFieldElevationFt } from "./fieldElevation";

const NM_IN_M = 1852;
/** Mean Earth radius (m) — closer to common aviation GC calculators than 6371 km. */
const EARTH_RADIUS_M = 6_371_008.8;

/** Compact ICAO FPL / NexAtlas: 2306S04634W, 230600S0463400W, 2331.32S04504.93W */
const COMPACT_COORD =
  /^(\d{2})(\d{2})(?:(\d{2})|\.(\d{1,4}))?([NS])\/?(\d{3})(\d{2})(?:(\d{2})|\.(\d{1,4}))?([EW])$/i;


const SKIP_TOKENS = new Set([
  "DCT",
  "DIRECT",
  "IFR",
  "VFR",
  "Y",
  "Z",
  "N",
  "S",
  "E",
  "W",
]);

function dmsToDecimal(deg: number, min: number, sec: number, hemi: string): number {
  let value = deg + min / 60 + sec / 3600;
  const h = hemi.toUpperCase();
  if (h === "S" || h === "W") value = -value;
  return value;
}

export function parseCompactAviationCoord(token: string): { lat: number; lng: number } | null {
  const normalized = String(token || "")
    .trim()
    .toUpperCase()
    .replace(/,/g, ".");
  const match = normalized.match(COMPACT_COORD);
  if (!match) return null;
  const latDeg = Number(match[1]);
  const latMinWhole = Number(match[2]);
  const lngDeg = Number(match[6]);
  const lngMinWhole = Number(match[7]);
  if (![latDeg, latMinWhole, lngDeg, lngMinWhole].every(Number.isFinite)) return null;
  if (latDeg > 90 || lngDeg > 180 || latMinWhole >= 60 || lngMinWhole >= 60) return null;

  let latMin = latMinWhole;
  let latSec = 0;
  if (match[3] != null) {
    latSec = Number(match[3]);
    if (!Number.isFinite(latSec) || latSec >= 60) return null;
  } else if (match[4] != null) {
    const frac = Number(`0.${match[4]}`);
    if (!Number.isFinite(frac)) return null;
    latMin += frac;
  }

  let lngMin = lngMinWhole;
  let lngSec = 0;
  if (match[8] != null) {
    lngSec = Number(match[8]);
    if (!Number.isFinite(lngSec) || lngSec >= 60) return null;
  } else if (match[9] != null) {
    const frac = Number(`0.${match[9]}`);
    if (!Number.isFinite(frac)) return null;
    lngMin += frac;
  }

  return {
    lat: dmsToDecimal(latDeg, latMin, latSec, match[5]!),
    lng: dmsToDecimal(lngDeg, lngMin, lngSec, match[10]!),
  };
}


export function formatCoordLabel(lat: number, lng: number): string {
  const latH = lat >= 0 ? "N" : "S";
  const lngH = lng >= 0 ? "E" : "W";
  const absLat = Math.abs(lat);
  const absLng = Math.abs(lng);
  const latDeg = Math.floor(absLat);
  const latMin = Math.round((absLat - latDeg) * 60);
  const lngDeg = Math.floor(absLng);
  const lngMin = Math.round((absLng - lngDeg) * 60);
  return `${String(latDeg).padStart(2, "0")}${String(latMin).padStart(2, "0")}${latH}${String(lngDeg).padStart(3, "0")}${String(lngMin).padStart(2, "0")}${lngH}`;
}

export function haversineM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = EARTH_RADIUS_M;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function parseFplRouteText(raw: string): FlightPlanWaypoint[] {
  const text = String(raw || "")
    .replace(/\r\n/g, "\n")
    .replace(/[,\n\t]+/g, " ")
    .trim();
  if (!text) return [];

  const tokens = text.split(/\s+/).filter(Boolean);
  const waypoints: FlightPlanWaypoint[] = [];

  for (const token of tokens) {
    const upper = token.toUpperCase();
    if (SKIP_TOKENS.has(upper)) continue;
    if (/^[A-Z]{2,5}\d{1,4}[A-Z]?$/.test(upper) && !COMPACT_COORD.test(upper)) {
      continue;
    }
    if (/^[A-Z]{4}$/.test(upper) && !COMPACT_COORD.test(upper)) {
      continue;
    }
    const parsed = parseCompactAviationCoord(upper);
    if (!parsed) continue;
    waypoints.push({
      raw: upper,
      lat: parsed.lat,
      lng: parsed.lng,
      label: formatCoordLabel(parsed.lat, parsed.lng),
      kind: "fix",
    });
  }

  return waypoints;
}

const NEAR_ENDPOINT_M = 1852 * 1.5; // 1.5 NM

/**
 * FPL/NexAtlas costuma exportar DDMM (sem segundos). Isso desloca o ponto vs o
 * fixo da carta. Se estiver perto de um fixo REA/REH, usa a coordenada precisa.
 */
export function snapWaypointsToFixes(
  waypoints: FlightPlanWaypoint[],
  fixes: Array<{ lat: number; lon?: number; lng?: number; name?: string }>,
  maxDistM = NEAR_ENDPOINT_M,
): FlightPlanWaypoint[] {
  if (!waypoints.length || !fixes.length) return waypoints;
  const catalog: Array<{ lat: number; lng: number; name?: string }> = [];
  for (const f of fixes) {
    const lon = f.lon ?? f.lng;
    if (!Number.isFinite(f.lat) || lon == null || !Number.isFinite(lon)) continue;
    catalog.push({
      lat: f.lat,
      lng: lon,
      ...(f.name != null && f.name !== "" ? { name: f.name } : {}),
    });
  }
  if (!catalog.length) return waypoints;

  return waypoints.map((wp) => {
    if (wp.kind === "origin" || wp.kind === "destination" || wp.kind === "airport") return wp;
    let best: { lat: number; lng: number; name?: string } | null = null;
    let bestDist = Infinity;
    for (const fix of catalog) {
      const d = haversineM(wp, fix);
      if (d < bestDist) {
        bestDist = d;
        best = fix;
      }
    }
    if (!best || bestDist > maxDistM) return wp;
    const name = best.name?.trim() ? best.name.trim().toUpperCase() : null;
    return {
      ...wp,
      lat: best.lat,
      lng: best.lng,
      label: name || wp.label,
      kind: name ? "rea" : wp.kind,
      ...(name ? { reaName: name } : {}),
    };
  });
}

/**
 * Se um ponto do FPL estiver perto de um aeródromo do catálogo, usa ICAO + ARP.
 * Preferir rodar depois do snap REA (pontos já rea/airport são ignorados).
 */
export function snapWaypointsToAerodromes(
  waypoints: FlightPlanWaypoint[],
  aerodromes: Array<{
    icao?: string | null;
    ciad?: string | null;
    lat?: number | null;
    lng?: number | null;
    latitudeGeoPoint?: number | null;
    longitudeGeoPoint?: number | null;
    altitudeText?: string | null;
    elevFt?: number | null;
  }>,
  maxDistM = NEAR_ENDPOINT_M,
): FlightPlanWaypoint[] {
  if (!waypoints.length || !aerodromes.length) return waypoints;
  const catalog: Array<{ lat: number; lng: number; code: string; elevFt: number | null }> = [];
  for (const ad of aerodromes) {
    const lat = ad.latitudeGeoPoint ?? ad.lat;
    const lng = ad.longitudeGeoPoint ?? ad.lng;
    const code = (ad.icao || ad.ciad || "").trim().toUpperCase();
    if (!code || lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const elevFt =
      ad.elevFt != null && Number.isFinite(ad.elevFt)
        ? Math.round(ad.elevFt)
        : parseFieldElevationFt(ad.altitudeText);
    catalog.push({ lat, lng, code, elevFt });
  }
  if (!catalog.length) return waypoints;

  return waypoints.map((wp) => {
    if (wp.kind === "origin" || wp.kind === "destination" || wp.kind === "airport" || wp.kind === "rea") {
      if (
        (wp.kind === "origin" || wp.kind === "destination" || wp.kind === "airport") &&
        ((wp.altitudeFt == null || !Number.isFinite(wp.altitudeFt)) ||
          wp.fieldElevFt == null ||
          !Number.isFinite(wp.fieldElevFt))
      ) {
        const code = (wp.label || wp.raw || "").trim().toUpperCase();
        const hit = catalog.find((ad) => ad.code === code && ad.elevFt != null);
        if (hit?.elevFt != null) {
          return {
            ...wp,
            fieldElevFt:
              wp.fieldElevFt != null && Number.isFinite(wp.fieldElevFt) ? wp.fieldElevFt : hit.elevFt,
            altitudeFt:
              wp.altitudeFt != null && Number.isFinite(wp.altitudeFt) ? wp.altitudeFt : hit.elevFt,
          };
        }
      }
      return wp;
    }
    let best: { lat: number; lng: number; code: string; elevFt: number | null } | null = null;
    let bestDist = Infinity;
    for (const ad of catalog) {
      const d = haversineM(wp, ad);
      if (d < bestDist) {
        bestDist = d;
        best = ad;
      }
    }
    if (!best || bestDist > maxDistM) return wp;
    return {
      ...wp,
      lat: best.lat,
      lng: best.lng,
      label: best.code,
      raw: best.code,
      kind: "airport" as const,
      fieldElevFt:
        wp.fieldElevFt != null && Number.isFinite(wp.fieldElevFt)
          ? wp.fieldElevFt
          : best.elevFt,
      altitudeFt:
        wp.altitudeFt != null && Number.isFinite(wp.altitudeFt)
          ? wp.altitudeFt
          : best.elevFt,
    };
  });
}

/** NexAtlas omits dep/arr — prepend/append airport coordinates when available. */
export function buildFullRouteWaypoints(
  routeText: string,
  origin?: { lat: number; lng: number; label: string } | null,
  destination?: { lat: number; lng: number; label: string } | null,
): FlightPlanWaypoint[] {
  const mid = parseFplRouteText(routeText);
  const out: FlightPlanWaypoint[] = [];

  if (origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng)) {
    const first = mid[0];
    const nearFirst = first ? haversineM(origin, first) <= NEAR_ENDPOINT_M : false;
    if (!nearFirst) {
      out.push({
        raw: origin.label,
        lat: origin.lat,
        lng: origin.lng,
        label: origin.label,
        kind: "origin",
      });
    }
  }

  out.push(...mid);

  if (destination && Number.isFinite(destination.lat) && Number.isFinite(destination.lng)) {
    const last = out[out.length - 1];
    const nearLast = last ? haversineM(destination, last) <= NEAR_ENDPOINT_M : false;
    if (!nearLast) {
      out.push({
        raw: destination.label,
        lat: destination.lat,
        lng: destination.lng,
        label: destination.label,
        kind: "destination",
      });
    }
  }

  return out;
}

/** True course (0–360°) from A → B. */
export function calcTrueBearing(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const phi1 = (a.lat * Math.PI) / 180;
  const phi2 = (b.lat * Math.PI) / 180;
  const dlambda = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(dlambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dlambda);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** ICA 100-12 VFR: proa 000–179 → 5500 ft; 180–359 → 6500 ft. */
export function semicircularCruiseFt(bearingDeg: number): number {
  const hdg = ((bearingDeg % 360) + 360) % 360;
  return hdg < 180 ? 5500 : 6500;
}

export function summarizeFlightPlanRoute(
  waypoints: FlightPlanWaypoint[],
  options?: { cruiseSpeedKt?: number | null; fuelBurnPerHour?: number | null },
): FlightPlanRouteSummary {
  let distanceM = 0;
  for (let i = 1; i < waypoints.length; i++) {
    distanceM += haversineM(waypoints[i - 1]!, waypoints[i]!);
  }
  const distanceNm = distanceM / NM_IN_M;
  const cruise = options?.cruiseSpeedKt;
  const burn = options?.fuelBurnPerHour;
  const eteHours =
    cruise != null && Number.isFinite(cruise) && cruise > 0 ? distanceNm / cruise : null;
  const fuelEstimate =
    eteHours != null && burn != null && Number.isFinite(burn) && burn > 0
      ? eteHours * burn
      : null;

  return { waypoints, distanceM, distanceNm, eteHours, fuelEstimate };
}

export type FlightPlanLeg = {
  from: FlightPlanWaypoint;
  to: FlightPlanWaypoint;
  /** Index of the destination waypoint in the route (1-based for display as leg N). */
  toIndex: number;
  distanceNm: number;
  bearingDeg: number;
  eteHours: number | null;
  fuelEstimate: number | null;
  /** Cumulative totals from route start through this leg. */
  cumulativeDistanceNm: number;
  cumulativeEteHours: number | null;
  cumulativeFuel: number | null;
};

export function buildFlightPlanLegs(
  waypoints: FlightPlanWaypoint[],
  options?: { cruiseSpeedKt?: number | null; fuelBurnPerHour?: number | null },
): FlightPlanLeg[] {
  const cruise = options?.cruiseSpeedKt;
  const burn = options?.fuelBurnPerHour;
  const hasCruise = cruise != null && Number.isFinite(cruise) && cruise > 0;
  const hasBurn = burn != null && Number.isFinite(burn) && burn > 0;
  const legs: FlightPlanLeg[] = [];
  let cumNm = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const from = waypoints[i - 1]!;
    const to = waypoints[i]!;
    const distanceNm = haversineM(from, to) / NM_IN_M;
    cumNm += distanceNm;
    const eteHours = hasCruise ? distanceNm / cruise! : null;
    const fuelEstimate = eteHours != null && hasBurn ? eteHours * burn! : null;
    const cumulativeEteHours = hasCruise ? cumNm / cruise! : null;
    const cumulativeFuel =
      cumulativeEteHours != null && hasBurn ? cumulativeEteHours * burn! : null;
    legs.push({
      from,
      to,
      toIndex: i,
      distanceNm,
      bearingDeg: calcTrueBearing(from, to),
      eteHours,
      fuelEstimate,
      cumulativeDistanceNm: cumNm,
      cumulativeEteHours,
      cumulativeFuel,
    });
  }
  return legs;
}

/** Compact DDMMH/DDDMMH string for NexAtlas / FPL paste. */
export function formatCompactAviationCoord(lat: number, lng: number): string {
  return formatCoordLabel(lat, lng);
}

/**
 * Build NexAtlas-style route text from waypoints.
 * Airport endpoints (origin/destination) are omitted — NexAtlas usually exports mid-route only.
 */
export function waypointsToNexAtlasText(waypoints: FlightPlanWaypoint[]): string {
  const mid = waypoints.filter((w) => w.kind !== "origin" && w.kind !== "destination");
  const tokens = mid.map((w) => formatCompactAviationCoord(w.lat, w.lng));
  if (!tokens.length) return "";
  return `DCT ${tokens.join(" ")} DCT`;
}

export function formatBearingDeg(deg: number): string {
  if (!Number.isFinite(deg)) return "—";
  return `${String(Math.round(deg) % 360).padStart(3, "0")}°`;
}

export function formatEteClock(hours: number | null): string {
  if (hours == null || !Number.isFinite(hours)) return "—";
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatDistanceNm(nm: number): string {
  if (!Number.isFinite(nm)) return "—";
  return `${nm.toFixed(1)} NM`;
}

export function formatEteHours(hours: number | null): string {
  if (hours == null || !Number.isFinite(hours)) return "—";
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m} min`;
  return `${h}h ${String(m).padStart(2, "0")}min`;
}

export function formatFuel(amount: number | null, unit = "L"): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return `${amount.toFixed(1)} ${unit}`;
}

/** Projeção do ponto P no segmento A→B (plano local equirectangular). */
export function projectPointOnSegment(
  p: { lat: number; lng: number },
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): { t: number; lat: number; lng: number; distanceM: number } {
  const lat0 = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const cosLat = Math.cos(lat0) || 1e-6;
  const ax = a.lng * cosLat;
  const ay = a.lat;
  const bx = b.lng * cosLat;
  const by = b.lat;
  const px = p.lng * cosLat;
  const py = p.lat;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 1e-18) {
    t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
  }
  const lat = a.lat + t * (b.lat - a.lat);
  const lng = a.lng + t * (b.lng - a.lng);
  return { t, lat, lng, distanceM: haversineM(p, { lat, lng }) };
}

export type RouteInsertHint = {
  /** Índice para `splice` (entre fromIndex e toIndex). */
  insertIndex: number;
  mode: "between" | "append";
  distanceM: number;
  fromIndex: number;
  toIndex: number;
  t: number;
};

const INSERT_NEAR_LEG_M = 1852 * 22; // ~22 NM de afastamento lateral do trecho
/** Buffer absoluto nos extremos — NÃO usar fração do trecho (em pernas longas
 *  descartava pontos válidos perto da origem, ex. ITU em SBJD→SBCA). */
const INSERT_ENDPOINT_BUFFER_M = 1852 * 1.2; // ~1.2 NM

/**
 * Decide se o novo ponto deve ir no fim ou entre trechos (proximidade ao segmento).
 */
export function findRouteInsertHint(
  waypoints: Array<{ lat: number; lng: number }>,
  point: { lat: number; lng: number },
  opts?: { maxDistanceM?: number },
): RouteInsertHint {
  const maxDist = opts?.maxDistanceM ?? INSERT_NEAR_LEG_M;
  if (waypoints.length < 2) {
    return {
      insertIndex: waypoints.length,
      mode: "append",
      distanceM: Infinity,
      fromIndex: Math.max(0, waypoints.length - 1),
      toIndex: waypoints.length,
      t: 1,
    };
  }

  let best: RouteInsertHint | null = null;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i]!;
    const b = waypoints[i + 1]!;
    const proj = projectPointOnSegment(point, a, b);
    if (proj.distanceM > maxDist) continue;

    const legLenM = haversineM(a, b);
    const alongM = proj.t * legLenM;
    // Só ignora se está colado a um extremo já existente (quase duplicata).
    // Em pernas curtas, limita o buffer a 20% da perna para ainda sobrar meio.
    const endBuf = Math.min(INSERT_ENDPOINT_BUFFER_M, Math.max(1852 * 0.3, legLenM * 0.2));
    if (alongM < endBuf || legLenM - alongM < endBuf) continue;

    if (!best || proj.distanceM < best.distanceM) {
      best = {
        insertIndex: i + 1,
        mode: "between",
        distanceM: proj.distanceM,
        fromIndex: i,
        toIndex: i + 1,
        t: proj.t,
      };
    }
  }

  if (!best) {
    return {
      insertIndex: waypoints.length,
      mode: "append",
      distanceM: haversineM(point, waypoints[waypoints.length - 1]!),
      fromIndex: waypoints.length - 1,
      toIndex: waypoints.length,
      t: 1,
    };
  }

  // Prefere append só quando o clique está claramente perto do ÚLTIMO ponto
  // (estendendo a rota), não quando está perto da origem/meio.
  const distLast = haversineM(point, waypoints[waypoints.length - 1]!);
  let nearestIdx = waypoints.length - 1;
  let nearestDist = distLast;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const d = haversineM(point, waypoints[i]!);
    if (d < nearestDist) {
      nearestDist = d;
      nearestIdx = i;
    }
  }
  if (
    nearestIdx === waypoints.length - 1 &&
    distLast < best.distanceM * 0.55 &&
    distLast < 1852 * 8
  ) {
    return {
      insertIndex: waypoints.length,
      mode: "append",
      distanceM: distLast,
      fromIndex: waypoints.length - 1,
      toIndex: waypoints.length,
      t: 1,
    };
  }

  return best;
}

/** Índice do trecho (0 = A→B) mais próximo do clique, ou -1. */
export function nearestRouteLegIndex(
  waypoints: Array<{ lat: number; lng: number }>,
  point: { lat: number; lng: number },
  maxDistanceM = 1852 * 30,
): number {
  if (waypoints.length < 2) return -1;
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const proj = projectPointOnSegment(point, waypoints[i]!, waypoints[i + 1]!);
    if (proj.distanceM < bestDist) {
      bestDist = proj.distanceM;
      bestIdx = i;
    }
  }
  return bestDist <= maxDistanceM ? bestIdx : -1;
}

export function routeBoundingBox(
  waypoints: Array<{ lat: number; lng: number }>,
  padDeg = 0.35,
): { minLng: number; minLat: number; maxLng: number; maxLat: number } | null {
  if (!waypoints.length) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of waypoints) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  return {
    minLng: minLng - padDeg,
    minLat: minLat - padDeg,
    maxLng: maxLng + padDeg,
    maxLat: maxLat + padDeg,
  };
}
