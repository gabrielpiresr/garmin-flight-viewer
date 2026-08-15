import type { AiswebAirportBundle, AiswebCloudLayer, AiswebMetarTaf, AiswebParsedMetar } from "../types/aisweb";
import type { FlightPlanWaypoint } from "../types/flightPlanning";
import type { Aerodrome } from "./aerodromesDb";
import { parseMetar } from "./aiswebMetar";
import { parseFieldElevationFt } from "./fieldElevation";
import { calcTrueBearing, haversineM } from "./flightPlanningRoute";
import { destinationPoint } from "./geoClip";
import type { OpenMeteoCloudLevel, OpenMeteoPressureHpa, OpenMeteoRoutePoint } from "./openMeteoDb";
import { altFtToY, lngLatToEnu, type EnuOrigin } from "./route3d";
import { pointAlongRoute } from "./routePerformanceProfile";
import type { TerrainGrid } from "./terrainTiles";
import { sampleGridHeightM } from "./terrainTiles";

export const METAR_CLOUD_RADIUS_NM = 8;
export const METAR_MAX_ICAOS = 40;
export const ROUTE_CLOUD_SPACING_NM = 10;
export const ROUTE_CLOUD_MAX_SAMPLES = 16;
export const ROUTE_CLOUD_MAX_SAMPLES_LITE = 8;
export const ROUTE_CLOUD_LATERAL_NM = 8;
export const ROUTE_CLOUD_WIDTH_NM = 8;
/** Abaixo de meio oitavo (~6%) não desenha. */
export const ROUTE_CLOUD_MIN_COVER = 6.25;

/** FAA/Windy-style flight categories for METAR station markers. */
const VFR_CEILING_FT = 3000;
const VFR_VIS_KM = 5 * 1.609344;
const IFR_CEILING_FT = 1000;
const IFR_VIS_KM = 3 * 1.609344;

const NM_IN_M = 1852;
const FT_TO_M = 0.3048;
const ICAO_RE = /^[A-Z]{4}$/;

export type MetarCloudKind = "puff" | "disc" | "tower" | "fog" | "ceiling" | "ring";
export type MetarFlightRule = "vfr" | "mvfr" | "ifr" | "unknown";
export type RouteCloudLane = "center" | "left" | "right";

export type MetarCloudInstance = {
  kind: MetarCloudKind;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  color: string;
  opacity: number;
};

export type MetarCloudHit = {
  icao: string;
  x: number;
  y: number;
  z: number;
  radiusM: number;
  layerRaw: string;
  cloudsText: string;
  ceilingFt: number | null;
  observedAt: string | null;
  flightRule: MetarFlightRule;
  metar: string;
  taf: string;
};

export type MetarCloudStation3d = {
  icao: string;
  instances: MetarCloudInstance[];
  hit: MetarCloudHit;
};

export type RouteCloudBand3d = {
  hPa: OpenMeteoPressureHpa;
  heightFt: number;
  coverPct: number;
  lowerFt: number;
  upperFt: number;
};

export type RouteCloudSample3d = {
  lat: number;
  lng: number;
  x: number;
  z: number;
  nx: number;
  nz: number;
  ax: number;
  az: number;
  lane: RouteCloudLane;
  alongIndex: number;
  groundFt: number;
  precipMm: number;
  weatherCode: number;
  time: string;
  bands: RouteCloudBand3d[];
};

export type RouteCloudSamplePoint = {
  lat: number;
  lng: number;
  lane: RouteCloudLane;
  alongIndex: number;
};

export type RouteCloudPuff3d = {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  sampleIndex: number;
};

