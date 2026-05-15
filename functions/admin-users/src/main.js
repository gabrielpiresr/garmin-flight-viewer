const crypto = require("node:crypto");
const sdk = require("node-appwrite");
const { Resend } = require("resend");
const webpush = require("web-push");

const client = new sdk.Client()
  .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || "")
  .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || "")
  .setKey(process.env.APPWRITE_API_KEY || "");

const databases = new sdk.Databases(client);
const users = new sdk.Users(client);

const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const PROFILES_COLLECTION_ID = process.env.APPWRITE_PROFILES_COLLECTION_ID;
const FLIGHTS_COLLECTION_ID = process.env.APPWRITE_FLIGHTS_COLLECTION_ID || process.env.APPWRITE_COLLECTION_ID;
const WEEKLY_PLANS_COLLECTION_ID =
  process.env.APPWRITE_WEEKLY_PLANS_COLLECTION_ID || process.env.APPWRITE_WEEKLY_PLANS_COL_ID;
const INSTRUCTOR_PREFS_COLLECTION_ID = process.env.APPWRITE_INSTRUCTOR_PREFS_COLLECTION_ID;
const STUDENT_CREDITS_COLLECTION_ID = process.env.APPWRITE_STUDENT_CREDITS_COLLECTION_ID;
const AIRCRAFTS_COLLECTION_ID = process.env.APPWRITE_AIRCRAFTS_COLLECTION_ID || process.env.APPWRITE_AIRCRAFTS_COL_ID;
const AIRCRAFT_MODELS_COLLECTION_ID =
  process.env.APPWRITE_AIRCRAFT_MODELS_COLLECTION_ID || process.env.APPWRITE_AIRCRAFT_MODELS_COL_ID;
const FLIGHT_TELEMETRY_SUMMARIES_COLLECTION_ID =
  process.env.APPWRITE_FLIGHT_TELEMETRY_SUMMARIES_COLLECTION_ID || process.env.APPWRITE_FLIGHT_TELEMETRY_SUMMARIES_COL_ID;
const FLIGHT_LANDINGS_COLLECTION_ID =
  process.env.APPWRITE_FLIGHT_LANDINGS_COLLECTION_ID || process.env.APPWRITE_FLIGHT_LANDINGS_COL_ID;
const FLIGHT_TELEMETRY_ALERTS_COLLECTION_ID =
  process.env.APPWRITE_FLIGHT_TELEMETRY_ALERTS_COLLECTION_ID || process.env.APPWRITE_FLIGHT_TELEMETRY_ALERTS_COL_ID;
const TRAINING_TRACKS_COLLECTION_ID =
  process.env.APPWRITE_TRAINING_TRACKS_COLLECTION_ID || process.env.APPWRITE_TRAINING_TRACKS_COL_ID;
const STUDENT_TRACKS_COLLECTION_ID =
  process.env.APPWRITE_STUDENT_TRACKS_COLLECTION_ID || process.env.APPWRITE_STUDENT_TRACKS_COL_ID;
const MANEUVERS_SECTIONS_COLLECTION_ID = process.env.APPWRITE_MANEUVERS_SECTIONS_COLLECTION_ID;
const MANEUVERS_SUBSECTIONS_COLLECTION_ID = process.env.APPWRITE_MANEUVERS_SUBSECTIONS_COLLECTION_ID;
const MANEUVERS_ARTICLES_COLLECTION_ID = process.env.APPWRITE_MANEUVERS_ARTICLES_COLLECTION_ID;
const PLATFORM_SETTINGS_COLLECTION_ID = process.env.APPWRITE_PLATFORM_SETTINGS_COLLECTION_ID;
const PUSH_SUBSCRIPTIONS_COLLECTION_ID = process.env.APPWRITE_PUSH_SUBSCRIPTIONS_COLLECTION_ID;
const NOTIFICATION_DELIVERIES_COLLECTION_ID = process.env.APPWRITE_NOTIFICATION_DELIVERIES_COLLECTION_ID;
const WEB_PUSH_PUBLIC_KEY = process.env.WEB_PUSH_PUBLIC_KEY || "";
const WEB_PUSH_PRIVATE_KEY = process.env.WEB_PUSH_PRIVATE_KEY || "";
const WEB_PUSH_CONTACT = process.env.WEB_PUSH_CONTACT || "mailto:admin@example.com";
const APP_URL = process.env.APP_URL || "";

const VALID_ROLES = new Set(["admin", "instrutor", "aluno"]);
const VALID_INSTRUCTOR_PREFERENCES = new Set(["low", "medium", "high"]);
const VALID_AVAILABILITY_TYPES = new Set(["available", "preferred"]);
const META_PREFIX = "#GFV_META_V1:";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;
const FLIGHT_SELECT = [
  "$id",
  "$createdAt",
  "$updatedAt",
  "name",
  "source_filename",
  "aircraft_ident",
  "duration_sec",
  "student_user_id",
  "user_id",
  "instructor_user_id",
  "flight_date",
  "start_time",
  "training_track_id",
  "training_stage_id",
  "training_mission_id",
  "training_snapshot_json",
];
const FLIGHT_DETAIL_SELECT = [
  ...FLIGHT_SELECT,
  "csv_text",
];
const PROFILE_SELECT = [
  "$id",
  "user_id",
  "role",
  "email",
  "full_name",
  "cpf",
  "phone",
  "birth_date",
  "weight_kg",
  "height_cm",
  "anac_code",
  "anac_ratings_json",
  "anac_licenses_json",
  "anac_medical_json",
  "anac_photo_file_id",
  "anac_sync_status",
  "anac_sync_error",
  "anac_last_sync_at",
];
const PLAN_SELECT = ["$id", "$updatedAt", "student_id", "week_start", "status", "requested_flights_count", "updated_at", "items_json"];
const AIRCRAFT_SELECT = ["$id", "model_id", "registration", "nickname", "active"];
const AIRCRAFT_MODEL_SELECT = [
  "$id",
  "name",
  "manufacturer",
  "category",
  "op_oil_temp_unit",
  "op_oil_temp_attention",
  "op_oil_temp_danger",
  "op_oil_pressure_attention_psi",
  "op_oil_pressure_danger_psi",
  "op_rpm_attention",
  "op_rpm_danger",
  "op_fuel_pressure_attention_psi",
  "op_fuel_pressure_danger_psi",
  "op_gload_attention",
  "op_gload_danger",
  "op_touchdown_ias_attention_kt",
  "op_touchdown_ias_danger_kt",
  "op_best_climb_after_takeoff_kt",
];
const TELEMETRY_SUMMARY_SELECT = [
  "$id",
  "flight_id",
  "telemetry_present",
  "duration_sec",
  "distance_nm",
  "point_count",
  "takeoff_count",
  "landing_count",
  "tgl_count",
  "smooth_landing_count",
  "medium_landing_count",
  "hard_landing_count",
  "best_touchdown_g",
  "best_touchdown_vert_speed_fpm",
  "slowest_landing_ias_kt",
  "slowest_landing_gs_kt",
  "max_touchdown_g",
  "max_descent_rate_fpm",
  "longest_takeoff_ground_roll_ft",
  "shortest_takeoff_ground_roll_ft",
  "fastest_takeoff_ias_kt",
  "max_headwind_kt",
  "max_tailwind_kt",
  "max_crosswind_kt",
  "aerodrome_count",
  "aerodromes_json",
  "max_oil_pressure_psi",
  "max_oil_temp_f",
  "max_normal_g",
  "max_lateral_g",
  "max_cht_f",
  "max_egt_f",
  "max_rpm",
  "max_map_inhg",
  "max_fuel_flow_gph",
  "max_fuel_pressure_psi",
  "min_fuel_qty",
  "max_oat_c",
];
const LANDING_METRIC_SELECT = ["$id", "flight_id", "td_ias_kt"];
const CREDIT_SELECT = [
  "$id",
  "$createdAt",
  "$updatedAt",
  "user_id",
  "purchase_date",
  "aircraft_model_id",
  "aircraft_model_name",
  "amount_paid",
  "payment_method",
  "payment_installments",
  "validity_days",
  "hours",
  "expires_at",
  "notes",
  "is_night",
  "created_by",
  "updated_by",
];
const DASHBOARD_TELEMETRY_SELECT = [
  "$id",
  "flight_id",
  "student_user_id",
  "instructor_user_id",
  "aircraft_ident",
  "flight_date",
  "duration_sec",
  "distance_nm",
  "telemetry_present",
  "landing_count",
  "takeoff_count",
  "tgl_count",
  "hard_landing_count",
];
const DASHBOARD_ALERT_SELECT = [
  "$id",
  "$createdAt",
  "flight_id",
  "model_id",
  "student_user_id",
  "instructor_user_id",
  "aircraft_ident",
  "flight_date",
  "start_time",
  "severity",
  "rule_name",
  "phase",
  "matched_at",
  "duration_sec",
];
const DASHBOARD_SEVERITIES = ["risco", "atencao", "leve"];
const STUDENT_TRACK_SELECT = [
  "$id",
  "$createdAt",
  "$updatedAt",
  "school_id",
  "student_user_id",
  "track_id",
  "status",
  "is_primary",
  "assigned_at",
  "updated_at",
];
const TRAINING_TRACK_SELECT = [
  "$id",
  "$createdAt",
  "$updatedAt",
  "school_id",
  "name",
  "is_default",
  "is_active",
  "stages_json",
  "mission_count",
  "total_minutes",
  "updated_at",
];

function jsonResponse(res, status, payload) {
  return res.json(payload, status);
}

function normalizeRole(value) {
  return VALID_ROLES.has(value) ? value : "aluno";
}

function deriveRoleFromLabels(labels) {
  const normalized = new Set((labels || []).map((label) => String(label).toLowerCase()));
  if (normalized.has("admin")) return "admin";
  if (normalized.has("instrutor")) return "instrutor";
  return "aluno";
}

function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function clampLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.round(parsed)));
}

function clampOffset(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.max(0, Math.round(parsed));
}

function selectQuery(fields) {
  return typeof sdk.Query.select === "function" ? [sdk.Query.select(fields)] : [];
}

function parseItemsJson(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonList(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value, fallback) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function parseDurationToMinutes(value) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const hhmm = raw.match(/^(\d{1,2}):(\d{1,2})$/);
  if (hhmm) return Number(hhmm[1] || "0") * 60 + Number(hhmm[2] || "0");
  const asDecimal = Number(raw.replace(",", "."));
  return Number.isFinite(asDecimal) && asDecimal > 0 ? Math.round(asDecimal * 60) : 0;
}

function parseMiles(value) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const n = Number(raw.replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function parseTrainingSnapshot(value) {
  const parsed = parseJsonObject(value, null);
  return parsed && typeof parsed === "object" ? parsed : null;
}

function decodeFlightMeta(csvText) {
  const firstLine = String(csvText || "").replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0]?.trim() || "";
  if (!firstLine.startsWith(META_PREFIX)) return null;
  try {
    const encoded = firstLine.slice(META_PREFIX.length).trim();
    return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function flightTrainingMissionIds(doc, meta) {
  const ids = new Set();
  if (doc?.training_mission_id) ids.add(String(doc.training_mission_id));
  const training = meta?.training || {};
  if (training.missionId) ids.add(String(training.missionId));
  for (const id of Array.isArray(training.missionIds) ? training.missionIds : []) {
    if (id) ids.add(String(id));
  }
  for (const snapshot of Array.isArray(training.snapshots) ? training.snapshots : []) {
    if (snapshot?.missionId) ids.add(String(snapshot.missionId));
  }
  return Array.from(ids);
}

function buildRoute(legs) {
  const airports = [];
  for (const leg of legs || []) {
    const dep = String(leg.dep || "").trim().toUpperCase();
    const arr = String(leg.arr || "").trim().toUpperCase();
    if (dep && dep !== "---" && airports[airports.length - 1] !== dep) airports.push(dep);
    if (arr && arr !== "---" && airports[airports.length - 1] !== arr) airports.push(arr);
  }
  return airports.length > 0 ? airports.join(" -> ") : "";
}

function flightDateTimeKey(flight) {
  const date = flight.flightDate || (flight.createdAt || "").slice(0, 10);
  const time = flight.startTime || "23:59";
  return `${date}T${time.length === 5 ? time : "23:59"}:00`;
}

function isFutureFlight(flight) {
  const date = flight.flightDate || (flight.createdAt || "").slice(0, 10);
  if (!date) return false;
  const time = flight.startTime || "23:59";
  const dateTime = new Date(`${date}T${time.length === 5 ? time : "23:59"}:00`);
  return !Number.isNaN(dateTime.getTime()) && dateTime.getTime() > Date.now();
}

function isCompletedFlight(flight) {
  return (flight.durationSec || 0) > 0 && (flight.landings || 0) > 0;
}

function parseInstructorAvailability(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row) =>
        typeof row.dayOfWeek === "number" &&
        (row.period === "morning" || row.period === "afternoon") &&
        VALID_AVAILABILITY_TYPES.has(row.availabilityType),
    );
  } catch {
    return [];
  }
}

function sanitizeInstructorAvailability(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (row) =>
        typeof row.dayOfWeek === "number" &&
        (row.period === "morning" || row.period === "afternoon") &&
        VALID_AVAILABILITY_TYPES.has(row.availabilityType),
    )
    .map((row) => ({
      dayOfWeek: row.dayOfWeek,
      period: row.period,
      availabilityType: row.availabilityType,
    }));
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function asIsoDate(value) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) return todayIso();
  return date.toISOString().slice(0, 10);
}

function addDaysIso(value, days) {
  const date = new Date(`${asIsoDate(value)}T12:00:00`);
  date.setDate(date.getDate() + Math.max(0, Math.round(Number(days) || 0)));
  return date.toISOString().slice(0, 10);
}

function positiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function sanitizeCreditInput(value) {
  const credit = value && typeof value === "object" ? value : {};
  const purchaseDate = asIsoDate(credit.purchaseDate);
  const validityDays = Math.max(0, Math.round(Number(credit.validityDays) || 0));
  const paymentMethod = String(credit.paymentMethod || "").trim();
  const installments =
    typeof credit.paymentInstallments === "number" && credit.paymentInstallments > 0
      ? Math.round(credit.paymentInstallments)
      : null;
  const data = {
    user_id: String(credit.userId || "").trim(),
    purchase_date: purchaseDate,
    aircraft_model_id: String(credit.aircraftModelId || "").trim(),
    aircraft_model_name: String(credit.aircraftModelName || "").trim(),
    amount_paid: positiveNumber(credit.amountPaid),
    payment_method: paymentMethod,
    payment_installments: paymentMethod === "Parcelado" ? installments : null,
    validity_days: validityDays,
    hours: positiveNumber(credit.hours),
    expires_at: addDaysIso(purchaseDate, validityDays),
    notes: String(credit.notes || "").trim() || null,
    is_night: Boolean(credit.isNight ?? false),
  };

  if (!data.user_id) throw Object.assign(new Error("Aluno nao informado."), { status: 400 });
  if (!data.aircraft_model_id || !data.aircraft_model_name) {
    throw Object.assign(new Error("Modelo de aviao nao informado."), { status: 400 });
  }
  if (!data.payment_method) throw Object.assign(new Error("Forma de pagamento nao informada."), { status: 400 });
  if (data.payment_method === "Parcelado" && !data.payment_installments) {
    throw Object.assign(new Error("Informe a quantidade de parcelas."), { status: 400 });
  }
  if (data.hours <= 0) throw Object.assign(new Error("Quantidade de horas invalida."), { status: 400 });
  return data;
}

function creditPermissions(userId) {
  return [
    sdk.Permission.read(sdk.Role.user(userId)),
    sdk.Permission.read(sdk.Role.label("admin")),
    sdk.Permission.read(sdk.Role.label("instrutor")),
    sdk.Permission.update(sdk.Role.label("admin")),
    sdk.Permission.delete(sdk.Role.label("admin")),
  ];
}

