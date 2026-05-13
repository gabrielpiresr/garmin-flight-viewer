import { detectFlightSegments } from "./flightSegments";
import { chartDurationSec, summarizeFlight } from "./flightStats";
import type { FlightRecordMeta } from "./flightRecordCodec";
import type { ParseResult } from "./parseGarminCsv";
import type { ChartRow } from "./telemetryCharts";
import type { FlightSegment, LandingMetrics, TakeoffMetrics } from "../types/flight";

export const TELEMETRY_METRICS_VERSION = "2026-05-13.v1";

export type TelemetryIdentity = {
  studentUserId: string;
  instructorUserId?: string | null;
  aircraftIdent?: string | null;
  flightDate?: string | null;
  startTime?: string | null;
};

export type FlightTelemetrySummaryMetrics = TelemetryIdentity & {
  telemetryPresent: boolean;
  parserVersion: string;
  processedAt: string;
  durationSec: number | null;
  distanceM: number | null;
  distanceNm: number | null;
  pointCount: number;
  takeoffCount: number;
  landingCount: number;
  tglCount: number;
  smoothLandingCount: number;
  mediumLandingCount: number;
  hardLandingCount: number;
  bestTouchdownG: number | null;
  bestTouchdownVertSpeedFpm: number | null;
  slowestLandingIasKt: number | null;
  slowestLandingGsKt: number | null;
  maxTouchdownG: number | null;
  maxDescentRateFpm: number | null;
  longestTakeoffGroundRollFt: number | null;
  shortestTakeoffGroundRollFt: number | null;
  fastestTakeoffIasKt: number | null;
  maxHeadwindKt: number | null;
  maxTailwindKt: number | null;
  maxCrosswindKt: number | null;
  aerodromeCount: number;
  aerodromes: string[];
  maxOilPressurePsi: number | null;
  maxOilTempF: number | null;
  maxNormalG: number | null;
  maxLateralG: number | null;
  maxChtF: number | null;
  maxEgtF: number | null;
  maxRpm: number | null;
  maxMapInHg: number | null;
  maxFuelFlowGph: number | null;
  maxFuelPressurePsi: number | null;
  minFuelQty: number | null;
  maxOatC: number | null;
  summaryJson: string;
};

export type FlightLandingMetric = TelemetryIdentity & {
  sequence: number;
  segmentType: "landing" | "tgl";
  touchdownTime: string | null;
  impactLabel: "Low" | "Medium" | "High" | null;
  tdImpactG: number | null;
  tdVertSpeedFpm: number | null;
  tdIasKt: number | null;
  tdGsKt: number | null;
  tdPitchDeg: number | null;
  tdCrabAngleDeg: number | null;
  flareDurationSec: number | null;
  flareDistFt: number | null;
  ldaFt: number | null;
  maxBrakingG: number | null;
};

export type FlightTakeoffMetric = TelemetryIdentity & {
  sequence: number;
  segmentType: "takeoff" | "tgl";
  liftoffTime: string | null;
  groundRollFt: number | null;
  groundRollDurationSec: number | null;
  timeToAgl100Sec: number | null;
  timeToAgl500Sec: number | null;
  rotationIasKt: number | null;
  liftoffIasKt: number | null;
  rpmAtLiftoff: number | null;
  mapAtLiftoff: number | null;
  fuelFlowAtLiftoff: number | null;
};

export type FlightTelemetryMetricsBundle = {
  summary: FlightTelemetrySummaryMetrics;
  landings: FlightLandingMetric[];
  takeoffs: FlightTakeoffMetric[];
};

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function maxOf(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((value): value is number => finite(value) !== null);
  return nums.length ? Math.max(...nums) : null;
}

function minOf(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((value): value is number => finite(value) !== null);
  return nums.length ? Math.min(...nums) : null;
}

function maxRowValue(rows: ChartRow[], keys: string[]): number | null {
  const values: number[] = [];
  rows.forEach((row) => {
    keys.forEach((key) => {
      const value = finite(row[key]);
      if (value !== null) values.push(value);
    });
  });
  return values.length ? Math.max(...values) : null;
}

function minRowValue(rows: ChartRow[], keys: string[]): number | null {
  const values: number[] = [];
  rows.forEach((row) => {
    keys.forEach((key) => {
      const value = finite(row[key]);
      if (value !== null) values.push(value);
    });
  });
  return values.length ? Math.min(...values) : null;
}

function angleDiffDeg(a: number, b: number): number {
  let diff = Math.abs(a - b) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
}

