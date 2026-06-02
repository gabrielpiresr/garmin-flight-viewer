import type { FlightRecordMeta } from "./flightRecordCodec";

import type { SavedFlightFull, SavedFlightListItem } from "./flightsDb";
import { downloadCsv } from "./csvExport";

import {
  crewPresentationTimeUtc,
  localTimeToUtcHhMm,
  minutesToDecimalHours,
} from "./flightLogbookTimes";
import { buildAnacFlightSequence } from "./flightSequence";

import type { MaintenanceAsOfFlight } from "./maintenanceAtDate";

import type { FlightSignaturesForFlight } from "./flightSignaturesDb";
import type { FlightDiscrepancy } from "./flightDiscrepanciesDb";
import type { LogbookOpeningSignature } from "./logbookOpeningSignaturesDb";
import type { Aircraft, AircraftModel, MaintenanceWorkOrder } from "../types/admin";

export type AnacLogbookEntry = {
  flightId: string;

  legIndex: number;

  legCount: number;

  seqNumber: string;

  flightDate: string;

  aircraft: string;

  route: string;

  nature: string;

  cargo: string;

  personsOnBoard: string;

  crewLines: string;

  departureUtc: string;

  takeoffUtc: string;

  landingUtc: string;

  engineCutoffUtc: string;

  flightTime: string;

  dayTime: string;

  nightTime: string;

  navTime: string;

  serviceTime: string;

  /** IFR real (R) — único campo IFR na ficha hoje. */

  ifrHoursReal: string;

  /** IFR sob capota (C) — sem campo na ficha; permanece vazio até evolução do cadastro. */

  ifrHoursCap: string;

  fuelByLeg: string;

  landingsPartial: string;

  landingsTotal: string;

  cyclesPartialTotal: string;

  occurrences: string;

  discrepancies: string;

  discrepancyDetectedBy: string;

  correctiveActions: string;

  maintenance: MaintenanceAsOfFlight;

  signatures: {
    student: string;

    instructor: string;

    operator: string;
  };
};

type BuildLogbookParams = {
  flight: SavedFlightListItem | SavedFlightFull;

  meta: FlightRecordMeta;

  signatures: FlightSignaturesForFlight;

  maintenance: MaintenanceAsOfFlight;

  profileNames?: { student?: string; instructor?: string; operator?: string };
};

function formatAnacDate(isoDate: string | null): string {
  if (!isoDate) return "—";

  const ms = new Date(`${isoDate}T00:00:00`).getTime();

  if (Number.isNaN(ms)) return isoDate;

  return new Date(ms).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function durationToMinutes(value: string): number {
  const match = String(value || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})$/);

  if (!match) return 0;

  const h = Number(match[1]);

  const m = Number(match[2]);

  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;

  return h * 60 + m;
}

function formatMinutesHhMm(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));

  const h = Math.floor(safe / 60);

  const m = safe % 60;

  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function displayDuration(value: string | undefined): string {
  const trimmed = String(value ?? "").trim();

  return trimmed || "—";
}

/** Diurno = tempo de voo − noturno, quando ambos são HH:MM válidos. */

function computeDayTime(flightTime: string, nightTime: string): string {
  const flightMin = durationToMinutes(flightTime);

  if (flightMin <= 0) return displayDuration(flightTime);

  const nightMin = durationToMinutes(nightTime);

  if (nightMin <= 0) return displayDuration(flightTime);

  return formatMinutesHhMm(flightMin - nightMin);
}

function ifrMinutesToDecimal(value: string): string {
  const min = durationToMinutes(value);

  return min > 0 ? minutesToDecimalHours(min) : "0";
}

function mapRoleToAnac(role: string): string {
  const normalized = role.toLowerCase();

  if (normalized.includes("instrução") || normalized.includes("instrucao"))
    return "I";

  if (normalized.includes("co-piloto") || normalized.includes("copiloto"))
    return "O";

  if (normalized.includes("comiss")) return "C";

  if (normalized.includes("mecân") || normalized.includes("mecan")) return "M";

  if (normalized.includes("instrutor")) return "P";

  return "P";
}

function formatTechnicalLogChoice(code: string | undefined, detail: string | undefined, emptyValue: string): string {
  const normalizedCode = (code ?? "").trim();
  const normalizedDetail = (detail ?? "").trim();
  if (!normalizedCode || normalizedCode === emptyValue) return normalizedDetail || "—";
  return normalizedDetail ? `${normalizedCode} - ${normalizedDetail}` : normalizedCode;
}

