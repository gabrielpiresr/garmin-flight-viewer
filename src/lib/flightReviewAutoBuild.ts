import { getAircraftByRegistration } from "./aircraftDb";
import { DEFAULT_SCHOOL_ID } from "./appwrite";
import {
  analyzeFlightManeuver,
  buildReviewSummary,
  deriveReviewStatus,
} from "./flightManeuverAnalysis";
import {
  clearFlightManeuversForFlight,
  createFlightManeuver,
  listFlightManeuvers,
  updateFlightManeuver,
  upsertFlightManeuverReview,
} from "./flightManeuversDb";
import { decodeFlightRecord } from "./flightRecordCodec";
import { getSavedFlight } from "./flightsDb";
import { detectFlightSegments } from "./flightSegments";
import {
  listManeuverTemplates,
  listManeuverTemplateSteps,
} from "./maneuverTemplatesDb";
import { parseGarminCsv, type ParseResult } from "./parseGarminCsv";
import type { SegmentType } from "../types/flight";
import type { ManeuverCategory, ManeuverTemplateStep } from "../types/flightReview";

const SEG_CATEGORY_MAP: Partial<Record<SegmentType, ManeuverCategory>> = {
  takeoff: "takeoff",
  landing: "landing",
  tgl: "touch_and_go",
};

export async function clearAutoBuiltFlightReviewManeuvers(
  flightId: string,
): Promise<{ maneuvers: number; reviews: number }> {
  const allTemplates = await listManeuverTemplates();
  const autoCategories = new Set(Object.values(SEG_CATEGORY_MAP));
  const templateIds = allTemplates
    .filter((template) => autoCategories.has(template.category))
    .map((template) => template.id);
  return clearFlightManeuversForFlight(flightId, { templateIds });
}

/** Manobras com mesma categoria e início a menos de 2 min são consideradas a mesma. */
const DEDUPE_START_TOLERANCE_MS = 120_000;

export type AutoBuildFlightReviewResult = {
  /** Segmentos de decolagem/pouso/TGL detectados na telemetria. */
  detected: number;
  /** Manobras criadas no Flight Review. */
  added: number;
  /** Manobras criadas cuja análise foi concluída. */
  analyzed: number;
  /** Segmentos pulados por já existir manobra equivalente. */
  skipped: number;
  removed: number;
  error: Error | null;
};

export type AutoBuildFlightReviewInput = {
  flightId: string;
  actorUserId: string;
  /** Telemetria já parseada (evita reparse). Quando ausente, busca o voo e parseia. */
  parsed?: ParseResult;
  flight?: {
    student_user_id: string | null;
    instructor_user_id: string | null;
    aircraft_ident: string | null;
  };
  replaceExisting?: boolean;
};

/**
 * Detecta decolagens/pousos/TGLs na telemetria do voo e cria automaticamente as
 * manobras correspondentes no Flight Review, já rodando a análise de cada uma.
 * Segmentos que já possuem manobra equivalente são pulados.
 */
