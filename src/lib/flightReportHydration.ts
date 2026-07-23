import type { FlightReportColumnKey } from "../types/adminFlightReports";

export type FlightReportTelemetryHydration = "none" | "lean" | "full";

export type FlightReportHydration = {
  telemetry: FlightReportTelemetryHydration;
  landings: boolean;
  evaluations: boolean;
  mission: boolean;
};

export type FlightReportEvaluationFilter = "all" | "evaluated" | "pending";

const LEAN_TELEMETRY_COLUMNS = new Set<string>(["hardLandingCount", "maxTouchdownG"]);

const FULL_TELEMETRY_COLUMNS = new Set<string>([
  "takeoffCount",
  "landingCount",
  "tglCount",
  "smoothLandingCount",
  "mediumLandingCount",
  "bestTouchdownVertSpeedFpm",
  "slowestLandingIasKt",
  "maxDescentRateFpm",
  "longestTakeoffGroundRollFt",
  "shortestTakeoffGroundRollFt",
  "fastestTakeoffIasKt",
  "maxHeadwindKt",
  "maxTailwindKt",
  "maxCrosswindKt",
  "aerodromeCount",
  "aerodromes",
  "maxOilPressurePsi",
  "maxOilTempF",
  "maxNormalG",
  "maxLateralG",
  "maxChtF",
  "maxEgtF",
  "maxRpm",
  "maxMapInHg",
  "maxFuelFlowGph",
  "maxFuelPressurePsi",
  "minFuelQty",
  "maxOatC",
]);

const EVALUATION_COLUMNS = new Set<string>([
  "evaluationPresent",
  "evalScoreInstruction",
  "evalScoreSafety",
  "evalScoreLearning",
  "evalScoreAverage",
  "evalComment",
]);

const TELEMETRY_RANK: Record<FlightReportTelemetryHydration, number> = {
  none: 0,
  lean: 1,
  full: 2,
};

export function deriveFlightReportHydration(
  columns: readonly string[] | null | undefined,
  evaluationFilter: FlightReportEvaluationFilter = "all",
): FlightReportHydration {
  if (!columns?.length) {
    return { telemetry: "none", landings: false, evaluations: false, mission: false };
  }

  const set = new Set(columns);
  let telemetry: FlightReportTelemetryHydration = "none";
  if ([...set].some((key) => FULL_TELEMETRY_COLUMNS.has(key))) telemetry = "full";
  else if ([...set].some((key) => LEAN_TELEMETRY_COLUMNS.has(key))) telemetry = "lean";

  return {
    telemetry,
    landings: set.has("fastestLandingIasKt"),
    evaluations:
      [...set].some((key) => EVALUATION_COLUMNS.has(key)) ||
      evaluationFilter === "evaluated" ||
      evaluationFilter === "pending",
    mission: set.has("missionName") || set.has("trainingTrackName"),
  };
}

export function flightReportHydrationKey(hydration: FlightReportHydration): string {
  return `${hydration.telemetry}|${hydration.landings ? 1 : 0}|${hydration.evaluations ? 1 : 0}|${hydration.mission ? 1 : 0}`;
}

/** True when `needed` requires data not covered by `loaded`. */
export function flightReportHydrationNeedsReload(
  loaded: FlightReportHydration | null,
  needed: FlightReportHydration,
): boolean {
  if (!loaded) return true;
  if (TELEMETRY_RANK[needed.telemetry] > TELEMETRY_RANK[loaded.telemetry]) return true;
  if (needed.landings && !loaded.landings) return true;
  if (needed.evaluations && !loaded.evaluations) return true;
  if (needed.mission && !loaded.mission) return true;
  return false;
}

export function mergeFlightReportHydration(
  current: FlightReportHydration,
  next: FlightReportHydration,
): FlightReportHydration {
  const telemetry =
    TELEMETRY_RANK[next.telemetry] >= TELEMETRY_RANK[current.telemetry] ? next.telemetry : current.telemetry;
  return {
    telemetry,
    landings: current.landings || next.landings,
    evaluations: current.evaluations || next.evaluations,
    mission: current.mission || next.mission,
  };
}

export type BuiltinReportPreset = {
  id: string;
  name: string;
  description: string;
  selectedColumns: FlightReportColumnKey[];
};

export const BUILTIN_FLIGHT_REPORT_PRESETS: BuiltinReportPreset[] = [
  {
    id: "operacional",
    name: "Operacional",
    description: "Carga leve: status, horário, tripulação e totais do voo.",
    selectedColumns: [
      "status",
      "flightDate",
      "startTime",
      "aircraftIdent",
      "modelName",
      "studentName",
      "instructorName",
      "hours",
      "landings",
      "distanceNm",
      "telemetryPresent",
    ],
  },
  {
    id: "pousos",
    name: "Telemetria · Pousos",
    description: "Classificação de pousos, G e IAS no toque.",
    selectedColumns: [
      "status",
      "flightDate",
      "aircraftIdent",
      "studentName",
      "instructorName",
      "telemetryPresent",
      "takeoffCount",
      "landingCount",
      "tglCount",
      "smoothLandingCount",
      "mediumLandingCount",
      "hardLandingCount",
      "maxTouchdownG",
      "maxDescentRateFpm",
      "slowestLandingIasKt",
      "fastestLandingIasKt",
    ],
  },
  {
    id: "telemetria",
    name: "Telemetria · Completa",
    description: "Pousos, vento, motor e aeródromos.",
    selectedColumns: [
      "status",
      "flightDate",
      "aircraftIdent",
      "studentName",
      "instructorName",
      "telemetryPresent",
      "takeoffCount",
      "landingCount",
      "tglCount",
      "smoothLandingCount",
      "mediumLandingCount",
      "hardLandingCount",
      "maxTouchdownG",
      "maxDescentRateFpm",
      "slowestLandingIasKt",
      "fastestLandingIasKt",
      "longestTakeoffGroundRollFt",
      "shortestTakeoffGroundRollFt",
      "fastestTakeoffIasKt",
      "maxHeadwindKt",
      "maxTailwindKt",
      "maxCrosswindKt",
      "aerodromeCount",
      "aerodromes",
      "maxOilPressurePsi",
      "maxOilTempF",
      "maxNormalG",
      "maxLateralG",
      "maxChtF",
      "maxEgtF",
      "maxRpm",
      "maxMapInHg",
      "maxFuelFlowGph",
      "maxFuelPressurePsi",
      "minFuelQty",
      "maxOatC",
    ],
  },
  {
    id: "avaliacao",
    name: "Avaliação",
    description: "Notas e comentário do instrutor.",
    selectedColumns: [
      "status",
      "flightDate",
      "aircraftIdent",
      "studentName",
      "instructorName",
      "hours",
      "evaluationPresent",
      "evalScoreInstruction",
      "evalScoreSafety",
      "evalScoreLearning",
      "evalScoreAverage",
      "evalComment",
    ],
  },
  {
    id: "treinamento",
    name: "Treinamento",
    description: "Missão e rota de instrução.",
    selectedColumns: [
      "status",
      "flightDate",
      "startTime",
      "aircraftIdent",
      "studentName",
      "instructorName",
      "trainingTrackName",
      "missionName",
      "route",
      "hours",
      "landings",
    ],
  },
];
