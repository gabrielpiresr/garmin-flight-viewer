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
const FLIGHT_SIGNATURES_COLLECTION_ID =
  process.env.APPWRITE_FLIGHT_SIGNATURES_COLLECTION_ID ||
  process.env.APPWRITE_FLIGHT_SIGNATURES_COL_ID ||
  "flight_signatures";
const AUDIT_EVENTS_COLLECTION_ID =
  process.env.APPWRITE_AUDIT_EVENTS_COLLECTION_ID ||
  process.env.APPWRITE_AUDIT_EVENTS_COL_ID ||
  "audit_events";
const WEEKLY_PLANS_COLLECTION_ID =
  process.env.APPWRITE_WEEKLY_PLANS_COLLECTION_ID || process.env.APPWRITE_WEEKLY_PLANS_COL_ID;
const INSTRUCTOR_PREFS_COLLECTION_ID = process.env.APPWRITE_INSTRUCTOR_PREFS_COLLECTION_ID;
const STUDENT_CREDITS_COLLECTION_ID = process.env.APPWRITE_STUDENT_CREDITS_COLLECTION_ID;
const PRODUCT_SALES_COLLECTION_ID = process.env.APPWRITE_PRODUCT_SALES_COLLECTION_ID || process.env.APPWRITE_PRODUCT_SALES_COL_ID || "product_sales";
const SCHOOL_COSTS_COLLECTION_ID = process.env.APPWRITE_SCHOOL_COSTS_COLLECTION_ID || process.env.APPWRITE_SCHOOL_COSTS_COL_ID || "school_costs";
const INSTRUCTOR_COSTS_COLLECTION_ID =
  process.env.APPWRITE_INSTRUCTOR_COSTS_COLLECTION_ID || process.env.APPWRITE_INSTRUCTOR_COSTS_COL_ID || "instructor_costs";
const FLIGHT_INSTRUCTOR_PAYMENTS_COLLECTION_ID =
  process.env.APPWRITE_FLIGHT_INSTRUCTOR_PAYMENTS_COLLECTION_ID ||
  process.env.APPWRITE_FLIGHT_INSTRUCTOR_PAYMENTS_COL_ID ||
  "flight_instructor_payments";
const FUELINGS_COLLECTION_ID = process.env.APPWRITE_FUELINGS_COLLECTION_ID || process.env.APPWRITE_FUELINGS_COL_ID || "aircraft_fuelings";
const MAINTENANCE_WORK_ORDERS_COLLECTION_ID =
  process.env.APPWRITE_MAINTENANCE_WORK_ORDERS_COLLECTION_ID ||
  process.env.APPWRITE_MAINTENANCE_WORK_ORDERS_COL_ID ||
  "maintenance_work_orders";
const FINANCIAL_MONTHLY_CLOSINGS_COLLECTION_ID =
  process.env.APPWRITE_FINANCIAL_MONTHLY_CLOSINGS_COLLECTION_ID ||
  process.env.APPWRITE_FINANCIAL_MONTHLY_CLOSINGS_COL_ID ||
  "financial_monthly_closings";
const FINANCIAL_MONTHLY_CLOSING_LINES_COLLECTION_ID =
  process.env.APPWRITE_FINANCIAL_MONTHLY_CLOSING_LINES_COLLECTION_ID ||
  process.env.APPWRITE_FINANCIAL_MONTHLY_CLOSING_LINES_COL_ID ||
  "financial_monthly_closing_lines";
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
const HELP_SECTIONS_COLLECTION_ID = process.env.APPWRITE_HELP_SECTIONS_COLLECTION_ID;
const HELP_SUBSECTIONS_COLLECTION_ID = process.env.APPWRITE_HELP_SUBSECTIONS_COLLECTION_ID;
const HELP_ARTICLES_COLLECTION_ID = process.env.APPWRITE_HELP_ARTICLES_COLLECTION_ID;
const PLATFORM_SETTINGS_COLLECTION_ID = process.env.APPWRITE_PLATFORM_SETTINGS_COLLECTION_ID;
const PUSH_SUBSCRIPTIONS_COLLECTION_ID = process.env.APPWRITE_PUSH_SUBSCRIPTIONS_COLLECTION_ID;
const NOTIFICATION_DELIVERIES_COLLECTION_ID = process.env.APPWRITE_NOTIFICATION_DELIVERIES_COLLECTION_ID;
const BROADCAST_SEGMENTS_COLLECTION_ID = process.env.APPWRITE_BROADCAST_SEGMENTS_COLLECTION_ID;
const BROADCAST_MESSAGES_COLLECTION_ID = process.env.APPWRITE_BROADCAST_MESSAGES_COLLECTION_ID;
const WEB_PUSH_PUBLIC_KEY = process.env.WEB_PUSH_PUBLIC_KEY || "";
const WEB_PUSH_PRIVATE_KEY = process.env.WEB_PUSH_PRIVATE_KEY || "";
const WEB_PUSH_CONTACT = process.env.WEB_PUSH_CONTACT || "mailto:admin@example.com";
const APP_URL = process.env.APP_URL || "";
const CF_WORKER_URL = process.env.CF_WORKER_URL || "";
const WORKER_SECRET = process.env.WORKER_SECRET || "";
const GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON || "";
const GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL || "";
const GOOGLE_CALENDAR_PRIVATE_KEY = process.env.GOOGLE_CALENDAR_PRIVATE_KEY || "";
// Identificador único da escola — usado para isolar dados em ambiente multi-tenant.
const SCHOOL_ID = process.env.SCHOOL_ID || "escola_principal";

