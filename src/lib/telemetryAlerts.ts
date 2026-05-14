import { detectFlightSegments } from "./flightSegments";
import type { ParseResult } from "./parseGarminCsv";
import type { ChartRow } from "./telemetryCharts";
import type { FlightSegment } from "../types/flight";

export type TelemetryAlertSeverity = "leve" | "atencao" | "risco";
export type TelemetryAlertPhase = "all" | "flight" | "takeoff" | "landing" | "tgl";
export type TelemetryAlertOperator = "gt" | "lt";
export type TelemetryAlertProperty =
  | "oilTempF"
  | "oilPsi"
  | "rpm"
  | "normG"
  | "touchdownIasKt"
  | "touchdownVsFpm"
  | "fuelPressPsi"
  | "iasKt";

export type TelemetryAlertCondition = {
  property: TelemetryAlertProperty;
  operator: TelemetryAlertOperator;
  value: number;
};

export type TelemetryAlertRuleConfig = {
  id: string;
  modelId: string;
  name: string;
  severity: TelemetryAlertSeverity;
  phases: TelemetryAlertPhase[];
  conditions: TelemetryAlertCondition[];
  durationSec: number | null;
  active: boolean;
};

export type TelemetryAlertEvidence = {
  phase: TelemetryAlertPhase;
  startMs: number | null;
  endMs: number | null;
  durationSec: number | null;
  matchedAt: string | null;
  values: Partial<Record<TelemetryAlertProperty, number>>;
};

export type TriggeredTelemetryAlert = {
  ruleId: string;
  modelId: string;
  ruleName: string;
  severity: TelemetryAlertSeverity;
  phases: TelemetryAlertPhase[];
  conditions: TelemetryAlertCondition[];
  durationSec: number | null;
  evidence: TelemetryAlertEvidence;
};

type PropertyDef = {
  key: TelemetryAlertProperty;
  label: string;
  unit: string;
  source: "row" | "touchdown";
  rowKey?: string;
  landingKey?: "tdIasKt" | "tdVertSpeedFpm";
};

export const TELEMETRY_ALERT_PROPERTIES: PropertyDef[] = [
  { key: "oilTempF", label: "Temperatura do óleo", unit: "F", source: "row", rowKey: "oilTempF" },
  { key: "oilPsi", label: "Pressão do óleo", unit: "PSI", source: "row", rowKey: "oilPsi" },
  { key: "rpm", label: "RPM", unit: "RPM", source: "row", rowKey: "rpm" },
  { key: "normG", label: "G-load", unit: "G", source: "row", rowKey: "normG" },
  { key: "touchdownIasKt", label: "IAS de toque", unit: "kt", source: "touchdown", landingKey: "tdIasKt" },
  { key: "touchdownVsFpm", label: "VS de toque", unit: "ft/min", source: "touchdown", landingKey: "tdVertSpeedFpm" },
  { key: "fuelPressPsi", label: "Fuel pressure", unit: "PSI", source: "row", rowKey: "fuelPressPsi" },
  { key: "iasKt", label: "IAS", unit: "kt", source: "row", rowKey: "iasKt" },
];

export const TELEMETRY_ALERT_PHASES: Array<{ key: TelemetryAlertPhase; label: string }> = [
  { key: "all", label: "Todas as fases" },
  { key: "flight", label: "Voo" },
  { key: "takeoff", label: "Decolagem" },
  { key: "landing", label: "Pouso" },
  { key: "tgl", label: "TGL" },
];

export const TELEMETRY_ALERT_SEVERITIES: Array<{ key: TelemetryAlertSeverity; label: string }> = [
  { key: "leve", label: "Leve" },
  { key: "atencao", label: "Atenção" },
  { key: "risco", label: "Risco" },
];

const PROPERTY_BY_KEY = new Map(TELEMETRY_ALERT_PROPERTIES.map((property) => [property.key, property]));

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function conditionMatches(value: number | null, condition: TelemetryAlertCondition): boolean {
  if (value === null) return false;
  return condition.operator === "gt" ? value > condition.value : value < condition.value;
}

function medianSampleIntervalMs(rows: ChartRow[]): number {
  const deltas: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    const delta = rows[i]!.x - rows[i - 1]!.x;
    if (Number.isFinite(delta) && delta > 0) deltas.push(delta);
  }
  if (deltas.length === 0) return 1000;
  deltas.sort((a, b) => a - b);
  return deltas[Math.floor(deltas.length / 2)] ?? 1000;
}

