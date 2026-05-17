import type { AdminFlightReportRow } from "../types/adminFlightReports";

export const TELEMETRY_LOG_MATCH_TOLERANCE_MIN = 30;
export const TELEMETRY_LOG_HIGH_CONFIDENCE_MAX_MIN = 10;
/** Margem antes do horário de partida da ficha (min). */
export const FLIGHT_WINDOW_PRE_PAD_MIN = 15;
/** Margem após o fim previsto do voo (min). */
export const FLIGHT_WINDOW_POST_PAD_MIN = 45;
/** Duração padrão quando a ficha não tem tempo de voo (4 h). */
const DEFAULT_FLIGHT_DURATION_SEC = 4 * 3600;

const SAO_PAULO_TZ = "America/Sao_Paulo";
const LOG_FILENAME_RE = /^log_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_([a-z]{4})/i;

export type ParsedTelemetryLog = {
  dateZulu: string;
  timeZulu: string;
  depIcao: string;
  localDate: string;
  localTime: string;
  localMs: number;
};

export type FlightForLogMatch = Pick<
  AdminFlightReportRow,
  | "id"
  | "flightDate"
  | "startTime"
  | "firstDepIcao"
  | "lastArrIcao"
  | "aircraftIdent"
  | "route"
  | "durationSec"
> & {
  legIcaos: string[];
};

export type BulkLogFile = {
  id: string;
  name: string;
  file: File;
  parsed: ParsedTelemetryLog | null;
};

export type MatchConfidence = "high" | "medium" | "manual";

export type LogFileAssignment = {
  fileId: string;
  flightId: string | null;
  confidence: MatchConfidence;
};

export type UnallocatedReason =
  | "invalid_filename"
  | "no_candidate"
  | "ambiguous";

export type UnallocatedFile = {
  fileId: string;
  name: string;
  reason: UnallocatedReason;
  detail: string;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function partsInTimeZone(ms: number, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date(ms));
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

export function parseRouteLegIcaos(route: string): string[] {
  const airports: string[] = [];
  for (const part of route.split("->")) {
    const code = part.trim().toUpperCase();
    if (!code || code === "---") continue;
    if (airports[airports.length - 1] !== code) airports.push(code);
  }
  return airports;
}

export function flightForLogMatchFromRow(row: AdminFlightReportRow): FlightForLogMatch {
  const fromRoute = parseRouteLegIcaos(row.route || "");
  const legIcaos =
    fromRoute.length > 0
      ? fromRoute
      : [row.firstDepIcao, row.lastArrIcao].filter((code): code is string => Boolean(code?.trim()));

  return {
    id: row.id,
    flightDate: row.flightDate,
    startTime: row.startTime,
    firstDepIcao: row.firstDepIcao,
    lastArrIcao: row.lastArrIcao,
    aircraftIdent: row.aircraftIdent,
    route: row.route,
    durationSec: row.durationSec,
    legIcaos,
  };
}

export function zuluPartsToSaoPauloLocal(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): { localDate: string; localTime: string; localMs: number } {
  const zuluMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const local = partsInTimeZone(zuluMs, SAO_PAULO_TZ);
  return {
    localDate: `${local.year}-${pad2(local.month)}-${pad2(local.day)}`,
    localTime: `${pad2(local.hour)}:${pad2(local.minute)}`,
    localMs: zuluMs,
  };
}

export function parseTelemetryLogFilename(name: string): ParsedTelemetryLog | null {
  const base = name.replace(/\.[^.]+$/i, "").trim();
  const match = base.match(LOG_FILENAME_RE);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const depIcao = match[7]!.toUpperCase();
  if (![year, month, day, hour, minute, second].every(Number.isFinite)) return null;

  const { localDate, localTime, localMs } = zuluPartsToSaoPauloLocal(year, month, day, hour, minute, second);

  return {
    dateZulu: `${year}-${pad2(month)}-${pad2(day)}`,
    timeZulu: `${pad2(hour)}:${pad2(minute)}:${pad2(second)}`,
    depIcao,
    localDate,
    localTime,
    localMs,
  };
}

export function flightLocalMs(flightDate: string | null, startTime: string | null): number | null {
  if (!flightDate || !startTime) return null;
  const timeMatch = startTime.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!timeMatch) return null;
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  const [year, month, day] = flightDate.slice(0, 10).split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return null;

  const guessUtc = Date.UTC(year, month - 1, day, hour + 3, minute, 0);
  const local = partsInTimeZone(guessUtc, SAO_PAULO_TZ);
  if (
    local.year === year
    && local.month === month
    && local.day === day
    && local.hour === hour
    && local.minute === minute
  ) {
    return guessUtc;
  }

  for (let offsetHours = -2; offsetHours <= 6; offsetHours += 1) {
    const candidate = Date.UTC(year, month - 1, day, hour - offsetHours, minute, 0);
    const parts = partsInTimeZone(candidate, SAO_PAULO_TZ);
    if (
      parts.year === year
      && parts.month === month
      && parts.day === day
      && parts.hour === hour
      && parts.minute === minute
    ) {
      return candidate;
    }
  }

  return Date.UTC(year, month - 1, day, hour + 3, minute, 0);
}

export function flightTimeWindowMs(flight: FlightForLogMatch): { startMs: number; endMs: number } | null {
  const startMs = flightLocalMs(flight.flightDate, flight.startTime);
  if (startMs == null) return null;

  const durationSec =
    typeof flight.durationSec === "number" && flight.durationSec > 0
      ? flight.durationSec
      : DEFAULT_FLIGHT_DURATION_SEC;

  const prePad = FLIGHT_WINDOW_PRE_PAD_MIN * 60_000;
  const postPad = FLIGHT_WINDOW_POST_PAD_MIN * 60_000;
  return {
    startMs: startMs - prePad,
    endMs: startMs + durationSec * 1000 + postPad,
  };
}

