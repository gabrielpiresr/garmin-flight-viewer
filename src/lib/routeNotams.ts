import type { AiswebNotam } from "../types/aisweb";
import type { FlightPlanAirspaceHit, FlightPlanWaypoint } from "../types/flightPlanning";
import type { Aerodrome } from "./aerodromesDb";
import { parseAirspaceLimitFt, type AirspaceVolume } from "./airspaceIntersect";
import { airspaceNotamLocation, filterNotamsForAirspace } from "./airspaceNotams";
import { parseCoordAreaText } from "./coordArea";
import { haversineM } from "./flightPlanningRoute";
import type { GeoPoly } from "./geoClip";
import { altitudeAtDistanceNm, type ProfilePhasePoint } from "./routePerformanceProfile";

export const ROUTE_NOTAM_BUFFER_NM = 10;
const NM_IN_M = 1852;
const HUGE_RADIUS_NM = 40;
const ALT_TOL_FT = 100;
const UNLIMITED_FT = 90_000;

const LOCAL_AIRSPACE_TYPES = new Set(["CTR", "ATZ", "TMA", "FIZ", "AFIS", "P", "R", "D"]);
const FIR_LIKE_TYPES = new Set(["FIR", "FIS", "CTA"]);
const AIRSPACE_Q_SUBJECTS = new Set([
  "AE",
  "AC",
  "AZ",
  "AF",
  "AH",
  "AL",
  "AR",
  "AT",
  "RT",
  "RD",
  "RP",
  "RA",
  "WA",
  "WW",
  "OB",
  "CA",
  "CS",
]);

export type RouteNotamShape =
  | { kind: "point" }
  | { kind: "circle"; radiusNm: number }
  | { kind: "polygon"; points: Array<{ lat: number; lng: number }> };

export type RouteNotamHit = {
  id: string;
  notam: AiswebNotam;
  airspace: { type: FlightPlanAirspaceHit["type"]; ident: string; name: string } | null;
  lat: number;
  lng: number;
  distanceNm: number;
  alongRouteNm: number | null;
  x0Nm: number | null;
  x1Nm: number | null;
  lowerFt: number | null;
  upperFt: number | null;
  shape: RouteNotamShape;
};

type RouteSample = { lat: number; lng: number; alongNm: number };
type LatLng = { lat: number; lng: number };

function densifyRoute(waypoints: Array<LatLng>, stepNm = 2): RouteSample[] {
  if (waypoints.length === 0) return [];
  const out: RouteSample[] = [{ lat: waypoints[0]!.lat, lng: waypoints[0]!.lng, alongNm: 0 }];
  let along = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1]!;
    const b = waypoints[i]!;
    const distNm = haversineM(a, b) / NM_IN_M;
    if (!Number.isFinite(distNm) || distNm <= 0) continue;
    const steps = Math.max(1, Math.ceil(distNm / stepNm));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      along += distNm / steps;
      out.push({
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t,
        alongNm: along,
      });
    }
  }
  return out;
}

function nearestOnRoute(point: LatLng, samples: RouteSample[]): {
  distNm: number;
  alongNm: number;
  lat: number;
  lng: number;
} {
  let best = {
    distNm: Infinity,
    alongNm: samples[0]?.alongNm ?? 0,
    lat: samples[0]?.lat ?? point.lat,
    lng: samples[0]?.lng ?? point.lng,
  };
  for (const sample of samples) {
    const distNm = haversineM(point, sample) / NM_IN_M;
    if (distNm < best.distNm) {
      best = { distNm, alongNm: sample.alongNm, lat: sample.lat, lng: sample.lng };
    }
  }
  return best;
}

function sampleAtAlongNm(samples: RouteSample[], alongNm: number): RouteSample {
  let best = samples[0]!;
  let bestDelta = Infinity;
  for (const sample of samples) {
    const delta = Math.abs(sample.alongNm - alongNm);
    if (delta < bestDelta) {
      best = sample;
      bestDelta = delta;
    }
  }
  return best;
}

