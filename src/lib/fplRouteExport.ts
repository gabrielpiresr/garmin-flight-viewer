import type { FlightPlanWaypoint } from "../types/flightPlanning";
import { calcTrueBearing, formatCompactAviationCoord, haversineM, semicircularCruiseFt } from "./flightPlanningRoute";
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

function formatFplPointSpeedLevel(
  wp: FlightPlanWaypoint,
  speedKt: number | null,
  levelFt: number | null | undefined = wp.altitudeFt,
): string {
  return `${formatCompactAviationCoord(wp.lat, wp.lng)}/${formatFplSpeed(speedKt)}${formatFplLevel(levelFt)}`;
}

/** Nível voado A PARTIR deste ponto: VFR se o próximo trecho é REA; A055/A065 quando sai para DCT. */
function levelFlownFrom(
  waypoints: FlightPlanWaypoint[],
  legIdx: number,
  nextInside: boolean | null,
  currentInside = false,
): number | null | undefined {
  if (nextInside === true) return null;
  const to = waypoints[legIdx]!;
  const next = waypoints[legIdx + 1];
  if (to.outboundAltitudeFt != null && Number.isFinite(to.outboundAltitudeFt)) return to.outboundAltitudeFt;
  if ((currentInside || isAirportLike(to)) && next) return semicircularCruiseFt(calcTrueBearing(to, next));
  if (to.altitudeFt != null && Number.isFinite(to.altitudeFt)) return to.altitudeFt;
  if (next) return semicircularCruiseFt(calcTrueBearing(to, next));
  return to.altitudeFt;
}

function waypointIcaoCode(wp: FlightPlanWaypoint): string | null {
  for (const value of [wp.label, wp.raw]) {
    const code = normalizeFplText(value);
    if (/^[A-Z0-9]{4}$/.test(code)) return code;
  }
  return null;
}

function pushFplToken(tokens: string[], token: string): void {
  const clean = token.trim().toUpperCase();
  if (!clean) return;
  if (tokens[tokens.length - 1] === clean) return;
  tokens.push(clean);
}

type TmaVolume = {
  type?: string;
  ident?: string;
  name?: string;
  geometry?: { type: string; coordinates?: unknown } | null;
  contains?: (lat: number, lng: number) => boolean;
};

type TmaAirspaceHit = {
  type?: string;
  ident?: string;
  name?: string;
  entryDistanceNm?: number | null;
  exitDistanceNm?: number | null;
  occupancyNm?: Array<{ fromNm?: number; toNm?: number }>;
};

type PointInTmaVolume = (
  geometry: { type: string; coordinates?: unknown },
  lat: number,
  lng: number,
) => boolean;

/** Código da carta REA (XP, WH, XO…) → nome da TMA. Só estas TMA entram no campo 15. */
const REA_TMA_BY_CODE: Record<string, string> = {
  PI: "PARINTINS",
  WA: "TABATINGA",
  WB: "BELEM",
  WF: "RECIFE",
  WG: "CAMPO GRANDE",
  WJ: "RIO DE JANEIRO",
  WK: "PORTO SEGURO",
  WN: "MANAUS",
  WP: "PORTO ALEGRE",
  WR: "BRASILIA",
  WS: "SAO LUIS",
  WX: "SANTAREM",
  WY: "CUIABA",
  WZ: "FORTALEZA",
  XF: "FLORIANOPOLIS",
  XK: "MACAPA",
  XN: "ANAPOLIS",
  XO: "LONDRINA",
  XP: "SAO PAULO",
  XQ: "RIBEIRAO PRETO",
  XR: "VITORIA",
  XS: "SALVADOR",
  XT: "NATAL",
  WH: "BELO HORIZONTE",
  WT: "CURITIBA",
};

function normalizeTmaText(value: string | null | undefined): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/gi, " ")
    .trim()
    .toUpperCase();
}

/** Ident SBXP / SBXP_02 ou nome “TMA SÃO PAULO” → código da carta REA, senão null. */
export function reaTmaCodeFromIdentName(ident?: string | null, name?: string | null): string | null {
  const identNorm = normalizeTmaText(ident).replace(/\s+/g, "");
  const identMatch = identNorm.match(/^SB([WX][A-Z])(?:_|$|[0-9])/);
  if (identMatch && REA_TMA_BY_CODE[identMatch[1]!]) return identMatch[1]!;
  const nameNorm = normalizeTmaText(name);
  if (!nameNorm) return null;
  for (const [code, city] of Object.entries(REA_TMA_BY_CODE)) {
    if (nameNorm === city || nameNorm.includes(city)) return code;
  }
  return null;
}