function hashUnit(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** 0–100% → 0–8 oitavos (12,5% cada). 100% = 8/8. */
export function coverPctToOktas(coverPct: number): number {
  if (!Number.isFinite(coverPct) || coverPct < ROUTE_CLOUD_MIN_COVER) return 0;
  return Math.max(1, Math.min(8, Math.round(coverPct / 12.5)));
}

type RouteCloudDeck = RouteCloudBand3d & { oktas: number };

function mergeBandsByOktas(bands: RouteCloudBand3d[]): RouteCloudDeck[] {
  const sorted = [...bands].sort((a, b) => a.lowerFt - b.lowerFt);
  const out: RouteCloudDeck[] = [];
  for (const band of sorted) {
    const oktas = coverPctToOktas(band.coverPct);
    if (!oktas) continue;
    const last = out[out.length - 1];
    if (last && last.oktas === oktas && band.lowerFt <= last.upperFt + 450) {
      last.upperFt = Math.max(last.upperFt, band.upperFt);
      last.coverPct = Math.max(last.coverPct, band.coverPct);
      last.heightFt = (last.heightFt + band.heightFt) / 2;
      continue;
    }
    out.push({ ...band, oktas });
  }
  return out;
}

export function metarFlightRule(parsed: AiswebParsedMetar | null | undefined): MetarFlightRule {
  if (!parsed) return "unknown";
  if (parsed.cavok) return "vfr";
  const visIfr = parsed.visibilityKm != null && parsed.visibilityKm < IFR_VIS_KM;
  const ceilIfr = parsed.ceilingFt != null && parsed.ceilingFt < IFR_CEILING_FT;
  if (visIfr || ceilIfr) return "ifr";
  const visMvfr = parsed.visibilityKm != null && parsed.visibilityKm <= VFR_VIS_KM;
  const ceilMvfr = parsed.ceilingFt != null && parsed.ceilingFt <= VFR_CEILING_FT;
  if (visMvfr || ceilMvfr) return "mvfr";
  if (parsed.visibilityKm == null && parsed.ceilingFt == null) {
    return "unknown";
  }
  return "vfr";
}

export function metarFlightRuleColor(rule: MetarFlightRule): string {
  if (rule === "ifr") return "#ef4444";
  if (rule === "mvfr") return "#3b82f6";
  if (rule === "vfr") return "#22c55e";
  return "#64748b";
}

export function metarAirportBundle(hit: MetarCloudHit): AiswebAirportBundle {
  return {
    icao: hit.icao,
    met: {
      icao: hit.icao,
      metar: hit.metar,
      taf: hit.taf,
      parsed: parseMetar(hit.metar) || null,
    },
    rotaer: null,
    notams: [],
    supplements: [],
    adWarnings: [],
    sun: null,
    charts: [],
    airspace: null,
  };
}

export function buildRouteCloudPuffs3d(input: {
  samples: RouteCloudSample3d[];
  exaggeration: number;
  lite: boolean;
}): RouteCloudPuff3d[] {
  const { samples, exaggeration, lite } = input;
  if (samples.length < 2) return [];
  const halfW = (ROUTE_CLOUD_WIDTH_NM * NM_IN_M) / 2;
  const puffs: RouteCloudPuff3d[] = [];
  const cap = lite ? 640 : 1100;

  const byLane: Record<RouteCloudLane, RouteCloudSample3d[]> = {
    center: [],
    left: [],
    right: [],
  };
  for (const sample of samples) byLane[sample.lane].push(sample);
  for (const lane of Object.keys(byLane) as RouteCloudLane[]) {
    byLane[lane].sort((a, b) => a.alongIndex - b.alongIndex);
  }

  const order = samples
    .map((_, i) => i)
    .sort((a, b) => {
      const rank = (lane: RouteCloudLane) => (lane === "center" ? 0 : 1);
      return rank(samples[a]!.lane) - rank(samples[b]!.lane) || a - b;
    });

  for (const i of order) {
    const sample = samples[i]!;
    const lanePts = byLane[sample.lane];
    const idx = lanePts.findIndex((s) => s.alongIndex === sample.alongIndex);
    const prev = lanePts[Math.max(0, idx - 1)] ?? sample;
    const next = lanePts[Math.min(lanePts.length - 1, idx + 1)] ?? sample;
    const x0 = (prev.x + sample.x) / 2;
    const z0 = (prev.z + sample.z) / 2;
    const x1 = (sample.x + next.x) / 2;
    const z1 = (sample.z + next.z) / 2;
    const span = Math.hypot(x1 - x0, z1 - z0);
    if (span < 40) continue;

    const acrossSpan = sample.lane === "center" ? halfW : halfW * 0.45;
    const slotW = (2 * acrossSpan) / 8;
    const decks = mergeBandsByOktas(
      lite ? sample.bands.filter((band) => band.hPa > 700) : sample.bands,
    );
    for (const deck of decks) {
      const oktas = deck.oktas;
      const dense = deck.coverPct >= 80;
      const y0 = altFtToY(Math.max(sample.groundFt, deck.lowerFt), exaggeration);
      const y1 = altFtToY(Math.max(deck.upperFt, deck.lowerFt + 180), exaggeration);
      const bandH = Math.max(24, y1 - y0);
      const alongMax = dense
        ? lite
          ? 4
          : sample.lane === "center"
            ? 6
            : 3
        : sample.lane === "center"
          ? 5
          : 3;
      const alongCount = dense
        ? Math.max(2, Math.min(alongMax, Math.round(span / Math.max(slotW, 1))))
        : Math.max(1, Math.min(alongMax, oktas <= 2 ? 3 : oktas <= 4 ? 4 : 5));
      const alongPitch = span / alongCount;
      const puffR =
        (dense
          ? Math.max(slotW * (oktas >= 8 ? 0.78 : 0.62), alongPitch * 0.56)
          : slotW * (1.08 + oktas * 0.08)) * (lite ? 0.9 : 1);
      const startSlot = Math.floor(hashUnit(sample.lat * 10 + sample.lng + deck.hPa) * 8);
      const acrossCount = dense ? oktas : Math.max(1, Math.round(oktas * 0.9));
      for (let row = 0; row < alongCount; row++) {
        const u = Math.min(
          1,
          Math.max(
            0,
            (row + 0.5) / alongCount + (hashUnit(sample.lat * 7 + sample.lng + deck.hPa + row * 19) - 0.5) * (dense ? 0 : 0.16),
          ),
        );
        const cx = x0 + (x1 - x0) * u;
        const cz = z0 + (z1 - z0) * u;
        for (let k = 0; k < acrossCount; k++) {
          if (puffs.length >= cap) return puffs;
          const slot = (startSlot + k) % 8;
          const seed = sample.lat * 100 + sample.lng * 10 + deck.hPa * 3 + k * 17 + row * 53 + i * 101;
          const across = ((slot + 0.5) / 8) * 2 - 1 + (hashUnit(seed) * 2 - 1) * (dense ? 0.08 : 0.14);
          const up = dense && oktas >= 8 ? 0.45 : 0.22 + hashUnit(seed + 4.1) * 0.5;
          const jitter = 0.88 + hashUnit(seed + 8.3) * 0.22;
          puffs.push({
            x: cx + sample.nx * acrossSpan * across,
            y: y0 + bandH * up,
            z: cz + sample.nz * acrossSpan * across,
            sx: puffR * jitter,
            sy: (dense && oktas >= 7 ? Math.max(puffR * 0.5, bandH * 0.38) : puffR * 0.66) * jitter,
            sz: puffR * (0.9 + hashUnit(seed + 2.2) * 0.2) * jitter,
            sampleIndex: i,
          });
        }
      }
    }
  }
  return puffs;
}

function bandsFromLevels(levels: OpenMeteoCloudLevel[], groundFt: number): RouteCloudBand3d[] {
  const sorted = [...levels].sort((a, b) => a.heightFt - b.heightFt);
  return sorted.map((level, i) => {
    const prev = sorted[i - 1];
    const next = sorted[i + 1];
    const lowerFt = Math.max(
      groundFt,
      prev ? (prev.heightFt + level.heightFt) / 2 : level.heightFt - 350,
    );
    const upperFt = Math.max(
      lowerFt + 180,
      next ? (level.heightFt + next.heightFt) / 2 : level.heightFt + 500,
    );
    return {
      hPa: level.hPa,
      heightFt: level.heightFt,
      coverPct: level.coverPct,
      lowerFt,
      upperFt,
    };
  });
}

/** ICAO oktas: FEW 1–2, SCT 3–4, BKN 5–7, OVC 8. Midpoint used for 3D fill. */
function oktasForCover(cover: string): number {
  switch (cover) {
    case "FEW":
      return 2;
    case "SCT":
      return 4;
    case "BKN":
      return 6;
    case "OVC":
    case "VV":
      return 8;
    default:
      return 0;
  }
}

function coverFillFraction(cover: string): number {
  switch (cover) {
    case "FEW":
      return 1.5 / 8;
    case "SCT":
      return 3.5 / 8;
    case "BKN":
      return 6 / 8;
    case "OVC":
    case "VV":
      return 1;
    default:
      return 0;
  }
}

export function isValidMetar(
  met: AiswebMetarTaf | undefined,
  parsed: AiswebParsedMetar | null,
): boolean {
  if (!parsed) return false;
  const raw = String(met?.metar || "").trim();
  if (!raw) return false;
  if (/^(NIL|NO DATA|UNAVAILABLE)\b/i.test(raw)) return false;
  return /\b\d{6}Z\b/.test(raw) || /\bCAVOK\b/.test(raw) || /\b\d{2,3}KT\b/.test(raw);
}

function layerThicknessFt(layer: AiswebCloudLayer): number {
  if (layer.convect === "CB") return 8_000;
  if (layer.convect === "TCU") return 5_000;
  if (layer.cover === "OVC" || layer.cover === "VV") return 1_600;
  if (layer.cover === "BKN") return 1_200;
  return 800;
}

function layerColor(layer: AiswebCloudLayer): string {
  if (layer.convect === "CB") return "#9f1239";
  if (layer.convect === "TCU") return "#334155";
  if (layer.cover === "OVC" || layer.cover === "VV") return "#cbd5e1";
  if (layer.cover === "BKN") return "#94a3b8";
  return "#e2e8f0";
}

function hasFog(parsed: AiswebParsedMetar): boolean {
  return (parsed.weather || []).some((token) => /\b(FG|BR|HZ|FU)\b/i.test(token));
}

function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function addIcao(out: string[], seen: Set<string>, raw: string | null | undefined) {
  const code = String(raw || "")
    .trim()
    .toUpperCase();
  if (!ICAO_RE.test(code) || seen.has(code)) return;
  seen.add(code);
  out.push(code);
}

export function collectMetarIcaos(
  waypoints: FlightPlanWaypoint[],
  alternates: string[] = [],
  visibleAerodromes: Aerodrome[] = [],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const wp of waypoints) {
    if (wp.kind === "airport" || wp.kind === "origin" || wp.kind === "destination") {
      addIcao(out, seen, wp.label);
      addIcao(out, seen, wp.raw);
    } else {
      addIcao(out, seen, wp.label);
    }
  }
  for (const icao of alternates) addIcao(out, seen, icao);
  for (const ad of visibleAerodromes) addIcao(out, seen, ad.icao);
  return out.slice(0, METAR_MAX_ICAOS);
}