const VALID_ROLES = new Set(["admin", "instrutor", "aluno"]);
const VALID_FLIGHT_STATUSES = new Set(["Previsto", "Cancelado", "Realizado"]);
const VALID_INSTRUCTOR_PREFERENCES = new Set(["low", "medium", "high"]);
const VALID_AVAILABILITY_TYPES = new Set(["available", "preferred"]);
const META_PREFIX = "#GFV_META_V1:";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;
const RESEND_EMAIL_INTERVAL_MS = 250;
const RESEND_EMAIL_MAX_ATTEMPTS = 3;
let nextResendEmailAt = 0;
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
  "flight_status",
];
const FLIGHT_DETAIL_SELECT = [
  ...FLIGHT_SELECT,
  "csv_text",
  "from_to",
  "landings",
  "block_time_minutes",
  "total_flight_minutes",
  "total_miles",
  "telemetry_present",
  "training_mission_ids_json",
  "schedule_week_start",
  "schedule_demand_id",
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
  "custom_role_slug",
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

function clampReportLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 100;
  return Math.min(200, Math.max(1, Math.round(parsed)));
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

function parseClockMinutes(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
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
  for (const id of parseJsonList(doc?.training_mission_ids_json)) {
    if (id) ids.add(String(id));
  }
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

function extractLegIcaos(legs) {
  const list = Array.isArray(legs) ? legs : [];
  let firstDepIcao = null;
  let lastArrIcao = null;
  for (const leg of list) {
    const dep = String(leg.dep || "").trim().toUpperCase();
    const arr = String(leg.arr || "").trim().toUpperCase();
    if (!firstDepIcao && dep && dep !== "---") firstDepIcao = dep;
    if (arr && arr !== "---") lastArrIcao = arr;
  }
  return { firstDepIcao, lastArrIcao };
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

function normalizeFlightStatus(value, flight) {
  if (VALID_FLIGHT_STATUSES.has(value)) return value;
  return isFutureFlight(flight) ? "Previsto" : "Realizado";
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

async function listDocumentsByFieldIn(collectionId, field, values, queries = [], batchSize = 50) {
  if (!collectionId) return [];
  const cleanValues = Array.from(new Set((values || []).filter(Boolean)));
  if (!cleanValues.length) return [];
  const docs = [];
  for (let i = 0; i < cleanValues.length; i += batchSize) {
    docs.push(
      ...(await listAllDocuments(collectionId, [
        sdk.Query.equal(field, cleanValues.slice(i, i + batchSize)),
        ...queries,
      ])),
    );
  }
  return docs;
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
  const schoolFilter = sdk.Query.equal("school_id", [SCHOOL_ID]);
  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);
    const queryBase = [schoolFilter, sdk.Query.orderDesc("flight_date"), ...selectQuery(includeCsv ? FLIGHT_DETAIL_SELECT : FLIGHT_SELECT)];
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
        sdk.Query.equal("school_id", [SCHOOL_ID]),
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
  const { firstDepIcao, lastArrIcao } = extractLegIcaos(legs);
  const materializedRoute = String(doc.from_to || "").trim();
  const routeParts = materializedRoute.split("->").map((part) => part.trim()).filter(Boolean);
  const landings =
    typeof doc.landings === "number"
      ? doc.landings
      : legs.reduce((acc, leg) => acc + Math.max(0, Math.round(Number(leg.landings) || 0)), 0);
  const totalMinutes = legs.reduce((acc, leg) => acc + parseDurationToMinutes(leg.flightTime), 0);
  const navigationMinutes = legs.reduce((acc, leg) => acc + parseDurationToMinutes(leg.navTime), 0);
  const ifrMinutes = legs.reduce((acc, leg) => acc + parseDurationToMinutes(leg.ifrTime), 0);
  const nightMinutes = legs.reduce((acc, leg) => acc + parseDurationToMinutes(leg.nightTime), 0);
  const distanceNm =
    typeof doc.total_miles === "number" ? doc.total_miles : legs.reduce((acc, leg) => acc + parseMiles(leg.distance), 0);
  // Priority: block_time_minutes (departure → engine cutoff) > meta block time > GPS > leg sum
  const blockTimeMinutes =
    typeof doc.block_time_minutes === "number" && doc.block_time_minutes > 0
      ? doc.block_time_minutes
      : (() => {
          const depMin = parseClockMinutes(meta?.header?.departureTimeUtc);
          const cutMin = parseClockMinutes(meta?.header?.engineCutoffTimeUtc);
          return depMin !== null && cutMin !== null && cutMin > depMin ? cutMin - depMin : null;
        })();
  const durationSec =
    blockTimeMinutes !== null
      ? blockTimeMinutes * 60
      : typeof doc.duration_sec === "number" && doc.duration_sec > 0
        ? doc.duration_sec
        : typeof doc.total_flight_minutes === "number" && doc.total_flight_minutes > 0
          ? doc.total_flight_minutes * 60
          : totalMinutes > 0
            ? totalMinutes * 60
            : null;
  const snapshot = parseTrainingSnapshot(doc.training_snapshot_json) || meta?.training?.snapshot || null;
  return {
    id: doc.$id,
    createdAt: doc.$createdAt || "",
    updatedAt: doc.$updatedAt || "",
    sourceFilename: doc.source_filename || "",
    flightStatus: normalizeFlightStatus(doc.flight_status, {
      flightDate: doc.flight_date || meta?.header?.date || (doc.$createdAt || "").slice(0, 10) || null,
      startTime: doc.start_time || meta?.header?.startTime || null,
    }),
    aircraftIdent: meta?.header?.aircraft || doc.aircraft_ident || null,
    durationSec,
    flightDate: doc.flight_date || meta?.header?.date || (doc.$createdAt || "").slice(0, 10) || null,
    startTime: doc.start_time || meta?.header?.startTime || null,
    route: buildRoute(legs) || materializedRoute,
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
    scheduleWeekStart: doc.schedule_week_start || meta?.schedule?.weekStart || null,
    scheduleDemandId: doc.schedule_demand_id || meta?.schedule?.demandId || null,
    trainingTrackId: doc.training_track_id || meta?.training?.trackId || snapshot?.trackId || null,
    trainingStageId: doc.training_stage_id || meta?.training?.stageId || snapshot?.stageId || null,
    trainingMissionId: doc.training_mission_id || meta?.training?.missionId || snapshot?.missionId || null,
    trainingMissionIds: flightTrainingMissionIds(doc, meta),
    trainingSnapshot: snapshot,
    studentUserId: doc.student_user_id || doc.user_id || null,
    instructorUserId: doc.instructor_user_id || null,
    firstDepIcao: firstDepIcao || routeParts[0] || null,
    lastArrIcao: lastArrIcao || routeParts[routeParts.length - 1] || null,
    telemetryPresentOnDoc: Boolean(doc.telemetry_present),
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

function summarizeFlights(flights, plans, profilesByUserId = new Map()) {
  const normalizedFlights = flights
    .map((doc) => {
      const flight = toFlight(doc);
      // Resolve instructor name from profiles when CSV metadata didn't embed it
      if (flight.instructorUserId && !flight.instructorName) {
        flight.instructorName = dashboardProfileName(flight.instructorUserId, profilesByUserId);
      }
      return flight;
    })
    .sort((a, b) => flightDateTimeKey(b).localeCompare(flightDateTimeKey(a)));
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

function toUserRecord(user, profile, preference, flights, plans, trainingTracks = [], profilesByUserId = new Map()) {
  const role = VALID_ROLES.has(profile?.role) ? profile.role : deriveRoleFromLabels(user.labels || []);
  const profilePayload = toProfile(profile, preference);
  const summary = summarizeFlights(flights, plans, profilesByUserId);

  return {
    userId: user.$id,
    email: user.email || profile?.email || "",
    name: user.name || "",
    role,
    customRoleSlug: profile?.custom_role_slug || null,
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
  const status = flight.flightStatus;

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
    if (row.status === "Previsto") {
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
    sdk.Query.equal("school_id", [SCHOOL_ID]),
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
    sdk.Query.equal("school_id", [SCHOOL_ID]),
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
      sdk.Query.equal("school_id", [SCHOOL_ID]),
      sdk.Query.greaterThanEqual("flight_date", today),
      ...dashboardEqualQuery("aircraft_ident", filters.aircrafts),
      ...dashboardEqualQuery("instructor_user_id", filters.instructors),
      ...dashboardEqualQuery("student_user_id", filters.students),
      sdk.Query.orderAsc("flight_date"),
      sdk.Query.limit(100),
      ...selectQuery(FLIGHT_SELECT),
    ]),
    listAllDocuments(FLIGHTS_COLLECTION_ID, [
      sdk.Query.equal("school_id", [SCHOOL_ID]),
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
    .filter((row) => row.status === "Previsto" && rowMatchesDashboardFilters(row, filters));
  const upcomingRows = futureRowsForOperationalCounts
    .slice()
    .filter((row) => row.status === "Previsto" && rowMatchesDashboardFilters(row, filters))
    .sort((a, b) => flightDateTimeKey(a).localeCompare(flightDateTimeKey(b)))
    .slice(0, filters.upcomingLimit);
  const forecastRows = forecastFlightDocs
    .map((doc) => dashboardFlightRow(doc, telemetryByFlightId, aircraftByRegistration, modelsById, profilesByUserId))
    .filter((row) => row.status === "Previsto" && rowMatchesDashboardFilters(row, filters));
  const alertRows = alertDocs.map((doc) => dashboardAlertRow(doc, aircraftByRegistration, modelsById, profilesByUserId));

  const executedRows = periodRows.filter((row) => row.status === "Realizado");
  const futureRows = periodRows.filter((row) => row.status === "Previsto");
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

function stringList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  const single = String(value || "").trim();
  return single ? [single] : [];
}

function dateQuery(field, fromDate, toDate) {
  const out = [];
  if (fromDate) out.push(sdk.Query.greaterThanEqual(field, fromDate));
  if (toDate) out.push(sdk.Query.lessThanEqual(field, toDate));
  return out;
}

function reportValueMatches(values, ...candidates) {
  if (!values.length) return true;
  const normalized = new Set(values.map((value) => normalizeSearch(value)));
  return candidates.some((candidate) => normalized.has(normalizeSearch(candidate)));
}

function rowMatchesReportFilters(row, filters) {
  if (filters.status !== "all" && row.status !== filters.status) return false;
  if (!reportValueMatches(filters.aircrafts, row.aircraftIdent, row.aircraftId)) return false;
  if (!reportValueMatches(filters.models, row.modelName, row.modelId)) return false;
  if (!reportValueMatches(filters.instructors, row.instructorName, row.instructorUserId)) return false;
  if (!reportValueMatches(filters.students, row.studentName, row.studentUserId)) return false;
  return true;
}

async function listFlightReports(params = {}) {
  const limit = clampReportLimit(params.limit);
  const cursor = String(params.cursor || "").trim();
  const filters = {
    fromDate: String(params.fromDate || "").trim(),
    toDate: String(params.toDate || "").trim(),
    aircrafts: stringList(params.aircrafts || params.aircraftIdents),
    models: stringList(params.models || params.modelIds),
    instructors: stringList(params.instructors || params.instructorUserIds),
    students: stringList(params.students || params.studentUserIds),
    status: VALID_FLIGHT_STATUSES.has(params.status) ? params.status : "all",
  };

  const flightQueries = [
    sdk.Query.equal("school_id", [SCHOOL_ID]),
    ...dateQuery("flight_date", filters.fromDate, filters.toDate),
    ...dashboardEqualQuery("aircraft_ident", stringList(params.aircraftIdents)),
    ...dashboardEqualQuery("instructor_user_id", stringList(params.instructorUserIds)),
    ...dashboardEqualQuery("student_user_id", stringList(params.studentUserIds)),
    sdk.Query.orderDesc("flight_date"),
    sdk.Query.orderDesc("start_time"),
    sdk.Query.limit(limit),
    ...selectQuery(FLIGHT_DETAIL_SELECT),
  ];
  if (cursor) flightQueries.push(sdk.Query.cursorAfter(cursor));

  const flightsPage = await listDocumentsPage(FLIGHTS_COLLECTION_ID, flightQueries);
  const flights = flightsPage.documents;
  const flightIds = flights.map((flight) => flight.$id);
  const userIds = Array.from(new Set(flights.flatMap((doc) => [doc.student_user_id || doc.user_id, doc.instructor_user_id]).filter(Boolean)));

  const [usersList, profilesByUserId, aircrafts, models, telemetrySummaries, landingMetrics] = await Promise.all([
    getUsersByIds(userIds),
    getProfilesByUserIds(userIds),
    listAllDocuments(AIRCRAFTS_COLLECTION_ID, selectQuery(AIRCRAFT_SELECT)),
    listAllDocuments(AIRCRAFT_MODELS_COLLECTION_ID, selectQuery(AIRCRAFT_MODEL_SELECT)),
    listDocumentsByFieldIn(FLIGHT_TELEMETRY_SUMMARIES_COLLECTION_ID, "flight_id", flightIds, selectQuery(TELEMETRY_SUMMARY_SELECT)),
    listDocumentsByFieldIn(FLIGHT_LANDINGS_COLLECTION_ID, "flight_id", flightIds, selectQuery(LANDING_METRIC_SELECT)),
  ]);

  const usersById = new Map(usersList.map((user) => [user.$id, user]));
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
    const status = flight.flightStatus;
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

  const filteredRows = rows
    .filter((row) => rowMatchesReportFilters(row, filters))
    .sort((a, b) => flightDateTimeKey(b).localeCompare(flightDateTimeKey(a)));

  return {
    flights: filteredRows,
    total: flightsPage.total,
    limit,
    nextCursor: flights.length === limit ? flights[flights.length - 1]?.$id || null : null,
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
  const schoolFilter = sdk.Query.equal("school_id", [SCHOOL_ID]);
  const [allUsers, profiles, instructorPrefs, flights, plans] = await Promise.all([
    onlyUserId ? users.get({ userId: onlyUserId }).then((user) => [user]) : listAllUsers(),
    listAllDocuments(PROFILES_COLLECTION_ID, [schoolFilter]),
    listAllDocuments(INSTRUCTOR_PREFS_COLLECTION_ID, [schoolFilter]),
    listAllDocuments(FLIGHTS_COLLECTION_ID, [schoolFilter]),
    listAllDocuments(WEEKLY_PLANS_COLLECTION_ID, [schoolFilter]),
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
        profileByUserId, // already contains all profiles — resolves instructor names too
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
    sdk.Query.equal("school_id", [SCHOOL_ID]),
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

function studentTrackDocumentPermissions(studentUserId) {
  return [
    sdk.Permission.read(sdk.Role.user(studentUserId)),
    sdk.Permission.read(sdk.Role.users()),
    sdk.Permission.read(sdk.Role.label("admin")),
    sdk.Permission.read(sdk.Role.label("instrutor")),
  ];
}

const DEFAULT_TRACK_NAME = "Programa PP - Cronograma PDF";

async function resolveDefaultTrainingTrackId() {
  if (!TRAINING_TRACKS_COLLECTION_ID) return null;

  const attempts = [
    [
      sdk.Query.equal("school_id", [SCHOOL_ID]),
      sdk.Query.equal("is_default", [true]),
      sdk.Query.equal("is_active", [true]),
    ],
    [sdk.Query.equal("is_default", [true]), sdk.Query.equal("is_active", [true])],
    [sdk.Query.equal("school_id", [SCHOOL_ID]), sdk.Query.equal("name", [DEFAULT_TRACK_NAME])],
    [sdk.Query.equal("name", [DEFAULT_TRACK_NAME])],
    [sdk.Query.equal("school_id", [SCHOOL_ID]), sdk.Query.equal("is_active", [true]), sdk.Query.orderAsc("name")],
    [sdk.Query.equal("is_active", [true]), sdk.Query.orderAsc("name")],
  ];

  for (const baseQueries of attempts) {
    const res = await databases
      .listDocuments(DATABASE_ID, TRAINING_TRACKS_COLLECTION_ID, [...baseQueries, sdk.Query.limit(1)])
      .catch(() => ({ documents: [] }));
    if (res.documents[0]?.$id) return res.documents[0].$id;
  }

  return null;
}

async function ensureDefaultStudentTrainingTrack(actorUserId, targetUserId) {
  const studentUserId = cleanString(targetUserId) || actorUserId;
  if (!studentUserId) {
    throw Object.assign(new Error("Usuário não autenticado."), { status: 401 });
  }
  if (studentUserId !== actorUserId) {
    await requireAdmin(actorUserId);
  }
  if (!STUDENT_TRACKS_COLLECTION_ID || !TRAINING_TRACKS_COLLECTION_ID) {
    return { assigned: false, trackId: null, message: "Coleções de trilha não configuradas." };
  }

  const existing = await listAllDocuments(STUDENT_TRACKS_COLLECTION_ID, [
    sdk.Query.equal("school_id", [SCHOOL_ID]),
    sdk.Query.equal("student_user_id", [studentUserId]),
    sdk.Query.limit(1),
  ]).catch(() => []);
  if (existing.length > 0) {
    return {
      assigned: false,
      trackId: existing[0].track_id || null,
      alreadyAssigned: true,
    };
  }

  const trackId = await resolveDefaultTrainingTrackId();
  if (!trackId) {
    return { assigned: false, trackId: null, message: "Nenhuma trilha padrão ativa encontrada." };
  }

  const now = new Date().toISOString();
  await databases.createDocument(
    DATABASE_ID,
    STUDENT_TRACKS_COLLECTION_ID,
    sdk.ID.unique(),
    {
      school_id: SCHOOL_ID,
      student_user_id: studentUserId,
      track_id: trackId,
      status: "active",
      is_primary: true,
      assigned_at: now,
      updated_at: now,
    },
    studentTrackDocumentPermissions(studentUserId),
  );

  return { assigned: true, trackId, alreadyAssigned: false };
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
  // Resolve instructor names: collect unique instructor_user_id values from this user's flights
  const instructorIds = [...new Set(flights.map((f) => f.instructor_user_id).filter(Boolean))];
  const instructorProfilesByUserId = await getProfilesByUserIds(instructorIds);
  return toUserRecord(
    user,
    profileByUserId.get(targetUserId) || null,
    prefByUserId.get(targetUserId) || null,
    flights,
    plans,
    trainingByUserId.get(targetUserId) || [],
    instructorProfilesByUserId,
  );
}

async function upsertProfile(userId, email, role, customRoleSlug = null) {
  const existing = await getProfileByUserId(userId);
  const data = {
    user_id: userId,
    email,
    role,
    school_id: SCHOOL_ID,
    custom_role_slug: customRoleSlug || null,
  };

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

async function updateRole(actorUserId, targetUserId, role, customRoleSlug = null) {
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
  // custom_role_slug: store only if role is admin/instrutor (aluno system roles don't use custom slugs here)
  const slugToStore = customRoleSlug && typeof customRoleSlug === "string" ? customRoleSlug.trim() || null : null;
  await upsertProfile(targetUserId, user.email || "", role, slugToStore);

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
      school_id: SCHOOL_ID,
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

// --- Financial DRE ---------------------------------------------------------

const FINANCIAL_VALUE_TYPES = {
  money: "money",
  percent: "percent",
  number: "number",
  hours: "hours",
};

const DRE_LEVEL1_SECTIONS = [
  { key: "section_revenue", label: "Receita" },
  { key: "section_commercial_deductions", label: "Deducoes e Perdas Comerciais" },
  { key: "section_variable_costs", label: "Custos Variaveis" },
  { key: "section_operational_margin", label: "Margem Operacional" },
  { key: "section_fixed_costs", label: "Custos Fixos" },
  { key: "section_ebitda", label: "EBITDA (Resultado Operacional)" },
  { key: "section_taxes", label: "Impostos" },
  { key: "section_net_profit", label: "Lucro liquido" },
];

const DRE_SECTION_LABELS = Object.fromEntries(DRE_LEVEL1_SECTIONS.map((section) => [section.key, section.label]));
const LEGACY_DRE_SECTION_KEY_MAP = {
  section_revenue_taxes: "section_taxes",
  section_operational_costs: "section_variable_costs",
  section_gross_profit: "section_operational_margin",
  section_asset_variation: "section_variable_costs",
};

function normalizeDreSectionKey(key) {
  const raw = String(key || "").trim();
  return DRE_SECTION_LABELS[raw] ? raw : LEGACY_DRE_SECTION_KEY_MAP[raw] || raw;
}

const DEFAULT_PAYMENT_METHOD_COSTS = {
  "Cartao de credito a vista": { fixedCost: 0, percentCost: 0 },
  "Cartão de crédito à vista": { fixedCost: 0, percentCost: 0 },
  Parcelado: { fixedCost: 0, percentCost: 0 },
  PIX: { fixedCost: 0, percentCost: 0 },
};

function roundMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function roundHours(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function dreMonthKey(value) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.slice(0, 7);
  return new Date().toISOString().slice(0, 7);
}

function monthStart(month) {
  return `${dreMonthKey(month)}-01`;
}

function monthEnd(month) {
  const [year, monthNumber] = dreMonthKey(month).split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}

function monthLabel(month) {
  const [year, monthNumber] = dreMonthKey(month).split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1, 1, 12));
  return date.toLocaleDateString("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" }).replace(".", "");
}

function listMonthKeys(fromMonth, toMonth) {
  const from = dreMonthKey(fromMonth);
  const to = dreMonthKey(toMonth);
  const [fromYear, fromNumber] = from.split("-").map(Number);
  const [toYear, toNumber] = to.split("-").map(Number);
  const startIndex = fromYear * 12 + fromNumber - 1;
  const endIndex = toYear * 12 + toNumber - 1;
  const safeStart = Math.min(startIndex, endIndex);
  const safeEnd = Math.max(startIndex, endIndex);
  const months = [];
  for (let index = safeStart; index <= safeEnd && months.length < 36; index += 1) {
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    months.push(`${year}-${String(month).padStart(2, "0")}`);
  }
  return months;
}

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function isPastMonth(month) {
  return dreMonthKey(month) < currentMonthKey();
}

function parseMaybeJson(value, fallback) {
  if (!value || typeof value !== "string") return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function flightBlockMinutes(doc) {
  const meta = decodeFlightMeta(doc?.csv_text);
  const departureMinutes = parseClockMinutes(meta?.header?.departureTimeUtc);
  const cutoffMinutes = parseClockMinutes(meta?.header?.engineCutoffTimeUtc);
  if (departureMinutes !== null && cutoffMinutes !== null && cutoffMinutes > departureMinutes) {
    return cutoffMinutes - departureMinutes;
  }
  return 0;
}

function parseTaxConfigDoc(doc) {
  const parsed = parseMaybeJson(doc?.tax_config_json, {});
  const deductions = (raw) => ({
    aircraftCosts: Boolean(raw?.aircraftCosts),
    fuelCosts: Boolean(raw?.fuelCosts),
    instructorTransfer: Boolean(raw?.instructorTransfer),
    paymentMethodFees: Boolean(raw?.paymentMethodFees),
    workOrderCosts: Boolean(raw?.workOrderCosts),
  });
  return {
    revenueRatePercent: Number(parsed.revenueRatePercent || 0),
    grossProfitRatePercent: Number(parsed.grossProfitRatePercent || 0),
    netProfitRatePercent: Number(parsed.netProfitRatePercent || 0),
    grossProfitDeductions: deductions(parsed.grossProfitDeductions),
    netProfitDeductions: deductions(parsed.netProfitDeductions),
  };
}

function parsePaymentMethodCostsDoc(doc) {
  const parsed = parseMaybeJson(doc?.payment_method_costs_json, {});
  return { ...DEFAULT_PAYMENT_METHOD_COSTS, ...(parsed && typeof parsed === "object" ? parsed : {}) };
}

function parseManualDreLinesDoc(doc) {
  const parsed = parseMaybeJson(doc?.manual_dre_lines_json, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const id = String(entry.id || "").trim();
      const name = String(entry.name || "").trim();
      const sectionKey = normalizeDreSectionKey(entry.sectionKey);
      if (!id || !name || !DRE_SECTION_LABELS[sectionKey]) return null;
      return {
        id,
        name,
        defaultAmount: roundMoney(entry.defaultAmount),
        sectionKey,
        active: entry.active !== false,
        createdAt: String(entry.createdAt || ""),
        updatedAt: String(entry.updatedAt || ""),
      };
    })
    .filter(Boolean);
}

function parseManualDreValuesDoc(doc) {
  const parsed = parseMaybeJson(doc?.manual_dre_values_json, {});
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const result = {};
  for (const [month, values] of Object.entries(parsed)) {
    if (!/^\d{4}-\d{2}$/.test(month) || !values || typeof values !== "object" || Array.isArray(values)) continue;
    result[month] = {};
    for (const [lineId, amount] of Object.entries(values)) {
      const n = Number(amount);
      if (lineId && Number.isFinite(n)) result[month][lineId] = roundMoney(n);
    }
  }
  return result;
}

function numValue(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function docDate(doc, ...keys) {
  for (const key of keys) {
    const value = String(doc?.[key] || "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  }
  return "";
}

function inMonth(doc, month, ...keys) {
  const date = docDate(doc, ...keys);
  return date >= monthStart(month) && date <= monthEnd(month);
}

function normalizeAircraftIdent(value) {
  return String(value || "").trim().toUpperCase();
}

function userLabel(userId, usersById, profilesByUserId) {
  if (!userId) return "Não informado";
  const profile = profilesByUserId.get(userId);
  const user = usersById.get(userId);
  return profile?.full_name || user?.name || user?.email || userId;
}

function addBreakdown(target, key, label, amount, valueType = "money", meta = undefined) {
  if (!target[key]) target[key] = [];
  const existing = target[key].find((item) => item.label === label);
  if (existing && existing.valueType === valueType) {
    existing.amount = roundMoney(existing.amount + amount);
    return;
  }
  target[key].push({ label, amount: roundMoney(amount), valueType, ...(meta ? { meta } : {}) });
}

function sumBreakdown(items) {
  return (items || []).reduce((acc, item) => acc + numValue(item.amount), 0);
}

function signedBreakdown(breakdown, multiplier) {
  const result = {};
  for (const [key, items] of Object.entries(breakdown || {})) {
    result[key] = (items || []).map((item) => ({
      ...item,
      amount: item.valueType === "money" ? roundMoney(numValue(item.amount) * multiplier) : item.amount,
    }));
  }
  return result;
}

function paymentFee(amount, paymentMethod, paymentMethodCosts) {
  const entry = paymentMethodCosts[paymentMethod] || paymentMethodCosts[String(paymentMethod || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")];
  if (!entry) return 0;
  return numValue(entry.fixedCost) + (numValue(amount) * numValue(entry.percentCost)) / 100;
}

function creditCostSnapshot(doc) {
  const parsed = parseMaybeJson(doc?.cost_snapshot_json, null);
  if (!parsed || typeof parsed !== "object") return null;
  return {
    enrollmentCost: numValue(parsed.enrollmentCost),
    totalCostCalculated: numValue(parsed.totalCostCalculated),
  };
}

function aircraftFixedCost(aircraft) {
  return (
    numValue(aircraft?.cost_hangar_monthly) +
    numValue(aircraft?.cost_insurance_monthly) +
    numValue(aircraft?.cost_leasing_monthly) +
    numValue(aircraft?.cost_other_fixed_monthly)
  );
}

function aircraftMaintenanceReserve(aircraft) {
  return numValue(aircraft?.cost_maintenance_reserve_monthly);
}

function workOrderCost(order) {
  const technical = parseMaybeJson(order?.technical_json, {});
  return {
    parts: numValue(technical.parts_cost),
    labor: numValue(technical.labor_cost),
    other: numValue(technical.other_costs),
  };
}

async function safeListAllDocuments(collectionId, queries = []) {
  if (!collectionId) return [];
  try {
    return await listAllDocuments(collectionId, queries);
  } catch {
    return [];
  }
}

async function getFinancialSchoolCosts() {
  let doc = {};
  try {
    const res = await databases.listDocuments(DATABASE_ID, SCHOOL_COSTS_COLLECTION_ID, [
      sdk.Query.equal("school_id", [SCHOOL_ID]),
      sdk.Query.limit(1),
    ]);
    doc = res.documents?.[0] || {};
  } catch {
    doc = {};
  }
  return {
    id: doc.$id || null,
    enrollmentCost: numValue(doc.enrollment_cost),
    paymentMethodCosts: parsePaymentMethodCostsDoc(doc),
    taxConfig: parseTaxConfigDoc(doc),
    manualDreLines: parseManualDreLinesDoc(doc),
    manualDreValues: parseManualDreValuesDoc(doc),
  };
}

async function fetchFinancialBaseData(fromMonth, toMonth) {
  const fromDate = monthStart(fromMonth);
  const toDate = monthEnd(toMonth);
  const schoolFilter = sdk.Query.equal("school_id", [SCHOOL_ID]);
  const [
    flights,
    credits,
    productSales,
    instructorPayments,
    fuelings,
    workOrders,
    aircrafts,
    models,
    instructorCosts,
    profiles,
    schoolCosts,
  ] = await Promise.all([
    safeListAllDocuments(FLIGHTS_COLLECTION_ID, [
      schoolFilter,
      sdk.Query.greaterThanEqual("flight_date", fromDate),
      sdk.Query.lessThanEqual("flight_date", toDate),
    ]),
    safeListAllDocuments(STUDENT_CREDITS_COLLECTION_ID, [schoolFilter]),
    safeListAllDocuments(PRODUCT_SALES_COLLECTION_ID, [
      schoolFilter,
      sdk.Query.greaterThanEqual("sale_date", fromDate),
      sdk.Query.lessThanEqual("sale_date", toDate),
    ]),
    safeListAllDocuments(FLIGHT_INSTRUCTOR_PAYMENTS_COLLECTION_ID, [schoolFilter]),
    safeListAllDocuments(FUELINGS_COLLECTION_ID, [
      schoolFilter,
      sdk.Query.greaterThanEqual("occurred_at", fromDate),
      sdk.Query.lessThanEqual("occurred_at", toDate),
    ]),
    safeListAllDocuments(MAINTENANCE_WORK_ORDERS_COLLECTION_ID),
    safeListAllDocuments(AIRCRAFTS_COLLECTION_ID, [schoolFilter]),
    safeListAllDocuments(AIRCRAFT_MODELS_COLLECTION_ID),
    safeListAllDocuments(INSTRUCTOR_COSTS_COLLECTION_ID, [schoolFilter]),
    safeListAllDocuments(PROFILES_COLLECTION_ID, [schoolFilter]),
    getFinancialSchoolCosts(),
  ]);

  const userIds = Array.from(
    new Set(
      [
        ...flights.flatMap((doc) => [doc.student_user_id || doc.user_id, doc.instructor_user_id]),
        ...credits.map((doc) => doc.user_id),
        ...productSales.map((doc) => doc.user_id),
        ...instructorCosts.map((doc) => doc.instructor_user_id),
      ].filter(Boolean),
    ),
  );
  const usersList = await getUsersByIds(userIds).catch(() => []);

  return {
    flights,
    credits,
    productSales,
    instructorPayments,
    fuelings,
    workOrders,
    aircrafts,
    models,
    instructorCosts,
    usersById: new Map(usersList.map((user) => [user.$id, user])),
    profilesByUserId: new Map(profiles.map((profile) => [profile.user_id, profile])),
    schoolCosts,
  };
}

function completedFinancialFlights(data, month) {
  return data.flights
    .filter((flight) => inMonth(flight, month, "flight_date", "$createdAt"))
    .filter((flight) => flight.instructor_signed === true || flight.flight_status === "Realizado")
    .map((flight) => {
      const aircraftIdent = normalizeAircraftIdent(flight.aircraft_ident);
      const aircraft = data.aircrafts.find((row) => normalizeAircraftIdent(row.registration) === aircraftIdent) || null;
      const model = aircraft ? data.models.find((row) => row.$id === aircraft.model_id) : null;
      const minutes = flightBlockMinutes(flight);
      return {
        doc: flight,
        id: flight.$id,
        date: docDate(flight, "flight_date", "$createdAt"),
        hours: roundHours(minutes / 60),
        aircraft,
        aircraftIdent,
        model,
        studentUserId: flight.student_user_id || flight.user_id || null,
        instructorUserId: flight.instructor_user_id || null,
        isNight: Boolean(flight.is_night),
        typeLabel: flight.training_mission_id || flight.training_track_id || "Voo",
      };
    });
}

function creditDateSortKey(credit) {
  return `${docDate(credit, "purchase_date", "$createdAt") || "9999-12-31"}:${credit.$createdAt || ""}:${credit.$id || ""}`;
}

function computeFirstCreditEnrollmentCost(month, data) {
  const firstCreditByStudent = new Map();
  for (const credit of data.credits) {
    const userId = credit.user_id || "";
    if (!userId) continue;
    const current = firstCreditByStudent.get(userId);
    if (!current || creditDateSortKey(credit).localeCompare(creditDateSortKey(current)) < 0) {
      firstCreditByStudent.set(userId, credit);
    }
  }

  const byStudent = [];
  const byCredit = [];
  let total = 0;
  for (const [userId, credit] of firstCreditByStudent.entries()) {
    if (!inMonth(credit, month, "purchase_date", "$createdAt")) continue;
    const snapshot = creditCostSnapshot(credit);
    const amount = roundMoney(snapshot?.enrollmentCost ?? data.schoolCosts.enrollmentCost);
    if (amount <= 0) continue;
    total += amount;
    byStudent.push({
      label: userLabel(userId, data.usersById, data.profilesByUserId),
      amount,
      valueType: "money",
      meta: { creditId: credit.$id || null, purchaseDate: docDate(credit, "purchase_date", "$createdAt") || null },
    });
    byCredit.push({
      label: credit.$id || "Credito sem ID",
      amount,
      valueType: "money",
      meta: { student: userLabel(userId, data.usersById, data.profilesByUserId), purchaseDate: docDate(credit, "purchase_date", "$createdAt") || null },
    });
  }

  return {
    amount: roundMoney(total),
    breakdown: {
      by_student: byStudent,
      by_credit: byCredit,
      total: [{ label: "Total", amount: roundMoney(total), valueType: "money" }],
    },
  };
}

function makeLine(key, parentKey, level, section, label, valueType, formulaLabel, amount, breakdown, extra = {}) {
  return { key, parentKey, level, section, label, valueType, formulaLabel, amount: roundMoney(amount), breakdown: breakdown || {}, ...extra };
}

function selectedDeductionTotal(deductions, buckets) {
  return (
    (deductions.aircraftCosts ? buckets.aircraft : 0) +
    (deductions.fuelCosts ? buckets.fuel : 0) +
    (deductions.instructorTransfer ? buckets.instructor : 0) +
    (deductions.paymentMethodFees ? buckets.paymentFees : 0) +
    (deductions.workOrderCosts ? buckets.workOrders : 0)
  );
}

function manualAmountForMonth(line, month, valuesByMonth) {
  const monthly = valuesByMonth?.[month] || {};
  return Object.prototype.hasOwnProperty.call(monthly, line.id) ? roundMoney(monthly[line.id]) : roundMoney(line.defaultAmount);
}

function manualLinesForMonth(month, schoolCosts) {
  const valuesByMonth = schoolCosts.manualDreValues || {};
  return (schoolCosts.manualDreLines || [])
    .filter((line) => line.active !== false && DRE_SECTION_LABELS[line.sectionKey])
    .map((line) => ({
      ...line,
      amount: manualAmountForMonth(line, month, valuesByMonth),
    }));
}

function manualImpactBySection(manualLines) {
  const impact = Object.fromEntries(DRE_LEVEL1_SECTIONS.map((section) => [section.key, 0]));
  for (const line of manualLines) {
    const sectionKey = normalizeDreSectionKey(line.sectionKey);
    impact[sectionKey] = roundMoney((impact[sectionKey] || 0) + numValue(line.amount));
  }
  return impact;
}

function injectManualDreLines(rows, manualLines) {
  if (!manualLines.length) return rows;
  const result = [];
  for (const row of rows) {
    result.push(row);
    if (row.level !== 1) continue;
    const sectionManualLines = manualLines.filter((line) => normalizeDreSectionKey(line.sectionKey) === row.key);
    for (const line of sectionManualLines) {
      result.push(
        makeLine(
          `manual_${line.id}`,
          row.key,
          2,
          row.section,
          line.name,
          "money",
          "Lancamento manual",
          line.amount,
          {
            manual: [{ label: line.name, amount: line.amount, valueType: "money" }],
          },
          { isManual: true, manualLineId: line.id },
        ),
      );
    }
  }
  return result;
}

function computeOpenFinancialMonth(month, data) {
  const flights = completedFinancialFlights(data, month);
  const monthCredits = data.credits.filter((credit) => inMonth(credit, month, "purchase_date", "$createdAt"));
  const monthSales = data.productSales.filter((sale) => inMonth(sale, month, "sale_date", "$createdAt"));
  const monthFuelings = data.fuelings.filter((fueling) => inMonth(fueling, month, "occurred_at", "$createdAt"));
  const monthWorkOrders = data.workOrders.filter((order) => inMonth(order, month, "opened_at", "$createdAt"));
  const monthPayments = data.instructorPayments.filter((payment) => inMonth(payment, month, "calculated_at", "$createdAt"));
  const studentAmountByFlightId = new Map();
  for (const payment of data.instructorPayments) {
    const flightId = payment.flight_id || "";
    if (!flightId) continue;
    studentAmountByFlightId.set(flightId, roundMoney((studentAmountByFlightId.get(flightId) || 0) + numValue(payment.student_amount_calculated)));
  }

  const by = {};
  let flightRevenue = 0;
  for (const flight of flights) {
    const amount = studentAmountByFlightId.get(flight.id) || 0;
    flightRevenue += amount;
    addBreakdown(by, "by_student", userLabel(flight.studentUserId, data.usersById, data.profilesByUserId), amount);
    addBreakdown(by, "by_aircraft", flight.aircraftIdent || "Não informado", amount);
    addBreakdown(by, "by_instructor", userLabel(flight.instructorUserId, data.usersById, data.profilesByUserId), amount);
    addBreakdown(by, "by_model", flight.model?.name || "Modelo não informado", amount);
  }
  flightRevenue = roundMoney(flightRevenue);
  const enrollmentCost = computeFirstCreditEnrollmentCost(month, data);

  const productBreakdown = {};
  let productRevenue = 0;
  let productPriceDeviation = 0;
  for (const sale of monthSales) {
    productRevenue += numValue(sale.amount_paid);
    productPriceDeviation += numValue(sale.amount_paid) - numValue(sale.ideal_price);
    addBreakdown(productBreakdown, "by_product", sale.product_name || "Produto nao informado", numValue(sale.amount_paid));
    addBreakdown(productBreakdown, "by_payment_method", sale.payment_method || "Não informado", numValue(sale.amount_paid));
  }
  productBreakdown.price_deviation = [{ label: "Desvio de preço ideal", amount: roundMoney(productPriceDeviation), valueType: "money" }];
  productRevenue = roundMoney(productRevenue);

  const cashCreditBreakdown = {};
  let cashCredits = 0;
  let cashCreditHours = 0;
  for (const credit of monthCredits) {
    const amount = numValue(credit.amount_paid);
    const hours = numValue(credit.hours);
    cashCredits += amount;
    cashCreditHours += hours;
    addBreakdown(cashCreditBreakdown, "by_student", userLabel(credit.user_id, data.usersById, data.profilesByUserId), amount);
    addBreakdown(cashCreditBreakdown, "by_payment_method", credit.payment_method || "Não informado", amount);
    addBreakdown(cashCreditBreakdown, "hours_sold", "Horas vendidas", hours, "hours");
  }
  cashCredits = roundMoney(cashCredits);
  cashCreditHours = roundHours(cashCreditHours);
  cashCreditBreakdown.total = [
    { label: "Créditos de horas vendidos", amount: cashCredits, valueType: "money" },
    { label: "Horas vendidas", amount: cashCreditHours, valueType: "hours" },
  ];
  const manualLines = manualLinesForMonth(month, data.schoolCosts);
  const manualImpact = manualImpactBySection(manualLines);
  const manualRevenue = manualImpact.section_revenue || 0;
  const manualCashRevenue = manualImpact.section_cash_revenue || 0;
  const manualCommercialDeductions = manualImpact.section_commercial_deductions || 0;
  const manualVariableCosts = manualImpact.section_variable_costs || 0;
  const manualOperationalMargin = manualImpact.section_operational_margin || 0;
  const manualFixedCosts = manualImpact.section_fixed_costs || 0;
  const manualEbitda = manualImpact.section_ebitda || 0;
  const manualTaxes = manualImpact.section_taxes || 0;
  const manualNetProfit = manualImpact.section_net_profit || 0;
  const cashProducts = productRevenue;
  const cashRevenue = roundMoney(cashCredits + cashProducts + manualCashRevenue);

  const grossRevenueBase = roundMoney(flightRevenue + productRevenue);
  const grossRevenue = roundMoney(grossRevenueBase + manualRevenue);
  const revenueTaxBase = roundMoney(-1 * (grossRevenueBase * data.schoolCosts.taxConfig.revenueRatePercent) / 100);
  const revenueTax = revenueTaxBase;
  const flightRevenueTax = roundMoney(-1 * (flightRevenue * data.schoolCosts.taxConfig.revenueRatePercent) / 100);
  const productRevenueTax = roundMoney(-1 * (productRevenue * data.schoolCosts.taxConfig.revenueRatePercent) / 100);
  const flightRevenueAfterTax = roundMoney(flightRevenue + flightRevenueTax);
  const productRevenueAfterTax = roundMoney(productRevenue + productRevenueTax);
  const revenueAfterTax = roundMoney(grossRevenue + revenueTax);

  let paymentFeesCredits = 0;
  for (const credit of monthCredits) {
    const snapshot = creditCostSnapshot(credit);
    paymentFeesCredits += snapshot?.totalCostCalculated ?? paymentFee(numValue(credit.amount_paid), credit.payment_method, data.schoolCosts.paymentMethodCosts);
  }
  let paymentFeesProducts = 0;
  for (const sale of monthSales) {
    paymentFeesProducts += paymentFee(numValue(sale.amount_paid), sale.payment_method, data.schoolCosts.paymentMethodCosts);
  }
  const paymentFees = roundMoney(-1 * (paymentFeesCredits + paymentFeesProducts));

  const instructorVariableRaw = roundMoney(monthPayments.reduce((acc, item) => acc + numValue(item.total_calculated), 0));
  const instructorFixedRaw = roundMoney(
    data.instructorCosts.reduce((acc, item) => acc + numValue(item.monthly_fixed_cost), 0),
  );
  const instructorVariable = roundMoney(-1 * instructorVariableRaw);
  const instructorFixed = roundMoney(-1 * instructorFixedRaw);

  const fuelCostRaw = roundMoney(monthFuelings.reduce((acc, item) => acc + numValue(item.total_value), 0));
  const fuelCost = roundMoney(-1 * fuelCostRaw);
  const fuelLiters = monthFuelings.reduce((acc, item) => acc + numValue(item.quantity_liters), 0);
  const workOrderParts = monthWorkOrders.reduce((acc, item) => acc + workOrderCost(item).parts, 0);
  const workOrderLabor = monthWorkOrders.reduce((acc, item) => acc + workOrderCost(item).labor, 0);
  const workOrderOther = monthWorkOrders.reduce((acc, item) => acc + workOrderCost(item).other, 0);
  const workOrderTotalRaw = roundMoney(workOrderParts + workOrderLabor + workOrderOther);
  const workOrderTotal = roundMoney(-1 * workOrderTotalRaw);

  const aircraftEstimated = roundMoney(
    flights.reduce((acc, flight) => acc + flight.hours * numValue(flight.aircraft?.cost_per_flight_hour), 0),
  );
  const flownAircraftIds = new Set(flights.map((flight) => flight.aircraft?.$id).filter(Boolean));
  const aircraftFixedRaw = roundMoney(data.aircrafts.filter((aircraft) => flownAircraftIds.has(aircraft.$id)).reduce((acc, aircraft) => acc + aircraftFixedCost(aircraft), 0));
  const aircraftFixed = roundMoney(-1 * aircraftFixedRaw);
  const aircraftMaintenanceReserveMonthly = roundMoney(
    data.aircrafts.filter((aircraft) => flownAircraftIds.has(aircraft.$id)).reduce((acc, aircraft) => acc + aircraftMaintenanceReserve(aircraft), 0),
  );
  const enrollmentAllocated = roundMoney(-1 * enrollmentCost.amount);
  const commercialDeductions = roundMoney(paymentFees + enrollmentAllocated + manualCommercialDeductions);
  const variableCosts = roundMoney(instructorVariable + fuelCost + workOrderTotal + manualVariableCosts);
  const operationalMargin = roundMoney(grossRevenue + commercialDeductions + variableCosts + manualOperationalMargin);
  const fixedCosts = roundMoney(instructorFixed + aircraftFixed + manualFixedCosts);
  const ebitda = roundMoney(operationalMargin + fixedCosts + manualEbitda);
  const assetVariationTotal = roundMoney(-1 * (aircraftEstimated + aircraftMaintenanceReserveMonthly));
  const totalOperationalCosts = roundMoney(commercialDeductions + variableCosts + fixedCosts);
  // Use flight_instructor_payments.flight_minutes_considered as the authoritative hours source
  const totalHours = roundHours(monthPayments.reduce((acc, p) => acc + (numValue(p.flight_minutes_considered) / 60), 0));

  const grossProfitTax = roundMoney(-1 * (Math.max(0, operationalMargin) * data.schoolCosts.taxConfig.grossProfitRatePercent) / 100);
  const netBeforeTax = roundMoney(ebitda + revenueTax + grossProfitTax + manualTaxes);
  const netProfitTax = roundMoney(-1 * (Math.max(0, netBeforeTax) * data.schoolCosts.taxConfig.netProfitRatePercent) / 100);
  const totalTaxes = roundMoney(revenueTax + grossProfitTax + netProfitTax + manualTaxes);
  const finalNet = roundMoney(ebitda + totalTaxes + manualNetProfit);

  const lineRows = [
    makeLine("section_asset_variation", null, 1, "Linha extra", "Linha extra", "money", "", assetVariationTotal),
    makeLine("aircraft_calculated_depreciation", "section_asset_variation", 2, "Linha extra", "Depreciação calculada", "money", "Horas voadas x custo por hora configurado na aeronave", roundMoney(-1 * aircraftEstimated), {
      aircrafts: flights.map((flight) => ({
        label: flight.aircraftIdent || flight.aircraft?.registration || "Aeronave não informada",
        amount: roundMoney(-1 * flight.hours * numValue(flight.aircraft?.cost_per_flight_hour)),
        valueType: "money",
        meta: { hours: flight.hours, costPerHour: numValue(flight.aircraft?.cost_per_flight_hour) },
      })),
      total: [{ label: "Total", amount: roundMoney(-1 * aircraftEstimated), valueType: "money" }],
    }),
    makeLine("aircraft_maintenance_reserve", "section_asset_variation", 2, "Linha extra", "Reserva mensal de manutenção", "money", "Reserva mensal configurada nas aeronaves voadas", roundMoney(-1 * aircraftMaintenanceReserveMonthly), {
      aircrafts: data.aircrafts
        .filter((aircraft) => flownAircraftIds.has(aircraft.$id))
        .map((aircraft) => ({ label: aircraft.registration || aircraft.$id, amount: roundMoney(-1 * aircraftMaintenanceReserve(aircraft)), valueType: "money" })),
      total: [{ label: "Total", amount: roundMoney(-1 * aircraftMaintenanceReserveMonthly), valueType: "money" }],
    }),
    makeLine("section_revenue", null, 1, "Receitas", "Receitas", "money", "", grossRevenue),
    makeLine("revenue_flights", "section_revenue", 2, "Receitas", "Receita reconhecida de voos", "money", "flight_instructor_payments.student_amount_calculated", flightRevenue, by),
    makeLine("revenue_products", "section_revenue", 2, "Receitas", "Receita de produtos e serviços", "money", "product_sales.amount_paid", productRevenue, productBreakdown),
    makeLine("gross_operational_revenue", "section_revenue", 2, "Receitas", "Receita bruta operacional", "money", "Voos + produtos/serviços", grossRevenue, {
      by_source: [
        { label: "Voos", amount: flightRevenue, valueType: "money" },
        { label: "Produtos/serviços", amount: productRevenue, valueType: "money" },
      ],
      source_share: [
        { label: "Voos", amount: grossRevenue ? roundMoney((flightRevenue / grossRevenue) * 100) : 0, valueType: "percent" },
        { label: "Produtos/serviços", amount: grossRevenue ? roundMoney((productRevenue / grossRevenue) * 100) : 0, valueType: "percent" },
      ],
    }),
    makeLine("section_cash_revenue", null, 1, "Receita (fluxo de caixa)", "Receita (fluxo de caixa)", "money", "", cashRevenue),
    makeLine("cash_revenue_flight_credits", "section_cash_revenue", 2, "Receita (fluxo de caixa)", "Venda de créditos de horas", "money", "Créditos de horas vendidos no mês", cashCredits, cashCreditBreakdown),
    makeLine("cash_revenue_products", "section_cash_revenue", 2, "Receita (fluxo de caixa)", "Venda de produtos e serviços", "money", "product_sales.amount_paid", cashProducts, productBreakdown),
    makeLine("cash_gross_revenue", "section_cash_revenue", 2, "Receita (fluxo de caixa)", "Receita bruta de caixa", "money", "Créditos vendidos + produtos/serviços vendidos", cashRevenue, {
      by_source: [
        { label: "Créditos de horas vendidos", amount: cashCredits, valueType: "money" },
        { label: "Produtos/serviços vendidos", amount: cashProducts, valueType: "money" },
      ],
      source_share: [
        { label: "Créditos de horas vendidos", amount: cashRevenue ? roundMoney((cashCredits / cashRevenue) * 100) : 0, valueType: "percent" },
        { label: "Produtos/serviços vendidos", amount: cashRevenue ? roundMoney((cashProducts / cashRevenue) * 100) : 0, valueType: "percent" },
      ],
    }),
    makeLine("section_commercial_deductions", null, 1, "Deduções e Perdas Comerciais", "Deduções e Perdas Comerciais", "money", "", commercialDeductions),
    makeLine("payment_fees", "section_commercial_deductions", 2, "Deduções e Perdas Comerciais", "Taxas/custos de recebimento", "money", "Custos fixos e percentuais por método", paymentFees, {
      payment_fees: [
        { label: "Créditos de horas", amount: roundMoney(-1 * paymentFeesCredits), valueType: "money" },
        { label: "Produtos/serviços", amount: roundMoney(-1 * paymentFeesProducts), valueType: "money" },
        { label: "Total", amount: paymentFees, valueType: "money" },
      ],
    }),
    makeLine("allocated_enrollment_cost", "section_commercial_deductions", 2, "Deduções e Perdas Comerciais", "Custo de matrícula alocado", "money", "Custo integral no primeiro crédito comprado pelo aluno", enrollmentAllocated, signedBreakdown(enrollmentCost.breakdown, -1)),
    makeLine("total_commercial_deductions", "section_commercial_deductions", 2, "Deduções e Perdas Comerciais", "Total de deduções e perdas comerciais", "money", "Soma das deduções e perdas comerciais", commercialDeductions, {
      total: [{ label: "Total", amount: commercialDeductions, valueType: "money" }],
    }),
    makeLine("section_variable_costs", null, 1, "Custos Variáveis", "Custos Variáveis", "money", "", variableCosts),
    makeLine("instructor_variable_transfer", "section_variable_costs", 2, "Custos Variáveis", "Repasse variável de instrutores", "money", "flight_instructor_payments.total_calculated", instructorVariable, {
      instructors: monthPayments.map((payment) => ({
        label: userLabel(payment.instructor_user_id, data.usersById, data.profilesByUserId),
        amount: roundMoney(-1 * numValue(payment.total_calculated)),
        valueType: "money",
      })),
      total: [{ label: "Total", amount: instructorVariable, valueType: "money" }],
    }),
    makeLine("fuel_cost", "section_variable_costs", 2, "Custos Variáveis", "Abastecimentos / combustível", "money", "aircraft_fuelings.total_value", fuelCost, {
      fuel: [
        { label: "Litros", amount: roundMoney(fuelLiters), valueType: "number" },
        { label: "Preço médio por litro", amount: fuelLiters ? roundMoney(fuelCost / fuelLiters) : 0, valueType: "money" },
        { label: "Custo por hora voada", amount: totalHours ? roundMoney(fuelCost / totalHours) : 0, valueType: "money" },
        { label: "Total", amount: fuelCost, valueType: "money" },
      ],
    }),
    makeLine("work_order_cost", "section_variable_costs", 2, "Custos Variáveis", "Manutenção real / OS", "money", "Peças + mão de obra + outros", workOrderTotal, {
      work_orders: [
        { label: "Peças", amount: roundMoney(-1 * workOrderParts), valueType: "money" },
        { label: "Mão de obra", amount: roundMoney(-1 * workOrderLabor), valueType: "money" },
        { label: "Outros custos", amount: roundMoney(-1 * workOrderOther), valueType: "money" },
        { label: "Total", amount: workOrderTotal, valueType: "money" },
      ],
    }),
    makeLine("total_variable_costs", "section_variable_costs", 2, "Custos Variáveis", "Total de custos variáveis", "money", "Soma dos custos variáveis", variableCosts, {
      total: [{ label: "Total", amount: variableCosts, valueType: "money" }],
    }),
    makeLine("section_operational_margin", null, 1, "Margem Operacional", "Margem Operacional", "money", "", operationalMargin),
    makeLine("operational_margin_result", "section_operational_margin", 2, "Margem Operacional", "Margem Operacional", "money", "Receita + deduções/perdas comerciais + custos variáveis", operationalMargin, {
      margin: [
        { label: "Valor", amount: operationalMargin, valueType: "money" },
        { label: "Margem operacional percentual", amount: grossRevenue ? roundMoney((operationalMargin / grossRevenue) * 100) : 0, valueType: "percent" },
      ],
    }),
    makeLine("section_fixed_costs", null, 1, "Custos Fixos", "Custos Fixos", "money", "", fixedCosts),
    makeLine("instructor_fixed_cost", "section_fixed_costs", 2, "Custos Fixos", "Custo fixo mensal de instrutores", "money", "Custos fixos mensais configurados", instructorFixed, {
      instructors: data.instructorCosts
        .filter((item) => numValue(item.monthly_fixed_cost) > 0)
        .map((item) => ({ label: userLabel(item.instructor_user_id, data.usersById, data.profilesByUserId), amount: roundMoney(-1 * numValue(item.monthly_fixed_cost)), valueType: "money" })),
      per_hour: [{ label: "Custo fixo por hora voada", amount: totalHours ? roundMoney(instructorFixed / totalHours) : 0, valueType: "money" }],
    }),
    makeLine("aircraft_fixed_cost", "section_fixed_costs", 2, "Custos Fixos", "Custos fixos das aeronaves", "money", "Hangaragem + seguro + leasing + outros custos fixos", aircraftFixed, {
      aircrafts: data.aircrafts
        .filter((aircraft) => flownAircraftIds.has(aircraft.$id))
        .map((aircraft) => ({ label: aircraft.registration || aircraft.$id, amount: roundMoney(-1 * aircraftFixedCost(aircraft)), valueType: "money" })),
      total: [{ label: "Total", amount: aircraftFixed, valueType: "money" }],
    }),
    makeLine("total_fixed_costs", "section_fixed_costs", 2, "Custos Fixos", "Total de custos fixos", "money", "Soma dos custos fixos", fixedCosts, {
      total: [{ label: "Total", amount: fixedCosts, valueType: "money" }],
    }),
    makeLine("section_ebitda", null, 1, "EBITDA (Resultado Operacional)", "EBITDA (Resultado Operacional)", "money", "", ebitda),
    makeLine("ebitda_result", "section_ebitda", 2, "EBITDA (Resultado Operacional)", "EBITDA (Resultado Operacional)", "money", "Margem Operacional + Custos Fixos", ebitda, {
      margin: [
        { label: "Valor", amount: ebitda, valueType: "money" },
        { label: "Margem EBITDA percentual", amount: grossRevenue ? roundMoney((ebitda / grossRevenue) * 100) : 0, valueType: "percent" },
      ],
    }),
    makeLine("section_taxes", null, 1, "Impostos", "Impostos", "money", "", totalTaxes),
    makeLine("revenue_tax", "section_taxes", 2, "Impostos", "Imposto sobre faturamento", "money", "Receita bruta x alíquota", revenueTax, {
      taxes: [
        { label: "Imposto sobre voos", amount: flightRevenueTax, valueType: "money" },
        { label: "Imposto sobre produtos/serviços", amount: productRevenueTax, valueType: "money" },
        { label: "Total", amount: revenueTax, valueType: "money" },
      ],
    }),
    makeLine("gross_profit_tax", "section_taxes", 2, "Impostos", "Imposto sobre margem operacional", "money", "MAX(0, margem operacional) x alíquota", grossProfitTax, {
      tax: [
        { label: "Imposto calculado", amount: grossProfitTax, valueType: "money" },
        { label: "Base de cálculo", amount: operationalMargin, valueType: "money" },
      ],
    }),
    makeLine("net_profit_tax", "section_taxes", 2, "Impostos", "Imposto sobre lucro líquido", "money", "MAX(0, EBITDA + impostos anteriores) x alíquota", netProfitTax, {
      tax: [{ label: "Valor do imposto", amount: netProfitTax, valueType: "money" }],
    }),
    makeLine("total_taxes", "section_taxes", 2, "Impostos", "Total de impostos", "money", "Soma dos impostos", totalTaxes, {
      tax: [{ label: "Total", amount: totalTaxes, valueType: "money" }],
    }),
    makeLine("section_net_profit", null, 1, "Lucro Líquido", "Lucro Líquido", "money", "", finalNet),
    makeLine("net_profit_before_tax", "section_net_profit", 2, "Lucro Líquido", "Resultado antes do imposto final", "money", "EBITDA + impostos sobre faturamento/margem", netBeforeTax, {
      margin: [
        { label: "Valor", amount: netBeforeTax, valueType: "money" },
        { label: "Margem antes do imposto final", amount: grossRevenue ? roundMoney((netBeforeTax / grossRevenue) * 100) : 0, valueType: "percent" },
      ],
    }),
    makeLine("final_net_result", "section_net_profit", 2, "Lucro Líquido", "Resultado líquido final", "money", "EBITDA + impostos", finalNet, {
      margin: [
        { label: "Valor", amount: finalNet, valueType: "money" },
        { label: "Margem líquida final", amount: grossRevenue ? roundMoney((finalNet / grossRevenue) * 100) : 0, valueType: "percent" },
      ],
    }),
    // Meta lines: stored in DRE snapshot so they survive month closing. Not displayed in DRE table.
    makeLine("meta_flown_hours", null, 1, "Meta", "Horas Voadas", "hours", "flight_instructor_payments.flight_minutes_considered / 60", totalHours),
    makeLine("meta_fuel_liters", null, 1, "Meta", "Litros Abastecidos", "number", "aircraft_fuelings.quantity_liters", fuelLiters),
  ];

  const signedLineRows = injectManualDreLines(lineRows, manualLines);
  const pendingPurchased = roundHours(data.credits.reduce((acc, credit) => acc + numValue(credit.hours), 0));
  const pendingConsumed = roundHours(flights.reduce((acc, flight) => acc + flight.hours, 0));
  const cards = [
    { key: "cash_received", label: "Caixa recebido no período", valueType: "money", total: roundMoney(cashCredits + cashProducts), details: { total: [{ label: "Créditos de horas vendidos", amount: cashCredits, valueType: "money" }, { label: "Produtos/serviços vendidos", amount: cashProducts, valueType: "money" }, { label: "Total", amount: roundMoney(cashCredits + cashProducts), valueType: "money" }] } },
    { key: "student_pending_credit", label: "Credito pendente dos alunos", valueType: "hours", total: roundHours(Math.max(0, pendingPurchased - pendingConsumed)), details: { total: [{ label: "Total comprado", amount: pendingPurchased, valueType: "hours" }, { label: "Total consumido", amount: pendingConsumed, valueType: "hours" }, { label: "Saldo pendente", amount: roundHours(Math.max(0, pendingPurchased - pendingConsumed)), valueType: "hours" }] } },
    { key: "flown_hours", label: "Horas voadas no periodo", valueType: "hours", total: totalHours, details: { total: [{ label: "Total", amount: totalHours, valueType: "hours" }] } },
    { key: "revenue_per_hour", label: "Receita media por hora voada", valueType: "money", total: totalHours ? roundMoney(flightRevenue / totalHours) : 0, details: {} },
    { key: "cost_per_hour", label: "Custo medio por hora voada", valueType: "money", total: totalHours ? roundMoney(totalOperationalCosts / totalHours) : 0, details: {} },
    { key: "result_per_hour", label: "Resultado por hora voada", valueType: "money", total: totalHours ? roundMoney(finalNet / totalHours) : 0, details: {} },
    { key: "fuel_per_hour", label: "Combustivel por hora", valueType: "money", total: totalHours ? roundMoney(fuelCost / totalHours) : 0, details: {} },
    { key: "instructor_per_hour", label: "Instrutor por hora", valueType: "money", total: totalHours ? roundMoney((instructorVariable + instructorFixed) / totalHours) : 0, details: {} },
    { key: "maintenance_per_hour", label: "Manutenção por hora", valueType: "money", total: totalHours ? roundMoney(workOrderTotal / totalHours) : 0, details: {} },
  ];

  return { lines: signedLineRows, cards };
}

function mergeMonthlyLines(months, monthlyRows) {
  const byKey = new Map();
  for (const month of months) {
    for (const row of monthlyRows.get(month.key)?.lines || []) {
      const line = byKey.get(row.key) || {
        key: row.key,
        parentKey: row.parentKey,
        level: row.level,
        section: row.section,
        label: row.label,
        valueType: row.valueType,
        formulaLabel: row.formulaLabel,
        values: {},
        breakdown: {},
        ...(row.isManual ? { isManual: true, manualLineId: row.manualLineId || row.key.replace(/^manual_/, "") } : {}),
      };
      line.values[month.key] = row.amount;
      if (row.breakdown && Object.keys(row.breakdown).length > 0) line.breakdown[month.key] = row.breakdown;
      byKey.set(row.key, line);
    }
  }
  for (const line of byKey.values()) {
    for (const month of months) {
      if (!(month.key in line.values)) line.values[month.key] = 0;
    }
  }
  return Array.from(byKey.values());
}

function mergeMonthlyCards(months, monthlyRows) {
  const byKey = new Map();
  for (const month of months) {
    for (const card of monthlyRows.get(month.key)?.cards || []) {
      const merged = byKey.get(card.key) || {
        key: card.key,
        label: card.label,
        valueType: card.valueType,
        values: {},
        total: 0,
        details: {},
      };
      merged.values[month.key] = card.total;
      merged.total = roundMoney(merged.total + card.total);
      merged.details[month.key] = card.details?.total || [];
      byKey.set(card.key, merged);
    }
  }
  for (const card of byKey.values()) {
    for (const month of months) {
      if (!(month.key in card.values)) card.values[month.key] = 0;
    }
  }
  return Array.from(byKey.values());
}

async function findFinancialClosings(months) {
  const docs = await safeListAllDocuments(FINANCIAL_MONTHLY_CLOSINGS_COLLECTION_ID, [
    sdk.Query.equal("school_id", [SCHOOL_ID]),
    sdk.Query.equal("month", months),
  ]);
  const latestByMonth = new Map();
  for (const doc of docs) {
    const current = latestByMonth.get(doc.month);
    if (!current || String(doc.$updatedAt || doc.$createdAt || "").localeCompare(String(current.$updatedAt || current.$createdAt || "")) > 0) {
      latestByMonth.set(doc.month, doc);
    }
  }
  return latestByMonth;
}

async function loadClosedFinancialMonth(closing) {
  const lineDocs = await safeListAllDocuments(FINANCIAL_MONTHLY_CLOSING_LINES_COLLECTION_ID, [
    sdk.Query.equal("closing_id", [closing.$id]),
    sdk.Query.orderAsc("sort_order"),
  ]);
  return {
    lines: lineDocs.map((doc) => {
      const lineKey = doc.line_key || "";
      return makeLine(
        lineKey,
        doc.parent_line_key || null,
        numValue(doc.level),
        doc.section || "",
        doc.label || "",
        doc.value_type || "money",
        doc.formula_label || "",
        numValue(doc.amount),
        parseMaybeJson(doc.breakdown_json, {}),
        lineKey.startsWith("manual_") ? { isManual: true, manualLineId: lineKey.replace(/^manual_/, "") } : {},
      );
    }),
    cards: parseMaybeJson(closing.cards_json, []),
  };
}

async function buildFinancialDre(params) {
  const monthKeys = listMonthKeys(params.fromMonth, params.toMonth);
  const closings = await findFinancialClosings(monthKeys);
  const months = monthKeys.map((key) => {
    const closing = closings.get(key);
    const status = closing?.status === "closed" ? "closed" : closing?.status === "reopened" ? "reopened" : "open";
    return { key, label: monthLabel(key), status, closingId: closing?.$id || null, isPast: isPastMonth(key) };
  });
  const data = await fetchFinancialBaseData(monthKeys[0], monthKeys[monthKeys.length - 1]);
  const monthlyRows = new Map();
  for (const month of months) {
    const closing = closings.get(month.key);
    if (closing?.status === "closed") {
      monthlyRows.set(month.key, await loadClosedFinancialMonth(closing));
    } else {
      monthlyRows.set(month.key, computeOpenFinancialMonth(month.key, data));
    }
  }
  return {
    fromMonth: monthKeys[0],
    toMonth: monthKeys[monthKeys.length - 1],
    months,
    lines: mergeMonthlyLines(months, monthlyRows),
    cards: mergeMonthlyCards(months, monthlyRows),
    generatedAt: nowIso(),
  };
}

async function deleteClosingLines(closingId) {
  const docs = await safeListAllDocuments(FINANCIAL_MONTHLY_CLOSING_LINES_COLLECTION_ID, [sdk.Query.equal("closing_id", [closingId])]);
  await Promise.all(docs.map((doc) => databases.deleteDocument(DATABASE_ID, FINANCIAL_MONTHLY_CLOSING_LINES_COLLECTION_ID, doc.$id).catch(() => null)));
}

async function closeFinancialMonth(actorUserId, month, notes) {
  const key = dreMonthKey(month);
  if (!isPastMonth(key)) throw Object.assign(new Error("Somente meses passados podem ser fechados."), { status: 400 });
  const data = await fetchFinancialBaseData(key, key);
  const computed = computeOpenFinancialMonth(key, data);
  const existing = (await findFinancialClosings([key])).get(key);
  const payload = {
    school_id: SCHOOL_ID,
    month: key,
    status: "closed",
    closed_at: nowIso(),
    closed_by: actorUserId,
    reopened_at: existing?.reopened_at || null,
    reopened_by: existing?.reopened_by || null,
    notes: String(notes || "").slice(0, 2048),
    cards_json: JSON.stringify(computed.cards),
  };
  const closing = existing
    ? await databases.updateDocument(DATABASE_ID, FINANCIAL_MONTHLY_CLOSINGS_COLLECTION_ID, existing.$id, payload)
    : await databases.createDocument(DATABASE_ID, FINANCIAL_MONTHLY_CLOSINGS_COLLECTION_ID, sdk.ID.unique(), payload, ADMIN_DOC_PERMS);
  await deleteClosingLines(closing.$id);
  for (let index = 0; index < computed.lines.length; index += 1) {
    const line = computed.lines[index];
    await databases.createDocument(
      DATABASE_ID,
      FINANCIAL_MONTHLY_CLOSING_LINES_COLLECTION_ID,
      sdk.ID.unique(),
      {
        closing_id: closing.$id,
        line_key: line.key,
        parent_line_key: line.parentKey,
        level: line.level,
        section: line.section,
        label: line.label,
        amount: line.amount,
        value_type: line.valueType,
        formula_label: line.formulaLabel,
        breakdown_json: JSON.stringify(line.breakdown || {}),
        sort_order: index,
      },
      ADMIN_DOC_PERMS,
    );
  }
  return buildFinancialDre({ fromMonth: key, toMonth: key });
}

async function reopenFinancialMonth(actorUserId, month) {
  const key = dreMonthKey(month);
  const existing = (await findFinancialClosings([key])).get(key);
  if (!existing) return buildFinancialDre({ fromMonth: key, toMonth: key });
  await databases.updateDocument(DATABASE_ID, FINANCIAL_MONTHLY_CLOSINGS_COLLECTION_ID, existing.$id, {
    status: "reopened",
    reopened_at: nowIso(),
    reopened_by: actorUserId,
  });
  return buildFinancialDre({ fromMonth: key, toMonth: key });
}

async function findSchoolCostsDocument() {
  const res = await databases.listDocuments(DATABASE_ID, SCHOOL_COSTS_COLLECTION_ID, [
    sdk.Query.equal("school_id", [SCHOOL_ID]),
    sdk.Query.limit(1),
  ]);
  return res.documents?.[0] || null;
}

async function saveFinancialDreManualValue(actorUserId, month, lineId, amount) {
  const key = dreMonthKey(month);
  const closing = (await findFinancialClosings([key])).get(key);
  if (closing?.status === "closed") throw Object.assign(new Error("Mes fechado nao permite edicao manual da DRE."), { status: 400 });
  const safeLineId = String(lineId || "").trim();
  if (!safeLineId) throw Object.assign(new Error("Lancamento manual nao informado."), { status: 400 });
  const doc = await findSchoolCostsDocument();
  const manualLines = parseManualDreLinesDoc(doc || {});
  if (!manualLines.some((line) => line.id === safeLineId && line.active !== false)) {
    throw Object.assign(new Error("Lancamento manual nao encontrado."), { status: 404 });
  }
  const manualValues = parseManualDreValuesDoc(doc || {});
  manualValues[key] = { ...(manualValues[key] || {}), [safeLineId]: roundMoney(amount) };
  const payload = {
    school_id: SCHOOL_ID,
    manual_dre_lines_json: JSON.stringify(manualLines),
    manual_dre_values_json: JSON.stringify(manualValues),
    updated_at: nowIso(),
    updated_by: actorUserId || null,
  };
  if (doc?.$id) {
    await databases.updateDocument(DATABASE_ID, SCHOOL_COSTS_COLLECTION_ID, doc.$id, payload);
  } else {
    await databases.createDocument(DATABASE_ID, SCHOOL_COSTS_COLLECTION_ID, sdk.ID.unique(), {
      ...payload,
      enrollment_cost: 0,
      payment_method_costs_json: JSON.stringify(DEFAULT_PAYMENT_METHOD_COSTS),
      tax_config_json: JSON.stringify(parseTaxConfigDoc({})),
    }, ADMIN_DOC_PERMS);
  }
  return buildFinancialDre({ fromMonth: key, toMonth: key });
}

function maneuverCollectionId(kind) {
  if (kind === "section") return MANEUVERS_SECTIONS_COLLECTION_ID;
  if (kind === "subsection") return MANEUVERS_SUBSECTIONS_COLLECTION_ID;
  if (kind === "article") return MANEUVERS_ARTICLES_COLLECTION_ID;
  return "";
}

function helpCollectionId(kind) {
  if (kind === "section") return HELP_SECTIONS_COLLECTION_ID;
  if (kind === "subsection") return HELP_SUBSECTIONS_COLLECTION_ID;
  if (kind === "article") return HELP_ARTICLES_COLLECTION_ID;
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

function sanitizeHelpData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw Object.assign(new Error("Dados da central de ajuda não informados."), { status: 400 });
  }
  return data;
}

async function createHelpDocument(kind, data) {
  const collectionId = helpCollectionId(kind);
  if (!collectionId) throw Object.assign(new Error("Coleção da central de ajuda não configurada."), { status: 500 });
  return databases.createDocument(DATABASE_ID, collectionId, sdk.ID.unique(), sanitizeHelpData(data));
}

async function updateHelpDocument(kind, documentId, data) {
  const collectionId = helpCollectionId(kind);
  if (!collectionId) throw Object.assign(new Error("Coleção da central de ajuda não configurada."), { status: 500 });
  if (!documentId) throw Object.assign(new Error("Documento da central de ajuda não informado."), { status: 400 });
  return databases.updateDocument(DATABASE_ID, collectionId, documentId, sanitizeHelpData(data));
}

async function deleteHelpDocument(kind, documentId) {
  const collectionId = helpCollectionId(kind);
  if (!collectionId) throw Object.assign(new Error("Coleção da central de ajuda não configurada."), { status: 500 });
  if (!documentId) throw Object.assign(new Error("Documento da central de ajuda não informado."), { status: 400 });
  await databases.deleteDocument(DATABASE_ID, collectionId, documentId);
}

const EMAIL_SETTINGS_KEY = "email";
const EMAIL_BRAND_SETTINGS_KEY = "emailBrand";
const SCHOOL_RULES_KEY = "schoolRules";
const GOOGLE_CALENDAR_SETTINGS_KEY = "googleCalendar";
const NOTIFICATION_CHANNELS = ["email", "push"];
const STUDENT_PORTAL_TABS = ["home", "jornada", "meus-voos", "agendamento", "creditos", "avisos", "manuais", "manobras", "ajuda", "perfil"];
const NOTIFICATION_EVENT_TYPES = ["flight.scheduled", "flight.updated", "flight.reopened", "flight.cancelled", "flight.reminder_24h", "weeklyPlan.submitted", "notice.published", "schedule.published"];
const ADMIN_DOC_PERMS = [
  sdk.Permission.read(sdk.Role.label("admin")),
  sdk.Permission.update(sdk.Role.label("admin")),
  sdk.Permission.delete(sdk.Role.label("admin")),
];
const AUDIT_DOC_PERMS = [
  sdk.Permission.read(sdk.Role.label("admin")),
];

function cleanString(value) {
  return String(value || "").trim();
}

function stableClone(value) {
  if (Array.isArray(value)) return value.map(stableClone);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        const next = stableClone(value[key]);
        acc[key] = next === undefined ? null : next;
        return acc;
      }, {});
  }
  return value === undefined ? null : value;
}

function stableStringify(value) {
  return JSON.stringify(stableClone(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function snapshotJson(value) {
  const text = stableStringify(value ?? null);
  return text.length > 65535 ? text.slice(0, 65535) : text;
}

async function createAuditEvent(actorUserId, input = {}) {
  if (!AUDIT_EVENTS_COLLECTION_ID) return null;
  const occurredAt = nowIso();
  const beforeSnapshotJson = snapshotJson(input.beforeSnapshot ?? null);
  const afterSnapshotJson = snapshotJson(input.afterSnapshot ?? null);
  const eventPayload = {
    event_type: cleanString(input.eventType).slice(0, 64),
    entity_type: cleanString(input.entityType).slice(0, 64),
    entity_id: cleanString(input.entityId).slice(0, 128),
    actor_user_id: cleanString(actorUserId).slice(0, 64),
    actor_role: cleanString(input.actorRole || "admin").slice(0, 32),
    school_id: SCHOOL_ID,
    occurred_at: occurredAt,
    ip: cleanString(input.ip).slice(0, 128) || null,
    user_agent: cleanString(input.userAgent).slice(0, 512) || null,
    reason: cleanString(input.reason).slice(0, 2048) || null,
    before_snapshot_json: beforeSnapshotJson,
    after_snapshot_json: afterSnapshotJson,
    before_hash: sha256(beforeSnapshotJson),
    after_hash: sha256(afterSnapshotJson),
  };
  const eventHashSource = stableStringify(eventPayload);
  const doc = await databases.createDocument(
    DATABASE_ID,
    AUDIT_EVENTS_COLLECTION_ID,
    sdk.ID.unique(),
    {
      ...eventPayload,
      event_hash: sha256(eventHashSource),
    },
    AUDIT_DOC_PERMS,
  );
  return doc;
}

async function listActiveFlightSignatures(flightId) {
  if (!FLIGHT_SIGNATURES_COLLECTION_ID) return [];
  const res = await databases.listDocuments(DATABASE_ID, FLIGHT_SIGNATURES_COLLECTION_ID, [
    sdk.Query.equal("flight_id", [flightId]),
    sdk.Query.limit(100),
  ]);
  return res.documents.filter((doc) => String(doc.status || "active") === "active");
}

async function listInstructorPaymentSnapshotsForFlight(flightId) {
  if (!FLIGHT_INSTRUCTOR_PAYMENTS_COLLECTION_ID) return [];
  const res = await databases.listDocuments(DATABASE_ID, FLIGHT_INSTRUCTOR_PAYMENTS_COLLECTION_ID, [
    sdk.Query.equal("flight_id", [flightId]),
    sdk.Query.limit(100),
  ]);
  return res.documents;
}

function toAuditEventDto(doc) {
  return {
    id: doc.$id,
    eventType: doc.event_type || "",
    entityType: doc.entity_type || "",
    entityId: doc.entity_id || "",
    actorUserId: doc.actor_user_id || "",
    actorRole: doc.actor_role || null,
    schoolId: doc.school_id || null,
    occurredAt: doc.occurred_at || doc.$createdAt || "",
    ip: doc.ip || null,
    userAgent: doc.user_agent || null,
    reason: doc.reason || null,
    beforeSnapshotJson: doc.before_snapshot_json || null,
    afterSnapshotJson: doc.after_snapshot_json || null,
    beforeHash: doc.before_hash || null,
    afterHash: doc.after_hash || null,
    eventHash: doc.event_hash || null,
  };
}

async function listFlightAuditEvents(payload = {}) {
  const flightId = cleanString(payload.flightId);
  if (!flightId) throw Object.assign(new Error("Voo nÃ£o informado."), { status: 400 });
  if (!AUDIT_EVENTS_COLLECTION_ID) return [];
  const res = await databases.listDocuments(DATABASE_ID, AUDIT_EVENTS_COLLECTION_ID, [
    sdk.Query.equal("entity_type", ["flight"]),
    sdk.Query.equal("entity_id", [flightId]),
    sdk.Query.orderDesc("occurred_at"),
    sdk.Query.limit(100),
  ]);
  return res.documents.map(toAuditEventDto);
}

async function reopenFlightForEdit(actorUserId, payload = {}, req) {
  const flightId = cleanString(payload.flightId);
  const reason = cleanString(payload.reason);
  if (!flightId) throw Object.assign(new Error("Voo não informado."), { status: 400 });
  if (!reason) throw Object.assign(new Error("Informe o motivo da reabertura."), { status: 400 });
  if (!FLIGHTS_COLLECTION_ID || !FLIGHT_SIGNATURES_COLLECTION_ID) {
    throw Object.assign(new Error("Coleções de voos/assinaturas não configuradas."), { status: 500 });
  }

  const [flightDoc, activeSignatures] = await Promise.all([
    databases.getDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, flightId),
    listActiveFlightSignatures(flightId),
  ]);
  const instructorPaymentSnapshots = await listInstructorPaymentSnapshotsForFlight(flightId);

  const beforeSnapshot = {
    flight: flightDoc,
    activeSignatures: activeSignatures.map((sig) => ({
      id: sig.$id,
      signer_user_id: sig.signer_user_id,
      signer_role: sig.signer_role,
      signed_at: sig.signed_at,
      content_hash: sig.content_hash || null,
      payload_version: sig.payload_version || null,
    })),
    instructorPaymentSnapshots: instructorPaymentSnapshots.map((payment) => ({
      id: payment.$id,
      instructor_user_id: payment.instructor_user_id || null,
      calculated_at: payment.calculated_at || null,
      flight_minutes_considered: payment.flight_minutes_considered ?? null,
      total_calculated: payment.total_calculated ?? null,
      student_amount_calculated: payment.student_amount_calculated ?? null,
    })),
  };
  const nextStatus = flightDoc.flight_status || "Previsto";
  const signedRecipientIds = Array.from(new Set(activeSignatures
    .filter((sig) => sig.signer_role === "student" || sig.signer_role === "instructor")
    .map((sig) => cleanString(sig.signer_user_id))
    .filter(Boolean)));
  const afterSnapshot = {
    flight: {
      id: flightId,
      instructor_signed: false,
      student_signed: false,
      admin_operator_signed: false,
      instructor_signed_at: null,
      flight_status: nextStatus,
    },
    invalidatedSignatureIds: activeSignatures.map((sig) => sig.$id),
    deletedInstructorPaymentSnapshotIds: instructorPaymentSnapshots.map((payment) => payment.$id),
  };
  const event = await createAuditEvent(actorUserId, {
    eventType: "flight_reopened_for_edit",
    entityType: "flight",
    entityId: flightId,
    reason,
    beforeSnapshot,
    afterSnapshot,
    ip: req?.headers?.["x-forwarded-for"] || req?.headers?.["x-real-ip"] || "",
    userAgent: req?.headers?.["user-agent"] || "",
  });
  const eventId = event?.$id || null;
  const now = nowIso();

  await Promise.all(activeSignatures.map((sig) =>
    databases.updateDocument(DATABASE_ID, FLIGHT_SIGNATURES_COLLECTION_ID, sig.$id, {
      status: "invalidated",
      invalidated_at: now,
      invalidated_by: actorUserId,
      invalidation_reason: reason,
      invalidated_by_event_id: eventId,
    }),
  ));

  await Promise.all(instructorPaymentSnapshots.map((payment) =>
    databases.deleteDocument(DATABASE_ID, FLIGHT_INSTRUCTOR_PAYMENTS_COLLECTION_ID, payment.$id),
  ));

  const reopened = await databases.updateDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, flightId, {
    instructor_signed: false,
    student_signed: false,
    admin_operator_signed: false,
    instructor_signed_at: null,
    flight_status: nextStatus,
  });

  if (signedRecipientIds.length > 0) {
    await dispatchNotificationEvent(actorUserId, {
      eventType: "flight.reopened",
      dedupeKey: `flight.reopened:${flightId}:${eventId || now}`,
      flightId,
      recipientUserIds: signedRecipientIds,
      channels: ["email"],
      actorUserId,
      data: {
        aircraft: reopened.aircraft_ident || flightDoc.aircraft_ident || "",
        flightDate: reopened.flight_date || flightDoc.flight_date || "",
        startTime: reopened.start_time || flightDoc.start_time || "",
        reason,
      },
    }).catch((err) => console.warn("Falha ao notificar reabertura de voo:", err?.message || err));
  }

  return {
    flight: reopened,
    invalidatedCount: activeSignatures.length,
    deletedInstructorPaymentSnapshotCount: instructorPaymentSnapshots.length,
    auditEventId: eventId,
  };
}

async function resolveActorUserId(req) {
  const headerId = cleanString(req.headers["x-appwrite-user-id"]);
  if (headerId) return headerId;
  const jwt = cleanString(req.headers["x-appwrite-user-jwt"]);
  if (!jwt) return null;
  const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.APPWRITE_ENDPOINT || "";
  const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.APPWRITE_PROJECT_ID || "";
  if (!endpoint || !projectId) return null;
  const userClient = new sdk.Client().setEndpoint(endpoint).setProject(projectId).setJWT(jwt);
  const account = new sdk.Account(userClient);
  try {
    const user = await account.get();
    return user?.$id || null;
  } catch {
    return null;
  }
}

function resolveFlightNotificationRecipients(safeEvent, flight) {
  const fromEvent = Array.isArray(safeEvent.recipientUserIds)
    ? safeEvent.recipientUserIds.map(cleanString).filter(Boolean)
    : [];
  const data = safeEvent.data && typeof safeEvent.data === "object" ? safeEvent.data : {};
  const fromData = cleanString(data.studentUserId);
  const fromFlight = cleanString(flight?.studentUserId);
  return Array.from(new Set([...fromEvent, fromData, fromFlight].filter(Boolean)));
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signWorkerToken(payload) {
  if (!WORKER_SECRET) throw Object.assign(new Error("Worker secret nao configurado."), { status: 500 });
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", WORKER_SECRET).update(encoded).digest("hex");
  return `${encoded}.${signature}`;
}

async function requireVideoUploader(actorUserId, flightId) {
  if (!actorUserId) throw Object.assign(new Error("Unauthorized request."), { status: 401 });
  if (!FLIGHTS_COLLECTION_ID) throw Object.assign(new Error("Colecao de voos nao configurada."), { status: 500 });
  const [profile, actor] = await Promise.all([getProfileByUserId(actorUserId), users.get({ userId: actorUserId })]);
  const profileRole = normalizeRole(profile?.role);
  const labelRole = deriveRoleFromLabels(actor?.labels || []);
  const role = profileRole === "aluno" ? labelRole : profileRole;
  if (role !== "admin" && role !== "instrutor") {
    throw Object.assign(new Error("Apenas admin ou instrutor pode enviar videos."), { status: 403 });
  }
  if (role === "admin") return;
  if (!flightId) throw Object.assign(new Error("Voo nao informado."), { status: 400 });
  const flight = await databases.getDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, flightId, [
    sdk.Query.select(["instructor_user_id"]),
  ]);
  if (flight.instructor_user_id !== actorUserId) {
    throw Object.assign(new Error("Instrutor nao vinculado a este voo."), { status: 403 });
  }
}

async function getVideoWorkerConfig(actorUserId, payload) {
  if (!CF_WORKER_URL || !WORKER_SECRET) {
    throw Object.assign(new Error("Worker de video nao configurado."), { status: 500 });
  }
  const mode = cleanString(payload.mode);
  const flightId = cleanString(payload.flightId);
  await requireVideoUploader(actorUserId, flightId);

  const now = Math.floor(Date.now() / 1000);
  const base = {
    sub: actorUserId,
    flightId,
    iat: now,
    exp: now + 4 * 60 * 60,
    nonce: crypto.randomUUID(),
  };

  if (mode === "upload") {
    const rawKey = cleanString(payload.key);
    if (!rawKey || rawKey.includes("..") || rawKey.includes("/") || !rawKey.endsWith(".mp4")) {
      throw Object.assign(new Error("Chave de video invalida."), { status: 400 });
    }
    const expectedPrefix = `flight-${flightId}-`;
    if (!rawKey.startsWith(expectedPrefix)) {
      throw Object.assign(new Error("Chave de video fora do escopo do voo."), { status: 400 });
    }
    return {
      workerUrl: CF_WORKER_URL,
      uploadToken: signWorkerToken({ ...base, action: "upload", key: `flights/${rawKey}` }),
    };
  }

  if (mode === "list") {
    const prefix = cleanString(payload.prefix);
    const expectedPrefix = `flights/flight-${flightId}-`;
    if (!prefix || prefix !== expectedPrefix) {
      throw Object.assign(new Error("Prefixo de listagem invalido."), { status: 400 });
    }
    return {
      workerUrl: CF_WORKER_URL,
      uploadToken: signWorkerToken({ ...base, action: "list", prefix }),
    };
  }

  throw Object.assign(new Error("Modo de worker invalido."), { status: 400 });
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

function sanitizeHtml(value) {
  let html = String(value || "");
  html = html.replace(/<\s*(script|iframe|object|embed|form|input|button|meta|link|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  html = html.replace(/<\s*(script|iframe|object|embed|form|input|button|meta|link|style)\b[^>]*\/?>/gi, "");
  html = html.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  html = html.replace(/\s+(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, ' $1="#"');
  html = html.replace(/\s+(href|src)\s*=\s*javascript:[^\s>]+/gi, ' $1="#"');
  return html.trim();
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
    faviconUrl: cleanString(settings.faviconUrl) || null,
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
    faviconUrl: cleanString(settings.faviconUrl).slice(0, 2048) || null,
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
      fontFamily: typeof settings?.theme?.fontFamily === "string" ? settings.theme.fontFamily.slice(0, 64) : "",
      colorMode: settings?.theme?.colorMode === "light" ? "light" : "dark",
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

function defaultGoogleCalendarSettings() {
  return {
    enabled: false,
    aircraftCalendars: [],
    lastTestAt: null,
    lastError: null,
  };
}

function googleServiceAccountCredentials() {
  if (GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON) {
    try {
      const parsed = JSON.parse(GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON);
      return {
        clientEmail: cleanString(parsed.client_email),
        privateKey: cleanString(parsed.private_key).replace(/\\n/g, "\n"),
      };
    } catch {
      return { clientEmail: "", privateKey: "" };
    }
  }
  return {
    clientEmail: cleanString(GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL),
    privateKey: cleanString(GOOGLE_CALENDAR_PRIVATE_KEY).replace(/\\n/g, "\n"),
  };
}

function normalizeAircraftIdent(value) {
  return cleanString(value).toUpperCase();
}

function sanitizeAircraftCalendars(value) {
  const rows = Array.isArray(value) ? value : [];
  const byAircraft = new Map();
  for (const row of rows) {
    const aircraftIdent = normalizeAircraftIdent(row?.aircraftIdent);
    const calendarId = cleanString(row?.calendarId);
    if (!aircraftIdent || !calendarId) continue;
    byAircraft.set(aircraftIdent, { aircraftIdent, calendarId });
  }
  return [...byAircraft.values()].sort((a, b) => a.aircraftIdent.localeCompare(b.aircraftIdent));
}

function publicGoogleCalendarSettings(settings, updatedAt) {
  const safe = settings && typeof settings === "object" ? settings : {};
  const serviceAccount = googleServiceAccountCredentials();
  return {
    enabled: Boolean(safe.enabled),
    serviceAccountEmail: serviceAccount.clientEmail,
    serviceAccountConfigured: Boolean(serviceAccount.clientEmail && serviceAccount.privateKey),
    aircraftCalendars: sanitizeAircraftCalendars(safe.aircraftCalendars),
    lastTestAt: cleanString(safe.lastTestAt) || null,
    lastError: cleanString(safe.lastError).slice(0, 1024) || null,
    updatedAt: updatedAt || null,
  };
}

function sanitizeGoogleCalendarInput(input, current) {
  const raw = input && typeof input === "object" ? input : {};
  return {
    ...current,
    enabled: Boolean(raw.enabled),
    aircraftCalendars: sanitizeAircraftCalendars(raw.aircraftCalendars),
  };
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

async function loadGoogleCalendarSettings() {
  const doc = await getSettingDoc(GOOGLE_CALENDAR_SETTINGS_KEY);
  if (!doc) {
    const defaults = defaultGoogleCalendarSettings();
    return { settings: defaults, publicSettings: publicGoogleCalendarSettings(defaults, null), doc: null };
  }
  const settings = parseJsonObject(doc.settings_json, defaultGoogleCalendarSettings());
  return {
    settings: { ...defaultGoogleCalendarSettings(), ...settings },
    publicSettings: publicGoogleCalendarSettings(settings, doc.$updatedAt || null),
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

async function saveGoogleCalendarSettings(input) {
  if (!PLATFORM_SETTINGS_COLLECTION_ID) {
    throw Object.assign(new Error("Colecao de configuracoes da plataforma nao configurada."), { status: 500 });
  }
  const current = await loadGoogleCalendarSettings();
  const settings = sanitizeGoogleCalendarInput(input, current.settings);
  const data = { key: GOOGLE_CALENDAR_SETTINGS_KEY, settings_json: JSON.stringify(settings) };
  const doc = current.doc
    ? await databases.updateDocument(DATABASE_ID, PLATFORM_SETTINGS_COLLECTION_ID, current.doc.$id, data)
    : await databases.createDocument(
        DATABASE_ID,
        PLATFORM_SETTINGS_COLLECTION_ID,
        sdk.ID.unique(),
        data,
        ADMIN_DOC_PERMS,
      );
  return publicGoogleCalendarSettings(settings, doc.$updatedAt || null);
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

function formatDurationHours(durationHours) {
  const h = Math.floor(durationHours);
  const m = Math.round((durationHours - h) * 60);
  if (h > 0 && m > 0) return `${h}h${String(m).padStart(2, "0")}`;
  if (h > 0) return `${h}h`;
  return `${m}min`;
}

function formatFlightDateLabel(isoDate) {
  const [y, mo, d] = (isoDate || "").split("-");
  if (!y || !mo || !d) return isoDate || "";
  return `${d}/${mo}/${y}`;
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
  if (type === "flight.reopened") {
    const reason = cleanString(data.reason);
    return {
      eyebrow: "Atualização operacional",
      title: "Voo reaberto para ajustes",
      intro: "Um voo que você havia assinado foi reaberto pelo admin.",
      body: `O voo em ${aircraft} previsto para ${when} foi reaberto para ajustes${reason ? `: ${reason}` : "."}`,
      details: [
        ["Aeronave", aircraft],
        ["Data e horário", when],
        ...(reason ? [["Motivo", reason]] : []),
      ],
      ctaLabel: "Revisar voo",
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
  if (type === "flight.reminder_24h") {
    return {
      eyebrow: "Lembrete de voo",
      title: "Seu voo e amanha",
      intro: "Este e um lembrete automatico da sua agenda.",
      body: `Seu voo em ${aircraft} esta previsto para ${when}.`,
      details: [
        ["Aeronave", aircraft],
        ["Data e horario", when],
      ],
      ctaLabel: "Ver voo",
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
  if (type === "schedule.published") {
    const weekLabel = cleanString(data.weekLabel) || cleanString(data.weekStart) || "esta semana";
    const flights = Array.isArray(data.flights) ? data.flights : [];
    const flightCount = flights.length;
    return {
      eyebrow: "Escala de voos",
      title: "Sua escala está confirmada",
      intro: `A escala de voos para ${weekLabel} foi publicada.`,
      body:
        flightCount > 0
          ? `Você tem ${flightCount} voo(s) nesta semana. Confira data, horário, aeronave e demais detalhes abaixo.`
          : "Confira os voos programados para você nesta semana.",
      details: [],
      flights,
      ctaLabel: "Ver agenda",
      url,
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
  const flightsHtml = Array.isArray(message.flights) && message.flights.length > 0
    ? `<div style="margin-top:20px">${message.flights.map((f) => {
        const personRow = f.instructorName
          ? `<tr><td style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.04em;width:40%;vertical-align:top;padding:3px 0">Instrutor</td><td style="color:#0f172a;font-size:14px;font-weight:700;padding:3px 0">${escapeHtml(String(f.instructorName))}</td></tr>`
          : f.studentName
          ? `<tr><td style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.04em;width:40%;vertical-align:top;padding:3px 0">Aluno</td><td style="color:#0f172a;font-size:14px;font-weight:700;padding:3px 0">${escapeHtml(String(f.studentName))}</td></tr>`
          : "";
        return `<div style="margin-bottom:12px;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px"><div style="font-size:15px;font-weight:800;color:#0f172a;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(formatFlightDateLabel(String(f.date || "")))}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.04em;width:40%;vertical-align:top;padding:3px 0">Início</td><td style="color:#0f172a;font-size:14px;font-weight:700;padding:3px 0">${escapeHtml(String(f.startTime || "—"))}</td></tr><tr><td style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.04em;vertical-align:top;padding:3px 0">Duração</td><td style="color:#0f172a;font-size:14px;font-weight:700;padding:3px 0">${escapeHtml(formatDurationHours(Number(f.durationHours) || 0))}</td></tr><tr><td style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.04em;vertical-align:top;padding:3px 0">Avião</td><td style="color:#0f172a;font-size:14px;font-weight:700;padding:3px 0">${escapeHtml(String(f.aircraft || "—"))}</td></tr>${personRow}</table></div>`;
      }).join("")}</div>`
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
                  ${flightsHtml || detailsHtml}
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isResendRateLimitError(error) {
  const statusCode = Number(error?.statusCode || error?.status || error?.response?.status || 0);
  const message = String(error?.message || error?.name || "").toLowerCase();
  return statusCode === 429 || message.includes("rate limit") || message.includes("too many requests");
}

async function waitForResendEmailSlot() {
  const now = Date.now();
  const waitMs = Math.max(0, nextResendEmailAt - now);
  nextResendEmailAt = Math.max(now, nextResendEmailAt) + RESEND_EMAIL_INTERVAL_MS;
  if (waitMs > 0) await sleep(waitMs);
}

async function sendResendEmail(operation) {
  let lastError = null;
  for (let attempt = 1; attempt <= RESEND_EMAIL_MAX_ATTEMPTS; attempt += 1) {
    await waitForResendEmailSlot();
    try {
      const result = await operation();
      if (!result?.error || !isResendRateLimitError(result.error) || attempt === RESEND_EMAIL_MAX_ATTEMPTS) {
        return result;
      }
      lastError = result.error;
    } catch (err) {
      if (!isResendRateLimitError(err) || attempt === RESEND_EMAIL_MAX_ATTEMPTS) throw err;
      lastError = err;
    }
    await sleep(RESEND_EMAIL_INTERVAL_MS * attempt);
  }
  return { error: lastError || new Error("Falha no Resend.") };
}

async function sendEmailToUser(settings, brand, user, message) {
  const apiKey = cleanString(settings.resendApiKey);
  const fromEmail = cleanString(settings.fromEmail);
  if (!settings.enabled) return { status: "skipped", reason: "Email desabilitado." };
  if (!apiKey || !fromEmail) return { status: "skipped", reason: "Resend nao configurado." };
  if (!user?.email) return { status: "skipped", reason: "Usuario sem email." };
  const resend = new Resend(apiKey);
  const fromName = cleanString(settings.fromName);
  const result = await sendResendEmail(() => resend.emails.send({
    from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
    to: [user.email],
    replyTo: cleanString(settings.replyTo) || undefined,
    subject: emailSubject(settings, message),
    text: message.body,
    html: emailHtml(message, brand),
  }));
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

const FLIGHT_NOTIFICATION_EVENTS = new Set(["flight.scheduled", "flight.updated", "flight.reopened", "flight.cancelled", "flight.reminder_24h"]);

async function authorizeDispatchEvent(actorUserId, event) {
  if (!actorUserId) throw Object.assign(new Error("Unauthorized request."), { status: 401 });
  if (await isAdmin(actorUserId)) return;

  const safeEvent = event && typeof event === "object" ? event : {};
  const eventType = cleanString(safeEvent.eventType);

  if (eventType === "weeklyPlan.submitted") return;

  if (FLIGHT_NOTIFICATION_EVENTS.has(eventType)) {
    const flightId = cleanString(safeEvent.flightId);
    if (!flightId) throw Object.assign(new Error("flightId e obrigatorio para notificacoes de voo."), { status: 400 });
    const flight = await getFlightContext(flightId);
    const profile = await getProfileByUserId(actorUserId);
    const role = normalizeRole(profile?.role);
    const linked = [flight?.studentUserId, flight?.instructorUserId].filter(Boolean);
    if (role === "instrutor" && linked.includes(actorUserId)) return;
    throw Object.assign(new Error("Sem permissao para disparar notificacao deste voo."), { status: 403 });
  }

  if (eventType === "notice.published") {
    throw Object.assign(new Error("Apenas admin pode disparar aviso."), { status: 403 });
  }

  throw Object.assign(new Error("Apenas admin pode disparar este evento."), { status: 403 });
}

async function dispatchNotificationEvent(actorUserId, event) {
  const safeEvent = event && typeof event === "object" ? event : {};
  const eventType = cleanString(safeEvent.eventType);
  const dedupeKey = cleanString(safeEvent.dedupeKey);
  if (!eventType || !dedupeKey) throw Object.assign(new Error("Evento ou chave de deduplicacao nao informados."), { status: 400 });

  const admin = actorUserId === "system" || await isAdmin(actorUserId);
  let flight = null;
  let recipients = Array.isArray(safeEvent.recipientUserIds)
    ? safeEvent.recipientUserIds.map(cleanString).filter(Boolean)
    : [];
  if (eventType === "notice.published") {
    if (!admin) throw Object.assign(new Error("Apenas admin pode disparar aviso."), { status: 403 });
    if (recipients.length === 0) recipients = await listAllProfileUserIds();
  } else if (eventType === "weeklyPlan.submitted") {
    if (recipients.length === 0 && actorUserId) recipients = [actorUserId];
  } else if (eventType === "schedule.published") {
    if (!admin) throw Object.assign(new Error("Apenas admin pode publicar escala."), { status: 403 });
    // recipients vêm do payload recipientUserIds
  } else if (safeEvent.flightId) {
    flight = await getFlightContext(safeEvent.flightId);
    if (FLIGHT_NOTIFICATION_EVENTS.has(eventType)) {
      recipients = resolveFlightNotificationRecipients(safeEvent, flight);
    } else {
      recipients = [flight?.studentUserId, flight?.instructorUserId].filter(Boolean);
    }
    if (!admin && ![flight?.studentUserId, flight?.instructorUserId].filter(Boolean).includes(actorUserId)) {
      throw Object.assign(new Error("Sem permissao para disparar notificacao deste voo."), { status: 403 });
    }
  } else if (!admin) {
    throw Object.assign(new Error("Apenas admin pode disparar este evento."), { status: 403 });
  }
  recipients = Array.from(new Set(recipients));
  if (FLIGHT_NOTIFICATION_EVENTS.has(eventType) && recipients.length === 0) {
    throw Object.assign(new Error("Nenhum aluno vinculado ao voo para notificar."), { status: 422 });
  }

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
    let user = usersById.get(recipientUserId);
    if (!user?.email) {
      try {
        user = await users.get({ userId: recipientUserId });
      } catch {
        // Ignore stale references.
      }
    }
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

function googleCalendarConfigured(settings) {
  const serviceAccount = googleServiceAccountCredentials();
  return Boolean(
    settings?.enabled &&
      serviceAccount.clientEmail &&
      serviceAccount.privateKey &&
      sanitizeAircraftCalendars(settings.aircraftCalendars).length > 0,
  );
}

async function saveGoogleCalendarRuntimeStatus(patch) {
  if (!PLATFORM_SETTINGS_COLLECTION_ID) return publicGoogleCalendarSettings(defaultGoogleCalendarSettings(), null);
  const current = await loadGoogleCalendarSettings();
  const settings = { ...current.settings, ...patch };
  const data = { key: GOOGLE_CALENDAR_SETTINGS_KEY, settings_json: JSON.stringify(settings) };
  const doc = current.doc
    ? await databases.updateDocument(DATABASE_ID, PLATFORM_SETTINGS_COLLECTION_ID, current.doc.$id, data)
    : await databases.createDocument(
        DATABASE_ID,
        PLATFORM_SETTINGS_COLLECTION_ID,
        sdk.ID.unique(),
        data,
        ADMIN_DOC_PERMS,
      );
  return publicGoogleCalendarSettings(settings, doc.$updatedAt || null);
}

async function googleAccessToken() {
  const serviceAccount = googleServiceAccountCredentials();
  if (!serviceAccount.clientEmail || !serviceAccount.privateKey) {
    throw Object.assign(new Error("Service account do Google Calendar nao configurado na funcao Appwrite."), { status: 500 });
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64UrlEncode(JSON.stringify({
    iss: serviceAccount.clientEmail,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(serviceAccount.privateKey, "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const assertion = `${unsigned}.${signature}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      assertion,
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Falha ao obter token do Google.");
  }
  return data.access_token;
}

async function googleCalendarRequest(settings, path, options = {}) {
  const accessToken = await googleAccessToken(settings);
  const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || data.error_description || "Falha na API do Google Calendar.");
  }
  return data;
}

async function testGoogleCalendarConnection() {
  const { settings } = await loadGoogleCalendarSettings();
  const calendars = sanitizeAircraftCalendars(settings.aircraftCalendars);
  const serviceAccount = googleServiceAccountCredentials();
  if (!serviceAccount.clientEmail || !serviceAccount.privateKey) {
    throw Object.assign(new Error("Service account do Google Calendar nao configurado na funcao Appwrite."), { status: 500 });
  }
  if (calendars.length === 0) {
    throw Object.assign(new Error("Informe ao menos um Calendar ID de aeronave."), { status: 400 });
  }
  try {
    const calendarId = encodeURIComponent(calendars[0].calendarId);
    await googleCalendarRequest(settings, `/calendars/${calendarId}`);
    return await saveGoogleCalendarRuntimeStatus({
      lastTestAt: nowIso(),
      lastError: null,
    });
  } catch (err) {
    await saveGoogleCalendarRuntimeStatus({ lastTestAt: nowIso(), lastError: err?.message || String(err) });
    throw err;
  }
}

function flightCalendarDateTime(flight) {
  const date = cleanString(flight.flight_date);
  const start = cleanString(flight.start_time).slice(0, 5) || "06:00";
  const durationSec = Number(flight.duration_sec || 0);
  const [hh, mm] = start.split(":").map(Number);
  const startDate = new Date(`${date}T${start}:00-03:00`);
  if (!date || !Number.isFinite(hh) || !Number.isFinite(mm) || Number.isNaN(startDate.getTime())) {
    throw Object.assign(new Error("Voo sem data ou horario valido para o Google Calendar."), { status: 422 });
  }
  const safeDurationMinutes = Math.max(30, Math.round((Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 3600) / 60));
  const endBase = new Date(`${date}T12:00:00`);
  const totalEndMinutes = hh * 60 + mm + safeDurationMinutes;
  endBase.setDate(endBase.getDate() + Math.floor(totalEndMinutes / 1440));
  const endMinutesInDay = ((totalEndMinutes % 1440) + 1440) % 1440;
  const endDate = endBase.toISOString().slice(0, 10);
  const endTime = `${String(Math.floor(endMinutesInDay / 60)).padStart(2, "0")}:${String(endMinutesInDay % 60).padStart(2, "0")}`;
  return {
    startDateTime: `${date}T${start}:00-03:00`,
    endDateTime: `${endDate}T${endTime}:00-03:00`,
  };
}

async function safeUpdateFlightCalendarFields(flightId, fields) {
  if (!FLIGHTS_COLLECTION_ID || !flightId) return;
  try {
    await databases.updateDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, flightId, fields);
  } catch (err) {
    const message = String(err?.message || err).toLowerCase();
    if (!message.includes("attribute") && !message.includes("invalid document structure")) throw err;
  }
}

async function getFlightCalendarContext(flightId) {
  const flight = await databases.getDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, flightId);
  const studentUserId = cleanString(flight.student_user_id || flight.user_id);
  const instructorUserId = cleanString(flight.instructor_user_id);
  const [studentUser, instructorUser, studentProfile, instructorProfile] = await Promise.all([
    studentUserId ? users.get({ userId: studentUserId }).catch(() => null) : Promise.resolve(null),
    instructorUserId ? users.get({ userId: instructorUserId }).catch(() => null) : Promise.resolve(null),
    studentUserId ? getProfileByUserId(studentUserId).catch(() => null) : Promise.resolve(null),
    instructorUserId ? getProfileByUserId(instructorUserId).catch(() => null) : Promise.resolve(null),
  ]);
  return { flight, studentUserId, instructorUserId, studentUser, instructorUser, studentProfile, instructorProfile };
}

function googleFlightEventBody(ctx, rules) {
  const { flight, studentUser, instructorUser, studentProfile, instructorProfile } = ctx;
  const { startDateTime, endDateTime } = flightCalendarDateTime(flight);
  const aircraft = cleanString(flight.aircraft_ident) || "Aeronave a definir";
  const studentName = cleanString(studentProfile?.full_name) || cleanString(studentUser?.name) || "Aluno";
  const instructorName = cleanString(instructorProfile?.full_name) || cleanString(instructorUser?.name) || "Instrutor a definir";
  const customNotice = cleanString(rules.emailNotifications?.["flight.scheduled"]?.customNotice);
  const description = [
    `Aluno: ${studentName}`,
    `Instrutor: ${instructorName}`,
    `Aeronave: ${aircraft}`,
    `Data: ${cleanString(flight.flight_date)}`,
    `Horario: ${cleanString(flight.start_time) || "A confirmar"}`,
    APP_URL ? `Plataforma: ${APP_URL}` : "",
    customNotice ? `\nMensagem da escola:\n${customNotice}` : "",
  ].filter(Boolean).join("\n");
  return {
    summary: `Voo - ${aircraft} - ${studentName}`,
    description,
    start: { dateTime: startDateTime, timeZone: "America/Sao_Paulo" },
    end: { dateTime: endDateTime, timeZone: "America/Sao_Paulo" },
    reminders: { useDefault: true },
  };
}

async function syncFlightCalendarEvent(actorUserId, payload = {}) {
  const flightId = cleanString(payload.flightId);
  const mode = cleanString(payload.mode) || "upsert";
  if (!flightId) throw Object.assign(new Error("Voo nao informado."), { status: 400 });
  if (!FLIGHTS_COLLECTION_ID) throw Object.assign(new Error("Colecao de voos nao configurada."), { status: 500 });

  const { settings, publicSettings } = await loadGoogleCalendarSettings();
  if (!googleCalendarConfigured(settings)) return publicSettings;

  try {
    const ctx = await getFlightCalendarContext(flightId);
    const aircraftIdent = normalizeAircraftIdent(ctx.flight.aircraft_ident);
    const aircraftCalendar = sanitizeAircraftCalendars(settings.aircraftCalendars)
      .find((row) => row.aircraftIdent === aircraftIdent);
    if (!aircraftCalendar) {
      throw Object.assign(new Error(`Calendar ID nao configurado para a aeronave ${aircraftIdent || "do voo"}.`), { status: 422 });
    }
    const calendarId = encodeURIComponent(aircraftCalendar.calendarId);
    const eventId = cleanString(ctx.flight.google_calendar_event_id);
    if (mode === "cancel") {
      if (eventId) {
        await googleCalendarRequest(settings, `/calendars/${calendarId}/events/${encodeURIComponent(eventId)}?sendUpdates=none`, {
          method: "DELETE",
        }).catch((err) => {
          if (!String(err?.message || "").includes("Not Found")) throw err;
        });
      }
      await safeUpdateFlightCalendarFields(flightId, {
        google_calendar_sync_status: "cancelled",
        google_calendar_synced_at: nowIso(),
        google_calendar_error: null,
      });
      return await saveGoogleCalendarRuntimeStatus({ lastError: null });
    }

    const { publicSettings: rules } = await loadSchoolRules();
    const body = googleFlightEventBody(ctx, rules);
    const event = eventId
      ? await googleCalendarRequest(settings, `/calendars/${calendarId}/events/${encodeURIComponent(eventId)}?sendUpdates=none`, {
          method: "PATCH",
          body: JSON.stringify(body),
        })
      : await googleCalendarRequest(settings, `/calendars/${calendarId}/events?sendUpdates=none`, {
          method: "POST",
          body: JSON.stringify(body),
        });
    await safeUpdateFlightCalendarFields(flightId, {
      google_calendar_event_id: event?.id || eventId || null,
      google_calendar_synced_at: nowIso(),
      google_calendar_sync_status: "synced",
      google_calendar_error: null,
    });
    return await saveGoogleCalendarRuntimeStatus({ lastError: null });
  } catch (err) {
    await safeUpdateFlightCalendarFields(flightId, {
      google_calendar_sync_status: "failed",
      google_calendar_synced_at: nowIso(),
      google_calendar_error: String(err?.message || err).slice(0, 1024),
    });
    await saveGoogleCalendarRuntimeStatus({ lastError: String(err?.message || err).slice(0, 1024) });
    throw err;
  }
}

function flightStartDate(flight) {
  const date = cleanString(flight.flight_date);
  const start = cleanString(flight.start_time).slice(0, 5) || "23:59";
  const dt = new Date(`${date}T${start}:00-03:00`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

async function runFlightReminderScan(actorUserId) {
  if (!FLIGHTS_COLLECTION_ID) throw Object.assign(new Error("Colecao de voos nao configurada."), { status: 500 });
  const now = Date.now();
  const startWindow = now + (24 * 60 - 15) * 60 * 1000;
  const endWindow = now + (24 * 60 + 15) * 60 * 1000;
  const today = new Date(now).toISOString().slice(0, 10);
  const afterTomorrow = addDaysIso(today, 2);
  const flights = await listAllDocuments(FLIGHTS_COLLECTION_ID, [
    sdk.Query.equal("flight_status", ["Previsto"]),
    sdk.Query.greaterThanEqual("flight_date", today),
    sdk.Query.lessThanEqual("flight_date", afterTomorrow),
  ]).catch(() => []);
  const processed = [];
  for (const flight of flights) {
    if (flight.reminder_24h_sent_at) continue;
    const start = flightStartDate(flight);
    if (!start || start.getTime() < startWindow || start.getTime() > endWindow) continue;
    const studentUserId = cleanString(flight.student_user_id || flight.user_id);
    if (!studentUserId) continue;
    const deliveries = await dispatchNotificationEvent(actorUserId, {
      eventType: "flight.reminder_24h",
      dedupeKey: `flight.reminder_24h:${flight.$id}`,
      flightId: flight.$id,
      recipientUserIds: [studentUserId],
      channels: ["email", "push"],
      actorUserId,
      data: {
        aircraft: flight.aircraft_ident || "",
        flightDate: flight.flight_date || "",
        startTime: flight.start_time || "",
        studentUserId,
      },
    });
    await safeUpdateFlightCalendarFields(flight.$id, { reminder_24h_sent_at: nowIso() });
    processed.push({ flightId: flight.$id, deliveries });
  }
  return { processed };
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

// ── Email MKT / Broadcast ────────────────────────────────────────────────────

function progressRangeOk(value, range) {
  if (!range) return true;
  const toNum = (v) => { const n = parseFloat(String(v ?? "")); return Number.isFinite(n) ? n : null; };
  const min = toNum(range.min);
  const max = toNum(range.max);
  const current = value ?? 0;
  if (min !== null && current < min) return false;
  if (max !== null && current > max) return false;
  return true;
}

function hasStudentFilter(sf) {
  if (!sf) return false;
  return Object.keys(sf).some((k) => {
    const v = sf[k];
    if (Array.isArray(v)) return v.length > 0;
    if (v && typeof v === "object") return (v.min ?? "") !== "" || (v.max ?? "") !== "";
    return false;
  });
}

async function resolveRecipientEmails(filter) {
  if (filter?.role === "custom") {
    const raw = Array.isArray(filter.customEmails) ? filter.customEmails : [];
    const seen = new Set();
    return raw
      .map((e) => cleanString(e))
      .filter((e) => e && e.includes("@") && !seen.has(e) && seen.add(e))
      .map((email) => ({ userId: null, email, name: email }));
  }
  const role = filter?.role;
  const sf = filter?.studentFilter;

  // When filtering alunos with progress-based criteria, use the rich student progress data
  if (role === "aluno" && hasStudentFilter(sf)) {
    const todayIso = nowIso().slice(0, 10);
    const progressData = await getStudentsProgress({ today: todayIso, inactiveDays: 365 });
    const byEmail = new Map();
    for (const student of progressData.students) {
      if (!student.email) continue;
      // null means never flew → treat as Infinity so they pass any "min days" check
      if (!progressRangeOk(student.daysSinceLastFlight ?? Infinity, sf.daysWithoutFlying)) continue;
      if (sf.tracks?.length && !sf.tracks.includes(student.trainingProgress?.trackName)) continue;
      if (!progressRangeOk(student.executed?.hours, sf.hours)) continue;
      if (!progressRangeOk(student.trainingProgress?.percentComplete, sf.progress)) continue;
      if (!progressRangeOk(student.executed?.count, sf.flights)) continue;
      if (!progressRangeOk(student.executed?.landings, sf.landings)) continue;
      if (!byEmail.has(student.email)) {
        byEmail.set(student.email, { userId: student.userId || null, email: student.email, name: student.name || student.email });
      }
    }
    return Array.from(byEmail.values());
  }

  const allProfiles = await listAllDocuments(PROFILES_COLLECTION_ID, [
    sdk.Query.equal("school_id", [SCHOOL_ID]),
    ...selectQuery(["user_id", "role", "email", "full_name"]),
  ]);
  const byEmail = new Map();
  for (const p of allProfiles) {
    if (!p.email) continue;
    if (role && role !== "todos" && p.role !== role) continue;
    if (!byEmail.has(p.email)) {
      byEmail.set(p.email, { userId: p.user_id || null, email: p.email, name: cleanString(p.full_name) || p.email });
    }
  }
  return Array.from(byEmail.values());
}

function toSegmentDoc(doc) {
  return {
    id: doc.$id,
    name: doc.name || "",
    description: doc.description || "",
    resendAudienceId: doc.resend_audience_id || null,
    memberCount: doc.member_count ?? 0,
    createdAt: doc.$createdAt,
    createdBy: doc.created_by || null,
    recipientFilter: parseJsonObject(doc.recipient_filter_json, null),
  };
}

function toMessageDoc(doc) {
  return {
    id: doc.$id,
    segmentId: doc.segment_id || null,
    segmentName: doc.segment_name || null,
    resendBroadcastId: doc.resend_broadcast_id || null,
    subject: doc.subject || "",
    bodyHtml: doc.body_html || null,
    sentAt: doc.sent_at || null,
    sentBy: doc.sent_by || null,
    recipientCount: doc.recipient_count ?? 0,
    status: doc.status || "draft",
  };
}

async function getResendAccountInfo() {
  const { settings } = await loadEmailSettings();
  const apiKey = cleanString(settings.resendApiKey);
  if (!apiKey) return null;
  try {
    const resp = await fetch("https://api.resend.com/me", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

async function previewBroadcastRecipients(filter) {
  const recipients = await resolveRecipientEmails(filter);
  return { recipients: recipients.map((r) => ({ email: r.email, name: r.name })), total: recipients.length };
}

async function listBroadcastSegments() {
  if (!BROADCAST_SEGMENTS_COLLECTION_ID)
    throw Object.assign(new Error("Coleção de segmentos não configurada."), { status: 500 });
  const docs = await listAllDocuments(BROADCAST_SEGMENTS_COLLECTION_ID, [sdk.Query.orderDesc("$createdAt")]);
  return docs.map(toSegmentDoc);
}

async function createBroadcastSegment(actorUserId, { name, description, filter }) {
  if (!BROADCAST_SEGMENTS_COLLECTION_ID)
    throw Object.assign(new Error("Coleção de segmentos não configurada."), { status: 500 });
  const segName = cleanString(name);
  if (!segName) throw Object.assign(new Error("Nome do segmento é obrigatório."), { status: 400 });

  const { settings } = await loadEmailSettings();
  const apiKey = cleanString(settings.resendApiKey);
  if (!apiKey) throw Object.assign(new Error("Resend não configurado. Configure a API key em Configurações."), { status: 400 });

  const recipients = await resolveRecipientEmails(filter);
  if (!recipients.length) throw Object.assign(new Error("Nenhum destinatário encontrado para o filtro selecionado."), { status: 400 });

  const resend = new Resend(apiKey);

  const audienceResult = await resend.audiences.create({ name: segName });
  if (audienceResult.error) throw Object.assign(new Error(audienceResult.error.message || "Falha ao criar audience no Resend."), { status: 502 });
  const audienceId = audienceResult.data.id;

  const batchSize = 10;
  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    await Promise.all(
      batch.map((r) => {
        const nameParts = r.name && r.name !== r.email ? r.name.split(" ") : [];
        return resend.contacts.create({
          audienceId,
          email: r.email,
          firstName: nameParts[0] || undefined,
          lastName: nameParts.slice(1).join(" ") || undefined,
          unsubscribed: false,
        });
      }),
    );
  }

  const doc = await databases.createDocument(
    DATABASE_ID,
    BROADCAST_SEGMENTS_COLLECTION_ID,
    sdk.ID.unique(),
    {
      name: segName,
      description: cleanString(description || ""),
      resend_audience_id: audienceId,
      recipient_filter_json: JSON.stringify(filter || {}),
      member_count: recipients.length,
      created_by: actorUserId || null,
    },
    ADMIN_DOC_PERMS,
  );
  return toSegmentDoc(doc);
}

async function deleteBroadcastSegment(segmentId) {
  if (!BROADCAST_SEGMENTS_COLLECTION_ID)
    throw Object.assign(new Error("Coleção de segmentos não configurada."), { status: 500 });
  if (!segmentId) throw Object.assign(new Error("ID do segmento não informado."), { status: 400 });

  const doc = await databases.getDocument(DATABASE_ID, BROADCAST_SEGMENTS_COLLECTION_ID, segmentId);
  const audienceId = doc.resend_audience_id;

  if (audienceId) {
    const { settings } = await loadEmailSettings();
    const apiKey = cleanString(settings.resendApiKey);
    if (apiKey) {
      // SDK v6 aliased resend.audiences → resend.segments, so .remove() calls DELETE /segments/{id}
      // which requires a verified domain (403). Use the legacy DELETE /audiences/{id} endpoint directly.
      try {
        const res = await fetch(`https://api.resend.com/audiences/${audienceId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          console.warn(`Resend audience removal failed (${res.status}):`, body.slice(0, 200));
        }
      } catch (err) {
        console.warn("Resend audience removal error:", err?.message || err);
      }
    }
  }

  await databases.deleteDocument(DATABASE_ID, BROADCAST_SEGMENTS_COLLECTION_ID, segmentId);
}

async function listBroadcastMessages({ limit, offset } = {}) {
  if (!BROADCAST_MESSAGES_COLLECTION_ID)
    throw Object.assign(new Error("Coleção de mensagens não configurada."), { status: 500 });
  const safeLimit = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const res = await databases.listDocuments(DATABASE_ID, BROADCAST_MESSAGES_COLLECTION_ID, [
    sdk.Query.orderDesc("sent_at"),
    sdk.Query.limit(safeLimit),
    sdk.Query.offset(safeOffset),
  ]);
  return {
    messages: (res.documents || []).map(toMessageDoc),
    total: res.total || 0,
  };
}

async function createAndSendBroadcast(actorUserId, { segmentId, subject, bodyHtml, testEmail, confirmSend }) {
  const safeBodyHtml = sanitizeHtml(bodyHtml);
  if (!BROADCAST_SEGMENTS_COLLECTION_ID || !BROADCAST_MESSAGES_COLLECTION_ID)
    throw Object.assign(new Error("Coleções de broadcast não configuradas."), { status: 500 });
  if (!segmentId) throw Object.assign(new Error("Segmento não informado."), { status: 400 });
  if (!cleanString(subject)) throw Object.assign(new Error("Assunto é obrigatório."), { status: 400 });
  if (!cleanString(bodyHtml)) throw Object.assign(new Error("Conteúdo HTML é obrigatório."), { status: 400 });

  const { settings } = await loadEmailSettings();
  const apiKey = cleanString(settings.resendApiKey);
  const fromEmail = cleanString(settings.fromEmail);
  const fromName = cleanString(settings.fromName);
  if (!apiKey || !fromEmail) throw Object.assign(new Error("Resend não configurado. Configure a API key e email remetente."), { status: 400 });

  const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
  const resend = new Resend(apiKey);

  // Test-only mode: just send a transactional preview, no broadcast created
  if (confirmSend !== true) {
    const to = cleanString(testEmail);
    if (!to) throw Object.assign(new Error("Email de teste não informado."), { status: 400 });
    const result = await sendResendEmail(() => resend.emails.send({
      from,
      to: [to],
      subject: `[TESTE] ${cleanString(subject)}`,
      html: safeBodyHtml,
    }));
    if (result?.error) throw Object.assign(new Error(result.error.message || "Falha ao enviar email de teste."), { status: 502 });
    return null;
  }

  const segDoc = await databases.getDocument(DATABASE_ID, BROADCAST_SEGMENTS_COLLECTION_ID, segmentId);
  const audienceId = segDoc.resend_audience_id;
  if (!audienceId) throw Object.assign(new Error("Segmento não possui audience no Resend. Recrie o segmento."), { status: 400 });

  const broadcastResult = await resend.broadcasts.create({
    audienceId,
    from,
    subject: cleanString(subject),
    html: safeBodyHtml,
    name: cleanString(subject),
  });
  if (broadcastResult.error) throw Object.assign(new Error(broadcastResult.error.message || "Falha ao criar broadcast no Resend."), { status: 502 });
  const broadcastId = broadcastResult.data.id;

  const sendResult = await resend.broadcasts.send(broadcastId);
  if (sendResult.error) throw Object.assign(new Error(sendResult.error.message || "Falha ao enviar broadcast no Resend."), { status: 502 });

  const msgDoc = await databases.createDocument(
    DATABASE_ID,
    BROADCAST_MESSAGES_COLLECTION_ID,
    sdk.ID.unique(),
    {
      segment_id: segmentId,
      segment_name: segDoc.name || "",
      resend_broadcast_id: broadcastId,
      subject: cleanString(subject),
      body_html: safeBodyHtml,
      sent_at: nowIso(),
      sent_by: actorUserId || null,
      recipient_count: segDoc.member_count ?? 0,
      status: "sent",
    },
    ADMIN_DOC_PERMS,
  );
  return toMessageDoc(msgDoc);
}

// ── /Email MKT ───────────────────────────────────────────────────────────────

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
    "flight.reminder_24h": {
      eventType: "flight.reminder_24h",
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
    "schedule.published": {
      eventType: "schedule.published",
      data: {
        weekStart: "2026-05-18",
        weekLabel: "18 a 23 de maio",
        flights: [
          { date: "2026-05-19", startTime: "09:00", durationHours: 1.5, aircraft: "PS-ABC", instructorName: "João Silva" },
          { date: "2026-05-21", startTime: "14:30", durationHours: 2, aircraft: "PS-DEF", instructorName: "Maria Costa" },
        ],
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

    const actorUserId = await resolveActorUserId(req);
    const payload = req.bodyJson || {};
    const action = String(payload.action || "listSummaries");
    log(`[action=${action}] userId=${actorUserId || "(none)"}`);

    if (!actorUserId && action === "listSummaries") {
      const result = await runFlightReminderScan("system");
      return jsonResponse(res, 200, { ok: true, ...result });
    }

    if (action === "registerPushSubscription") {
      await registerPushSubscription(actorUserId, payload.subscription);
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "deletePushSubscription") {
      await deletePushSubscription(actorUserId, payload.endpoint);
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "dispatchEvent") {
      await authorizeDispatchEvent(actorUserId, payload.event);
      const deliveries = await dispatchNotificationEvent(actorUserId, payload.event);
      log(
        `[dispatchEvent] type=${cleanString(payload.event?.eventType)} recipients=${deliveries.length} results=${JSON.stringify(deliveries)}`,
      );
      return jsonResponse(res, 200, { ok: true, deliveries });
    }

    if (action === "runFlightReminderScan") {
      if (actorUserId) await requireAdmin(actorUserId);
      const result = await runFlightReminderScan(actorUserId || "system");
      return jsonResponse(res, 200, { ok: true, ...result });
    }

    if (action === "getVideoWorkerConfig") {
      const videoWorker = await getVideoWorkerConfig(actorUserId, payload);
      return jsonResponse(res, 200, videoWorker);
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

    if (action === "reopenFlightForEdit") {
      const result = await reopenFlightForEdit(actorUserId, payload, req);
      return jsonResponse(res, 200, result);
    }

    if (action === "createAuditEvent") {
      const auditEvent = await createAuditEvent(actorUserId, {
        eventType: payload.eventType,
        entityType: payload.entityType,
        entityId: payload.entityId,
        reason: payload.reason,
        beforeSnapshot: payload.beforeSnapshot,
        afterSnapshot: payload.afterSnapshot,
        ip: req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "",
        userAgent: req.headers["user-agent"] || "",
      });
      return jsonResponse(res, 200, { auditEvent: auditEvent ? { id: auditEvent.$id } : null });
    }

    if (action === "listFlightAuditEvents") {
      const auditEvents = await listFlightAuditEvents(payload);
      return jsonResponse(res, 200, { auditEvents });
    }

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

    if (action === "getGoogleCalendarSettings") {
      const { publicSettings } = await loadGoogleCalendarSettings();
      return jsonResponse(res, 200, { googleCalendarSettings: publicSettings });
    }

    if (action === "saveGoogleCalendarSettings") {
      const googleCalendarSettings = await saveGoogleCalendarSettings(payload.settings);
      return jsonResponse(res, 200, { googleCalendarSettings });
    }

    if (action === "testGoogleCalendarConnection") {
      const googleCalendarSettings = await testGoogleCalendarConnection();
      return jsonResponse(res, 200, { googleCalendarSettings });
    }

    if (action === "syncFlightCalendarEvent") {
      const googleCalendarSettings = await syncFlightCalendarEvent(actorUserId, payload);
      return jsonResponse(res, 200, { ok: true, googleCalendarSettings });
    }

    if (action === "sendTestEmail") {
      await sendTestEmail(payload.to, payload.templateType);
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "updateRole") {
      const customRoleSlug = payload.customRoleSlug ? String(payload.customRoleSlug) : null;
      const user = await updateRole(actorUserId, String(payload.userId || ""), String(payload.role || ""), customRoleSlug);
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

    if (action === "getFinancialDre") {
      const dre = await buildFinancialDre({
        fromMonth: String(payload.fromMonth || ""),
        toMonth: String(payload.toMonth || ""),
      });
      return jsonResponse(res, 200, { dre });
    }

    if (action === "closeFinancialMonth") {
      const dre = await closeFinancialMonth(actorUserId, String(payload.month || ""), String(payload.notes || ""));
      return jsonResponse(res, 200, { dre });
    }

    if (action === "reopenFinancialMonth") {
      const dre = await reopenFinancialMonth(actorUserId, String(payload.month || ""));
      return jsonResponse(res, 200, { dre });
    }

    if (action === "saveFinancialDreManualValue") {
      const dre = await saveFinancialDreManualValue(actorUserId, String(payload.month || ""), String(payload.lineId || ""), payload.amount);
      return jsonResponse(res, 200, { dre });
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

    if (action === "createHelpSection") {
      const document = await createHelpDocument("section", payload.data);
      return jsonResponse(res, 200, { document });
    }

    if (action === "updateHelpSection") {
      const document = await updateHelpDocument("section", String(payload.documentId || ""), payload.data);
      return jsonResponse(res, 200, { document });
    }

    if (action === "deleteHelpSection") {
      await deleteHelpDocument("section", String(payload.documentId || ""));
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "createHelpSubsection") {
      const document = await createHelpDocument("subsection", payload.data);
      return jsonResponse(res, 200, { document });
    }

    if (action === "updateHelpSubsection") {
      const document = await updateHelpDocument("subsection", String(payload.documentId || ""), payload.data);
      return jsonResponse(res, 200, { document });
    }

    if (action === "deleteHelpSubsection") {
      await deleteHelpDocument("subsection", String(payload.documentId || ""));
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "createHelpArticle") {
      const document = await createHelpDocument("article", payload.data);
      return jsonResponse(res, 200, { document });
    }

    if (action === "updateHelpArticle") {
      const document = await updateHelpDocument("article", String(payload.documentId || ""), payload.data);
      return jsonResponse(res, 200, { document });
    }

    if (action === "deleteHelpArticle") {
      await deleteHelpDocument("article", String(payload.documentId || ""));
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "getDetail") {
      const user = await getUserDetail(String(payload.userId || ""));
      return jsonResponse(res, 200, { user });
    }

    if (action === "listFlightReports") {
      const report = await listFlightReports(payload);
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

    if (action === "getResendAccountInfo") {
      const accountInfo = await getResendAccountInfo();
      return jsonResponse(res, 200, { accountInfo });
    }

    if (action === "previewBroadcastRecipients") {
      const result = await previewBroadcastRecipients(payload.filter);
      return jsonResponse(res, 200, result);
    }

    if (action === "listBroadcastSegments") {
      const segments = await listBroadcastSegments();
      return jsonResponse(res, 200, { segments });
    }

    if (action === "createBroadcastSegment") {
      const segment = await createBroadcastSegment(actorUserId, {
        name: String(payload.name || ""),
        description: String(payload.description || ""),
        filter: payload.filter,
      });
      return jsonResponse(res, 200, { segment });
    }

    if (action === "deleteBroadcastSegment") {
      await deleteBroadcastSegment(String(payload.segmentId || ""));
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "listBroadcastMessages") {
      const result = await listBroadcastMessages({ limit: payload.limit, offset: payload.offset });
      return jsonResponse(res, 200, result);
    }

    if (action === "createAndSendBroadcast") {
      const broadcastMessage = await createAndSendBroadcast(actorUserId, {
        segmentId: String(payload.segmentId || ""),
        subject: String(payload.subject || ""),
        bodyHtml: String(payload.bodyHtml || ""),
        testEmail: payload.testEmail ? String(payload.testEmail) : null,
        confirmSend: payload.confirmSend === true,
      });
      return jsonResponse(res, 200, { broadcastMessage });
    }

    if (action === "ensureDefaultStudentTrack") {
      const result = await ensureDefaultStudentTrainingTrack(actorUserId, payload.userId);
      return jsonResponse(res, 200, result);
    }

    return jsonResponse(res, 400, { message: "Acao invalida." });
  } catch (err) {
    const status = err?.status || 500;
    error(String(err?.message || err));
    log(String(err?.stack || ""));
    return jsonResponse(res, status, { message: err?.message || "Unexpected function error." });
  }
};

