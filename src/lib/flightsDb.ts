import { Query } from "appwrite";
import { BUCKET_ID, databases, ID, isAppwriteConfigured, Permission, Role, SCHOOL_ID, storage } from "./appwrite";

const DEFAULT_SCHOOL_ID = SCHOOL_ID ?? "escola_principal";
import { decodeFlightRecord, encodeFlightRecord } from "./flightRecordCodec";
import type { FlightWeightBalanceMeta } from "./weightBalance";
import { clearFlightTelemetryMetrics, replaceFlightTelemetryMetrics } from "./flightTelemetryMetricsDb";
import { clearFlightTelemetryAlerts, replaceFlightTelemetryAlertsForFlight } from "./flightTelemetryAlertsDb";
import type { FlightTelemetryMetricsBundle } from "./flightTelemetryMetrics";
import type { ParseResult } from "./parseGarminCsv";
import type { UserRole } from "./rbac";
import type { TrainingSelectionSnapshot } from "../types/trainingTrack";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string;
const COL_ID = import.meta.env.VITE_APPWRITE_COLLECTION_ID as string;

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
};

export type SavedFlightFull = SavedFlightListItem & { csv_text: string };

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

const FLIGHT_LIST_SELECT = [...LEGACY_FLIGHT_LIST_SELECT, ...MATERIALIZED_FLIGHT_LIST_FIELDS];

const FLIGHT_LIST_SELECT_WITH_SCHEDULE = [...FLIGHT_LIST_SELECT, ...SCHEDULE_FLIGHT_LIST_FIELDS];

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
  };
}