type StationFix = {
  icao: string;
  lat: number;
  lng: number;
  elevFt: number | null;
};

export function resolveMetarStationFixes(
  icaos: string[],
  waypoints: FlightPlanWaypoint[],
  aerodromes: Aerodrome[],
): StationFix[] {
  const byIcao = new Map<string, StationFix>();
  for (const wp of waypoints) {
    const code = wp.label.trim().toUpperCase();
    if (!ICAO_RE.test(code)) continue;
    byIcao.set(code, {
      icao: code,
      lat: wp.lat,
      lng: wp.lng,
      elevFt: wp.fieldElevFt ?? null,
    });
  }
  for (const ad of aerodromes) {
    const code = ad.icao.trim().toUpperCase();
    if (!ICAO_RE.test(code) || ad.latitudeGeoPoint == null || ad.longitudeGeoPoint == null) continue;
    const prev = byIcao.get(code);
    byIcao.set(code, {
      icao: code,
      lat: ad.latitudeGeoPoint,
      lng: ad.longitudeGeoPoint,
      elevFt: prev?.elevFt ?? parseFieldElevationFt(ad.altitudeText),
    });
  }
  return icaos
    .map((icao) => byIcao.get(icao))
    .filter((fix): fix is StationFix => Boolean(fix));
}