function computeWindComponents(rows: ChartRow[]) {
  let maxHeadwindKt: number | null = null;
  let maxTailwindKt: number | null = null;
  let maxCrosswindKt: number | null = null;

  rows.forEach((row) => {
    const windKt = finite(row.windKt);
    const windDirDeg = finite(row.windDirDeg);
    const referenceDeg = finite(row.hdgMag) ?? finite(row.trackDeg);
    if (windKt === null || windDirDeg === null || referenceDeg === null) return;

    const diffRad = (angleDiffDeg(windDirDeg, referenceDeg) * Math.PI) / 180;
    const headwind = windKt * Math.cos(diffRad);
    const crosswind = Math.abs(windKt * Math.sin(diffRad));
    if (headwind >= 0) maxHeadwindKt = maxOf([maxHeadwindKt, headwind]);
    else maxTailwindKt = maxOf([maxTailwindKt, Math.abs(headwind)]);
    maxCrosswindKt = maxOf([maxCrosswindKt, crosswind]);
  });

  return { maxHeadwindKt, maxTailwindKt, maxCrosswindKt };
}

function timeFromSegmentEvent(segment: FlightSegment, type: string, chartTimeBaseMs: number | null): string | null {
  if (chartTimeBaseMs === null) return null;
  const event = segment.events.find((item) => item.type === type);
  if (!event) return null;
  return new Date(chartTimeBaseMs + event.xMs).toISOString();
}

function aerodromesFromMeta(meta?: FlightRecordMeta | null): string[] {
  if (!meta) return [];
  const codes = new Set<string>();
  meta.legs.forEach((leg) => {
    const dep = leg.dep.trim().toUpperCase();
    const arr = leg.arr.trim().toUpperCase();
    if (dep) codes.add(dep);
    if (arr) codes.add(arr);
  });
  return Array.from(codes).sort((a, b) => a.localeCompare(b));
}

function toLandingMetric(
  segment: FlightSegment,
  sequence: number,
  identity: TelemetryIdentity,
  chartTimeBaseMs: number | null,
): FlightLandingMetric | null {
  const metrics: LandingMetrics | undefined = segment.landingMetrics;
  if (!metrics || (segment.type !== "landing" && segment.type !== "tgl")) return null;
  return {
    ...identity,
    sequence,
    segmentType: segment.type,
    touchdownTime: timeFromSegmentEvent(segment, "touchdown", chartTimeBaseMs),
    impactLabel: metrics.tdImpactLabel,
    tdImpactG: metrics.tdImpactG,
    tdVertSpeedFpm: metrics.tdVertSpeedFpm,
    tdIasKt: metrics.tdIasKt,
    tdGsKt: metrics.tdGsKt,
    tdPitchDeg: metrics.tdPitchDeg,
    tdCrabAngleDeg: metrics.tdCrabAngleDeg,
    flareDurationSec: metrics.flareDurationSec,
    flareDistFt: metrics.flareDistFt,
    ldaFt: metrics.ldaFt,
    maxBrakingG: metrics.maxBrakingG,
  };
}

function toTakeoffMetric(
  segment: FlightSegment,
  sequence: number,
  identity: TelemetryIdentity,
  chartTimeBaseMs: number | null,
): FlightTakeoffMetric | null {
  const metrics: TakeoffMetrics | undefined = segment.takeoffMetrics;
  if (!metrics || (segment.type !== "takeoff" && segment.type !== "tgl")) return null;
  return {
    ...identity,
    sequence,
    segmentType: segment.type,
    liftoffTime: timeFromSegmentEvent(segment, "liftoff", chartTimeBaseMs),
    groundRollFt: metrics.groundRollFt,
    groundRollDurationSec: metrics.groundRollDurationSec,
    timeToAgl100Sec: metrics.timeToAgl100Sec,
    timeToAgl500Sec: metrics.timeToAgl500Sec,
    rotationIasKt: metrics.rotationIasKt,
    liftoffIasKt: metrics.liftoffIasKt,
    rpmAtLiftoff: metrics.rpmAtLiftoff,
    mapAtLiftoff: metrics.mapAtLiftoff,
    fuelFlowAtLiftoff: metrics.fuelFlowAtLiftoff,
  };
}

export function deriveIdentity(params: {
  meta?: FlightRecordMeta | null;
  studentUserId: string;
  instructorUserId?: string | null;
  aircraftIdent?: string | null;
}): TelemetryIdentity {
  return {
    studentUserId: params.studentUserId,
    instructorUserId: params.instructorUserId ?? params.meta?.header.instructorUserId ?? null,
    aircraftIdent: params.aircraftIdent ?? params.meta?.header.aircraft ?? null,
    flightDate: params.meta?.header.date || null,
    startTime: params.meta?.header.startTime?.trim() || null,
  };
}

