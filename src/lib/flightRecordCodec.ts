import type { FlightExerciseGrade } from "../types/trainingExercise";
import type { TrainingSelectionSnapshot } from "../types/trainingTrack";
import {
  mergeTelemetryCsvFiles,
  type TelemetryCsvFileMeta,
  type TelemetryCsvGap,
  type TelemetryCsvSource,
} from "./telemetryCsvMerge";
import type { FlightWeightBalanceMeta } from "./weightBalance";

const META_PREFIX = "#GFV_META_V1:";
const TELEMETRY_FILES_PREFIX = "#GFV_TELEMETRY_FILES_V1:";

export type FlightRecordMeta = {
  header: {
    studentUserId: string;
    studentLabel: string;
    studentName?: string;
    studentAnac?: string;
    instructorUserId?: string;
    instructorName?: string;
    instructorAnac?: string;
    date: string;
    startTime?: string;
    /** Horário local (ficha); nomes *Utc por compatibilidade. UTC só no diário de bordo. */
    departureTimeUtc?: string;
    engineCutoffTimeUtc?: string;
    takeoffTimeUtc?: string;
    landingTimeUtc?: string;
    aircraft: string;
    isNight?: boolean;
    flightSeqNumber?: number | string;
    flightNature?: string;
    cargo?: string;
  };
  schedule?: {
    version: "AUTO_SCHEDULE_V1";
    weekStart: string;
    demandId: string;
    allocationLayer?: string;
    relaxationLevel?: string;
  };
  training?: {
    trackId?: string;
    stageId?: string;
    missionId?: string;
    missionIds?: string[];
    snapshot?: TrainingSelectionSnapshot | null;
    snapshots?: TrainingSelectionSnapshot[];
  };
  cancellation?: {
    reasonCode: string;
    reasonText?: string;
    updatedAt?: string;
  };
  preFlight: {
    objectiveMd: string;
    briefingMd: string;
    instructorSuggestionMd?: string;
    studentSuggestionMd?: string;
  };
  legs: Array<{
    id: string;
    date: string;
    role: string;
    studentRole?: string;
    instructorRole?: string;
    dep: string;
    arr: string;
    landings: number;
    flightTime: string;
    navTime: string;
    ifrTime: string;
    nightTime: string;
    serviceTime: string;
    /** Horarios locais por perna; nomes mantem compatibilidade com campos historicos do header. */
    engineStart?: string;
    takeoff?: string;
    landing?: string;
    engineCut?: string;
    distance: string;
    fuelLiters?: number | null;
  }>;
  exercises?: FlightExerciseGrade[];
  weightBalance?: FlightWeightBalanceMeta;
  technicalLog?: {
    discrepancyCode?: string;
    discrepancies: string;
    correctiveActions: string;
    occurrenceCode?: string;
    occurrences?: string;
  };
  maintenanceSnapshot?: null;
  risk: {
    commentsMd: string;
    dangerMd: string;
    riskMd: string;
    managementMd: string;
    instructorOutcome?: "approved" | "failed" | "";
    instructorOpinionMd: string;
  };
};

export type FlightRecordTelemetryFile = TelemetryCsvSource;

function toBase64(text: string): string {
  return btoa(unescape(encodeURIComponent(text)));
}

function fromBase64(encoded: string): string {
  return decodeURIComponent(escape(atob(encoded)));
}

export function encodeFlightRecord(payload: {
  meta: FlightRecordMeta;
  telemetryCsv: string;
  telemetryFiles?: FlightRecordTelemetryFile[];
}): string {
  const metaEncoded = toBase64(JSON.stringify(payload.meta));
  const telemetryFiles = (payload.telemetryFiles ?? []).filter((file) => file.name.trim() && file.text.trim());
  if (telemetryFiles.length > 0) {
    const filesEncoded = toBase64(JSON.stringify({ files: telemetryFiles }));
    return `${META_PREFIX}${metaEncoded}\n${TELEMETRY_FILES_PREFIX}${filesEncoded}`;
  }
  const csv = payload.telemetryCsv.trim();
  if (!csv) return `${META_PREFIX}${metaEncoded}\n`;
  return `${META_PREFIX}${metaEncoded}\n${csv}`;
}

/** Decodifica apenas o bloco de meta (primeira linha). Não processa telemetria. */
export function decodeFlightRecordMeta(recordPrefix: string): FlightRecordMeta | null {
  const normalized = (recordPrefix ?? "").replace(/^\uFEFF/, "");
  const firstLine = normalized.split(/\r?\n/, 1)[0]?.trim() ?? "";
  if (!firstLine.startsWith(META_PREFIX)) return null;
  try {
    const raw = fromBase64(firstLine.slice(META_PREFIX.length).trim());
    return JSON.parse(raw) as FlightRecordMeta;
  } catch {
    return null;
  }
}

export function decodeFlightRecord(recordText: string): {
  meta: FlightRecordMeta | null;
  telemetryCsv: string;
  telemetryFiles?: FlightRecordTelemetryFile[];
  telemetryFileMetadata?: TelemetryCsvFileMeta[];
  telemetryGaps?: TelemetryCsvGap[];
  telemetryGapSec?: number;
} {
  const normalized = (recordText ?? "").replace(/^\uFEFF/, "");
  const lines = normalized.split(/\r?\n/);
  const first = (lines[0] ?? "").trim();
  if (!first.startsWith(META_PREFIX)) {
    return { meta: null, telemetryCsv: normalized };
  }
  const encoded = first.slice(META_PREFIX.length).trim();
  let meta: FlightRecordMeta | null = null;
  try {
    const raw = fromBase64(encoded);
    meta = JSON.parse(raw) as FlightRecordMeta;
  } catch {
    meta = null;
  }
  const second = (lines[1] ?? "").trim();
  if (second.startsWith(TELEMETRY_FILES_PREFIX)) {
    const fallbackCsv = lines.slice(2).join("\n");
    try {
      const raw = fromBase64(second.slice(TELEMETRY_FILES_PREFIX.length).trim());
      const parsed = JSON.parse(raw) as { files?: FlightRecordTelemetryFile[] };
      const telemetryFiles =
        parsed.files?.filter((file) => typeof file.name === "string" && typeof file.text === "string") ?? [];
      if (telemetryFiles.length > 0) {
        const merged = mergeTelemetryCsvFiles(telemetryFiles);
        return {
          meta,
          telemetryCsv: merged.csv,
          telemetryFiles,
          telemetryFileMetadata: merged.files,
          telemetryGaps: merged.gaps,
          telemetryGapSec: merged.totalGapSec,
        };
      }
    } catch {
      // Fall back to any merged CSV appended after the marker.
    }
    return { meta, telemetryCsv: fallbackCsv };
  }
  return { meta, telemetryCsv: lines.slice(1).join("\n") };
}
