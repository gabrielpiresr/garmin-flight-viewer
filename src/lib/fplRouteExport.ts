import type { FlightPlanWaypoint } from "../types/flightPlanning";
import { formatCompactAviationCoord, haversineM } from "./flightPlanningRoute";
import type { LegCorridorInfo } from "./legCorridor";

const NM_IN_M = 1852;
/** Junção local AD ↔ REA (mesmo critério do snapper: GATE_ENTRY_NM). */
const LOCAL_REA_JOIN_M = NM_IN_M * 15;

function isAirportLike(wp: FlightPlanWaypoint): boolean {
  return wp.kind === "airport" || wp.kind === "origin" || wp.kind === "destination";
}

function normalizeFplText(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9\s]/gi, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function formatFplSpeed(speedKt: number | null): string {
  const speed = speedKt != null && Number.isFinite(speedKt) && speedKt > 0 ? speedKt : 90;
  return `N${String(Math.max(1, Math.round(speed))).padStart(4, "0")}`;
}

function formatFplLevel(altitudeFt: number | null | undefined): string {
  if (altitudeFt != null && Number.isFinite(altitudeFt) && altitudeFt > 0) {
    return `A${String(Math.round(altitudeFt / 100)).padStart(3, "0")}`;
  }
  return "VFR";
}

function formatFplPointSpeedLevel(wp: FlightPlanWaypoint, speedKt: number | null): string {
  return `${formatCompactAviationCoord(wp.lat, wp.lng)}/${formatFplSpeed(speedKt)}${formatFplLevel(wp.altitudeFt)}`;
}

function pushFplToken(tokens: string[], token: string): void {
  const clean = token.trim().toUpperCase();
  if (!clean) return;
  if (tokens[tokens.length - 1] === clean) return;
  tokens.push(clean);
}

export function originIsInsideTma(
  origin: { lat: number; lng: number } | null | undefined,
  airspaces: Array<{ type?: string; entryDistanceNm?: number | null }>,
  volumes: Array<{
    type?: string;
    geometry?: { type: string; coordinates?: unknown } | null;
    contains?: (lat: number, lng: number) => boolean;
  }>,
  pointInVolume?: (geometry: { type: string; coordinates?: unknown }, lat: number, lng: number) => boolean,
): boolean {
  if (!origin) return false;
  for (const hit of airspaces) {
    if (String(hit.type || "").toUpperCase() !== "TMA") continue;
    if (hit.entryDistanceNm != null && Number.isFinite(hit.entryDistanceNm) && hit.entryDistanceNm < 3) return true;
  }
  for (const vol of volumes) {
    if (String(vol.type || "").toUpperCase() !== "TMA") continue;
    if (typeof vol.contains === "function" && vol.contains(origin.lat, origin.lng)) return true;
    if (vol.geometry && pointInVolume?.(vol.geometry, origin.lat, origin.lng)) return true;
  }
  return false;
}

function isLocalReaJoin(from: { lat: number; lng: number }, to: { lat: number; lng: number }): boolean {
  if (formatCompactAviationCoord(from.lat, from.lng) === formatCompactAviationCoord(to.lat, to.lng)) {
    return true;
  }
  return haversineM(from, to) < LOCAL_REA_JOIN_M;
}

/**
 * Campo 15 — Rota.
 * Começa em REA se a partida já está no corredor (ou a junção AD→REA é local).
 * Se origem e destino estão na REA e não há DCT no meio, o campo é só REA.
 * Fora da REA: DCT até o ponto de entrada, depois REA.
 */
export function buildFplRouteText(
  waypoints: FlightPlanWaypoint[],
  legCorridors: Array<LegCorridorInfo | null>,
  speedKt: number | null,
  _options?: { originInsideTma?: boolean },
): string {
  if (waypoints.length < 2) return "";
  const isCorridorLeg = (idx: number) => Boolean(legCorridors[idx]);
  const origin = waypoints[0]!;
  const dest = waypoints[waypoints.length - 1]!;
  const firstCorr = waypoints.findIndex((_, idx) => idx > 0 && isCorridorLeg(idx));
  const lastCorr = (() => {
    for (let idx = waypoints.length - 1; idx >= 1; idx--) {
      if (isCorridorLeg(idx)) return idx;
    }
    return -1;
  })();

  if (firstCorr < 0) {
    const tokens: string[] = [];
    pushFplToken(tokens, "DCT");
    for (let legIdx = 1; legIdx < waypoints.length - 1; legIdx++) {
      const to = waypoints[legIdx]!;
      pushFplToken(tokens, formatCompactAviationCoord(to.lat, to.lng));
      pushFplToken(tokens, "DCT");
    }
    return tokens.join(" ");
  }

  const entryWp = waypoints[firstCorr - 1]!;
  const exitWp = waypoints[lastCorr]!;
  const startsInside = firstCorr === 1 || isLocalReaJoin(origin, entryWp);
  const endsInside = lastCorr === waypoints.length - 1 || isLocalReaJoin(exitWp, dest);
  let continuousRea = true;
  for (let idx = firstCorr; idx <= lastCorr; idx++) {
    if (!isCorridorLeg(idx)) {
      continuousRea = false;
      break;
    }
  }
  if (startsInside && endsInside && continuousRea) return "REA";

  const tokens: string[] = [];
  pushFplToken(tokens, startsInside ? "REA" : "DCT");
  const startLeg = startsInside ? firstCorr : 1;

  for (let legIdx = startLeg; legIdx < waypoints.length; legIdx++) {
    const to = waypoints[legIdx]!;
    const inside = isCorridorLeg(legIdx);
    const nextInside = legIdx + 1 < waypoints.length ? isCorridorLeg(legIdx + 1) : null;
    const isLastLeg = legIdx === waypoints.length - 1;

    if (inside) {
      if (nextInside === false) {
        const next = waypoints[legIdx + 1];
        if (next && next === dest && endsInside) continue;
        pushFplToken(tokens, formatFplPointSpeedLevel(to, speedKt));
        pushFplToken(tokens, "DCT");
      }
      continue;
    }

    if (nextInside === true) {
      pushFplToken(tokens, formatFplPointSpeedLevel(to, speedKt));
      pushFplToken(tokens, "REA");
      continue;
    }

    if (!isLastLeg) {
      pushFplToken(tokens, formatCompactAviationCoord(to.lat, to.lng));
      pushFplToken(tokens, "DCT");
    }
  }

  return tokens.join(" ");
}

export function buildFplRmkText(
  waypoints: FlightPlanWaypoint[],
  legCorridors: Array<LegCorridorInfo | null>,
): string {
  const corridorNames: string[] = [];
  const seenCorridors = new Set<string>();
  for (const corridor of legCorridors) {
    const clean = normalizeFplText(corridor?.name || "");
    if (!clean || seenCorridors.has(clean)) continue;
    seenCorridors.add(clean);
    corridorNames.push(clean);
  }

  const tglAerodromes = waypoints
    .slice(1, Math.max(1, waypoints.length - 1))
    .filter(isAirportLike)
    .map((wp) => normalizeFplText(wp.label || wp.raw))
    .filter((code) => /^[A-Z0-9]{4}$/.test(code));

  const tokens: string[] = [];
  if (corridorNames.length > 0) {
    tokens.push("REA", ...corridorNames);
  }
  for (const icao of tglAerodromes) {
    tokens.push("TGL", icao);
  }
  if (corridorNames.length > 0) {
    tokens.push("AD", "CFM", "ALT", "MAX", "REA");
  }
  return tokens.join(" ");
}