async function listAllUsers() {
  const out = [];
  const limit = 100;
  let offset = 0;
  while (true) {
    const res = await users.list({
      queries: [sdk.Query.limit(limit), sdk.Query.offset(offset)],
      total: true,
    });
    out.push(...(res.users || []));
    if (!res.users || res.users.length < limit || out.length >= (res.total || 0)) break;
    offset += limit;
  }
  return out;
}

async function listAllDocuments(collectionId, extraQueries = []) {
  if (!collectionId) return [];
  const out = [];
  const limit = 100;
  let offset = 0;
  while (true) {
    const res = await databases.listDocuments(DATABASE_ID, collectionId, [
      ...extraQueries,
      sdk.Query.limit(limit),
      sdk.Query.offset(offset),
    ]);
    out.push(...(res.documents || []));
    if (!res.documents || res.documents.length < limit || out.length >= (res.total || 0)) break;
    offset += limit;
  }
  return out;
}

async function listDocumentsPage(collectionId, queries = []) {
  if (!collectionId) return { documents: [], total: 0 };
  const res = await databases.listDocuments(DATABASE_ID, collectionId, queries);
  return {
    documents: res.documents || [],
    total: res.total || 0,
  };
}

async function getUsersByIds(userIds) {
  const out = [];
  for (const userId of userIds) {
    try {
      out.push(await users.get({ userId }));
    } catch {
      // A profile can outlive the auth user; ignore it for admin search results.
    }
  }
  return out;
}

async function getProfilesByUserIds(userIds) {
  if (!userIds.length) return new Map();
  const docs = [];
  const batchSize = 50;
  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);
    docs.push(
      ...(await listAllDocuments(PROFILES_COLLECTION_ID, [
        sdk.Query.equal("user_id", batch),
        ...selectQuery(PROFILE_SELECT),
      ])),
    );
  }
  return new Map(docs.map((profile) => [profile.user_id, profile]));
}

async function getInstructorPrefsByUserIds(userIds) {
  if (!INSTRUCTOR_PREFS_COLLECTION_ID || !userIds.length) return new Map();
  const docs = [];
  const batchSize = 50;
  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);
    docs.push(
      ...(await listAllDocuments(INSTRUCTOR_PREFS_COLLECTION_ID, [
        sdk.Query.equal("user_id", batch),
        ...selectQuery(["$id", "user_id", "preference_level", "availability_json"]),
      ])),
    );
  }
  return new Map(docs.map((pref) => [pref.user_id, pref]));
}

async function getFlightsByUserIds(userIds, { includeCsv = false } = {}) {
  if (!FLIGHTS_COLLECTION_ID || !userIds.length) return [];
  const batchSize = 25;
  const byId = new Map();
  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);
    const queryBase = [sdk.Query.orderDesc("flight_date"), ...selectQuery(includeCsv ? FLIGHT_DETAIL_SELECT : FLIGHT_SELECT)];
    const [studentFlights, instructorFlights] = await Promise.all([
      listAllDocuments(FLIGHTS_COLLECTION_ID, [sdk.Query.equal("student_user_id", batch), ...queryBase]),
      listAllDocuments(FLIGHTS_COLLECTION_ID, [sdk.Query.equal("instructor_user_id", batch), ...queryBase]),
    ]);
    for (const flight of [...studentFlights, ...instructorFlights]) byId.set(flight.$id, flight);
  }
  return Array.from(byId.values());
}

async function getPlansByUserIds(userIds) {
  if (!WEEKLY_PLANS_COLLECTION_ID || !userIds.length) return [];
  const docs = [];
  const batchSize = 50;
  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);
    docs.push(
      ...(await listAllDocuments(WEEKLY_PLANS_COLLECTION_ID, [
        sdk.Query.equal("student_id", batch),
        sdk.Query.orderDesc("week_start"),
        ...selectQuery(PLAN_SELECT),
      ])),
    );
  }
  return docs;
}

async function getProfileByUserId(userId) {
  const res = await databases.listDocuments(DATABASE_ID, PROFILES_COLLECTION_ID, [
    sdk.Query.equal("user_id", [userId]),
    sdk.Query.limit(1),
  ]);
  return res.documents[0] || null;
}

async function getInstructorPreferenceByUserId(userId) {
  if (!INSTRUCTOR_PREFS_COLLECTION_ID) return null;
  const res = await databases.listDocuments(DATABASE_ID, INSTRUCTOR_PREFS_COLLECTION_ID, [
    sdk.Query.equal("user_id", [userId]),
    sdk.Query.limit(1),
  ]);
  return res.documents[0] || null;
}

async function requireAdmin(actorUserId) {
  if (!actorUserId) throw Object.assign(new Error("Unauthorized request."), { status: 401 });
  const [profile, actor] = await Promise.all([getProfileByUserId(actorUserId), users.get({ userId: actorUserId })]);
  const profileRole = normalizeRole(profile?.role);
  const labelRole = deriveRoleFromLabels(actor?.labels || []);
  if (profileRole !== "admin" && labelRole !== "admin") {
    throw Object.assign(new Error("Apenas administradores podem acessar usuarios."), { status: 403 });
  }
  return actor;
}

function toFlight(doc) {
  const meta = decodeFlightMeta(doc.csv_text);
  const legs = Array.isArray(meta?.legs) ? meta.legs : [];
  const landings = legs.reduce((acc, leg) => acc + Math.max(0, Math.round(Number(leg.landings) || 0)), 0);
  const totalMinutes = legs.reduce((acc, leg) => acc + parseDurationToMinutes(leg.flightTime), 0);
  const navigationMinutes = legs.reduce((acc, leg) => acc + parseDurationToMinutes(leg.navTime), 0);
  const ifrMinutes = legs.reduce((acc, leg) => acc + parseDurationToMinutes(leg.ifrTime), 0);
  const nightMinutes = legs.reduce((acc, leg) => acc + parseDurationToMinutes(leg.nightTime), 0);
  const distanceNm = legs.reduce((acc, leg) => acc + parseMiles(leg.distance), 0);
  const durationSec =
    typeof doc.duration_sec === "number" && doc.duration_sec > 0
      ? doc.duration_sec
      : totalMinutes > 0
        ? totalMinutes * 60
        : null;
  const snapshot = parseTrainingSnapshot(doc.training_snapshot_json) || meta?.training?.snapshot || null;
  return {
    id: doc.$id,
    createdAt: doc.$createdAt || "",
    updatedAt: doc.$updatedAt || "",
    sourceFilename: doc.source_filename || "",
    aircraftIdent: meta?.header?.aircraft || doc.aircraft_ident || null,
    durationSec,
    flightDate: doc.flight_date || meta?.header?.date || (doc.$createdAt || "").slice(0, 10) || null,
    startTime: doc.start_time || meta?.header?.startTime || null,
    route: buildRoute(legs),
    landings,
    distanceNm: Number(distanceNm.toFixed(1)),
    navigationHours: Number((navigationMinutes / 60).toFixed(2)),
    ifrHours: Number((ifrMinutes / 60).toFixed(2)),
    nightHours: Number((nightMinutes / 60).toFixed(2)),
    navigationDistanceNm: Number(distanceNm.toFixed(1)),
    studentName: meta?.header?.studentName || meta?.header?.studentLabel || "",
    studentAnac: meta?.header?.studentAnac || "",
    instructorName: meta?.header?.instructorName || "",
    instructorAnac: meta?.header?.instructorAnac || "",
    scheduleWeekStart: meta?.schedule?.weekStart || null,
    scheduleDemandId: meta?.schedule?.demandId || null,
    trainingTrackId: doc.training_track_id || meta?.training?.trackId || snapshot?.trackId || null,
    trainingStageId: doc.training_stage_id || meta?.training?.stageId || snapshot?.stageId || null,
    trainingMissionId: doc.training_mission_id || meta?.training?.missionId || snapshot?.missionId || null,
    trainingMissionIds: flightTrainingMissionIds(doc, meta),
    trainingSnapshot: snapshot,
    studentUserId: doc.student_user_id || doc.user_id || null,
    instructorUserId: doc.instructor_user_id || null,
  };
}

function toPlan(doc) {
  const items = parseItemsJson(doc.items_json);
  const totalHours = items.reduce((acc, item) => acc + (Number(item.durationHours) || 0), 0);
  return {
    id: doc.$id,
    weekStart: doc.week_start || "",
    status: doc.status === "submitted" ? "submitted" : "draft",
    requestedFlightsCount: Number(doc.requested_flights_count) || items.length || 0,
    totalHours,
    updatedAt: doc.$updatedAt || doc.updated_at || "",
    items: items.map((item, index) => ({
      position: Number(item.position) || index + 1,
      durationHours: Number(item.durationHours) || 0,
      flexibilityLevel: item.flexibilityLevel || "medium",
      preferredAircraft: item.preferredAircraft || null,
      priorityLevel: Number(item.priorityLevel) || 1,
      notes: item.notes || null,
      availability: Array.isArray(item.availability) ? item.availability : [],
    })),
  };
}

function toProfile(profile, preference) {
  const defaultMedical = {
    classe: "",
    validade: "",
    orgao_expedidor: "",
    observacoes: "",
  };
  return {
    docId: profile?.$id || null,
    fullName: profile?.full_name || "",
    cpf: profile?.cpf || "",
    phone: profile?.phone || "",
    birthDate: profile?.birth_date || "",
    weightKg: typeof profile?.weight_kg === "number" ? profile.weight_kg : null,
    heightCm: typeof profile?.height_cm === "number" ? profile.height_cm : null,
    anacCode: profile?.anac_code || "",
    anacRatings: parseJsonList(profile?.anac_ratings_json),
    anacLicenses: parseJsonList(profile?.anac_licenses_json),
    anacMedical: parseJsonObject(profile?.anac_medical_json, defaultMedical),
    anacPhotoFileId: profile?.anac_photo_file_id || "",
    anacSyncStatus: profile?.anac_sync_status || "",
    anacSyncError: profile?.anac_sync_error || "",
    anacLastSyncAt: profile?.anac_last_sync_at || "",
    instructorPreferenceLevel: VALID_INSTRUCTOR_PREFERENCES.has(preference?.preference_level)
      ? preference.preference_level
      : "medium",
    instructorAvailability: parseInstructorAvailability(preference?.availability_json),
  };
}

function summarizeFlights(flights, plans) {
  const normalizedFlights = flights.map(toFlight).sort((a, b) => flightDateTimeKey(b).localeCompare(flightDateTimeKey(a)));
  const plannedFlights = normalizedFlights
    .filter(isFutureFlight)
    .sort((a, b) => flightDateTimeKey(a).localeCompare(flightDateTimeKey(b)));
  const executedFlights = normalizedFlights.filter(isCompletedFlight);
  const futureIntentions = plans.map(toPlan).sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  const executedHours = executedFlights.reduce((acc, flight) => acc + ((flight.durationSec || 0) / 3600), 0);
  const plannedHours = plannedFlights.reduce((acc, flight) => acc + ((flight.durationSec || 0) / 3600), 0);
  const requestedFlights = futureIntentions.reduce((acc, plan) => acc + plan.requestedFlightsCount, 0);
  const requestedHours = futureIntentions.reduce((acc, plan) => acc + plan.totalHours, 0);
  const landings = executedFlights.reduce((acc, flight) => acc + (flight.landings || 0), 0);
  const navigationHours = executedFlights.reduce((acc, flight) => acc + (flight.navigationHours || 0), 0);
  const ifrHours = executedFlights.reduce((acc, flight) => acc + (flight.ifrHours || 0), 0);
  const nightHours = executedFlights.reduce((acc, flight) => acc + (flight.nightHours || 0), 0);
  const navigationDistanceNm = executedFlights.reduce((acc, flight) => acc + (flight.navigationDistanceNm || 0), 0);

  return {
    executedFlights,
    plannedFlights,
    futureIntentions,
    executed: {
      count: executedFlights.length,
      hours: Number(executedHours.toFixed(1)),
      landings,
      navigationHours: Number(navigationHours.toFixed(1)),
      ifrHours: Number(ifrHours.toFixed(1)),
      nightHours: Number(nightHours.toFixed(1)),
      navigationDistanceNm: Number(navigationDistanceNm.toFixed(1)),
      lastFlightAt: executedFlights[0]?.flightDate || executedFlights[0]?.createdAt || null,
    },
    planned: {
      count: plannedFlights.length,
      hours: Number(plannedHours.toFixed(1)),
      nextFlightAt: plannedFlights[0]?.flightDate || null,
    },
    intentions: {
      count: futureIntentions.length,
      requestedFlights,
      requestedHours: Number(requestedHours.toFixed(1)),
      latestWeekStart: futureIntentions[0]?.weekStart || null,
    },
  };
}

function toUserRecord(user, profile, preference, flights, plans, trainingTracks = []) {
  const role = VALID_ROLES.has(profile?.role) ? profile.role : deriveRoleFromLabels(user.labels || []);
  const profilePayload = toProfile(profile, preference);
  const summary = summarizeFlights(flights, plans);

  return {
    userId: user.$id,
    email: user.email || profile?.email || "",
    name: user.name || "",
    role,
    labels: user.labels || [],
    emailVerification: Boolean(user.emailVerification),
    createdAt: user.$createdAt || "",
    profile: profilePayload,
    executed: summary.executed,
    planned: summary.planned,
    intentions: summary.intentions,
    executedFlights: summary.executedFlights,
    plannedFlights: summary.plannedFlights,
    futureIntentions: summary.futureIntentions,
    flights: summary.executedFlights,
    trainingTracks,
  };
}

function toUserSummary(user, profile, preference, flights, plans, trainingTracks = []) {
  const detail = toUserRecord(user, profile, preference, flights, plans, trainingTracks);
  return {
    userId: detail.userId,
    email: detail.email,
    name: detail.name,
    role: detail.role,
    labels: detail.labels,
    emailVerification: detail.emailVerification,
    createdAt: detail.createdAt,
    profile: {
      docId: detail.profile.docId,
      fullName: detail.profile.fullName,
      cpf: detail.profile.cpf,
      phone: detail.profile.phone,
      anacCode: detail.profile.anacCode,
      anacSyncStatus: detail.profile.anacSyncStatus,
      anacLastSyncAt: detail.profile.anacLastSyncAt,
      instructorPreferenceLevel: detail.profile.instructorPreferenceLevel,
      instructorAvailability: detail.profile.instructorAvailability,
    },
    executed: detail.executed,
    planned: detail.planned,
    intentions: detail.intentions,
    trainingTracks: detail.trainingTracks,
  };
}

function clampInactiveDays(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 14;
  return Math.min(180, Math.max(1, Math.round(parsed)));
}

