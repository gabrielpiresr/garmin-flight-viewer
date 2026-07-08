export type AdminFlightReportStatus = "Pendente" | "Confirmado" | "Previsto" | "Cancelado" | "Realizado";

export type FlightReportGroupKey = "day" | "week" | "month" | "year" | "model" | "aircraft" | "instructor" | "student";

export type FlightReportMetricKey = "hours" | "flightCount" | "landings" | "distanceNm";

export type FlightReportColumnKey =
  | "status"
  | "flightDate"
  | "startTime"
  | "studentName"
  | "instructorName"
  | "aircraftIdent"
  | "aircraftNickname"
  | "modelName"
  | "sourceFilename"
  | "route"
  | "durationSec"
  | "hours"
  | "landings"
  | "distanceNm"
  | "scheduleWeekStart"
  | "flightCount"
  | "executedCount"
  | "futureCount"
  | "telemetryPresent"
  | "pointCount"
  | "takeoffCount"
  | "landingCount"
  | "tglCount"
  | "smoothLandingCount"
  | "mediumLandingCount"
  | "hardLandingCount"
  | "bestTouchdownG"
  | "bestTouchdownVertSpeedFpm"
  | "slowestLandingIasKt"
  | "slowestLandingGsKt"
  | "fastestLandingIasKt"
  | "maxTouchdownG"
  | "maxDescentRateFpm"
  | "longestTakeoffGroundRollFt"
  | "shortestTakeoffGroundRollFt"
  | "fastestTakeoffIasKt"
  | "maxHeadwindKt"
  | "maxTailwindKt"
  | "maxCrosswindKt"
  | "aerodromeCount"
  | "aerodromes"
  | "maxOilPressurePsi"
  | "maxOilTempF"
  | "maxNormalG"
  | "maxLateralG"
  | "maxChtF"
  | "maxEgtF"
  | "maxRpm"
  | "maxMapInHg"
  | "maxFuelFlowGph"
  | "maxFuelPressurePsi"
  | "minFuelQty"
  | "maxOatC";

export type AdminFlightTelemetrySummary = {
  telemetryPresent: boolean;
  telemetryDurationSec: number | null;
  telemetryDistanceNm: number | null;
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
  fastestLandingIasKt: number | null;
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
};

export type AdminFlightReportRow = {
  id: string;
  status: AdminFlightReportStatus;
  isGhostFlight?: boolean;
  ghostObservation?: string;
  mergeBlockedReason?: string;
  matchScore?: number;
  createdAt: string;
  updatedAt: string;
  sourceFilename: string;
  aircraftIdent: string | null;
  aircraftNickname: string | null;
  aircraftId: string | null;
  modelId: string | null;
  modelName: string;
  modelManufacturer: string;
  operationalLimits: {
    oilTempUnit: "C" | "F";
    oilTempAttention: number | null;
    oilTempDanger: number | null;
    oilPressureAttentionPsi: number | null;
    oilPressureDangerPsi: number | null;
    rpmAttention: number | null;
    rpmDanger: number | null;
    fuelPressureAttentionPsi: number | null;
    fuelPressureDangerPsi: number | null;
    gloadAttention: number | null;
    gloadDanger: number | null;
    touchdownIasAttentionKt: number | null;
    touchdownIasDangerKt: number | null;
    bestClimbAfterTakeoffKt: number | null;
  };
  durationSec: number | null;
  hours: number;
  flightDate: string | null;
  startTime: string | null;
  route: string;
  landings: number;
  distanceNm: number;
  studentName: string;
  studentAnac: string;
  instructorName: string;
  instructorAnac: string;
  scheduleWeekStart: string | null;
  scheduleDemandId: string | null;
  studentUserId: string | null;
  instructorUserId: string | null;
  firstDepIcao: string | null;
  lastArrIcao: string | null;
  telemetryPresentOnDoc: boolean;
  telemetry: AdminFlightTelemetrySummary | null;
};

export type AdminFlightReportPage = {
  flights: AdminFlightReportRow[];
  total: number;
  limit: number;
  nextCursor: string | null;
};

export type AdminFlightReportParams = {
  fromDate?: string;
  toDate?: string;
  aircrafts?: string[];
  models?: string[];
  instructors?: string[];
  students?: string[];
  status?: AdminFlightReportStatus | "all";
  ghostMode?: "exclude" | "include" | "only";
  limit?: number;
  cursor?: string | null;
};