function buildCrewLines(
  meta: FlightRecordMeta,
  flightDateIso: string,
  leg?: FlightRecordMeta["legs"][number],
): string {
  const departureLocal =
    meta.header.departureTimeUtc ?? meta.header.startTime ?? "";

  const departureUtc = departureLocal
    ? localTimeToUtcHhMm(flightDateIso, departureLocal)
    : "";

  const presentation =
    departureUtc && departureUtc !== "—"
      ? crewPresentationTimeUtc(departureUtc)
      : "—";

  const lines: string[] = [];

  const currentLeg = leg ?? meta.legs[0];

  if (meta.header.studentAnac) {
    const studentRole = mapRoleToAnac(currentLeg?.studentRole ?? "Piloto em Instrução");
    lines.push(
      `${meta.header.studentAnac} / ${studentRole} / apresentação ${presentation} UTC`,
    );
  }

  if (meta.header.instructorAnac) {
    const role = mapRoleToAnac(
      currentLeg?.instructorRole ?? currentLeg?.role ?? "Instrutor de voo",
    );

    lines.push(
      `${meta.header.instructorAnac} / ${role} / apresentação ${presentation} UTC`,
    );
  }

  return lines.length > 0 ? lines.join("; ") : "—";
}

function formatSignatureBlock(
  label: string,

  sig: FlightSignaturesForFlight["student"],

  profileName?: string,
): string {
  if (!sig) return `${label}: —`;

  const when = new Date(sig.signed_at).toLocaleString("pt-BR", {
    timeZone: "UTC",
  });

  const hash = sig.content_hash ?? "—";
  const version = sig.payload_version ?? "—";

  return `${label}: ${profileName ?? sig.signer_user_id.slice(0, 8)} · papel ${sig.signer_role} · ${when} UTC · payload ${version} · hash ${hash}`;
}

function anacSequenceForFlight(flight: SavedFlightListItem | SavedFlightFull, meta: FlightRecordMeta): string {
  return buildAnacFlightSequence({
    aircraft: meta.header.aircraft || flight.aircraft_ident,
    date: flight.flight_date ?? meta.header.date,
    time: meta.header.departureTimeUtc ?? meta.header.startTime ?? flight.start_time,
  }) || (
    flight.flight_seq_number != null
      ? String(flight.flight_seq_number)
      : meta.header.flightSeqNumber != null
        ? String(meta.header.flightSeqNumber)
        : "—"
  );
}

function buildFlightLevelFields(
  params: BuildLogbookParams,
  flightDateIso: string,
) {
  const { meta, flight } = params;

  const toUtc = (local: string | undefined) =>
    local?.trim() ? localTimeToUtcHhMm(flightDateIso, local.trim()) : "—";

  return {
    flightId: flight.id,

    seqNumber: anacSequenceForFlight(flight, meta),

    flightDate: formatAnacDate(flight.flight_date ?? meta.header.date ?? null),

    aircraft: meta.header.aircraft || flight.aircraft_ident || "—",

    nature: meta.header.flightNature ?? "TN",

    cargo: meta.header.cargo ?? "—",

    personsOnBoard:
      meta.weightBalance?.inputs.personsOnBoard != null
        ? String(meta.weightBalance.inputs.personsOnBoard)
        : "2",

    departureUtc: toUtc(meta.header.departureTimeUtc ?? meta.header.startTime),

    takeoffUtc: toUtc(meta.header.takeoffTimeUtc),

    landingUtc: toUtc(meta.header.landingTimeUtc),

    engineCutoffUtc: toUtc(meta.header.engineCutoffTimeUtc),

    occurrences: formatTechnicalLogChoice(
      meta.technicalLog?.occurrenceCode,
      meta.technicalLog?.occurrences,
      "Sem ocorrências",
    ),

    discrepancies: formatTechnicalLogChoice(
      meta.technicalLog?.discrepancyCode,
      meta.technicalLog?.discrepancies,
      "Sem discrepâncias",
    ),

    discrepancyDetectedBy:
      meta.header.instructorName ?? meta.header.instructorAnac ?? "Instrutor",

    correctiveActions: meta.technicalLog?.correctiveActions ?? "Somente via OS",

    maintenance: params.maintenance,

    signatures: {
      student: formatSignatureBlock(
        "Aluno",
        params.signatures.student,
        params.profileNames?.student,
      ),

      instructor: formatSignatureBlock(
        "Instrutor",
        params.signatures.instructor,
        params.profileNames?.instructor,
      ),

      operator: formatSignatureBlock(
        "Operador",
        params.signatures.admin_operator,
        params.profileNames?.operator,
      ),
    },
  };
}

