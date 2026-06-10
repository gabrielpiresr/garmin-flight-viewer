import { Query } from "appwrite";
import { BUCKET_ID, databases, ID, isAppwriteConfigured, Permission, Role, DEFAULT_SCHOOL_ID, storage } from "./appwrite";
import { ADMIN_USERS_FUNCTION_ID, functions } from "./appwrite";

import { decodeFlightRecord, decodeFlightRecordMeta, encodeFlightRecord, type FlightRecordMeta } from "./flightRecordCodec";
import { flightBlockMinutesFromMeta } from "./flightHours";
import type { FlightWeightBalanceMeta } from "./weightBalance";
import { clearFlightTelemetryMetrics, replaceFlightTelemetryMetrics } from "./flightTelemetryMetricsDb";
import { clearFlightTelemetryAlerts, replaceFlightTelemetryAlertsForFlight } from "./flightTelemetryAlertsDb";
import type { FlightTelemetryMetricsBundle } from "./flightTelemetryMetrics";
import type { ParseResult } from "./parseGarminCsv";
import type { UserRole } from "./rbac";
import type { TrainingSelectionSnapshot } from "../types/trainingTrack";
import { createAdminAuditEvent } from "./adminUsersDb";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;
const COL_ID = import.meta.env.VITE_APPWRITE_COLLECTION_ID as string;

export type FlightStatus = "Pendente" | "Confirmado" | "Cancelado" | "Realizado" | "Previsto" | "Não confirmado";

export const FLIGHT_STATUS_OPTIONS: FlightStatus[] = ["Pendente", "Confirmado", "Cancelado", "Realizado", "Não confirmado"];

export function normalizeFlightStatus(value: unknown): FlightStatus {
  if (value === "Previsto") return "Confirmado";
  return FLIGHT_STATUS_OPTIONS.includes(value as FlightStatus) ? (value as FlightStatus) : "Confirmado";
}

export type SavedFlightListItem = {
  id: string;
  source_filename: string;
  created_at: string;
  aircraft_ident: string | null;
  duration_sec: number | null;
  flight_date: string | null;
  start_time: string | null;
  student_user_id: string | null;
  instructor_user_id: string | null;
  training_track_id: string | null;
  training_stage_id: string | null;
  training_mission_id: string | null;
  training_snapshot_json: string | null;
  from_to: string | null;
  landings: number | null;
  block_time_minutes: number | null;
  total_flight_minutes: number | null;
  total_miles: number | null;
  telemetry_present: boolean | null;
  instructor_suggestion_md: string | null;
  student_suggestion_md: string | null;
  instructor_suggestion_present: boolean | null;
  student_suggestion_present: boolean | null;
  weight_balance_complete: boolean | null;
  is_night: boolean | null;
  training_mission_ids_json: string | null;
  schedule_week_start: string | null;
  schedule_demand_id: string | null;
  flight_seq_number: number | null;
  instructor_signed: boolean | null;
  student_signed: boolean | null;
  admin_operator_signed: boolean | null;
  instructor_signed_at: string | null;
  flight_status: FlightStatus;
  saga_flight_id?: string | null;
  saga_schedule_id?: string | null;
  saga_schedule_synced_at?: string | null;
  saga_schedule_sync_status?: string | null;
};

export type SavedFlightFull = SavedFlightListItem & { csv_text: string };
export type SavedFlightsPage = {
  data: SavedFlightListItem[] | null;
  error: Error | null;
  total: number;
  nextCursor: string | null;
};

const LEGACY_FLIGHT_LIST_SELECT = [
  "$id",
  "$createdAt",
  "source_filename",
  "aircraft_ident",
  "duration_sec",
  "flight_date",
  "start_time",
  "student_user_id",
  "instructor_user_id",
  "user_id",
  "training_track_id",
  "training_stage_id",
  "training_mission_id",
  "training_snapshot_json",
];

const MATERIALIZED_FLIGHT_LIST_FIELDS = [
  "from_to",
  "landings",
  "block_time_minutes",
  "total_flight_minutes",
  "total_miles",
  "telemetry_present",
  "instructor_suggestion_md",
  "student_suggestion_md",
  "instructor_suggestion_present",
  "student_suggestion_present",
  "weight_balance_complete",
  "is_night",
  "training_mission_ids_json",
];

const SCHEDULE_FLIGHT_LIST_FIELDS = ["schedule_week_start", "schedule_demand_id"];
const SIGNATURE_FLIGHT_LIST_FIELDS = ["instructor_signed", "student_signed", "admin_operator_signed", "instructor_signed_at"];
const STATUS_FLIGHT_LIST_FIELDS = ["flight_status"];
const SAGA_FLIGHT_LIST_FIELDS = ["saga_flight_id"];
const SAGA_SCHEDULE_LIST_FIELDS = ["saga_schedule_id", "saga_schedule_synced_at", "saga_schedule_sync_status"];

const FLIGHT_LIST_SELECT = [...LEGACY_FLIGHT_LIST_SELECT, ...MATERIALIZED_FLIGHT_LIST_FIELDS];

const FLIGHT_LIST_SELECT_WITH_SCHEDULE = [
  ...FLIGHT_LIST_SELECT,
  ...SCHEDULE_FLIGHT_LIST_FIELDS,
  ...SIGNATURE_FLIGHT_LIST_FIELDS,
  ...STATUS_FLIGHT_LIST_FIELDS,
  ...SAGA_FLIGHT_LIST_FIELDS,
  ...SAGA_SCHEDULE_LIST_FIELDS,
];