function parsedMetar(met: AiswebMetarTaf | null | undefined): AiswebParsedMetar | null {
  if (!met) return null;
  if (met.parsed) return met.parsed;
  return parseMetar(met.metar);
}

export function sampleRouteCloudPoints(
  waypoints: FlightPlanWaypoint[],
  lite: boolean,
): RouteCloudSamplePoint[] {
  if (waypoints.length < 2) return [];
  let totalNm = 0;
  for (let i = 1; i < waypoints.length; i++) {
    totalNm += haversineM(waypoints[i - 1]!, waypoints[i]!) / NM_IN_M;
  }
  if (!(totalNm > 0)) {
    const first = waypoints[0]!;
    return [{ lat: first.lat, lng: first.lng, lane: "center", alongIndex: 0 }];
  }
  const max = lite ? ROUTE_CLOUD_MAX_SAMPLES_LITE : ROUTE_CLOUD_MAX_SAMPLES;
  const count = Math.min(max, Math.max(2, Math.ceil(totalNm / ROUTE_CLOUD_SPACING_NM) + 1));
  const along: Array<{ lat: number; lng: number }> = [];
  for (let i = 0; i < count; i++) {
    const xNm = (i / (count - 1)) * totalNm;
    const ll = pointAlongRoute(waypoints, xNm);
    if (ll) along.push(ll);
  }
  const lateralM = ROUTE_CLOUD_LATERAL_NM * NM_IN_M;
  const out: RouteCloudSamplePoint[] = [];
  for (let i = 0; i < along.length; i++) {
    const p = along[i]!;
    out.push({ lat: p.lat, lng: p.lng, lane: "center", alongIndex: i });
    const prev = along[Math.max(0, i - 1)]!;
    const next = along[Math.min(along.length - 1, i + 1)]!;
    const brg = calcTrueBearing(prev, next);
    const left = destinationPoint(p.lat, p.lng, brg - 90, lateralM);
    const right = destinationPoint(p.lat, p.lng, brg + 90, lateralM);
    out.push({ lat: left.lat, lng: left.lng, lane: "left", alongIndex: i });
    out.push({ lat: right.lat, lng: right.lng, lane: "right", alongIndex: i });
  }
  return out;
}