function daysBetweenIso(fromDate, toDate) {
  if (!fromDate || !toDate) return null;
  const from = new Date(`${String(fromDate).slice(0, 10)}T12:00:00`);
  const to = new Date(`${String(toDate).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86400000));
}

function studentProgressStatus(daysSinceLastFlight, inactiveDays) {
  if (daysSinceLastFlight === null) return "noFlights";
  if (daysSinceLastFlight >= inactiveDays) return "inactive";
  const watchDays = Math.max(7, Math.ceil(inactiveDays * 0.6));
  if (daysSinceLastFlight >= watchDays) return "watch";
  return "active";
}

function sameIsoDay(value, target) {
  return Boolean(value && target && String(value).slice(0, 10) === target);
}

function shiftIsoDay(value, days) {
  const date = new Date(`${asIsoDate(value)}T12:00:00`);
  date.setDate(date.getDate() + Math.round(Number(days) || 0));
  return date.toISOString().slice(0, 10);
}

function weekRangeForIso(value) {
  const date = new Date(`${asIsoDate(value)}T12:00:00`);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  const start = date.toISOString().slice(0, 10);
  date.setDate(date.getDate() + 6);
  return { start, end: date.toISOString().slice(0, 10) };
}

function sumFlightHours(flights) {
  return Number(
    flights.reduce((acc, flight) => acc + ((flight.durationSec || 0) / 3600), 0).toFixed(1),
  );
}

function studentDisplayName(record) {
  return record.profile.fullName || record.name || record.email || record.userId;
}

function primaryTrainingTrack(record) {
  return (record.trainingTracks || []).find((item) => item.isPrimary) || (record.trainingTracks || [])[0] || null;
}

function studentTrainingProgress(record) {
  const assignment = primaryTrainingTrack(record);
  const track = assignment?.track || null;
  if (!assignment || !track) {
    return {
      assignmentId: assignment?.id || null,
      trackId: assignment?.trackId || null,
      trackName: track?.name || "",
      status: assignment?.status || "",
      completedMissions: 0,
      totalMissions: 0,
      percentComplete: 0,
    };
  }
  const completed = new Set();
  const trackMissionIds = new Set();
  for (const stage of track.stages || []) {
    for (const mission of Array.isArray(stage.missions) ? stage.missions : []) {
      if (mission?.id) trackMissionIds.add(String(mission.id));
    }
  }
  for (const flight of record.executedFlights || []) {
    if (flight.trainingTrackId && flight.trainingTrackId !== assignment.trackId) continue;
    for (const missionId of flight.trainingMissionIds || []) {
      if (trackMissionIds.has(String(missionId))) completed.add(String(missionId));
    }
  }
  const totalMissions = trackMissionIds.size || Number(track.missionCount) || 0;
  const percentComplete = totalMissions > 0 ? Math.round((completed.size / totalMissions) * 100) : 0;
  return {
    assignmentId: assignment.id,
    trackId: assignment.trackId,
    trackName: track.name || assignment.trackId,
    status: assignment.status,
    completedMissions: completed.size,
    totalMissions,
    percentComplete: Math.max(0, Math.min(100, percentComplete)),
  };
}

async function studentAlertCounts() {
  const counts = new Map();
  if (!FLIGHT_TELEMETRY_ALERTS_COLLECTION_ID) return counts;
  const alerts = await listAllDocuments(FLIGHT_TELEMETRY_ALERTS_COLLECTION_ID, selectQuery(DASHBOARD_ALERT_SELECT)).catch(() => []);
  for (const alert of alerts) {
    const userId = alert.student_user_id;
    if (!userId) continue;
    if (!counts.has(userId)) counts.set(userId, { risco: 0, atencao: 0, leve: 0 });
    const bucket = counts.get(userId);
    const severity = DASHBOARD_SEVERITIES.includes(alert.severity) ? alert.severity : "leve";
    bucket[severity] += 1;
  }
  return counts;
}

async function getStudentsProgress(payload = {}) {
  const inactiveDays = clampInactiveDays(payload.inactiveDays);
  const today = asIsoDate(payload.today);
  const yesterday = shiftIsoDay(today, -1);
  const tomorrow = shiftIsoDay(today, 1);
  const week = weekRangeForIso(today);
  const [recordsRaw, alertCountsByStudent] = await Promise.all([buildRecords(), studentAlertCounts()]);
  const records = recordsRaw.filter((record) => record.role === "aluno");

  const buckets = {
    yesterday: { key: "yesterday", label: "Ontem", students: 0, flights: 0, hours: 0 },
    today: { key: "today", label: "Hoje", students: 0, flights: 0, hours: 0 },
    tomorrow: { key: "tomorrow", label: "Amanha", students: 0, flights: 0, hours: 0 },
    week: { key: "week", label: "Semana", students: 0, flights: 0, hours: 0 },
  };

  const students = records.map((record) => {
    const executedFlights = record.executedFlights || [];
    const plannedFlights = record.plannedFlights || [];
    const lastFlightDate = record.executed.lastFlightAt;
    const daysSinceLastFlight = lastFlightDate ? daysBetweenIso(lastFlightDate, today) : null;
    const agendaFlights = {
      yesterday: executedFlights.filter((flight) => sameIsoDay(flight.flightDate, yesterday)),
      today: plannedFlights.filter((flight) => sameIsoDay(flight.flightDate, today)),
      tomorrow: plannedFlights.filter((flight) => sameIsoDay(flight.flightDate, tomorrow)),
      week: plannedFlights.filter((flight) => {
        const date = String(flight.flightDate || "").slice(0, 10);
        return date >= week.start && date <= week.end;
      }),
    };
    const agenda = {
      yesterday: { flights: agendaFlights.yesterday.length, hours: sumFlightHours(agendaFlights.yesterday) },
      today: { flights: agendaFlights.today.length, hours: sumFlightHours(agendaFlights.today) },
      tomorrow: { flights: agendaFlights.tomorrow.length, hours: sumFlightHours(agendaFlights.tomorrow) },
      week: { flights: agendaFlights.week.length, hours: sumFlightHours(agendaFlights.week) },
    };

    return {
      userId: record.userId,
      email: record.email,
      name: record.name,
      profile: record.profile,
      status: studentProgressStatus(daysSinceLastFlight, inactiveDays),
      daysSinceLastFlight,
      executed: record.executed,
      planned: record.planned,
      intentions: record.intentions,
      trainingProgress: studentTrainingProgress(record),
      trainingTracks: record.trainingTracks || [],
      alertCounts: alertCountsByStudent.get(record.userId) || { risco: 0, atencao: 0, leve: 0 },
      agenda,
      recentExecutedFlights: executedFlights.slice(0, 6),
      upcomingFlights: plannedFlights.slice(0, 6),
      futureIntentions: (record.futureIntentions || []).slice(0, 6),
    };
  });

  for (const key of Object.keys(buckets)) {
    const bucket = buckets[key];
    for (const student of students) {
      if (student.agenda[key].flights <= 0) continue;
      bucket.students += 1;
      bucket.flights += student.agenda[key].flights;
      bucket.hours += student.agenda[key].hours;
    }
    bucket.hours = Number(bucket.hours.toFixed(1));
  }

  students.sort((a, b) => {
    const statusRank = { inactive: 0, noFlights: 1, watch: 2, active: 3 };
    return statusRank[a.status] - statusRank[b.status]
      || (b.daysSinceLastFlight ?? 9999) - (a.daysSinceLastFlight ?? 9999)
      || studentDisplayName(a).localeCompare(studentDisplayName(b), "pt-BR");
  });

  return {
    generatedAt: new Date().toISOString(),
    today,
    inactiveDays,
    summary: {
      totalStudents: students.length,
      activeStudents: students.filter((student) => student.status === "active").length,
      watchStudents: students.filter((student) => student.status === "watch").length,
      inactiveStudents: students.filter((student) => student.status === "inactive").length,
      studentsWithoutFlights: students.filter((student) => student.status === "noFlights").length,
      totalHours: Number(students.reduce((acc, student) => acc + student.executed.hours, 0).toFixed(1)),
      totalExecutedFlights: students.reduce((acc, student) => acc + student.executed.count, 0),
      totalPlannedFlights: students.reduce((acc, student) => acc + student.planned.count, 0),
    },
    buckets,
    students,
  };
}

function normalizeAircraftIdent(value) {
  return String(value || "").trim().toUpperCase();
}

function parseAerodromes(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function toTelemetrySummary(doc) {
  if (!doc) return null;
  return {
    telemetryPresent: Boolean(doc.telemetry_present),
    telemetryDurationSec: typeof doc.duration_sec === "number" ? doc.duration_sec : null,
    telemetryDistanceNm: typeof doc.distance_nm === "number" ? doc.distance_nm : null,
    pointCount: Number(doc.point_count) || 0,
    takeoffCount: Number(doc.takeoff_count) || 0,
    landingCount: Number(doc.landing_count) || 0,
    tglCount: Number(doc.tgl_count) || 0,
    smoothLandingCount: Number(doc.smooth_landing_count) || 0,
    mediumLandingCount: Number(doc.medium_landing_count) || 0,
    hardLandingCount: Number(doc.hard_landing_count) || 0,
    bestTouchdownG: typeof doc.best_touchdown_g === "number" ? doc.best_touchdown_g : null,
    bestTouchdownVertSpeedFpm:
      typeof doc.best_touchdown_vert_speed_fpm === "number" ? doc.best_touchdown_vert_speed_fpm : null,
    slowestLandingIasKt: typeof doc.slowest_landing_ias_kt === "number" ? doc.slowest_landing_ias_kt : null,
    slowestLandingGsKt: typeof doc.slowest_landing_gs_kt === "number" ? doc.slowest_landing_gs_kt : null,
    fastestLandingIasKt: null,
    maxTouchdownG: typeof doc.max_touchdown_g === "number" ? doc.max_touchdown_g : null,
    maxDescentRateFpm: typeof doc.max_descent_rate_fpm === "number" ? doc.max_descent_rate_fpm : null,
    longestTakeoffGroundRollFt:
      typeof doc.longest_takeoff_ground_roll_ft === "number" ? doc.longest_takeoff_ground_roll_ft : null,
    shortestTakeoffGroundRollFt:
      typeof doc.shortest_takeoff_ground_roll_ft === "number" ? doc.shortest_takeoff_ground_roll_ft : null,
    fastestTakeoffIasKt: typeof doc.fastest_takeoff_ias_kt === "number" ? doc.fastest_takeoff_ias_kt : null,
    maxHeadwindKt: typeof doc.max_headwind_kt === "number" ? doc.max_headwind_kt : null,
    maxTailwindKt: typeof doc.max_tailwind_kt === "number" ? doc.max_tailwind_kt : null,
    maxCrosswindKt: typeof doc.max_crosswind_kt === "number" ? doc.max_crosswind_kt : null,
    aerodromeCount: Number(doc.aerodrome_count) || 0,
    aerodromes: parseAerodromes(doc.aerodromes_json),
    maxOilPressurePsi: typeof doc.max_oil_pressure_psi === "number" ? doc.max_oil_pressure_psi : null,
    maxOilTempF: typeof doc.max_oil_temp_f === "number" ? doc.max_oil_temp_f : null,
    maxNormalG: typeof doc.max_normal_g === "number" ? doc.max_normal_g : null,
    maxLateralG: typeof doc.max_lateral_g === "number" ? doc.max_lateral_g : null,
    maxChtF: typeof doc.max_cht_f === "number" ? doc.max_cht_f : null,
    maxEgtF: typeof doc.max_egt_f === "number" ? doc.max_egt_f : null,
    maxRpm: typeof doc.max_rpm === "number" ? doc.max_rpm : null,
    maxMapInHg: typeof doc.max_map_inhg === "number" ? doc.max_map_inhg : null,
    maxFuelFlowGph: typeof doc.max_fuel_flow_gph === "number" ? doc.max_fuel_flow_gph : null,
    maxFuelPressurePsi: typeof doc.max_fuel_pressure_psi === "number" ? doc.max_fuel_pressure_psi : null,
    minFuelQty: typeof doc.min_fuel_qty === "number" ? doc.min_fuel_qty : null,
    maxOatC: typeof doc.max_oat_c === "number" ? doc.max_oat_c : null,
  };
}

function toOperationalLimits(model) {
  return {
    oilTempUnit: model?.op_oil_temp_unit === "C" ? "C" : "F",
    oilTempAttention: typeof model?.op_oil_temp_attention === "number" ? model.op_oil_temp_attention : null,
    oilTempDanger: typeof model?.op_oil_temp_danger === "number" ? model.op_oil_temp_danger : null,
    oilPressureAttentionPsi:
      typeof model?.op_oil_pressure_attention_psi === "number" ? model.op_oil_pressure_attention_psi : null,
    oilPressureDangerPsi: typeof model?.op_oil_pressure_danger_psi === "number" ? model.op_oil_pressure_danger_psi : null,
    rpmAttention: typeof model?.op_rpm_attention === "number" ? model.op_rpm_attention : null,
    rpmDanger: typeof model?.op_rpm_danger === "number" ? model.op_rpm_danger : null,
    fuelPressureAttentionPsi:
      typeof model?.op_fuel_pressure_attention_psi === "number" ? model.op_fuel_pressure_attention_psi : null,
    fuelPressureDangerPsi:
      typeof model?.op_fuel_pressure_danger_psi === "number" ? model.op_fuel_pressure_danger_psi : null,
    gloadAttention: typeof model?.op_gload_attention === "number" ? model.op_gload_attention : null,
    gloadDanger: typeof model?.op_gload_danger === "number" ? model.op_gload_danger : null,
    touchdownIasAttentionKt:
      typeof model?.op_touchdown_ias_attention_kt === "number" ? model.op_touchdown_ias_attention_kt : null,
    touchdownIasDangerKt:
      typeof model?.op_touchdown_ias_danger_kt === "number" ? model.op_touchdown_ias_danger_kt : null,
    bestClimbAfterTakeoffKt:
      typeof model?.op_best_climb_after_takeoff_kt === "number" ? model.op_best_climb_after_takeoff_kt : null,
  };
}

function userDisplayName(userId, usersById, profilesByUserId, fallback) {
  if (!userId) return fallback || "";
  const profile = profilesByUserId.get(userId);
  const user = usersById.get(userId);
  return profile?.full_name || user?.name || user?.email || fallback || userId;
}

function dashboardOptionalDate(value) {
  const raw = String(value || "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function dashboardStringList(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return Array.from(new Set(values.map((item) => String(item || "").trim()).filter(Boolean)));
}

function dashboardFilters(payload) {
  let fromDate = dashboardOptionalDate(payload.fromDate);
  let toDate = dashboardOptionalDate(payload.toDate);
  if (fromDate && toDate && fromDate > toDate) {
    const previousFromDate = fromDate;
    fromDate = toDate;
    toDate = previousFromDate;
  }
  return {
    fromDate,
    toDate,
    aircrafts: dashboardStringList(payload.aircrafts || payload.aircraft).map(normalizeAircraftIdent),
    models: dashboardStringList(payload.models || payload.modelIds || payload.model),
    instructors: dashboardStringList(payload.instructors || payload.instructorIds || payload.instructor),
    students: dashboardStringList(payload.students || payload.studentIds || payload.student),
    upcomingLimit: Math.min(30, Math.max(1, Math.round(Number(payload.upcomingLimit) || 12))),
    alertLimit: Math.min(15, Math.max(1, Math.round(Number(payload.alertLimit) || 6))),
  };
}

function dashboardDateQueries(attribute, fromDate, toDate) {
  const queries = [];
  if (fromDate) queries.push(sdk.Query.greaterThanEqual(attribute, fromDate));
  if (toDate) queries.push(sdk.Query.lessThanEqual(attribute, toDate));
  return queries;
}

function dashboardEqualQuery(attribute, values) {
  const clean = dashboardStringList(values);
  return clean.length ? [sdk.Query.equal(attribute, clean)] : [];
}

function dashboardNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function dashboardHours(seconds) {
  return Number((dashboardNumber(seconds) / 3600).toFixed(2));
}

function roundDashboardNumber(value, digits = 1) {
  return Number(dashboardNumber(value).toFixed(digits));
}

function dashboardAircraftMeta(aircraftIdent, aircraftByRegistration, modelsById) {
  const ident = normalizeAircraftIdent(aircraftIdent);
  const aircraft = ident ? aircraftByRegistration.get(ident) : null;
  const model = aircraft ? modelsById.get(aircraft.model_id) : null;
  return {
    aircraftIdent: ident || null,
    aircraftId: aircraft?.$id || null,
    aircraftNickname: aircraft?.nickname || null,
    modelId: model?.$id || aircraft?.model_id || null,
    modelName: model?.name || "",
  };
}

function dashboardProfileName(userId, profilesByUserId, fallback = "") {
  if (!userId) return fallback || "";
  const profile = profilesByUserId.get(userId);
  return profile?.full_name || profile?.email || fallback || userId;
}

function dashboardFlightRow(doc, telemetryByFlightId, aircraftByRegistration, modelsById, profilesByUserId) {
  const flight = toFlight(doc);
  const telemetry = toTelemetrySummary(telemetryByFlightId.get(flight.id));
  const meta = dashboardAircraftMeta(flight.aircraftIdent, aircraftByRegistration, modelsById);
  const durationSec = flight.durationSec ?? telemetry?.telemetryDurationSec ?? null;
  const distanceNm = flight.distanceNm || telemetry?.telemetryDistanceNm || 0;
  const landings = Math.max(flight.landings || 0, telemetry?.landingCount || 0);
  const status = isFutureFlight(flight) ? "futuro" : "executado";

  return {
    id: flight.id,
    status,
    flightDate: flight.flightDate,
    startTime: flight.startTime,
    sourceFilename: flight.sourceFilename,
    studentUserId: flight.studentUserId,
    instructorUserId: flight.instructorUserId,
    studentName: dashboardProfileName(flight.studentUserId, profilesByUserId, flight.studentName),
    instructorName: dashboardProfileName(flight.instructorUserId, profilesByUserId, flight.instructorName),
    ...meta,
    durationSec,
    hours: dashboardHours(durationSec),
    landings,
    distanceNm: roundDashboardNumber(distanceNm, 1),
    telemetryPresent: Boolean(telemetry?.telemetryPresent),
    takeoffCount: telemetry?.takeoffCount || 0,
    landingCount: telemetry?.landingCount || 0,
    tglCount: telemetry?.tglCount || 0,
    hardLandingCount: telemetry?.hardLandingCount || 0,
  };
}

function dashboardAlertRow(doc, aircraftByRegistration, modelsById, profilesByUserId) {
  const meta = dashboardAircraftMeta(doc.aircraft_ident, aircraftByRegistration, modelsById);
  const model = doc.model_id ? modelsById.get(doc.model_id) : null;
  return {
    id: doc.$id,
    flightId: doc.flight_id || "",
    severity: DASHBOARD_SEVERITIES.includes(doc.severity) ? doc.severity : "leve",
    ruleName: doc.rule_name || "",
    phase: doc.phase || null,
    matchedAt: doc.matched_at || null,
    flightDate: doc.flight_date || null,
    startTime: doc.start_time || null,
    durationSec: typeof doc.duration_sec === "number" ? doc.duration_sec : null,
    studentUserId: doc.student_user_id || null,
    instructorUserId: doc.instructor_user_id || null,
    studentName: dashboardProfileName(doc.student_user_id, profilesByUserId),
    instructorName: dashboardProfileName(doc.instructor_user_id, profilesByUserId),
    ...meta,
    modelId: doc.model_id || meta.modelId,
    modelName: model?.name || meta.modelName,
    createdAt: doc.$createdAt || "",
  };
}

function rowMatchesDashboardFilters(row, filters) {
  if (filters.aircrafts.length && !filters.aircrafts.includes(normalizeAircraftIdent(row.aircraftIdent))) return false;
  if (filters.models.length && !filters.models.includes(row.modelId || "") && !filters.models.includes(row.modelName || "")) return false;
  if (filters.instructors.length && !filters.instructors.includes(row.instructorUserId || "")) return false;
  if (filters.students.length && !filters.students.includes(row.studentUserId || "")) return false;
  return true;
}

async function listProfilesForDashboard(userIds) {
  const cleanIds = Array.from(new Set(userIds.filter(Boolean)));
  if (!cleanIds.length || !PROFILES_COLLECTION_ID) return [];
  const profiles = [];
  for (let index = 0; index < cleanIds.length; index += 100) {
    const chunk = cleanIds.slice(index, index + 100);
    profiles.push(
      ...(await listAllDocuments(PROFILES_COLLECTION_ID, [
        sdk.Query.equal("user_id", chunk),
        ...selectQuery(PROFILE_SELECT),
      ])),
    );
  }
  return profiles;
}

async function listDashboardAlertBuckets(filters) {
  const empty = DASHBOARD_SEVERITIES.reduce((acc, severity) => {
    acc[severity] = { total: 0, documents: [] };
    return acc;
  }, {});
  if (!FLIGHT_TELEMETRY_ALERTS_COLLECTION_ID) return empty;

  const baseQueries = [
    ...dashboardDateQueries("flight_date", filters.fromDate, filters.toDate),
    ...dashboardEqualQuery("model_id", filters.models),
    ...dashboardEqualQuery("aircraft_ident", filters.aircrafts),
    ...dashboardEqualQuery("instructor_user_id", filters.instructors),
    ...dashboardEqualQuery("student_user_id", filters.students),
  ];

  const entries = await Promise.all(
    DASHBOARD_SEVERITIES.map(async (severity) => {
      const page = await listDocumentsPage(FLIGHT_TELEMETRY_ALERTS_COLLECTION_ID, [
        ...baseQueries,
        sdk.Query.equal("severity", [severity]),
        sdk.Query.orderDesc("flight_date"),
        sdk.Query.limit(filters.alertLimit),
        ...selectQuery(DASHBOARD_ALERT_SELECT),
      ]);
      return [severity, { total: page.total, documents: page.documents }];
    }),
  );

  return Object.fromEntries(entries);
}

function makeAircraftDashboardRow(aircraft, model) {
  const ident = normalizeAircraftIdent(aircraft?.registration);
  return {
    aircraftId: aircraft?.$id || null,
    aircraftIdent: ident || null,
    aircraftNickname: aircraft?.nickname || null,
    modelId: model?.$id || aircraft?.model_id || null,
    modelName: model?.name || "",
    active: aircraft?.active !== false,
  };
}

function ensureAircraftBucket(map, base) {
  const key = normalizeAircraftIdent(base.aircraftIdent) || "SEM_AVIAO";
  if (!map.has(key)) {
    map.set(key, {
      ...base,
      aircraftIdent: base.aircraftIdent || "Sem aviao",
      hoursToday: 0,
      hoursNext2Days: 0,
      hoursNext5Days: 0,
      hoursNext7Days: 0,
      futureFlightsToday: 0,
      futureFlightsNext2Days: 0,
      futureFlightsNext5Days: 0,
      futureFlights7Days: 0,
      nextFlightAt: null,
      executedFlights: 0,
      futureFlights: 0,
      executedHours: 0,
      landings: 0,
      distanceNm: 0,
      hardLandingCount: 0,
      telemetryFlights: 0,
      alertCounts: { risco: 0, atencao: 0, leve: 0 },
    });
  }
  return map.get(key);
}

function buildAircraftDashboard({ aircrafts, modelsById, forecastRows, periodRows, alertRows, today }) {
  const buckets = new Map();
  for (const aircraft of aircrafts) {
    const model = aircraft.model_id ? modelsById.get(aircraft.model_id) : null;
    ensureAircraftBucket(buckets, makeAircraftDashboardRow(aircraft, model));
  }

  const next2End = addDaysIso(today, 1);
  const next5End = addDaysIso(today, 4);
  const next7End = addDaysIso(today, 6);

  for (const row of forecastRows) {
    const bucket = ensureAircraftBucket(buckets, row);
    const date = row.flightDate || "";
    const hours = row.hours || 0;
    if (date === today) {
      bucket.hoursToday += hours;
      bucket.futureFlightsToday += 1;
    }
    if (date >= today && date <= next2End) {
      bucket.hoursNext2Days += hours;
      bucket.futureFlightsNext2Days += 1;
    }
    if (date >= today && date <= next5End) {
      bucket.hoursNext5Days += hours;
      bucket.futureFlightsNext5Days += 1;
    }
    if (date >= today && date <= next7End) {
      bucket.hoursNext7Days += hours;
      bucket.futureFlights7Days += 1;
    }
    const dateTime = flightDateTimeKey(row);
    if (!bucket.nextFlightAt || dateTime < bucket.nextFlightAt) bucket.nextFlightAt = dateTime;
  }

  for (const row of periodRows) {
    const bucket = ensureAircraftBucket(buckets, row);
    if (row.status === "futuro") {
      bucket.futureFlights += 1;
      continue;
    }
    bucket.executedFlights += 1;
    bucket.executedHours += row.hours || 0;
    bucket.landings += row.landings || 0;
    bucket.distanceNm += row.distanceNm || 0;
    bucket.hardLandingCount += row.hardLandingCount || 0;
    if (row.telemetryPresent) bucket.telemetryFlights += 1;
  }

  for (const alert of alertRows) {
    const bucket = ensureAircraftBucket(buckets, alert);
    bucket.alertCounts[alert.severity] += 1;
  }

  return Array.from(buckets.values())
    .map((row) => ({
      ...row,
      hoursToday: roundDashboardNumber(row.hoursToday, 1),
      hoursNext2Days: roundDashboardNumber(row.hoursNext2Days, 1),
      hoursNext5Days: roundDashboardNumber(row.hoursNext5Days, 1),
      hoursNext7Days: roundDashboardNumber(row.hoursNext7Days, 1),
      executedHours: roundDashboardNumber(row.executedHours, 1),
      distanceNm: roundDashboardNumber(row.distanceNm, 1),
    }))
    .sort((a, b) => b.hoursNext7Days - a.hoursNext7Days || b.executedHours - a.executedHours || a.aircraftIdent.localeCompare(b.aircraftIdent));
}

async function getDashboardSummary(payload = {}) {
  const filters = dashboardFilters(payload);
  const today = todayIso();
  const next7End = addDaysIso(today, 6);

  const [aircrafts, models] = await Promise.all([
    listAllDocuments(AIRCRAFTS_COLLECTION_ID, selectQuery(AIRCRAFT_SELECT)),
    listAllDocuments(AIRCRAFT_MODELS_COLLECTION_ID, selectQuery(AIRCRAFT_MODEL_SELECT)),
  ]);

  const modelsById = new Map(models.map((model) => [model.$id, model]));
  const aircraftByRegistration = new Map(
    aircrafts.map((aircraft) => [normalizeAircraftIdent(aircraft.registration), aircraft]),
  );

  const flightFilterQueries = [
    ...dashboardDateQueries("flight_date", filters.fromDate, filters.toDate),
    ...dashboardEqualQuery("aircraft_ident", filters.aircrafts),
    ...dashboardEqualQuery("instructor_user_id", filters.instructors),
    ...dashboardEqualQuery("student_user_id", filters.students),
  ];
  const telemetryFilterQueries = [
    ...dashboardDateQueries("flight_date", filters.fromDate, filters.toDate),
    ...dashboardEqualQuery("aircraft_ident", filters.aircrafts),
    ...dashboardEqualQuery("instructor_user_id", filters.instructors),
    ...dashboardEqualQuery("student_user_id", filters.students),
  ];
  const creditFilterQueries = [
    ...dashboardDateQueries("purchase_date", filters.fromDate, filters.toDate),
    ...dashboardEqualQuery("aircraft_model_id", filters.models),
    ...dashboardEqualQuery("user_id", filters.students),
  ];

  const [
    periodFlightDocs,
    upcomingPage,
    forecastFlightDocs,
    telemetryDocs,
    creditDocs,
    alertBucketsRaw,
  ] = await Promise.all([
    listAllDocuments(FLIGHTS_COLLECTION_ID, [
      ...flightFilterQueries,
      sdk.Query.orderDesc("flight_date"),
      ...selectQuery(FLIGHT_SELECT),
    ]),
    listDocumentsPage(FLIGHTS_COLLECTION_ID, [
      sdk.Query.greaterThanEqual("flight_date", today),
      ...dashboardEqualQuery("aircraft_ident", filters.aircrafts),
      ...dashboardEqualQuery("instructor_user_id", filters.instructors),
      ...dashboardEqualQuery("student_user_id", filters.students),
      sdk.Query.orderAsc("flight_date"),
      sdk.Query.limit(100),
      ...selectQuery(FLIGHT_SELECT),
    ]),
    listAllDocuments(FLIGHTS_COLLECTION_ID, [
      sdk.Query.greaterThanEqual("flight_date", today),
      sdk.Query.lessThanEqual("flight_date", next7End),
      ...dashboardEqualQuery("aircraft_ident", filters.aircrafts),
      ...dashboardEqualQuery("instructor_user_id", filters.instructors),
      ...dashboardEqualQuery("student_user_id", filters.students),
      ...selectQuery(FLIGHT_SELECT),
    ]),
    listAllDocuments(FLIGHT_TELEMETRY_SUMMARIES_COLLECTION_ID, [
      ...telemetryFilterQueries,
      ...selectQuery(DASHBOARD_TELEMETRY_SELECT),
    ]),
    listAllDocuments(STUDENT_CREDITS_COLLECTION_ID, [
      ...creditFilterQueries,
      ...selectQuery(CREDIT_SELECT),
    ]),
    listDashboardAlertBuckets(filters),
  ]);

  const telemetryByFlightId = new Map(telemetryDocs.map((doc) => [doc.flight_id, doc]));
  const alertDocs = DASHBOARD_SEVERITIES.flatMap((severity) => alertBucketsRaw[severity]?.documents || []);
  const userIds = [
    ...periodFlightDocs.flatMap((doc) => [doc.student_user_id || doc.user_id, doc.instructor_user_id]),
    ...upcomingPage.documents.flatMap((doc) => [doc.student_user_id || doc.user_id, doc.instructor_user_id]),
    ...forecastFlightDocs.flatMap((doc) => [doc.student_user_id || doc.user_id, doc.instructor_user_id]),
    ...alertDocs.flatMap((doc) => [doc.student_user_id, doc.instructor_user_id]),
  ];
  const profiles = await listProfilesForDashboard(userIds);
  const profilesByUserId = new Map(profiles.map((profile) => [profile.user_id, profile]));

  const periodRows = periodFlightDocs
    .map((doc) => dashboardFlightRow(doc, telemetryByFlightId, aircraftByRegistration, modelsById, profilesByUserId))
    .filter((row) => rowMatchesDashboardFilters(row, filters));
  const futureRowsForOperationalCounts = upcomingPage.documents
    .map((doc) => dashboardFlightRow(doc, telemetryByFlightId, aircraftByRegistration, modelsById, profilesByUserId))
    .filter((row) => row.status === "futuro" && rowMatchesDashboardFilters(row, filters));
  const upcomingRows = futureRowsForOperationalCounts
    .slice()
    .filter((row) => row.status === "futuro" && rowMatchesDashboardFilters(row, filters))
    .sort((a, b) => flightDateTimeKey(a).localeCompare(flightDateTimeKey(b)))
    .slice(0, filters.upcomingLimit);
  const forecastRows = forecastFlightDocs
    .map((doc) => dashboardFlightRow(doc, telemetryByFlightId, aircraftByRegistration, modelsById, profilesByUserId))
    .filter((row) => row.status === "futuro" && rowMatchesDashboardFilters(row, filters));
  const alertRows = alertDocs.map((doc) => dashboardAlertRow(doc, aircraftByRegistration, modelsById, profilesByUserId));

  const executedRows = periodRows.filter((row) => row.status === "executado");
  const futureRows = periodRows.filter((row) => row.status === "futuro");
  const alertCounts = DASHBOARD_SEVERITIES.reduce((acc, severity) => {
    acc[severity] = alertBucketsRaw[severity]?.total || 0;
    return acc;
  }, {});
  const finance = {
    amountPaid: roundDashboardNumber(creditDocs.reduce((acc, doc) => acc + dashboardNumber(doc.amount_paid), 0), 2),
    purchasedHours: roundDashboardNumber(creditDocs.reduce((acc, doc) => acc + dashboardNumber(doc.hours), 0), 1),
    purchasesCount: creditDocs.length,
  };
  const aircraftRows = buildAircraftDashboard({
    aircrafts,
    modelsById,
    forecastRows,
    periodRows,
    alertRows,
    today,
  });

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      aircrafts: filters.aircrafts,
      models: filters.models,
      instructors: filters.instructors,
      students: filters.students,
    },
    summary: {
      totalFlights: periodRows.length,
      executedFlights: executedRows.length,
      futureFlights: futureRows.length,
      executedHours: roundDashboardNumber(executedRows.reduce((acc, row) => acc + row.hours, 0), 1),
      plannedHours: roundDashboardNumber(futureRows.reduce((acc, row) => acc + row.hours, 0), 1),
      landings: executedRows.reduce((acc, row) => acc + row.landings, 0),
      distanceNm: roundDashboardNumber(executedRows.reduce((acc, row) => acc + row.distanceNm, 0), 1),
      studentsActive: new Set(periodRows.map((row) => row.studentUserId).filter(Boolean)).size,
      instructorsActive: new Set(periodRows.map((row) => row.instructorUserId).filter(Boolean)).size,
      aircraftActive: new Set(periodRows.map((row) => row.aircraftIdent).filter(Boolean)).size,
      telemetryFlights: executedRows.filter((row) => row.telemetryPresent).length,
      flightsWithoutTelemetry: executedRows.filter((row) => !row.telemetryPresent).length,
      futureFlightsWithoutInstructor: futureRowsForOperationalCounts.filter((row) => !row.instructorUserId).length,
      hardLandingCount: executedRows.reduce((acc, row) => acc + row.hardLandingCount, 0),
      alerts: alertCounts,
      revenue: finance.amountPaid,
    },
    finance,
    upcomingFlights: {
      total: upcomingPage.total,
      items: upcomingRows,
    },
    alertsBySeverity: Object.fromEntries(
      DASHBOARD_SEVERITIES.map((severity) => [
        severity,
        {
          total: alertBucketsRaw[severity]?.total || 0,
          items: (alertBucketsRaw[severity]?.documents || []).map((doc) =>
            dashboardAlertRow(doc, aircraftByRegistration, modelsById, profilesByUserId),
          ),
        },
      ]),
    ),
    aircraftForecast: aircraftRows.map((row) => ({
      aircraftId: row.aircraftId,
      aircraftIdent: row.aircraftIdent,
      aircraftNickname: row.aircraftNickname,
      modelId: row.modelId,
      modelName: row.modelName,
      active: row.active,
      hoursToday: row.hoursToday,
      hoursNext2Days: row.hoursNext2Days,
      hoursNext5Days: row.hoursNext5Days,
      hoursNext7Days: row.hoursNext7Days,
      futureFlightsToday: row.futureFlightsToday,
      futureFlightsNext2Days: row.futureFlightsNext2Days,
      futureFlightsNext5Days: row.futureFlightsNext5Days,
      futureFlights7Days: row.futureFlights7Days,
      nextFlightAt: row.nextFlightAt,
    })),
    aircraftUtilization: aircraftRows.map((row) => ({
      aircraftId: row.aircraftId,
      aircraftIdent: row.aircraftIdent,
      aircraftNickname: row.aircraftNickname,
      modelId: row.modelId,
      modelName: row.modelName,
      active: row.active,
      executedFlights: row.executedFlights,
      futureFlights: row.futureFlights,
      executedHours: row.executedHours,
      landings: row.landings,
      distanceNm: row.distanceNm,
      hardLandingCount: row.hardLandingCount,
      telemetryFlights: row.telemetryFlights,
      alertCounts: row.alertCounts,
    })),
  };
}

async function listFlightReports() {
  const [usersList, profiles, flights, aircrafts, models, telemetrySummaries, landingMetrics] = await Promise.all([
    listAllUsers(),
    listAllDocuments(PROFILES_COLLECTION_ID, selectQuery(PROFILE_SELECT)),
    listAllDocuments(FLIGHTS_COLLECTION_ID, [sdk.Query.orderDesc("flight_date"), ...selectQuery(FLIGHT_DETAIL_SELECT)]),
    listAllDocuments(AIRCRAFTS_COLLECTION_ID, selectQuery(AIRCRAFT_SELECT)),
    listAllDocuments(AIRCRAFT_MODELS_COLLECTION_ID, selectQuery(AIRCRAFT_MODEL_SELECT)),
    listAllDocuments(FLIGHT_TELEMETRY_SUMMARIES_COLLECTION_ID, selectQuery(TELEMETRY_SUMMARY_SELECT)),
    listAllDocuments(FLIGHT_LANDINGS_COLLECTION_ID, selectQuery(LANDING_METRIC_SELECT)),
  ]);

  const usersById = new Map(usersList.map((user) => [user.$id, user]));
  const profilesByUserId = new Map(profiles.map((profile) => [profile.user_id, profile]));
  const modelsById = new Map(models.map((model) => [model.$id, model]));
  const aircraftByRegistration = new Map(
    aircrafts.map((aircraft) => [normalizeAircraftIdent(aircraft.registration), aircraft]),
  );
  const telemetryByFlightId = new Map(telemetrySummaries.map((doc) => [doc.flight_id, doc]));
  const fastestLandingIasByFlightId = new Map();
  for (const landing of landingMetrics) {
    if (!landing.flight_id || typeof landing.td_ias_kt !== "number") continue;
    fastestLandingIasByFlightId.set(
      landing.flight_id,
      Math.max(fastestLandingIasByFlightId.get(landing.flight_id) ?? Number.NEGATIVE_INFINITY, landing.td_ias_kt),
    );
  }

  const rows = flights.map((doc) => {
    const flight = toFlight(doc);
    const aircraftIdent = normalizeAircraftIdent(flight.aircraftIdent);
    const aircraft = aircraftByRegistration.get(aircraftIdent);
    const model = aircraft ? modelsById.get(aircraft.model_id) : null;
    const telemetry = toTelemetrySummary(telemetryByFlightId.get(flight.id));
    if (telemetry && fastestLandingIasByFlightId.has(flight.id)) {
      telemetry.fastestLandingIasKt = fastestLandingIasByFlightId.get(flight.id);
    }
    const status = isFutureFlight(flight) ? "futuro" : "executado";
    const durationSec = flight.durationSec ?? telemetry?.telemetryDurationSec ?? null;
    const distanceNm = flight.distanceNm || telemetry?.telemetryDistanceNm || 0;

    return {
      ...flight,
      status,
      aircraftIdent: aircraftIdent || flight.aircraftIdent || null,
      aircraftNickname: aircraft?.nickname || null,
      aircraftId: aircraft?.$id || null,
      modelId: model?.$id || null,
      modelName: model?.name || "",
      modelManufacturer: model?.manufacturer || "",
      operationalLimits: toOperationalLimits(model),
      durationSec,
      hours: durationSec ? Number((durationSec / 3600).toFixed(2)) : 0,
      distanceNm: Number(distanceNm.toFixed(1)),
      studentName: userDisplayName(flight.studentUserId, usersById, profilesByUserId, flight.studentName),
      instructorName: userDisplayName(flight.instructorUserId, usersById, profilesByUserId, flight.instructorName),
      telemetry,
    };
  });

  return {
    flights: rows.sort((a, b) => flightDateTimeKey(b).localeCompare(flightDateTimeKey(a))),
  };
}

function groupDataByUserId(flights, plans) {
  const flightsByUser = new Map();
  const plansByUser = new Map();

  for (const flight of flights) {
    const userIds = [flight.student_user_id || flight.user_id, flight.instructor_user_id].filter(Boolean);
    for (const userId of new Set(userIds)) {
      const list = flightsByUser.get(userId) || [];
      list.push(flight);
      flightsByUser.set(userId, list);
    }
  }

  for (const plan of plans) {
    const userId = plan.student_id;
    if (!userId) continue;
    const list = plansByUser.get(userId) || [];
    list.push(plan);
    plansByUser.set(userId, list);
  }

  return { flightsByUser, plansByUser };
}

function matchesSearch(record, search) {
  const needle = normalizeSearch(search);
  if (!needle) return true;
  const haystack = normalizeSearch(
    [
      record.email,
      record.name,
      record.userId,
      record.role,
      record.profile.fullName,
      record.profile.cpf,
      record.profile.phone,
      record.profile.anacCode,
    ].join(" "),
  );
  return haystack.includes(needle);
}

async function buildRecords({ search = "", onlyUserId = null } = {}) {
  const [allUsers, profiles, instructorPrefs, flights, plans] = await Promise.all([
    onlyUserId ? users.get({ userId: onlyUserId }).then((user) => [user]) : listAllUsers(),
    listAllDocuments(PROFILES_COLLECTION_ID),
    listAllDocuments(INSTRUCTOR_PREFS_COLLECTION_ID),
    listAllDocuments(FLIGHTS_COLLECTION_ID),
    listAllDocuments(WEEKLY_PLANS_COLLECTION_ID),
  ]);

  const profileByUserId = new Map(profiles.map((profile) => [profile.user_id, profile]));
  const instructorPrefByUserId = new Map(instructorPrefs.map((pref) => [pref.user_id, pref]));
  const { flightsByUser, plansByUser } = groupDataByUserId(flights, plans);
  const trainingByUserId = await getTrainingAssignmentsByUserIds(allUsers.map((user) => user.$id));

  return allUsers
    .map((user) => {
      const profile = profileByUserId.get(user.$id) || null;
      const preference = instructorPrefByUserId.get(user.$id) || null;
      return toUserRecord(
        user,
        profile,
        preference,
        flightsByUser.get(user.$id) || [],
        plansByUser.get(user.$id) || [],
        trainingByUserId.get(user.$id) || [],
      );
    })
    .filter((record) => matchesSearch(record, search))
    .sort((a, b) => {
      const aName = a.profile.fullName || a.name || a.email;
      const bName = b.profile.fullName || b.name || b.email;
      return aName.localeCompare(bName, "pt-BR");
    });
}

async function findProfileSearchUserIds(search) {
  const needle = normalizeSearch(search);
  if (!needle) return [];
  const profiles = await listAllDocuments(PROFILES_COLLECTION_ID, [
    ...selectQuery(["$id", "user_id", "full_name", "cpf", "phone", "anac_code", "email", "role"]),
  ]);
  return profiles
    .filter((profile) =>
      normalizeSearch([profile.full_name, profile.cpf, profile.phone, profile.anac_code, profile.email, profile.user_id].join(" ")).includes(
        needle,
      ),
    )
    .map((profile) => profile.user_id)
    .filter(Boolean);
}

function toTrainingTrack(doc) {
  if (!doc) return null;
  const stages = parseJsonList(doc.stages_json);
  return {
    id: doc.$id,
    schoolId: doc.school_id || "",
    name: doc.name || "",
    isDefault: doc.is_default !== false,
    isActive: doc.is_active !== false,
    stages,
    missionCount: Number(doc.mission_count) || stages.reduce((acc, stage) => acc + (Array.isArray(stage.missions) ? stage.missions.length : 0), 0),
    totalMinutes: Number(doc.total_minutes) || 0,
    updatedAt: doc.updated_at || doc.$updatedAt || "",
    createdAt: doc.$createdAt || "",
  };
}

async function getTrainingAssignmentsByUserIds(userIds = []) {
  const result = new Map();
  const cleanIds = Array.from(new Set(userIds.filter(Boolean)));
  if (!cleanIds.length || !STUDENT_TRACKS_COLLECTION_ID || !TRAINING_TRACKS_COLLECTION_ID) return result;

  const assignments = [];
  for (let index = 0; index < cleanIds.length; index += 100) {
    const chunk = cleanIds.slice(index, index + 100);
    assignments.push(
      ...(await listAllDocuments(STUDENT_TRACKS_COLLECTION_ID, [
        sdk.Query.equal("student_user_id", chunk),
        ...selectQuery(STUDENT_TRACK_SELECT),
      ]).catch(() => [])),
    );
  }

  const tracks = await listAllDocuments(TRAINING_TRACKS_COLLECTION_ID, selectQuery(TRAINING_TRACK_SELECT)).catch(() => []);
  const tracksById = new Map(tracks.map((doc) => [doc.$id, toTrainingTrack(doc)]));

  for (const doc of assignments) {
    const userId = doc.student_user_id;
    if (!userId) continue;
    const list = result.get(userId) || [];
    list.push({
      id: doc.$id,
      schoolId: doc.school_id || "",
      studentUserId: userId,
      trackId: doc.track_id || "",
      status: ["active", "completed", "paused"].includes(doc.status) ? doc.status : "active",
      isPrimary: Boolean(doc.is_primary),
      assignedAt: doc.assigned_at || doc.$createdAt || "",
      updatedAt: doc.updated_at || doc.$updatedAt || "",
      track: tracksById.get(doc.track_id) || null,
    });
    result.set(userId, list);
  }

  for (const list of result.values()) {
    list.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.assignedAt.localeCompare(b.assignedAt));
  }

  return result;
}

async function listSummaries({ search = "", limit = DEFAULT_LIMIT, offset = 0 } = {}) {
  const safeLimit = clampLimit(limit);
  const safeOffset = clampOffset(offset);
  const needle = normalizeSearch(search);
  let pageUsers = [];
  let total = 0;

  if (needle) {
    const [authRes, profileUserIds] = await Promise.all([
      users.list({
        search: String(search || "").trim(),
        queries: [sdk.Query.limit(MAX_LIMIT), sdk.Query.offset(0)],
        total: true,
      }).catch(() => ({ users: [], total: 0 })),
      findProfileSearchUserIds(search),
    ]);
    const authUsers = authRes.users || [];
    const existingIds = new Set(authUsers.map((user) => user.$id));
    const extraIds = profileUserIds.filter((userId) => !existingIds.has(userId));
    const extraUsers = await getUsersByIds(extraIds);
    const allMatches = [...authUsers, ...extraUsers].sort((a, b) => {
      const aName = a.name || a.email || a.$id;
      const bName = b.name || b.email || b.$id;
      return aName.localeCompare(bName, "pt-BR");
    });
    total = allMatches.length;
    pageUsers = allMatches.slice(safeOffset, safeOffset + safeLimit);
  } else {
    const res = await users.list({
      queries: [sdk.Query.limit(safeLimit), sdk.Query.offset(safeOffset)],
      total: true,
    });
    pageUsers = res.users || [];
    total = res.total || pageUsers.length;
  }

  const userIds = pageUsers.map((user) => user.$id);
  const [profileByUserId, prefByUserId, flights, plans] = await Promise.all([
    getProfilesByUserIds(userIds),
    getInstructorPrefsByUserIds(userIds),
    getFlightsByUserIds(userIds, { includeCsv: false }),
    getPlansByUserIds(userIds),
  ]);
  const trainingByUserId = await getTrainingAssignmentsByUserIds(userIds);
  const { flightsByUser, plansByUser } = groupDataByUserId(flights, plans);
  const usersPage = pageUsers.map((user) =>
    toUserSummary(
      user,
      profileByUserId.get(user.$id) || null,
      prefByUserId.get(user.$id) || null,
      flightsByUser.get(user.$id) || [],
      plansByUser.get(user.$id) || [],
      trainingByUserId.get(user.$id) || [],
    ),
  );

  return {
    users: usersPage,
    total,
    limit: safeLimit,
    offset: safeOffset,
  };
}

async function getUserDetail(targetUserId) {
  if (!targetUserId) {
    throw Object.assign(new Error("Usuario nao informado."), { status: 400 });
  }
  const user = await users.get({ userId: targetUserId });
  const [[profileByUserId, prefByUserId], flights, plans, trainingByUserId] = await Promise.all([
    Promise.all([getProfilesByUserIds([targetUserId]), getInstructorPrefsByUserIds([targetUserId])]),
    getFlightsByUserIds([targetUserId], { includeCsv: true }),
    getPlansByUserIds([targetUserId]),
    getTrainingAssignmentsByUserIds([targetUserId]),
  ]);
  return toUserRecord(
    user,
    profileByUserId.get(targetUserId) || null,
    prefByUserId.get(targetUserId) || null,
    flights,
    plans,
    trainingByUserId.get(targetUserId) || [],
  );
}

async function upsertProfile(userId, email, role) {
  const existing = await getProfileByUserId(userId);
  const data = { user_id: userId, email, role };

  if (existing) {
    await databases.updateDocument(DATABASE_ID, PROFILES_COLLECTION_ID, existing.$id, data);
    return existing.$id;
  }

  const created = await databases.createDocument(
    DATABASE_ID,
    PROFILES_COLLECTION_ID,
    sdk.ID.unique(),
    data,
    [
      sdk.Permission.read(sdk.Role.users()),
      sdk.Permission.read(sdk.Role.user(userId)),
      sdk.Permission.update(sdk.Role.user(userId)),
      sdk.Permission.delete(sdk.Role.user(userId)),
      sdk.Permission.read(sdk.Role.label("admin")),
      sdk.Permission.update(sdk.Role.label("admin")),
      sdk.Permission.delete(sdk.Role.label("admin")),
      sdk.Permission.read(sdk.Role.label("instrutor")),
    ],
  );
  return created.$id;
}

async function updateRole(actorUserId, targetUserId, role) {
  if (!VALID_ROLES.has(role)) {
    throw Object.assign(new Error("Permissao invalida."), { status: 400 });
  }
  if (!targetUserId) {
    throw Object.assign(new Error("Usuario nao informado."), { status: 400 });
  }
  if (actorUserId === targetUserId && role !== "admin") {
    throw Object.assign(new Error("Nao e permitido remover sua propria permissao de admin."), { status: 400 });
  }

  const user = await users.get({ userId: targetUserId });
  const labels = Array.from(
    new Set([...(user.labels || []).filter((label) => !VALID_ROLES.has(String(label).toLowerCase())), role]),
  );
  await users.updateLabels({ userId: targetUserId, labels });
  await upsertProfile(targetUserId, user.email || "", role);

  return getUserDetail(targetUserId);
}

async function updateInstructorPreferences(targetUserId, preferenceLevel, availability) {
  if (!targetUserId) {
    throw Object.assign(new Error("Usuario nao informado."), { status: 400 });
  }
  if (!VALID_INSTRUCTOR_PREFERENCES.has(preferenceLevel)) {
    throw Object.assign(new Error("Preferencia de instrutor invalida."), { status: 400 });
  }
  const user = await users.get({ userId: targetUserId });
  await upsertProfile(targetUserId, user.email || "", "instrutor");
  if (!INSTRUCTOR_PREFS_COLLECTION_ID) {
    throw Object.assign(new Error("Colecao de preferencias de instrutor nao configurada."), { status: 500 });
  }
  const existing = await getInstructorPreferenceByUserId(targetUserId);
  const data = {
    user_id: targetUserId,
    preference_level: preferenceLevel,
    availability_json: JSON.stringify(sanitizeInstructorAvailability(availability)),
  };
  if (existing) {
    await databases.updateDocument(DATABASE_ID, INSTRUCTOR_PREFS_COLLECTION_ID, existing.$id, data);
  } else {
    await databases.createDocument(DATABASE_ID, INSTRUCTOR_PREFS_COLLECTION_ID, sdk.ID.unique(), data, [
      sdk.Permission.read(sdk.Role.users()),
      sdk.Permission.read(sdk.Role.label("admin")),
      sdk.Permission.update(sdk.Role.label("admin")),
      sdk.Permission.delete(sdk.Role.label("admin")),
    ]);
  }
  return getUserDetail(targetUserId);
}

async function createCredit(actorUserId, creditInput) {
  if (!STUDENT_CREDITS_COLLECTION_ID) {
    throw Object.assign(new Error("Colecao de creditos nao configurada."), { status: 500 });
  }
  const data = sanitizeCreditInput(creditInput);
  await users.get({ userId: data.user_id });
  const doc = await databases.createDocument(
    DATABASE_ID,
    STUDENT_CREDITS_COLLECTION_ID,
    sdk.ID.unique(),
    {
      ...data,
      created_by: actorUserId,
      updated_by: actorUserId,
    },
    creditPermissions(data.user_id),
  );
  return doc;
}

async function updateCredit(actorUserId, creditId, creditInput) {
  if (!STUDENT_CREDITS_COLLECTION_ID) {
    throw Object.assign(new Error("Colecao de creditos nao configurada."), { status: 500 });
  }
  if (!creditId) throw Object.assign(new Error("Credito nao informado."), { status: 400 });
  const data = sanitizeCreditInput(creditInput);
  const existing = await databases.getDocument(DATABASE_ID, STUDENT_CREDITS_COLLECTION_ID, creditId, selectQuery(CREDIT_SELECT));
  if (existing.user_id && existing.user_id !== data.user_id) {
    throw Object.assign(new Error("Credito nao pertence ao aluno selecionado."), { status: 400 });
  }
  return databases.updateDocument(
    DATABASE_ID,
    STUDENT_CREDITS_COLLECTION_ID,
    creditId,
    {
      ...data,
      updated_by: actorUserId,
    },
  );
}

async function deleteCredit(creditId, userId) {
  if (!STUDENT_CREDITS_COLLECTION_ID) {
    throw Object.assign(new Error("Colecao de creditos nao configurada."), { status: 500 });
  }
  if (!creditId) throw Object.assign(new Error("Credito nao informado."), { status: 400 });
  const existing = await databases.getDocument(DATABASE_ID, STUDENT_CREDITS_COLLECTION_ID, creditId, selectQuery(CREDIT_SELECT));
  if (userId && existing.user_id && existing.user_id !== userId) {
    throw Object.assign(new Error("Credito nao pertence ao aluno selecionado."), { status: 400 });
  }
  await databases.deleteDocument(DATABASE_ID, STUDENT_CREDITS_COLLECTION_ID, creditId);
}

function maneuverCollectionId(kind) {
  if (kind === "section") return MANEUVERS_SECTIONS_COLLECTION_ID;
  if (kind === "subsection") return MANEUVERS_SUBSECTIONS_COLLECTION_ID;
  if (kind === "article") return MANEUVERS_ARTICLES_COLLECTION_ID;
  return "";
}

function sanitizeManeuverData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw Object.assign(new Error("Dados da manobra nao informados."), { status: 400 });
  }
  return data;
}

async function createManeuverDocument(kind, data) {
  const collectionId = maneuverCollectionId(kind);
  if (!collectionId) throw Object.assign(new Error("Colecao de manobras nao configurada."), { status: 500 });
  return databases.createDocument(DATABASE_ID, collectionId, sdk.ID.unique(), sanitizeManeuverData(data));
}

async function updateManeuverDocument(kind, documentId, data) {
  const collectionId = maneuverCollectionId(kind);
  if (!collectionId) throw Object.assign(new Error("Colecao de manobras nao configurada."), { status: 500 });
  if (!documentId) throw Object.assign(new Error("Documento de manobra nao informado."), { status: 400 });
  return databases.updateDocument(DATABASE_ID, collectionId, documentId, sanitizeManeuverData(data));
}

async function deleteManeuverDocument(kind, documentId) {
  const collectionId = maneuverCollectionId(kind);
  if (!collectionId) throw Object.assign(new Error("Colecao de manobras nao configurada."), { status: 500 });
  if (!documentId) throw Object.assign(new Error("Documento de manobra nao informado."), { status: 400 });
  await databases.deleteDocument(DATABASE_ID, collectionId, documentId);
}

const EMAIL_SETTINGS_KEY = "email";
const EMAIL_BRAND_SETTINGS_KEY = "emailBrand";
const SCHOOL_RULES_KEY = "schoolRules";
const NOTIFICATION_CHANNELS = ["email", "push"];
const STUDENT_PORTAL_TABS = ["home", "jornada", "meus-voos", "agendamento", "creditos", "avisos", "manuais", "manobras", "perfil"];
const NOTIFICATION_EVENT_TYPES = ["flight.scheduled", "flight.updated", "flight.cancelled", "weeklyPlan.submitted", "notice.published"];
const ADMIN_DOC_PERMS = [
  sdk.Permission.read(sdk.Role.label("admin")),
  sdk.Permission.update(sdk.Role.label("admin")),
  sdk.Permission.delete(sdk.Role.label("admin")),
];

function cleanString(value) {
  return String(value || "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function endpointHash(endpoint) {
  return crypto.createHash("sha256").update(String(endpoint || "")).digest("hex");
}

function normalizeAbsoluteUrl(value) {
  const raw = cleanString(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function resolveActionUrl(value, brand) {
  const raw = cleanString(value);
  const base = normalizeAbsoluteUrl(brand?.appUrl) || normalizeAbsoluteUrl(APP_URL);
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw && base) {
    try {
      return new URL(raw.startsWith("/") ? raw : `/${raw}`, `${base}/`).toString();
    } catch {
      return base;
    }
  }
  return base;
}

function defaultEmailSettings() {
  return {
    enabled: false,
    fromName: "",
    fromEmail: "",
    replyTo: "",
    subjectPrefix: "",
    resendApiKey: "",
  };
}

function defaultEmailBrandSettings() {
  return {
    schoolName: "Garmin Flight Viewer",
    logoUrl: "",
    logoFileId: null,
    primaryColor: "#0ea5e9",
    accentColor: "#10b981",
    appUrl: normalizeAbsoluteUrl(APP_URL),
    supportEmail: "",
    footerText: "Este é um email automático da plataforma.",
  };
}

function defaultSchoolRules() {
  return {
    studentTabs: Object.fromEntries(STUDENT_PORTAL_TABS.map((tab) => [tab, true])),
    theme: {
      primaryColor: "#10b981",
      accentColor: "#38bdf8",
      backgroundColor: "#020617",
      surfaceColor: "#0f172a",
    },
    schedule: {
      minRequestHours: 1,
      maxRequestHours: 4,
      allowStudentFlightIntentions: true,
      requireCreditsForIntentions: false,
      allowNightFlights: false,
      nightFlightStartHour: 18,
    },
    emailNotifications: Object.fromEntries(
      NOTIFICATION_EVENT_TYPES.map((eventType) => [eventType, { enabled: true, customNotice: "" }]),
    ),
  };
}

function publicEmailSettings(settings, updatedAt) {
  return {
    enabled: Boolean(settings.enabled),
    fromName: cleanString(settings.fromName),
    fromEmail: cleanString(settings.fromEmail),
    replyTo: cleanString(settings.replyTo),
    subjectPrefix: cleanString(settings.subjectPrefix),
    apiKeyConfigured: Boolean(cleanString(settings.resendApiKey)),
    updatedAt: updatedAt || null,
  };
}

function publicEmailBrandSettings(settings, updatedAt) {
  const defaults = defaultEmailBrandSettings();
  return {
    schoolName: cleanString(settings.schoolName) || defaults.schoolName,
    logoUrl: cleanString(settings.logoUrl),
    logoFileId: cleanString(settings.logoFileId) || null,
    primaryColor: cleanString(settings.primaryColor) || defaults.primaryColor,
    accentColor: cleanString(settings.accentColor) || defaults.accentColor,
    appUrl: normalizeAbsoluteUrl(settings.appUrl) || defaults.appUrl,
    supportEmail: cleanString(settings.supportEmail),
    footerText: cleanString(settings.footerText) || defaults.footerText,
    updatedAt: updatedAt || null,
  };
}

function logBrandDebug(log, message, details = {}) {
  if (typeof log !== "function") return;
  log(`[gfv:brand] ${message} ${JSON.stringify(details)}`);
}

function summarizePublicBrandSettings(settings) {
  return {
    schoolName: settings.schoolName || "",
    hasLogoUrl: Boolean(cleanString(settings.logoUrl)),
    logoUrl: cleanString(settings.logoUrl),
    hasLogoDataUrl: Boolean(settings.logoDataUrl && String(settings.logoDataUrl).startsWith("data:image/")),
    logoDataUrlLength: settings.logoDataUrl ? String(settings.logoDataUrl).length : 0,
    logoFileId: settings.logoFileId || null,
    updatedAt: settings.updatedAt || null,
  };
}

async function logoUrlToDataUrl(logoUrl, log) {
  const url = cleanString(logoUrl);
  if (!url) {
    logBrandDebug(log, "logoUrlToDataUrl skipped because logoUrl is empty");
    return null;
  }
  if (url.startsWith("data:image/")) {
    logBrandDebug(log, "logoUrlToDataUrl received data URL", { dataUrlLength: url.length });
    return url;
  }
  try {
    logBrandDebug(log, "fetching logo URL from function runtime", { url });
    const response = await fetch(url);
    if (!response.ok) {
      logBrandDebug(log, "logo URL fetch returned non-ok", { url, status: response.status });
      return null;
    }
    const contentType = response.headers.get("content-type") || "image/png";
    if (!contentType.startsWith("image/")) {
      logBrandDebug(log, "logo URL fetch returned non-image content", { url, contentType });
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const dataUrl = `data:${contentType};base64,${base64}`;
    logBrandDebug(log, "logo URL converted to data URL", {
      url,
      contentType,
      bytes: arrayBuffer.byteLength,
      dataUrlLength: dataUrl.length,
    });
    return dataUrl;
  } catch (err) {
    logBrandDebug(log, "logo URL conversion failed", {
      url,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function publicEmailBrandSettingsWithLogo(settings, updatedAt, log) {
  const publicSettings = publicEmailBrandSettings(settings, updatedAt);
  const brandSettings = {
    ...publicSettings,
    logoDataUrl: await logoUrlToDataUrl(publicSettings.logoUrl, log),
  };
  logBrandDebug(log, "public brand settings prepared", summarizePublicBrandSettings(brandSettings));
  return brandSettings;
}

function sanitizeEmailSettingsInput(input) {
  const settings = input && typeof input === "object" ? input : {};
  return {
    enabled: Boolean(settings.enabled),
    fromName: cleanString(settings.fromName).slice(0, 120),
    fromEmail: cleanString(settings.fromEmail).slice(0, 255),
    replyTo: cleanString(settings.replyTo).slice(0, 255),
    subjectPrefix: cleanString(settings.subjectPrefix).slice(0, 80),
    resendApiKey: cleanString(settings.resendApiKey),
  };
}

function sanitizeHexColor(value, fallback) {
  const raw = cleanString(value);
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw : fallback;
}

function sanitizeEmailBrandSettingsInput(input) {
  const settings = input && typeof input === "object" ? input : {};
  const defaults = defaultEmailBrandSettings();
  return {
    schoolName: cleanString(settings.schoolName).slice(0, 120) || defaults.schoolName,
    logoUrl: cleanString(settings.logoUrl).slice(0, 2048),
    logoFileId: cleanString(settings.logoFileId).slice(0, 64) || null,
    primaryColor: sanitizeHexColor(settings.primaryColor, defaults.primaryColor),
    accentColor: sanitizeHexColor(settings.accentColor, defaults.accentColor),
    appUrl: normalizeAbsoluteUrl(settings.appUrl),
    supportEmail: cleanString(settings.supportEmail).slice(0, 255),
    footerText: cleanString(settings.footerText).slice(0, 500) || defaults.footerText,
  };
}

function sanitizeHours(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(parsed * 2) / 2;
}

function publicSchoolRules(settings, updatedAt) {
  const defaults = defaultSchoolRules();
  const minRequestHours = Math.max(0.5, sanitizeHours(settings?.schedule?.minRequestHours, defaults.schedule.minRequestHours));
  const maxRequestHours = Math.max(
    minRequestHours,
    sanitizeHours(settings?.schedule?.maxRequestHours, defaults.schedule.maxRequestHours),
  );
  return {
    studentTabs: Object.fromEntries(
      STUDENT_PORTAL_TABS.map((tab) => [tab, Boolean(settings?.studentTabs?.[tab] ?? defaults.studentTabs[tab])]),
    ),
    theme: {
      primaryColor: sanitizeHexColor(settings?.theme?.primaryColor, defaults.theme.primaryColor),
      accentColor: sanitizeHexColor(settings?.theme?.accentColor, defaults.theme.accentColor),
      backgroundColor: sanitizeHexColor(settings?.theme?.backgroundColor, defaults.theme.backgroundColor),
      surfaceColor: sanitizeHexColor(settings?.theme?.surfaceColor, defaults.theme.surfaceColor),
    },
    schedule: {
      minRequestHours,
      maxRequestHours,
      allowStudentFlightIntentions: Boolean(
        settings?.schedule?.allowStudentFlightIntentions ?? defaults.schedule.allowStudentFlightIntentions,
      ),
      requireCreditsForIntentions: Boolean(
        settings?.schedule?.requireCreditsForIntentions ?? defaults.schedule.requireCreditsForIntentions,
      ),
      allowNightFlights: Boolean(
        settings?.schedule?.allowNightFlights ?? defaults.schedule.allowNightFlights,
      ),
      nightFlightStartHour: (() => {
        const h = Number(settings?.schedule?.nightFlightStartHour ?? defaults.schedule.nightFlightStartHour);
        return Number.isFinite(h) && h >= 0 && h <= 23 ? Math.round(h) : defaults.schedule.nightFlightStartHour;
      })(),
    },
    emailNotifications: Object.fromEntries(
      NOTIFICATION_EVENT_TYPES.map((eventType) => [
        eventType,
        {
          enabled: Boolean(settings?.emailNotifications?.[eventType]?.enabled ?? true),
          customNotice: cleanString(settings?.emailNotifications?.[eventType]?.customNotice).slice(0, 500),
        },
      ]),
    ),
    updatedAt: updatedAt || null,
  };
}

function sanitizeSchoolRulesInput(input) {
  return publicSchoolRules(input && typeof input === "object" ? input : {}, null);
}

async function getSettingDoc(key) {
  if (!PLATFORM_SETTINGS_COLLECTION_ID) return null;
  const res = await databases.listDocuments(DATABASE_ID, PLATFORM_SETTINGS_COLLECTION_ID, [
    sdk.Query.equal("key", [key]),
    sdk.Query.limit(1),
  ]);
  return res.documents[0] || null;
}

async function loadEmailSettings() {
  const doc = await getSettingDoc(EMAIL_SETTINGS_KEY);
  if (!doc) return { settings: defaultEmailSettings(), publicSettings: publicEmailSettings(defaultEmailSettings(), null), doc: null };
  const settings = parseJsonObject(doc.settings_json, defaultEmailSettings());
  return {
    settings,
    publicSettings: publicEmailSettings(settings, doc.$updatedAt || null),
    doc,
  };
}

async function loadEmailBrandSettings() {
  const doc = await getSettingDoc(EMAIL_BRAND_SETTINGS_KEY);
  if (!doc) {
    const defaults = defaultEmailBrandSettings();
    return { settings: defaults, publicSettings: publicEmailBrandSettings(defaults, null), doc: null };
  }
  const settings = parseJsonObject(doc.settings_json, defaultEmailBrandSettings());
  return {
    settings,
    publicSettings: publicEmailBrandSettings(settings, doc.$updatedAt || null),
    doc,
  };
}

async function loadSchoolRules() {
  const doc = await getSettingDoc(SCHOOL_RULES_KEY);
  if (!doc) {
    const defaults = defaultSchoolRules();
    return { settings: defaults, publicSettings: publicSchoolRules(defaults, null), doc: null };
  }
  const settings = parseJsonObject(doc.settings_json, defaultSchoolRules());
  return {
    settings,
    publicSettings: publicSchoolRules(settings, doc.$updatedAt || null),
    doc,
  };
}

async function saveEmailSettings(input) {
  if (!PLATFORM_SETTINGS_COLLECTION_ID) {
    throw Object.assign(new Error("Colecao de configuracoes da plataforma nao configurada."), { status: 500 });
  }
  const current = await loadEmailSettings();
  const next = sanitizeEmailSettingsInput(input);
  const settings = {
    enabled: next.enabled,
    fromName: next.fromName,
    fromEmail: next.fromEmail,
    replyTo: next.replyTo,
    subjectPrefix: next.subjectPrefix,
    resendApiKey: next.resendApiKey || current.settings.resendApiKey || "",
  };
  const data = { key: EMAIL_SETTINGS_KEY, settings_json: JSON.stringify(settings) };
  const doc = current.doc
    ? await databases.updateDocument(DATABASE_ID, PLATFORM_SETTINGS_COLLECTION_ID, current.doc.$id, data)
    : await databases.createDocument(
        DATABASE_ID,
        PLATFORM_SETTINGS_COLLECTION_ID,
        sdk.ID.unique(),
        data,
        ADMIN_DOC_PERMS,
      );
  return publicEmailSettings(settings, doc.$updatedAt || null);
}

async function saveEmailBrandSettings(input) {
  if (!PLATFORM_SETTINGS_COLLECTION_ID) {
    throw Object.assign(new Error("Colecao de configuracoes da plataforma nao configurada."), { status: 500 });
  }
  const settings = sanitizeEmailBrandSettingsInput(input);
  const data = { key: EMAIL_BRAND_SETTINGS_KEY, settings_json: JSON.stringify(settings) };
  const current = await loadEmailBrandSettings();
  const doc = current.doc
    ? await databases.updateDocument(DATABASE_ID, PLATFORM_SETTINGS_COLLECTION_ID, current.doc.$id, data)
    : await databases.createDocument(
        DATABASE_ID,
        PLATFORM_SETTINGS_COLLECTION_ID,
        sdk.ID.unique(),
        data,
        ADMIN_DOC_PERMS,
      );
  return publicEmailBrandSettings(settings, doc.$updatedAt || null);
}

async function saveSchoolRules(input) {
  if (!PLATFORM_SETTINGS_COLLECTION_ID) {
    throw Object.assign(new Error("Colecao de configuracoes da plataforma nao configurada."), { status: 500 });
  }
  const sanitized = sanitizeSchoolRulesInput(input);
  const { updatedAt, ...settings } = sanitized;
  const data = { key: SCHOOL_RULES_KEY, settings_json: JSON.stringify(settings) };
  const current = await loadSchoolRules();
  const doc = current.doc
    ? await databases.updateDocument(DATABASE_ID, PLATFORM_SETTINGS_COLLECTION_ID, current.doc.$id, data)
    : await databases.createDocument(
        DATABASE_ID,
        PLATFORM_SETTINGS_COLLECTION_ID,
        sdk.ID.unique(),
        data,
        ADMIN_DOC_PERMS,
      );
  return publicSchoolRules(settings, doc.$updatedAt || null);
}

async function getUserMapByIds(userIds) {
  const out = new Map();
  for (const userId of Array.from(new Set(userIds.filter(Boolean)))) {
    try {
      out.set(userId, await users.get({ userId }));
    } catch {
      // Ignore stale references.
    }
  }
  return out;
}

async function listAllProfileUserIds() {
  const profiles = await listAllDocuments(PROFILES_COLLECTION_ID);
  return Array.from(new Set(profiles.map((doc) => doc.user_id).filter(Boolean)));
}

async function getFlightContext(flightId) {
  if (!flightId || !FLIGHTS_COLLECTION_ID) return null;
  const doc = await databases.getDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, flightId);
  const meta = decodeFlightMeta(doc.csv_text || "");
  return {
    id: doc.$id,
    studentUserId: doc.student_user_id || doc.user_id || meta?.header?.studentUserId || null,
    instructorUserId: doc.instructor_user_id || meta?.header?.instructorUserId || null,
    aircraft: doc.aircraft_ident || meta?.header?.aircraft || "",
    flightDate: doc.flight_date || meta?.header?.date || "",
    startTime: doc.start_time || meta?.header?.startTime || "",
  };
}

function formatFlightWhen(flight, data) {
  const date = cleanString(data.flightDate) || cleanString(flight?.flightDate);
  const time = cleanString(data.startTime) || cleanString(flight?.startTime);
  if (date && time) return `${date} ${time}`;
  return date || time || "horário a confirmar";
}

function buildNotificationMessage(event, flight) {
  const type = cleanString(event.eventType);
  const data = event.data && typeof event.data === "object" ? event.data : {};
  const aircraft = cleanString(data.aircraft) || cleanString(flight?.aircraft) || "aeronave a definir";
  const when = formatFlightWhen(flight, data);
  const url = cleanString(data.url) || APP_URL;
  if (type === "flight.scheduled") {
    return {
      eyebrow: "Agenda de voo",
      title: "Voo agendado",
      intro: "Um novo voo foi confirmado para você.",
      body: `Seu voo em ${aircraft} foi agendado para ${when}.`,
      details: [
        ["Aeronave", aircraft],
        ["Data e horário", when],
      ],
      ctaLabel: "Ver voo",
      url,
    };
  }
  if (type === "flight.updated") {
    return {
      eyebrow: "Atualização operacional",
      title: "Voo alterado",
      intro: "Houve uma alteração em um voo da sua agenda.",
      body: `Confira os dados atualizados do voo em ${aircraft} previsto para ${when}.`,
      details: [
        ["Aeronave", aircraft],
        ["Data e horário", when],
      ],
      ctaLabel: "Conferir alteração",
      url,
    };
  }
  if (type === "flight.cancelled") {
    return {
      eyebrow: "Atualização operacional",
      title: "Voo cancelado",
      intro: "Um voo da sua agenda foi cancelado.",
      body: `O voo em ${aircraft} previsto para ${when} foi cancelado.`,
      details: [
        ["Aeronave", aircraft],
        ["Data e horário", when],
      ],
      ctaLabel: "Abrir plataforma",
      url,
    };
  }
  if (type === "weeklyPlan.submitted") {
    const weekStart = cleanString(data.weekStart);
    const count = Number(data.requestedFlightsCount || 0);
    return {
      eyebrow: "Planejamento semanal",
      title: "Intenção de voo enviada",
      intro: "Recebemos sua solicitação de voos para a semana.",
      body: `Recebemos sua intenção${count > 0 ? ` com ${count} voo(s)` : ""}${weekStart ? ` para a semana de ${weekStart}` : ""}. A coordenação usará essas informações para montar a escala.`,
      details: [
        ["Semana", weekStart || "A confirmar"],
        ["Voos solicitados", count > 0 ? String(count) : "Não informado"],
      ],
      ctaLabel: "Ver planejamento",
      url,
    };
  }
  if (type === "notice.published") {
    return {
      eyebrow: "Comunicado da escola",
      title: cleanString(data.title) || "Novo aviso",
      intro: "A escola publicou um novo aviso.",
      body: stripTags(cleanString(data.contentMd)).slice(0, 320) || "Há um novo aviso publicado pela escola.",
      details: [],
      ctaLabel: cleanString(data.ctaUrl) ? "Abrir aviso" : "Ver avisos",
      url: cleanString(data.ctaUrl) || url,
    };
  }
  return {
    eyebrow: "Notificação",
    title: "Nova notificação",
    intro: "Há uma atualização disponível.",
    body: "Há uma atualização disponível na plataforma.",
    details: [],
    ctaLabel: "Abrir plataforma",
    url,
  };
}

function emailSubject(settings, message) {
  const prefix = cleanString(settings.subjectPrefix);
  return prefix ? `${prefix} ${message.title}` : message.title;
}

function isLightHex(hex) {
  const normalized = cleanString(hex).replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return false;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160;
}

function emailHtml(message, brand) {
  const primary = brand.primaryColor || "#0ea5e9";
  const accent = brand.accentColor || "#10b981";
  const buttonTextColor = isLightHex(primary) ? "#0f172a" : "#ffffff";
  const logo = cleanString(brand.logoUrl);
  const actionUrl = resolveActionUrl(message.url, brand);
  const customNotice = cleanString(message.customNotice);
  const detailsHtml = Array.isArray(message.details) && message.details.length > 0
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border-collapse:separate;border-spacing:0 10px">
        ${message.details
          .map(([label, value]) => `
            <tr>
              <td style="width:38%;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-right:0;border-radius:12px 0 0 12px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.04em">${escapeHtml(label)}</td>
              <td style="padding:12px 14px;background:#ffffff;border:1px solid #e2e8f0;border-radius:0 12px 12px 0;color:#0f172a;font-size:14px;font-weight:700">${escapeHtml(value)}</td>
            </tr>
          `)
          .join("")}
      </table>
    `
    : "";
  return `
    <div style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 12px">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 16px 40px rgba(15,23,42,.10)">
              <tr>
                <td style="padding:0;background:${escapeHtml(primary)}">
                  <div style="height:8px;background:${escapeHtml(accent)}"></div>
                  <div style="padding:28px 32px;color:${buttonTextColor}">
                    ${logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(brand.schoolName)}" style="display:block;max-width:180px;max-height:72px;margin-bottom:18px;border:0" />` : ""}
                    <div style="font-size:12px;text-transform:uppercase;letter-spacing:.12em;font-weight:800;opacity:.86">${escapeHtml(message.eyebrow || brand.schoolName)}</div>
                    <h1 style="margin:8px 0 0;font-size:30px;line-height:1.15;font-weight:800">${escapeHtml(message.title)}</h1>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:32px">
                  <p style="margin:0 0 12px;color:#334155;font-size:17px;line-height:1.55;font-weight:700">${escapeHtml(message.intro || "")}</p>
                  <p style="margin:0;color:#475569;font-size:15px;line-height:1.7">${escapeHtml(message.body)}</p>
                  ${
                    customNotice
                      ? `<div style="margin-top:20px;padding:14px 16px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0;color:#334155;font-size:14px;line-height:1.6">${escapeHtml(customNotice)}</div>`
                      : ""
                  }
                  ${detailsHtml}
                  ${
                    actionUrl
                      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:26px">
                          <tr>
                            <td style="border-radius:14px;background:${escapeHtml(primary)}">
                              <a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:14px 22px;color:${buttonTextColor};text-decoration:none;font-weight:800;font-size:14px;border-radius:14px">
                                ${escapeHtml(message.ctaLabel || "Abrir plataforma")}
                              </a>
                            </td>
                          </tr>
                        </table>`
                      : ""
                  }
                </td>
              </tr>
              <tr>
                <td style="padding:22px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.6">
                  <strong style="color:#334155">${escapeHtml(brand.schoolName)}</strong><br />
                  ${escapeHtml(brand.footerText || "Este é um email automático da plataforma.")}
                  ${brand.supportEmail ? `<br />Suporte: <a href="mailto:${escapeHtml(brand.supportEmail)}" style="color:${escapeHtml(primary)}">${escapeHtml(brand.supportEmail)}</a>` : ""}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}

async function alreadyDelivered(dedupeKey, channel, recipientUserId) {
  if (!NOTIFICATION_DELIVERIES_COLLECTION_ID) return false;
  const res = await databases.listDocuments(DATABASE_ID, NOTIFICATION_DELIVERIES_COLLECTION_ID, [
    sdk.Query.equal("dedupe_key", [dedupeKey]),
    sdk.Query.equal("channel", [channel]),
    sdk.Query.equal("recipient_user_id", [recipientUserId]),
    sdk.Query.limit(1),
  ]);
  return res.total > 0;
}

async function logDelivery(eventType, dedupeKey, channel, recipientUserId, status, providerMessageId, error) {
  if (!NOTIFICATION_DELIVERIES_COLLECTION_ID) return;
  await databases.createDocument(
    DATABASE_ID,
    NOTIFICATION_DELIVERIES_COLLECTION_ID,
    sdk.ID.unique(),
    {
      event_type: eventType,
      channel,
      recipient_user_id: recipientUserId,
      dedupe_key: dedupeKey,
      status,
      provider_message_id: providerMessageId || null,
      error: error ? String(error).slice(0, 2048) : null,
      created_at: nowIso(),
    },
    ADMIN_DOC_PERMS,
  );
}

async function sendEmailToUser(settings, brand, user, message) {
  const apiKey = cleanString(settings.resendApiKey);
  const fromEmail = cleanString(settings.fromEmail);
  if (!settings.enabled) return { status: "skipped", reason: "Email desabilitado." };
  if (!apiKey || !fromEmail) return { status: "skipped", reason: "Resend nao configurado." };
  if (!user?.email) return { status: "skipped", reason: "Usuario sem email." };
  const resend = new Resend(apiKey);
  const fromName = cleanString(settings.fromName);
  const result = await resend.emails.send({
    from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
    to: [user.email],
    replyTo: cleanString(settings.replyTo) || undefined,
    subject: emailSubject(settings, message),
    text: message.body,
    html: emailHtml(message, brand),
  });
  if (result?.error) throw new Error(result.error.message || "Falha no Resend.");
  return { status: "sent", providerMessageId: result?.data?.id || null };
}

async function listPushSubscriptions(userId) {
  if (!PUSH_SUBSCRIPTIONS_COLLECTION_ID) return [];
  const res = await databases.listDocuments(DATABASE_ID, PUSH_SUBSCRIPTIONS_COLLECTION_ID, [
    sdk.Query.equal("user_id", [userId]),
    sdk.Query.equal("enabled", [true]),
    sdk.Query.limit(100),
  ]);
  return res.documents;
}

async function sendPushToUser(userId, message) {
  if (!WEB_PUSH_PUBLIC_KEY || !WEB_PUSH_PRIVATE_KEY) return { status: "skipped", reason: "Web Push nao configurado." };
  webpush.setVapidDetails(WEB_PUSH_CONTACT, WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY);
  const subscriptions = await listPushSubscriptions(userId);
  if (subscriptions.length === 0) return { status: "skipped", reason: "Nenhum dispositivo inscrito." };
  const payload = JSON.stringify({ title: message.title, body: message.body, url: message.url || APP_URL });
  let sent = 0;
  let lastError = null;
  for (const doc of subscriptions) {
    try {
      await webpush.sendNotification({ endpoint: doc.endpoint, keys: parseJsonObject(doc.keys_json, {}) }, payload);
      sent += 1;
    } catch (err) {
      lastError = err;
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await databases.updateDocument(DATABASE_ID, PUSH_SUBSCRIPTIONS_COLLECTION_ID, doc.$id, { enabled: false });
      }
    }
  }
  if (sent > 0) return { status: "sent" };
  throw lastError || new Error("Falha ao enviar push.");
}

async function isAdmin(actorUserId) {
  try {
    await requireAdmin(actorUserId);
    return true;
  } catch {
    return false;
  }
}

async function dispatchNotificationEvent(actorUserId, event) {
  const safeEvent = event && typeof event === "object" ? event : {};
  const eventType = cleanString(safeEvent.eventType);
  const dedupeKey = cleanString(safeEvent.dedupeKey);
  if (!eventType || !dedupeKey) throw Object.assign(new Error("Evento ou chave de deduplicacao nao informados."), { status: 400 });

  const admin = await isAdmin(actorUserId);
  let flight = null;
  let recipients = Array.isArray(safeEvent.recipientUserIds)
    ? safeEvent.recipientUserIds.map(cleanString).filter(Boolean)
    : [];
  if (eventType === "notice.published") {
    if (!admin) throw Object.assign(new Error("Apenas admin pode disparar aviso."), { status: 403 });
    if (recipients.length === 0) recipients = await listAllProfileUserIds();
  } else if (eventType === "weeklyPlan.submitted") {
    if (recipients.length === 0 && actorUserId) recipients = [actorUserId];
  } else if (safeEvent.flightId) {
    flight = await getFlightContext(safeEvent.flightId);
    recipients = [flight?.studentUserId, flight?.instructorUserId].filter(Boolean);
    if (!admin && !recipients.includes(actorUserId)) {
      throw Object.assign(new Error("Sem permissao para disparar notificacao deste voo."), { status: 403 });
    }
  } else if (!admin) {
    throw Object.assign(new Error("Apenas admin pode disparar este evento."), { status: 403 });
  }
  recipients = Array.from(new Set(recipients));

  const requestedChannels = Array.isArray(safeEvent.channels) && safeEvent.channels.length > 0
    ? safeEvent.channels.filter((channel) => NOTIFICATION_CHANNELS.includes(channel))
    : NOTIFICATION_CHANNELS;
  const { publicSettings: rules } = await loadSchoolRules();
  const emailRule = rules.emailNotifications[eventType] || { enabled: true, customNotice: "" };
  const channels = requestedChannels.filter((channel) => channel !== "email" || emailRule.enabled);
  const { settings } = await loadEmailSettings();
  const { publicSettings: brand } = await loadEmailBrandSettings();
  const message = {
    ...buildNotificationMessage(safeEvent, flight),
    customNotice: emailRule.customNotice,
  };
  const usersById = await getUserMapByIds(recipients);
  const deliveries = [];
  for (const recipientUserId of recipients) {
    const user = usersById.get(recipientUserId);
    for (const channel of channels) {
      if (await alreadyDelivered(dedupeKey, channel, recipientUserId)) {
        deliveries.push({ channel, recipientUserId, status: "skipped" });
        continue;
      }
      try {
        const result =
          channel === "email"
            ? await sendEmailToUser(settings, brand, user, message)
            : await sendPushToUser(recipientUserId, message);
        await logDelivery(eventType, dedupeKey, channel, recipientUserId, result.status, result.providerMessageId, result.reason);
        deliveries.push({ channel, recipientUserId, status: result.status });
      } catch (err) {
        await logDelivery(eventType, dedupeKey, channel, recipientUserId, "failed", null, err?.message || err);
        deliveries.push({ channel, recipientUserId, status: "failed" });
      }
    }
  }
  return deliveries;
}

async function registerPushSubscription(actorUserId, subscription) {
  if (!actorUserId) throw Object.assign(new Error("Unauthorized request."), { status: 401 });
  if (!PUSH_SUBSCRIPTIONS_COLLECTION_ID) throw Object.assign(new Error("Colecao de push nao configurada."), { status: 500 });
  const endpoint = cleanString(subscription?.endpoint);
  const keys = subscription?.keys && typeof subscription.keys === "object" ? subscription.keys : {};
  if (!endpoint || !keys.p256dh || !keys.auth) throw Object.assign(new Error("Subscription invalida."), { status: 400 });
  const data = {
    user_id: actorUserId,
    endpoint,
    endpoint_hash: endpointHash(endpoint),
    keys_json: JSON.stringify({ p256dh: keys.p256dh, auth: keys.auth }),
    user_agent: cleanString(subscription.userAgent).slice(0, 512),
    enabled: true,
    last_seen_at: nowIso(),
  };
  const existing = await databases.listDocuments(DATABASE_ID, PUSH_SUBSCRIPTIONS_COLLECTION_ID, [
    sdk.Query.equal("endpoint_hash", [endpointHash(endpoint)]),
    sdk.Query.limit(1),
  ]);
  if (existing.documents[0]) await databases.updateDocument(DATABASE_ID, PUSH_SUBSCRIPTIONS_COLLECTION_ID, existing.documents[0].$id, data);
  else await databases.createDocument(DATABASE_ID, PUSH_SUBSCRIPTIONS_COLLECTION_ID, sdk.ID.unique(), data, ADMIN_DOC_PERMS);
}

async function deletePushSubscription(actorUserId, endpoint) {
  if (!actorUserId || !PUSH_SUBSCRIPTIONS_COLLECTION_ID) return;
  const cleaned = cleanString(endpoint);
  if (!cleaned) return;
  const existing = await databases.listDocuments(DATABASE_ID, PUSH_SUBSCRIPTIONS_COLLECTION_ID, [
    sdk.Query.equal("endpoint_hash", [endpointHash(cleaned)]),
    sdk.Query.equal("user_id", [actorUserId]),
    sdk.Query.limit(1),
  ]);
  if (existing.documents[0]) {
    await databases.updateDocument(DATABASE_ID, PUSH_SUBSCRIPTIONS_COLLECTION_ID, existing.documents[0].$id, { enabled: false });
  }
}

function sampleEventForTemplate(templateType) {
  const eventType = NOTIFICATION_CHANNELS.includes(templateType) ? "test" : cleanString(templateType || "test");
  const samples = {
    "flight.scheduled": {
      eventType: "flight.scheduled",
      data: { aircraft: "PS-ABC", flightDate: "2026-05-14", startTime: "09:00" },
    },
    "flight.updated": {
      eventType: "flight.updated",
      data: { aircraft: "PS-ABC", flightDate: "2026-05-14", startTime: "10:30" },
    },
    "flight.cancelled": {
      eventType: "flight.cancelled",
      data: { aircraft: "PS-ABC", flightDate: "2026-05-14", startTime: "09:00" },
    },
    "weeklyPlan.submitted": {
      eventType: "weeklyPlan.submitted",
      data: { weekStart: "2026-05-18", requestedFlightsCount: 3 },
    },
    "notice.published": {
      eventType: "notice.published",
      data: {
        title: "Novo comunicado da escola",
        contentMd: "Confira as orientações operacionais para os próximos voos da semana.",
      },
    },
  };
  return samples[eventType] || {
    eventType: "test",
    data: {},
  };
}

async function sendTestEmail(to, templateType) {
  const { settings } = await loadEmailSettings();
  const { publicSettings: brand } = await loadEmailBrandSettings();
  const { publicSettings: rules } = await loadSchoolRules();
  const sample = sampleEventForTemplate(templateType);
  const message =
    sample.eventType === "test"
      ? {
          eyebrow: "Teste de email",
          title: "Template de email configurado",
          intro: "As configurações de email da plataforma estão funcionando.",
          body: "Este é um exemplo do visual que os usuários receberão nos emails transacionais da escola.",
          details: [
            ["Template", "Teste geral"],
            ["Status", "Configurado"],
          ],
          ctaLabel: "Abrir plataforma",
          url: brand.appUrl || APP_URL,
        }
      : buildNotificationMessage(sample, null);
  if (sample.eventType !== "test") {
    message.customNotice = rules.emailNotifications[sample.eventType]?.customNotice || "";
  }
  const result = await sendEmailToUser(settings, brand, { email: cleanString(to) }, message);
  if (result.status !== "sent") throw Object.assign(new Error(result.reason || "Email de teste nao enviado."), { status: 400 });
}

module.exports = async ({ req, res, log, error }) => {
  try {
    if (!DATABASE_ID || !PROFILES_COLLECTION_ID) {
      return jsonResponse(res, 500, { message: "Missing APPWRITE_DATABASE_ID or APPWRITE_PROFILES_COLLECTION_ID." });
    }

    const actorUserId = req.headers["x-appwrite-user-id"];
    const payload = req.bodyJson || {};
    const action = String(payload.action || "listSummaries");

    if (action === "registerPushSubscription") {
      await registerPushSubscription(actorUserId, payload.subscription);
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "deletePushSubscription") {
      await deletePushSubscription(actorUserId, payload.endpoint);
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "dispatchEvent") {
      const deliveries = await dispatchNotificationEvent(actorUserId, payload.event);
      return jsonResponse(res, 200, { ok: true, deliveries });
    }

    if (action === "getEmailBrandSettings") {
      logBrandDebug(log, "getEmailBrandSettings requested", {
        actorUserId: actorUserId || null,
        publicRead: true,
      });
      const { settings, doc } = await loadEmailBrandSettings();
      const brandSettings = await publicEmailBrandSettingsWithLogo(settings, doc?.$updatedAt || null, log);
      return jsonResponse(res, 200, { brandSettings });
    }

    if (action === "getSchoolRules") {
      const { publicSettings } = await loadSchoolRules();
      return jsonResponse(res, 200, { schoolRules: publicSettings });
    }

    await requireAdmin(actorUserId);

    if (action === "getEmailSettings") {
      const { publicSettings } = await loadEmailSettings();
      return jsonResponse(res, 200, { emailSettings: publicSettings });
    }

    if (action === "saveEmailSettings") {
      const emailSettings = await saveEmailSettings(payload.settings);
      return jsonResponse(res, 200, { emailSettings });
    }

    if (action === "saveEmailBrandSettings") {
      const savedBrandSettings = await saveEmailBrandSettings(payload.settings);
      const brandSettings = {
        ...savedBrandSettings,
        logoDataUrl: await logoUrlToDataUrl(savedBrandSettings.logoUrl, log),
      };
      logBrandDebug(log, "saveEmailBrandSettings response prepared", summarizePublicBrandSettings(brandSettings));
      return jsonResponse(res, 200, { brandSettings });
    }

    if (action === "saveSchoolRules") {
      const schoolRules = await saveSchoolRules(payload.rules);
      return jsonResponse(res, 200, { schoolRules });
    }

    if (action === "sendTestEmail") {
      await sendTestEmail(payload.to, payload.templateType);
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "updateRole") {
      const user = await updateRole(actorUserId, String(payload.userId || ""), String(payload.role || ""));
      return jsonResponse(res, 200, { user });
    }

    if (action === "updateInstructorPreferences") {
      const user = await updateInstructorPreferences(
        String(payload.userId || ""),
        String(payload.preferenceLevel || "medium"),
        payload.availability,
      );
      return jsonResponse(res, 200, { user });
    }

    if (action === "createCredit") {
      await createCredit(actorUserId, payload.credit);
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "updateCredit") {
      await updateCredit(actorUserId, String(payload.creditId || ""), payload.credit);
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "deleteCredit") {
      await deleteCredit(String(payload.creditId || ""), String(payload.userId || ""));
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "createManeuverSection") {
      const document = await createManeuverDocument("section", payload.data);
      return jsonResponse(res, 200, { document });
    }

    if (action === "updateManeuverSection") {
      const document = await updateManeuverDocument("section", String(payload.documentId || ""), payload.data);
      return jsonResponse(res, 200, { document });
    }

    if (action === "deleteManeuverSection") {
      await deleteManeuverDocument("section", String(payload.documentId || ""));
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "createManeuverSubsection") {
      const document = await createManeuverDocument("subsection", payload.data);
      return jsonResponse(res, 200, { document });
    }

    if (action === "updateManeuverSubsection") {
      const document = await updateManeuverDocument("subsection", String(payload.documentId || ""), payload.data);
      return jsonResponse(res, 200, { document });
    }

    if (action === "deleteManeuverSubsection") {
      await deleteManeuverDocument("subsection", String(payload.documentId || ""));
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "createManeuverArticle") {
      const document = await createManeuverDocument("article", payload.data);
      return jsonResponse(res, 200, { document });
    }

    if (action === "updateManeuverArticle") {
      const document = await updateManeuverDocument("article", String(payload.documentId || ""), payload.data);
      return jsonResponse(res, 200, { document });
    }

    if (action === "deleteManeuverArticle") {
      await deleteManeuverDocument("article", String(payload.documentId || ""));
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "getDetail") {
      const user = await getUserDetail(String(payload.userId || ""));
      return jsonResponse(res, 200, { user });
    }

    if (action === "listFlightReports") {
      const report = await listFlightReports();
      return jsonResponse(res, 200, report);
    }

    if (action === "getDashboardSummary") {
      const dashboard = await getDashboardSummary(payload);
      return jsonResponse(res, 200, { dashboard });
    }

    if (action === "getStudentsProgress") {
      const studentsProgress = await getStudentsProgress(payload);
      return jsonResponse(res, 200, { studentsProgress });
    }

    if (action === "listSummaries" || action === "list") {
      const page = await listSummaries({
        search: String(payload.search || ""),
        limit: payload.limit,
        offset: payload.offset,
      });
      return jsonResponse(res, 200, page);
    }

    return jsonResponse(res, 400, { message: "Acao invalida." });
  } catch (err) {
    const status = err?.status || 500;
    error(String(err?.message || err));
    log(String(err?.stack || ""));
    return jsonResponse(res, status, { message: err?.message || "Unexpected function error." });
  }
};