function phaseAllowed(rulePhases: TelemetryAlertPhase[], phase: TelemetryAlertPhase): boolean {
  return rulePhases.includes("all") || rulePhases.includes(phase);
}

function hasTouchdownCondition(rule: TelemetryAlertRuleConfig): boolean {
  return rule.conditions.some((condition) => PROPERTY_BY_KEY.get(condition.property)?.source === "touchdown");
}

function hasContinuousCondition(rule: TelemetryAlertRuleConfig): boolean {
  return rule.conditions.some((condition) => PROPERTY_BY_KEY.get(condition.property)?.source === "row");
}

function sanitizeRule(rule: TelemetryAlertRuleConfig): TelemetryAlertRuleConfig | null {
  const phases = Array.from(new Set<TelemetryAlertPhase>(rule.phases.length ? rule.phases : ["all"]));
  const conditions = rule.conditions
    .filter((condition) => PROPERTY_BY_KEY.has(condition.property) && Number.isFinite(condition.value))
    .slice(0, 3);
  if (!rule.active || !rule.id || !rule.modelId || !rule.name.trim() || conditions.length === 0) return null;
  if (hasTouchdownCondition({ ...rule, conditions }) && hasContinuousCondition({ ...rule, conditions })) return null;
  return { ...rule, phases, conditions };
}

function rowValues(row: ChartRow, conditions: TelemetryAlertCondition[]) {
  const values: Partial<Record<TelemetryAlertProperty, number>> = {};
  for (const condition of conditions) {
    const def = PROPERTY_BY_KEY.get(condition.property);
    const value = def?.rowKey ? finite(row[def.rowKey]) : null;
    if (value !== null) values[condition.property] = value;
  }
  return values;
}

function rowMatches(row: ChartRow, conditions: TelemetryAlertCondition[]): boolean {
  return conditions.every((condition) => {
    const def = PROPERTY_BY_KEY.get(condition.property);
    const value = def?.rowKey ? finite(row[def.rowKey]) : null;
    return conditionMatches(value, condition);
  });
}

function buildPhaseLookup(rows: ChartRow[], segments: FlightSegment[]): Map<number, Set<TelemetryAlertPhase>> {
  const lookup = new Map<number, Set<TelemetryAlertPhase>>();
  rows.forEach((_, index) => lookup.set(index, new Set<TelemetryAlertPhase>()));

  for (const segment of segments) {
    rows.forEach((row, index) => {
      if (row.x >= segment.startX && row.x <= segment.endX) {
        lookup.get(index)?.add(segment.type);
      }
    });
  }

  rows.forEach((row, index) => {
    const phases = lookup.get(index);
    if (!phases) return;
    const ias = finite(row.iasKt);
    const gs = finite(row.gsKt);
    const agl = finite(row.heightAglFt);
    const inMotion = (ias !== null && ias > 30) || (gs !== null && gs > 30) || (agl !== null && agl > 50);
    if (inMotion && phases.size === 0) phases.add("flight");
  });

  return lookup;
}

function matchedAtIso(chartTimeBaseMs: number | null, xMs: number | null): string | null {
  if (chartTimeBaseMs === null || xMs === null) return null;
  return new Date(chartTimeBaseMs + xMs).toISOString();
}