function qSubject(qCode: string | null | undefined): string {
  const q = String(qCode || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  if (q.startsWith("Q") && q.length >= 3) return q.slice(1, 3);
  return q.slice(0, 2);
}

function parseFgLimit(text: string, item: "F" | "G"): number | null {
  const match = text.toUpperCase().match(new RegExp(`\\b${item}\\)\\s*([^\\n]+)`));
  if (!match) return null;
  return parseAirspaceLimitFt(match[1]!.trim());
}

function resolveNotamLimits(
  notam: AiswebNotam,
  airspace: FlightPlanAirspaceHit | null,
): { lowerFt: number | null; upperFt: number | null } {
  const lowerFt =
    parseAirspaceLimitFt(notam.lowerLimit) ?? parseFgLimit(notam.text, "F") ?? airspace?.lowerFt ?? null;
  const upperFt =
    parseAirspaceLimitFt(notam.upperLimit) ?? parseFgLimit(notam.text, "G") ?? airspace?.upperFt ?? null;
  return { lowerFt, upperFt };
}

function plannedFtAt(
  xNm: number,
  profile: ProfilePhasePoint[] | null | undefined,
  cruiseAltFt: number | null | undefined,
): number | null {
  if (profile?.length) {
    const alt = altitudeAtDistanceNm(profile, xNm);
    if (alt != null && Number.isFinite(alt)) return alt;
  }
  return cruiseAltFt != null && Number.isFinite(cruiseAltFt) ? cruiseAltFt : null;
}

function notamOverlapsPlannedAltitude(
  hit: RouteNotamHit,
  profile: ProfilePhasePoint[] | null | undefined,
  cruiseAltFt: number | null | undefined,
): boolean {
  if (!profile?.length && (cruiseAltFt == null || !Number.isFinite(cruiseAltFt))) return true;
  if (hit.lowerFt == null && hit.upperFt == null) return true;
  const lower = hit.lowerFt ?? 0;
  const upper = hit.upperFt == null || hit.upperFt >= UNLIMITED_FT ? 999_999 : hit.upperFt;
  const xs: number[] = [];
  if (hit.x0Nm != null && hit.x1Nm != null && hit.x1Nm - hit.x0Nm > 0.2) {
    const steps = 10;
    for (let i = 0; i <= steps; i++) xs.push(hit.x0Nm + ((hit.x1Nm - hit.x0Nm) * i) / steps);
  } else if (hit.alongRouteNm != null && Number.isFinite(hit.alongRouteNm)) {
    xs.push(hit.alongRouteNm);
  }
  if (!xs.length) {
    const cruise = plannedFtAt(0, profile, cruiseAltFt);
    if (cruise == null) return true;
    return cruise >= lower - ALT_TOL_FT && cruise <= upper + ALT_TOL_FT;
  }
  return xs.some((x) => {
    const alt = plannedFtAt(x, profile, cruiseAltFt);
    if (alt == null) return true;
    return alt >= lower - ALT_TOL_FT && alt <= upper + ALT_TOL_FT;
  });
}

function parseRadiusNm(text: string): number | null {
  const match = text
    .toUpperCase()
    .replace(/,/g, ".")
    .match(/(?:RAIO|RADIUS)\s*(?:DE\s*)?(\d+(?:\.\d+)?)\s*(NM|NMI|N\.M\.|KM|M|METROS?)?/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = (match[2] || "NM").replace(/\./g, "");
  if (unit.startsWith("KM")) return value / 1.852;
  if (unit === "M" || unit.startsWith("METRO")) return value / NM_IN_M;
  return value;
}

function pointInRing(point: LatLng, ring: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i]!.lat;
    const yj = ring[j]!.lat;
    const xi = ring[i]!.lng;
    const xj = ring[j]!.lng;
    const intersect = yi > point.lat !== yj > point.lat && point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function geoRings(geometry: GeoPoly): LatLng[][] {
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polys
    .map((rings) => (rings[0] || []).map(([lng, lat]) => ({ lat, lng })))
    .filter((ring) => ring.length >= 3);
}

function closestOnVolume(
  geometry: GeoPoly,
  samples: RouteSample[],
): { distNm: number; lat: number; lng: number; alongNm: number } | null {
  const rings = geoRings(geometry);
  if (!rings.length || !samples.length) return null;
  for (const sample of samples) {
    if (rings.some((ring) => pointInRing(sample, ring))) {
      return { distNm: 0, lat: sample.lat, lng: sample.lng, alongNm: sample.alongNm };
    }
  }
  let best: { distNm: number; lat: number; lng: number; alongNm: number } | null = null;
  for (const ring of rings) {
    for (const vertex of ring) {
      const near = nearestOnRoute(vertex, samples);
      if (!best || near.distNm < best.distNm) {
        best = { distNm: near.distNm, lat: vertex.lat, lng: vertex.lng, alongNm: near.alongNm };
      }
    }
  }
  return best;
}

function occupancySpan(hit: FlightPlanAirspaceHit): { fromNm: number; toNm: number } | null {
  if (hit.occupancyNm?.length) {
    const fromNm = Math.min(...hit.occupancyNm.map((s) => s.fromNm));
    const toNm = Math.max(...hit.occupancyNm.map((s) => s.toNm));
    return { fromNm, toNm };
  }
  if (hit.entryDistanceNm != null && Number.isFinite(hit.entryDistanceNm)) {
    const fromNm = hit.entryDistanceNm;
    const toNm =
      hit.exitDistanceNm != null && Number.isFinite(hit.exitDistanceNm) ? hit.exitDistanceNm : fromNm;
    return { fromNm, toNm };
  }
  return null;
}

function compactKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function notamMentionsAirspace(notam: AiswebNotam, hit: FlightPlanAirspaceHit): boolean {
  const hay = compactKey(`${notam.text} ${notam.number} ${notam.qCode || ""} ${notam.icao}`);
  const ident = compactKey(hit.ident);
  if (ident.length >= 3 && hay.includes(ident)) return true;
  const short = ident.replace(/^[A-Z]{3}(?=\d)/, "");
  if (short.length >= 3 && hay.includes(short)) return true;
  const type = hit.type.toUpperCase();
  if (type && hay.includes(type)) return true;
  return false;
}

function isAirspaceRelevantNotam(notam: AiswebNotam, hit: FlightPlanAirspaceHit, hasCoords: boolean): boolean {
  if (hasCoords) return true;
  const subject = qSubject(notam.qCode);
  if (AIRSPACE_Q_SUBJECTS.has(subject)) return true;
  if (notamMentionsAirspace(notam, hit)) return true;
  if (hit.type === "P" || hit.type === "R" || hit.type === "D" || hit.type === "CTR" || hit.type === "ATZ") {
    return true;
  }
  return false;
}

function notamKey(notam: AiswebNotam): string {
  return notam.id || `${notam.icao}:${notam.number}:${notam.validFrom || ""}:${notam.text.slice(0, 40)}`;
}

function aerodromePoint(ad: Aerodrome | undefined): LatLng | null {
  if (ad?.latitudeGeoPoint == null || ad?.longitudeGeoPoint == null) return null;
  return { lat: ad.latitudeGeoPoint, lng: ad.longitudeGeoPoint };
}

function polygonDistance(
  points: LatLng[],
  samples: RouteSample[],
): { distNm: number; lat: number; lng: number; alongNm: number } {
  for (const sample of samples) {
    if (pointInRing(sample, points)) {
      return { distNm: 0, lat: sample.lat, lng: sample.lng, alongNm: sample.alongNm };
    }
  }
  let best = { distNm: Infinity, lat: points[0]!.lat, lng: points[0]!.lng, alongNm: 0 };
  for (const point of points) {
    const near = nearestOnRoute(point, samples);
    if (near.distNm < best.distNm) {
      best = { distNm: near.distNm, lat: point.lat, lng: point.lng, alongNm: near.alongNm };
    }
  }
  return best;
}

export function nearbyAerodromeIcaos(
  aerodromes: Aerodrome[],
  waypoints: FlightPlanWaypoint[],
  bufferNm = ROUTE_NOTAM_BUFFER_NM,
  cap = 12,
): string[] {
  const samples = densifyRoute(waypoints);
  if (samples.length < 2) return [];
  const scored: Array<{ icao: string; distNm: number }> = [];
  for (const ad of aerodromes) {
    const icao = String(ad.icao || "")
      .trim()
      .toUpperCase();
    if (!/^[A-Z]{4}$/.test(icao)) continue;
    const point = aerodromePoint(ad);
    if (!point) continue;
    const distNm = nearestOnRoute(point, samples).distNm;
    if (distNm <= bufferNm) scored.push({ icao, distNm });
  }
  scored.sort((a, b) => a.distNm - b.distNm);
  return [...new Set(scored.slice(0, cap).map((row) => row.icao))];
}

export function collectRouteNotamLocations(input: {
  airspaces: FlightPlanAirspaceHit[];
  originIcao?: string;
  destIcao?: string;
  alternates?: string[];
  nearbyIcaos?: string[];
}): string[] {
  const out: string[] = [];
  const push = (value: string | null | undefined) => {
    const code = String(value || "")
      .trim()
      .toUpperCase();
    if (/^[A-Z0-9]{4}$/.test(code)) out.push(code);
  };
  for (const hit of input.airspaces) push(airspaceNotamLocation(hit));
  push(input.originIcao);
  push(input.destIcao);
  for (const icao of input.alternates || []) push(icao);
  for (const icao of input.nearbyIcaos || []) push(icao);
  return [...new Set(out)];
}

function attachPlot(input: {
  notam: AiswebNotam;
  airspace: FlightPlanAirspaceHit | null;
  lat: number;
  lng: number;
  distanceNm: number;
  alongRouteNm: number | null;
  x0Nm: number | null;
  x1Nm: number | null;
  shape: RouteNotamShape;
}): RouteNotamHit {
  const limits = resolveNotamLimits(input.notam, input.airspace);
  return {
    id: notamKey(input.notam),
    notam: input.notam,
    airspace: input.airspace
      ? { type: input.airspace.type, ident: input.airspace.ident, name: input.airspace.name }
      : null,
    lat: input.lat,
    lng: input.lng,
    distanceNm: input.distanceNm,
    alongRouteNm: input.alongRouteNm,
    x0Nm: input.x0Nm,
    x1Nm: input.x1Nm,
    lowerFt: limits.lowerFt,
    upperFt: limits.upperFt,
    shape: input.shape,
  };
}

export function buildRouteNotamHits(input: {
  waypoints: FlightPlanWaypoint[];
  airspaces: FlightPlanAirspaceHit[];
  volumes?: AirspaceVolume[];
  aerodromes?: Aerodrome[];
  notamsByIcao: Record<string, AiswebNotam[]>;
  bufferNm?: number;
  plannedProfile?: ProfilePhasePoint[] | null;
  cruiseAltFt?: number | null;
  filterByPlannedAltitude?: boolean;
}): RouteNotamHit[] {
  const bufferNm = input.bufferNm ?? ROUTE_NOTAM_BUFFER_NM;
  const samples = densifyRoute(input.waypoints);
  if (samples.length < 2) return [];

  const adByIcao = new Map<string, Aerodrome>();
  for (const ad of input.aerodromes || []) {
    const icao = String(ad.icao || "")
      .trim()
      .toUpperCase();
    if (icao) adByIcao.set(icao, ad);
  }
  const volumeByKey = new Map<string, AirspaceVolume>();
  for (const volume of input.volumes || []) {
    volumeByKey.set(`${volume.type}:${volume.ident}`, volume);
  }

  const seen = new Set<string>();
  const out: RouteNotamHit[] = [];

  const tryPush = (hit: RouteNotamHit | null) => {
    if (!hit || seen.has(hit.id)) return;
    if (hit.distanceNm > bufferNm) return;
    seen.add(hit.id);
    out.push(hit);
  };

  const plotFromCoords = (
    notam: AiswebNotam,
    airspace: FlightPlanAirspaceHit | null,
  ): RouteNotamHit | null => {
    const points = parseCoordAreaText(notam.text);
    const radiusNm = parseRadiusNm(notam.text);
    if (points.length >= 3) {
      const near = polygonDistance(points, samples);
      return attachPlot({
        notam,
        airspace,
        lat: near.lat,
        lng: near.lng,
        distanceNm: near.distNm,
        alongRouteNm: near.alongNm,
        x0Nm: near.alongNm,
        x1Nm: near.alongNm,
        shape: { kind: "polygon", points },
      });
    }
    if (points.length >= 1) {
      const center = points[0]!;
      const near = nearestOnRoute(center, samples);
      const distNm = radiusNm != null ? Math.max(0, near.distNm - radiusNm) : near.distNm;
      const huge = radiusNm != null && radiusNm > HUGE_RADIUS_NM;
      return attachPlot({
        notam,
        airspace,
        lat: center.lat,
        lng: center.lng,
        distanceNm: distNm,
        alongRouteNm: near.alongNm,
        x0Nm: near.alongNm,
        x1Nm: near.alongNm,
        shape: radiusNm != null && !huge ? { kind: "circle", radiusNm } : { kind: "point" },
      });
    }
    return null;
  };

  const plotFromAirspace = (notam: AiswebNotam, airspace: FlightPlanAirspaceHit): RouteNotamHit | null => {
    const span = occupancySpan(airspace);
    const volume = volumeByKey.get(`${airspace.type}:${airspace.ident}`);
    const location = airspaceNotamLocation(airspace);
    const ad = location ? aerodromePoint(adByIcao.get(location)) : null;

    if (span) {
      const along = (span.fromNm + span.toNm) / 2;
      const sample = sampleAtAlongNm(samples, along);
      return attachPlot({
        notam,
        airspace,
        lat: sample.lat,
        lng: sample.lng,
        distanceNm: 0,
        alongRouteNm: along,
        x0Nm: span.fromNm,
        x1Nm: span.toNm,
        shape: { kind: "point" },
      });
    }

    if (volume) {
      const closest = closestOnVolume(volume.geometry, samples);
      if (!closest) return null;
      return attachPlot({
        notam,
        airspace,
        lat: closest.lat,
        lng: closest.lng,
        distanceNm: closest.distNm,
        alongRouteNm: closest.alongNm,
        x0Nm: closest.alongNm,
        x1Nm: closest.alongNm,
        shape: { kind: "point" },
      });
    }

    if (ad) {
      const near = nearestOnRoute(ad, samples);
      return attachPlot({
        notam,
        airspace,
        lat: ad.lat,
        lng: ad.lng,
        distanceNm: near.distNm,
        alongRouteNm: near.alongNm,
        x0Nm: near.alongNm,
        x1Nm: near.alongNm,
        shape: { kind: "point" },
      });
    }
    return null;
  };

  for (const airspace of input.airspaces) {
    const location = airspaceNotamLocation(airspace);
    const raw = location ? input.notamsByIcao[location] || [] : [];
    const list = filterNotamsForAirspace(raw, airspace);
    for (const notam of list) {
      const fromCoords = plotFromCoords(notam, airspace);
      if (fromCoords) {
        tryPush(fromCoords);
        continue;
      }
      if (FIR_LIKE_TYPES.has(airspace.type)) {
        const mentioned = input.airspaces.find(
          (hit) => LOCAL_AIRSPACE_TYPES.has(hit.type) && notamMentionsAirspace(notam, hit),
        );
        if (mentioned) tryPush(plotFromAirspace(notam, mentioned));
        continue;
      }
      if (!isAirspaceRelevantNotam(notam, airspace, false)) continue;
      tryPush(plotFromAirspace(notam, airspace));
    }
  }

  const extraIcaos = new Set(Object.keys(input.notamsByIcao));
  for (const icao of extraIcaos) {
    const ad = aerodromePoint(adByIcao.get(icao));
    if (!ad) continue;
    const near = nearestOnRoute(ad, samples);
    if (near.distNm > bufferNm) continue;
    for (const notam of input.notamsByIcao[icao] || []) {
      if (seen.has(notamKey(notam))) continue;
      const fromCoords = plotFromCoords(notam, null);
      if (fromCoords) {
        tryPush(fromCoords);
        continue;
      }
      tryPush(
        attachPlot({
          notam,
          airspace: null,
          lat: ad.lat,
          lng: ad.lng,
          distanceNm: near.distNm,
          alongRouteNm: near.alongNm,
          x0Nm: near.alongNm,
          x1Nm: near.alongNm,
          shape: { kind: "point" },
        }),
      );
    }
  }

  out.sort((a, b) => a.distanceNm - b.distanceNm || (a.alongRouteNm ?? 0) - (b.alongRouteNm ?? 0));
  if (input.filterByPlannedAltitude === false) return out;
  return out.filter((hit) =>
    notamOverlapsPlannedAltitude(hit, input.plannedProfile, input.cruiseAltFt),
  );
}
