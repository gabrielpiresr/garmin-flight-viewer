import type { AdminFlightReportRow } from "../types/adminFlightReports";

export const TELEMETRY_LOG_MATCH_TOLERANCE_MIN = 5;

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
  "id" | "flightDate" | "startTime" | "firstDepIcao" | "lastArrIcao" | "aircraftIdent" | "route"
>;

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
  | "ambiguous"
  | "flight_taken";

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

function diffMinutes(aMs: number, bMs: number): number {
  return Math.abs(aMs - bMs) / 60_000;
}

type ScoredCandidate = {
  flight: FlightForLogMatch;
  diffMin: number;
  arrMatch: boolean;
};

function scoreCandidates(parsed: ParsedTelemetryLog, flights: FlightForLogMatch[]): ScoredCandidate[] {
  const candidates: ScoredCandidate[] = [];
  for (const flight of flights) {
    const dep = (flight.firstDepIcao || "").trim().toUpperCase();
    if (!dep || dep !== parsed.depIcao) continue;

    const flightMs = flightLocalMs(flight.flightDate, flight.startTime);
    if (flightMs == null) continue;

    const diffMin = diffMinutes(parsed.localMs, flightMs);
    const arr = (flight.lastArrIcao || "").trim().toUpperCase();
    candidates.push({
      flight,
      diffMin,
      arrMatch: Boolean(arr && parsed.depIcao !== arr),
    });
  }

  return candidates.sort((a, b) => a.diffMin - b.diffMin || Number(b.arrMatch) - Number(a.arrMatch));
}

function pickBestCandidate(
  parsed: ParsedTelemetryLog,
  flights: FlightForLogMatch[],
  takenFlightIds: Set<string>,
  toleranceMin: number,
): { flightId: string | null; confidence: MatchConfidence; reason?: UnallocatedReason } {
  const available = flights.filter((flight) => !takenFlightIds.has(flight.id));
  const scored = scoreCandidates(parsed, available).filter((item) => item.diffMin <= toleranceMin);
  if (!scored.length) {
    const any = scoreCandidates(parsed, available);
    if (!any.length) return { flightId: null, confidence: "manual", reason: "no_candidate" };
    return { flightId: null, confidence: "manual", reason: "no_candidate" };
  }

  const best = scored[0]!;
  const tied = scored.filter((item) => Math.abs(item.diffMin - best.diffMin) < 0.001);
  if (tied.length > 1) {
    return { flightId: null, confidence: "manual", reason: "ambiguous" };
  }

  return {
    flightId: best.flight.id,
    confidence: best.diffMin <= 2 ? "high" : "medium",
  };
}

export function buildAutoAssignments(
  files: BulkLogFile[],
  flights: FlightForLogMatch[],
  toleranceMin = TELEMETRY_LOG_MATCH_TOLERANCE_MIN,
): { assignments: LogFileAssignment[]; unallocated: UnallocatedFile[] } {
  const assignments: LogFileAssignment[] = [];
  const unallocated: UnallocatedFile[] = [];
  const takenFlightIds = new Set<string>();

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

    const pick = pickBestCandidate(file.parsed, flights, takenFlightIds, toleranceMin);
    if (!pick.flightId) {
      unallocated.push({
        fileId: file.id,
        name: file.name,
        reason: pick.reason ?? "no_candidate",
        detail:
          pick.reason === "ambiguous"
            ? "Mais de um voo compatível no filtro"
            : "Nenhum voo compatível no filtro atual",
      });
      assignments.push({ fileId: file.id, flightId: null, confidence: "manual" });
      continue;
    }

    takenFlightIds.add(pick.flightId);
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
  if (reason === "flight_taken") return "Voo já associado";
  return "Sem voo";
}