function evaluateContinuousRule(
  rule: TelemetryAlertRuleConfig,
  parsed: ParseResult,
  segments: FlightSegment[],
): TriggeredTelemetryAlert[] {
  const rows = parsed.chartData;
  if (rows.length === 0) return [];
  const minDurationMs = Math.max(0, rule.durationSec ?? 0) * 1000;
  const sampleIntervalMs = medianSampleIntervalMs(rows);
  const phasesByIndex = buildPhaseLookup(rows, segments);
  const alerts: TriggeredTelemetryAlert[] = [];

  let windowStartIndex: number | null = null;
  let windowPhase: TelemetryAlertPhase | null = null;
  let windowAlreadyTriggered = false;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowPhases = phasesByIndex.get(i) ?? new Set<TelemetryAlertPhase>();
    const phase =
      (["takeoff", "landing", "tgl", "flight"] as TelemetryAlertPhase[]).find(
        (candidate) => rowPhases.has(candidate) && phaseAllowed(rule.phases, candidate),
      ) ?? (rule.phases.includes("all") ? "all" : undefined);
    const matches = phase !== undefined && rowMatches(row, rule.conditions);

    if (!matches) {
      windowStartIndex = null;
      windowPhase = null;
      windowAlreadyTriggered = false;
      continue;
    }

    if (windowStartIndex === null || windowPhase !== phase) {
      windowStartIndex = i;
      windowPhase = phase;
      windowAlreadyTriggered = false;
    }

    const startRow = rows[windowStartIndex]!;
    const durationMs = row.x - startRow.x + sampleIntervalMs;
    if (!windowAlreadyTriggered && durationMs >= minDurationMs) {
      alerts.push({
        ruleId: rule.id,
        modelId: rule.modelId,
        ruleName: rule.name,
        severity: rule.severity,
        phases: rule.phases,
        conditions: rule.conditions,
        durationSec: rule.durationSec,
        evidence: {
          phase,
          startMs: startRow.x,
          endMs: row.x,
          durationSec: Math.round((durationMs / 1000) * 10) / 10,
          matchedAt: matchedAtIso(parsed.chartTimeBaseMs, startRow.x),
          values: rowValues(row, rule.conditions),
        },
      });
      windowAlreadyTriggered = true;
    }
  }

  return alerts;
}

function touchdownValues(segment: FlightSegment, conditions: TelemetryAlertCondition[]) {
  const values: Partial<Record<TelemetryAlertProperty, number>> = {};
  for (const condition of conditions) {
    const def = PROPERTY_BY_KEY.get(condition.property);
    const metricValue = def?.landingKey ? finite(segment.landingMetrics?.[def.landingKey]) : null;
    if (metricValue !== null) values[condition.property] = metricValue;
  }
  return values;
}

function touchdownMatches(segment: FlightSegment, conditions: TelemetryAlertCondition[]): boolean {
  return conditions.every((condition) => {
    const def = PROPERTY_BY_KEY.get(condition.property);
    const value = def?.landingKey ? finite(segment.landingMetrics?.[def.landingKey]) : null;
    return conditionMatches(value, condition);
  });
}

function evaluateTouchdownRule(
  rule: TelemetryAlertRuleConfig,
  parsed: ParseResult,
  segments: FlightSegment[],
): TriggeredTelemetryAlert[] {
  const alerts: TriggeredTelemetryAlert[] = [];
  for (const segment of segments) {
    if (segment.type !== "landing" && segment.type !== "tgl") continue;
    if (!phaseAllowed(rule.phases, segment.type)) continue;
    if (!touchdownMatches(segment, rule.conditions)) continue;
    const touchdown = segment.events.find((event) => event.type === "touchdown");
    alerts.push({
      ruleId: rule.id,
      modelId: rule.modelId,
      ruleName: rule.name,
      severity: rule.severity,
      phases: rule.phases,
      conditions: rule.conditions,
      durationSec: null,
      evidence: {
        phase: segment.type,
        startMs: touchdown?.xMs ?? segment.startX,
        endMs: touchdown?.xMs ?? segment.startX,
        durationSec: null,
        matchedAt: matchedAtIso(parsed.chartTimeBaseMs, touchdown?.xMs ?? segment.startX),
        values: touchdownValues(segment, rule.conditions),
      },
    });
  }

  return alerts;
}

export function evaluateTelemetryAlerts(params: {
  rules: TelemetryAlertRuleConfig[];
  parsed: ParseResult;
}): TriggeredTelemetryAlert[] {
  const segments =
    params.parsed.chartData.length > 0 && params.parsed.hasChartTime
      ? detectFlightSegments(params.parsed.chartData, params.parsed.chartTimeBaseMs, params.parsed.points)
      : [];

  return params.rules
    .map(sanitizeRule)
    .filter((rule): rule is TelemetryAlertRuleConfig => Boolean(rule))
    .flatMap((rule) =>
      hasTouchdownCondition(rule)
        ? evaluateTouchdownRule(rule, params.parsed, segments)
        : evaluateContinuousRule(rule, params.parsed, segments),
    );
}

export function propertyLabel(key: TelemetryAlertProperty): string {
  return PROPERTY_BY_KEY.get(key)?.label ?? key;
}

export function propertyUnit(key: TelemetryAlertProperty): string {
  return PROPERTY_BY_KEY.get(key)?.unit ?? "";
}

export function isTouchdownProperty(key: TelemetryAlertProperty): boolean {
  return PROPERTY_BY_KEY.get(key)?.source === "touchdown";
}