function legRoute(leg: FlightRecordMeta["legs"][number]): string {
  const dep = leg.dep?.trim();

  const arr = leg.arr?.trim();

  if (dep && arr) return `${dep}-${arr}`;

  return dep || arr || "—";
}

function legFuel(leg: FlightRecordMeta["legs"][number]): string {
  return leg.fuelLiters != null ? `${leg.fuelLiters} L` : "—";
}

function legLandings(leg: FlightRecordMeta["legs"][number]): string {
  return String(Math.max(0, Math.round(leg.landings || 0)));
}

function entryFromLeg(
  base: ReturnType<typeof buildFlightLevelFields>,

  meta: FlightRecordMeta,

  flightDateIso: string,

  leg: FlightRecordMeta["legs"][number],

  legIndex: number,

  legCount: number,
): AnacLogbookEntry {
  const toUtc = (local: string | undefined) =>
    local?.trim() ? localTimeToUtcHhMm(flightDateIso, local.trim()) : "—";
  return {
    ...base,
    departureUtc: leg.engineStart?.trim() ? toUtc(leg.engineStart) : base.departureUtc,
    takeoffUtc: leg.takeoff?.trim() ? toUtc(leg.takeoff) : base.takeoffUtc,
    landingUtc: leg.landing?.trim() ? toUtc(leg.landing) : base.landingUtc,
    engineCutoffUtc: leg.engineCut?.trim() ? toUtc(leg.engineCut) : base.engineCutoffUtc,

    legIndex,

    legCount,

    route: legRoute(leg),

    crewLines: buildCrewLines(meta, flightDateIso, leg),

    flightTime: displayDuration(leg.flightTime),

    dayTime: computeDayTime(leg.flightTime, leg.nightTime),

    nightTime: displayDuration(leg.nightTime),

    navTime: displayDuration(leg.navTime),

    serviceTime: displayDuration(leg.serviceTime),

    ifrHoursReal: ifrMinutesToDecimal(leg.ifrTime),

    ifrHoursCap: "0",

    fuelByLeg: legFuel(leg),

    landingsPartial: legLandings(leg),

    landingsTotal: "—",

    cyclesPartialTotal: "—",
  };
}

function emptyLegTimes(): Pick<
  AnacLogbookEntry,
  | "flightTime"
  | "dayTime"
  | "nightTime"
  | "navTime"
  | "serviceTime"
  | "ifrHoursReal"
  | "ifrHoursCap"
> {
  return {
    flightTime: "—",

    dayTime: "—",

    nightTime: "—",

    navTime: "—",

    serviceTime: "—",

    ifrHoursReal: "0",

    ifrHoursCap: "0",
  };
}

export function buildAnacLogbookEntries(
  params: BuildLogbookParams,
): AnacLogbookEntry[] {
  const { meta, flight } = params;

  const flightDateIso = flight.flight_date ?? meta.header.date ?? "";

  const base = buildFlightLevelFields(params, flightDateIso);

  const legs = meta.legs ?? [];

  if (legs.length === 0) {
    const route = flight.from_to?.trim() || "—";

    return [
      {
        ...base,

        legIndex: 0,

        legCount: 1,

        route,

        crewLines: buildCrewLines(meta, flightDateIso),

        fuelByLeg: "—",

        landingsPartial: flight.landings == null ? "0" : String(flight.landings),

        landingsTotal: "—",

        cyclesPartialTotal: "—",

        ...emptyLegTimes(),
      },
    ];
  }

  return legs.map((leg, legIndex) =>
    entryFromLeg(base, meta, flightDateIso, leg, legIndex, legs.length),
  );
}

/** Retorna a primeira linha (compatibilidade). */

export function buildAnacLogbookEntry(
  params: BuildLogbookParams,
): AnacLogbookEntry {
  return buildAnacLogbookEntries(params)[0];
}

function flightAsOfMsForLandingTotals(flight: SavedFlightListItem | SavedFlightFull): number {
  const date = flight.flight_date ?? flight.created_at;
  const time = flight.start_time ? `T${flight.start_time}` : "";
  const ms = new Date(`${date}${time}`).getTime();
  return Number.isFinite(ms) ? ms : new Date(flight.created_at).getTime();
}

