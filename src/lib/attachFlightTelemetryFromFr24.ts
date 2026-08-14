import { attachFlightTelemetry, type AttachFlightTelemetryOutcome } from "./attachFlightTelemetry";
import { decodeFlightRecord } from "./flightRecordCodec";
import {
  getFlightRadarFlightSummary,
  getFlightRadarFlightTrack,
  getFlightRadarLivePositions,
  normalizeAircraftRegistration,
  searchFlightRadar,
} from "./flightRadarDb";
import { fr24TelemetryFileName, flightRadarTrackToGarminCsv } from "./flightRadarTrackToGarminCsv";
import { getSavedFlight, type SavedFlightFull } from "./flightsDb";
import { parseGarminCsv } from "./parseGarminCsv";
import type { UserRole } from "./rbac";
import { flightLocalMs } from "./telemetryLogFilename";
import type { FlightPoint } from "../types/flight";
import type { FlightRadarSummary } from "../types/flightRadar";

const MATCH_TOLERANCE_MIN = 90;
const HIGH_CONFIDENCE_MAX_MIN = 25;
const QUERY_PRE_PAD_MS = 3 * 60 * 60 * 1000;
const QUERY_POST_PAD_MS = 10 * 60 * 60 * 1000;
const DEFAULT_DURATION_MS = 4 * 60 * 60 * 1000;

export type Fr24TelemetryMatch = {
  fr24Id: string;
  summary: FlightRadarSummary | null;
  deltaMin: number | null;
  confidence: "high" | "medium" | "live";
  label: string;
};

export type AttachFlightTelemetryFromFr24Input = {
  flightId: string;
  actorUserId: string;
  actorRole: UserRole;
  /** When true, replaces existing telemetry without another confirm step. */
  replaceExisting?: boolean;
  /** Optional explicit FR24 flight id (skips auto-match). */
  fr24Id?: string | null;
};

export type AttachFlightTelemetryFromFr24Result =
  | {
      ok: true;
      match: Fr24TelemetryMatch;
      points: number;
      attach: AttachFlightTelemetryOutcome;
      sourceFileName: string;
    }
  | {
      ok: false;
      error: Error;
      needsConfirmReplace?: boolean;
      match?: Fr24TelemetryMatch;
      candidates?: Fr24TelemetryMatch[];
    };

function parseIsoMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function buildQueryRange(flightDate: string | null, startTime: string | null, durationSec: number | null) {
  const startMs = flightLocalMs(flightDate, startTime);
  if (startMs != null) {
    const durationMs =
      durationSec != null && Number.isFinite(durationSec) && durationSec > 0
        ? durationSec * 1000
        : DEFAULT_DURATION_MS;
    return {
      datetimeFrom: new Date(startMs - QUERY_PRE_PAD_MS).toISOString(),
      datetimeTo: new Date(startMs + durationMs + QUERY_POST_PAD_MS).toISOString(),
      startMs,
    };
  }
  if (flightDate && /^\d{4}-\d{2}-\d{2}/.test(flightDate)) {
    const day = flightDate.slice(0, 10);
    // Broad local-day window expressed in UTC (±3h SP offset cushion).
    return {
      datetimeFrom: `${day}T00:00:00Z`,
      datetimeTo: `${day}T23:59:59Z`,
      startMs: Date.parse(`${day}T15:00:00Z`),
    };
  }
  const to = Date.now();
  return {
    datetimeFrom: new Date(to - 48 * 60 * 60 * 1000).toISOString(),
    datetimeTo: new Date(to).toISOString(),
    startMs: to,
  };
}

function scoreSummary(
  summary: FlightRadarSummary,
  startMs: number | null,
  depIcao: string | null,
): Fr24TelemetryMatch | null {
  const takeoffMs =
    parseIsoMs(summary.takeoff) ?? parseIsoMs(summary.firstSeen) ?? parseIsoMs(summary.landed);
  let deltaMin: number | null = null;
  if (startMs != null && takeoffMs != null) {
    deltaMin = Math.abs(takeoffMs - startMs) / 60_000;
    if (deltaMin > MATCH_TOLERANCE_MIN) return null;
  }

  let score = 0;
  if (deltaMin != null) score += Math.max(0, 100 - deltaMin);
  if (depIcao && summary.origIcao && summary.origIcao.toUpperCase() === depIcao.toUpperCase()) {
    score += 25;
  }

  const confidence: Fr24TelemetryMatch["confidence"] =
    deltaMin != null && deltaMin <= HIGH_CONFIDENCE_MAX_MIN ? "high" : "medium";

  const when = summary.takeoff || summary.firstSeen || "horário desconhecido";
  const route = [summary.origIcao || "????", summary.destIcao || "????"].join(" → ");
  return {
    fr24Id: summary.fr24Id,
    summary,
    deltaMin,
    confidence,
    label: `${summary.reg || "—"} · ${route} · ${when} (score ${Math.round(score)})`,
  };
}

