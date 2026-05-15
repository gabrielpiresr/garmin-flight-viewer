import { decodeFlightRecord, encodeFlightRecord, type FlightRecordTelemetryFile } from "./flightRecordCodec";
import { buildFlightTelemetryMetrics, deriveIdentity } from "./flightTelemetryMetrics";
import { getSavedFlight, updateFlight } from "./flightsDb";
import { chartDurationSec, summarizeFlight } from "./flightStats";
import { parseGarminCsv } from "./parseGarminCsv";
import { mergeTelemetryCsvFiles } from "./telemetryCsvMerge";
import type { UserRole } from "./rbac";

export type AttachFlightTelemetryInput = {
  flightId: string;
  actorUserId: string;
  actorRole: UserRole;
  telemetryFiles: FlightRecordTelemetryFile[];
};

export async function attachFlightTelemetry(
  input: AttachFlightTelemetryInput,
): Promise<{ error: Error | null }> {
  const { flightId, actorUserId, actorRole, telemetryFiles } = input;
  if (!telemetryFiles.length) {
    return { error: new Error("Selecione pelo menos um CSV para processar.") };
  }

  const saved = await getSavedFlight(flightId);
  if (saved.error || !saved.data) {
    return { error: saved.error ?? new Error("Voo não encontrado.") };
  }

  const decoded = decodeFlightRecord(saved.data.csv_text);
  if (!decoded.meta) {
    return { error: new Error("Ficha do voo sem metadados para anexar telemetria.") };
  }

  const merged = mergeTelemetryCsvFiles(telemetryFiles);
  if (!merged.csv.trim()) {
    return { error: new Error("Nenhum CSV de telemetria selecionado.") };
  }

  const parsed = parseGarminCsv(merged.csv);
  const parsedSummary = summarizeFlight(parsed.points);
  const durationSec = chartDurationSec(parsed.chartData, parsed.hasChartTime) ?? parsedSummary.durationSec;
  const csvText = encodeFlightRecord({
    meta: decoded.meta,
    telemetryCsv: merged.csv,
    telemetryFiles,
  });
  const identity = deriveIdentity({
    meta: decoded.meta,
    studentUserId: saved.data.student_user_id ?? decoded.meta.header.studentUserId,
    instructorUserId: saved.data.instructor_user_id ?? decoded.meta.header.instructorUserId ?? null,
    aircraftIdent: saved.data.aircraft_ident ?? decoded.meta.header.aircraft ?? null,
  });
  const telemetryMetrics = buildFlightTelemetryMetrics({ parsed, identity, meta: decoded.meta });

  const result = await updateFlight(flightId, {
    actorUserId,
    actorRole,
    studentUserId: saved.data.student_user_id ?? decoded.meta.header.studentUserId,
    instructorUserId: saved.data.instructor_user_id ?? decoded.meta.header.instructorUserId ?? null,
    source_filename: merged.sourceFileName,
    csv_text: csvText,
    aircraft_ident: saved.data.aircraft_ident ?? decoded.meta.header.aircraft ?? null,
    duration_sec: durationSec,
    telemetryMetrics,
    telemetryAlertParsed: parsed,
  });

  return { error: result.error };
}