export async function autoBuildFlightReviewManeuvers(
  input: AutoBuildFlightReviewInput,
): Promise<AutoBuildFlightReviewResult> {
  const result: AutoBuildFlightReviewResult = {
    detected: 0,
    added: 0,
    analyzed: 0,
    skipped: 0,
    removed: 0,
    error: null,
  };

  try {
    let flightInfo = input.flight ?? null;
    let parsed = input.parsed ?? null;

    if (!flightInfo || !parsed) {
      const saved = await getSavedFlight(input.flightId);
      if (saved.error || !saved.data) throw saved.error ?? new Error("Voo não encontrado.");
      flightInfo = flightInfo ?? {
        student_user_id: saved.data.student_user_id,
        instructor_user_id: saved.data.instructor_user_id,
        aircraft_ident: saved.data.aircraft_ident,
      };
      if (!parsed) {
        const decoded = decodeFlightRecord(saved.data.csv_text);
        const telemetryText = decoded.meta ? decoded.telemetryCsv : saved.data.csv_text;
        if (!telemetryText.trim()) throw new Error("Telemetria não encontrada para o voo.");
        parsed = parseGarminCsv(telemetryText);
      }
    }

    const { chartData, chartTimeBaseMs, points } = parsed;
    if (!chartTimeBaseMs || chartData.length === 0) return result;

    const segments = detectFlightSegments(chartData, chartTimeBaseMs, points, {
      aircraftIdent: flightInfo.aircraft_ident ?? parsed.aircraftIdent ?? null,
    });
    const relevant = segments.filter((seg) => SEG_CATEGORY_MAP[seg.type]);
    result.detected = relevant.length;
    if (relevant.length === 0) return result;

    // Templates ativos compatíveis com o modelo da aeronave do voo
    let aircraftModelId: string | null = null;
    if (flightInfo.aircraft_ident) {
      try {
        const aircraft = await getAircraftByRegistration(flightInfo.aircraft_ident, DEFAULT_SCHOOL_ID);
        if (aircraft) aircraftModelId = aircraft.model_id;
      } catch {
        // aeronave não encontrada — usa todos os templates ativos
      }
    }
    const [aircraftTemplates, activeTemplates, allTemplates] = await Promise.all([
      aircraftModelId
        ? listManeuverTemplates({ activeOnly: true, aircraftModelId })
        : listManeuverTemplates({ activeOnly: true }),
      listManeuverTemplates({ activeOnly: true }),
      listManeuverTemplates(),
    ]);
    const categoryByTemplateId = new Map(allTemplates.map((t) => [t.id, t.category]));
    if (input.replaceExisting) {
      const removed = await clearAutoBuiltFlightReviewManeuvers(input.flightId);
      result.removed = removed.maneuvers;
    }
    const existing = input.replaceExisting ? [] : await listFlightManeuvers(input.flightId);

    const stepsCache = new Map<string, ManeuverTemplateStep[]>();
    const analysisContext = { parsed, segments };

    for (const seg of relevant) {
      const category = SEG_CATEGORY_MAP[seg.type]!;
      const tmpl =
        aircraftTemplates.find((t) => t.category === category && t.is_active) ??
        activeTemplates.find((t) => t.category === category && t.is_active);
      if (!tmpl) continue;

      const segStartMs = chartTimeBaseMs + seg.startX;
      const segEndMs = chartTimeBaseMs + seg.endX;

      const alreadyExists = existing.some((m) => {
        if (categoryByTemplateId.get(m.template_id) !== category) return false;
        const mStartMs = new Date(m.start_time).getTime();
        return (
          Number.isFinite(mStartMs) &&
          Math.abs(mStartMs - segStartMs) <= DEDUPE_START_TOLERANCE_MS
        );
      });
      if (alreadyExists) {
        result.skipped += 1;
        continue;
      }

      const maneuver = await createFlightManeuver({
        flight_id: input.flightId,
        template_id: tmpl.id,
        instructor_id: flightInfo.instructor_user_id ?? input.actorUserId,
        student_id: flightInfo.student_user_id,
        aircraft_ident: flightInfo.aircraft_ident,
        start_time: new Date(segStartMs).toISOString(),
        end_time: new Date(segEndMs).toISOString(),
        status: "draft",
        created_by: input.actorUserId,
      });
      result.added += 1;

      try {
        let steps = stepsCache.get(tmpl.id);
        if (!steps) {
          steps = await listManeuverTemplateSteps(tmpl.id);
          stepsCache.set(tmpl.id, steps);
        }
        const analysis = analyzeFlightManeuver(maneuver, tmpl, steps, "", analysisContext);
        const status = deriveReviewStatus(analysis);
        const summary = buildReviewSummary(analysis, status);
        await upsertFlightManeuverReview({
          flight_maneuver_id: maneuver.id,
          flight_id: input.flightId,
          status,
          summary,
          analysis,
        });
        await updateFlightManeuver(maneuver.id, { status: "analyzed" });
        result.analyzed += 1;
      } catch (err) {
        // Manobra criada fica como rascunho; instrutor pode analisar manualmente.
        if (!result.error) result.error = err as Error;
      }
    }

    return result;
  } catch (err) {
    result.error = err as Error;
    return result;
  }
}