export function buildMetarCloudStations3d(input: {
  mets: AiswebMetarTaf[];
  fixes: StationFix[];
  origin: EnuOrigin;
  exaggeration: number;
  terrain: TerrainGrid | null;
}): MetarCloudStation3d[] {
  const { mets, fixes, origin, exaggeration, terrain } = input;
  const radiusM = METAR_CLOUD_RADIUS_NM * NM_IN_M;
  const metByIcao = new Map(mets.map((m) => [m.icao.trim().toUpperCase(), m]));
  const stations: MetarCloudStation3d[] = [];

  for (const fix of fixes) {
    const met = metByIcao.get(fix.icao);
    const parsed = parsedMetar(met);
    if (!isValidMetar(met, parsed) || !parsed) continue;

    const flightRule = metarFlightRule(parsed);
    const groundM = terrain ? sampleGridHeightM(terrain, fix.lat, fix.lng) : 0;
    const elevFt =
      fix.elevFt != null && Number.isFinite(fix.elevFt) ? fix.elevFt : groundM / FT_TO_M;
    const enu = lngLatToEnu(fix.lat, fix.lng, origin);
    const instances: MetarCloudInstance[] = [];
    const layers = (parsed.clouds || []).filter((c) => c.heightFt != null && c.heightFt > 0);
    const ringY = altFtToY(elevFt + 60, exaggeration);

    instances.push({
      kind: "ring",
      x: enu.x,
      y: ringY,
      z: enu.z,
      sx: radiusM,
      sy: 1,
      sz: radiusM,
      color: metarFlightRuleColor(flightRule),
      opacity: 0.92,
    });

    if (hasFog(parsed)) {
      instances.push({
        kind: "fog",
        x: enu.x,
        y: altFtToY(elevFt + 180, exaggeration),
        z: enu.z,
        sx: radiusM,
        sy: Math.max(12, altFtToY(280, exaggeration) * 0.5),
        sz: radiusM,
        color: "#94a3b8",
        opacity: 0.18,
      });
    }

    if (!parsed.cavok) {
      layers.forEach((layer, layerIdx) => {
        const oktas = oktasForCover(layer.cover);
        if (!oktas) return;
        const baseFt = elevFt + (layer.heightFt as number);
        const y = altFtToY(baseFt, exaggeration);
        const thickY = Math.max(18, altFtToY(layerThicknessFt(layer), exaggeration));
        const fill = coverFillFraction(layer.cover);
        const color = layerColor(layer);
        const seed = hashSeed(`${fix.icao}:${layer.raw}:${layerIdx}`);
        const startSector = seed % 8;
        const sector = (Math.PI * 2) / 8;
        const convective = layer.convect === "CB" || layer.convect === "TCU";
        const kind = convective ? "tower" : "puff";
        const puffsPerSector = layer.cover === "BKN" && !convective ? 2 : 1;
        const puffR = radiusM * (0.2 + fill * 0.06);

        if (layer.cover === "OVC" || layer.cover === "VV") {
          instances.push({
            kind: "disc",
            x: enu.x,
            y,
            z: enu.z,
            sx: radiusM,
            sy: 1,
            sz: radiusM,
            color,
            opacity: 0.5,
          });
          if (convective) {
            instances.push({
              kind: "tower",
              x: enu.x,
              y: y + thickY * 0.45,
              z: enu.z,
              sx: puffR * 1.15,
              sy: Math.max(puffR * 1.2, thickY * 0.5),
              sz: puffR * 1.15,
              color,
              opacity: layer.convect === "CB" ? 0.55 : 0.48,
            });
          }
          return;
        }

        for (let k = 0; k < oktas; k++) {
          const sectorIdx = (startSector + k) % 8;
          const mid = (sectorIdx + 0.5) * sector;
          for (let p = 0; p < puffsPerSector; p++) {
            const unit = hashUnit(seed + k * 13 + p * 29);
            const unit2 = hashUnit(seed + k * 17 + p * 41 + 3);
            const ang = mid + (unit * 2 - 1) * sector * 0.28;
            const radial =
              puffsPerSector === 1 ? 0.42 + unit2 * 0.28 : 0.28 + p * 0.4 + unit2 * 0.08;
            const r = radiusM * Math.min(0.88, radial);
            const jitter = 0.86 + unit * 0.22;
            instances.push({
              kind,
              x: enu.x + Math.cos(ang) * r,
              y: y + thickY * (convective ? 0.4 : 0.12),
              z: enu.z + Math.sin(ang) * r,
              sx: puffR * jitter,
              sy: convective ? Math.max(puffR * 1.05, thickY * 0.45) * jitter : puffR * 0.68 * jitter,
              sz: puffR * jitter,
              color,
              opacity: 0.44 + fill * 0.22,
            });
          }
        }
      });
    }

    if (parsed.ceilingFt != null && parsed.ceilingFt < 10_000 && !parsed.cavok) {
      instances.push({
        kind: "ceiling",
        x: enu.x,
        y: altFtToY(elevFt + parsed.ceilingFt, exaggeration),
        z: enu.z,
        sx: radiusM,
        sy: 1,
        sz: radiusM,
        color: "#fb7185",
        opacity: 0.85,
      });
    }

    stations.push({
      icao: fix.icao,
      instances,
      hit: {
        icao: fix.icao,
        x: enu.x,
        y: ringY,
        z: enu.z,
        radiusM,
        layerRaw: layers.map((l) => l.raw).join(" ") || parsed.cloudsText,
        cloudsText: parsed.cloudsText,
        ceilingFt: parsed.ceilingFt,
        observedAt: parsed.observedAt || met?.metar?.match(/\b\d{6}Z\b/)?.[0] || null,
        flightRule,
        metar: met?.metar || "",
        taf: met?.taf || "",
      },
    });
  }

  return stations;
}

