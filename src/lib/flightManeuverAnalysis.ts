import { parseGarminCsv } from "./parseGarminCsv";
import type {
  AnalysisResult,
  AnalyzedParameter,
  AnalyzedStep,
  FlightManeuver,
  ManeuverTemplate,
  ManeuverTemplateStep,
  ReviewAlert,
  ReviewStatus,
  StepEndCondition,
  StepParameter,
} from "../types/flightReview";

/** Mapeia nomes canônicos de parâmetros para campos reais do ChartRow (parseGarminCsv output). */
export const TELEMETRY_FIELD_MAP: Record<string, string> = {
  rpm: "rpm",
  ias: "iasKt",
  groundspeed: "gsKt",
  altitude: "gpsAltFt",
  agl: "heightAglFt",
  vertical_speed: "vertSpeedFpm",
  pitch: "pitchDeg",
  bank: "rollDeg",
  heading: "hdgMag",
  track: "trackDeg",
  fuel_flow: "fuelFlowGph",
  oil_temp: "oilTempF",
  oil_pressure: "oilPsi",
  manifold_pressure: "mapInHg",
  cht1: "cht1F",
  cht2: "cht2F",
  egt1: "egt1F",
  egt2: "egt2F",
  true_airspeed: "tasKt",
  lateral_g: "latG",
  normal_g: "normG",
};

export const TELEMETRY_PARAMETER_LABELS: Record<string, string> = {
  rpm: "RPM",
  ias: "IAS (kt)",
  groundspeed: "GS (kt)",
  altitude: "Altitude (ft)",
  agl: "AGL (ft)",
  vertical_speed: "Vel. Vertical (fpm)",
  pitch: "Arfagem (°)",
  bank: "Rolagem (°)",
  heading: "Proa (°)",
  track: "Track (°)",
  fuel_flow: "Fluxo comb. (gph)",
  oil_temp: "Temp. óleo (°F)",
  oil_pressure: "Press. óleo (psi)",
  manifold_pressure: "MAP (inHg)",
  cht1: "CHT1 (°F)",
  cht2: "CHT2 (°F)",
  egt1: "EGT1 (°F)",
  egt2: "EGT2 (°F)",
  true_airspeed: "TAS (kt)",
  lateral_g: "G lateral",
  normal_g: "G normal",
};

// Data points are stripped before writing to Appwrite (size limit).
// Charts always reconstruct from CSV at render time — no sampling needed here.
function sampleDataPoints(pairs: Array<{ t: number; v: number }>) {
  return pairs; // full granularity — caller strips before persistence
}

function compareOperator(a: number, op: StepEndCondition & { type: "parameter" }, b: number): boolean {
  switch (op.operator) {
    case ">=": return a >= b;
    case "<=": return a <= b;
    case ">": return a > b;
    case "<": return a < b;
  }
}

function deriveStepStatus(params: AnalyzedParameter[]): ReviewStatus {
  if (params.length === 0) return "unavailable";
  let hasCritical = false;
  let hasAttention = false;
  for (const p of params) {
    if (p.status === "out_of_range") {
      if (p.severity === "critical") hasCritical = true;
      else hasAttention = true;
    } else if (p.status === "warning") {
      hasAttention = true;
    }
  }
  if (hasCritical) return "critical";
  if (hasAttention) return "attention";
  return "ok";
}

function deriveOverallStatus(steps: AnalyzedStep[]): ReviewStatus {
  if (steps.length === 0) return "unavailable";
  let hasCritical = false;
  let hasAttention = false;
  for (const s of steps) {
    if (s.status === "critical") hasCritical = true;
    else if (s.status === "attention") hasAttention = true;
  }
  if (hasCritical) return "critical";
  if (hasAttention) return "attention";
  return "ok";
}

