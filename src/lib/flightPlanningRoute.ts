import type { FlightPlanRouteSummary, FlightPlanWaypoint } from "../types/flightPlanning";

const NM_IN_M = 1852;
/** Mean Earth radius (m) — closer to common aviation GC calculators than 6371 km. */
const EARTH_RADIUS_M = 6_371_008.8;

/** Compact ICAO FPL / NexAtlas fix: 2306S04634W or 230600S0463400W */
const COMPACT_COORD =
  /^(\d{2})(\d{2})(\d{2})?([NS])(\d{3})(\d{2})(\d{2})?([EW])$/i;

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
  const match = String(token || "").trim().toUpperCase().match(COMPACT_COORD);
  if (!match) return null;
  const latDeg = Number(match[1]);
  const latMin = Number(match[2]);
  const latSec = match[3] != null ? Number(match[3]) : 0;
  const lngDeg = Number(match[5]);
  const lngMin = Number(match[6]);
  const lngSec = match[7] != null ? Number(match[7]) : 0;
  if (![latDeg, latMin, latSec, lngDeg, lngMin, lngSec].every(Number.isFinite)) return null;
  if (latDeg > 90 || lngDeg > 180 || latMin >= 60 || lngMin >= 60 || latSec >= 60 || lngSec >= 60) {
    return null;
  }
  return {
    lat: dmsToDecimal(latDeg, latMin, latSec, match[4]!),
    lng: dmsToDecimal(lngDeg, lngMin, lngSec, match[8]!),
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