function latestBaselineForLandingTotals(orders: MaintenanceWorkOrder[], aircraftId: string): MaintenanceWorkOrder | null {
  return orders
    .filter((order) => order.aircraft_id === aircraftId && order.work_order_type === "migration_baseline")
    .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime())[0] ?? null;
}

export function enrichLogbookLandingTotals(params: {
  entries: AnacLogbookEntry[];
  rows: Array<SavedFlightListItem | SavedFlightFull>;
  aircraft: Aircraft | null;
  workOrders: MaintenanceWorkOrder[];
}): AnacLogbookEntry[] {
  if (!params.aircraft) return params.entries;
  let baselineMs: number;
  let runningLandings: number;
  if (params.aircraft.logbook_landings != null) {
    baselineMs = params.aircraft.logbook_opening_date ? new Date(params.aircraft.logbook_opening_date).getTime() : Number.NEGATIVE_INFINITY;
    runningLandings = params.aircraft.logbook_landings;
  } else {
    const baseline = latestBaselineForLandingTotals(params.workOrders, params.aircraft.id);
    baselineMs = baseline ? new Date(baseline.opened_at).getTime() : Number.NEGATIVE_INFINITY;
    runningLandings = baseline?.aircraft_total_landings ?? 0;
  }

  const flightDateMsByFlight = new Map<string, number>();
  for (const row of params.rows) {
    flightDateMsByFlight.set(row.id, flightAsOfMsForLandingTotals(row));
  }
  const sorted = [...params.entries].sort((a, b) => {
    const aMs = flightDateMsByFlight.get(a.flightId) ?? 0;
    const bMs = flightDateMsByFlight.get(b.flightId) ?? 0;
    if (aMs !== bMs) return aMs - bMs;
    return a.legIndex - b.legIndex;
  });
  const totalsByKey = new Map<string, { partial: number; total: number }>();
  for (const entry of sorted) {
    const entryMs = flightDateMsByFlight.get(entry.flightId) ?? 0;
    const partial = Number(entry.landingsPartial) || 0;
    if (entryMs >= baselineMs) runningLandings += partial;
    totalsByKey.set(`${entry.flightId}:${entry.legIndex}`, { partial, total: runningLandings });
  }
  return params.entries.map((entry) => {
    const t = totalsByKey.get(`${entry.flightId}:${entry.legIndex}`);
    if (!t) return entry;
    return {
      ...entry,
      landingsPartial: String(t.partial),
      landingsTotal: String(t.total),
      cyclesPartialTotal: `${t.partial}/${t.total}`,
    };
  });
}

export const LOGBOOK_CSV_COLUMNS: Array<{
  key: keyof AnacLogbookEntry | "lastMaint" | "nextMaint" | "nextHours" | "rts";

  label: string;
}> = [
  { key: "seqNumber", label: "Seq." },

  { key: "flightDate", label: "Data" },

  { key: "aircraft", label: "Aeronave" },

  { key: "crewLines", label: "Tripulantes" },

  { key: "route", label: "Locais" },

  { key: "departureUtc", label: "Partida UTC" },

  { key: "takeoffUtc", label: "Decolagem UTC" },

  { key: "landingUtc", label: "Pouso UTC" },

  { key: "engineCutoffUtc", label: "Corte motor UTC" },

  { key: "flightTime", label: "Voo" },

  { key: "dayTime", label: "Diurno" },

  { key: "nightTime", label: "Noturno" },

  { key: "navTime", label: "Nav" },

  { key: "serviceTime", label: "Serviço" },

  { key: "ifrHoursReal", label: "IFR-R (h dec)" },

  { key: "ifrHoursCap", label: "IFR-C (h dec)" },

  { key: "fuelByLeg", label: "Combustível" },

  { key: "nature", label: "Natureza" },

  { key: "personsOnBoard", label: "PAX" },

  { key: "cargo", label: "Carga" },

  { key: "occurrences", label: "Ocorrências" },

  { key: "discrepancies", label: "Discrepâncias" },

  { key: "discrepancyDetectedBy", label: "Detectado por" },

  { key: "correctiveActions", label: "Ações corretivas" },

  { key: "lastMaint", label: "Última manutenção" },

  { key: "nextMaint", label: "Próxima manutenção" },

  { key: "nextHours", label: "Horas célula próx." },

  { key: "rts", label: "Resp. retorno serviço" },

  { key: "signatures", label: "Assinaturas" },
];