function analyzeParameter(
  paramCfg: StepParameter,
  rows: Array<{ absoluteMs: number; value: number | null }>,
  stepStartMs: number,
): AnalyzedParameter {
  const valid = rows.filter((r): r is { absoluteMs: number; value: number } => r.value !== null);

  if (valid.length === 0) {
    return {
      parameter: paramCfg.parameter,
      label: paramCfg.label,
      min_observed: null,
      max_observed: null,
      avg_observed: null,
      expected_min: paramCfg.min ?? null,
      expected_max: paramCfg.max ?? null,
      status: "ok",
      time_out_of_range_seconds: 0,
      severity: paramCfg.severity,
      data_points: [],
    };
  }

  const values = valid.map((r) => r.value);
  const minObs = Math.min(...values);
  const maxObs = Math.max(...values);
  const avgObs = values.reduce((a, b) => a + b, 0) / values.length;

  // Estimate sample interval (ms per row)
  let sampleIntervalMs = 1000;
  if (valid.length > 1) {
    sampleIntervalMs = (valid[valid.length - 1].absoluteMs - valid[0].absoluteMs) / (valid.length - 1);
  }

  let timeOutMs = 0;
  for (const r of valid) {
    const belowMin = paramCfg.min !== undefined && r.value < paramCfg.min;
    const aboveMax = paramCfg.max !== undefined && r.value > paramCfg.max;
    if (belowMin || aboveMax) timeOutMs += sampleIntervalMs;
  }

  const timeOutSec = Math.round(timeOutMs / 1000);

  let paramStatus: AnalyzedParameter["status"] = "ok";
  if (timeOutSec > 0) {
    const hasHardLimit =
      (paramCfg.min !== undefined && minObs < paramCfg.min) ||
      (paramCfg.max !== undefined && maxObs > paramCfg.max);
    paramStatus = hasHardLimit ? "out_of_range" : "warning";
  }

  const rawPoints = valid.map((r) => ({ t: Math.round((r.absoluteMs - stepStartMs) / 1000), v: r.value }));
  const data_points = sampleDataPoints(rawPoints);

  return {
    parameter: paramCfg.parameter,
    label: paramCfg.label,
    min_observed: Math.round(minObs * 10) / 10,
    max_observed: Math.round(maxObs * 10) / 10,
    avg_observed: Math.round(avgObs * 10) / 10,
    expected_min: paramCfg.min ?? null,
    expected_max: paramCfg.max ?? null,
    status: paramStatus,
    time_out_of_range_seconds: timeOutSec,
    severity: paramCfg.severity,
    data_points,
  };
}

