import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { listAdminFlightReports } from "../../lib/adminUsersDb";
import { downloadCsv } from "../../lib/csvExport";
import {
  BUILTIN_FLIGHT_REPORT_PRESETS,
  deriveFlightReportHydration,
  flightReportHydrationKey,
  type FlightReportHydration,
} from "../../lib/flightReportHydration";
import type {
  AdminFlightReportRow,
  AdminFlightReportStatus,
  FlightReportColumnKey,
  FlightReportGroupKey,
  FlightReportMetricKey,
} from "../../types/adminFlightReports";
import { FlightDetailView } from "../FlightDetailView";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/ToastProvider";

type ViewMode = "table" | "line" | "bar" | "area" | "donut";
type TemporalGroupKey = Extract<FlightReportGroupKey, "day" | "week" | "month" | "year">;
type DimensionGroupKey = Exclude<FlightReportGroupKey, TemporalGroupKey>;
type ReportColumnKey = FlightReportColumnKey | "group" | "telemetryCount";
type ChartMetricKey = Extract<ReportColumnKey, FlightReportMetricKey | "durationSec" | "flightCount" | "executedCount" | "futureCount" | "telemetryCount" | "takeoffCount" | "landingCount" | "tglCount" | "smoothLandingCount" | "mediumLandingCount" | "hardLandingCount" | "bestTouchdownVertSpeedFpm" | "slowestLandingIasKt" | "fastestLandingIasKt" | "maxTouchdownG" | "maxDescentRateFpm" | "longestTakeoffGroundRollFt" | "shortestTakeoffGroundRollFt" | "fastestTakeoffIasKt" | "maxHeadwindKt" | "maxTailwindKt" | "maxCrosswindKt" | "aerodromeCount" | "maxOilPressurePsi" | "maxOilTempF" | "maxNormalG" | "maxLateralG" | "maxChtF" | "maxEgtF" | "maxRpm" | "maxMapInHg" | "maxFuelFlowGph" | "maxFuelPressurePsi" | "minFuelQty" | "maxOatC">;
type SortDirection = "asc" | "desc";
type ReportRow = AdminFlightReportRow | GroupedReportRow;
type PeriodPresetKey = "custom" | "thisWeek" | "thisMonth" | "last30" | "thisYear" | "lastYear" | "all";
type MultiFilterKey = "models" | "aircrafts" | "instructors" | "students";
type ColumnCategory = "base" | "operation" | "aggregate" | "telemetry" | "landing" | "flight" | "wind" | "engine" | "evaluation";
type SummaryMode = "sum" | "min" | "max";
type ChartDatum = { label: string } & Record<string, string | number>;
type ChartSeries = { key: string; label: string; color: string };
type ChartExportFormat = "svg" | "pdf" | "png";
type EvaluationFilter = "all" | "evaluated" | "pending";
const REPORT_PAGE_SIZE = 100;

type SavedReportPreset = {
  name: string;
  fromDate: string;
  toDate: string;
  models: string[];
  aircrafts: string[];
  instructors: string[];
  students: string[];
  status: AdminFlightReportStatus | "all";
  temporalGroup: TemporalGroupKey | "";
  dimensionGroups: DimensionGroupKey[];
  selectedColumns: ReportColumnKey[];
  view: ViewMode;
  metric: ChartMetricKey;
};

type GroupedReportRow = {
  id: string;
  isGroup: true;
  group: string;
  groupParts: Partial<Record<FlightReportGroupKey, string>>;
  flightCount: number;
  executedCount: number;
  futureCount: number;
  telemetryCount: number;
  durationSec: number;
  hours: number;
  landings: number;
  distanceNm: number;
  status: "";
  flightDate: string | null;
  startTime: "";
  studentName: string;
  instructorName: string;
  aircraftIdent: string;
  aircraftNickname: string;
  modelName: string;
  sourceFilename: "";
  route: "";
  scheduleWeekStart: string | null;
  telemetryPresent: boolean;
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
  operationalLimits: AdminFlightReportRow["operationalLimits"] | null;
  evaluationPresent?: boolean;
  evalScoreInstruction?: number | null;
  evalScoreSafety?: number | null;
  evalScoreLearning?: number | null;
  evalScoreAverage?: number | null;
  evalComment?: string;
};

type ColumnDef = {
  key: ReportColumnKey;
  label: string;
  category: ColumnCategory;
  compact?: boolean;
  groupOnly?: boolean;
  detailOnly?: boolean;
  groupKey?: FlightReportGroupKey;
  sortable?: boolean;
  format: (row: ReportRow) => string;
  sortValue?: (row: ReportRow) => string | number | null;
};

type LimitSeverity = "normal" | "attention" | "danger";

const STORAGE_KEY = "admin-flight-report-presets-v1";
const REMOVED_COLUMN_KEYS = new Set<ReportColumnKey>(["pointCount", "scheduleWeekStart", "slowestLandingGsKt", "bestTouchdownG"]);
const CHART_COLORS = ["#38bdf8", "#34d399", "#f59e0b", "#f472b6", "#a78bfa", "#fb7185", "#22d3ee", "#84cc16"];
const CHART_TOOLTIP_PROPS = {
  contentStyle: { background: "#020617", border: "1px solid #334155", borderRadius: 5.2, color: "#e2e8f0" },
  labelStyle: { color: "#f8fafc" },
  itemStyle: { color: "#e2e8f0" },
};

const TEMPORAL_OPTIONS: Array<{ key: TemporalGroupKey; label: string }> = [
  { key: "day", label: "Dia" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mês" },
  { key: "year", label: "Ano" },
];

const DIMENSION_OPTIONS: Array<{ key: DimensionGroupKey; label: string }> = [
  { key: "model", label: "Modelo" },
  { key: "aircraft", label: "Avião" },
  { key: "instructor", label: "Instrutor" },
  { key: "student", label: "Aluno" },
];

const METRIC_OPTIONS: Array<{ key: ChartMetricKey; label: string }> = [
  { key: "hours", label: "Horas de voo" },
  { key: "flightCount", label: "Quantidade de voos" },
  { key: "landings", label: "Pousos" },
  { key: "distanceNm", label: "Distância (NM)" },
  { key: "durationSec", label: "Duração" },
  { key: "executedCount", label: "Executados" },
  { key: "futureCount", label: "Futuros" },
  { key: "telemetryCount", label: "Com telemetria" },
  { key: "takeoffCount", label: "Decolagens" },
  { key: "landingCount", label: "Pousos detectados" },
  { key: "tglCount", label: "TGL" },
  { key: "smoothLandingCount", label: "Pousos suaves" },
  { key: "mediumLandingCount", label: "Pousos medios" },
  { key: "hardLandingCount", label: "Pousos duros" },
  { key: "fastestLandingIasKt", label: "Max IAS no toque (kt)" },
  { key: "maxTouchdownG", label: "Max toque G" },
  { key: "maxDescentRateFpm", label: "Min VS no toque (fpm)" },
  { key: "longestTakeoffGroundRollFt", label: "Max corrida (ft)" },
  { key: "shortestTakeoffGroundRollFt", label: "Min corrida (ft)" },
  { key: "fastestTakeoffIasKt", label: "Max IAS decol. (kt)" },
  { key: "maxHeadwindKt", label: "Max proa (kt)" },
  { key: "maxTailwindKt", label: "Max cauda (kt)" },
  { key: "maxCrosswindKt", label: "Max traves (kt)" },
  { key: "maxOilPressurePsi", label: "Max óleo (PSI)" },
  { key: "maxOilTempF", label: "Max óleo (F)" },
  { key: "maxNormalG", label: "Max G normal" },
  { key: "maxLateralG", label: "Max G lateral" },
  { key: "maxRpm", label: "Max RPM" },
];

const PERIOD_PRESETS: Array<{ key: PeriodPresetKey; label: string }> = [
  { key: "custom", label: "Personalizado" },
  { key: "thisWeek", label: "Essa semana" },
  { key: "thisMonth", label: "Esse mês" },
  { key: "last30", label: "Últimos 30 dias" },
  { key: "thisYear", label: "Esse ano" },
  { key: "lastYear", label: "Ano passado" },
  { key: "all", label: "Todo período" },
];

const DEFAULT_COLUMNS: ReportColumnKey[] = [
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
];

function isGroupedRow(row: ReportRow): row is GroupedReportRow {
  return "isGroup" in row;
}

function telemetryValue<K extends keyof NonNullable<AdminFlightReportRow["telemetry"]>>(
  row: ReportRow,
  key: K,
): NonNullable<AdminFlightReportRow["telemetry"]>[K] | null {
  if (isGroupedRow(row)) return (row[key as keyof GroupedReportRow] ?? null) as never;
  return row.telemetry?.[key] ?? null;
}

function toFahrenheit(value: number, unit: "C" | "F"): number {
  return unit === "C" ? (value * 9) / 5 + 32 : value;
}

function limitSeverity(value: unknown, attention: number | null | undefined, danger: number | null | undefined): LimitSeverity | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const thresholds = [attention, danger].filter((item): item is number => typeof item === "number" && Number.isFinite(item));
  if (!thresholds.length) return null;
  const [attentionLimit, dangerLimit] = thresholds.sort((a, b) => a - b);
  if (typeof dangerLimit === "number" && value > dangerLimit) return "danger";
  if (value > attentionLimit) return "attention";
  return "normal";
}

function limitsForRow(row: ReportRow): AdminFlightReportRow["operationalLimits"] | null {
  if (!isGroupedRow(row)) return row.operationalLimits ?? null;
  return row.groupParts.model || row.groupParts.aircraft ? row.operationalLimits : null;
}

function relevantLimitsMatch(
  current: AdminFlightReportRow["operationalLimits"] | null,
  next: AdminFlightReportRow["operationalLimits"] | null | undefined,
): boolean {
  if (!current || !next) return current === (next ?? null);
  return current.oilTempUnit === next.oilTempUnit
    && current.oilTempAttention === next.oilTempAttention
    && current.oilTempDanger === next.oilTempDanger
    && current.oilPressureAttentionPsi === next.oilPressureAttentionPsi
    && current.oilPressureDangerPsi === next.oilPressureDangerPsi
    && current.rpmAttention === next.rpmAttention
    && current.rpmDanger === next.rpmDanger
    && current.fuelPressureAttentionPsi === next.fuelPressureAttentionPsi
    && current.fuelPressureDangerPsi === next.fuelPressureDangerPsi
    && current.gloadAttention === next.gloadAttention
    && current.gloadDanger === next.gloadDanger
    && current.touchdownIasAttentionKt === next.touchdownIasAttentionKt
    && current.touchdownIasDangerKt === next.touchdownIasDangerKt;
}