export type LogbookColumnKey = (typeof LOGBOOK_CSV_COLUMNS)[number]["key"];

export function logbookCellValue(
  entry: AnacLogbookEntry,
  key: LogbookColumnKey,
): string {
  switch (key) {
    case "seqNumber":
      return entry.seqNumber;

    case "flightDate":
      return entry.flightDate;

    case "aircraft":
      return entry.aircraft;

    case "crewLines":
      return entry.crewLines;

    case "route":
      return entry.route;

    case "departureUtc":
      return entry.departureUtc;

    case "takeoffUtc":
      return entry.takeoffUtc;

    case "landingUtc":
      return entry.landingUtc;

    case "engineCutoffUtc":
      return entry.engineCutoffUtc;

    case "flightTime":
      return entry.flightTime;

    case "dayTime":
      return entry.dayTime;

    case "nightTime":
      return entry.nightTime;

    case "navTime":
      return entry.navTime;

    case "serviceTime":
      return entry.serviceTime;

    case "ifrHoursReal":
      return entry.ifrHoursReal;

    case "ifrHoursCap":
      return entry.ifrHoursCap;

    case "fuelByLeg":
      return entry.fuelByLeg;

    case "nature":
      return entry.nature;

    case "personsOnBoard":
      return entry.personsOnBoard;

    case "cargo":
      return entry.cargo;

    case "occurrences":
      return entry.occurrences;

    case "discrepancies":
      return entry.discrepancies;

    case "discrepancyDetectedBy":
      return entry.discrepancyDetectedBy;

    case "correctiveActions":
      return entry.correctiveActions;

    case "lastMaint":
      return entry.maintenance.lastInterventionType ?? "—";

    case "nextMaint":
      return entry.maintenance.nextInterventionType ?? "—";

    case "nextHours":
      return entry.maintenance.nextInterventionDueHours != null
        ? String(entry.maintenance.nextInterventionDueHours)
        : "—";

    case "rts":
      return entry.maintenance.returnToServiceResponsible ?? "—";

    case "signatures":
      return [
        entry.signatures.student,
        entry.signatures.instructor,
        entry.signatures.operator,
      ].join(" | ");

    default:
      return "—";
  }
}

const UTC_COLUMN_KEYS = new Set<LogbookColumnKey>([
  "departureUtc",

  "takeoffUtc",

  "landingUtc",

  "engineCutoffUtc",
]);

const DURATION_COLUMN_KEYS = new Set<LogbookColumnKey>([
  "flightTime",

  "dayTime",

  "nightTime",

  "navTime",

  "serviceTime",
]);

const WIDE_COLUMN_KEYS = new Set<LogbookColumnKey>([
  "crewLines",

  "route",

  "cargo",

  "occurrences",

  "discrepancies",

  "correctiveActions",

  "lastMaint",

  "nextMaint",

  "signatures",
]);

export function isLogbookTimeColumn(key: LogbookColumnKey): boolean {
  return UTC_COLUMN_KEYS.has(key);
}

export function isLogbookDurationColumn(key: LogbookColumnKey): boolean {
  return DURATION_COLUMN_KEYS.has(key);
}

export function isLogbookWideColumn(key: LogbookColumnKey): boolean {
  return WIDE_COLUMN_KEYS.has(key);
}

function rowToCsvCells(entry: AnacLogbookEntry): string[] {
  return LOGBOOK_CSV_COLUMNS.map((col) => logbookCellValue(entry, col.key));
}

export function exportLogbookCsv(
  entries: AnacLogbookEntry[],
  filenamePrefix = "diario-bordo",
): void {
  downloadCsv(
    [LOGBOOK_CSV_COLUMNS.map((col) => col.label), ...entries.map(rowToCsvCells)],
    `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`,
  );
}