export function analyzeFlightManeuver(
  maneuver: FlightManeuver,
  _template: ManeuverTemplate,
  steps: ManeuverTemplateStep[],
  csvText: string,
): AnalysisResult {
  const parsed = parseGarminCsv(csvText);
  const { chartData, chartTimeBaseMs } = parsed;

  if (!chartTimeBaseMs || chartData.length === 0) {
    return { steps: [], alerts: [{ severity: "high", message: "Sem dados de telemetria disponíveis." }] };
  }

  const startMs = new Date(maneuver.start_time).getTime();
  const endMs = new Date(maneuver.end_time).getTime();

  if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) {
    return { steps: [], alerts: [{ severity: "high", message: "Intervalo de tempo inválido para a manobra." }] };
  }

  // Rows in the maneuver window
  const maneuverRows = chartData
    .map((row) => ({ row, absoluteMs: chartTimeBaseMs + row.x }))
    .filter(({ absoluteMs }) => absoluteMs >= startMs && absoluteMs <= endMs);

  if (maneuverRows.length === 0) {
    return {
      steps: [],
      alerts: [{ severity: "high", message: "Nenhum dado de telemetria encontrado no intervalo da manobra." }],
    };
  }

  const sortedSteps = [...steps].sort((a, b) => a.order_index - b.order_index);
  const analyzedSteps: AnalyzedStep[] = [];
  const overallAlerts: ReviewAlert[] = [];

  let stepCursor = 0; // index into maneuverRows

  for (const step of sortedSteps) {
    if (stepCursor >= maneuverRows.length) break;

    const stepStartMs = maneuverRows[stepCursor].absoluteMs;
    let stepEndIdx = maneuverRows.length - 1;

    // Determine end of step
    if (step.end_condition) {
      const cond = step.end_condition;
      if (cond.type === "time") {
        const targetMs = stepStartMs + cond.value_seconds * 1000;
        for (let i = stepCursor; i < maneuverRows.length; i++) {
          if (maneuverRows[i].absoluteMs >= targetMs) {
            stepEndIdx = i;
            break;
          }
        }
      } else if (cond.type === "parameter") {
        const fieldKey = TELEMETRY_FIELD_MAP[cond.parameter] ?? cond.parameter;
        for (let i = stepCursor; i < maneuverRows.length; i++) {
          const val = maneuverRows[i].row[fieldKey] as number | null | undefined;
          if (val !== null && val !== undefined && compareOperator(val, cond, cond.value)) {
            stepEndIdx = i;
            break;
          }
        }
      }
    }

    const stepRows = maneuverRows.slice(stepCursor, stepEndIdx + 1);
    const stepEndMs = stepRows[stepRows.length - 1]?.absoluteMs ?? stepStartMs;
    stepCursor = stepEndIdx + 1;

    // Analyze parameters for this step
    const analyzedParams: AnalyzedParameter[] = step.parameters.map((paramCfg) => {
      const fieldKey = TELEMETRY_FIELD_MAP[paramCfg.parameter] ?? paramCfg.parameter;
      const rowValues = stepRows.map(({ row, absoluteMs }) => ({
        absoluteMs,
        value: (row[fieldKey] as number | null | undefined) ?? null,
      }));
      return analyzeParameter(paramCfg, rowValues, stepStartMs);
    });

    // Step alerts
    const stepAlerts: ReviewAlert[] = [];
    for (let pi = 0; pi < analyzedParams.length; pi++) {
      const p = analyzedParams[pi]!;
      const paramCfg = step.parameters[pi];
      if (p.status === "out_of_range" && p.time_out_of_range_seconds > 0) {
        const isAboveMax =
          p.max_observed !== null && p.expected_max !== null && p.max_observed > p.expected_max;
        const isBelowMin =
          p.min_observed !== null && p.expected_min !== null && p.min_observed < p.expected_min;
        let message: string;
        if (isAboveMax && !isBelowMin && paramCfg?.alert_message_max) {
          message = `${paramCfg.alert_message_max} (${p.time_out_of_range_seconds}s acima)`;
        } else if (isBelowMin && !isAboveMax && paramCfg?.alert_message_min) {
          message = `${paramCfg.alert_message_min} (${p.time_out_of_range_seconds}s abaixo)`;
        } else {
          const direction = isAboveMax ? "acima do limite" : "abaixo do limite";
          message = `${p.label} ficou ${direction} por ${p.time_out_of_range_seconds}s.`;
        }
        stepAlerts.push({ severity: p.severity, message, parameter: p.parameter });
        if (p.severity === "critical" || p.severity === "high") {
          overallAlerts.push({
            severity: p.severity,
            message: `[${step.name}] ${message}`,
            parameter: p.parameter,
          });
        }
      }
    }

    const durationSec = Math.round((stepEndMs - stepStartMs) / 1000);
    const stepStatus = analyzedParams.length > 0 ? deriveStepStatus(analyzedParams) : "unavailable";

    analyzedSteps.push({
      name: step.name,
      description: step.description,
      expected_execution_text: step.expected_execution_text,
      start_time: new Date(stepStartMs).toISOString(),
      end_time: new Date(stepEndMs).toISOString(),
      duration_seconds: durationSec,
      status: stepStatus,
      parameters: analyzedParams,
      alerts: stepAlerts,
    });
  }

  return {
    steps: analyzedSteps,
    alerts: overallAlerts,
  };
}

export function deriveReviewStatus(result: AnalysisResult): ReviewStatus {
  return deriveOverallStatus(result.steps);
}

export function buildReviewSummary(result: AnalysisResult, status: ReviewStatus): string {
  const totalAlerts = result.alerts.length;
  const stepCount = result.steps.length;
  if (status === "unavailable") return "Não foi possível analisar a manobra por falta de dados.";
  if (status === "ok") return `Manobra analisada em ${stepCount} etapa(s) sem desvios relevantes.`;
  if (status === "critical") return `Atenção: ${totalAlerts} alerta(s) crítico(s) detectado(s) em ${stepCount} etapa(s).`;
  return `${totalAlerts} alerta(s) detectado(s) em ${stepCount} etapa(s).`;
}