function volumeContainsPoint(
  vol: TmaVolume,
  point: { lat: number; lng: number },
  pointInVolume?: PointInTmaVolume,
): boolean {
  if (typeof vol.contains === "function" && vol.contains(point.lat, point.lng)) return true;
  if (vol.geometry && pointInVolume?.(vol.geometry, point.lat, point.lng)) return true;
  return false;
}

function reaTmaIdFromVolumes(
  point: { lat: number; lng: number },
  volumes: TmaVolume[],
  pointInVolume?: PointInTmaVolume,
): string | null {
  for (const vol of volumes) {
    if (String(vol.type || "").toUpperCase() !== "TMA") continue;
    const code = reaTmaCodeFromIdentName(vol.ident, vol.name);
    if (!code) continue;
    if (volumeContainsPoint(vol, point, pointInVolume)) return code;
  }
  return null;
}

export function hasTmaAirspaceData(
  airspaces: TmaAirspaceHit[],
  volumes: TmaVolume[],
): boolean {
  return (
    airspaces.some(
      (hit) =>
        String(hit.type || "").toUpperCase() === "TMA" &&
        Boolean(reaTmaCodeFromIdentName(hit.ident, hit.name)),
    ) ||
    volumes.some(
      (vol) =>
        String(vol.type || "").toUpperCase() === "TMA" &&
        Boolean(reaTmaCodeFromIdentName(vol.ident, vol.name)),
    )
  );
}

export function originReaTmaId(
  origin: { lat: number; lng: number } | null | undefined,
  airspaces: TmaAirspaceHit[],
  volumes: TmaVolume[],
  pointInVolume?: PointInTmaVolume,
): string | null {
  if (!origin) return null;
  const fromVol = reaTmaIdFromVolumes(origin, volumes, pointInVolume);
  if (fromVol) return fromVol;
  for (const hit of airspaces) {
    if (String(hit.type || "").toUpperCase() !== "TMA") continue;
    const code = reaTmaCodeFromIdentName(hit.ident, hit.name);
    if (!code) continue;
    if (hit.entryDistanceNm != null && Number.isFinite(hit.entryDistanceNm) && hit.entryDistanceNm < 3) {
      return code;
    }
  }
  return null;
}

export function destReaTmaId(
  dest: { lat: number; lng: number } | null | undefined,
  airspaces: TmaAirspaceHit[],
  volumes: TmaVolume[],
  pointInVolume?: PointInTmaVolume,
  totalDistanceNm?: number | null,
): string | null {
  if (!dest) return null;
  const hasReaTmaVolumes = volumes.some(
    (vol) =>
      String(vol.type || "").toUpperCase() === "TMA" && Boolean(reaTmaCodeFromIdentName(vol.ident, vol.name)),
  );
  if (hasReaTmaVolumes) return reaTmaIdFromVolumes(dest, volumes, pointInVolume);
  if (totalDistanceNm != null && Number.isFinite(totalDistanceNm)) {
    for (const hit of airspaces) {
      if (String(hit.type || "").toUpperCase() !== "TMA") continue;
      const code = reaTmaCodeFromIdentName(hit.ident, hit.name);
      if (!code) continue;
      const exit = hit.exitDistanceNm;
      if (exit != null && Number.isFinite(exit) && totalDistanceNm - exit < 3) return code;
      const occ = Array.isArray(hit.occupancyNm) ? hit.occupancyNm : [];
      if (occ.some((seg) => seg.toNm != null && Number.isFinite(seg.toNm) && totalDistanceNm - seg.toNm < 3)) {
        return code;
      }
    }
  }
  return reaTmaIdFromVolumes(dest, volumes, pointInVolume);
}

export function originIsInsideTma(
  origin: { lat: number; lng: number } | null | undefined,
  airspaces: TmaAirspaceHit[],
  volumes: TmaVolume[],
  pointInVolume?: PointInTmaVolume,
): boolean {
  return originReaTmaId(origin, airspaces, volumes, pointInVolume) != null;
}

/** Destino está na TMA com REA se o polígono/ocupação daquela TMA cobre o fim da rota. */
export function destIsInsideTma(
  dest: { lat: number; lng: number } | null | undefined,
  airspaces: TmaAirspaceHit[],
  volumes: TmaVolume[],
  pointInVolume?: PointInTmaVolume,
  totalDistanceNm?: number | null,
): boolean {
  return destReaTmaId(dest, airspaces, volumes, pointInVolume, totalDistanceNm) != null;
}