function diffMinutes(aMs: number, bMs: number): number {
  return Math.abs(aMs - bMs) / 60_000;
}

function depOnRoute(depIcao: string, legIcaos: string[]): boolean {
  return legIcaos.includes(depIcao);
}

function logWithinFlightWindow(logMs: number, window: { startMs: number; endMs: number }): boolean {
  return logMs >= window.startMs && logMs <= window.endMs;
}

type ScoredCandidate = {
  flight: FlightForLogMatch;
  kind: "primary" | "segment";
  score: number;
  diffFromStartMin: number;
  confidence: MatchConfidence;
};

function scoreFlightForLog(
  parsed: ParsedTelemetryLog,
  flight: FlightForLogMatch,
  flightHasFiles: boolean,
): ScoredCandidate | null {
  const legIcaos = flight.legIcaos.map((code) => code.trim().toUpperCase()).filter(Boolean);
  if (!legIcaos.length || !depOnRoute(parsed.depIcao, legIcaos)) return null;

  const window = flightTimeWindowMs(flight);
  if (!window || !logWithinFlightWindow(parsed.localMs, window)) return null;

  const flightStartMs = flightLocalMs(flight.flightDate, flight.startTime);
  if (flightStartMs == null) return null;

  const firstDep = (flight.firstDepIcao || legIcaos[0] || "").trim().toUpperCase();
  const diffFromStartMin = diffMinutes(parsed.localMs, flightStartMs);
  const isPrimaryDep = parsed.depIcao === firstDep;

  if (isPrimaryDep) {
    if (diffFromStartMin > TELEMETRY_LOG_MATCH_TOLERANCE_MIN) return null;
    const confidence: MatchConfidence =
      diffFromStartMin <= TELEMETRY_LOG_HIGH_CONFIDENCE_MAX_MIN ? "high" : "medium";
    return {
      flight,
      kind: "primary",
      score: diffFromStartMin,
      diffFromStartMin,
      confidence,
    };
  }

  // Segmento intermediário (ex.: segundo arquivo após desligar o Garmin em SDAM).
  const segmentScore = diffFromStartMin + (flightHasFiles ? -5 : 20);
  return {
    flight,
    kind: "segment",
    score: segmentScore,
    diffFromStartMin,
    confidence: "medium",
  };
}

function pickBestCandidate(
  parsed: ParsedTelemetryLog,
  flights: FlightForLogMatch[],
  filesOnFlight: Map<string, number>,
): { flightId: string | null; confidence: MatchConfidence; reason?: UnallocatedReason } {
  const scored: ScoredCandidate[] = [];
  for (const flight of flights) {
    const hasFiles = (filesOnFlight.get(flight.id) ?? 0) > 0;
    const item = scoreFlightForLog(parsed, flight, hasFiles);
    if (item) scored.push(item);
  }

  if (!scored.length) {
    return { flightId: null, confidence: "manual", reason: "no_candidate" };
  }

  scored.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "primary" ? -1 : 1;
    return a.score - b.score || a.diffFromStartMin - b.diffFromStartMin;
  });

  const best = scored[0]!;
  const tied = scored.filter((item) => Math.abs(item.score - best.score) < 0.001 && item.kind === best.kind);
  if (tied.length > 1) {
    return { flightId: null, confidence: "manual", reason: "ambiguous" };
  }

  return {
    flightId: best.flight.id,
    confidence: best.confidence,
  };
}

export function buildAutoAssignments(
  files: BulkLogFile[],
  flights: FlightForLogMatch[],
  toleranceMin = TELEMETRY_LOG_MATCH_TOLERANCE_MIN,
): { assignments: LogFileAssignment[]; unallocated: UnallocatedFile[] } {
  void toleranceMin;
  const assignments: LogFileAssignment[] = [];
  const unallocated: UnallocatedFile[] = [];
  const filesOnFlight = new Map<string, number>();

  const sorted = [...files].sort((a, b) => {
    const aMs = a.parsed?.localMs ?? Number.MAX_SAFE_INTEGER;
    const bMs = b.parsed?.localMs ?? Number.MAX_SAFE_INTEGER;
    return aMs - bMs || a.name.localeCompare(b.name, "pt-BR");
  });

  for (const file of sorted) {
    if (!file.parsed) {
      unallocated.push({
        fileId: file.id,
        name: file.name,
        reason: "invalid_filename",
        detail: "Nome fora do padrão log_AAAAMMDD_HHMMSS_ICAO",
      });
      assignments.push({ fileId: file.id, flightId: null, confidence: "manual" });
      continue;
    }

    const pick = pickBestCandidate(file.parsed, flights, filesOnFlight);
    if (!pick.flightId) {
      unallocated.push({
        fileId: file.id,
        name: file.name,
        reason: pick.reason ?? "no_candidate",
        detail:
          pick.reason === "ambiguous"
            ? "Mais de um voo compatível no filtro"
            : "Aeródromo ou horário fora da rota/duração do voo",
      });
      assignments.push({ fileId: file.id, flightId: null, confidence: "manual" });
      continue;
    }

    filesOnFlight.set(pick.flightId, (filesOnFlight.get(pick.flightId) ?? 0) + 1);
    assignments.push({
      fileId: file.id,
      flightId: pick.flightId,
      confidence: pick.confidence,
    });
  }

  return { assignments, unallocated };
}

export function unallocatedReasonLabel(reason: UnallocatedReason): string {
  if (reason === "invalid_filename") return "Nome inválido";
  if (reason === "ambiguous") return "Ambíguo";
  return "Sem voo compatível";
}