function isSchemaAttributeError(error: unknown): boolean {
  const message = ((error as { message?: string })?.message ?? String(error)).toLowerCase();
  return (
    message.includes("unknown attribute") ||
    message.includes("attribute not found") ||
    message.includes("invalid document structure")
  );
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function toSavedFlightListItem(d: { [key: string]: unknown; $id: string; $createdAt: string }): SavedFlightListItem {
  return {
    id: d.$id,
    source_filename: d.source_filename as string,
    created_at: d.$createdAt,
    aircraft_ident: (d.aircraft_ident as string | null | undefined) ?? null,
    duration_sec: (d.duration_sec as number | null | undefined) ?? null,
    flight_date: (d.flight_date as string | null | undefined) ?? null,
    start_time: (d.start_time as string | null | undefined) ?? null,
    student_user_id: (d.student_user_id as string | null | undefined) ?? (d.user_id as string | null | undefined) ?? null,
    instructor_user_id: (d.instructor_user_id as string | null | undefined) ?? null,
    training_track_id: (d.training_track_id as string | null | undefined) ?? null,
    training_stage_id: (d.training_stage_id as string | null | undefined) ?? null,
    training_mission_id: (d.training_mission_id as string | null | undefined) ?? null,
    training_snapshot_json: (d.training_snapshot_json as string | null | undefined) ?? null,
    from_to: (d.from_to as string | null | undefined) ?? null,
    landings: readNumber(d.landings),
    block_time_minutes: readNumber(d.block_time_minutes),
    total_flight_minutes: readNumber(d.total_flight_minutes),
    total_miles: readNumber(d.total_miles),
    telemetry_present: readBoolean(d.telemetry_present),
    instructor_suggestion_md: (d.instructor_suggestion_md as string | null | undefined) ?? null,
    student_suggestion_md: (d.student_suggestion_md as string | null | undefined) ?? null,
    instructor_suggestion_present: readBoolean(d.instructor_suggestion_present),
    student_suggestion_present: readBoolean(d.student_suggestion_present),
    weight_balance_complete: readBoolean(d.weight_balance_complete),
    is_night: readBoolean(d.is_night),
    training_mission_ids_json: (d.training_mission_ids_json as string | null | undefined) ?? null,
    schedule_week_start: (d.schedule_week_start as string | null | undefined) ?? null,
    schedule_demand_id: (d.schedule_demand_id as string | null | undefined) ?? null,
    flight_seq_number: readNumber(d.flight_seq_number),
    instructor_signed: readBoolean(d.instructor_signed),
    student_signed: readBoolean(d.student_signed),
    admin_operator_signed: readBoolean(d.admin_operator_signed),
    instructor_signed_at: (d.instructor_signed_at as string | null | undefined) ?? null,
    flight_status: normalizeFlightStatus(d.flight_status),
    saga_flight_id: (d.saga_flight_id as string | null | undefined) ?? null,
    saga_schedule_id: (d.saga_schedule_id as string | null | undefined) ?? null,
    saga_schedule_synced_at: (d.saga_schedule_synced_at as string | null | undefined) ?? null,
    saga_schedule_sync_status: (d.saga_schedule_sync_status as string | null | undefined) ?? null,
  };
}

function weekStartFromFlightDate(flightDate: string | null | undefined): string | null {
  const iso = String(flightDate ?? "").trim().slice(0, 10);
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function weekEndFromWeekStart(weekStart: string): string {
  const start = new Date(`${weekStart}T12:00:00`);
  start.setDate(start.getDate() + 6);
  return start.toISOString().slice(0, 10);
}

function getScheduleDocumentFields(csvText: string): {
  schedule_week_start: string | null;
  schedule_demand_id: string | null;
} {
  const meta = decodeFlightRecord(csvText).meta;
  const flightDate = meta?.header?.date ?? null;
  const weekStart = meta?.schedule?.weekStart ?? weekStartFromFlightDate(flightDate);
  if (!meta?.schedule?.demandId) {
    return { schedule_week_start: weekStart, schedule_demand_id: null };
  }
  return {
    schedule_week_start: weekStart,
    schedule_demand_id: meta.schedule.demandId,
  };
}

function parseDurationToMinutes(value: string): number {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const hhmm = raw.match(/^(\d{1,2}):(\d{1,2})$/);
  if (hhmm) return Number(hhmm[1] || "0") * 60 + Number(hhmm[2] || "0");
  const asDecimal = Number(raw.replace(",", "."));
  return Number.isFinite(asDecimal) && asDecimal > 0 ? Math.round(asDecimal * 60) : 0;
}

function parseMiles(value: string): number {
  const normalized = String(value || "").replace(/[^\d.,-]/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function firstLegEngineStart(meta: FlightRecordMeta | null | undefined): string | null {
  const value = meta?.legs.find((leg) => leg.engineStart?.trim())?.engineStart?.trim();
  return value || null;
}

function flightMissionIdsFromMeta(csvText: string, fallbackMissionId?: string | null): string[] {
  const meta = decodeFlightRecord(csvText).meta;
  return Array.from(
    new Set([
      ...(meta?.training?.missionIds ?? []),
      meta?.training?.missionId ?? "",
      fallbackMissionId ?? "",
    ].filter(Boolean)),
  );
}

function isWeightBalanceComplete(csvText: string): boolean {
  const weightBalance = decodeFlightRecord(csvText).meta?.weightBalance;
  return Boolean(
    weightBalance &&
      weightBalance.inputs.occupantsWeightKg !== null &&
      weightBalance.inputs.baggageWeightKg !== null &&
      weightBalance.inputs.rampFuel.value !== null &&
      weightBalance.inputs.taxiFuel.value !== null &&
      weightBalance.inputs.tripFuel.value !== null &&
      weightBalance.results.isComplete,
  );
}

function buildFlightListMaterializedFields(csvText: string, fallbackMissionId?: string | null): Record<string, unknown> {
  const decoded = decodeFlightRecord(csvText);
  const meta = decoded.meta;
  const missionIds = flightMissionIdsFromMeta(csvText, fallbackMissionId);
  if (!meta) {
    return {
      from_to: null,
      landings: null,
      block_time_minutes: null,
      total_flight_minutes: null,
      total_miles: null,
      telemetry_present: decoded.telemetryCsv.trim().length > 0,
      instructor_suggestion_md: null,
      student_suggestion_md: null,
      instructor_suggestion_present: false,
      student_suggestion_present: false,
      weight_balance_complete: false,
      is_night: false,
      training_mission_ids_json: missionIds.length > 0 ? JSON.stringify(missionIds) : null,
    };
  }

  const airports: string[] = [];
  for (const leg of meta.legs) {
    const dep = (leg.dep ?? "").trim().toUpperCase();
    const arr = (leg.arr ?? "").trim().toUpperCase();
    if (dep && airports[airports.length - 1] !== dep) airports.push(dep);
    if (arr && airports[airports.length - 1] !== arr) airports.push(arr);
  }
  const legsSumMinutes = meta.legs.reduce((acc, leg) => acc + parseDurationToMinutes(leg.flightTime), 0);
  const blockTimeMinutes = flightBlockMinutesFromMeta(meta);
  const totalFlightMinutes = legsSumMinutes; // kept for legacy; block_time_minutes is the authoritative value
  const landings = meta.legs.reduce((acc, leg) => acc + Math.max(0, Math.round(leg.landings || 0)), 0);
  const totalMiles = meta.legs.reduce((acc, leg) => acc + parseMiles(leg.distance), 0);
  const instructorSuggestion = meta.preFlight?.instructorSuggestionMd?.trim() ?? "";
  const studentSuggestion = meta.preFlight?.studentSuggestionMd?.trim() ?? "";

  return {
    from_to: airports.length > 0 ? airports.join(" -> ") : null,
    landings,
    block_time_minutes: blockTimeMinutes ?? null,
    total_flight_minutes: totalFlightMinutes,
    total_miles: Number(totalMiles.toFixed(1)),
    telemetry_present: decoded.telemetryCsv.trim().length > 0,
    instructor_suggestion_md: instructorSuggestion || null,
    student_suggestion_md: studentSuggestion || null,
    instructor_suggestion_present: instructorSuggestion.length > 0,
    student_suggestion_present: studentSuggestion.length > 0,
    weight_balance_complete: isWeightBalanceComplete(csvText),
    is_night: meta.header.isNight ?? false,
    training_mission_ids_json: missionIds.length > 0 ? JSON.stringify(missionIds) : null,
  };
}

function getFlightScheduleFields(csvText: string): { flight_date: string | null; start_time: string | null } {
  const meta = decodeFlightRecord(csvText).meta;
  return {
    flight_date: meta?.header.date || null,
    start_time: firstLegEngineStart(meta) || meta?.header.departureTimeUtc?.trim() || meta?.header.startTime?.trim() || null,
  };
}

function buildInternalFlightName(payload: { csv_text: string; aircraft_ident?: string | null; source_filename: string }): string {
  const scheduleFields = getFlightScheduleFields(payload.csv_text);
  return [payload.aircraft_ident?.trim(), scheduleFields.flight_date, scheduleFields.start_time]
    .filter(Boolean)
    .join(" ")
    .trim() || payload.source_filename || "Voo";
}

function toStorageCsvFileName(sourceFilename: string): string {
  const trimmed = sourceFilename.trim() || "telemetria.csv";
  if (/\.csv$/i.test(trimmed)) return trimmed;
  const safeBase = trimmed.replace(/\.[^.\\/]+$/, "").trim() || "telemetria";
  return `${safeBase}.csv`;
}

async function assertFlightNotLocked(id: string): Promise<{ locked: boolean; error: Error | null }> {
  const doc = await databases!.getDocument(DB_ID, COL_ID, id, [Query.select(["instructor_signed"])]);
  if (doc.instructor_signed) {
    return { locked: true, error: new Error("Este voo está bloqueado pois foi assinado pelo instrutor.") };
  }
  return { locked: false, error: null };
}

function buildActorOwnedPermissions(actorUserId: string) {
  return [
    Permission.read(Role.user(actorUserId)),
    Permission.update(Role.user(actorUserId)),
    Permission.delete(Role.user(actorUserId)),
  ];
}

/**
 * Permissões que a sessão do browser pode gravar em documentos/arquivos.
 * Cada papel só pode definir user próprio + seu label (Appwrite limita no cliente).
 */
function canSetClientSidePermission(permission: string, actorUserId: string, actorRole: UserRole): boolean {
  if (permission.includes('("any")')) return true;
  if (permission.includes('("users")') || permission.includes('("users/unverified")')) return true;
  if (permission.includes(`("user:${actorUserId}")`)) return true;
  if (permission.includes(`("user:${actorUserId}/unverified")`)) return true;

  if (actorRole === "admin") {
    return permission.includes('("label:admin")');
  }
  if (actorRole === "instrutor") {
    return permission.includes('("label:instrutor")');
  }
  if (actorRole === "aluno") {
    return permission.includes('("label:aluno")');
  }

  return false;
}

/** Client sessions cannot assign permissions for other users (e.g. the linked student). */
function filterClientSidePermissions(
  permissions: string[],
  actorUserId: string,
  actorRole: UserRole,
): string[] {
  return Array.from(
    new Set(permissions.filter((permission) => canSetClientSidePermission(permission, actorUserId, actorRole))),
  );
}

function resolveClientFlightPermissions(
  actorUserId: string,
  actorRole: UserRole,
  studentUserId?: string | null,
  instructorUserId?: string | null,
  existing?: string[],
): string[] {
  const full = existing?.length
    ? mergeFlightDocumentPermissions(existing, actorUserId, actorRole, studentUserId, instructorUserId)
    : buildFlightDocumentPermissions(actorUserId, actorRole, studentUserId, instructorUserId);
  return filterClientSidePermissions(full, actorUserId, actorRole);
}

/**
 * Permissões graváveis no bucket flights-csv pelo browser (file security do bucket).
 * O bucket aceita apenas: any, users, user da sessão e label:admin — não label:instrutor/aluno.
 */
function resolveStorageCsvPermissions(actorUserId: string, actorRole: UserRole): string[] {
  const perms = [
    ...buildActorOwnedPermissions(actorUserId),
    Permission.read(Role.users()),
  ];
  if (actorRole === "admin") {
    perms.push(
      Permission.read(Role.label("admin")),
      Permission.update(Role.label("admin")),
      Permission.delete(Role.label("admin")),
    );
  }
  return filterClientSidePermissions(perms, actorUserId, actorRole);
}

/** ACL gravável pelo browser; leitura compartilhada via Role.users (document security exige doc + coleção). */
function buildFlightDocumentPermissions(
  actorUserId: string,
  actorRole: UserRole,
  _studentUserId?: string | null,
  _instructorUserId?: string | null,
) {
  const permissions = buildActorOwnedPermissions(actorUserId);
  permissions.push(Permission.read(Role.users()));

  if (actorRole === "admin") {
    permissions.push(Permission.read(Role.label("admin")));
    permissions.push(Permission.update(Role.label("admin")));
    permissions.push(Permission.delete(Role.label("admin")));
    permissions.push(Permission.read(Role.label("instrutor")));
    permissions.push(Permission.update(Role.label("instrutor")));
    permissions.push(Permission.read(Role.label("aluno")));
  } else if (actorRole === "instrutor") {
    permissions.push(Permission.read(Role.label("instrutor")));
    permissions.push(Permission.update(Role.label("instrutor")));
  } else if (actorRole === "aluno") {
    permissions.push(Permission.read(Role.label("aluno")));
  }

  return Array.from(new Set(permissions));
}

function mergeFlightDocumentPermissions(
  existing: string[],
  actorUserId: string,
  actorRole: UserRole,
  studentUserId?: string | null,
  instructorUserId?: string | null,
) {
  const allowedExisting = existing.filter((permission) =>
    canSetClientSidePermission(permission, actorUserId, actorRole),
  );
  return Array.from(
    new Set([
      ...allowedExisting,
      ...buildFlightDocumentPermissions(actorUserId, actorRole, studentUserId, instructorUserId),
    ]),
  );
}

async function createFlightDocumentWithMaterializedFallback(params: {
  id: string;
  basePayload: Record<string, unknown>;
  csvText: string;
  trainingMissionId?: string | null;
  permissions: string[];
}) {
  const payload = {
    ...params.basePayload,
    ...buildFlightListMaterializedFields(params.csvText, params.trainingMissionId),
    ...getScheduleDocumentFields(params.csvText),
  };
  try {
    return await databases!.createDocument(DB_ID, COL_ID, params.id, payload, params.permissions);
  } catch (e) {
    if (!isSchemaAttributeError(e)) throw e;
    return databases!.createDocument(DB_ID, COL_ID, params.id, params.basePayload, params.permissions);
  }
}

async function updateFlightDocumentWithMaterializedFallback(params: {
  id: string;
  basePayload: Record<string, unknown>;
  csvText: string;
  trainingMissionId?: string | null;
  permissions?: string[];
}) {
  const payload = {
    ...params.basePayload,
    ...buildFlightListMaterializedFields(params.csvText, params.trainingMissionId),
    ...getScheduleDocumentFields(params.csvText),
  };
  try {
    if (params.permissions !== undefined) {
      await databases!.updateDocument(DB_ID, COL_ID, params.id, payload, params.permissions);
    } else {
      await databases!.updateDocument(DB_ID, COL_ID, params.id, payload);
    }
  } catch (e) {
    if (!isSchemaAttributeError(e)) throw e;
    if (params.permissions !== undefined) {
      await databases!.updateDocument(DB_ID, COL_ID, params.id, params.basePayload, params.permissions);
    } else {
      await databases!.updateDocument(DB_ID, COL_ID, params.id, params.basePayload);
    }
  }
}

async function listFlightsBySourceFilenamePrefix(prefix: string): Promise<SavedFlightListItem[]> {
  if (!isAppwriteConfigured || !databases) return [];

  const pageSize = 100;
  const collected: SavedFlightListItem[] = [];
  let cursor: string | undefined;
  const selectFields = [FLIGHT_LIST_SELECT_WITH_SCHEDULE, FLIGHT_LIST_SELECT, LEGACY_FLIGHT_LIST_SELECT];

  for (const select of selectFields) {
    collected.length = 0;
    cursor = undefined;
    try {
      while (true) {
        const queries = [
          Query.select(select),
          Query.startsWith("source_filename", prefix),
          Query.orderAsc("$id"),
          Query.limit(pageSize),
        ];
        if (cursor) queries.push(Query.cursorAfter(cursor));

        const res = await databases.listDocuments(DB_ID, COL_ID, queries);
        collected.push(...res.documents.map(toSavedFlightListItem));
        if (res.documents.length < pageSize) break;
        cursor = res.documents[res.documents.length - 1]?.$id;
        if (!cursor) break;
      }
      return collected;
    } catch (e) {
      if (!isSchemaAttributeError(e)) throw e;
    }
  }

  return [];
}

async function listFlightsInWeekByDate(weekStart: string): Promise<SavedFlightListItem[]> {
  if (!isAppwriteConfigured || !databases || !DB_ID || !COL_ID) return [];

  const weekEnd = weekEndFromWeekStart(weekStart);
  const pageSize = 100;
  const collected: SavedFlightListItem[] = [];
  let cursor: string | undefined;
  const selectAttempts = [FLIGHT_LIST_SELECT_WITH_SCHEDULE, FLIGHT_LIST_SELECT, LEGACY_FLIGHT_LIST_SELECT];

  for (const select of selectAttempts) {
    collected.length = 0;
    cursor = undefined;
    try {
      while (true) {
        const queries = [
          Query.select(select),
          Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
          Query.greaterThanEqual("flight_date", [weekStart]),
          Query.lessThanEqual("flight_date", [weekEnd]),
          Query.orderAsc("flight_date"),
          Query.orderAsc("start_time"),
          Query.limit(pageSize),
        ];
        if (cursor) queries.push(Query.cursorAfter(cursor));

        const res = await databases.listDocuments(DB_ID, COL_ID, queries);
        collected.push(...res.documents.map(toSavedFlightListItem));
        if (res.documents.length < pageSize) break;
        cursor = res.documents[res.documents.length - 1]?.$id;
        if (!cursor) break;
      }
      return collected;
    } catch (e) {
      if (!isSchemaAttributeError(e)) throw e;
    }
  }

  return [];
}

async function listFlightsByScheduleWeekStart(weekStart: string): Promise<SavedFlightListItem[]> {
  if (!isAppwriteConfigured || !databases || !DB_ID || !COL_ID) return [];

  try {
    const res = await databases.listDocuments(DB_ID, COL_ID, [
      Query.select(FLIGHT_LIST_SELECT_WITH_SCHEDULE),
      Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
      Query.equal("schedule_week_start", [weekStart]),
      Query.orderAsc("flight_date"),
      Query.orderAsc("start_time"),
      Query.limit(500),
    ]);
    return res.documents.map(toSavedFlightListItem);
  } catch (e) {
    if (isSchemaAttributeError(e)) return [];
    throw e;
  }
}

/** Voos da semana: por data, schedule_week_start e prefixos legados da escala. */
export async function listScheduledFlightsForWeek(weekStart: string): Promise<{
  data: SavedFlightListItem[];
  error: Error | null;
}> {
  if (!isAppwriteConfigured || !databases) {
    return { data: [], error: new Error("Appwrite não configurado") };
  }

  try {
    const [byDate, byScheduleWeek, autoRows, manualRows] = await Promise.all([
      listFlightsInWeekByDate(weekStart),
      listFlightsByScheduleWeekStart(weekStart),
      listFlightsBySourceFilenamePrefix(`auto-scale-${weekStart}`),
      listFlightsBySourceFilenamePrefix(`manual-scale-${weekStart}`),
    ]);
    const byId = new Map<string, SavedFlightListItem>();
    for (const row of [...byDate, ...byScheduleWeek, ...autoRows, ...manualRows]) {
      byId.set(row.id, row);
    }
    return { data: [...byId.values()], error: null };
  } catch (e) {
    return { data: [], error: e as Error };
  }
}

/** Retorna true se o aluno tem ao menos 1 voo na escala (qualquer status). */
export async function hasStudentScheduledFlights(studentUserId: string): Promise<boolean> {
  if (!isAppwriteConfigured || !databases) return false;
  try {
    const res = await databases.listDocuments(DB_ID, COL_ID, [
      Query.equal("student_user_id", [studentUserId]),
      Query.limit(1),
    ]);
    return res.total > 0;
  } catch {
    return false;
  }
}

/** Retorna true se o aluno tem ao menos 1 voo com status "Realizado". */
export async function hasStudentRealizedFlights(studentUserId: string): Promise<boolean> {
  if (!isAppwriteConfigured || !databases) return false;
  try {
    const res = await databases.listDocuments(DB_ID, COL_ID, [
      Query.equal("student_user_id", [studentUserId]),
      Query.equal("flight_status", ["Realizado"]),
      Query.limit(1),
    ]);
    return res.total > 0;
  } catch {
    return false;
  }
}

export async function listSavedFlights(
  viewer: { userId: string; role: UserRole },
  options: { limit?: number; cursor?: string | null } = {},
): Promise<SavedFlightsPage> {
  const limit = Math.min(100, Math.max(1, Math.round(options.limit ?? 50)));
  const roleQueries: string[] = [];
  if (viewer.role === "aluno") {
    roleQueries.push(Query.equal("student_user_id", [viewer.userId]));
  } else if (viewer.role === "instrutor") {
    roleQueries.push(Query.equal("instructor_user_id", [viewer.userId]));
  }
  const toPage = (res: { documents: Array<{ [key: string]: unknown; $id: string; $createdAt: string }>; total: number }): SavedFlightsPage => {
    const data = res.documents.map(toSavedFlightListItem);
    // #region agent log
    fetch('http://127.0.0.1:7507/ingest/74fbafb9-127e-4adf-aee6-0b36f081c2f1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8edc56'},body:JSON.stringify({sessionId:'8edc56',runId:'flight-list-debug',hypothesisId:'H6',location:'flightsDb.ts:listSavedFlights',message:'listSavedFlights page loaded',data:{viewerUserId:viewer.userId,viewerRole:viewer.role,total:res.total,pageCount:data.length,cursor:options.cursor||null,ids:data.map((item)=>item.id).slice(0,80)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return {
      data,
      error: null,
      total: res.total,
      nextCursor: res.documents.length === limit ? res.documents[res.documents.length - 1]?.$id ?? null : null,
    };
  };
  if (!isAppwriteConfigured || !databases) {
    return { data: null, error: new Error("Appwrite nao configurado"), total: 0, nextCursor: null };
  }
  try {
    const queries = [
      Query.select(FLIGHT_LIST_SELECT_WITH_SCHEDULE),
      Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
      ...roleQueries,
      Query.orderDesc("flight_date"),
      Query.orderDesc("start_time"),
      Query.limit(limit),
    ];
    if (options.cursor) queries.push(Query.cursorAfter(options.cursor));

    const res = await databases.listDocuments(DB_ID, COL_ID, queries);
    return toPage(res);
  } catch (e) {
    if (!isSchemaAttributeError(e)) return { data: null, error: e as Error, total: 0, nextCursor: null };
    try {
      const queries = [
        Query.select(FLIGHT_LIST_SELECT),
        Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
        ...roleQueries,
        Query.orderDesc("flight_date"),
        Query.orderDesc("start_time"),
        Query.limit(limit),
      ];
      if (options.cursor) queries.push(Query.cursorAfter(options.cursor));
      const res = await databases.listDocuments(DB_ID, COL_ID, queries);
      return toPage(res);
    } catch (fallbackError) {
      if (!isSchemaAttributeError(fallbackError)) {
        return { data: null, error: fallbackError as Error, total: 0, nextCursor: null };
      }
      try {
        const queries = [
          Query.select(LEGACY_FLIGHT_LIST_SELECT),
          Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
          ...roleQueries,
          Query.orderDesc("$createdAt"),
          Query.limit(limit),
        ];
        if (options.cursor) queries.push(Query.cursorAfter(options.cursor));
        const res = await databases.listDocuments(DB_ID, COL_ID, queries);
        return toPage(res);
      } catch (legacyError) {
        return { data: null, error: legacyError as Error, total: 0, nextCursor: null };
      }
    }
  }
}

export async function listAllSavedFlights(
  viewer: { userId: string; role: UserRole },
  options: { pageSize?: number; maxItems?: number } = {},
): Promise<{ data: SavedFlightListItem[] | null; error: Error | null }> {
  const pageSize = Math.min(100, Math.max(1, Math.round(options.pageSize ?? 100)));
  const maxItems = Math.max(pageSize, Math.round(options.maxItems ?? 2000));
  const rows: SavedFlightListItem[] = [];
  let cursor: string | null = null;

  while (rows.length < maxItems) {
    const page = await listSavedFlights(viewer, { limit: pageSize, cursor });
    if (page.error) return { data: null, error: page.error };
    rows.push(...(page.data ?? []));
    if (!page.nextCursor || (page.data?.length ?? 0) === 0) break;
    cursor = page.nextCursor;
  }

  return { data: rows, error: null };
}

/** Voos vinculados a trilhas de formação — usado pela Jornada em vez de carregar todo o histórico. */
export async function listStudentTrainingFlights(
  viewer: { userId: string; role: UserRole },
  trackIds: string[],
  options: { pageSize?: number; maxItems?: number } = {},
): Promise<{ data: SavedFlightListItem[] | null; error: Error | null }> {
  const ids = Array.from(new Set(trackIds.map((id) => id.trim()).filter(Boolean)));
  if (ids.length === 0) return { data: [], error: null };

  const pageSize = Math.min(100, Math.max(1, Math.round(options.pageSize ?? 100)));
  const maxItems = Math.max(pageSize, Math.round(options.maxItems ?? 500));
  const rows: SavedFlightListItem[] = [];
  let cursor: string | null = null;

  const roleQueries: string[] = [];
  if (viewer.role === "aluno") {
    roleQueries.push(Query.equal("student_user_id", [viewer.userId]));
  } else if (viewer.role === "instrutor") {
    roleQueries.push(Query.equal("instructor_user_id", [viewer.userId]));
  }

  const toPage = (res: { documents: Array<{ [key: string]: unknown; $id: string; $createdAt: string }> }) =>
    res.documents.map(toSavedFlightListItem);

  if (!isAppwriteConfigured || !databases) {
    return { data: null, error: new Error("Appwrite nao configurado") };
  }

  while (rows.length < maxItems) {
    const queries = [
      Query.select(FLIGHT_LIST_SELECT_WITH_SCHEDULE),
      Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
      ...roleQueries,
      Query.equal("training_track_id", ids),
      Query.orderDesc("flight_date"),
      Query.orderDesc("start_time"),
      Query.limit(pageSize),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    try {
      const res = await databases.listDocuments(DB_ID, COL_ID, queries);
      rows.push(...toPage(res));
      if (res.documents.length < pageSize) break;
      cursor = res.documents[res.documents.length - 1]?.$id ?? null;
      if (!cursor) break;
    } catch (e) {
      if (!isSchemaAttributeError(e)) return { data: null, error: e as Error };
      try {
        const legacyQueries = [
          Query.select(FLIGHT_LIST_SELECT),
          Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
          ...roleQueries,
          Query.equal("training_track_id", ids),
          Query.orderDesc("flight_date"),
          Query.orderDesc("start_time"),
          Query.limit(pageSize),
        ];
        if (cursor) legacyQueries.push(Query.cursorAfter(cursor));
        const res = await databases.listDocuments(DB_ID, COL_ID, legacyQueries);
        rows.push(...toPage(res));
        if (res.documents.length < pageSize) break;
        cursor = res.documents[res.documents.length - 1]?.$id ?? null;
        if (!cursor) break;
      } catch (fallbackError) {
        return { data: null, error: fallbackError as Error };
      }
    }
  }

  return { data: rows, error: null };
}

export async function listStudentFlightHistory(params: {
  actorUserId: string;
  actorRole: UserRole;
  studentUserId: string;
}): Promise<{ data: SavedFlightListItem[] | null; error: Error | null }> {
  if (!isAppwriteConfigured || !databases) {
    return { data: null, error: new Error("Appwrite não configurado") };
  }
  try {
    if (params.actorRole !== "instrutor" && params.actorRole !== "admin") {
      return { data: null, error: new Error("Apenas instrutor/admin pode consultar o histórico do aluno.") };
    }

    const queries = [
      Query.select(FLIGHT_LIST_SELECT_WITH_SCHEDULE),
      Query.equal("student_user_id", [params.studentUserId]),
      Query.orderDesc("$createdAt"),
      Query.limit(100),
    ];
    let res;
    try {
      res = await databases.listDocuments(DB_ID, COL_ID, queries);
    } catch (e) {
      if (!isSchemaAttributeError(e)) throw e;
      try {
        res = await databases.listDocuments(DB_ID, COL_ID, [
          Query.select(FLIGHT_LIST_SELECT),
          Query.equal("student_user_id", [params.studentUserId]),
          Query.orderDesc("$createdAt"),
          Query.limit(100),
        ]);
      } catch (e2) {
        if (!isSchemaAttributeError(e2)) throw e2;
        res = await databases.listDocuments(DB_ID, COL_ID, [
          Query.select(LEGACY_FLIGHT_LIST_SELECT),
          Query.equal("student_user_id", [params.studentUserId]),
          Query.orderDesc("$createdAt"),
          Query.limit(100),
        ]);
      }
    }
    const data = res.documents.map(toSavedFlightListItem);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e as Error };
  }
}

export async function listFlightsByAircraft(params: {
  aircraftIdent: string;
  fromDate?: string | null;
  toDate?: string | null;
  limit?: number;
  cursor?: string | null;
}): Promise<SavedFlightsPage> {
  const limit = Math.min(100, Math.max(1, Math.round(params.limit ?? 50)));
  const aircraftIdent = params.aircraftIdent.trim();
  if (!aircraftIdent) {
    return { data: [], error: null, total: 0, nextCursor: null };
  }
  if (!isAppwriteConfigured || !databases) {
    return { data: null, error: new Error("Appwrite não configurado"), total: 0, nextCursor: null };
  }
  try {
    const queries = [
      Query.select([...FLIGHT_LIST_SELECT_WITH_SCHEDULE, "flight_seq_number"]),
      Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
      Query.equal("aircraft_ident", [aircraftIdent]),
      Query.orderAsc("flight_date"),
      Query.orderAsc("flight_seq_number"),
      Query.orderAsc("start_time"),
      Query.limit(limit),
    ];
    if (params.fromDate) queries.push(Query.greaterThanEqual("flight_date", [params.fromDate]));
    if (params.toDate) queries.push(Query.lessThanEqual("flight_date", [params.toDate]));
    if (params.cursor) queries.push(Query.cursorAfter(params.cursor));

    const res = await databases.listDocuments(DB_ID, COL_ID, queries);
    return {
      data: res.documents.map(toSavedFlightListItem),
      error: null,
      total: res.total,
      nextCursor: res.documents.length === limit ? res.documents[res.documents.length - 1]?.$id ?? null : null,
    };
  } catch (e) {
    return { data: null, error: e as Error, total: 0, nextCursor: null };
  }
}

const META_PREFIX = "#GFV_META_V1:";
/** Bytes suficientes para a 1ª linha (meta JSON em base64). Nunca baixa telemetria. */
const META_ONLY_FETCH_BYTES = 96 * 1024;

function firstRecordLine(text: string): string {
  const normalized = text.replace(/^\uFEFF/, "");
  const lineEnd = normalized.search(/\r?\n/);
  return lineEnd >= 0 ? normalized.slice(0, lineEnd + 1) : normalized;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]!);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Carrega somente FlightRecordMeta — sem telemetria.
 * Usa csv_text inline (1ª linha) ou Range HTTP no arquivo de storage.
 */
export async function getFlightRecordMetaOnly(
  flightId: string,
): Promise<{ meta: FlightRecordMeta | null; error: Error | null }> {
  if (!isAppwriteConfigured || !databases) {
    return { meta: null, error: new Error("Appwrite não configurado") };
  }
  try {
    const d = await databases.getDocument(DB_ID, COL_ID, flightId, [Query.select(["csv_text", "csv_file_id"])]);
    const inline = ((d.csv_text as string | null | undefined) ?? "").trim();
    const csvFileId = (d.csv_file_id as string | null | undefined) ?? null;

    let prefix = "";
    if (inline.startsWith(META_PREFIX)) {
      prefix = firstRecordLine(inline);
    } else if (csvFileId && storage && BUCKET_ID) {
      const url = storage.getFileDownload(BUCKET_ID, csvFileId);
      const res = await fetch(url.toString(), {
        credentials: "include",
        headers: { Range: `bytes=0-${META_ONLY_FETCH_BYTES - 1}` },
      });
      if (res.ok || res.status === 206) {
        prefix = firstRecordLine(await res.text());
      } else if (inline.startsWith(META_PREFIX)) {
        prefix = firstRecordLine(inline);
      }
    } else if (inline) {
      prefix = firstRecordLine(inline);
    }

    return { meta: prefix ? decodeFlightRecordMeta(prefix) : null, error: null };
  } catch (e) {
    return { meta: null, error: e as Error };
  }
}

export async function getFlightRecordMetaBatch(
  flightIds: string[],
  options: { concurrency?: number } = {},
): Promise<Map<string, FlightRecordMeta | null>> {
  const map = new Map<string, FlightRecordMeta | null>();
  if (flightIds.length === 0) return map;

  const concurrency = options.concurrency ?? 10;
  const results = await mapWithConcurrency(flightIds, concurrency, async (id) => {
    const { meta, error } = await getFlightRecordMetaOnly(id);
    return { id, meta, error };
  });

  for (const row of results) {
    map.set(row.id, row.meta);
  }
  return map;
}

export async function listAllFlightsByAircraft(params: {
  aircraftIdent: string;
  fromDate?: string | null;
  toDate?: string | null;
}): Promise<{ data: SavedFlightListItem[] | null; error: Error | null }> {
  const rows: SavedFlightListItem[] = [];
  let cursor: string | null = null;
  for (;;) {
    const page = await listFlightsByAircraft({
      aircraftIdent: params.aircraftIdent,
      fromDate: params.fromDate,
      toDate: params.toDate,
      limit: 100,
      cursor,
    });
    if (page.error) return { data: null, error: page.error };
    rows.push(...(page.data ?? []));
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return { data: rows, error: null };
}

export async function getSavedFlight(id: string): Promise<{ data: SavedFlightFull | null; error: Error | null }> {
  if (!isAppwriteConfigured || !databases) {
    return { data: null, error: new Error("Appwrite não configurado") };
  }
  try {
    const d = await databases.getDocument(DB_ID, COL_ID, id);
    const csvFileId = d.csv_file_id as string | null | undefined;
    let csvText: string;

    if (csvFileId && storage && BUCKET_ID) {
      try {
        const url = storage.getFileDownload(BUCKET_ID, csvFileId);
        const res = await fetch(url.toString(), { credentials: "include" });
        if (res.ok) {
          csvText = await res.text();
        } else {
          csvText = (d.csv_text as string | null | undefined) ?? "";
        }
      } catch {
        csvText = (d.csv_text as string | null | undefined) ?? "";
      }
    } else {
      csvText = (d.csv_text as string | null | undefined) ?? "";
    }

    return {
      data: {
        ...toSavedFlightListItem(d),
        csv_text: csvText,
      },
      error: null,
    };
  } catch (e) {
    return { data: null, error: e as Error };
  }
}

export async function insertFlight(payload: {
  actorUserId: string;
  actorRole: UserRole;
  studentUserId: string;
  instructorUserId?: string | null;
  source_filename: string;
  csv_text: string;
  aircraft_ident?: string | null;
  duration_sec?: number | null;
  trainingTrackId?: string | null;
  trainingStageId?: string | null;
  trainingMissionId?: string | null;
  trainingSnapshot?: TrainingSelectionSnapshot | null;
  telemetryMetrics?: FlightTelemetryMetricsBundle | null;
  telemetryAlertParsed?: ParseResult | null;
}): Promise<{ id: string | null; error: Error | null }> {
  if (!isAppwriteConfigured || !databases) {
    return { id: null, error: new Error("Appwrite não configurado") };
  }

  try {
    const canUpload = payload.actorRole === "instrutor" || payload.actorRole === "admin";
    if (!canUpload) {
      return { id: null, error: new Error("Apenas instrutor ou admin pode enviar voos.") };
    }

    let flight_seq_number: number | null = null;
    if (payload.aircraft_ident && databases && DB_ID && COL_ID) {
      const res = await databases.listDocuments(DB_ID, COL_ID, [
        Query.equal("aircraft_ident", [payload.aircraft_ident]),
        Query.orderDesc("flight_seq_number"),
        Query.limit(1),
        Query.select(["flight_seq_number"]),
      ]);
      const last = res.documents[0]?.flight_seq_number;
      flight_seq_number = typeof last === "number" && Number.isFinite(last) ? last + 1 : 1;
    }

    const scheduleFields = getFlightScheduleFields(payload.csv_text);
    const permissions = resolveClientFlightPermissions(
      payload.actorUserId,
      payload.actorRole,
      payload.studentUserId,
      payload.instructorUserId,
    );
    const storagePermissions = resolveStorageCsvPermissions(payload.actorUserId, payload.actorRole);

    let csvFileId: string | null = null;
    if (storage && BUCKET_ID) {
      const blob = new Blob([payload.csv_text], { type: "text/csv" });
      const file = new File([blob], toStorageCsvFileName(payload.source_filename), { type: "text/csv" });
      const uploaded = await storage.createFile(BUCKET_ID, ID.unique(), file, storagePermissions);
      csvFileId = uploaded.$id;
    }

    const d = await createFlightDocumentWithMaterializedFallback({
      id: ID.unique(),
      basePayload: {
        school_id: DEFAULT_SCHOOL_ID,
        user_id: payload.studentUserId,
        student_user_id: payload.studentUserId,
        instructor_user_id: payload.instructorUserId ?? null,
        created_by_role: payload.actorRole,
        name: buildInternalFlightName(payload),
        source_filename: payload.source_filename,
        csv_text: csvFileId ? "" : payload.csv_text,
        csv_file_id: csvFileId,
        aircraft_ident: payload.aircraft_ident ?? null,
        duration_sec: payload.duration_sec ?? null,
        flight_date: scheduleFields.flight_date,
        start_time: scheduleFields.start_time,
        training_track_id: payload.trainingTrackId ?? null,
        training_stage_id: payload.trainingStageId ?? null,
        training_mission_id: payload.trainingMissionId ?? null,
        training_snapshot_json: payload.trainingSnapshot ? JSON.stringify(payload.trainingSnapshot) : null,
        flight_seq_number,
        flight_status: "Confirmado",
      },
      csvText: payload.csv_text,
      trainingMissionId: payload.trainingMissionId,
      permissions,
    });

    const metricsResult = await replaceFlightTelemetryMetrics(
      d.$id,
      payload.actorUserId,
      payload.telemetryMetrics ?? null,
      payload.actorRole,
    );
    if (metricsResult.error) return { id: d.$id, error: metricsResult.error };
    if (Object.prototype.hasOwnProperty.call(payload, "telemetryAlertParsed")) {
      const alertsResult = await replaceFlightTelemetryAlertsForFlight({
        flightId: d.$id,
        actorUserId: payload.actorUserId,
        identity: payload.telemetryMetrics?.summary ?? {
          studentUserId: payload.studentUserId,
          instructorUserId: payload.instructorUserId ?? null,
          aircraftIdent: payload.aircraft_ident ?? null,
          flightDate: scheduleFields.flight_date,
          startTime: scheduleFields.start_time,
        },
        parsed: payload.telemetryAlertParsed ?? null,
      });
      if (alertsResult.error) console.warn("Falha ao materializar alertas de telemetria.", alertsResult.error);
    }

    return { id: d.$id, error: null };
  } catch (e) {
    return { id: null, error: e as Error };
  }
}

export async function updateFlight(id: string, payload: {
  actorUserId: string;
  actorRole: UserRole;
  studentUserId: string;
  instructorUserId?: string | null;
  source_filename: string;
  csv_text: string;
  aircraft_ident?: string | null;
  duration_sec?: number | null;
  trainingTrackId?: string | null;
  trainingStageId?: string | null;
  trainingMissionId?: string | null;
  trainingSnapshot?: TrainingSelectionSnapshot | null;
  telemetryMetrics?: FlightTelemetryMetricsBundle | null;
  telemetryAlertParsed?: ParseResult | null;
  flightStatus?: FlightStatus | null;
  allowSignedTelemetryUpdate?: boolean;
  allowSignedMissionEdit?: boolean;
}): Promise<{ error: Error | null }> {
  if (!isAppwriteConfigured || !databases) {
    return { error: new Error("Appwrite não configurado") };
  }
  try {
    const canUpload = payload.actorRole === "instrutor" || payload.actorRole === "admin";
    if (!canUpload) {
      return { error: new Error("Apenas instrutor ou admin pode atualizar voos.") };
    }

    if (!payload.allowSignedTelemetryUpdate && !payload.allowSignedMissionEdit) {
      const lockCheck = await assertFlightNotLocked(id);
      if (lockCheck.error && lockCheck.locked) return { error: lockCheck.error };
    }

    const scheduleFields = getFlightScheduleFields(payload.csv_text);
    const current = await databases.getDocument(DB_ID, COL_ID, id);
    // Campos de treinamento ausentes (undefined) preservam o valor atual do voo;
    // só `null` explícito limpa a missão (ex.: upload de telemetria não envia esses campos).
    const trainingTrackId = payload.trainingTrackId !== undefined
      ? payload.trainingTrackId
      : ((current.training_track_id as string | null | undefined) ?? null);
    const trainingStageId = payload.trainingStageId !== undefined
      ? payload.trainingStageId
      : ((current.training_stage_id as string | null | undefined) ?? null);
    const trainingMissionId = payload.trainingMissionId !== undefined
      ? payload.trainingMissionId
      : ((current.training_mission_id as string | null | undefined) ?? null);
    const trainingSnapshotJson = payload.trainingSnapshot !== undefined
      ? (payload.trainingSnapshot ? JSON.stringify(payload.trainingSnapshot) : null)
      : ((current.training_snapshot_json as string | null | undefined) ?? null);
    // INVA/admin no browser não podem reenviar ACL com permissões de outro papel (ex.: label:admin) — Appwrite 401.
    const permissions =
      payload.actorRole === "instrutor" || payload.actorRole === "admin"
        ? undefined
        : resolveClientFlightPermissions(
            payload.actorUserId,
            payload.actorRole,
            payload.studentUserId,
            payload.instructorUserId,
            (current.$permissions as string[] | undefined) ?? [],
          );
    const storagePermissions = resolveStorageCsvPermissions(payload.actorUserId, payload.actorRole);

    let csvFileId: string | null = null;
    if (storage && BUCKET_ID) {
      const blob = new Blob([payload.csv_text], { type: "text/csv" });
      const file = new File([blob], toStorageCsvFileName(payload.source_filename), { type: "text/csv" });
      const uploaded = await storage.createFile(BUCKET_ID, ID.unique(), file, storagePermissions);
      csvFileId = uploaded.$id;
    }

    await updateFlightDocumentWithMaterializedFallback({
      id,
      basePayload: {
        school_id: DEFAULT_SCHOOL_ID,
        user_id: payload.studentUserId,
        student_user_id: payload.studentUserId,
        instructor_user_id: payload.instructorUserId ?? null,
        created_by_role: payload.actorRole,
        name: buildInternalFlightName(payload),
        source_filename: payload.source_filename,
        csv_text: csvFileId ? "" : payload.csv_text,
        csv_file_id: csvFileId,
        aircraft_ident: payload.aircraft_ident ?? null,
        duration_sec: payload.duration_sec ?? null,
        flight_date: scheduleFields.flight_date,
        start_time: scheduleFields.start_time,
        training_track_id: trainingTrackId,
        training_stage_id: trainingStageId,
        training_mission_id: trainingMissionId,
        training_snapshot_json: trainingSnapshotJson,
        flight_status: normalizeFlightStatus(payload.flightStatus ?? current.flight_status),
      },
      csvText: payload.csv_text,
      trainingMissionId,
      permissions,
    });
    const metricsResult = await replaceFlightTelemetryMetrics(
      id,
      payload.actorUserId,
      payload.telemetryMetrics ?? null,
      payload.actorRole,
    );
    if (metricsResult.error) return { error: metricsResult.error };
    if (Object.prototype.hasOwnProperty.call(payload, "telemetryAlertParsed")) {
      const alertsResult = await replaceFlightTelemetryAlertsForFlight({
        flightId: id,
        actorUserId: payload.actorUserId,
        identity: payload.telemetryMetrics?.summary ?? {
          studentUserId: payload.studentUserId,
          instructorUserId: payload.instructorUserId ?? null,
          aircraftIdent: payload.aircraft_ident ?? null,
          flightDate: scheduleFields.flight_date,
          startTime: scheduleFields.start_time,
        },
        parsed: payload.telemetryAlertParsed ?? null,
      });
      if (alertsResult.error) console.warn("Falha ao materializar alertas de telemetria.", alertsResult.error);
    }
    if (payload.actorRole === "admin") {
      await createAdminAuditEvent({
        eventType: "flight_admin_edited",
        entityType: "flight",
        entityId: id,
        reason: "Edição administrativa de voo aberto.",
        beforeSnapshot: {
          id,
          flight_status: current.flight_status ?? null,
          instructor_signed: current.instructor_signed ?? null,
          student_signed: current.student_signed ?? null,
          admin_operator_signed: current.admin_operator_signed ?? null,
          csv_text: current.csv_text ?? null,
          csv_file_id: current.csv_file_id ?? null,
        },
        afterSnapshot: {
          id,
          flight_status: normalizeFlightStatus(payload.flightStatus ?? current.flight_status),
          student_user_id: payload.studentUserId,
          instructor_user_id: payload.instructorUserId ?? null,
          aircraft_ident: payload.aircraft_ident ?? null,
          flight_date: scheduleFields.flight_date,
          start_time: scheduleFields.start_time,
          csv_text: payload.csv_text,
        },
      });
    }
    return { error: null };
  } catch (e) {
    const err = e as Error;
    // Appwrite 401: instructor trying to update an admin-created flight.
    // Fall back to the cloud function which has API-key-level permissions.
    const appwriteCode = (err as unknown as { code?: number }).code;
    if (payload.actorRole === "instrutor" && (appwriteCode === 401 || err.message?.toLowerCase().includes("not authorized"))) {
      const { instructorPatchFlight } = await import("./instructorPatchFlightDb");
      return instructorPatchFlight({
        flightId: id,
        instructorUserId: payload.actorUserId,
        csvText: payload.csv_text,
        flightStatus: payload.flightStatus ?? undefined,
        trainingTrackId: payload.trainingTrackId,
        trainingStageId: payload.trainingStageId,
        trainingMissionId: payload.trainingMissionId,
        trainingSnapshot: payload.trainingSnapshot,
      });
    }
    return { error: err };
  }
}

export async function updateFlightStatus(id: string, payload: {
  actorUserId: string;
  actorRole: UserRole;
  status: FlightStatus;
}): Promise<{ error: Error | null }> {
  if (!isAppwriteConfigured || !databases) {
    return { error: new Error("Appwrite nÃ£o configurado") };
  }
  try {
    if (payload.actorRole !== "instrutor" && payload.actorRole !== "admin") {
      return { error: new Error("Apenas INVA ou admin pode alterar o status do voo.") };
    }
    const lockCheck = await assertFlightNotLocked(id);
    if (lockCheck.error && lockCheck.locked) return { error: lockCheck.error };
    await databases.updateDocument(DB_ID, COL_ID, id, {
      flight_status: normalizeFlightStatus(payload.status),
    });
    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}

export async function updateStudentFlightSuggestion(id: string, payload: {
  actorUserId: string;
  suggestionMd: string;
}): Promise<{ error: Error | null }> {
  if (!isAppwriteConfigured || !databases) {
    return { error: new Error("Appwrite não configurado") };
  }
  try {
    const saved = await getSavedFlight(id);
    if (saved.error || !saved.data) {
      return { error: saved.error ?? new Error("Voo não encontrado.") };
    }
    if (saved.data.student_user_id !== payload.actorUserId) {
      return { error: new Error("Você só pode atualizar a sugestão dos seus próprios voos.") };
    }
    if (saved.data.instructor_signed) {
      return { error: new Error("Este voo está bloqueado pois foi assinado pelo instrutor.") };
    }

    const { studentPatchFlightSuggestion } = await import("./instructorPatchFlightDb");
    return studentPatchFlightSuggestion({
      flightId: id,
      studentUserId: payload.actorUserId,
      suggestionMd: payload.suggestionMd.trim(),
      csvText: saved.data.csv_text,
    });
  } catch (e) {
    const err = e as Error;
    const appwriteCode = (err as unknown as { code?: number }).code;
    const unauthorized = appwriteCode === 401 || err.message?.toLowerCase().includes("not authorized");
    if (unauthorized) {
      const { studentPatchFlightSuggestion } = await import("./instructorPatchFlightDb");
      return studentPatchFlightSuggestion({
        flightId: id,
        studentUserId: payload.actorUserId,
        suggestionMd: payload.suggestionMd.trim(),
      });
    }
    return { error: err };
  }
}

export async function updateFlightWeightBalance(id: string, payload: {
  actorUserId: string;
  actorRole: UserRole;
  weightBalance: FlightWeightBalanceMeta;
}): Promise<{ error: Error | null }> {
  if (!isAppwriteConfigured || !databases) {
    return { error: new Error("Appwrite não configurado") };
  }
  try {
    const saved = await getSavedFlight(id);
    if (saved.error || !saved.data) {
      return { error: saved.error ?? new Error("Voo não encontrado.") };
    }
    const canUpdate =
      payload.actorRole === "admin" ||
      payload.actorRole === "instrutor" ||
      saved.data.student_user_id === payload.actorUserId;
    if (!canUpdate) {
      return { error: new Error("Você não tem permissão para atualizar o peso e balanceamento deste voo.") };
    }
    if (saved.data.instructor_signed) {
      return { error: new Error("Este voo está bloqueado pois foi assinado pelo instrutor.") };
    }

    if (payload.actorRole === "aluno") {
      const { studentPatchFlightWeightBalance } = await import("./instructorPatchFlightDb");
      return studentPatchFlightWeightBalance({
        flightId: id,
        studentUserId: payload.actorUserId,
        weightBalance: payload.weightBalance,
        csvText: saved.data.csv_text,
      });
    }

    const decoded = decodeFlightRecord(saved.data.csv_text);
    if (!decoded.meta) {
      return { error: new Error("Ficha do voo sem metadados para atualizar.") };
    }

    const nextMeta = {
      ...decoded.meta,
      weightBalance: payload.weightBalance,
    };
    const csvText = encodeFlightRecord({
      meta: nextMeta,
      telemetryCsv: decoded.telemetryCsv,
      telemetryFiles: decoded.telemetryFiles,
    });

    await updateFlightDocumentWithMaterializedFallback({
      id,
      basePayload: {
        csv_text: csvText,
        csv_file_id: null,
      },
      csvText,
      trainingMissionId: saved.data.training_mission_id,
    });
    return { error: null };
  } catch (e) {
    const err = e as Error;
    const appwriteCode = (err as unknown as { code?: number }).code;
    const unauthorized = appwriteCode === 401 || err.message?.toLowerCase().includes("not authorized");
    if (payload.actorRole === "aluno" && unauthorized) {
      const { studentPatchFlightWeightBalance } = await import("./instructorPatchFlightDb");
      return studentPatchFlightWeightBalance({
        flightId: id,
        studentUserId: payload.actorUserId,
        weightBalance: payload.weightBalance,
      });
    }
    return { error: err };
  }
}

export async function updateInstructorFlightSuggestion(id: string, payload: {
  actorUserId: string;
  suggestionMd: string;
}): Promise<{ error: Error | null }> {
  if (!isAppwriteConfigured || !databases) {
    return { error: new Error("Appwrite não configurado") };
  }
  try {
    const saved = await getSavedFlight(id);
    if (saved.error || !saved.data) {
      return { error: saved.error ?? new Error("Voo não encontrado.") };
    }
    if (saved.data.instructor_user_id !== payload.actorUserId) {
      return { error: new Error("Você só pode atualizar a sugestão dos voos atribuídos a você.") };
    }
    if (saved.data.instructor_signed) {
      return { error: new Error("Este voo já foi assinado e não pode mais ser alterado.") };
    }

    const decoded = decodeFlightRecord(saved.data.csv_text);
    if (!decoded.meta) {
      return { error: new Error("Ficha do voo sem metadados para atualizar.") };
    }

    const nextMeta = {
      ...decoded.meta,
      preFlight: {
        ...decoded.meta.preFlight,
        instructorSuggestionMd: payload.suggestionMd.trim(),
      },
    };
    const csvText = encodeFlightRecord({
      meta: nextMeta,
      telemetryCsv: decoded.telemetryCsv,
      telemetryFiles: decoded.telemetryFiles,
    });

    await updateFlightDocumentWithMaterializedFallback({
      id,
      basePayload: {
        csv_text: csvText,
        csv_file_id: null,
      },
      csvText,
      trainingMissionId: saved.data.training_mission_id,
    });
    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}

export async function deleteSavedFlight(id: string): Promise<{ error: Error | null }> {
  if (!isAppwriteConfigured || !databases) {
    return { error: new Error("Appwrite não configurado") };
  }
  const runSagaDeleteViaAdminFunction = async (): Promise<{ error: Error | null }> => {
    if (!functions || !ADMIN_USERS_FUNCTION_ID) {
      return { error: new Error("Função administrativa de exclusão não configurada.") };
    }
    try {
      const execution = await functions.createExecution(
        ADMIN_USERS_FUNCTION_ID,
        JSON.stringify({ action: "sagaDeleteFlight", flightId: id }),
        false,
      );
      let response: { ok?: boolean; message?: string } = {};
      try {
        response = execution.responseBody ? JSON.parse(execution.responseBody) : {};
      } catch {
        response = {};
      }
      const responseMessage = String(response.message || "").toLowerCase();
      const responseNotFound = responseMessage.includes("voo nao encontrado") || responseMessage.includes("not found");
      if (responseNotFound) {
        return { error: null };
      }
      if (execution.status === "failed" || (execution.responseStatusCode ?? 0) >= 400 || response.ok !== true) {
        return { error: new Error(response.message || "Falha ao apagar voo via função administrativa.") };
      }
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };
  try {
    const doc = await databases.getDocument(DB_ID, COL_ID, id, [Query.select(["instructor_signed", "saga_flight_id", "source_filename", "csv_file_id"])]);
    const isSagaImported =
      String(doc.saga_flight_id || "").trim().length > 0 ||
      String(doc.source_filename || "").toLowerCase().includes("saga");
    if (doc.instructor_signed && !isSagaImported) {
      return { error: new Error("Não é possível apagar um voo assinado pelo instrutor.") };
    }
    // For SAGA flights, prefer server-side delete first (API-key context) to avoid browser ACL issues.
    if (isSagaImported && functions && ADMIN_USERS_FUNCTION_ID) {
      const adminDelete = await runSagaDeleteViaAdminFunction();
      if (!adminDelete.error) return { error: null };
    }

    // Try to delete the associated CSV file from Storage as well
    if (storage && BUCKET_ID) {
      try {
        const csvFileId = doc.csv_file_id as string | null | undefined;
        if (csvFileId) {
          await storage.deleteFile(BUCKET_ID, csvFileId);
        }
      } catch {
        // Ignore storage deletion errors — document deletion is the priority
      }
    }
    await databases.deleteDocument(DB_ID, COL_ID, id);
    // Best-effort cleanup: the flight deletion is the source of truth.
    // Telemetry cleanup must never turn a successful delete into an error.
    await Promise.allSettled([
      clearFlightTelemetryMetrics(id),
      clearFlightTelemetryAlerts(id),
    ]);
    return { error: null };
  } catch (e) {
    const err = e as Error & { code?: number };
    const message = String(err.message || "").toLowerCase();
    const notFound =
      err.code === 404 ||
      message.includes("not found") ||
      message.includes("voo nao encontrado");
    // Delete is idempotent: if it is already gone, treat as success.
    if (notFound) return { error: null };
    const unauthorized = err.code === 401 || err.message?.toLowerCase().includes("not authorized");
    if (unauthorized && functions && ADMIN_USERS_FUNCTION_ID) {
      return runSagaDeleteViaAdminFunction();
    }
    return { error: err };
  }
}