export function buildFlightTelemetryMetrics(params: {
  parsed: ParseResult;
  identity: TelemetryIdentity;
  meta?: FlightRecordMeta | null;
}): FlightTelemetryMetricsBundle {
  const summary = summarizeFlight(params.parsed.points);
  const durationSec = chartDurationSec(params.parsed.chartData, params.parsed.hasChartTime) ?? summary.durationSec;
  const segments = params.parsed.chartData.length > 0 && params.parsed.hasChartTime
    ? detectFlightSegments(params.parsed.chartData, params.parsed.chartTimeBaseMs, params.parsed.points)
    : [];
  const landings = segments
    .map((segment, index) => toLandingMetric(segment, index + 1, params.identity, params.parsed.chartTimeBaseMs))
    .filter((metric): metric is FlightLandingMetric => Boolean(metric));
  const takeoffs = segments
    .map((segment, index) => toTakeoffMetric(segment, index + 1, params.identity, params.parsed.chartTimeBaseMs))
    .filter((metric): metric is FlightTakeoffMetric => Boolean(metric));
  const aerodromes = aerodromesFromMeta(params.meta);
  const wind = computeWindComponents(params.parsed.chartData);
  const tglCount = segments.filter((segment) => segment.type === "tgl").length;
  const landingImpacts = landings.map((landing) => landing.tdImpactG);
  const landingDescentRates = landings.map((landing) => landing.tdVertSpeedFpm);
  const takeoffRolls = takeoffs.map((takeoff) => takeoff.groundRollFt);
  const takeoffSpeeds = takeoffs.map((takeoff) => takeoff.liftoffIasKt ?? takeoff.rotationIasKt);

  const summaryPayload = {
    columns: params.parsed.telemetryColumns,
    warnings: params.parsed.warnings,
    metaLines: params.parsed.metaLines,
    aerodromes,
    health: {
      maxOilPressurePsi: maxRowValue(params.parsed.chartData, ["oilPsi"]),
      maxOilTempF: maxRowValue(params.parsed.chartData, ["oilTempF"]),
      maxNormalG: maxRowValue(params.parsed.chartData, ["normG"]),
      maxLateralG: maxRowValue(params.parsed.chartData, ["latG"]),
      maxChtF: maxRowValue(params.parsed.chartData, ["cht1F", "cht2F"]),
      maxEgtF: maxRowValue(params.parsed.chartData, ["egt1F", "egt2F"]),
      maxRpm: maxRowValue(params.parsed.chartData, ["rpm"]),
      maxMapInHg: maxRowValue(params.parsed.chartData, ["mapInHg"]),
      maxFuelFlowGph: maxRowValue(params.parsed.chartData, ["fuelFlowGph"]),
      maxFuelPressurePsi: maxRowValue(params.parsed.chartData, ["fuelPressPsi"]),
      minFuelQty: minRowValue(params.parsed.chartData, ["fuelL", "fuelR"]),
      maxOatC: maxRowValue(params.parsed.chartData, ["oatC"]),
    },
  };

  return {
    summary: {
      ...params.identity,
      telemetryPresent: params.parsed.chartData.length > 0 || params.parsed.points.length > 0,
      parserVersion: TELEMETRY_METRICS_VERSION,
      processedAt: new Date().toISOString(),
      durationSec,
      distanceM: summary.distanceM,
      distanceNm: summary.distanceM / 1852,
      pointCount: summary.pointCount,
      takeoffCount: takeoffs.length,
      landingCount: landings.length,
      tglCount,
      smoothLandingCount: landings.filter((landing) => landing.impactLabel === "Low").length,
      mediumLandingCount: landings.filter((landing) => landing.impactLabel === "Medium").length,
      hardLandingCount: landings.filter((landing) => landing.impactLabel === "High").length,
      bestTouchdownG: minOf(landingImpacts),
      bestTouchdownVertSpeedFpm: maxOf(landingDescentRates),
      slowestLandingIasKt: minOf(landings.map((landing) => landing.tdIasKt)),
      slowestLandingGsKt: minOf(landings.map((landing) => landing.tdGsKt)),
      maxTouchdownG: maxOf(landingImpacts),
      maxDescentRateFpm: minOf(landingDescentRates),
      longestTakeoffGroundRollFt: maxOf(takeoffRolls),
      shortestTakeoffGroundRollFt: minOf(takeoffRolls),
      fastestTakeoffIasKt: maxOf(takeoffSpeeds),
      ...wind,
      aerodromeCount: aerodromes.length,
      aerodromes,
      maxOilPressurePsi: summaryPayload.health.maxOilPressurePsi,
      maxOilTempF: summaryPayload.health.maxOilTempF,
      maxNormalG: summaryPayload.health.maxNormalG,
      maxLateralG: summaryPayload.health.maxLateralG,
      maxChtF: summaryPayload.health.maxChtF,
      maxEgtF: summaryPayload.health.maxEgtF,
      maxRpm: summaryPayload.health.maxRpm,
      maxMapInHg: summaryPayload.health.maxMapInHg,
      maxFuelFlowGph: summaryPayload.health.maxFuelFlowGph,
      maxFuelPressurePsi: summaryPayload.health.maxFuelPressurePsi,
      minFuelQty: summaryPayload.health.minFuelQty,
      maxOatC: summaryPayload.health.maxOatC,
      summaryJson: JSON.stringify(summaryPayload),
    },
    landings,
    takeoffs,
  };
}
