import { parseGarminCsv, type ParseResult } from "./parseGarminCsv";
import { detectTrafficPattern } from "./trafficPattern";
import { detectFlightSegments, findTouchdown } from "./flightSegments";
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
import type { FlightSegment, TrafficPatternAnalysis } from "../types/flight";

/** Dados pré-computados reutilizáveis entre análises do mesmo voo (evita reparse do CSV). */
export type ManeuverAnalysisContext = {
  parsed?: ParseResult;
  segments?: FlightSegment[];
};

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

const HEADING_TRACK_PARAMS = new Set(["heading", "track"]);

/** Diferença angular com sinal em [-180, 180). Lida com wrap-around 0°/360°. */
function angularDiff(a: number, b: number): number {
  const diff = ((a - b) % 360 + 360) % 360;
  return diff > 180 ? diff - 360 : diff;
}

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
  const available = params.filter((p) => p.status !== "unavailable");
  if (available.length === 0) return "unavailable";
  let hasCritical = false;
  let hasAttention = false;
  for (const p of available) {
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
  stepEndMs: number,
): AnalyzedParameter {
  const minStart = paramCfg.min_start !== undefined ? paramCfg.min_start
    : paramCfg.min !== undefined ? paramCfg.min : undefined;
  const maxStart = paramCfg.max_start !== undefined ? paramCfg.max_start
    : paramCfg.max !== undefined ? paramCfg.max : undefined;
  const minEnd = paramCfg.min_end;
  const maxEnd = paramCfg.max_end;

  const stepDurationMs = Math.max(1, stepEndMs - stepStartMs);
  const isHeadingTrack = HEADING_TRACK_PARAMS.has(paramCfg.parameter);
  const isBank = paramCfg.parameter === "bank";

  // Para proa/track, min/max são variâncias relativas — sem interpolação
  const hasInterpolatedMin = !isHeadingTrack && minStart !== undefined && minEnd !== undefined;
  const hasInterpolatedMax = !isHeadingTrack && maxStart !== undefined && maxEnd !== undefined;

  const effectiveMin = (absoluteMs: number): number | undefined => {
    if (isHeadingTrack || minStart === undefined) return undefined;
    if (!hasInterpolatedMin) return minStart;
    const ratio = Math.min(1, Math.max(0, (absoluteMs - stepStartMs) / stepDurationMs));
    return minStart + (minEnd! - minStart) * ratio;
  };

  const effectiveMax = (absoluteMs: number): number | undefined => {
    if (isHeadingTrack || maxStart === undefined) return undefined;
    if (!hasInterpolatedMax) return maxStart;
    const ratio = Math.min(1, Math.max(0, (absoluteMs - stepStartMs) / stepDurationMs));
    return maxStart + (maxEnd! - maxStart) * ratio;
  };

  const valid = rows.filter((r): r is { absoluteMs: number; value: number } => r.value !== null);

  if (valid.length === 0) {
    return {
      parameter: paramCfg.parameter,
      label: paramCfg.label,
      min_observed: null,
      max_observed: null,
      avg_observed: null,
      expected_min: minStart ?? null,
      expected_max: maxStart ?? null,
      ...(hasInterpolatedMin ? { expected_min_end: minEnd } : {}),
      ...(hasInterpolatedMax ? { expected_max_end: maxEnd } : {}),
      status: "unavailable",
      time_out_of_range_seconds: 0,
      severity: paramCfg.severity,
      data_points: [],
    };
  }

  const values = valid.map((r) => r.value);
  const minObs = Math.min(...values);
  const maxObs = Math.max(...values);
  const avgObs = values.reduce((a, b) => a + b, 0) / values.length;

  let sampleIntervalMs = 1000;
  if (valid.length > 1) {
    sampleIntervalMs = (valid[valid.length - 1].absoluteMs - valid[0].absoluteMs) / (valid.length - 1);
  }

  // Para proa/track: proa de referência = primeiro valor válido da etapa
  const refHeading = isHeadingTrack ? valid[0].value : 0;

  let timeOutMs = 0;
  let hasHardLimit = false;
  for (const r of valid) {
    let belowMin: boolean;
    let aboveMax: boolean;
    if (isHeadingTrack) {
      // min/max representam variância máxima/mínima em graus a partir da proa de referência
      const deviation = Math.abs(angularDiff(r.value, refHeading));
      aboveMax = maxStart !== undefined && deviation > maxStart;
      belowMin = minStart !== undefined && minStart > 0 && deviation < minStart;
    } else if (isBank) {
      const absV = Math.abs(r.value);
      const eMin = effectiveMin(r.absoluteMs);
      const eMax = effectiveMax(r.absoluteMs);
      aboveMax = eMax !== undefined && absV > Math.abs(eMax);
      belowMin = eMin !== undefined && Math.abs(eMin) > 0 && absV < Math.abs(eMin);
    } else {
      const eMin = effectiveMin(r.absoluteMs);
      const eMax = effectiveMax(r.absoluteMs);
      belowMin = eMin !== undefined && r.value < eMin;
      aboveMax = eMax !== undefined && r.value > eMax;
    }
    if (belowMin || aboveMax) {
      timeOutMs += sampleIntervalMs;
      hasHardLimit = true;
    }
  }

  const timeOutSec = Math.round(timeOutMs / 1000);
  let paramStatus: AnalyzedParameter["status"] = "ok";
  if (timeOutSec > 0) {
    paramStatus = hasHardLimit ? "out_of_range" : "warning";
  }

  const rawPoints = valid.map((r) => ({ t: Math.round((r.absoluteMs - stepStartMs) / 1000), v: r.value }));
  const data_points = sampleDataPoints(rawPoints);

  // Para proa/track: exibe limites absolutos calculados a partir da proa de referência ± variância
  const displayExpMin = isHeadingTrack
    ? (maxStart !== undefined ? Math.round((refHeading - maxStart) * 10) / 10 : null)
    : minStart ?? null;
  const displayExpMax = isHeadingTrack
    ? (maxStart !== undefined ? Math.round((refHeading + maxStart) * 10) / 10 : null)
    : maxStart ?? null;

  return {
    parameter: paramCfg.parameter,
    label: paramCfg.label,
    min_observed: Math.round(minObs * 10) / 10,
    max_observed: Math.round(maxObs * 10) / 10,
    avg_observed: Math.round(avgObs * 10) / 10,
    expected_min: displayExpMin,
    expected_max: displayExpMax,
    ...(hasInterpolatedMin ? { expected_min_end: minEnd } : {}),
    ...(hasInterpolatedMax ? { expected_max_end: maxEnd } : {}),
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
  context?: ManeuverAnalysisContext,
): AnalysisResult {
  const parsed = context?.parsed ?? parseGarminCsv(csvText);
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

  // Marcações manuais do instrutor (para etapas com end_condition "instructor_marked")
  let instructorMarkIdx = 0;
  const instructorMarkMs = (maneuver.instructor_step_marks ?? []).map((s) => new Date(s).getTime());

  // ── Detecção de padrão de circuito (pouso/TGL) ───────────────────────────
  const isLandingCategory = _template.category === "landing" || _template.category === "touch_and_go";
  let trafficPattern: TrafficPatternAnalysis | null = null;

  if (isLandingCategory && maneuverRows.length >= 2) {
    // Mesma lógica da telemetria: usa os segmentos detectados no voo completo,
    // que conhecem o toque exato de cada pouso/TGL. Buscar o toque apenas dentro
    // da janela da manobra encontrava o toque do circuito anterior quando os
    // circuitos eram curtos (< 5 min), gerando pernas erradas/no lugar errado.
    const segments =
      context?.segments ?? detectFlightSegments(chartData, chartTimeBaseMs, parsed.points);
    let bestOverlapMs = 0;
    for (const seg of segments) {
      if ((seg.type !== "landing" && seg.type !== "tgl") || !seg.trafficPattern) continue;
      const segStartMs = chartTimeBaseMs + seg.startX;
      const segEndMs = chartTimeBaseMs + seg.endX;
      const overlapMs = Math.min(endMs, segEndMs) - Math.max(startMs, segStartMs);
      if (overlapMs > bestOverlapMs) {
        bestOverlapMs = overlapMs;
        trafficPattern = seg.trafficPattern;
      }
    }

    if (!trafficPattern) {
      // Fallback: detecção local na janela da manobra (manobras marcadas manualmente
      // fora de qualquer segmento detectado).
      const firstX = maneuverRows[0]!.row.x as number;
      const lastX  = maneuverRows[maneuverRows.length - 1]!.row.x as number;
      let segStartIdx = 0;
      let segEndIdx   = chartData.length - 1;
      for (let i = 0; i < chartData.length; i++) {
        if ((chartData[i]!.x as number) >= firstX) { segStartIdx = i; break; }
      }
      for (let i = chartData.length - 1; i >= 0; i--) {
        if ((chartData[i]!.x as number) <= lastX) { segEndIdx = i; break; }
      }
      if (segEndIdx > segStartIdx) {
        // Detecta o toque real dentro da janela da manobra; cai para segEndIdx se não encontrado
        const actualTdIdx = findTouchdown(chartData, segStartIdx, segEndIdx) ?? segEndIdx;
        trafficPattern = detectTrafficPattern(chartData, segStartIdx, actualTdIdx) ?? null;
      }
    }
  }

  let stepCursor = 0; // index into maneuverRows

  for (const step of sortedSteps) {
    if (stepCursor >= maneuverRows.length) break;

    // stepStartCursor pode ser sobrescrito por traffic_pattern_leg
    let stepStartCursor = stepCursor;
    let stepEndIdx = maneuverRows.length - 1;

    // Determine end of step
    if (step.end_condition) {
      const cond = step.end_condition;
      if (cond.type === "time") {
        const stepStartMs = maneuverRows[stepStartCursor]!.absoluteMs;
        const targetMs = stepStartMs + cond.value_seconds * 1000;
        for (let i = stepStartCursor; i < maneuverRows.length; i++) {
          if (maneuverRows[i]!.absoluteMs >= targetMs) {
            stepEndIdx = i;
            break;
          }
        }
      } else if (cond.type === "parameter") {
        const fieldKey = TELEMETRY_FIELD_MAP[cond.parameter] ?? cond.parameter;
        for (let i = stepStartCursor; i < maneuverRows.length; i++) {
          const val = maneuverRows[i]!.row[fieldKey] as number | null | undefined;
          if (val !== null && val !== undefined && compareOperator(val, cond, cond.value)) {
            stepEndIdx = i;
            break;
          }
        }
      } else if (cond.type === "instructor_marked") {
        const markMs = instructorMarkMs[instructorMarkIdx];
        instructorMarkIdx++;
        if (markMs !== undefined) {
          for (let i = stepStartCursor; i < maneuverRows.length; i++) {
            if (maneuverRows[i]!.absoluteMs >= markMs) {
              stepEndIdx = i;
              break;
            }
          }
        }
        // Se não há marcação: stepEndIdx permanece em maneuverRows.length - 1 (fim da manobra)
      } else if (cond.type === "traffic_pattern_leg" && trafficPattern && chartTimeBaseMs) {
        // Pode haver mais de uma perna do mesmo tipo na janela: em circuitos/TGLs,
        // a subida após o toque anterior também alinha com a pista e é classificada
        // como "final". A perna real do circuito é a ÚLTIMA do tipo antes do toque.
        const tdX = trafficPattern.touchdownX;
        const candidates = trafficPattern.legs.filter((l) => l.type === cond.leg);
        const beforeTd = tdX != null ? candidates.filter((l) => l.startX <= tdX) : candidates;
        const pool = beforeTd.length > 0 ? beforeTd : candidates;
        const leg = pool.length > 0 ? pool[pool.length - 1] : undefined;
        if (leg) {
          // Para a perna final, limita o fim a 1 segundo após o toque real
          const legEndX =
            leg.type === "final" && trafficPattern.touchdownX != null
              ? Math.min(leg.endX, trafficPattern.touchdownX + 1000)
              : leg.endX;
          const legStartMs = chartTimeBaseMs + leg.startX;
          const legEndMs   = chartTimeBaseMs + legEndX;
          // Procura o início da perna em maneuverRows
          const foundStart = maneuverRows.findIndex((r) => r.absoluteMs >= legStartMs);
          if (foundStart >= 0) stepStartCursor = foundStart;
          // Procura o fim da perna
          stepEndIdx = stepStartCursor;
          for (let i = stepStartCursor; i < maneuverRows.length; i++) {
            if (maneuverRows[i]!.absoluteMs > legEndMs) {
              stepEndIdx = Math.max(stepStartCursor, i - 1);
              break;
            }
            stepEndIdx = i;
          }
        }
      }
    }

    const stepStartMs = maneuverRows[stepStartCursor]?.absoluteMs ?? maneuverRows[stepCursor]!.absoluteMs;
    const stepRows = maneuverRows.slice(stepStartCursor, stepEndIdx + 1);
    const stepEndMs = stepRows[stepRows.length - 1]?.absoluteMs ?? stepStartMs;
    stepCursor = stepEndIdx + 1;

    // Analyze parameters for this step
    const analyzedParams: AnalyzedParameter[] = step.parameters.map((paramCfg) => {
      const fieldKey = TELEMETRY_FIELD_MAP[paramCfg.parameter] ?? paramCfg.parameter;
      const rowValues = stepRows.map(({ row, absoluteMs }) => ({
        absoluteMs,
        value: (row[fieldKey] as number | null | undefined) ?? null,
      }));
      return analyzeParameter(paramCfg, rowValues, stepStartMs, stepEndMs);
    });

    // Step alerts
    const stepAlerts: ReviewAlert[] = [];
    for (let pi = 0; pi < analyzedParams.length; pi++) {
      const p = analyzedParams[pi]!;
      const paramCfg = step.parameters[pi];
      if (p.status === "out_of_range" && p.time_out_of_range_seconds > 0) {
        const pIsBank = p.parameter === "bank";
        const isAboveMax = pIsBank
          ? p.max_observed !== null && p.expected_max !== null && Math.max(Math.abs(p.max_observed), p.min_observed !== null ? Math.abs(p.min_observed) : 0) > Math.abs(p.expected_max)
          : p.max_observed !== null && p.expected_max !== null && p.max_observed > p.expected_max;
        const isBelowMin = pIsBank
          ? p.min_observed !== null && p.expected_min !== null && Math.abs(p.expected_min) > 0 && Math.min(Math.abs(p.max_observed ?? Infinity), p.min_observed !== null ? Math.abs(p.min_observed) : Infinity) < Math.abs(p.expected_min)
          : p.min_observed !== null && p.expected_min !== null && p.min_observed < p.expected_min;
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
    trafficPattern,
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