function pdfEscape(value: string): string {
  return value

    .replace(/&/g, "&amp;")

    .replace(/</g, "&lt;")

    .replace(/>/g, "&gt;")

    .replace(/"/g, "&quot;");
}

function pdfDate(value: string | null | undefined): string {
  if (!value) return "";
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? new Date(ms).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : value;
}

function dashEmpty(value: string): string {
  return value === "—" || value === "â€”" ? "" : value;
}

function zeroEmpty(value: string): string {
  const trimmed = dashEmpty(value).trim();
  return trimmed || "0";
}

function decimalHour(value: string): string {
  const trimmed = dashEmpty(value).trim();
  if (!trimmed) return "0";
  const match = trimmed.match(/^(\d{1,3}):(\d{2})$/);
  if (match) {
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      return ((hours * 60 + minutes) / 60).toFixed(1);
    }
  }
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) ? parsed.toFixed(1) : trimmed;
}

function crewRows(entry: AnacLogbookEntry): Array<{ canac: string; role: string; presentation: string }> {
  return entry.crewLines
    .split(";")
    .map((raw) => raw.trim())
    .filter((raw) => raw && raw !== "—" && raw !== "â€”")
    .map((raw) => {
      const parts = raw.split("/").map((part) => part.trim());
      const presentationMatch = raw.match(/apresenta(?:ç|c)[aã]o\s+([^;]+)/i);
      return {
        canac: parts[0] ?? "",
        role: parts[1] ?? "",
        presentation: presentationMatch?.[1]?.trim() ?? "0",
      };
    });
}