export function buildRouteCloudSamples3d(input: {
  forecast: OpenMeteoRoutePoint[];
  origin: EnuOrigin;
  terrain: TerrainGrid | null;
  points?: RouteCloudSamplePoint[];
}): RouteCloudSample3d[] {
  const samples: RouteCloudSample3d[] = input.forecast.map((p, i) => {
    const meta = input.points?.[i];
    const enu = lngLatToEnu(p.lat, p.lng, input.origin);
    const groundM = input.terrain ? sampleGridHeightM(input.terrain, p.lat, p.lng) : 0;
    const groundFt = groundM / FT_TO_M;
    return {
      lat: p.lat,
      lng: p.lng,
      x: enu.x,
      z: enu.z,
      nx: 0,
      nz: 1,
      ax: 0,
      az: 0,
      lane: meta?.lane ?? "center",
      alongIndex: meta?.alongIndex ?? i,
      groundFt,
      precipMm: p.precipitation,
      weatherCode: p.weatherCode,
      time: p.time,
      bands: bandsFromLevels(p.levels, groundFt),
    };
  });

  const centers = samples
    .filter((s) => s.lane === "center")
    .sort((a, b) => a.alongIndex - b.alongIndex);
  const tangentByAlong = new Map<number, { nx: number; nz: number; ax: number; az: number }>();
  for (let i = 0; i < centers.length; i++) {
    const prev = centers[Math.max(0, i - 1)]!;
    const next = centers[Math.min(centers.length - 1, i + 1)]!;
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const ax = i === centers.length - 1 ? centers[i]!.x - prev.x : next.x - centers[i]!.x;
    const az = i === centers.length - 1 ? centers[i]!.z - prev.z : next.z - centers[i]!.z;
    tangentByAlong.set(centers[i]!.alongIndex, {
      nx: -dz / len,
      nz: dx / len,
      ax,
      az,
    });
  }
  for (const sample of samples) {
    const t = tangentByAlong.get(sample.alongIndex);
    if (!t) continue;
    sample.nx = t.nx;
    sample.nz = t.nz;
    sample.ax = t.ax;
    sample.az = t.az;
  }
  return samples;
}