function isLocalReaJoin(from: { lat: number; lng: number }, to: { lat: number; lng: number }): boolean {
  if (formatCompactAviationCoord(from.lat, from.lng) === formatCompactAviationCoord(to.lat, to.lng)) {
    return true;
  }
  return haversineM(from, to) < LOCAL_REA_JOIN_M;
}

/**
 * Campo 15 — Rota. Só TMA com REA conta.
 * 1. Origem e destino na mesma TMA: REA
 * 2. Origem dentro, destino fora: REA {saída} DCT
 * 3. Ambos fora, sem TMA com REA: DCT
 * 4. Origem fora, destino dentro: DCT {entrada}/VFR REA
 */
export function buildFplRouteText(
  waypoints: FlightPlanWaypoint[],
  legCorridors: Array<LegCorridorInfo | null>,
  speedKt: number | null,
  options?: {
    originInsideTma?: boolean;
    destInsideTma?: boolean;
    originReaTmaId?: string | null;
    destReaTmaId?: string | null;
  },
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
      const nextInside = false;
      pushFplToken(tokens, formatFplPointSpeedLevel(to, speedKt, levelFlownFrom(waypoints, legIdx, nextInside, false)));
      pushFplToken(tokens, "DCT");
    }
    return tokens.join(" ");
  }

  const entryWp = waypoints[firstCorr - 1]!;
  const originInside = options?.originInsideTma;
  const destInside = options?.destInsideTma;
  const originTmaId = options?.originReaTmaId ?? null;
  const destTmaId = options?.destReaTmaId ?? null;
  const destOnRea = lastCorr === waypoints.length - 1;
  const trailingDctNm = destOnRea ? 0 : haversineM(waypoints[lastCorr]!, dest) / NM_IN_M;
  const tinyTrailingSnap = !destOnRea && trailingDctNm < 3;
  const localJoin = firstCorr === 1 || isLocalReaJoin(origin, entryWp);
  // DCT longo até o 1º corredor = ainda está em espaço livre, mesmo se o polígono da TMA cobrir a origem.
  const startsInside =
    originInside === false ? firstCorr === 1 : localJoin;
  let continuousRea = true;
  for (let idx = firstCorr; idx <= lastCorr; idx++) {
    if (!isCorridorLeg(idx)) {
      continuousRea = false;
      break;
    }
  }
  // Destino no corredor ou snap curto até o AD = termina em REA, mesmo se o WPP não detectar TMA.
  const endsInside =
    destOnRea || tinyTrailingSnap
      ? true
      : destInside === false
        ? false
        : destInside === true && !continuousRea;
  const sameReaTma = originTmaId && destTmaId ? originTmaId === destTmaId : true;
  if (startsInside && endsInside && continuousRea && sameReaTma && (destOnRea || tinyTrailingSnap)) {
    return "REA";
  }

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
        pushFplToken(tokens, formatFplPointSpeedLevel(to, speedKt, levelFlownFrom(waypoints, legIdx, nextInside, true)));
        pushFplToken(tokens, "DCT");
      } else if (isLastLeg && !endsInside) {
        const from = waypoints[legIdx - 1];
        if (from && from !== origin) {
          pushFplToken(tokens, formatFplPointSpeedLevel(from, speedKt, levelFlownFrom(waypoints, legIdx - 1, false, true)));
          pushFplToken(tokens, "DCT");
        }
      }
      continue;
    }

    if (nextInside === true) {
      pushFplToken(tokens, formatFplPointSpeedLevel(to, speedKt, levelFlownFrom(waypoints, legIdx, true, false)));
      pushFplToken(tokens, "REA");
      continue;
    }

    if (!isLastLeg) {
      pushFplToken(tokens, formatFplPointSpeedLevel(to, speedKt, levelFlownFrom(waypoints, legIdx, nextInside, false)));
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

  const tglAerodromes: string[] = [];
  const seenTgl = new Set<string>();
  for (const wp of waypoints.slice(1, Math.max(1, waypoints.length - 1))) {
    const code = waypointIcaoCode(wp);
    if (!code || seenTgl.has(code)) continue;
    const looksLikeAd =
      isAirportLike(wp) || (wp.fieldElevFt != null && Number.isFinite(wp.fieldElevFt));
    if (!looksLikeAd) continue;
    seenTgl.add(code);
    tglAerodromes.push(code);
  }

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