function pickBestMatch(
  summaries: FlightRadarSummary[],
  startMs: number | null,
  depIcao: string | null,
): { best: Fr24TelemetryMatch | null; candidates: Fr24TelemetryMatch[] } {
  const candidates = summaries
    .map((row) => scoreSummary(row, startMs, depIcao))
    .filter((row): row is Fr24TelemetryMatch => Boolean(row))
    .sort((a, b) => (a.deltaMin ?? 9999) - (b.deltaMin ?? 9999));

  if (!candidates.length && summaries.length === 1) {
    const only = summaries[0]!;
    return {
      best: {
        fr24Id: only.fr24Id,
        summary: only,
        deltaMin: null,
        confidence: "medium",
        label: `${only.reg || "—"} · único voo FR24 no período`,
      },
      candidates: [],
    };
  }

  return { best: candidates[0] ?? null, candidates };
}

async function resolveLiveMatch(registration: string): Promise<Fr24TelemetryMatch | null> {
  try {
    const live = await getFlightRadarLivePositions([registration]);
    const hit =
      live.positions.find(
        (p) => normalizeAircraftRegistration(p.reg || "") === registration && p.fr24Id,
      ) ?? live.positions.find((p) => p.fr24Id);
    if (hit?.fr24Id) {
      return {
        fr24Id: hit.fr24Id,
        summary: null,
        deltaMin: null,
        confidence: "live",
        label: `${registration} · posição ao vivo FR24`,
      };
    }
  } catch {
    // fall through to search
  }

  try {
    const search = await searchFlightRadar(registration);
    const hit =
      search.positions.find(
        (p) => normalizeAircraftRegistration(p.reg || "") === registration && p.fr24Id,
      ) ?? search.positions[0];
    if (hit?.fr24Id) {
      return {
        fr24Id: hit.fr24Id,
        summary: null,
        deltaMin: null,
        confidence: "live",
        label: `${registration} · busca ao vivo FR24`,
      };
    }
  } catch {
    return null;
  }
  return null;
}

type ResolvedFr24Track =
  | {
      ok: true;
      match: Fr24TelemetryMatch;
      csv: string;
      sourceFileName: string;
      pointCount: number;
    }
  | {
      ok: false;
      error: Error;
      match?: Fr24TelemetryMatch;
      candidates?: Fr24TelemetryMatch[];
    };