function getScheduleDocumentFields(csvText: string): {
  schedule_week_start: string | null;
  schedule_demand_id: string | null;
} {
  const meta = decodeFlightRecord(csvText).meta;
  if (!meta?.schedule?.demandId) {
    return { schedule_week_start: null, schedule_demand_id: null };
  }
  return {
    schedule_week_start: meta.schedule.weekStart ?? null,
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
  const totalFlightMinutes = meta.legs.reduce((acc, leg) => acc + parseDurationToMinutes(leg.flightTime), 0);
  const landings = meta.legs.reduce((acc, leg) => acc + Math.max(0, Math.round(leg.landings || 0)), 0);
  const totalMiles = meta.legs.reduce((acc, leg) => acc + parseMiles(leg.distance), 0);
  const instructorSuggestion = meta.preFlight?.instructorSuggestionMd?.trim() ?? "";
  const studentSuggestion = meta.preFlight?.studentSuggestionMd?.trim() ?? "";

  return {
    from_to: airports.length > 0 ? airports.join(" -> ") : null,
    landings,
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
    start_time: meta?.header.startTime?.trim() || null,
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

function buildActorOwnedPermissions(actorUserId: string) {
  return [
    Permission.read(Role.users()),
    Permission.read(Role.user(actorUserId)),
    Permission.update(Role.user(actorUserId)),
    Permission.delete(Role.user(actorUserId)),
  ];
}

function canSetClientSidePermission(permission: string, actorUserId: string, actorRole: UserRole): boolean {
  if (permission.includes(`("user:${actorUserId}")`)) return true;
  if (permission.includes('("users")') || permission.includes('("users/unverified")')) return true;
  if (actorRole === "admin" && permission.includes('("label:admin")')) return true;
  if (actorRole === "instrutor" && permission.includes('("label:instrutor")')) return true;
  return false;
}

function buildFlightDocumentPermissions(
  actorUserId: string,
  actorRole: UserRole,
  studentUserId?: string | null,
  instructorUserId?: string | null,
) {
  if (actorRole === "admin") {
    return [
      Permission.read(Role.users()),
      Permission.read(Role.user(actorUserId)),
      Permission.update(Role.user(actorUserId)),
      Permission.delete(Role.user(actorUserId)),
      Permission.read(Role.label("admin")),
      Permission.update(Role.label("admin")),
      Permission.delete(Role.label("admin")),
    ];
  }

  const permissions = buildActorOwnedPermissions(actorUserId);

  if (studentUserId && studentUserId !== actorUserId) {
    permissions.push(Permission.read(Role.user(studentUserId)));
  }

  if (actorRole === "instrutor" && (instructorUserId || studentUserId)) {
    permissions.push(Permission.read(Role.label("instrutor")));
    permissions.push(Permission.update(Role.label("instrutor")));
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
    await databases!.updateDocument(DB_ID, COL_ID, params.id, payload, params.permissions);
  } catch (e) {
    if (!isSchemaAttributeError(e)) throw e;
    await databases!.updateDocument(DB_ID, COL_ID, params.id, params.basePayload, params.permissions);
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

/** Voos de escala (auto/manual-scale) de uma semana — sem baixar CSV por documento. */
export async function listScheduledFlightsForWeek(weekStart: string): Promise<{
  data: SavedFlightListItem[];
  error: Error | null;
}> {
  if (!isAppwriteConfigured || !databases) {
    return { data: [], error: new Error("Appwrite não configurado") };
  }

  try {
    const [autoRows, manualRows] = await Promise.all([
      listFlightsBySourceFilenamePrefix(`auto-scale-${weekStart}`),
      listFlightsBySourceFilenamePrefix(`manual-scale-${weekStart}`),
    ]);
    const byId = new Map<string, SavedFlightListItem>();
    for (const row of [...autoRows, ...manualRows]) byId.set(row.id, row);
    return { data: [...byId.values()], error: null };
  } catch (e) {
    return { data: [], error: e as Error };
  }
}

export async function listSavedFlights(
  viewer: { userId: string; role: UserRole },
): Promise<{ data: SavedFlightListItem[] | null; error: Error | null }> {
  if (!isAppwriteConfigured || !databases) {
    return { data: null, error: new Error("Appwrite não configurado") };
  }
  try {
    const queries = [
      Query.select(FLIGHT_LIST_SELECT),
      Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
      Query.orderDesc("$createdAt"),
      Query.limit(200),
    ];
    if (viewer.role === "aluno") {
      queries.push(Query.equal("student_user_id", [viewer.userId]));
    } else if (viewer.role === "instrutor") {
      queries.push(Query.equal("instructor_user_id", [viewer.userId]));
    }

    const res = await databases.listDocuments(DB_ID, COL_ID, queries);
    const data = res.documents.map(toSavedFlightListItem);
    return { data, error: null };
  } catch (e) {
    if (!isSchemaAttributeError(e)) return { data: null, error: e as Error };
    try {
      const queries = [
        Query.select(LEGACY_FLIGHT_LIST_SELECT),
        Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
        Query.orderDesc("$createdAt"),
        Query.limit(200),
      ];
      if (viewer.role === "aluno") {
        queries.push(Query.equal("student_user_id", [viewer.userId]));
      } else if (viewer.role === "instrutor") {
        queries.push(Query.equal("instructor_user_id", [viewer.userId]));
      }
      const res = await databases.listDocuments(DB_ID, COL_ID, queries);
      return { data: res.documents.map(toSavedFlightListItem), error: null };
    } catch (fallbackError) {
      return { data: null, error: fallbackError as Error };
    }
  }
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
      Query.select(FLIGHT_LIST_SELECT),
      Query.equal("student_user_id", [params.studentUserId]),
      Query.orderDesc("$createdAt"),
      Query.limit(100),
    ];
    let res;
    try {
      res = await databases.listDocuments(DB_ID, COL_ID, queries);
    } catch (e) {
      if (!isSchemaAttributeError(e)) throw e;
      res = await databases.listDocuments(DB_ID, COL_ID, [
        Query.select(LEGACY_FLIGHT_LIST_SELECT),
        Query.equal("student_user_id", [params.studentUserId]),
        Query.orderDesc("$createdAt"),
        Query.limit(100),
      ]);
    }
    const data = res.documents.map(toSavedFlightListItem);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e as Error };
  }
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

    const scheduleFields = getFlightScheduleFields(payload.csv_text);
    const permissions = buildFlightDocumentPermissions(
      payload.actorUserId,
      payload.actorRole,
      payload.studentUserId,
      payload.instructorUserId,
    );

    let csvFileId: string | null = null;
    if (storage && BUCKET_ID) {
      const blob = new Blob([payload.csv_text], { type: "text/csv" });
      const file = new File([blob], toStorageCsvFileName(payload.source_filename), { type: "text/csv" });
      const uploaded = await storage.createFile(BUCKET_ID, ID.unique(), file, permissions);
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
        csv_text: payload.csv_text,
        csv_file_id: csvFileId,
        aircraft_ident: payload.aircraft_ident ?? null,
        duration_sec: payload.duration_sec ?? null,
        flight_date: scheduleFields.flight_date,
        start_time: scheduleFields.start_time,
        training_track_id: payload.trainingTrackId ?? null,
        training_stage_id: payload.trainingStageId ?? null,
        training_mission_id: payload.trainingMissionId ?? null,
        training_snapshot_json: payload.trainingSnapshot ? JSON.stringify(payload.trainingSnapshot) : null,
      },
      csvText: payload.csv_text,
      trainingMissionId: payload.trainingMissionId,
      permissions,
    });

    const metricsResult = await replaceFlightTelemetryMetrics(d.$id, payload.actorUserId, payload.telemetryMetrics ?? null);
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
}): Promise<{ error: Error | null }> {
  if (!isAppwriteConfigured || !databases) {
    return { error: new Error("Appwrite não configurado") };
  }
  try {
    const canUpload = payload.actorRole === "instrutor" || payload.actorRole === "admin";
    if (!canUpload) {
      return { error: new Error("Apenas instrutor ou admin pode atualizar voos.") };
    }

    const scheduleFields = getFlightScheduleFields(payload.csv_text);
    const current = await databases.getDocument(DB_ID, COL_ID, id);
    const permissions = mergeFlightDocumentPermissions(
      (current.$permissions as string[] | undefined) ?? [],
      payload.actorUserId,
      payload.actorRole,
      payload.studentUserId,
      payload.instructorUserId,
    );

    let csvFileId: string | null = null;
    if (storage && BUCKET_ID) {
      const blob = new Blob([payload.csv_text], { type: "text/csv" });
      const file = new File([blob], toStorageCsvFileName(payload.source_filename), { type: "text/csv" });
      const uploaded = await storage.createFile(BUCKET_ID, ID.unique(), file, permissions);
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
        csv_text: payload.csv_text,
        csv_file_id: csvFileId,
        aircraft_ident: payload.aircraft_ident ?? null,
        duration_sec: payload.duration_sec ?? null,
        flight_date: scheduleFields.flight_date,
        start_time: scheduleFields.start_time,
        training_track_id: payload.trainingTrackId ?? null,
        training_stage_id: payload.trainingStageId ?? null,
        training_mission_id: payload.trainingMissionId ?? null,
        training_snapshot_json: payload.trainingSnapshot ? JSON.stringify(payload.trainingSnapshot) : null,
      },
      csvText: payload.csv_text,
      trainingMissionId: payload.trainingMissionId,
      permissions,
    });
    const metricsResult = await replaceFlightTelemetryMetrics(id, payload.actorUserId, payload.telemetryMetrics ?? null);
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

    const decoded = decodeFlightRecord(saved.data.csv_text);
    if (!decoded.meta) {
      return { error: new Error("Ficha do voo sem metadados para atualizar.") };
    }

    const nextMeta = {
      ...decoded.meta,
      preFlight: {
        ...decoded.meta.preFlight,
        studentSuggestionMd: payload.suggestionMd.trim(),
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
    return { error: e as Error };
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
  try {
    // Try to delete the associated CSV file from Storage as well
    if (storage && BUCKET_ID) {
      try {
        const d = await databases.getDocument(DB_ID, COL_ID, id);
        const csvFileId = d.csv_file_id as string | null | undefined;
        if (csvFileId) {
          await storage.deleteFile(BUCKET_ID, csvFileId);
        }
      } catch {
        // Ignore storage deletion errors — document deletion is the priority
      }
    }
    await databases.deleteDocument(DB_ID, COL_ID, id);
    await clearFlightTelemetryMetrics(id);
    await clearFlightTelemetryAlerts(id);
    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}