function severityForColumn(row: ReportRow, key: ReportColumnKey): LimitSeverity | null {
  const limits = limitsForRow(row);
  if (!limits) return null;
  if (key === "maxOilTempF") {
    return limitSeverity(
      telemetryValue(row, "maxOilTempF"),
      limits.oilTempAttention !== null ? toFahrenheit(limits.oilTempAttention, limits.oilTempUnit) : null,
      limits.oilTempDanger !== null ? toFahrenheit(limits.oilTempDanger, limits.oilTempUnit) : null,
    );
  }
  if (key === "maxOilPressurePsi") return limitSeverity(telemetryValue(row, "maxOilPressurePsi"), limits.oilPressureAttentionPsi, limits.oilPressureDangerPsi);
  if (key === "maxRpm") return limitSeverity(telemetryValue(row, "maxRpm"), limits.rpmAttention, limits.rpmDanger);
  if (key === "maxFuelPressurePsi") return limitSeverity(telemetryValue(row, "maxFuelPressurePsi"), limits.fuelPressureAttentionPsi, limits.fuelPressureDangerPsi);
  if (key === "maxNormalG") return limitSeverity(telemetryValue(row, "maxNormalG"), limits.gloadAttention, limits.gloadDanger);
  if (key === "maxLateralG") return limitSeverity(telemetryValue(row, "maxLateralG"), limits.gloadAttention, limits.gloadDanger);
  if (key === "maxTouchdownG") return limitSeverity(telemetryValue(row, "maxTouchdownG"), limits.gloadAttention, limits.gloadDanger);
  if (key === "fastestLandingIasKt") return limitSeverity(telemetryValue(row, "fastestLandingIasKt"), limits.touchdownIasAttentionKt, limits.touchdownIasDangerKt);
  return null;
}

function severityHintForColumn(row: ReportRow, key: ReportColumnKey): string | undefined {
  const limits = limitsForRow(row);
  if (!limits) return undefined;
  if (key === "maxOilTempF") {
    const attention = limits.oilTempAttention !== null ? toFahrenheit(limits.oilTempAttention, limits.oilTempUnit) : null;
    const danger = limits.oilTempDanger !== null ? toFahrenheit(limits.oilTempDanger, limits.oilTempUnit) : null;
    return `Valor: ${fmtNumber(telemetryValue(row, "maxOilTempF"), 1)} F | Atenção: ${fmtNumber(attention, 1)} F | Perigo: ${fmtNumber(danger, 1)} F`;
  }
  if (key === "maxOilPressurePsi") {
    return `Valor: ${fmtNumber(telemetryValue(row, "maxOilPressurePsi"), 1)} PSI | Atenção: ${fmtNumber(limits.oilPressureAttentionPsi, 1)} PSI | Perigo: ${fmtNumber(limits.oilPressureDangerPsi, 1)} PSI`;
  }
  if (key === "maxRpm") {
    return `Valor: ${fmtNumber(telemetryValue(row, "maxRpm"), 0)} RPM | Atenção: ${fmtNumber(limits.rpmAttention, 0)} RPM | Perigo: ${fmtNumber(limits.rpmDanger, 0)} RPM`;
  }
  return undefined;
}

function severityClass(severity: LimitSeverity | null): string {
  if (severity === "danger") return "bg-rose-500/15 text-rose-200 ring-1 ring-rose-500/30";
  if (severity === "attention") return "bg-orange-500/15 text-orange-200 ring-1 ring-orange-500/30";
  if (severity === "normal") return "bg-emerald-500/10 text-emerald-200 ring-1 ring-emerald-500/20";
  return "";
}

function fmtNumber(value: unknown, digits = 1): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("pt-BR", { maximumFractionDigits: digits })
    : "";
}