async function resolveFr24TrackForSavedFlight(
  saved: SavedFlightFull,
  fr24Id?: string | null,
): Promise<ResolvedFr24Track> {
  const decoded = decodeFlightRecord(saved.csv_text);
  if (!decoded.meta) {
    return { ok: false, error: new Error("Ficha do voo sem metadados para anexar telemetria.") };
  }

  const registration = normalizeAircraftRegistration(
    saved.aircraft_ident || decoded.meta.header.aircraft || "",
  );
  if (!registration) {
    return {
      ok: false,
      error: new Error("Informe a matrícula da aeronave na ficha para buscar no Flightradar24."),
    };
  }

  let match: Fr24TelemetryMatch | null = null;
  let candidates: Fr24TelemetryMatch[] = [];

  if (fr24Id?.trim()) {
    match = {
      fr24Id: fr24Id.trim(),
      summary: null,
      deltaMin: null,
      confidence: "medium",
      label: `FR24 ${fr24Id.trim()}`,
    };
  } else {
    const depIcao = decoded.meta.legs?.[0]?.dep?.trim().toUpperCase() || null;
    const range = buildQueryRange(
      saved.flight_date || decoded.meta.header.date || null,
      saved.start_time ||
        decoded.meta.legs?.find((leg) => leg.engineStart?.trim())?.engineStart ||
        decoded.meta.header.departureTimeUtc ||
        decoded.meta.header.startTime ||
        null,
      saved.duration_sec,
    );

    const summaryResult = await getFlightRadarFlightSummary([registration], {
      datetimeFrom: range.datetimeFrom,
      datetimeTo: range.datetimeTo,
    });
    if (summaryResult.message && !summaryResult.summaries.length) {
      // keep going — live fallback may still work
    }

    const picked = pickBestMatch(summaryResult.summaries, range.startMs, depIcao);
    match = picked.best;
    candidates = picked.candidates;

    if (!match) {
      match = await resolveLiveMatch(registration);
    }
  }

  if (!match?.fr24Id) {
    return {
      ok: false,
      error: new Error(
        `Nenhum voo do Flightradar24 encontrado para ${registration} no horário da ficha.`,
      ),
      candidates,
    };
  }

  const track = await getFlightRadarFlightTrack(match.fr24Id);
  if (!track.tracks.length) {
    return {
      ok: false,
      error: new Error("Flightradar24 não retornou pontos de trajetória para este voo."),
      match,
    };
  }

  const csv = flightRadarTrackToGarminCsv(track.tracks, {
    fr24Id: match.fr24Id,
    registration,
  });
  return {
    ok: true,
    match,
    csv,
    sourceFileName: fr24TelemetryFileName(match.fr24Id),
    pointCount: track.tracks.length,
  };
}

/** Busca a trilha FR24 em memória (não grava na ficha). Usado pelo Flyover. */
export async function fetchFr24TrackPointsForFlight(flightId: string): Promise<
  | { ok: true; points: FlightPoint[]; sourceFileName: string; match: Fr24TelemetryMatch }
  | { ok: false; error: Error }
> {
  const saved = await getSavedFlight(flightId);
  if (saved.error || !saved.data) {
    return { ok: false, error: saved.error ?? new Error("Voo não encontrado.") };
  }
  const resolved = await resolveFr24TrackForSavedFlight(saved.data);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const parsed = parseGarminCsv(resolved.csv);
  if (parsed.points.length < 2) {
    return { ok: false, error: new Error("Flightradar24 não retornou pontos de trajetória para este voo.") };
  }
  return {
    ok: true,
    points: parsed.points,
    sourceFileName: resolved.sourceFileName,
    match: resolved.match,
  };
}

/**
 * Encontra o voo no Flightradar24 (matrícula + horário da ficha) e anexa a trilha
 * pelo mesmo caminho de `attachFlightTelemetry` usado pelos CSVs Garmin.
 */
export async function attachFlightTelemetryFromFr24(
  input: AttachFlightTelemetryFromFr24Input,
): Promise<AttachFlightTelemetryFromFr24Result> {
  const saved = await getSavedFlight(input.flightId);
  if (saved.error || !saved.data) {
    return { ok: false, error: saved.error ?? new Error("Voo não encontrado.") };
  }

  const decoded = decodeFlightRecord(saved.data.csv_text);
  if (!decoded.meta) {
    return { ok: false, error: new Error("Ficha do voo sem metadados para anexar telemetria.") };
  }

  const hasExistingTelemetry = Boolean(decoded.telemetryCsv?.trim());
  if (hasExistingTelemetry && !input.replaceExisting) {
    return {
      ok: false,
      error: new Error(
        "Este voo já tem telemetria. Confirme para substituir pelos dados do Flightradar24.",
      ),
      needsConfirmReplace: true,
    };
  }

  const resolved = await resolveFr24TrackForSavedFlight(saved.data, input.fr24Id);
  if (!resolved.ok) {
    return {
      ok: false,
      error: resolved.error,
      match: resolved.match,
      candidates: resolved.candidates,
    };
  }

  const attach = await attachFlightTelemetry({
    flightId: input.flightId,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    telemetryFiles: [{ name: resolved.sourceFileName, text: resolved.csv }],
  });

  if (attach.error) {
    return { ok: false, error: attach.error, match: resolved.match };
  }

  return {
    ok: true,
    match: resolved.match,
    points: resolved.pointCount,
    attach,
    sourceFileName: resolved.sourceFileName,
  };
}