export function exportLogbookPdf(params: {
  entries: AnacLogbookEntry[];
  aircraft: Aircraft;
  model?: AircraftModel | null;
  openingSignature: LogbookOpeningSignature;
  signerProfile?: { fullName?: string | null; anacCode?: string | null } | null;
  discrepancies: FlightDiscrepancy[];
  currentMaintenance: MaintenanceAsOfFlight;
  workOrders: MaintenanceWorkOrder[];
  title?: string;
}): boolean {
  const { entries, aircraft, model, openingSignature, signerProfile, discrepancies, currentMaintenance, workOrders } = params;
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;

  const signedAt = new Date(openingSignature.signed_at);
  const year = Number.isFinite(signedAt.getTime()) ? signedAt.getUTCFullYear() : new Date().getUTCFullYear();
  const diaryNumber = openingSignature.snapshot.diaryNumber || aircraft.logbook_sequence_number || "NN";
  const diaryTitle = `DIÁRIO DE BORDO Nº ${pdfEscape(diaryNumber)}/${pdfEscape(aircraft.registration || "CC-MMM")}/${year}`;
  const signerHash = openingSignature.content_hash ? `Hash ${openingSignature.content_hash}` : "Hash não disponível";
  const openingSigner = `${openingSignature.signer_user_id} - ${signedAt.toLocaleString("pt-BR")} UTC - ${signerHash}`;
  const signatureLine = (value: string) => `<div class="signed">Assinado eletronicamente por:<br>${pdfEscape(value)}</div>`;
  const splitRoute = (entry: AnacLogbookEntry, index: number) => entry.route.split("-")[index]?.trim() ?? "";

  const flightPages = entries.map((entry) => {
    const crew = crewRows(entry);
    const presentationRows = crew.map((row, index) => `<tr><td>CANAC ${index + 1}: ${pdfEscape(row.canac)}</td><td>Horário de apresentação: ${pdfEscape(zeroEmpty(row.presentation))}</td><td colspan="2">Base contratual:</td></tr>`).join("");
    const flightCrewRows = crew.map((row, index) => `<tr><td>CANAC ${index + 1}: ${pdfEscape(row.canac)}</td><td colspan="3">Função: ${pdfEscape(row.role || "0")}</td></tr>`).join("");
    return `
<section class="page">
  <h1>MODELO DE APRESENTAÇÃO DOS REGISTROS</h1>
  <div class="box-title">${diaryTitle}<br>APRESENTAÇÃO DA TRIPULAÇÃO</div>
  <table class="grid"><tbody>
    <tr><td colspan="4">Data da Apresentação: ${pdfEscape(entry.flightDate)}</td></tr>
    ${presentationRows || `<tr><td>CANAC 1: 0</td><td>Horário de apresentação: 0</td><td colspan="2">Base contratual:</td></tr>`}
  </tbody></table>
  ${signatureLine(entry.signatures.instructor)}
  <div class="spacer"></div>
  <div class="box-title">${diaryTitle}<br>REGISTROS DE VOO</div>
  <table class="grid"><tbody>
    <tr><td colspan="4">Data do voo: ${pdfEscape(entry.flightDate)}</td></tr>
    <tr><td colspan="2">De: ${pdfEscape(splitRoute(entry, 0))}</td><td colspan="2">Para: ${pdfEscape(splitRoute(entry, 1))}</td></tr>
    <tr><td>Partida: ${pdfEscape(zeroEmpty(entry.departureUtc))}</td><td>Decolagem: ${pdfEscape(zeroEmpty(entry.takeoffUtc))}</td><td>Pouso: ${pdfEscape(zeroEmpty(entry.landingUtc))}</td><td>Corte: ${pdfEscape(zeroEmpty(entry.engineCutoffUtc))}</td></tr>
    <tr><td>Diurno: ${pdfEscape(decimalHour(entry.dayTime))}</td><td>Noturno: ${pdfEscape(decimalHour(entry.nightTime))}</td><td>IFR Real: ${pdfEscape(decimalHour(entry.ifrHoursReal))}</td><td>IFR Simulado: ${pdfEscape(decimalHour(entry.ifrHoursCap))}</td></tr>
    <tr><td colspan="2">Tempo voo total: ${pdfEscape(decimalHour(entry.flightTime))}</td><td colspan="2">Total de combustível na partida: ${pdfEscape(zeroEmpty(entry.fuelByLeg))}</td></tr>
    <tr><td colspan="2">Pessoas a bordo: ${pdfEscape(entry.personsOnBoard)}</td><td colspan="2">Peso da carga: ${pdfEscape(entry.cargo)}</td></tr>
    <tr><td>Ciclos parciais/totais: ${pdfEscape(zeroEmpty(entry.cyclesPartialTotal))}</td><td>Pousos parciais/totais: ${pdfEscape(zeroEmpty(entry.landingsPartial))}/${pdfEscape(zeroEmpty(entry.landingsTotal))}</td><td colspan="2">Natureza do voo: ${pdfEscape(entry.nature)}</td></tr>
  </tbody></table>
  <table class="grid occurrences"><tbody><tr><td>Ocorrências:<br>${pdfEscape(dashEmpty(entry.occurrences))}</td></tr></tbody></table>
  <table class="grid"><tbody>
    <tr><th colspan="4" class="left">Tripulação</th></tr>
    ${flightCrewRows || `<tr><td>CANAC 1: 0</td><td colspan="3">Função: 0</td></tr>`}
  </tbody></table>
  ${signatureLine([entry.signatures.student, entry.signatures.instructor, entry.signatures.operator].join(" | "))}
</section>`;
  }).join("");

  const workOrderById = new Map(workOrders.map((order) => [order.id, order]));
  const discrepancyRows = discrepancies.length === 0 ? "" : discrepancies.map((item) => {
    const order = item.linked_work_order_id ? workOrderById.get(item.linked_work_order_id) : null;
    return `<tr><td>${pdfEscape(pdfDate(item.flight_date))}</td><td>${pdfEscape(item.system ?? "")}</td><td>${pdfEscape(item.discrepancy_text)}</td><td>${pdfEscape(item.canac_reported ?? "")}</td><td>${pdfEscape(pdfDate(order?.released_at ?? order?.completed_at ?? null))}</td><td>${pdfEscape(item.corrective_action ?? order?.corrective_action ?? "")}</td><td>${pdfEscape(item.responsible_canac ?? order?.released_by_canac ?? order?.mechanic_canac ?? "")}</td><td>${pdfEscape(item.pic_canac ?? order?.released_by_canac ?? "")}</td></tr>`;
  }).join("");

  const technicalPage = `
<section class="page tech-page">
  <div class="box-title">${diaryTitle}<br>SITUAÇÃO TÉCNICA DA AERONAVE</div>
  <table class="grid"><tbody>
    <tr><td>Data do voo: ${pdfEscape(pdfDate(new Date().toISOString()))}</td><td colspan="2">Decolagem:</td></tr>
    <tr><td>Tipo da última intervenção de manutenção:<br>${pdfEscape(currentMaintenance.lastInterventionType ?? "")}</td><td>Tipo da próxima intervenção de manutenção:<br>${pdfEscape(currentMaintenance.nextInterventionType ?? "")}</td><td>Horas de célula para a próxima intervenção de manutenção:<br>${currentMaintenance.nextInterventionDueHours ?? ""}</td></tr>
  </tbody></table>
  <h2>DISCREPÂNCIAS</h2>
  <table class="grid discrepancy-table"><thead>
    <tr><th colspan="4">Registros da tripulação</th><th colspan="4">Aprovação de retorno ao serviço</th></tr>
    <tr><th>Data Reg.</th><th>Sist.</th><th>Discrepância</th><th>CANAC Reg.</th><th>Data da ação corretiva</th><th>Ação corretiva</th><th>CANAC Resp.</th><th>CANAC PIC</th></tr>
  </thead><tbody>${discrepancyRows}</tbody></table>
  ${signatureLine(currentMaintenance.returnToServiceResponsible ?? "")}
</section>`;

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>${pdfEscape(params.title ?? "Diário de Bordo")}</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  body{margin:0;color:#000;background:#fff;font-family:"Times New Roman",Times,serif;font-size:16px;line-height:1.15}
  .page{box-sizing:border-box;width:210mm;min-height:297mm;padding:10mm 16mm 12mm 16mm;page-break-after:always}
  .opening h1,.page h1{font-size:16px;text-align:center;margin:0 0 34px;font-weight:700;line-height:1.1}
  .opening p{margin:0 0 18px;text-align:justify}
  .box-title{border:1px solid #aaa;text-align:center;font-weight:700;padding:2px;margin:0 0 18px;line-height:1.1}
  .grid{width:100%;border-collapse:collapse;margin:0 0 18px;table-layout:fixed}
  .grid th,.grid td{border:1px solid #aaa;padding:1px 3px;vertical-align:top;font-weight:400}
  .grid th{font-weight:700;text-align:center}.grid .left{text-align:left}
  .signed{text-align:center;margin-top:-12px;margin-bottom:48px;overflow-wrap:anywhere;word-break:break-word}.spacer{height:6mm}.occurrences td{height:22mm}
  .tech-page{padding-top:34mm}.tech-page h2{text-align:center;font-size:16px;margin:20px 0 18px}.tech-page .grid tr:nth-child(2) td{height:28mm}
  .discrepancy-table{font-size:15px}.discrepancy-table th,.discrepancy-table td{text-align:left}.discrepancy-table tbody td{height:16px}
</style></head><body>
<section class="page opening">
  <h1>${diaryTitle}<br>TERMO DE ABERTURA</h1>
  <p>Aos <em>${String(signedAt.getUTCDate()).padStart(2, "0")}</em> dias do mês de <em>${signedAt.toLocaleString("pt-BR", { month: "long", timeZone: "UTC" })}</em> do ano de <em>${year}</em>, lavra-se o presente Termo de Abertura deste Diário de Bordo que servirá para a escrituração de todos os registros de voo e ocorrências na aeronave abaixo identificada, cujo objetivo visa ao cumprimento dos requisitos de registros conforme aplicáveis. O formato de horário utilizado neste diário de bordo é: <em>UTC</em>.</p>
  <p>Marcas: <strong>${pdfEscape(aircraft.registration)}</strong><br>Fabricante: <em>${pdfEscape(openingSignature.snapshot.manufacturer || model?.manufacturer || "")}</em><br>Modelo: <em>${pdfEscape(openingSignature.snapshot.model || model?.name || "")}</em><br>N/S: <em>${pdfEscape(openingSignature.snapshot.serialNumber || aircraft.serial_number || "")}</em></p>
  <p>Horas Totais: <em>${openingSignature.snapshot.totalHours ?? aircraft.logbook_ttaf ?? ""}</em><br>Ciclos Totais: <em>${openingSignature.snapshot.totalCycles ?? aircraft.logbook_cycles ?? ""}</em><br>Nº de Pousos: <em>${openingSignature.snapshot.totalLandings ?? aircraft.logbook_landings ?? ""}</em></p>
  <p>Proprietário: <em>${pdfEscape(openingSignature.snapshot.ownerName || aircraft.owner_name || "")}</em><br>Operador: <em>${pdfEscape(openingSignature.snapshot.operatorName || aircraft.operator_name || "")}</em></p>
  <p>Observações:</p>
  <p>Responsável: <em>${pdfEscape(signerProfile?.fullName || openingSignature.signer_user_id)}</em><br>Identificação: <em>CANAC ${pdfEscape(signerProfile?.anacCode || "—")}</em></p>
  <p>Assinatura digital do responsável pelo Termo de Abertura<br>${pdfEscape(openingSigner)}</p>
</section>
${flightPages}
${technicalPage}
<script>window.onload=()=>setTimeout(()=>window.print(),250)</script>
</body></html>`);
  printWindow.document.close();
  return true;
}