function fmtInt(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value).toLocaleString("pt-BR") : "";
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatDuration(value: number | null | undefined): string {
  if (!value) return "";
  const totalMinutes = Math.round(value / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h${String(minutes).padStart(2, "0")}`;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfIsoWeek(dateText: string): string {
  const date = new Date(`${dateText.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateText.slice(0, 10);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return isoDate(date);
}

function endOfIsoWeek(dateText: string): string {
  const date = new Date(`${startOfIsoWeek(dateText)}T00:00:00`);
  date.setDate(date.getDate() + 6);
  return isoDate(date);
}

function periodForPreset(key: PeriodPresetKey): { fromDate: string; toDate: string } {
  const today = new Date();
  const todayIso = isoDate(today);
  if (key === "all" || key === "custom") return { fromDate: "", toDate: "" };
  if (key === "thisWeek") return { fromDate: startOfIsoWeek(todayIso), toDate: endOfIsoWeek(todayIso) };
  if (key === "thisMonth") return { fromDate: todayIso.slice(0, 8) + "01", toDate: todayIso };
  if (key === "last30") {
    const from = new Date(today);
    from.setDate(from.getDate() - 29);
    return { fromDate: isoDate(from), toDate: todayIso };
  }
  if (key === "thisYear") return { fromDate: `${todayIso.slice(0, 4)}-01-01`, toDate: todayIso };
  const year = Number(todayIso.slice(0, 4)) - 1;
  return { fromDate: `${year}-01-01`, toDate: `${year}-12-31` };
}

function groupLabel(row: AdminFlightReportRow, key: FlightReportGroupKey): string {
  const date = row.flightDate || row.createdAt.slice(0, 10);
  if (key === "day") return date || "Sem data";
  if (key === "week") return date ? startOfIsoWeek(date) : "Sem semana";
  if (key === "month") return date ? date.slice(0, 7) : "Sem mês";
  if (key === "year") return date ? date.slice(0, 4) : "Sem ano";
  if (key === "model") return row.modelName || "Sem modelo";
  if (key === "aircraft") return row.aircraftIdent || "Sem avião";
  if (key === "instructor") return row.instructorName || "Sem instrutor";
  return row.studentName || "Sem aluno";
}

function maxNullable(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

function minNullable(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

const numberSort = (key: keyof GroupedReportRow, telemetryKey?: keyof NonNullable<AdminFlightReportRow["telemetry"]>) =>
  (row: ReportRow) => {
    if (isGroupedRow(row)) return Number(row[key] ?? 0);
    if (telemetryKey) return Number(row.telemetry?.[telemetryKey] ?? 0);
    return Number((row as Record<string, unknown>)[key] ?? 0);
  };

function isScheduledReportStatus(status: AdminFlightReportRow["status"]): boolean {
  return status === "Pendente" || status === "Confirmado" || status === "Previsto";
}

const COLUMNS: ColumnDef[] = [
  { key: "group", label: "Grupo", category: "base", groupOnly: true, sortable: true, format: (row) => (isGroupedRow(row) ? row.group : ""), sortValue: (row) => (isGroupedRow(row) ? row.group : "") },
  { key: "status", label: "Status", category: "base", detailOnly: true, compact: true, sortable: true, format: (row) => (isGroupedRow(row) ? "" : row.status), sortValue: (row) => (isGroupedRow(row) ? "" : row.status) },
  { key: "flightDate", label: "Data", category: "base", groupKey: "day", compact: true, sortable: true, format: (row) => fmtDate(row.flightDate), sortValue: (row) => row.flightDate ?? "" },
  { key: "startTime", label: "Hora", category: "base", detailOnly: true, compact: true, sortable: true, format: (row) => row.startTime || "", sortValue: (row) => row.startTime || "" },
  { key: "studentName", label: "Aluno", category: "base", groupKey: "student", sortable: true, format: (row) => row.studentName || "", sortValue: (row) => row.studentName || "" },
  { key: "instructorName", label: "Instrutor", category: "base", groupKey: "instructor", sortable: true, format: (row) => row.instructorName || "", sortValue: (row) => row.instructorName || "" },
  { key: "aircraftIdent", label: "Avião", category: "base", groupKey: "aircraft", compact: true, sortable: true, format: (row) => row.aircraftIdent || "", sortValue: (row) => row.aircraftIdent || "" },
  { key: "aircraftNickname", label: "Apelido", category: "base", detailOnly: true, format: (row) => row.aircraftNickname || "" },
  { key: "modelName", label: "Modelo", category: "base", groupKey: "model", sortable: true, format: (row) => row.modelName || "", sortValue: (row) => row.modelName || "" },
  { key: "sourceFilename", label: "Arquivo", category: "base", detailOnly: true, format: (row) => row.sourceFilename || "" },
  { key: "route", label: "Rota", category: "operation", detailOnly: true, format: (row) => row.route || "" },
  {
    key: "missionName",
    label: "Missão",
    category: "operation",
    detailOnly: true,
    sortable: true,
    format: (row) => (isGroupedRow(row) ? "" : row.missionName || ""),
    sortValue: (row) => (isGroupedRow(row) ? "" : row.missionName || ""),
  },
  { key: "durationSec", label: "Duração", category: "operation", compact: true, sortable: true, format: (row) => formatDuration(row.durationSec), sortValue: (row) => row.durationSec ?? 0 },
  { key: "hours", label: "Duração", category: "operation", compact: true, sortable: true, format: (row) => row.hours != null && Number.isFinite(row.hours) ? fmtNumber(row.hours, 1) + "h" : "", sortValue: (row) => row.hours ?? 0 },
  { key: "landings", label: "Pousos", category: "operation", compact: true, sortable: true, format: (row) => fmtInt(row.landings), sortValue: (row) => row.landings ?? 0 },
  { key: "distanceNm", label: "Dist. (NM)", category: "operation", compact: true, sortable: true, format: (row) => fmtNumber(row.distanceNm, 1), sortValue: (row) => row.distanceNm ?? 0 },
  { key: "flightCount", label: "Voos", category: "aggregate", compact: true, groupOnly: true, sortable: true, format: (row) => fmtInt(isGroupedRow(row) ? row.flightCount : 1), sortValue: (row) => (isGroupedRow(row) ? row.flightCount : 1) },
  { key: "executedCount", label: "Realizados", category: "aggregate", compact: true, groupOnly: true, sortable: true, format: (row) => fmtInt(isGroupedRow(row) ? row.executedCount : row.status === "Realizado" ? 1 : 0), sortValue: (row) => (isGroupedRow(row) ? row.executedCount : row.status === "Realizado" ? 1 : 0) },
  { key: "futureCount", label: "Agendados", category: "aggregate", compact: true, groupOnly: true, sortable: true, format: (row) => fmtInt(isGroupedRow(row) ? row.futureCount : isScheduledReportStatus(row.status) ? 1 : 0), sortValue: (row) => (isGroupedRow(row) ? row.futureCount : isScheduledReportStatus(row.status) ? 1 : 0) },
  { key: "telemetryCount", label: "Com telemetria", category: "aggregate", compact: true, groupOnly: true, sortable: true, format: (row) => fmtInt(isGroupedRow(row) ? row.telemetryCount : row.telemetry?.telemetryPresent ? 1 : 0), sortValue: (row) => (isGroupedRow(row) ? row.telemetryCount : row.telemetry?.telemetryPresent ? 1 : 0) },
  { key: "telemetryPresent", label: "Telemetria", category: "telemetry", detailOnly: true, compact: true, sortable: true, format: (row) => (isGroupedRow(row) ? "" : row.telemetry?.telemetryPresent || row.telemetryPresentOnDoc ? "Sim" : "Não"), sortValue: (row) => (isGroupedRow(row) ? 0 : row.telemetry?.telemetryPresent || row.telemetryPresentOnDoc ? 1 : 0) },
  { key: "takeoffCount", label: "Decol.", category: "telemetry", compact: true, sortable: true, format: (row) => fmtInt(telemetryValue(row, "takeoffCount")), sortValue: numberSort("takeoffCount", "takeoffCount") },
  { key: "landingCount", label: "Pousos detect.", category: "landing", compact: true, sortable: true, format: (row) => fmtInt(telemetryValue(row, "landingCount")), sortValue: numberSort("landingCount", "landingCount") },
  { key: "tglCount", label: "TGL", category: "landing", compact: true, sortable: true, format: (row) => fmtInt(telemetryValue(row, "tglCount")), sortValue: numberSort("tglCount", "tglCount") },
  { key: "smoothLandingCount", label: "Suaves", category: "landing", compact: true, sortable: true, format: (row) => fmtInt(telemetryValue(row, "smoothLandingCount")), sortValue: numberSort("smoothLandingCount", "smoothLandingCount") },
  { key: "mediumLandingCount", label: "Médios", category: "landing", compact: true, sortable: true, format: (row) => fmtInt(telemetryValue(row, "mediumLandingCount")), sortValue: numberSort("mediumLandingCount", "mediumLandingCount") },
  { key: "hardLandingCount", label: "Duros", category: "landing", compact: true, sortable: true, format: (row) => fmtInt(telemetryValue(row, "hardLandingCount")), sortValue: numberSort("hardLandingCount", "hardLandingCount") },
  { key: "bestTouchdownVertSpeedFpm", label: "Max VS no toque (fpm)", category: "landing", compact: true, sortable: true, format: (row) => fmtNumber(telemetryValue(row, "bestTouchdownVertSpeedFpm"), 0), sortValue: (row) => Number(telemetryValue(row, "bestTouchdownVertSpeedFpm") ?? 0) },
  { key: "slowestLandingIasKt", label: "Min IAS no toque (kt)", category: "landing", compact: true, sortable: true, format: (row) => fmtNumber(telemetryValue(row, "slowestLandingIasKt"), 1), sortValue: (row) => Number(telemetryValue(row, "slowestLandingIasKt") ?? 0) },
  { key: "fastestLandingIasKt", label: "Max IAS no toque (kt)", category: "landing", compact: true, sortable: true, format: (row) => fmtNumber(telemetryValue(row, "fastestLandingIasKt"), 1), sortValue: (row) => Number(telemetryValue(row, "fastestLandingIasKt") ?? 0) },
  { key: "maxTouchdownG", label: "Max toque G", category: "landing", compact: true, sortable: true, format: (row) => fmtNumber(telemetryValue(row, "maxTouchdownG"), 2), sortValue: (row) => Number(telemetryValue(row, "maxTouchdownG") ?? 0) },
  { key: "maxDescentRateFpm", label: "Min VS no toque (fpm)", category: "landing", compact: true, sortable: true, format: (row) => fmtNumber(telemetryValue(row, "maxDescentRateFpm"), 0), sortValue: (row) => Number(telemetryValue(row, "maxDescentRateFpm") ?? 0) },
  { key: "longestTakeoffGroundRollFt", label: "Max corrida (ft)", category: "flight", compact: true, sortable: true, format: (row) => fmtNumber(telemetryValue(row, "longestTakeoffGroundRollFt"), 0), sortValue: (row) => Number(telemetryValue(row, "longestTakeoffGroundRollFt") ?? 0) },
  { key: "shortestTakeoffGroundRollFt", label: "Min corrida (ft)", category: "flight", compact: true, sortable: true, format: (row) => fmtNumber(telemetryValue(row, "shortestTakeoffGroundRollFt"), 0), sortValue: (row) => Number(telemetryValue(row, "shortestTakeoffGroundRollFt") ?? 0) },
  { key: "fastestTakeoffIasKt", label: "Max IAS decol. (kt)", category: "flight", compact: true, sortable: true, format: (row) => fmtNumber(telemetryValue(row, "fastestTakeoffIasKt"), 1), sortValue: (row) => Number(telemetryValue(row, "fastestTakeoffIasKt") ?? 0) },
  { key: "maxHeadwindKt", label: "Max proa (kt)", category: "wind", compact: true, sortable: true, format: (row) => fmtNumber(telemetryValue(row, "maxHeadwindKt"), 1), sortValue: (row) => Number(telemetryValue(row, "maxHeadwindKt") ?? 0) },
  { key: "maxTailwindKt", label: "Max cauda (kt)", category: "wind", compact: true, sortable: true, format: (row) => fmtNumber(telemetryValue(row, "maxTailwindKt"), 1), sortValue: (row) => Number(telemetryValue(row, "maxTailwindKt") ?? 0) },
  { key: "maxCrosswindKt", label: "Max través (kt)", category: "wind", compact: true, sortable: true, format: (row) => fmtNumber(telemetryValue(row, "maxCrosswindKt"), 1), sortValue: (row) => Number(telemetryValue(row, "maxCrosswindKt") ?? 0) },
  { key: "aerodromeCount", label: "Aeródromos", category: "telemetry", compact: true, sortable: true, format: (row) => fmtInt(telemetryValue(row, "aerodromeCount")), sortValue: numberSort("aerodromeCount", "aerodromeCount") },
  { key: "aerodromes", label: "Lista aeródromos", category: "telemetry", format: (row) => (isGroupedRow(row) ? row.aerodromes.join(", ") : row.telemetry?.aerodromes.join(", ") ?? "") },
  { key: "maxOilPressurePsi", label: "Max óleo (PSI)", category: "engine", compact: true, sortable: true, format: (row) => fmtNumber(telemetryValue(row, "maxOilPressurePsi"), 1), sortValue: (row) => Number(telemetryValue(row, "maxOilPressurePsi") ?? 0) },
  { key: "maxOilTempF", label: "Max óleo (F)", category: "engine", compact: true, sortable: true, format: (row) => fmtNumber(telemetryValue(row, "maxOilTempF"), 1), sortValue: (row) => Number(telemetryValue(row, "maxOilTempF") ?? 0) },
  { key: "maxNormalG", label: "Max G normal", category: "flight", compact: true, sortable: true, format: (row) => fmtNumber(telemetryValue(row, "maxNormalG"), 2), sortValue: (row) => Number(telemetryValue(row, "maxNormalG") ?? 0) },
  { key: "maxLateralG", label: "Max G lateral", category: "flight", compact: true, sortable: true, format: (row) => fmtNumber(telemetryValue(row, "maxLateralG"), 2), sortValue: (row) => Number(telemetryValue(row, "maxLateralG") ?? 0) },
  { key: "maxChtF", label: "Max CHT (F)", category: "engine", compact: true, sortable: true, format: (row) => fmtNumber(telemetryValue(row, "maxChtF"), 1), sortValue: (row) => Number(telemetryValue(row, "maxChtF") ?? 0) },
  { key: "maxEgtF", label: "Max EGT (F)", category: "engine", compact: true, sortable: true, format: (row) => fmtNumber(telemetryValue(row, "maxEgtF"), 1), sortValue: (row) => Number(telemetryValue(row, "maxEgtF") ?? 0) },
  { key: "maxRpm", label: "Max RPM", category: "engine", compact: true, sortable: true, format: (row) => fmtNumber(telemetryValue(row, "maxRpm"), 0), sortValue: (row) => Number(telemetryValue(row, "maxRpm") ?? 0) },
  { key: "maxMapInHg", label: "Max MAP (inHg)", category: "engine", compact: true, sortable: true, format: (row) => fmtNumber(telemetryValue(row, "maxMapInHg"), 1), sortValue: (row) => Number(telemetryValue(row, "maxMapInHg") ?? 0) },
  { key: "maxFuelFlowGph", label: "Max fuel flow (gph)", category: "engine", compact: true, sortable: true, format: (row) => fmtNumber(telemetryValue(row, "maxFuelFlowGph"), 1), sortValue: (row) => Number(telemetryValue(row, "maxFuelFlowGph") ?? 0) },
  { key: "maxFuelPressurePsi", label: "Max fuel (PSI)", category: "engine", compact: true, sortable: true, format: (row) => fmtNumber(telemetryValue(row, "maxFuelPressurePsi"), 1), sortValue: (row) => Number(telemetryValue(row, "maxFuelPressurePsi") ?? 0) },
  { key: "minFuelQty", label: "Mín fuel", category: "engine", compact: true, sortable: true, format: (row) => fmtNumber(telemetryValue(row, "minFuelQty"), 1), sortValue: (row) => Number(telemetryValue(row, "minFuelQty") ?? 0) },
  { key: "maxOatC", label: "Max OAT (C)", category: "engine", compact: true, sortable: true, format: (row) => fmtNumber(telemetryValue(row, "maxOatC"), 1), sortValue: (row) => Number(telemetryValue(row, "maxOatC") ?? 0) },
  {
    key: "evaluationPresent",
    label: "Avaliado",
    category: "evaluation",
    detailOnly: true,
    compact: true,
    sortable: true,
    format: (row) => (isGroupedRow(row) ? "" : row.evaluationPresent ? "Sim" : "Não"),
    sortValue: (row) => (isGroupedRow(row) ? 0 : row.evaluationPresent ? 1 : 0),
  },
  {
    key: "evalScoreInstruction",
    label: "Nota instrução",
    category: "evaluation",
    detailOnly: true,
    compact: true,
    sortable: true,
    format: (row) => (isGroupedRow(row) ? "" : fmtNumber(row.evalScoreInstruction ?? null, 0)),
    sortValue: (row) => (isGroupedRow(row) ? 0 : row.evalScoreInstruction ?? 0),
  },
  {
    key: "evalScoreSafety",
    label: "Nota segurança",
    category: "evaluation",
    detailOnly: true,
    compact: true,
    sortable: true,
    format: (row) => (isGroupedRow(row) ? "" : fmtNumber(row.evalScoreSafety ?? null, 0)),
    sortValue: (row) => (isGroupedRow(row) ? 0 : row.evalScoreSafety ?? 0),
  },
  {
    key: "evalScoreLearning",
    label: "Nota aproveitamento",
    category: "evaluation",
    detailOnly: true,
    compact: true,
    sortable: true,
    format: (row) => (isGroupedRow(row) ? "" : fmtNumber(row.evalScoreLearning ?? null, 0)),
    sortValue: (row) => (isGroupedRow(row) ? 0 : row.evalScoreLearning ?? 0),
  },
  {
    key: "evalScoreAverage",
    label: "Média avaliação",
    category: "evaluation",
    detailOnly: true,
    compact: true,
    sortable: true,
    format: (row) => (isGroupedRow(row) ? "" : fmtNumber(row.evalScoreAverage ?? null, 1)),
    sortValue: (row) => (isGroupedRow(row) ? 0 : row.evalScoreAverage ?? 0),
  },
  {
    key: "evalComment",
    label: "Comentário avaliação",
    category: "evaluation",
    detailOnly: true,
    format: (row) => (isGroupedRow(row) ? "" : row.evalComment || ""),
  },
];

const CATEGORY_LABELS: Record<ColumnCategory, string> = {
  base: "Identificação",
  operation: "Operação",
  aggregate: "Agrupados",
  telemetry: "Telemetria",
  landing: "Pouso",
  flight: "Voo",
  wind: "Vento",
  engine: "Motor e ambiente",
  evaluation: "Avaliação do aluno",
};

function aggregateRows(rows: AdminFlightReportRow[], groups: FlightReportGroupKey[]): ReportRow[] {
  if (!groups.length) return rows;
  const byKey = new Map<string, GroupedReportRow>();

  rows.forEach((row) => {
    const groupParts = Object.fromEntries(groups.map((group) => [group, groupLabel(row, group)])) as Partial<Record<FlightReportGroupKey, string>>;
    const key = groups.map((group) => `${group}:${groupParts[group]}`).join("|");
    const current = byKey.get(key);
    const telemetry = row.telemetry;
    const aerodromes = new Set([...(current?.aerodromes ?? []), ...(telemetry?.aerodromes ?? [])]);
    const next: GroupedReportRow =
      current ?? {
        id: key,
        isGroup: true,
        group: groups.map((group) => groupParts[group]).filter(Boolean).join(" · "),
        groupParts,
        flightCount: 0,
        executedCount: 0,
        futureCount: 0,
        telemetryCount: 0,
        durationSec: 0,
        hours: 0,
        landings: 0,
        distanceNm: 0,
        status: "",
        flightDate: row.flightDate,
        startTime: "",
        studentName: groupParts.student ?? "",
        instructorName: groupParts.instructor ?? "",
        aircraftIdent: groupParts.aircraft ?? "",
        aircraftNickname: "",
        modelName: groupParts.model ?? "",
        sourceFilename: "",
        route: "",
        scheduleWeekStart: row.scheduleWeekStart,
        telemetryPresent: false,
        pointCount: 0,
        takeoffCount: 0,
        landingCount: 0,
        tglCount: 0,
        smoothLandingCount: 0,
        mediumLandingCount: 0,
        hardLandingCount: 0,
        bestTouchdownG: null,
        bestTouchdownVertSpeedFpm: null,
        slowestLandingIasKt: null,
        slowestLandingGsKt: null,
        fastestLandingIasKt: null,
        maxTouchdownG: null,
        maxDescentRateFpm: null,
        longestTakeoffGroundRollFt: null,
        shortestTakeoffGroundRollFt: null,
        fastestTakeoffIasKt: null,
        maxHeadwindKt: null,
        maxTailwindKt: null,
        maxCrosswindKt: null,
        aerodromeCount: 0,
        aerodromes: [],
        maxOilPressurePsi: null,
        maxOilTempF: null,
        maxNormalG: null,
        maxLateralG: null,
        maxChtF: null,
        maxEgtF: null,
        maxRpm: null,
        maxMapInHg: null,
        maxFuelFlowGph: null,
        maxFuelPressurePsi: null,
        minFuelQty: null,
        maxOatC: null,
        operationalLimits: row.operationalLimits ?? null,
      };

    if (current && !relevantLimitsMatch(next.operationalLimits, row.operationalLimits)) {
      next.operationalLimits = null;
    }

    next.flightCount += 1;
    next.executedCount += row.status === "Realizado" ? 1 : 0;
    next.futureCount += isScheduledReportStatus(row.status) ? 1 : 0;
    next.telemetryCount += telemetry?.telemetryPresent || row.telemetryPresentOnDoc ? 1 : 0;
    next.durationSec += row.durationSec ?? 0;
    next.hours = Number((next.durationSec / 3600).toFixed(2));
    next.landings += row.landings || 0;
    next.distanceNm = Number((next.distanceNm + (row.distanceNm || 0)).toFixed(1));
    next.telemetryPresent = next.telemetryPresent || Boolean(telemetry?.telemetryPresent || row.telemetryPresentOnDoc);
    next.pointCount += telemetry?.pointCount ?? 0;
    next.takeoffCount += telemetry?.takeoffCount ?? 0;
    next.landingCount += telemetry?.landingCount ?? 0;
    next.tglCount += telemetry?.tglCount ?? 0;
    next.smoothLandingCount += telemetry?.smoothLandingCount ?? 0;
    next.mediumLandingCount += telemetry?.mediumLandingCount ?? 0;
    next.hardLandingCount += telemetry?.hardLandingCount ?? 0;
    next.bestTouchdownG = minNullable(next.bestTouchdownG, telemetry?.bestTouchdownG ?? null);
    next.bestTouchdownVertSpeedFpm = maxNullable(next.bestTouchdownVertSpeedFpm, telemetry?.bestTouchdownVertSpeedFpm ?? null);
    next.slowestLandingIasKt = minNullable(next.slowestLandingIasKt, telemetry?.slowestLandingIasKt ?? null);
    next.slowestLandingGsKt = minNullable(next.slowestLandingGsKt, telemetry?.slowestLandingGsKt ?? null);
    next.fastestLandingIasKt = maxNullable(next.fastestLandingIasKt, telemetry?.fastestLandingIasKt ?? null);
    next.maxTouchdownG = maxNullable(next.maxTouchdownG, telemetry?.maxTouchdownG ?? null);
    next.maxDescentRateFpm = minNullable(next.maxDescentRateFpm, telemetry?.maxDescentRateFpm ?? null);
    next.longestTakeoffGroundRollFt = maxNullable(next.longestTakeoffGroundRollFt, telemetry?.longestTakeoffGroundRollFt ?? null);
    next.shortestTakeoffGroundRollFt = minNullable(next.shortestTakeoffGroundRollFt, telemetry?.shortestTakeoffGroundRollFt ?? null);
    next.fastestTakeoffIasKt = maxNullable(next.fastestTakeoffIasKt, telemetry?.fastestTakeoffIasKt ?? null);
    next.maxHeadwindKt = maxNullable(next.maxHeadwindKt, telemetry?.maxHeadwindKt ?? null);
    next.maxTailwindKt = maxNullable(next.maxTailwindKt, telemetry?.maxTailwindKt ?? null);
    next.maxCrosswindKt = maxNullable(next.maxCrosswindKt, telemetry?.maxCrosswindKt ?? null);
    next.aerodromes = Array.from(aerodromes).sort((a, b) => a.localeCompare(b));
    next.aerodromeCount = next.aerodromes.length || next.aerodromeCount;
    next.maxOilPressurePsi = maxNullable(next.maxOilPressurePsi, telemetry?.maxOilPressurePsi ?? null);
    next.maxOilTempF = maxNullable(next.maxOilTempF, telemetry?.maxOilTempF ?? null);
    next.maxNormalG = maxNullable(next.maxNormalG, telemetry?.maxNormalG ?? null);
    next.maxLateralG = maxNullable(next.maxLateralG, telemetry?.maxLateralG ?? null);
    next.maxChtF = maxNullable(next.maxChtF, telemetry?.maxChtF ?? null);
    next.maxEgtF = maxNullable(next.maxEgtF, telemetry?.maxEgtF ?? null);
    next.maxRpm = maxNullable(next.maxRpm, telemetry?.maxRpm ?? null);
    next.maxMapInHg = maxNullable(next.maxMapInHg, telemetry?.maxMapInHg ?? null);
    next.maxFuelFlowGph = maxNullable(next.maxFuelFlowGph, telemetry?.maxFuelFlowGph ?? null);
    next.maxFuelPressurePsi = maxNullable(next.maxFuelPressurePsi, telemetry?.maxFuelPressurePsi ?? null);
    next.minFuelQty = minNullable(next.minFuelQty, telemetry?.minFuelQty ?? null);
    next.maxOatC = maxNullable(next.maxOatC, telemetry?.maxOatC ?? null);
    byKey.set(key, next);
  });

  return Array.from(byKey.values());
}

function metricValue(row: ReportRow, metric: ChartMetricKey): number {
  if (metric === "hours") return row.hours || 0;
  if (metric === "landings") return row.landings || 0;
  if (metric === "distanceNm") return row.distanceNm || 0;
  if (metric === "flightCount") return isGroupedRow(row) ? row.flightCount : 1;
  return numericColumnValue(row, metric) ?? 0;
}

function sanitizeSelectedColumns(columns: unknown): ReportColumnKey[] {
  if (!Array.isArray(columns)) return DEFAULT_COLUMNS;
  const validKeys = new Set(COLUMNS.map((column) => column.key));
  const sanitized = columns.filter(
    (key): key is ReportColumnKey => typeof key === "string" && validKeys.has(key as ReportColumnKey) && !REMOVED_COLUMN_KEYS.has(key as ReportColumnKey),
  );
  return sanitized.length ? sanitized : DEFAULT_COLUMNS;
}

function sanitizeChartMetric(metric: unknown): ChartMetricKey {
  return METRIC_OPTIONS.some((item) => item.key === metric) ? metric as ChartMetricKey : "hours";
}

function numericColumnValue(row: ReportRow, key: ReportColumnKey): number | null {
  if (key === "flightCount") return isGroupedRow(row) ? row.flightCount : 1;
  if (key === "executedCount") return isGroupedRow(row) ? row.executedCount : row.status === "Realizado" ? 1 : 0;
  if (key === "futureCount") return isGroupedRow(row) ? row.futureCount : isScheduledReportStatus(row.status) ? 1 : 0;
  if (key === "telemetryCount") return isGroupedRow(row) ? row.telemetryCount : row.telemetry?.telemetryPresent ? 1 : 0;
  if (key === "durationSec") return row.durationSec ?? null;
  if (key === "hours") return row.hours ?? null;
  if (key === "landings") return row.landings ?? null;
  if (key === "distanceNm") return row.distanceNm ?? null;
  const value = isGroupedRow(row) ? row[key as keyof GroupedReportRow] : row.telemetry?.[key as keyof NonNullable<AdminFlightReportRow["telemetry"]>];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function summaryModeForColumn(key: ReportColumnKey): SummaryMode | null {
  const sumKeys = new Set<ReportColumnKey>([
    "durationSec",
    "hours",
    "landings",
    "distanceNm",
    "flightCount",
    "executedCount",
    "futureCount",
    "telemetryCount",
    "takeoffCount",
    "landingCount",
    "tglCount",
    "smoothLandingCount",
    "mediumLandingCount",
    "hardLandingCount",
  ]);
  if (sumKeys.has(key)) return "sum";
  if (key === "slowestLandingIasKt" || key === "maxDescentRateFpm" || key === "shortestTakeoffGroundRollFt" || key === "minFuelQty") return "min";
  if (
    key === "bestTouchdownVertSpeedFpm" ||
    key === "fastestLandingIasKt" ||
    key === "maxTouchdownG" ||
    key === "longestTakeoffGroundRollFt" ||
    key === "fastestTakeoffIasKt" ||
    key === "maxHeadwindKt" ||
    key === "maxTailwindKt" ||
    key === "maxCrosswindKt" ||
    key === "maxOilPressurePsi" ||
    key === "maxOilTempF" ||
    key === "maxNormalG" ||
    key === "maxLateralG" ||
    key === "maxChtF" ||
    key === "maxEgtF" ||
    key === "maxRpm" ||
    key === "maxMapInHg" ||
    key === "maxFuelFlowGph" ||
    key === "maxFuelPressurePsi" ||
    key === "maxOatC"
  ) {
    return "max";
  }
  if (key === "bestTouchdownG") return "min";
  return null;
}

function formatSummaryValue(key: ReportColumnKey, value: number): string {
  if (key === "durationSec") return formatDuration(value);
  if (key === "hours") return fmtNumber(value, 2);
  if (
    key === "distanceNm" ||
    key === "slowestLandingIasKt" ||
    key === "fastestLandingIasKt" ||
    key === "fastestTakeoffIasKt" ||
    key === "maxHeadwindKt" ||
    key === "maxTailwindKt" ||
    key === "maxCrosswindKt" ||
    key === "maxOilPressurePsi" ||
    key === "maxOilTempF" ||
    key === "maxChtF" ||
    key === "maxEgtF" ||
    key === "maxMapInHg" ||
    key === "maxFuelFlowGph" ||
    key === "maxFuelPressurePsi" ||
    key === "minFuelQty" ||
    key === "maxOatC"
  ) {
    return fmtNumber(value, 1);
  }
  if (key === "bestTouchdownG" || key === "maxTouchdownG" || key === "maxNormalG" || key === "maxLateralG") return fmtNumber(value, 2);
  if (key === "bestTouchdownVertSpeedFpm" || key === "maxDescentRateFpm") return fmtNumber(value, 0);
  if (key === "longestTakeoffGroundRollFt" || key === "shortestTakeoffGroundRollFt" || key === "maxRpm") return fmtNumber(value, 0);
  return fmtInt(value);
}

function summaryValues(rows: ReportRow[], columns: ColumnDef[]): Record<ReportColumnKey, string> | null {
  if (!rows.length || !columns.length) return null;
  const values = {} as Record<ReportColumnKey, string>;
  columns.forEach((column, index) => {
    if (index === 0) {
      values[column.key] = "Total";
      return;
    }
    const mode = summaryModeForColumn(column.key);
    if (!mode) {
      values[column.key] = "";
      return;
    }
    const numbers = rows.map((row) => numericColumnValue(row, column.key)).filter((value): value is number => value !== null);
    if (!numbers.length) {
      values[column.key] = "";
      return;
    }
    const value = mode === "sum"
      ? numbers.reduce((acc, item) => acc + item, 0)
      : mode === "min"
        ? Math.min(...numbers)
        : Math.max(...numbers);
    values[column.key] = formatSummaryValue(column.key, value);
  });
  return values;
}

function exportCsv(rows: ReportRow[], columns: ColumnDef[], summary: Record<ReportColumnKey, string> | null) {
  downloadCsv(
    [
      columns.map((column) => column.label),
      ...rows.map((row) => columns.map((column) => column.format(row))),
      ...(summary ? [columns.map((column) => summary[column.key] ?? "")] : []),
    ],
    `relatorio-voos-${new Date().toISOString().slice(0, 10)}.csv`,
  );
}

function exportPdf(rows: ReportRow[], columns: ColumnDef[], title: string, summary: Record<ReportColumnKey, string> | null) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;
  const header = columns.map((column) => `<th>${column.label}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${columns.map((column) => `<td>${column.format(row)}</td>`).join("")}</tr>`)
    .join("");
  const summaryRow = summary ? `<tr class="summary">${columns.map((column) => `<td>${summary[column.key] ?? ""}</td>`).join("")}</tr>` : "";
  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
    <html><head><meta charset="utf-8"><title>${title}</title>
    <style>
      body{font-family:Inter,Arial,sans-serif;color:#0f172a;margin:28px}
      h1{font-size:22px;margin:0 0 6px} p{margin:0 0 18px;color:#475569;font-size:12px}
      table{width:100%;border-collapse:collapse;font-size:9px} th,td{border:1px solid #cbd5e1;padding:5px;text-align:left;vertical-align:top}
      th{background:#e2e8f0;font-size:8px;text-transform:uppercase} tr:nth-child(even){background:#f8fafc}.summary{font-weight:700;background:#e2e8f0}
      @media print{body{margin:10mm} table{page-break-inside:auto} tr{page-break-inside:avoid}}
    </style></head><body>
    <h1>${title}</h1><p>Gerado em ${new Date().toLocaleString("pt-BR")} · ${rows.length} linhas</p>
    <table><thead><tr>${header}</tr></thead><tbody>${body}${summaryRow}</tbody></table>
    <script>window.onload=()=>setTimeout(()=>window.print(),250)</script>
    </body></html>`);
  printWindow.document.close();
  return true;
}

function uniqueOptions(rows: AdminFlightReportRow[], getValue: (row: AdminFlightReportRow) => string | null | undefined) {
  return Array.from(new Set(rows.map(getValue).filter((value): value is string => Boolean(value)))).sort((a, b) =>
    a.localeCompare(b),
  );
}

function loadSavedPresets(): SavedReportPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.map((preset) => ({
          ...preset,
          selectedColumns: sanitizeSelectedColumns(preset?.selectedColumns),
          view: preset?.view === "area" || preset?.view === "donut" ? preset.view : preset?.view === "line" || preset?.view === "bar" || preset?.view === "table" ? preset.view : "table",
          metric: sanitizeChartMetric(preset?.metric),
        }))
      : [];
  } catch {
    return [];
  }
}

function savePresets(presets: SavedReportPreset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

function sortRows(rows: ReportRow[], column: ColumnDef | undefined, direction: SortDirection): ReportRow[] {
  if (!column) return rows;
  const multiplier = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const aValue = column.sortValue?.(a) ?? column.format(a);
    const bValue = column.sortValue?.(b) ?? column.format(b);
    if (typeof aValue === "number" || typeof bValue === "number") {
      return ((Number(aValue) || 0) - (Number(bValue) || 0)) * multiplier;
    }
    return String(aValue ?? "").localeCompare(String(bValue ?? "")) * multiplier;
  });
}

function buildChartModel(params: {
  filtered: AdminFlightReportRow[];
  sortedRows: ReportRow[];
  metric: ChartMetricKey;
  temporalGroup: TemporalGroupKey | "";
  dimensionGroups: DimensionGroupKey[];
}): { data: ChartDatum[]; series: ChartSeries[] } {
  if (!params.temporalGroup) {
    return {
      data: params.sortedRows
        .map((row) => ({
          label: isGroupedRow(row) ? row.group : `${fmtDate(row.flightDate)} ${row.aircraftIdent ?? ""}`.trim(),
          value: metricValue(row, params.metric),
        }))
        .filter((item) => Number(item.value) > 0)
        .slice(0, 80),
      series: [{ key: "value", label: METRIC_OPTIONS.find((item) => item.key === params.metric)?.label ?? "Valor", color: CHART_COLORS[0]! }],
    };
  }

  const byPeriod = new Map<string, ChartDatum>();
  const seriesKeys = new Set<string>();
  const splitByAircraft = params.dimensionGroups.includes("aircraft");

  params.filtered.forEach((row) => {
    const period = groupLabel(row, params.temporalGroup as FlightReportGroupKey);
    const seriesKey = splitByAircraft ? row.aircraftIdent || "Sem aviÃ£o" : "Total";
    const current = byPeriod.get(period) ?? { label: period };
    current[seriesKey] = Number(current[seriesKey] ?? 0) + metricValue(row, params.metric);
    byPeriod.set(period, current);
    seriesKeys.add(seriesKey);
  });

  const series = Array.from(seriesKeys)
    .sort((a, b) => a.localeCompare(b))
    .map((key, index) => ({ key, label: key, color: CHART_COLORS[index % CHART_COLORS.length]! }));
  const data = Array.from(byPeriod.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value)
    .filter((item) => series.some((seriesItem) => Number(item[seriesItem.key] ?? 0) > 0))
    .slice(0, 80);

  return { data, series };
}

function donutDataForChart(model: { data: ChartDatum[]; series: ChartSeries[] }): Array<{ name: string; value: number; color: string }> {
  if (model.series.length > 1) {
    return model.series
      .map((series) => ({
        name: series.label,
        value: model.data.reduce((acc, row) => acc + Number(row[series.key] ?? 0), 0),
        color: series.color,
      }))
      .filter((item) => item.value > 0);
  }
  return model.data
    .map((row, index) => ({
      name: String(row.label),
      value: Number(row[model.series[0]?.key ?? "value"] ?? 0),
      color: CHART_COLORS[index % CHART_COLORS.length]!,
    }))
    .filter((item) => item.value > 0);
}

function chartViewIcon(view: ViewMode) {
  if (view === "table") {
    return (
      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M3 4.5A1.5 1.5 0 014.5 3h11A1.5 1.5 0 0117 4.5v11a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 013 15.5v-11zM4.5 6v2.5h11V6h-11zm0 4v2h4v-2h-4zm5.5 0v2h5.5v-2H10zm-5.5 3.5V15h4v-1.5h-4zm5.5 0V15h5.5v-1.5H10z" />
      </svg>
    );
  }
  if (view === "line") {
    return (
      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M3 14l4-5 4 2 5-7" />
      </svg>
    );
  }
  if (view === "bar") {
    return (
      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M4 11h2.5v5H4v-5zm4.75-7h2.5v12h-2.5V4zM13.5 8H16v8h-2.5V8z" />
      </svg>
    );
  }
  if (view === "area") {
    return (
      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M3 15l4.2-6 3.8 3 5-8v11H3z" />
      </svg>
    );
  }
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M10 2.75a7.25 7.25 0 107.25 7.25H13a3 3 0 11-3-3V2.75zm1.5.16V8.5h5.59A7.27 7.27 0 0011.5 2.91z" clipRule="evenodd" />
    </svg>
  );
}

function columnDescription(column: ColumnDef): string {
  const descriptions: Partial<Record<ReportColumnKey, string>> = {
    group: "Chave do agrupamento atual.",
    status: "Indica se o voo ja foi executado ou esta previsto.",
    flightDate: "Data do voo ou do registro usado no relatorio.",
    startTime: "Hora inicial informada para o voo.",
    studentName: "Aluno vinculado ao voo.",
    instructorName: "Instrutor vinculado ao voo.",
    aircraftIdent: "Matricula ou identificacao da aeronave.",
    aircraftNickname: "Apelido cadastrado da aeronave.",
    modelName: "Modelo da aeronave associado ao cadastro.",
    sourceFilename: "Arquivo de origem da telemetria ou ficha.",
    route: "Rota informada no voo.",
    missionName: "Missão de treinamento vinculada ao voo.",
    durationSec: "Duração total do voo.",
    hours: "Duração convertida para horas decimais.",
    landings: "Quantidade de pousos registrada na ficha do voo.",
    distanceNm: "Distância total em milhas náuticas.",
    flightCount: "Quantidade de voos dentro do agrupamento.",
    executedCount: "Quantidade de voos executados dentro do agrupamento.",
    futureCount: "Quantidade de voos futuros dentro do agrupamento.",
    telemetryCount: "Quantidade de voos com telemetria dentro do agrupamento.",
    telemetryPresent: "Indica se o voo possui telemetria processada.",
    takeoffCount: "Quantidade de decolagens detectadas na telemetria.",
    landingCount: "Quantidade de pousos detectados na telemetria.",
    tglCount: "Quantidade de touch-and-go detectados.",
    smoothLandingCount: "Quantidade de pousos classificados como suaves.",
    mediumLandingCount: "Quantidade de pousos classificados como medios.",
    hardLandingCount: "Quantidade de pousos classificados como duros.",
    bestTouchdownVertSpeedFpm: "Maior VS no toque; por ser descida, tende a ser o toque mais suave.",
    slowestLandingIasKt: "Menor IAS medida no momento do toque.",
    fastestLandingIasKt: "Maior IAS medida no momento do toque.",
    maxTouchdownG: "Maior G normal medido no toque.",
    maxDescentRateFpm: "Menor VS no toque; tende a ser o toque com maior razao de descida.",
    longestTakeoffGroundRollFt: "Maior distancia de corrida de decolagem detectada.",
    shortestTakeoffGroundRollFt: "Menor distancia de corrida de decolagem detectada.",
    fastestTakeoffIasKt: "Maior IAS detectada na decolagem.",
    maxHeadwindKt: "Maior componente de vento de proa estimado.",
    maxTailwindKt: "Maior componente de vento de cauda estimado.",
    maxCrosswindKt: "Maior componente de vento de través estimado.",
    aerodromeCount: "Quantidade de aerodromos identificados.",
    aerodromes: "Lista de aerodromos identificados.",
    maxOilPressurePsi: "Maior pressão de óleo registrada.",
    maxOilTempF: "Maior temperatura de óleo registrada.",
    maxNormalG: "Maior G normal registrado durante o voo.",
    maxLateralG: "Maior G lateral registrado durante o voo.",
    maxChtF: "Maior CHT registrada.",
    maxEgtF: "Maior EGT registrada.",
    maxRpm: "Maior RPM registrada.",
    maxMapInHg: "Maior pressao de admissao registrada.",
    maxFuelFlowGph: "Maior fluxo de combustivel registrado.",
    maxFuelPressurePsi: "Maior pressao de combustivel registrada.",
    minFuelQty: "Menor quantidade de combustivel registrada.",
    maxOatC: "Maior temperatura externa registrada.",
  };
  return descriptions[column.key] ?? column.label;
}

function getChartSvgSource(container: HTMLDivElement | null): string | null {
  const svg = container?.querySelector("svg");
  if (!svg) return null;
  const copy = svg.cloneNode(true) as SVGElement;
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return new XMLSerializer().serializeToString(copy);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportChartSvg(container: HTMLDivElement | null) {
  const source = getChartSvgSource(container);
  if (!source) return false;
  downloadBlob(new Blob([source], { type: "image/svg+xml;charset=utf-8" }), `grafico-relatorio-${new Date().toISOString().slice(0, 10)}.svg`);
  return true;
}

async function exportChartPng(container: HTMLDivElement | null) {
  const source = getChartSvgSource(container);
  if (!source) return false;
  const svg = container?.querySelector("svg");
  const width = Math.ceil(svg?.getBoundingClientRect().width || 1200);
  const height = Math.ceil(svg?.getBoundingClientRect().height || 700);
  const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.decoding = "async";
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Nao foi possivel exportar o grafico em PNG."));
    });
    image.src = url;
    await loaded;
    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = height * 2;
    const context = canvas.getContext("2d");
    if (!context) return false;
    context.fillStyle = "#020617";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.scale(2, 2);
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return false;
    downloadBlob(blob, `grafico-relatorio-${new Date().toISOString().slice(0, 10)}.png`);
    return true;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function exportChartPdf(container: HTMLDivElement | null) {
  const source = getChartSvgSource(container);
  if (!source) return false;
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;
  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
    <html><head><meta charset="utf-8"><title>Grafico do relatorio</title>
    <style>
      body{margin:0;background:#020617;color:#e2e8f0;font-family:Inter,Arial,sans-serif}
      main{min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box}
      svg{max-width:100%;height:auto}
      @media print{body{background:#fff}main{min-height:auto;padding:10mm}svg{width:100%}}
    </style></head><body><main>${source}</main>
    <script>window.onload=()=>setTimeout(()=>window.print(),250)</script>
    </body></html>`);
  printWindow.document.close();
  return true;
}

async function exportChart(container: HTMLDivElement | null, format: ChartExportFormat) {
  if (format === "svg") return exportChartSvg(container);
  if (format === "pdf") return exportChartPdf(container);
  return exportChartPng(container);
}

function askChartExportFormat(): ChartExportFormat | null {
  const answer = window.prompt("Exportar grafico como SVG, PDF ou PNG?", "png")?.trim().toLowerCase();
  if (!answer) return null;
  if (answer === "svg" || answer === "pdf" || answer === "png") return answer;
  window.alert("Formato inválido. Use SVG, PDF ou PNG.");
  return null;
}

function FilterMultiSelect({
  label,
  options,
  value,
  open,
  onOpen,
  onChange,
}: {
  label: string;
  options: string[];
  value: string[];
  open: boolean;
  onOpen: () => void;
  onChange: (value: string[]) => void;
}) {
  const selected = new Set(value);
  const buttonLabel = value.length === 0 ? `Todas ${label.toLowerCase()}` : value.length === 1 ? value[0] : `${value.length} selecionados`;

  function toggle(item: string) {
    const next = new Set(selected);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    onChange(Array.from(next));
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onOpen}
        className="flex h-10 w-full items-center justify-between gap-2 rounded border border-slate-700 bg-slate-950 px-3 text-left text-sm text-slate-100 outline-none hover:border-slate-600"
      >
        <span className="min-w-0 truncate">
          <span className="text-slate-500">{label}: </span>
          {buttonLabel}
        </span>
        <svg className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M5.22 7.22a.75.75 0 011.06 0L10 10.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 8.28a.75.75 0 010-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 max-h-72 w-full min-w-64 overflow-y-auto rounded border border-slate-700 bg-slate-950 p-2 shadow-2xl shadow-slate-950">
          <button
            type="button"
            onClick={() => onChange([])}
            className={`mb-1 flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs ${value.length === 0 ? "bg-emerald-500/10 text-emerald-300" : "text-slate-300 hover:bg-slate-800"}`}
          >
            <span className={`flex h-4 w-4 items-center justify-center rounded border ${value.length === 0 ? "border-emerald-400 bg-emerald-500/20" : "border-slate-600"}`}>
              {value.length === 0 ? "✓" : ""}
            </span>
            Todas
          </button>
          {options.map((item) => (
            <label key={item} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-xs text-slate-300 hover:bg-slate-800">
              <input type="checkbox" checked={selected.has(item)} onChange={() => toggle(item)} className="h-4 w-4 accent-emerald-500" />
              <span className="min-w-0 truncate">{item}</span>
            </label>
          ))}
          {!options.length ? <p className="px-2 py-3 text-xs text-slate-500">Nenhuma opção disponível.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function columnsForContext(selectedColumns: ReportColumnKey[], activeGroups: FlightReportGroupKey[]) {
  if (!activeGroups.length) {
    return COLUMNS.filter((column) => selectedColumns.includes(column.key) && !column.groupOnly && !REMOVED_COLUMN_KEYS.has(column.key));
  }

  const groupColumnKeys = new Set<ReportColumnKey>(["group", ...selectedColumns]);
  return COLUMNS.filter((column) => {
    if (!groupColumnKeys.has(column.key) || REMOVED_COLUMN_KEYS.has(column.key)) return false;
    if (column.detailOnly) return false;
    if (column.groupKey && !activeGroups.includes(column.groupKey)) return false;
    return true;
  });
}

type FlightReportsTabProps = {
  lockedInstructorUserId?: string;
  hideInstructorFilter?: boolean;
};

export function FlightReportsTab({ lockedInstructorUserId = "", hideInstructorFilter = false }: FlightReportsTabProps = {}) {
  const { showToast } = useToast();
  const chartRef = useRef<HTMLDivElement | null>(null);
  const lockedInstructorId = lockedInstructorUserId.trim();
  const serverInstructorsFilter = useMemo(
    () => (lockedInstructorId ? [lockedInstructorId] : undefined),
    [lockedInstructorId],
  );
  const awaitingInstructorId = hideInstructorFilter && !lockedInstructorId;
  const [rows, setRows] = useState<AdminFlightReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalRows, setTotalRows] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("table");
  const [metric, setMetric] = useState<ChartMetricKey>("hours");
  const [periodPreset, setPeriodPreset] = useState<PeriodPresetKey>("last30");
  const [fromDate, setFromDate] = useState(() => periodForPreset("last30").fromDate);
  const [toDate, setToDate] = useState(() => periodForPreset("last30").toDate);
  const [models, setModels] = useState<string[]>([]);
  const [aircrafts, setAircrafts] = useState<string[]>([]);
  const [instructors, setInstructors] = useState<string[]>([]);
  const [students, setStudents] = useState<string[]>([]);
  const [status, setStatus] = useState<AdminFlightReportStatus | "all">("all");
  const [evaluationFilter, setEvaluationFilter] = useState<EvaluationFilter>("all");
  const [temporalGroup, setTemporalGroup] = useState<TemporalGroupKey | "">("");
  const [dimensionGroups, setDimensionGroups] = useState<DimensionGroupKey[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<ReportColumnKey[]>(DEFAULT_COLUMNS);
  const [activeBuiltinPresetId, setActiveBuiltinPresetId] = useState<string>("operacional");
  const [loadedHydration, setLoadedHydration] = useState<FlightReportHydration | null>(null);
  const [showColumns, setShowColumns] = useState(false);
  const [columnSearch, setColumnSearch] = useState("");
  const [sortKey, setSortKey] = useState<ReportColumnKey>("flightDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [savedPresets, setSavedPresets] = useState<SavedReportPreset[]>(() => loadSavedPresets());
  const [presetName, setPresetName] = useState("");
  const [presetToDelete, setPresetToDelete] = useState<string | null>(null);
  const [openFilter, setOpenFilter] = useState<MultiFilterKey | null>(null);
  const [activeFlightId, setActiveFlightId] = useState<string | null>(null);

  const neededHydration = useMemo(
    () => deriveFlightReportHydration(selectedColumns, evaluationFilter),
    [evaluationFilter, selectedColumns],
  );
  const neededHydrationKey = flightReportHydrationKey(neededHydration);

  const buildReportParams = useCallback(
    (cursor?: string | null) => ({
      limit: REPORT_PAGE_SIZE,
      cursor: cursor || undefined,
      instructors: serverInstructorsFilter,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      status,
      columns: selectedColumns.filter((key) => key !== "group" && key !== "telemetryCount"),
      evaluationFilter,
      hydration: neededHydration,
    }),
    [evaluationFilter, fromDate, neededHydration, selectedColumns, serverInstructorsFilter, status, toDate],
  );
  const buildReportParamsRef = useRef(buildReportParams);
  buildReportParamsRef.current = buildReportParams;
  const neededHydrationRef = useRef(neededHydration);
  neededHydrationRef.current = neededHydration;

  useEffect(() => {
    if (awaitingInstructorId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    listAdminFlightReports(buildReportParamsRef.current())
      .then((page) => {
        if (cancelled) return;
        setRows(page.flights);
        setNextCursor(page.nextCursor);
        setTotalRows(page.total);
        setLoadedHydration(neededHydrationRef.current);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        showToast({ variant: "error", message: err.message });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    awaitingInstructorId,
    fromDate,
    neededHydrationKey,
    serverInstructorsFilter,
    showToast,
    status,
    toDate,
  ]);

  const loadMoreReports = useCallback(async () => {
    if (!nextCursor || loadingMore || loadingAll) return;
    setLoadingMore(true);
    try {
      const page = await listAdminFlightReports(buildReportParams(nextCursor));
      setRows((current) => {
        const byId = new Map(current.map((row) => [row.id, row]));
        for (const row of page.flights) byId.set(row.id, row);
        return [...byId.values()];
      });
      setNextCursor(page.nextCursor);
      setTotalRows(page.total);
      setLoadedHydration(neededHydration);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nao foi possivel carregar mais relatorios.";
      setError(message);
      showToast({ variant: "error", message });
    } finally {
      setLoadingMore(false);
    }
  }, [buildReportParams, loadingAll, loadingMore, neededHydration, nextCursor, showToast]);

  const loadAllReports = useCallback(async () => {
    if (!nextCursor || loadingMore || loadingAll) return;
    setLoadingAll(true);
    try {
      let cursor: string | null = nextCursor;
      let safety = 0;
      let latestTotal = totalRows;
      const byId = new Map(rows.map((row) => [row.id, row]));
      while (cursor && safety < 200) {
        const page = await listAdminFlightReports(buildReportParams(cursor));
        for (const row of page.flights) byId.set(row.id, row);
        latestTotal = page.total;
        if (page.nextCursor === cursor) break;
        cursor = page.nextCursor;
        safety += 1;
      }
      setRows([...byId.values()]);
      setNextCursor(cursor);
      setTotalRows(latestTotal);
      setLoadedHydration(neededHydration);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nao foi possivel carregar todos os relatorios.";
      setError(message);
      showToast({ variant: "error", message });
    } finally {
      setLoadingAll(false);
    }
  }, [buildReportParams, loadingAll, loadingMore, neededHydration, nextCursor, rows, showToast, totalRows]);

  const activeGroups = useMemo(
    () => [...(temporalGroup ? [temporalGroup] : []), ...dimensionGroups],
    [dimensionGroups, temporalGroup],
  );

  const options = useMemo(
    () => ({
      models: uniqueOptions(rows, (row) => row.modelName),
      aircrafts: uniqueOptions(rows, (row) => row.aircraftIdent),
      instructors: uniqueOptions(rows, (row) => row.instructorName),
      students: uniqueOptions(rows, (row) => row.studentName),
    }),
    [rows],
  );

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        const date = row.flightDate || row.createdAt.slice(0, 10);
        if (fromDate && date < fromDate) return false;
        if (toDate && date > toDate) return false;
        if (models.length && !models.includes(row.modelName)) return false;
        if (aircrafts.length && !aircrafts.includes(row.aircraftIdent ?? "")) return false;
        if (lockedInstructorId && row.instructorUserId !== lockedInstructorId) return false;
        if (!lockedInstructorId && instructors.length && !instructors.includes(row.instructorName)) return false;
        if (students.length && !students.includes(row.studentName)) return false;
        if (status !== "all" && row.status !== status) return false;
        if (evaluationFilter === "evaluated" && !row.evaluationPresent) return false;
        if (evaluationFilter === "pending" && row.evaluationPresent) return false;
        return true;
      }),
    [aircrafts, evaluationFilter, fromDate, instructors, lockedInstructorId, models, rows, status, students, toDate],
  );

  const reportRows = useMemo(() => aggregateRows(filtered, activeGroups), [activeGroups, filtered]);
  const visibleColumns = useMemo(() => columnsForContext(selectedColumns, activeGroups), [activeGroups, selectedColumns]);
  const sortColumn = useMemo(() => visibleColumns.find((column) => column.key === sortKey) ?? visibleColumns[0], [sortKey, visibleColumns]);
  const sortedRows = useMemo(() => sortRows(reportRows, sortColumn, sortDirection), [reportRows, sortColumn, sortDirection]);
  const summaryRow = useMemo(() => summaryValues(sortedRows, visibleColumns), [sortedRows, visibleColumns]);

  const totalHours = filtered.reduce((acc, row) => acc + (row.hours || 0), 0);
  const totalLandings = filtered.reduce((acc, row) => acc + (row.landings || 0), 0);
  const totalDistance = filtered.reduce((acc, row) => acc + (row.distanceNm || 0), 0);
  const totalFuture = filtered.filter((row) => isScheduledReportStatus(row.status)).length;
  const totalTelemetry = filtered.filter((row) => row.telemetry?.telemetryPresent || row.telemetryPresentOnDoc).length;
  const metricLabel = METRIC_OPTIONS.find((item) => item.key === metric)?.label ?? "Horas";

  const chartModel = useMemo(
    () => buildChartModel({ filtered, sortedRows, metric, temporalGroup, dimensionGroups }),
    [dimensionGroups, filtered, metric, sortedRows, temporalGroup],
  );
  const donutData = useMemo(() => donutDataForChart(chartModel), [chartModel]);

  const searchableColumns = useMemo(() => {
    const needle = columnSearch.trim().toLowerCase();
    return COLUMNS.filter((column) => column.key !== "group" && !REMOVED_COLUMN_KEYS.has(column.key) && (!needle || column.label.toLowerCase().includes(needle)));
  }, [columnSearch]);

  function setPresetPeriod(key: PeriodPresetKey) {
    setPeriodPreset(key);
    if (key === "custom") return;
    const next = periodForPreset(key);
    setFromDate(next.fromDate);
    setToDate(next.toDate);
  }

  function toggleDimensionGroup(group: DimensionGroupKey) {
    setDimensionGroups((current) =>
      current.includes(group) ? current.filter((item) => item !== group) : [...current, group],
    );
  }

  function toggleColumn(column: ReportColumnKey) {
    setActiveBuiltinPresetId("");
    setSelectedColumns((current) =>
      current.includes(column) ? current.filter((item) => item !== column) : [...current, column],
    );
  }

  function clearFilters() {
    setPeriodPreset("last30");
    const next = periodForPreset("last30");
    setFromDate(next.fromDate);
    setToDate(next.toDate);
    setModels([]);
    setAircrafts([]);
    if (!lockedInstructorId) setInstructors([]);
    setStudents([]);
    setStatus("all");
    setEvaluationFilter("all");
  }

  function applyBuiltinPreset(presetId: string) {
    const preset = BUILTIN_FLIGHT_REPORT_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setActiveBuiltinPresetId(preset.id);
    setSelectedColumns(sanitizeSelectedColumns(preset.selectedColumns));
    setView("table");
    setTemporalGroup("");
    setDimensionGroups([]);
  }

  function handleSort(column: ColumnDef) {
    if (!column.sortable) return;
    if (sortKey === column.key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(column.key);
    setSortDirection("asc");
  }

  async function handleExportChart() {
    const format = askChartExportFormat();
    if (!format) return;
    try {
      const ok = await exportChart(chartRef.current, format);
      if (!ok) showToast({ variant: "error", message: "Nao foi possivel exportar o grafico." });
    } catch (err) {
      showToast({ variant: "error", message: err instanceof Error ? err.message : "Nao foi possivel exportar o grafico." });
    }
  }

  function currentPreset(name: string): SavedReportPreset {
    return {
      name,
      fromDate,
      toDate,
      models,
      aircrafts,
      instructors,
      students,
      status,
      temporalGroup,
      dimensionGroups,
      selectedColumns,
      view,
      metric,
    };
  }

  function saveCurrentPreset() {
    const name = presetName.trim();
    if (!name) return;
    const next = [currentPreset(name), ...savedPresets.filter((item) => item.name !== name)].slice(0, 12);
    setSavedPresets(next);
    savePresets(next);
    setPresetName("");
    showToast({ variant: "success", message: "Preset salvo." });
  }

  function loadPreset(name: string) {
    const preset = savedPresets.find((item) => item.name === name);
    if (!preset) return;
    setActiveBuiltinPresetId("");
    setFromDate(preset.fromDate);
    setToDate(preset.toDate);
    setModels(preset.models ?? []);
    setAircrafts(preset.aircrafts ?? []);
    setInstructors(preset.instructors ?? []);
    setStudents(preset.students ?? []);
    setStatus(preset.status);
    setTemporalGroup(preset.temporalGroup);
    setDimensionGroups(preset.dimensionGroups);
    setSelectedColumns(sanitizeSelectedColumns(preset.selectedColumns));
    setView(preset.view);
    setMetric(sanitizeChartMetric(preset.metric));
    setPeriodPreset("custom");
  }

  function deletePreset(name: string) {
    const next = savedPresets.filter((item) => item.name !== name);
    setSavedPresets(next);
    savePresets(next);
    setPresetToDelete(null);
  }

  if (loading || awaitingInstructorId) {
    return (
      <div className="w-full space-y-4">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-200">{error}</div>;
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">Relatórios de Voos</h2>
          {totalRows > 0 ? (
            <p className="mt-1 text-xs text-slate-600">
              {Math.min(rows.length, totalRows)} de {totalRows} registros carregados
            </p>
          ) : null}
          <p className="mt-1 text-xs text-slate-500">
            {filtered.length} voos · {fmtNumber(totalHours, 1)} h · {fmtInt(totalLandings)} pousos · {fmtNumber(totalDistance, 1)} NM · {totalFuture} previstos · {totalTelemetry} com telemetria
          </p>
          {loadedHydration ? (
            <p className="mt-1 text-[11px] text-slate-600">
              Carga: telemetria {loadedHydration.telemetry}
              {loadedHydration.landings ? " · pousos detalhados" : ""}
              {loadedHydration.evaluations ? " · avaliações" : ""}
              {loadedHydration.mission ? " · missões" : ""}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {nextCursor ? (
            <>
              <button
                type="button"
                onClick={() => void loadMoreReports()}
                disabled={loadingMore || loadingAll}
                className="rounded border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
              >
                {loadingMore ? "Carregando..." : "Carregar mais"}
              </button>
              <button
                type="button"
                onClick={() => void loadAllReports()}
                disabled={loadingMore || loadingAll}
                className="rounded border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
              >
                {loadingAll ? "Carregando tudo..." : "Carregar tudo"}
              </button>
            </>
          ) : null}
          <button type="button" onClick={() => exportCsv(sortedRows, visibleColumns, summaryRow)} className="rounded border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800">
            CSV
          </button>
          <button type="button" onClick={() => exportPdf(sortedRows, visibleColumns, "Relatório de voos", summaryRow)} className="rounded border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800">
            PDF
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
        <div className="mb-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Presets padrão</p>
          <p className="text-xs text-slate-500">Cada preset carrega só os dados necessários das colunas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {BUILTIN_FLIGHT_REPORT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              title={preset.description}
              onClick={() => applyBuiltinPreset(preset.id)}
              className={`rounded border px-3 py-1.5 text-xs font-medium transition ${
                activeBuiltinPresetId === preset.id
                  ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300"
                  : "border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          <select value={periodPreset} onChange={(e) => setPresetPeriod(e.target.value as PeriodPresetKey)} className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500">
            {PERIOD_PRESETS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
          <input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPeriodPreset("custom"); }} className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500" />
          <input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPeriodPreset("custom"); }} className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500" />
          <FilterMultiSelect label="Modelos" options={options.models} value={models} open={openFilter === "models"} onOpen={() => setOpenFilter((current) => current === "models" ? null : "models")} onChange={setModels} />
          <FilterMultiSelect label="Aviões" options={options.aircrafts} value={aircrafts} open={openFilter === "aircrafts"} onOpen={() => setOpenFilter((current) => current === "aircrafts" ? null : "aircrafts")} onChange={setAircrafts} />
          {!hideInstructorFilter && !lockedInstructorId ? (
            <FilterMultiSelect label="Instrutores" options={options.instructors} value={instructors} open={openFilter === "instructors"} onOpen={() => setOpenFilter((current) => current === "instructors" ? null : "instructors")} onChange={setInstructors} />
          ) : null}
          <FilterMultiSelect label="Alunos" options={options.students} value={students} open={openFilter === "students"} onOpen={() => setOpenFilter((current) => current === "students" ? null : "students")} onChange={setStudents} />
        </div>

        <div className="border-t border-slate-800" />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-3">
            <div className="inline-flex rounded border border-slate-700 bg-slate-950 p-1">
              {(["all", "Pendente", "Confirmado", "Cancelado", "Realizado"] as const).map((item) => (
                <button key={item} type="button" onClick={() => setStatus(item)} className={`rounded px-3 py-1.5 text-xs font-medium ${status === item ? "bg-emerald-500/15 text-emerald-300" : "text-slate-400 hover:text-slate-200"}`}>
                  {item === "all" ? "Todos status" : item}
                </button>
              ))}
            </div>

            <div className="inline-flex rounded border border-slate-700 bg-slate-950 p-1">
              {(
                [
                  { key: "all", label: "Todas avaliações" },
                  { key: "evaluated", label: "Avaliados" },
                  { key: "pending", label: "Não avaliados" },
                ] as const
              ).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setEvaluationFilter(item.key)}
                  className={`rounded px-3 py-1.5 text-xs font-medium ${evaluationFilter === item.key ? "bg-amber-500/15 text-amber-300" : "text-slate-400 hover:text-slate-200"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="rounded border border-slate-800 bg-slate-950/40 p-2">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Agrupar por tempo</p>
                <div className="inline-flex rounded border border-slate-700 bg-slate-950 p-1">
                  {TEMPORAL_OPTIONS.map((item) => (
                    <button key={item.key} type="button" onClick={() => setTemporalGroup((current) => current === item.key ? "" : item.key)} className={`rounded px-3 py-1.5 text-xs font-medium ${temporalGroup === item.key ? "bg-sky-500/15 text-sky-300" : "text-slate-400 hover:text-slate-200"}`}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded border border-slate-800 bg-slate-950/40 p-2">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Agrupar por:</p>
                <div className="flex flex-wrap gap-2">
                  {DIMENSION_OPTIONS.map((item) => (
                    <button key={item.key} type="button" onClick={() => toggleDimensionGroup(item.key)} className={`rounded border px-3 py-1.5 text-xs font-medium ${dimensionGroups.includes(item.key) ? "border-sky-500/60 bg-sky-500/10 text-sky-300" : "border-slate-700 text-slate-400 hover:bg-slate-800"}`}>
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-2">
            <button type="button" onClick={clearFilters} className="inline-flex items-center gap-2 rounded border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800">
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M8.5 3a5.5 5.5 0 104.545 8.59.75.75 0 111.24.844A7 7 0 117.33 1.79l.22-.22a.75.75 0 011.28.53v3.15a.75.75 0 01-.75.75H4.93a.75.75 0 01-.53-1.28l.83-.83A6.973 6.973 0 018.5 3z" clipRule="evenodd" />
              </svg>
              Limpar filtros
            </button>
            <button type="button" onClick={() => setShowColumns(true)} className="inline-flex items-center gap-2 rounded border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800">
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M3.25 4A2.25 2.25 0 015.5 1.75h9A2.25 2.25 0 0116.75 4v12A2.25 2.25 0 0114.5 18.25h-9A2.25 2.25 0 013.25 16V4zm4 0v12.5h2V4h-2zm3.5 0v12.5h3.75A.75.75 0 0015.25 16V4a.75.75 0 00-.75-.75h-3.75z" />
              </svg>
              Colunas
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded border border-slate-700 bg-slate-950 p-1">
              {(["table", "line", "bar", "area", "donut"] as ViewMode[]).map((item) => (
                <button key={item} type="button" onClick={() => setView(item)} className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium ${view === item ? "bg-amber-500/15 text-amber-300" : "text-slate-400 hover:text-slate-200"}`}>
                  {chartViewIcon(item)}
                  {item === "table" ? "Tabela" : item === "line" ? "Line" : item === "bar" ? "Bar" : item === "area" ? "Area" : "Rosca"}
                </button>
              ))}
            </div>
            {view !== "table" ? (
              <select value={metric} onChange={(e) => setMetric(e.target.value as ChartMetricKey)} className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-medium text-slate-200 outline-none focus:border-emerald-500">
                {METRIC_OPTIONS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
              </select>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select value="" onChange={(e) => loadPreset(e.target.value)} className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-emerald-500">
              <option value="">Carregar preset</option>
              {savedPresets.map((preset) => <option key={preset.name} value={preset.name}>{preset.name}</option>)}
            </select>
            <input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Nome do preset" className="w-36 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-600 outline-none focus:border-emerald-500" />
            <button type="button" onClick={saveCurrentPreset} className="rounded border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20">
              Salvar
            </button>
          </div>
        </div>

        {savedPresets.length ? (
          <div className="flex flex-wrap gap-2">
            {savedPresets.map((preset) => (
              <span key={preset.name} className="inline-flex items-center gap-2 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-300">
                <button type="button" onClick={() => loadPreset(preset.name)} className="hover:text-emerald-300">{preset.name}</button>
                <button type="button" onClick={() => setPresetToDelete(preset.name)} className="text-slate-500 hover:text-rose-300">×</button>
              </span>
            ))}
          </div>
        ) : null}
      </section>

      {view !== "table" && (
        <section ref={chartRef} className="h-[28rem] rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-200">{metricLabel}</p>
            <div className="flex items-center gap-2">
              <p className="text-xs text-slate-500">{chartModel.data.length} pontos</p>
              <button type="button" onClick={() => void handleExportChart()} className="rounded border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800">
                Exportar grafico
              </button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height="90%">
            {view === "line" ? (
              <LineChart data={chartModel.data} margin={{ left: 8, right: 16, top: 12, bottom: 48 }}>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                <XAxis dataKey="label" angle={-30} textAnchor="end" interval="preserveStartEnd" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip {...CHART_TOOLTIP_PROPS} />
                <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 11 }} />
                {chartModel.series.map((series) => (
                  <Line key={series.key} type="monotone" dataKey={series.key} name={series.label} stroke={series.color} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            ) : view === "area" ? (
              <AreaChart data={chartModel.data} margin={{ left: 8, right: 16, top: 12, bottom: 48 }}>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                <XAxis dataKey="label" angle={-30} textAnchor="end" interval="preserveStartEnd" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip {...CHART_TOOLTIP_PROPS} />
                <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 11 }} />
                {chartModel.series.map((series) => (
                  <Area key={series.key} type="monotone" dataKey={series.key} name={series.label} stroke={series.color} fill={series.color} fillOpacity={0.18} strokeWidth={2} />
                ))}
              </AreaChart>
            ) : view === "donut" ? (
              <PieChart margin={{ left: 8, right: 16, top: 12, bottom: 12 }}>
                <Tooltip {...CHART_TOOLTIP_PROPS} />
                <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 11 }} />
                <Pie data={donutData} dataKey="value" nameKey="name" innerRadius="48%" outerRadius="76%" paddingAngle={2}>
                  {donutData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            ) : (
              <BarChart data={chartModel.data} margin={{ left: 8, right: 16, top: 12, bottom: 48 }}>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                <XAxis dataKey="label" angle={-30} textAnchor="end" interval="preserveStartEnd" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip {...CHART_TOOLTIP_PROPS} />
                <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 11 }} />
                {chartModel.series.map((series) => (
                  <Bar key={series.key} dataKey={series.key} name={series.label} fill={series.color} radius={[2.6, 2.6, 0, 0]} />
                ))}
              </BarChart>
            )}
          </ResponsiveContainer>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
        <div className="overflow-auto">
          <table className="min-w-full border-separate border-spacing-0 text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-900">
              <tr>
                {visibleColumns.map((column) => (
                  <th key={column.key} className={`border-b border-slate-800 px-2 py-2 font-semibold uppercase tracking-wider text-slate-500 ${column.compact ? "w-px whitespace-nowrap" : "min-w-28"}`}>
                    <button type="button" disabled={!column.sortable} onClick={() => handleSort(column)} className={`flex w-full items-center gap-1 text-left ${column.sortable ? "hover:text-slate-200" : ""}`}>
                      <span>{column.label}</span>
                      {sortColumn?.key === column.key ? <span className="text-emerald-300">{sortDirection === "asc" ? "↑" : "↓"}</span> : column.sortable ? <span className="text-slate-700">↕</span> : null}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length} className="px-4 py-10 text-center text-sm text-slate-500">
                    Nenhum voo encontrado com os filtros atuais.
                  </td>
                </tr>
              ) : (
                <>
                  {sortedRows.map((row) => (
                    <tr
                      key={row.id}
                      className={`border-b border-slate-800/60 odd:bg-slate-950/20 hover:bg-slate-800/40 ${
                        isGroupedRow(row) ? "" : "cursor-pointer"
                      }`}
                      onClick={() => {
                        if (!isGroupedRow(row)) setActiveFlightId(row.id);
                      }}
                    >
                      {visibleColumns.map((column) => {
                        const severity = severityForColumn(row, column.key);
                        const severityHint = severityHintForColumn(row, column.key);
                        return (
                          <td key={column.key} className={`border-b border-slate-800/60 px-2 py-2 text-slate-300 ${column.compact ? "whitespace-nowrap tabular-nums" : "max-w-56 truncate"}`}>
                            {severity ? (
                              <span title={severityHint} className={`rounded px-1.5 py-0.5 font-semibold ${severityClass(severity)}`}>{column.format(row)}</span>
                            ) : column.key === "status" && !isGroupedRow(row) ? (
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                                isScheduledReportStatus(row.status)
                                  ? "bg-sky-500/10 text-sky-300"
                                  : row.status === "Cancelado"
                                    ? "bg-rose-500/10 text-rose-300"
                                    : "bg-emerald-500/10 text-emerald-300"
                              }`}>
                                {column.format(row)}
                              </span>
                            ) : column.key === "telemetryPresent" && !isGroupedRow(row) ? (
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${row.telemetry?.telemetryPresent || row.telemetryPresentOnDoc ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"}`}>
                                {column.format(row)}
                              </span>
                            ) : column.key === "mediumLandingCount" ? (
                              <span className="font-semibold text-orange-300">{column.format(row)}</span>
                            ) : column.key === "hardLandingCount" ? (
                              <span className="font-semibold text-rose-300">{column.format(row)}</span>
                            ) : (
                              column.format(row)
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {summaryRow ? (
                    <tr className="bg-slate-800/60 font-semibold text-slate-100">
                      {visibleColumns.map((column) => (
                        <td key={column.key} className={`border-t border-slate-700 px-2 py-2 ${column.compact ? "whitespace-nowrap tabular-nums" : "max-w-56 truncate"}`}>
                          {summaryRow[column.key] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ) : null}
                </>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showColumns ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl shadow-slate-950">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Colunas do relatório</h3>
                <p className="text-xs text-slate-500">{selectedColumns.length} selecionadas</p>
              </div>
              <button type="button" onClick={() => setShowColumns(false)} className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">Fechar</button>
            </div>
            <div className="border-b border-slate-800 px-5 py-3">
              <input value={columnSearch} onChange={(e) => setColumnSearch(e.target.value)} placeholder="Pesquisar coluna" className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-emerald-500" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {(["base", "operation", "aggregate", "telemetry", "landing", "flight", "wind", "engine", "evaluation"] as ColumnCategory[]).map((category) => {
                const categoryColumns = searchableColumns.filter((column) => column.category === category);
                if (!categoryColumns.length) return null;
                return (
                  <section key={category} className="mb-5">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">{CATEGORY_LABELS[category]}</p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {categoryColumns.map((column) => {
                        const disabled = column.groupOnly && !activeGroups.length;
                        return (
                          <label key={column.key} title={columnDescription(column)} className={`flex items-center gap-2 rounded border px-3 py-2 text-xs ${disabled ? "border-slate-800 bg-slate-950/30 text-slate-600" : "border-slate-800 bg-slate-950/60 text-slate-300"}`}>
                            <input type="checkbox" disabled={disabled} checked={selectedColumns.includes(column.key)} onChange={() => toggleColumn(column.key)} className="h-4 w-4 accent-emerald-500" />
                            <span>{column.label}</span>
                            <span className="ml-auto flex h-4 w-4 items-center justify-center rounded-full border border-slate-700 text-[10px] text-slate-500">?</span>
                          </label>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {presetToDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl shadow-slate-950">
            <h3 className="text-sm font-semibold text-slate-100">Excluir preset</h3>
            <p className="mt-2 text-sm text-slate-400">
              Deseja excluir o preset <span className="font-semibold text-slate-200">{presetToDelete}</span>?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setPresetToDelete(null)} className="rounded border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800">
                Cancelar
              </button>
              <button type="button" onClick={() => deletePreset(presetToDelete)} className="rounded border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-300 hover:bg-rose-500/20">
                Excluir
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeFlightId ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="mx-auto max-w-7xl rounded-2xl border border-slate-700 bg-slate-950 p-4 shadow-2xl">
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveFlightId(null)}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
              >
                Fechar ficha
              </button>
            </div>
            <FlightDetailView
              flightId={activeFlightId}
              onBack={() => setActiveFlightId(null)}
              backLabel="Voltar aos relatórios"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
