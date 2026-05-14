import type { TelemetryAlertSeverity } from "../lib/telemetryAlerts";

export type AdminDashboardDateFilters = {
  fromDate: string;
  toDate: string;
  aircrafts?: string[];
  models?: string[];
  instructors?: string[];
  students?: string[];
};

export type AdminDashboardSummary = {
  totalFlights: number;
  executedFlights: number;
  futureFlights: number;
  executedHours: number;
  plannedHours: number;
  landings: number;
  distanceNm: number;
  studentsActive: number;
  instructorsActive: number;
  aircraftActive: number;
  telemetryFlights: number;
  flightsWithoutTelemetry: number;
  hardLandingCount: number;
  alerts: Record<TelemetryAlertSeverity, number>;
  revenue: number;
};

export type AdminDashboardFinance = {
  amountPaid: number;
  purchasedHours: number;
  purchasesCount: number;
};

export type AdminDashboardFlight = {
  id: string;
  status: "executado" | "futuro";
  flightDate: string | null;
  startTime: string | null;
  sourceFilename: string;
  studentUserId: string | null;
  instructorUserId: string | null;
  studentName: string;
  instructorName: string;
  aircraftIdent: string | null;
  aircraftId: string | null;
  aircraftNickname: string | null;
  modelId: string | null;
  modelName: string;
  durationSec: number | null;
  hours: number;
  landings: number;
  distanceNm: number;
  telemetryPresent: boolean;
  takeoffCount: number;
  landingCount: number;
  tglCount: number;
  hardLandingCount: number;
};

export type AdminDashboardAlert = {
  id: string;
  flightId: string;
  severity: TelemetryAlertSeverity;
  ruleName: string;
  phase: string | null;
  matchedAt: string | null;
  flightDate: string | null;
  startTime: string | null;
  durationSec: number | null;
  studentUserId: string | null;
  instructorUserId: string | null;
  studentName: string;
  instructorName: string;
  aircraftIdent: string | null;
  aircraftId: string | null;
  aircraftNickname: string | null;
  modelId: string | null;
  modelName: string;
  createdAt: string;
};

export type AdminDashboardAlertBucket = {
  total: number;
  items: AdminDashboardAlert[];
};

export type AdminDashboardAircraftForecast = {
  aircraftId: string | null;
  aircraftIdent: string;
  aircraftNickname: string | null;
  modelId: string | null;
  modelName: string;
  active: boolean;
  hoursToday: number;
  hoursNext2Days: number;
  hoursNext5Days: number;
  hoursNext7Days: number;
  futureFlights7Days: number;
  nextFlightAt: string | null;
};

export type AdminDashboardAircraftUtilization = {
  aircraftId: string | null;
  aircraftIdent: string;
  aircraftNickname: string | null;
  modelId: string | null;
  modelName: string;
  active: boolean;
  executedFlights: number;
  futureFlights: number;
  executedHours: number;
  landings: number;
  distanceNm: number;
  hardLandingCount: number;
  telemetryFlights: number;
  alertCounts: Record<TelemetryAlertSeverity, number>;
};

export type AdminDashboardData = {
  generatedAt: string;
  filters: AdminDashboardDateFilters;
  summary: AdminDashboardSummary;
  finance: AdminDashboardFinance;
  upcomingFlights: {
    total: number;
    items: AdminDashboardFlight[];
  };
  alertsBySeverity: Record<TelemetryAlertSeverity, AdminDashboardAlertBucket>;
  aircraftForecast: AdminDashboardAircraftForecast[];
  aircraftUtilization: AdminDashboardAircraftUtilization[];
};

export type AdminDashboardParams = AdminDashboardDateFilters & {
  upcomingLimit?: number;
  alertLimit?: number;
};
