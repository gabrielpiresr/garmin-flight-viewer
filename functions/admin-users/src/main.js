const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const sdk = require("node-appwrite");
const { buildEnrollmentFormPdf } = require("./enrollmentFormPdf");
const { Resend } = require("resend");
const webpush = require("web-push");
const pdfParse = require("pdf-parse");
const { createStudentAutomationService } = require("./studentAutomations");
const { buildLeadStatusMove, toStatusSettingFromDoc } = require("./crmStatusMove");

const client = new sdk.Client()
  .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || "")
  .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || "")
  .setKey(process.env.APPWRITE_API_KEY || "");

const databases = new sdk.Databases(client);
const users = new sdk.Users(client);
const storage = new sdk.Storage(client);
const functions = new sdk.Functions(client);

const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const PROFILES_COLLECTION_ID = process.env.APPWRITE_PROFILES_COLLECTION_ID;
const PROFILE_DOCUMENTS_COLLECTION_ID =
  process.env.APPWRITE_PROFILE_DOCUMENTS_COLLECTION_ID ||
  process.env.APPWRITE_PROFILE_DOCUMENTS_COL_ID ||
  "profile_documents";
const FLIGHTS_COLLECTION_ID = process.env.APPWRITE_FLIGHTS_COLLECTION_ID || process.env.APPWRITE_COLLECTION_ID;
const FLIGHT_VIDEOS_COLLECTION_ID =
  process.env.APPWRITE_VIDEOS_COLLECTION_ID || process.env.APPWRITE_FLIGHT_VIDEOS_COLLECTION_ID || "6a0200bf00297bfc2231";
const MANEUVER_TEMPLATES_COLLECTION_ID =
  process.env.APPWRITE_MANEUVER_TEMPLATES_COLLECTION_ID || process.env.APPWRITE_MANEUVER_TEMPLATES_COL_ID || "6a1464c9000cf7c9d709";
const FLIGHT_MANEUVERS_COLLECTION_ID =
  process.env.APPWRITE_FLIGHT_MANEUVERS_COLLECTION_ID || process.env.APPWRITE_FLIGHT_MANEUVERS_COL_ID || "6a1464e300079d599e22";
const FLIGHT_MANEUVER_REVIEWS_COLLECTION_ID =
  process.env.APPWRITE_FLIGHT_MANEUVER_REVIEWS_COLLECTION_ID ||
  process.env.APPWRITE_FLIGHT_MANEUVER_REVIEWS_COL_ID ||
  "6a1464f40014e9bd5f5b";
const FLIGHTS_CSV_BUCKET_ID = process.env.APPWRITE_BUCKET_ID || process.env.APPWRITE_FLIGHTS_BUCKET_ID || "flights-csv";
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
const SCHOOL_PRODUCTS_COLLECTION_ID = process.env.APPWRITE_SCHOOL_PRODUCTS_COLLECTION_ID || process.env.APPWRITE_SCHOOL_PRODUCTS_COL_ID || "school_products";
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
const FLIGHT_TAKEOFFS_COLLECTION_ID =
  process.env.APPWRITE_FLIGHT_TAKEOFFS_COLLECTION_ID || process.env.APPWRITE_FLIGHT_TAKEOFFS_COL_ID;
const FLIGHT_TELEMETRY_ALERTS_COLLECTION_ID =
  process.env.APPWRITE_FLIGHT_TELEMETRY_ALERTS_COLLECTION_ID || process.env.APPWRITE_FLIGHT_TELEMETRY_ALERTS_COL_ID;
const TRAINING_TRACKS_COLLECTION_ID =
  process.env.APPWRITE_TRAINING_TRACKS_COLLECTION_ID || process.env.APPWRITE_TRAINING_TRACKS_COL_ID;
const STUDENT_TRACKS_COLLECTION_ID =
  process.env.APPWRITE_STUDENT_TRACKS_COLLECTION_ID || process.env.APPWRITE_STUDENT_TRACKS_COL_ID;
const STUDENT_OBSERVATIONS_COLLECTION_ID =
  process.env.APPWRITE_STUDENT_OBSERVATIONS_COLLECTION_ID ||
  process.env.APPWRITE_STUDENT_OBSERVATIONS_COL_ID ||
  "student_observations";
const CONTRACTS_COLLECTION_ID =
  process.env.APPWRITE_CONTRACTS_COLLECTION_ID || process.env.APPWRITE_CONTRACTS_COL_ID || "contracts";
const CONTRACT_TEMPLATES_COLLECTION_ID =
  process.env.APPWRITE_CONTRACT_TEMPLATES_COLLECTION_ID || process.env.APPWRITE_CONTRACT_TEMPLATES_COL_ID || "contract_templates";
const CONTRACT_SIGNATURES_COLLECTION_ID =
  process.env.APPWRITE_CONTRACT_SIGNATURES_COLLECTION_ID ||
  process.env.APPWRITE_CONTRACT_SIGNATURES_COL_ID ||
  "contract_signatures";
const CRM_LEADS_COLLECTION_ID = process.env.APPWRITE_CRM_LEADS_COLLECTION_ID || process.env.APPWRITE_CRM_LEADS_COL_ID || "crm_leads";
const CRM_STATUS_SETTINGS_COLLECTION_ID =
  process.env.APPWRITE_CRM_STATUS_SETTINGS_COLLECTION_ID ||
  process.env.APPWRITE_CRM_STATUS_SETTINGS_COL_ID ||
  "crm_status_settings";
const CRM_PROPOSALS_COLLECTION_ID =
  process.env.APPWRITE_CRM_PROPOSALS_COLLECTION_ID || process.env.APPWRITE_CRM_PROPOSALS_COL_ID || "crm_proposals";
const CAKTO_RECEIPTS_COLLECTION_ID =
  process.env.APPWRITE_CAKTO_RECEIPTS_COLLECTION_ID || process.env.APPWRITE_CAKTO_RECEIPTS_COL_ID || "cakto_receipts";
const MAINTENANCE_ATTACHMENTS_COLLECTION_ID =
  process.env.APPWRITE_MAINTENANCE_ATTACHMENTS_COLLECTION_ID || process.env.APPWRITE_MAINTENANCE_ATTACHMENTS_COL_ID;
const MANEUVERS_SECTIONS_COLLECTION_ID = process.env.APPWRITE_MANEUVERS_SECTIONS_COLLECTION_ID;
const MANEUVERS_SUBSECTIONS_COLLECTION_ID = process.env.APPWRITE_MANEUVERS_SUBSECTIONS_COLLECTION_ID;
const MANEUVERS_ARTICLES_COLLECTION_ID = process.env.APPWRITE_MANEUVERS_ARTICLES_COLLECTION_ID;
const HELP_SECTIONS_COLLECTION_ID = process.env.APPWRITE_HELP_SECTIONS_COLLECTION_ID;
const HELP_SUBSECTIONS_COLLECTION_ID = process.env.APPWRITE_HELP_SUBSECTIONS_COLLECTION_ID;
const HELP_ARTICLES_COLLECTION_ID = process.env.APPWRITE_HELP_ARTICLES_COLLECTION_ID;
const INSTRUCTOR_HELP_SECTIONS_COLLECTION_ID = process.env.APPWRITE_INSTRUCTOR_HELP_SECTIONS_COLLECTION_ID;
const INSTRUCTOR_HELP_ARTICLES_COLLECTION_ID = process.env.APPWRITE_INSTRUCTOR_HELP_ARTICLES_COLLECTION_ID;
const PLATFORM_SETTINGS_COLLECTION_ID = process.env.APPWRITE_PLATFORM_SETTINGS_COLLECTION_ID;
const ONBOARDING_STEPS_COLLECTION_ID = process.env.APPWRITE_ONBOARDING_STEPS_COLLECTION_ID;
const PUSH_SUBSCRIPTIONS_COLLECTION_ID = process.env.APPWRITE_PUSH_SUBSCRIPTIONS_COLLECTION_ID;
const NOTIFICATION_DELIVERIES_COLLECTION_ID = process.env.APPWRITE_NOTIFICATION_DELIVERIES_COLLECTION_ID;
const BROADCAST_SEGMENTS_COLLECTION_ID = process.env.APPWRITE_BROADCAST_SEGMENTS_COLLECTION_ID;
const BROADCAST_MESSAGES_COLLECTION_ID = process.env.APPWRITE_BROADCAST_MESSAGES_COLLECTION_ID;
const STUDENT_AUTOMATIONS_COLLECTION_ID = process.env.APPWRITE_STUDENT_AUTOMATIONS_COLLECTION_ID || "student_automations";
const AUTOMATION_STATES_COLLECTION_ID = process.env.APPWRITE_AUTOMATION_STATES_COLLECTION_ID || "student_automation_states";
const AUTOMATION_RUNS_COLLECTION_ID = process.env.APPWRITE_AUTOMATION_RUNS_COLLECTION_ID || "student_automation_runs";
const AUTOMATION_STEP_RUNS_COLLECTION_ID = process.env.APPWRITE_AUTOMATION_STEP_RUNS_COLLECTION_ID || "student_automation_step_runs";
const AUTOMATION_JOBS_COLLECTION_ID = process.env.APPWRITE_AUTOMATION_JOBS_COLLECTION_ID || "student_automation_jobs";
const AUTOMATION_EMAIL_TEMPLATES_COLLECTION_ID = process.env.APPWRITE_AUTOMATION_EMAIL_TEMPLATES_COLLECTION_ID || "student_automation_email_templates";
const STUDENT_CRM_STATUSES_COLLECTION_ID = process.env.APPWRITE_STUDENT_CRM_STATUSES_COLLECTION_ID || "student_crm_statuses";
const STUDENT_CRM_PROFILES_COLLECTION_ID = process.env.APPWRITE_STUDENT_CRM_PROFILES_COLLECTION_ID || "student_crm_profiles";
const INSTRUCTOR_STUDENTS_COLLECTION_ID = process.env.APPWRITE_INSTRUCTOR_STUDENTS_COLLECTION_ID || "instructor_students";
const ADMIN_USERS_FUNCTION_ID = process.env.APPWRITE_ADMIN_USERS_FUNCTION_ID || "admin-users";
const WEB_PUSH_PUBLIC_KEY = process.env.WEB_PUSH_PUBLIC_KEY || "";
const WEB_PUSH_PRIVATE_KEY = process.env.WEB_PUSH_PRIVATE_KEY || "";
const WEB_PUSH_CONTACT = process.env.WEB_PUSH_CONTACT || "mailto:admin@example.com";
const APP_URL = process.env.APP_URL || "";
const CF_WORKER_URL = process.env.CF_WORKER_URL || "";
const WORKER_SECRET = process.env.WORKER_SECRET || "";
const GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON || "";
const GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL || "";
const GOOGLE_CALENDAR_PRIVATE_KEY = process.env.GOOGLE_CALENDAR_PRIVATE_KEY || "";
const GOOGLE_CALENDAR_OAUTH_CLIENT_ID = process.env.GOOGLE_CALENDAR_OAUTH_CLIENT_ID || "";
const GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET = process.env.GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET || "";
// Identificador único da escola — usado para isolar dados em ambiente multi-tenant.
const SYNC_ANAC_FUNCTION_ID = process.env.APPWRITE_SYNC_ANAC_FUNCTION_ID || process.env.VITE_APPWRITE_SYNC_ANAC_FUNCTION_ID || "sync-anac-profile";
const SCHOOL_ID = process.env.SCHOOL_ID || "escola_principal";
const TENANT_ROLES_COLLECTION_ID =
  process.env.APPWRITE_TENANT_ROLES_COLLECTION_ID ||
  process.env.VITE_APPWRITE_TENANT_ROLES_COL_ID ||
  "6a106ec200312c19cc06";
const VALID_ROLES = new Set(["admin", "instrutor", "aluno"]);
const VALID_FLIGHT_STATUSES = new Set(["Pendente", "Confirmado", "Previsto", "Cancelado", "Realizado"]);
const SCHEDULED_FLIGHT_STATUSES = new Set(["Pendente", "Confirmado", "Previsto"]);
const GHOST_FLIGHT_SOURCE_PREFIX = "ghost-flight-";
const SAGA_CREDIT_BANK_ID = process.env.SAGA_CREDIT_BANK_ID || "6";
// Banco usado no lançamento de MULTA (remoção de crédito). No exemplo real do SAGA a
// multa de cancelamento usa bank_id=2 (diferente do banco de compra). Configurável.
const SAGA_CREDIT_PENALTY_BANK_ID = process.env.SAGA_CREDIT_PENALTY_BANK_ID || "2";
const SAGA_CREDIT_TYPE = process.env.SAGA_CREDIT_TYPE || "GENERIC";
const SAGA_CREDIT_AIRCRAFT_ICAO = process.env.SAGA_CREDIT_AIRCRAFT_ICAO || "MC01";

function isScheduledFlightStatusValue(value) {
  return SCHEDULED_FLIGHT_STATUSES.has(cleanString(value));
}
const VALID_INSTRUCTOR_PREFERENCES = new Set(["low", "medium", "high"]);
const VALID_AVAILABILITY_TYPES = new Set(["available", "preferred", "blocked"]);
const META_PREFIX = "#GFV_META_V1:";
const TELEMETRY_FILES_PREFIX = "#GFV_TELEMETRY_FILES_V1:";
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
  "saga_flight_id",
  "saga_schedule_id",
  "saga_schedule_synced_at",
  "saga_schedule_sync_status",
  "public_share_enabled",
  "public_share_created_at",
  "public_share_last_generated_at",
];
const FLIGHT_DETAIL_SELECT = [
  ...FLIGHT_SELECT,
  "csv_text",
  "csv_file_id",
  "from_to",
  "landings",
  "block_time_minutes",
  "total_flight_minutes",
  "total_miles",
  "telemetry_present",
  "training_mission_ids_json",
  "schedule_week_start",
  "schedule_demand_id",
  "flight_seq_number",
];
const FLIGHT_REPORT_SELECT = FLIGHT_DETAIL_SELECT.filter((field) => field !== "csv_text");
const PROFILE_SELECT = [
  "$id",
  "school_id",
  "user_id",
  "is_active",
  "role",
  "email",
  "full_name",
  "nickname",
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
  "roles",
  "active_role",
  "role_custom_slugs_json",
  "assigned_role_slugs",
  "active_role_slug",
  "saga_user_id",
  "rg",
  "rg_orgao_expedidor",
  "rg_data_emissao",
  "endereco",
  "cep",
  "cidade",
  "uf",
  "nacionalidade",
  "estado_civil",
  "sexo",
  "naturalidade",
  "filiacao_pai",
  "filiacao_mae",
  "escolaridade",
  "escolaridade_periodo",
  "escolaridade_curso",
  "alergias_medicamentos",
  "emergencia_nome",
  "emergencia_parentesco",
  "emergencia_endereco",
  "emergencia_telefone",
];
const PROFILE_DOCUMENT_SELECT = [
  "$id",
  "user_id",
  "document_type",
  "file_id",
  "file_name",
  "mime_type",
  "file_size",
  "uploaded_at",
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
  "weekday_only",
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
  "is_flight_review_club_member",
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

function parseFunctionPayload(req) {
  try {
    if (req?.bodyJson && typeof req.bodyJson === "object") return req.bodyJson;
  } catch {
    // Scheduled executions arrive with an empty body; Appwrite's bodyJson getter
    // throws while parsing "", so fall through to the raw-body candidates.
  }
  const rawCandidates = [req?.body, req?.bodyRaw, req?.payload];
  for (const raw of rawCandidates) {
    if (!raw) continue;
    if (typeof raw === "object") return raw;
    if (typeof raw !== "string") continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // Keep compatibility with runtimes that expose a non-JSON body.
    }
  }
  return {};
}

const SAGA_BASE_URL = "https://epeac.saga.aero";
const PLANE_IT_BASE_URL = "https://app.planeit.com.br";
const PLANE_IT_SESSION_TTL_MS = 20 * 60 * 1000;
let planeItSessionCache = null;
const SAGA_AUTH_SESSION_KEY = "sagaAuthSession";

function sagaHtmlSnippet(html, maxLength = 3000) {
  return String(html || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function sagaTextFromHtml(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#039;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function sagaSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const raw = headers.get("set-cookie");
  if (!raw) return [];
  return raw.split(/,(?=\s*[^;,=\s]+=[^;,]*;)/g).map((cookie) => cookie.trim()).filter(Boolean);
}

function sagaMergeCookies(cookieJar, headers) {
  for (const cookie of sagaSetCookieHeaders(headers)) {
    const pair = String(cookie).split(";", 1)[0] || "";
    const eqIndex = pair.indexOf("=");
    if (eqIndex > 0) cookieJar.set(pair.slice(0, eqIndex), pair.slice(eqIndex + 1));
  }
}

function sagaCookieHeader(cookieJar) {
  return Array.from(cookieJar.entries()).map(([key, value]) => `${key}=${value}`).join("; ");
}

function sagaCloneCookieJar(cookieJar) {
  return new Map(cookieJar.entries());
}

function sagaRestoreCookieJar(cookieJar, snapshot) {
  cookieJar.clear();
  for (const [key, value] of snapshot.entries()) cookieJar.set(key, value);
}

function sagaPersistableCookieKey(key) {
  const normalized = cleanString(key);
  if (!normalized) return false;
  return normalized === "XSRF-TOKEN" || /session/i.test(normalized);
}

function sagaHasAuthCookie(cookieJar) {
  if (!cookieJar || cookieJar.size === 0) return false;
  if (cookieJar.get("saga_session")) return true;
  for (const key of cookieJar.keys()) {
    if (/session/i.test(String(key))) return true;
  }
  return false;
}

function sagaCookieJarToObject(cookieJar) {
  const out = {};
  for (const [key, value] of cookieJar.entries()) {
    if (sagaPersistableCookieKey(key)) out[key] = value;
  }
  return out;
}

function sagaCookieJarFromObject(cookies) {
  const jar = new Map();
  if (!cookies || typeof cookies !== "object") return jar;
  for (const [key, value] of Object.entries(cookies)) {
    const normalizedKey = cleanString(key);
    const normalizedValue = cleanString(value);
    if (normalizedKey && normalizedValue && sagaPersistableCookieKey(normalizedKey)) {
      jar.set(normalizedKey, normalizedValue);
    }
  }
  return jar;
}

async function saveSagaAuthSession(cookieJar, email) {
  if (!PLATFORM_SETTINGS_COLLECTION_ID) return null;
  const cookies = sagaCookieJarToObject(cookieJar);
  if (!sagaHasAuthCookie(cookieJar)) return null;
  const settings = {
    cookies,
    loginEmail: cleanString(email),
    savedAt: nowIso(),
  };
  await upsertPlatformSettingDoc(SAGA_AUTH_SESSION_KEY, settings);
  return { savedAt: settings.savedAt, loginEmail: settings.loginEmail };
}

async function loadSagaAuthSession() {
  const doc = await getSettingDoc(SAGA_AUTH_SESSION_KEY);
  const settings = parseJsonObject(doc?.settings_json, {});
  const cookieJar = sagaCookieJarFromObject(settings.cookies);
  if (!sagaHasAuthCookie(cookieJar)) {
    throw Object.assign(new Error("Sessao SAGA nao configurada. Entre em Admin > Import e faca login no SAGA primeiro."), { status: 401 });
  }
  return {
    cookieJar,
    savedAt: settings.savedAt || doc?.$updatedAt || null,
    loginEmail: settings.loginEmail || "",
  };
}

function extractSagaCsrfToken(html) {
  const text = String(html || "");
  const patterns = [
    /<input\b[^>]*name=["']_token["'][^>]*value=["']([^"']+)["']/i,
    /<input\b[^>]*value=["']([^"']+)["'][^>]*name=["']_token["']/i,
    /<meta\b[^>]*name=["']csrf-token["'][^>]*content=["']([^"']+)["']/i,
    /<meta\b[^>]*content=["']([^"']+)["'][^>]*name=["']csrf-token["']/i,
    /csrfToken["']\s*:\s*["']([^"']+)["']/i,
    /"_token"\s*:\s*"([^"']+)"/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

function resolveSagaCsrfToken(html, cookieJar) {
  const fromHtml = extractSagaCsrfToken(html);
  if (fromHtml) return fromHtml;
  const xsrf = cleanString(cookieJar?.get("XSRF-TOKEN"));
  if (!xsrf) return "";
  try {
    return decodeURIComponent(xsrf);
  } catch {
    return xsrf;
  }
}

function sagaResolveFetchPath(location, basePath = "") {
  const raw = cleanString(location);
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    const url = new URL(raw);
    return `${url.pathname}${url.search}`;
  }
  if (raw.startsWith("/")) return raw;
  const base = cleanString(basePath).replace(/\/+$/, "");
  return `${base}/${raw}`.replace(/\/{2,}/g, "/");
}

async function sagaFetchHtmlFollow(path, options, cookieJar, maxHops = 6) {
  let nextPath = cleanString(path) || "/";
  let last = null;
  for (let hop = 0; hop < maxHops; hop += 1) {
    const result = await sagaFetch(
      nextPath,
      {
        method: "GET",
        ...options,
      },
      cookieJar,
    );
    last = result;
    const status = result.response.status;
    if (status >= 300 && status < 400) {
      const location = result.response.headers.get("location") || "";
      if (!location || /\/login(?:$|[?#])/i.test(location)) return result;
      nextPath = sagaResolveFetchPath(location, nextPath);
      if (!nextPath) return result;
      continue;
    }
    return result;
  }
  return last;
}

async function assertSagaAuthSessionAlive(cookieJar) {
  const probe = await sagaFetch(
    `/users/ajax?_=${Date.now()}`,
    {
      method: "GET",
      headers: {
        accept: "application/json, text/javascript, */*; q=0.01",
        referer: `${SAGA_BASE_URL}/users`,
        "x-requested-with": "XMLHttpRequest",
      },
    },
    cookieJar,
  );
  if (isSagaLoginResponse(probe)) {
    throw Object.assign(new Error("Sessao SAGA expirada. Faca login novamente em Admin > Import."), { status: 401 });
  }
  if (probe.response.status >= 400) {
    throw Object.assign(new Error(`Sessao SAGA invalida (HTTP ${probe.response.status}). Faca login novamente em Admin > Import.`), {
      status: 401,
    });
  }
  try {
    JSON.parse(probe.html);
  } catch {
    throw Object.assign(new Error("Sessao SAGA expirada. Faca login novamente em Admin > Import."), { status: 401 });
  }
}

async function fetchSagaStudentCreateContext(cookieJar) {
  const candidates = [
    { path: "/users/create?access_type=student", referer: `${SAGA_BASE_URL}/users` },
    { path: "/users/create", referer: `${SAGA_BASE_URL}/users` },
    { path: "/students/create", referer: `${SAGA_BASE_URL}/students` },
  ];
  const attempts = [];
  for (const candidate of candidates) {
    const page = await sagaFetchHtmlFollow(
      candidate.path,
      {
        headers: {
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          referer: candidate.referer,
        },
      },
      cookieJar,
    );
    if (!page) continue;
    if (isSagaLoginResponse(page)) {
      attempts.push({ path: candidate.path, status: page.response.status, login: true });
      continue;
    }
    const token = resolveSagaCsrfToken(page.html, cookieJar);
    attempts.push({
      path: candidate.path,
      status: page.response.status,
      token: Boolean(token),
      htmlLength: String(page.html || "").length,
    });
    if (token) {
      return { page, path: candidate.path, token, referer: candidate.referer, attempts, html: page.html };
    }
  }
  return { page: null, path: null, token: null, referer: null, attempts, html: "" };
}

function extractSagaFormPostPath(html, fallbackGetPath) {
  const text = String(html || "");
  const formMatch = text.match(/<form\b[^>]*\baction=["']([^"']+)["']/i);
  if (formMatch?.[1]) {
    const action = cleanString(formMatch[1]);
    if (action && action !== "#" && !/^javascript:/i.test(action)) {
      if (action.startsWith("http://") || action.startsWith("https://")) {
        const url = new URL(action);
        return `${url.pathname}${url.search}`;
      }
      return action.startsWith("/") ? action : `/${action}`;
    }
  }
  const getPath = cleanString(fallbackGetPath) || "/users/create";
  if (getPath.endsWith("/create")) {
    const base = getPath.replace(/\/create$/, "");
    return base || "/users";
  }
  return getPath.includes("/students") ? "/students" : "/users";
}

function sagaPostStudentPath(html, createPath) {
  const fromForm = extractSagaFormPostPath(html, createPath);
  if (fromForm === "/users" || fromForm.startsWith("/users?")) return "/users";
  return "/users";
}

async function sagaPostStudentCreate(cookieJar, { html, createPath, createReferer, formBody }) {
  const postPath = sagaPostStudentPath(html, createPath);
  const post = await sagaFetch(
    postPath,
    {
      method: "POST",
      body: formBody,
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "content-type": "application/x-www-form-urlencoded",
        origin: SAGA_BASE_URL,
        referer: createReferer,
      },
    },
    cookieJar,
  );
  return { post, postPath, attempts: [{ postPath, status: post.response.status }] };
}

async function sagaFetch(path, options, cookieJar) {
  const headers = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
    ...options.headers,
  };
  const cookie = sagaCookieHeader(cookieJar);
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${SAGA_BASE_URL}${path}`, { ...options, headers, redirect: "manual" });
  sagaMergeCookies(cookieJar, response.headers);
  const html = await response.text();
  return { response, html };
}

function translateSagaUserRow(row) {
  const cells = Array.isArray(row) ? row : [];
  return {
    id: cells[0] ?? null,
    nome: sagaTextFromHtml(cells[1]),
    email: sagaTextFromHtml(cells[2]),
    codigoAnac: sagaTextFromHtml(cells[3]),
    cpf: sagaTextFromHtml(cells[4]),
    nascimento: sagaTextFromHtml(cells[5]),
    cma: sagaTextFromHtml(cells[6]),
    habilitacao: sagaTextFromHtml(cells[7]),
    bases: sagaTextFromHtml(cells[8]),
    perfil: sagaTextFromHtml(cells[9]),
    ultimoAcesso: sagaTextFromHtml(cells[10]),
    status: sagaTextFromHtml(cells[11]),
  };
}

function sagaUserDetailToJson(detail) {
  const result = detail && typeof detail === "object" ? detail : {};
  const maybeJsonKeys = [
    "medical_certificate",
    "licenses",
    "types",
    "languages",
    "rg",
    "military",
    "voter",
    "work",
    "study",
    "courses",
    "emergency_contact",
  ];
  for (const key of maybeJsonKeys) {
    const raw = result[key];
    if (typeof raw !== "string" || !raw.trim()) continue;
    try {
      result[key] = JSON.parse(raw);
    } catch {
      // Keep original value when not valid JSON.
    }
  }
  return result;
}

async function fetchSagaUserDetail(cookieJar, sagaUserId, options = {}) {
  const safeId = cleanString(sagaUserId);
  if (!safeId) return null;
  const bearerToken = cleanString(options.apiV2Token);
  let result = null;
  if (bearerToken) {
    const bearerResponse = await fetch(`${SAGA_BASE_URL}/api/v2/users/${encodeURIComponent(safeId)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": "Mozilla/5.0",
      },
    }).catch(() => null);
    if (bearerResponse) {
      const html = await bearerResponse.text().catch(() => "");
      result = { response: bearerResponse, html };
    }
  }
  if (!result) {
    result = await sagaFetch(
      `/api/v2/users/${encodeURIComponent(safeId)}`,
      {
        method: "GET",
        headers: {
          accept: "application/json,*/*",
          referer: `${SAGA_BASE_URL}/users`,
          "x-requested-with": "XMLHttpRequest",
        },
      },
      cookieJar,
    );
  }
  const status = Number(result?.response?.status || 0);
  const location = cleanString(result?.response?.headers?.get?.("location"));
  if (status >= 300 && status < 400 && location) {
    let redirectPath = location;
    if (location.startsWith("http://") || location.startsWith("https://")) {
      try {
        const parsed = new URL(location);
        redirectPath = `${parsed.pathname}${parsed.search || ""}`;
      } catch {
        redirectPath = location;
      }
    }
    if (redirectPath.startsWith("/")) {
      result = await sagaFetch(
        redirectPath,
        {
          method: "GET",
          headers: {
            accept: "application/json,*/*",
            referer: `${SAGA_BASE_URL}/users`,
            "x-requested-with": "XMLHttpRequest",
          },
        },
        cookieJar,
      );
    }
  }
  if (isSagaLoginResponse(result) || Number(result.response.status || 0) >= 400) return null;
  try {
    const parsed = JSON.parse(result.html);
    const detail = sagaUserDetailToJson(parsed?.user || parsed?.data || parsed);
    if (detail && Object.keys(detail).length > 0) return detail;
  } catch {
    // fallback below
  }
  const htmlFallback = await sagaFetchHtmlFollow(
    `/users/${encodeURIComponent(safeId)}/edit`,
    {
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        referer: `${SAGA_BASE_URL}/users`,
      },
    },
    cookieJar,
  ).catch(() => null);
  if (!htmlFallback || isSagaLoginResponse(htmlFallback)) return null;
  const html = String(htmlFallback.html || "");
  const pick = (name) => {
    const safeName = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const inputMatch = html.match(new RegExp(`<input[^>]*name=["']${safeName}["'][^>]*value=["']([^"']*)["']`, "i"));
    if (inputMatch?.[1]) return sagaTextFromHtml(inputMatch[1]);
    const textAreaMatch = html.match(new RegExp(`<textarea[^>]*name=["']${safeName}["'][^>]*>([\\s\\S]*?)<\\/textarea>`, "i"));
    if (textAreaMatch?.[1]) return sagaTextFromHtml(textAreaMatch[1]);
    return "";
  };
  const fallback = {
    id: safeId,
    phone: pick("phone"),
    nationality: pick("nationality"),
    birthplace: pick("birthplace"),
    father_name: pick("father_name"),
    mother_name: pick("mother_name"),
    civil_state: pick("civil_state"),
    address_street: pick("address_street"),
    address_city: pick("address_city"),
    address_state: pick("address_state"),
    address_zipcode: pick("address_zipcode"),
  };
  return Object.values(fallback).some((value) => cleanString(value)) ? fallback : null;
}

function sagaHtmlTables(html) {
  const tables = [];
  const tableMatches = String(html || "").matchAll(/<table\b[\s\S]*?<\/table>/gi);
  for (const tableMatch of tableMatches) {
    const tableHtml = tableMatch[0];
    const rows = [];
    const rowMatches = tableHtml.matchAll(/<tr\b[\s\S]*?<\/tr>/gi);
    for (const rowMatch of rowMatches) {
      const rowHtml = rowMatch[0];
      const cells = [];
      const cellMatches = rowHtml.matchAll(/<(th|td)\b[\s\S]*?<\/\1>/gi);
      for (const cellMatch of cellMatches) {
        cells.push({
          tag: cellMatch[1].toLowerCase(),
          text: sagaTextFromHtml(cellMatch[0]),
        });
      }
      if (cells.some((cell) => cell.text)) rows.push(cells);
    }
    if (!rows.length) continue;
    const firstHeaderIndex = rows.findIndex((row) => row.some((cell) => cell.tag === "th"));
    const headerIndex = firstHeaderIndex >= 0 ? firstHeaderIndex : 0;
    const headerRow = rows[headerIndex];
    const bodyRows = rows
      .filter((row) => row.every((cell) => cell.tag !== "th"))
      .map((row) => row.map((cell) => cell.text))
      .filter((row) => row.some(Boolean));
    tables.push({
      headers: headerRow.map((cell) => cell.text).filter(Boolean),
      rows: bodyRows,
    });
  }
  return tables;
}

function normalizeSagaKey(value, fallback) {
  const key = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, char) => String(char || "").toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, "");
  return key || fallback;
}

function tableToObjects(table, headerMap = {}) {
  const headers = table.headers.length
    ? table.headers
    : Array.from({ length: Math.max(0, ...table.rows.map((row) => row.length)) }, (_, index) => `Coluna ${index + 1}`);
  const keys = headers.map((header, index) => headerMap[header] || normalizeSagaKey(header, `coluna${index + 1}`));
  return table.rows.map((row) => {
    const item = {};
    keys.forEach((key, index) => {
      item[key] = row[index] || "";
    });
    return item;
  });
}

function findSagaTable(html, requiredHeaders) {
  const normalizedRequired = requiredHeaders.map((header) => normalizeSearch(header));
  let best = null;
  let bestScore = -1;
  for (const table of sagaHtmlTables(html)) {
    const normalizedHeaders = table.headers.map((header) => normalizeSearch(header));
    const score = normalizedRequired.filter((header) => normalizedHeaders.includes(header)).length;
    if (score > bestScore || (score === bestScore && table.rows.length > (best?.rows.length || 0))) {
      best = table;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

const SAGA_FLIGHT_HEADER_MAP = {
  ID: "id",
  Perna: "perna",
  "Data do Voo": "dataDoVoo",
  Base: "base",
  Aeronave: "aeronave",
  Instrutor: "instrutor",
  CANAC: "canacInstrutor",
  Aluno: "aluno",
  "Horímetro Inicial": "horimetroInicial",
  "Horímetro Final": "horimetroFinal",
  "Missão do Aluno": "missaoDoAluno",
  Origem: "origem",
  Destino: "destino",
  Acionamento: "acionamento",
  Decolagem: "decolagem",
  Pouso: "pouso",
  Corte: "corte",
  "Tempo de Voo (hh:mm)": "tempoDeVooHhmm",
  "Tempo de Serviço (hh:mm)": "tempoDeServicoHhmm",
  "Tempo de Voo (h)": "tempoDeVooHoras",
  "Tempo de Serviço (h)": "tempoDeServicoHoras",
  "N. Pousos": "numeroPousos",
  "Distância": "distancia",
  "Função a Bordo": "funcaoABordo",
  "Regras de Voo": "regrasDeVoo",
  "DIU OU NOT": "diurnoOuNoturno",
  "Diário de Bordo": "diarioDeBordo",
  Grau: "grau",
  "Combustível": "combustivel",
  "CE #": "ce",
  "Óleo": "oleo",
  "Valor do Voo": "valorDoVoo",
  Curso: "curso",
};

const SAGA_FINANCE_HEADER_MAP = {
  Selecionar: "selecionar",
  ID: "id",
  Data: "data",
  Cliente: "cliente",
  Natureza: "natureza",
  "Valor Total": "valorTotal",
  Banco: "banco",
  Status: "status",
  "Ações": "acoes",
};

const SAGA_CREDIT_COLUMN_DEFS = [
  { key: "model", label: "Modelo", defaultIndex: 0 },
  { key: "hours", label: "Creditos (h)", defaultIndex: 1 },
  { key: "hoursHhmm", label: "Creditos (hh:mm)", defaultIndex: 2 },
  { key: "hourlyValue", label: "Valor Hora", defaultIndex: 3 },
  { key: "totalValue", label: "Valor Total", defaultIndex: 4 },
  { key: "purchaseDate", label: "Data", defaultIndex: 5 },
  { key: "expiresAt", label: "Data de Validade", defaultIndex: 6 },
  { key: "notes", label: "Obs", defaultIndex: 7 },
  { key: "responsible", label: "Usuario Responsavel", defaultIndex: 8 },
];

const SAGA_DEFAULT_CREDIT_COLUMN_MAP = Object.fromEntries(SAGA_CREDIT_COLUMN_DEFS.map((def) => [def.key, def.defaultIndex]));

const SAGA_FLIGHT_COLUMN_DEFS = [
  { key: "id", label: "ID", defaultIndex: 0 },
  { key: "perna", label: "Perna", defaultIndex: 1 },
  { key: "dataDoVoo", label: "Data do Voo", defaultIndex: 2 },
  { key: "base", label: "Base", defaultIndex: 3 },
  { key: "aeronave", label: "Aeronave", defaultIndex: 4 },
  { key: "instrutor", label: "Instrutor", defaultIndex: 5 },
  { key: "canacInstrutor", label: "CANAC Instrutor", defaultIndex: 6 },
  { key: "aluno", label: "Aluno", defaultIndex: 7 },
  { key: "canacAluno", label: "CANAC Aluno", defaultIndex: 8 },
  { key: "horimetroInicial", label: "Horimetro Inicial", defaultIndex: 9 },
  { key: "horimetroFinal", label: "Horimetro Final", defaultIndex: 10 },
  { key: "missaoDoAluno", label: "Missao do Aluno", defaultIndex: 11 },
  { key: "origem", label: "Origem", defaultIndex: 12 },
  { key: "destino", label: "Destino", defaultIndex: 13 },
  { key: "acionamento", label: "Acionamento", defaultIndex: 14 },
  { key: "decolagem", label: "Decolagem", defaultIndex: 15 },
  { key: "pouso", label: "Pouso", defaultIndex: 16 },
  { key: "corte", label: "Corte", defaultIndex: 17 },
  { key: "tempoDeVooHhmm", label: "Tempo de Voo (hh:mm)", defaultIndex: 18 },
  { key: "tempoDeServicoHhmm", label: "Tempo de Servico (hh:mm)", defaultIndex: 19 },
  { key: "tempoDeVooHoras", label: "Tempo de Voo (h)", defaultIndex: 20 },
  { key: "tempoDeServicoHoras", label: "Tempo de Servico (h)", defaultIndex: 21 },
  { key: "numeroPousos", label: "N. Pousos", defaultIndex: 22 },
  { key: "distancia", label: "Distancia", defaultIndex: 23 },
  { key: "funcaoABordo", label: "Funcao a Bordo", defaultIndex: 24 },
  { key: "regrasDeVoo", label: "Regras de Voo", defaultIndex: 25 },
  { key: "diurnoOuNoturno", label: "DIU OU NOT", defaultIndex: 26 },
  { key: "diarioDeBordo", label: "Diario de Bordo", defaultIndex: 27 },
  { key: "grau", label: "Grau", defaultIndex: 28 },
  { key: "combustivel", label: "Combustivel", defaultIndex: 29 },
  { key: "ce", label: "CE #", defaultIndex: 30 },
  { key: "oleo", label: "Oleo", defaultIndex: 31 },
  { key: "valorDoVoo", label: "Valor do Voo", defaultIndex: 32 },
  { key: "curso", label: "Curso", defaultIndex: 33 },
];

const SAGA_DEFAULT_FLIGHT_COLUMN_MAP = Object.fromEntries(SAGA_FLIGHT_COLUMN_DEFS.map((def) => [def.key, def.defaultIndex]));

function sagaFlightFromCells(cells, columnMap = SAGA_DEFAULT_FLIGHT_COLUMN_MAP) {
  const rawCells = Array.isArray(cells) ? cells : [];
  const item = {};
  for (const def of SAGA_FLIGHT_COLUMN_DEFS) {
    const index = Number.isInteger(columnMap?.[def.key]) ? columnMap[def.key] : def.defaultIndex;
    item[def.key] = rawCells[index] || "";
  }
  item.rawCells = rawCells;
  return item;
}

function applySagaFlightColumnMap(rows, columnMap) {
  return (rows || []).map((row) => sagaFlightFromCells(Array.isArray(row.rawCells) ? row.rawCells : [], columnMap));
}

function translateSagaFlightRows(html) {
  const table = findSagaTable(html, ["ID", "Perna", "Data do Voo", "Aeronave", "Aluno"]);
  if (!table) return { rows: [], headers: [] };
  const rows = table.rows.map((cells) => sagaFlightFromCells(cells));
  return { rows, headers: table.headers };
}

function translateSagaFinanceRows(html) {
  const table = findSagaTable(html, ["ID", "Data", "Cliente", "Valor Total", "Status"]);
  if (!table) return { rows: [], headers: [] };
  return { rows: tableToObjects(table, SAGA_FINANCE_HEADER_MAP), headers: table.headers };
}

function sagaCreditFromCells(cells, columnMap = SAGA_DEFAULT_CREDIT_COLUMN_MAP) {
  const rawCells = Array.isArray(cells) ? cells : [];
  const item = {};
  for (const def of SAGA_CREDIT_COLUMN_DEFS) {
    const index = Number.isInteger(columnMap?.[def.key]) ? columnMap[def.key] : def.defaultIndex;
    item[def.key] = rawCells[index] || "";
  }
  item.rawCells = rawCells;
  return item;
}

function applySagaCreditColumnMap(rows, columnMap) {
  return (rows || []).map((row) => {
    const mapped = sagaCreditFromCells(Array.isArray(row.rawCells) ? row.rawCells : [], columnMap);
    // Preserve metadata attached during scraping (student/anac/sagaUserId).
    return {
      ...mapped,
      sagaUserId: cleanString(row?.sagaUserId),
      studentName: cleanString(row?.studentName),
      studentEmail: cleanString(row?.studentEmail),
      studentAnac: cleanString(row?.studentAnac),
    };
  });
}

function translateSagaCreditRows(html) {
  const table = findSagaTable(html, ["Modelo", "Créditos (h)", "Valor Hora", "Valor Total", "Data de Validade"]);
  if (!table) return { rows: [], headers: [] };
  return { rows: table.rows.map((cells) => sagaCreditFromCells(cells)), headers: table.headers };
}

async function fetchSagaCreditPreview(usersList, cookieJar, logs, statuses, htmlLengths) {
  const creditUsers = (usersList || [])
    .filter((user) => cleanString(user.id) && !/instrutor|inva|diretor|admin/i.test(cleanString(user.perfil)))
    .slice(0, 3);
  const rows = [];
  let headers = [];
  for (const user of creditUsers) {
    const sagaUserId = cleanString(user.id);
    logs.push(`GET /credits/create: buscando creditos do aluno SAGA ${sagaUserId}.`);
    const cookieSnapshot = sagaCloneCookieJar(cookieJar);
    const creditPage = await sagaFetch(
      `/credits/create?student_id=${encodeURIComponent(sagaUserId)}`,
      {
        method: "GET",
        headers: {
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          referer: `${SAGA_BASE_URL}/credits/create`,
        },
      },
      cookieJar,
    );
    if (isSagaLoginResponse(creditPage)) {
      sagaRestoreCookieJar(cookieJar, cookieSnapshot);
      logs.push(`GET /credits/create?student_id=${sagaUserId}: SAGA retornou tela de login; mantendo sessao autenticada anterior.`);
      continue;
    }
    statuses[`credits:${sagaUserId}`] = creditPage.response.status;
    htmlLengths[`credits:${sagaUserId}`] = creditPage.html.length;
    const parsed = translateSagaCreditRows(creditPage.html);
    if (!headers.length && parsed.headers.length) headers = parsed.headers;
    for (const [rowIndex, row] of parsed.rows.entries()) {
      rows.push({
        ...row,
        sagaRowIndex: rowIndex,
        sagaUserId,
        studentName: cleanString(user.nome),
        studentEmail: cleanString(user.email),
        studentAnac: cleanString(user.codigoAnac),
      });
    }
    logs.push(`GET /credits/create?student_id=${sagaUserId}: status ${creditPage.response.status}, ${parsed.rows.length} linhas de credito.`);
  }
  return { rows, headers, sampledUserIds: creditUsers.map((user) => cleanString(user.id)) };
}

function sagaDateRangeMonths(months) {
  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - Math.max(1, Number(months) || 24));
  const iso = (date) => date.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}

function sagaDateRangeDays(days) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - Math.max(1, Number(days) || 7));
  const iso = (date) => date.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}

function sagaScheduleMonthTargets(monthCount = 3) {
  const base = new Date();
  const targets = [];
  for (let offset = 0; offset < monthCount; offset += 1) {
    const date = new Date(base.getFullYear(), base.getMonth() + offset, 1);
    targets.push({ year: date.getFullYear(), month: date.getMonth() + 1 });
  }
  return targets;
}

function sagaLocalDateTimeParts(value) {
  const raw = cleanString(value);
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) return { date: `${match[1]}-${match[2]}-${match[3]}`, time: match[4] ? `${match[4]}:${match[5]}` : "" };
  match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (match) return { date: `${match[3]}-${match[2]}-${match[1]}`, time: match[4] ? `${match[4]}:${match[5]}` : "" };
  return { date: "", time: "" };
}

function sagaScheduleDateMs(schedule) {
  const iso = Date.parse(cleanString(
    schedule?.start_at ||
    schedule?.starts_at ||
    schedule?.startAt ||
    schedule?.start ||
    schedule?.date_time ||
    schedule?.datetime,
  ));
  if (Number.isFinite(iso)) return iso;
  const raw = cleanString(
    schedule?.start_at_raw ||
    schedule?.starts_at_raw ||
    schedule?.startAtRaw ||
    schedule?.date ||
    schedule?.scheduled_date,
  ).replace(" ", "T");
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sagaTodayIso() {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function sagaScheduleDateIso(schedule) {
  const start = sagaLocalDateTimeParts(cleanString(
    schedule?.start_at_raw ||
    schedule?.starts_at_raw ||
    schedule?.startAtRaw ||
    schedule?.start_at ||
    schedule?.starts_at ||
    schedule?.startAt ||
    schedule?.start ||
    schedule?.date_time ||
    schedule?.datetime ||
    schedule?.date ||
    schedule?.scheduled_date,
  ));
  if (start.date) return start.date;
  const ms = sagaScheduleDateMs(schedule);
  return ms > 0 ? new Date(ms).toISOString().slice(0, 10) : "";
}

function sagaScheduleIsTodayOrFuture(schedule) {
  const date = sagaScheduleDateIso(schedule);
  if (date) return date >= sagaTodayIso();
  return sagaScheduleDateMs(schedule) > Date.now();
}

function normalizeSagaScheduleStatus(value) {
  return cleanString(value).toUpperCase();
}

function sagaScheduleIsCancelledStatus(status) {
  const normalized = normalizeSagaScheduleStatus(status);
  return ["CANCELED", "CANCELLED", "CANCELADO", "CANCELADA"].includes(normalized);
}

function sagaScheduleNotes(schedule) {
  const values = [
    schedule?.notes,
    schedule?.observation,
    schedule?.observations,
    schedule?.observacao,
    schedule?.observacoes,
    schedule?.remarks,
    schedule?.reason,
    schedule?.cancel_reason,
    schedule?.cancellation_reason,
    schedule?.cancellation_notes,
  ];
  return values.map(cleanString).filter(Boolean).join(" | ");
}

function sagaScheduleUserLabel(value) {
  if (value && typeof value === "object") {
    return cleanString(
      value.name ||
      value.nickname ||
      value.full_name ||
      value.email ||
      value.username ||
      value.user_name ||
      value.label ||
      value.id,
    );
  }
  return cleanString(value);
}

function sagaScheduleLookupUserName(schedule, userId) {
  const targetId = cleanString(userId);
  if (!targetId) return "";
  const collections = [
    schedule?.users,
    schedule?.user_list,
    schedule?.participants,
    schedule?.attendees,
    schedule?.staff,
    schedule?.collaborators,
    schedule?.instructors,
    schedule?.students,
  ];
  for (const collection of collections) {
    if (!Array.isArray(collection)) continue;
    const match = collection.find((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const entryId = cleanString(entry.id || entry.user_id || entry.userId || entry.uuid);
      return entryId === targetId;
    });
    if (match) {
      const label = sagaScheduleUserLabel(match);
      const matchId = cleanString(match.id || match.user_id || match.userId || match.uuid);
      if (label && label !== matchId) return label;
    }
  }
  return "";
}

function sagaScheduleMarkedByName(schedule, student, instructor) {
  const explicitName = cleanString(
    schedule?.scheduled_by_name ||
    schedule?.scheduledByName ||
    schedule?.booked_by_name ||
    schedule?.bookedByName ||
    schedule?.created_by_name ||
    schedule?.createdByName ||
    schedule?.creator_name,
  );
  if (explicitName) return explicitName;

  const markerSource =
    schedule?.scheduled_by ||
    schedule?.scheduledBy ||
    schedule?.booked_by ||
    schedule?.bookedBy ||
    schedule?.created_by ||
    schedule?.createdBy ||
    schedule?.creator ||
    schedule?.user;
  const markerId = cleanString(
    (markerSource && typeof markerSource === "object"
      ? markerSource.id || markerSource.user_id || markerSource.userId || markerSource.uuid
      : markerSource) ||
    schedule?.scheduled_by_id ||
    schedule?.scheduledById ||
    schedule?.booked_by_id ||
    schedule?.bookedById ||
    schedule?.created_by_id ||
    schedule?.createdById,
  );
  const markerLabel = sagaScheduleUserLabel(markerSource);
  const lookedUpName = sagaScheduleLookupUserName(schedule, markerId || markerLabel);
  if (lookedUpName) return lookedUpName;

  const studentId = cleanString(schedule?.student_id || student?.id);
  if ((markerId || markerLabel) && (markerId || markerLabel) === studentId) {
    return cleanString(student?.name || student?.nickname || schedule?.student_name || schedule?.student) || markerLabel || markerId;
  }
  const instructorId = cleanString(schedule?.instructor_id || instructor?.id);
  if ((markerId || markerLabel) && (markerId || markerLabel) === instructorId) {
    return cleanString(instructor?.name || instructor?.nickname || schedule?.instructor_name || schedule?.instructor) || markerLabel || markerId;
  }

  if (markerLabel && markerId && markerLabel === markerId) return markerId;
  if (markerLabel && !/^\d+$/.test(markerLabel)) return markerLabel;
  return markerId || markerLabel;
}

function sagaScheduleLikelyId(value) {
  const raw = cleanString(value);
  if (!raw) return false;
  if (/^\d+$/.test(raw)) return true;
  if (/^saga_\d+$/i.test(raw)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)) return true;
  return false;
}

async function sagaResolveScheduledByNamesFromProfiles(schedules) {
  const rows = Array.isArray(schedules) ? schedules : [];
  if (!rows.length) return rows;
  const markerIds = Array.from(
    new Set(
      rows
        .map((item) => cleanString(item?.scheduledByName))
        .filter((value) => value && sagaScheduleLikelyId(value))
        .flatMap((value) => {
          const out = [value];
          const numeric = value.match(/^saga_(\d+)$/i)?.[1];
          if (numeric) out.push(numeric);
          return out;
        }),
    ),
  );
  if (!markerIds.length || !PROFILES_COLLECTION_ID) return rows;

  const profiles = await listDocumentsByFieldIn(
    PROFILES_COLLECTION_ID,
    "saga_user_id",
    markerIds,
    [...selectQuery(["user_id", "full_name", "email", "saga_user_id"])],
  ).catch(() => []);
  if (!profiles.length) return rows;

  const profileBySagaId = new Map();
  for (const profile of profiles) {
    const sagaId = cleanString(profile.saga_user_id);
    if (sagaId && !profileBySagaId.has(sagaId)) profileBySagaId.set(sagaId, profile);
    const numeric = sagaId.match(/^saga_(\d+)$/i)?.[1];
    if (numeric && !profileBySagaId.has(numeric)) profileBySagaId.set(numeric, profile);
  }

  const userIds = Array.from(new Set(profiles.map((profile) => cleanString(profile.user_id)).filter(Boolean)));
  const authUsers = await getUsersByIds(userIds).catch(() => []);
  const authUserById = new Map(authUsers.map((user) => [cleanString(user.$id), user]));

  return rows.map((item) => {
    const marker = cleanString(item?.scheduledByName);
    if (!marker || !sagaScheduleLikelyId(marker)) return item;
    const profile = profileBySagaId.get(marker);
    if (!profile) return item;
    const authUser = authUserById.get(cleanString(profile.user_id));
    const resolvedName = cleanString(profile.full_name || authUser?.name || authUser?.email || profile.email);
    if (!resolvedName) return item;
    return { ...item, scheduledByName: resolvedName };
  });
}

function translateSagaScheduleItem(item) {
  const schedule = item && typeof item === "object" ? item : {};
  const student = schedule.student && typeof schedule.student === "object" ? schedule.student : {};
  const instructor = schedule.instructor && typeof schedule.instructor === "object" ? schedule.instructor : {};
  const aircraft = schedule.aircraft && typeof schedule.aircraft === "object" ? schedule.aircraft : {};
  const dateRaw = cleanString(schedule.date || schedule.scheduled_date);
  const startTimeRaw = cleanString(schedule.start_time || schedule.start || schedule.begin_time);
  const endTimeRaw = cleanString(schedule.end_time || schedule.end || schedule.finish_time);
  const startAt = cleanString(schedule.start_at || schedule.starts_at || schedule.startAt || schedule.date_time || schedule.datetime);
  const endAt = cleanString(schedule.end_at || schedule.ends_at || schedule.endAt);
  const startAtRaw = cleanString(schedule.start_at_raw || schedule.starts_at_raw || schedule.startAtRaw || (dateRaw && startTimeRaw ? `${dateRaw} ${startTimeRaw}` : dateRaw));
  const endAtRaw = cleanString(schedule.end_at_raw || schedule.ends_at_raw || schedule.endAtRaw || (dateRaw && endTimeRaw ? `${dateRaw} ${endTimeRaw}` : ""));
  const createdAt = cleanString(schedule.created_at || schedule.createdAt || schedule.booked_at || schedule.booking_date || schedule.date_created || "");
  const scheduledByName = sagaScheduleMarkedByName(schedule, student, instructor);
  return {
    id: cleanString(schedule.id),
    startAt,
    endAt,
    startAtRaw,
    endAtRaw,
    createdAt,
    scheduledByName,
    studentSagaId: cleanString(schedule.student_id || student.id),
    instructorSagaId: cleanString(schedule.instructor_id || instructor.id),
    aircraftSagaId: cleanString(schedule.aircraft_id || aircraft.id),
    aircraft: cleanString(aircraft.registration || schedule.aircraft_registration || schedule.aircraft),
    aircraftModel: cleanString(aircraft.model || schedule.aircraft_model),
    studentName: cleanString(student.name || student.nickname || schedule.student_name || schedule.student),
    instructorName: cleanString(instructor.name || instructor.nickname || schedule.instructor_name || schedule.instructor),
    notes: sagaScheduleNotes(schedule),
    status: normalizeSagaScheduleStatus(schedule.status),
    active: schedule.active !== false && schedule.active !== 0,
    raw: schedule,
  };
}

async function fetchSagaScheduledFlights(cookieJar, logs = [], { skipFutureFilter = false, monthCount = 3 } = {}) {
  const monthResults = await sagaRunConcurrent(sagaScheduleMonthTargets(monthCount), monthCount, async (target) => {
    const rows = [];
    const localLogs = [];
    const path = `/schedules/management/get-by-month?year=${target.year}&month=${target.month}`;
    const result = await sagaFetch(
      path,
      {
        method: "GET",
        headers: {
          accept: "application/json,*/*",
          referer: `${SAGA_BASE_URL}/schedules/management`,
        },
      },
      new Map(cookieJar),
    );
    if (isSagaLoginResponse(result)) {
      localLogs.push(`GET ${path}: SAGA retornou login; escala nao importada neste mes.`);
      return { rows, logs: localLogs };
    }
    let parsed = null;
    try {
      parsed = JSON.parse(result.html);
    } catch {
      localLogs.push(`GET ${path}: resposta da escala nao estava em JSON valido.`);
      return { rows, logs: localLogs };
    }
    const schedules = Array.isArray(parsed?.schedules) ? parsed.schedules : [];
    const translated = schedules
      .map(translateSagaScheduleItem)
      .filter((schedule) => schedule.id && (schedule.active || sagaScheduleIsCancelledStatus(schedule.status)) && (skipFutureFilter || sagaScheduleIsTodayOrFuture(schedule.raw)));
    rows.push(...translated);
    localLogs.push(`GET ${path}: status ${result.response.status}, ${translated.length}/${schedules.length} agendamentos carregados.`);
    return { rows, logs: localLogs };
  });
  const rows = monthResults.flatMap((item) => item?.rows || []);
  logs.push(...monthResults.flatMap((item) => item?.logs || []));
  rows.sort((a, b) => sagaScheduleDateMs(a.raw) - sagaScheduleDateMs(b.raw));
  return rows;
}

async function sagaFetchUsers(payload) {
  const email = String(payload.email || "").trim();
  const password = String(payload.password || "");
  if (!email || !password) throw Object.assign(new Error("Email e senha do SAGA sao obrigatorios."), { status: 400 });

  const logs = [];
  const statuses = {};
  const locations = {};
  const htmlLengths = {};
  const cookieJar = new Map();

  logs.push("GET /login: iniciando pre-login para obter token CSRF e cookies.");
  const preLogin = await sagaFetch(
    "/login",
    {
      method: "GET",
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    },
    cookieJar,
  );
  statuses.preLogin = preLogin.response.status;
  locations.preLogin = preLogin.response.headers.get("location") || null;
  htmlLengths.preLogin = preLogin.html.length;
  logs.push(`GET /login: status ${statuses.preLogin}, html ${htmlLengths.preLogin} chars, cookies ${cookieJar.size}.`);

  const token = extractSagaCsrfToken(preLogin.html);
  if (!token) throw Object.assign(new Error("Token CSRF do SAGA nao encontrado no pre-login."), { status: 502 });
  logs.push(`GET /login: token CSRF encontrado (${token.length} chars).`);

  const form = new URLSearchParams();
  form.set("_token", token);
  form.set("email", email);
  form.set("password", password);

  logs.push("POST /login: enviando credenciais ao SAGA.");
  const login = await sagaFetch(
    "/login",
    {
      method: "POST",
      body: form.toString(),
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "content-type": "application/x-www-form-urlencoded",
        origin: SAGA_BASE_URL,
        referer: `${SAGA_BASE_URL}/login`,
      },
    },
    cookieJar,
  );
  statuses.login = login.response.status;
  locations.login = login.response.headers.get("location") || null;
  htmlLengths.login = login.html.length;
  logs.push(`POST /login: status ${statuses.login}, redirect ${locations.login || "sem redirect"}, cookies ${cookieJar.size}.`);

  const redirectedToDashboard = statuses.login === 302 && String(locations.login || "").includes("/dashboard");
  const loginReturnedDashboard = statuses.login === 200 && /dashboard|logout|\/users/i.test(login.html) && !/name=["']_token["']/i.test(login.html);
  if (!redirectedToDashboard && !loginReturnedDashboard) {
    logs.push("POST /login: nao foi possivel confirmar autenticacao.");
    throw Object.assign(new Error("Login SAGA nao confirmado. Verifique email/senha e os logs retornados."), {
      status: 401,
      sagaResult: {
        ok: false,
        usersHtml: "",
        loginHtmlSnippet: sagaHtmlSnippet(login.html),
        usersHtmlSnippet: "",
        statuses,
        locations,
        htmlLengths,
        logs,
      },
    });
  }

  await saveSagaAuthSession(cookieJar, email).catch((err) => {
    logs.push(`Sessao SAGA autenticada, mas nao foi possivel salvar a sessao: ${err?.message || err}.`);
  });

  logs.push("GET /users/ajax: buscando usuarios em JSON.");
  const users = await sagaFetch(
    `/users/ajax?_=${Date.now()}`,
    {
      method: "GET",
      headers: {
        accept: "application/json, text/javascript, */*; q=0.01",
        referer: `${SAGA_BASE_URL}/users`,
        "x-requested-with": "XMLHttpRequest",
      },
    },
    cookieJar,
  );
  statuses.users = users.response.status;
  locations.users = users.response.headers.get("location") || null;
  htmlLengths.users = users.html.length;
  logs.push(`GET /users/ajax: status ${statuses.users}, json ${htmlLengths.users} chars, redirect ${locations.users || "sem redirect"}.`);

  if (statuses.users >= 300 && statuses.users < 400) {
    throw Object.assign(new Error("SAGA redirecionou a chamada ajax de usuarios. Sessao nao autenticada ou expirada."), {
      status: 401,
      sagaResult: {
        ok: false,
        users: [],
        usersJson: null,
        loginHtmlSnippet: sagaHtmlSnippet(login.html || preLogin.html),
        usersHtmlSnippet: sagaHtmlSnippet(users.html),
        statuses,
        locations,
        htmlLengths,
        logs,
      },
    });
  }

  let usersJson;
  try {
    usersJson = JSON.parse(users.html);
  } catch {
    throw Object.assign(new Error("Resposta de usuarios do SAGA nao estava em JSON valido."), {
      status: 502,
      sagaResult: {
        ok: false,
        users: [],
        usersJson: null,
        loginHtmlSnippet: sagaHtmlSnippet(login.html || preLogin.html),
        usersHtmlSnippet: sagaHtmlSnippet(users.html),
        statuses,
        locations,
        htmlLengths,
        logs,
      },
    });
  }

  const translatedUsers = Array.isArray(usersJson?.data) ? usersJson.data.map(translateSagaUserRow) : [];
  logs.push(`GET /users/ajax: ${translatedUsers.length} usuarios traduzidos de ${usersJson?.recordsTotal ?? "?"} registros totais.`);

  const requestedOperationsDays = Math.round(Number(payload.operationsDays) || 0);
  const operationsRange = requestedOperationsDays > 0
    ? sagaDateRangeDays(Math.max(1, Math.min(365, requestedOperationsDays)))
    : sagaDateRangeMonths(24);
  const operationsPath = `/reports/operations?start_date=${operationsRange.startDate}&end_date=${operationsRange.endDate}`;
  logs.push(`GET /reports/operations: buscando voos em HTML (${operationsRange.startDate} a ${operationsRange.endDate}).`);
  const operations = await sagaFetch(
    operationsPath,
    {
      method: "GET",
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        referer: `${SAGA_BASE_URL}/users`,
      },
    },
    cookieJar,
  );
  statuses.operations = operations.response.status;
  locations.operations = operations.response.headers.get("location") || null;
  htmlLengths.operations = operations.html.length;
  const flights = translateSagaFlightRows(operations.html);
  logs.push(`GET /reports/operations: status ${statuses.operations}, html ${htmlLengths.operations} chars, ${flights.rows.length} voos extraidos.`);

  logs.push("GET /finance/cashier: buscando lancamentos financeiros em HTML.");
  const cashier = await sagaFetch(
    "/finance/cashier",
    {
      method: "GET",
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        referer: `${SAGA_BASE_URL}/reports/operations`,
      },
    },
    cookieJar,
  );
  statuses.cashier = cashier.response.status;
  locations.cashier = cashier.response.headers.get("location") || null;
  htmlLengths.cashier = cashier.html.length;
  const financialEntries = translateSagaFinanceRows(cashier.html);
  logs.push(`GET /finance/cashier: status ${statuses.cashier}, html ${htmlLengths.cashier} chars, ${financialEntries.rows.length} lancamentos extraidos.`);
  if (!isSagaLoginResponse(operations) && !isSagaLoginResponse(cashier)) {
    await saveSagaAuthSession(cookieJar, email).catch((err) => {
      logs.push(`Sessao SAGA autenticada, mas nao foi possivel salvar os cookies autenticados: ${err?.message || err}.`);
    });
  }

  let creditPreview = { rows: [], headers: [], sampledUserIds: [] };
  if (payload.skipCreditPreview === true) {
    logs.push("GET /credits/create: preview ignorado neste fluxo automatico.");
  } else {
    logs.push("GET /credits/create: buscando amostra de creditos dos alunos para preview.");
    creditPreview = await fetchSagaCreditPreview(translatedUsers, cookieJar, logs, statuses, htmlLengths);
    logs.push(`GET /credits/create: ${creditPreview.rows.length} linhas de creditos extraidas de ${creditPreview.sampledUserIds.length} alunos.`);
  }
  const scheduleLogs = [];
  const scheduledFlights = payload.skipSchedulePreview === true
    ? []
    : await fetchSagaScheduledFlights(cookieJar, scheduleLogs).catch((err) => {
        logs.push(`GET /schedules/management: nao foi possivel carregar escala para IDs de aeronave: ${err?.message || err}.`);
        return [];
      });
  if (payload.skipSchedulePreview === true) {
    scheduleLogs.push("GET /schedules/management: preview ignorado neste fluxo automatico.");
  }
  logs.push(...scheduleLogs);

  const [storedMapping, catalogs] = await Promise.all([loadSagaImportMapping(), listSagaImportCatalogs()]);
  const mapping = payload.sendFlightsToSaga === undefined
    ? storedMapping
    : await saveSagaImportMapping({ ...storedMapping, sendFlightsToSaga: payload.sendFlightsToSaga === true });
  await saveSagaImportCredentials({ email, password }).catch((err) => {
    logs.push(`Credenciais SAGA autenticadas, mas nao foi possivel salvar email/senha: ${err?.message || err}.`);
  });
  const mappedFlightRows = applySagaFlightColumnMap(flights.rows, mapping.flightColumnMap);
  const mappedCreditRows = applySagaCreditColumnMap(creditPreview.rows, mapping.creditColumnMap);
  const proposedMapping = proposeSagaImportMapping(mappedFlightRows, mapping, catalogs, mappedCreditRows, scheduledFlights);

  return {
    ok: true,
    users: translatedUsers,
    flights: mappedFlightRows,
    flightHeaders: flights.headers,
    flightColumnDefs: SAGA_FLIGHT_COLUMN_DEFS,
    financialEntries: financialEntries.rows,
    financialHeaders: financialEntries.headers,
    credits: mappedCreditRows,
    creditHeaders: creditPreview.headers,
    creditColumnDefs: SAGA_CREDIT_COLUMN_DEFS,
    creditPreviewSampledUserIds: creditPreview.sampledUserIds,
    usersJson: {
      draw: usersJson?.draw ?? null,
      recordsTotal: usersJson?.recordsTotal ?? translatedUsers.length,
      recordsFiltered: usersJson?.recordsFiltered ?? translatedUsers.length,
    },
    usersHtml: "",
    loginHtmlSnippet: sagaHtmlSnippet(login.html || preLogin.html),
    usersHtmlSnippet: "",
    mapping,
    proposedMapping,
    catalogs,
    statuses,
    locations,
    htmlLengths,
    logs,
  };
}

const SAGA_IMPORT_MAPPING_KEY = "sagaImportMapping";
const SAGA_IMPORT_LAST_SUMMARY_KEY = "sagaImportLastSummary";
const SAGA_IMPORT_CREDENTIALS_KEY = "sagaImportCredentials";
const SAGA_IMPORT_PROGRESS_KEY = "sagaImportProgress";
const SAGA_IMPORT_PAUSED_STATE_KEY = "sagaImportPausedState";
const SAGA_IMPORT_ALL_USERS_LAST_RUN_KEY = "sagaImportAllUsersLastRun";
const SAGA_IMPORT_SYNC_HISTORY_KEY = "sagaImportSyncHistory";
const PLANE_IT_CREDENTIALS_KEY = "planeItCredentials";

function defaultSagaImportMapping() {
  return {
    aircraftBySaga: {},
    aircraftIdByRegistration: {},
    courseBySaga: {},
    missionBySaga: {},
    creditAircraftBySaga: {},
    flightColumnMap: { ...SAGA_DEFAULT_FLIGHT_COLUMN_MAP },
    creditColumnMap: { ...SAGA_DEFAULT_CREDIT_COLUMN_MAP },
    sendFlightsToSaga: false,
    syncScheduleFromSaga: false,
    syncAllUsersFromSaga: false,
    updatedAt: null,
  };
}

function normalizeSagaCreditColumnMap(value) {
  const out = { ...SAGA_DEFAULT_CREDIT_COLUMN_MAP };
  if (!value || typeof value !== "object") return out;
  for (const def of SAGA_CREDIT_COLUMN_DEFS) {
    const raw = Number(value[def.key]);
    if (Number.isInteger(raw) && raw >= 0 && raw < 50) out[def.key] = raw;
  }
  const legacyOffset = SAGA_CREDIT_COLUMN_DEFS.every((def) => out[def.key] === def.defaultIndex + 1);
  if (legacyOffset) {
    for (const def of SAGA_CREDIT_COLUMN_DEFS) out[def.key] = def.defaultIndex;
  }
  return out;
}

function sanitizeSagaImportMapping(input = {}) {
  const normalizeMap = (value) => {
    const out = {};
    if (!value || typeof value !== "object") return out;
    for (const [key, mapped] of Object.entries(value)) {
      const cleanKey = cleanString(key);
      const cleanMapped = cleanString(mapped);
      if (cleanKey && cleanMapped) out[cleanKey] = cleanMapped;
    }
    return out;
  };
  const normalizeAircraftIdMap = (value) => {
    const out = {};
    if (!value || typeof value !== "object") return out;
    for (const [key, mapped] of Object.entries(value)) {
      const cleanKey = normalizeAircraftIdent(key);
      const cleanMapped = cleanString(mapped);
      if (cleanKey && cleanMapped) out[cleanKey] = cleanMapped;
    }
    return out;
  };
  const normalizeColumnMap = (value) => {
    const out = { ...SAGA_DEFAULT_FLIGHT_COLUMN_MAP };
    if (!value || typeof value !== "object") return out;
    for (const def of SAGA_FLIGHT_COLUMN_DEFS) {
      const raw = Number(value[def.key]);
      if (Number.isInteger(raw) && raw >= 0 && raw < 200) out[def.key] = raw;
    }
    return out;
  };
  return {
    aircraftBySaga: normalizeMap(input.aircraftBySaga),
    aircraftIdByRegistration: normalizeAircraftIdMap(input.aircraftIdByRegistration),
    courseBySaga: normalizeMap(input.courseBySaga),
    missionBySaga: normalizeMap(input.missionBySaga),
    creditAircraftBySaga: normalizeMap(input.creditAircraftBySaga),
    flightColumnMap: normalizeColumnMap(input.flightColumnMap),
    creditColumnMap: normalizeSagaCreditColumnMap(input.creditColumnMap),
    sendFlightsToSaga: input.sendFlightsToSaga === true,
    syncScheduleFromSaga: input.syncScheduleFromSaga === true,
    syncAllUsersFromSaga: input.syncAllUsersFromSaga === true,
    updatedAt: input.updatedAt || null,
  };
}

async function loadSagaImportMapping() {
  const defaults = defaultSagaImportMapping();
  if (!PLATFORM_SETTINGS_COLLECTION_ID) return defaults;
  const doc = await getSettingDoc(SAGA_IMPORT_MAPPING_KEY);
  if (!doc) return defaults;
  return sanitizeSagaImportMapping(parseJsonObject(doc.settings_json, defaults));
}

const PLATFORM_SETTINGS_JSON_LIMIT = 15000;

function truncateSagaImportLogLine(line) {
  return cleanString(line).slice(0, 240);
}

function capSagaImportMappingForStorage(mapping = {}) {
  const capMap = (value, max = 500) => {
    const out = {};
    const entries = Object.entries(value && typeof value === "object" ? value : {});
    for (const [key, mapped] of entries.slice(-max)) {
      const cleanKey = cleanString(key);
      const cleanMapped = cleanString(mapped);
      if (cleanKey && cleanMapped) out[cleanKey] = cleanMapped;
    }
    return out;
  };
  return {
    ...mapping,
    aircraftBySaga: capMap(mapping.aircraftBySaga),
    aircraftIdByRegistration: capMap(mapping.aircraftIdByRegistration),
    courseBySaga: capMap(mapping.courseBySaga),
    missionBySaga: capMap(mapping.missionBySaga),
    creditAircraftBySaga: capMap(mapping.creditAircraftBySaga),
  };
}

function compactSagaImportSummary(summary) {
  if (!summary || typeof summary !== "object") return summary;
  const staleCleanup = summary.staleCleanup && typeof summary.staleCleanup === "object"
    ? summary.staleCleanup
    : null;
  return {
    importRunId: cleanString(summary.importRunId),
    testMode: summary.testMode !== false,
    useEmailAlias: summary.useEmailAlias === true,
    selectedSagaUsers: Number(summary.selectedSagaUsers) || 0,
    requestedUsers: Number(summary.requestedUsers) || 0,
    requestedFlightGroups: Number(summary.requestedFlightGroups) || 0,
    requestedScheduledFlights: Number(summary.requestedScheduledFlights) || 0,
    usersCreated: Number(summary.usersCreated) || 0,
    usersUpdated: Number(summary.usersUpdated) || 0,
    usersSkipped: Number(summary.usersSkipped) || 0,
    flightsCreated: Number(summary.flightsCreated) || 0,
    flightsUpdated: Number(summary.flightsUpdated) || 0,
    flightsDeleted: Number(summary.flightsDeleted) || 0,
    flightsSkipped: Number(summary.flightsSkipped) || 0,
    duplicateFlights: Number(summary.duplicateFlights) || 0,
    scheduledFlightsCreated: Number(summary.scheduledFlightsCreated) || 0,
    scheduledFlightsUpdated: Number(summary.scheduledFlightsUpdated) || 0,
    scheduledFlightsSkipped: Number(summary.scheduledFlightsSkipped) || 0,
    trainingAssignmentsTouched: Number(summary.trainingAssignmentsTouched) || 0,
    anacSynced: Number(summary.anacSynced) || 0,
    anacPending: Number(summary.anacPending) || 0,
    anacFailed: Number(summary.anacFailed) || 0,
    creditsCreated: Number(summary.creditsCreated) || 0,
    creditsUpdated: Number(summary.creditsUpdated) || 0,
    creditsSkipped: Number(summary.creditsSkipped) || 0,
    financialCreditsCreated: Number(summary.financialCreditsCreated) || 0,
    financialCreditsUpdated: Number(summary.financialCreditsUpdated) || 0,
    financialCreditsSkipped: Number(summary.financialCreditsSkipped) || 0,
    creditHoursImported: Number(summary.creditHoursImported) || 0,
    nightHoursReclassified: Number(summary.nightHoursReclassified) || 0,
    nightCreditRecordsCreated: Number(summary.nightCreditRecordsCreated) || 0,
    scope: summary.scope && typeof summary.scope === "object" ? summary.scope : undefined,
    missing: summary.missing && typeof summary.missing === "object" ? summary.missing : undefined,
    logs: Array.isArray(summary.logs)
      ? summary.logs.slice(-40).map(truncateSagaImportLogLine).filter(Boolean)
      : [],
    staleCleanup: staleCleanup
      ? {
        totalSchoolDocs: Number(staleCleanup.totalSchoolDocs) || 0,
        actorLinkedDocs: Number(staleCleanup.actorLinkedDocs) || 0,
        candidates: Number(staleCleanup.candidates) || 0,
        deleted: Number(staleCleanup.deleted) || 0,
        failed: Number(staleCleanup.failed) || 0,
        skippedOutOfRange: Number(staleCleanup.skippedOutOfRange) || 0,
        skippedNoSagaKey: Number(staleCleanup.skippedNoSagaKey) || 0,
        skippedPresentInSaga: Number(staleCleanup.skippedPresentInSaga) || 0,
        failures: Array.isArray(staleCleanup.failures) ? staleCleanup.failures.slice(0, 50) : [],
      }
      : undefined,
    deletedFlights: Array.isArray(summary.deletedFlights) ? summary.deletedFlights.slice(0, 50) : [],
    skippedFlights: Array.isArray(summary.skippedFlights) ? summary.skippedFlights.slice(0, 50) : [],
    skippedCredits: Array.isArray(summary.skippedCredits) ? summary.skippedCredits.slice(0, 50) : [],
  };
}

function minimalSagaImportPauseSummary(summary) {
  const compact = compactSagaImportSummary(summary);
  return {
    importRunId: compact.importRunId,
    usersCreated: compact.usersCreated,
    usersUpdated: compact.usersUpdated,
    flightsCreated: compact.flightsCreated,
    flightsUpdated: compact.flightsUpdated,
    flightsSkipped: compact.flightsSkipped,
    scheduledFlightsCreated: compact.scheduledFlightsCreated,
    scheduledFlightsUpdated: compact.scheduledFlightsUpdated,
    creditsCreated: compact.creditsCreated,
    creditsUpdated: compact.creditsUpdated,
    logs: Array.isArray(compact.logs) ? compact.logs.slice(-10) : [],
  };
}

function stringifyPlatformSettingsBody(body, maxLen = PLATFORM_SETTINGS_JSON_LIMIT) {
  let json = JSON.stringify(body);
  if (json.length <= maxLen) return json;
  if (body?.summary && typeof body.summary === "object") {
    json = JSON.stringify({
      ...body,
      summary: compactSagaImportSummary({
        ...body.summary,
        logs: Array.isArray(body.summary.logs) ? body.summary.logs.slice(-20).map(truncateSagaImportLogLine) : [],
        skippedFlights: [],
        skippedCredits: [],
      }),
    });
  }
  if (json.length <= maxLen) return json;
  if (body?.progress && typeof body.progress === "object") {
    json = JSON.stringify({
      ...body,
      progress: compactSagaImportProgress({
        ...body.progress,
        logs: Array.isArray(body.progress.logs) ? body.progress.logs.slice(-5).map(truncateSagaImportLogLine) : [],
      }),
    });
  }
  if (json.length <= maxLen) return json;
  if (body?.state && typeof body.state === "object") {
    json = JSON.stringify({ state: compactSagaImportPausedState(body.state), savedAt: body.savedAt || nowIso() });
  }
  if (json.length <= maxLen) return json;
  if (body?.aircraftBySaga || body?.missionBySaga || body?.courseBySaga) {
    json = JSON.stringify(capSagaImportMappingForStorage(body));
  }
  if (json.length <= maxLen) return json;
  return JSON.stringify({
    truncated: true,
    savedAt: body.savedAt || nowIso(),
    message: cleanString(body.progress?.message || body.summary?.importRunId || body.state?.importRunId || "payload_truncated"),
  });
}

async function upsertPlatformSettingDoc(key, body) {
  if (!PLATFORM_SETTINGS_COLLECTION_ID || !key) return null;
  try {
    const data = { key, settings_json: stringifyPlatformSettingsBody({ ...body, savedAt: body.savedAt || nowIso() }) };
    const current = await getSettingDoc(key);
    if (current) {
      await databases.updateDocument(DATABASE_ID, PLATFORM_SETTINGS_COLLECTION_ID, current.$id, data);
    } else {
      await databases.createDocument(DATABASE_ID, PLATFORM_SETTINGS_COLLECTION_ID, sdk.ID.unique(), data, ADMIN_DOC_PERMS);
    }
    return data;
  } catch (err) {
    return null;
  }
}

function compactSagaImportPausedState(state = {}) {
  const payload = state.payload && typeof state.payload === "object" ? state.payload : {};
  const checkpoint = state.checkpoint && typeof state.checkpoint === "object" ? state.checkpoint : {};
  const summary = checkpoint.summary && typeof checkpoint.summary === "object" ? checkpoint.summary : {};
  return {
    importRunId: cleanString(state.importRunId),
    payload: {
      scope: payload.scope && typeof payload.scope === "object" ? payload.scope : {},
      testMode: payload.testMode !== false,
      useEmailAlias: payload.useEmailAlias === true,
      importRunId: cleanString(payload.importRunId || state.importRunId),
      selectedSagaUserIds: (Array.isArray(payload.selectedSagaUserIds) ? payload.selectedSagaUserIds : [])
        .map(cleanString)
        .filter(Boolean)
        .slice(0, 50),
    },
    checkpoint: {
      flightIndex: Math.max(0, Number(checkpoint.flightIndex) || 0),
      userPhaseDone: checkpoint.userPhaseDone === true,
      counters: {
        usersCreated: Number(summary.usersCreated) || 0,
        usersUpdated: Number(summary.usersUpdated) || 0,
        usersSkipped: Number(summary.usersSkipped) || 0,
        flightsCreated: Number(summary.flightsCreated) || 0,
        flightsUpdated: Number(summary.flightsUpdated) || 0,
        flightsSkipped: Number(summary.flightsSkipped) || 0,
        duplicateFlights: Number(summary.duplicateFlights) || 0,
        scheduledFlightsCreated: Number(summary.scheduledFlightsCreated) || 0,
        scheduledFlightsUpdated: Number(summary.scheduledFlightsUpdated) || 0,
        scheduledFlightsSkipped: Number(summary.scheduledFlightsSkipped) || 0,
      },
    },
  };
}

async function saveSagaImportLastSummary(summary) {
  if (!PLATFORM_SETTINGS_COLLECTION_ID || !summary) return;
  const compact = compactSagaImportSummary(summary);
  await upsertPlatformSettingDoc(SAGA_IMPORT_LAST_SUMMARY_KEY, { summary: compact, savedAt: nowIso() }).catch(() => null);
}

function compactSagaImportProgress(progress = {}) {
  const pending = progress.pendingMission && typeof progress.pendingMission === "object"
    ? {
        lookupKey: cleanString(progress.pendingMission.lookupKey),
        rawMission: cleanString(progress.pendingMission.rawMission),
        missionCode: cleanString(progress.pendingMission.missionCode),
        trainingTrackId: cleanString(progress.pendingMission.trainingTrackId),
        trackName: cleanString(progress.pendingMission.trackName),
        sagaFlightId: cleanString(progress.pendingMission.sagaFlightId),
        studentName: cleanString(progress.pendingMission.studentName),
        flightDate: cleanString(progress.pendingMission.flightDate),
        course: cleanString(progress.pendingMission.course),
      }
    : null;
  return {
    runId: cleanString(progress.runId),
    status: cleanString(progress.status) || "running",
    stage: cleanString(progress.stage) || "Preparando import",
    message: cleanString(progress.message),
    current: Math.max(0, Math.round(Number(progress.current) || 0)),
    total: Math.max(0, Math.round(Number(progress.total) || 0)),
    updatedAt: progress.updatedAt || nowIso(),
    logs: Array.isArray(progress.logs) ? progress.logs.slice(-8).map(cleanString).filter(Boolean) : [],
    pendingMission: pending?.lookupKey ? pending : null,
  };
}

async function saveSagaImportPausedState(state = {}) {
  const importRunId = cleanString(state.importRunId);
  if (!importRunId) return null;
  const compact = compactSagaImportPausedState(state);
  await upsertPlatformSettingDoc(SAGA_IMPORT_PAUSED_STATE_KEY, { state: compact, savedAt: nowIso() }).catch(() => null);
  return compact;
}

async function loadSagaImportPausedState(importRunId = "") {
  if (!PLATFORM_SETTINGS_COLLECTION_ID) return null;
  const doc = await getSettingDoc(SAGA_IMPORT_PAUSED_STATE_KEY);
  if (!doc) return null;
  const parsed = parseJsonObject(doc.settings_json, {});
  const state = parsed.state || null;
  if (!state) return null;
  if (importRunId && cleanString(state.importRunId) !== cleanString(importRunId)) return null;
  return state;
}

async function clearSagaImportPausedState() {
  if (!PLATFORM_SETTINGS_COLLECTION_ID) return;
  const current = await getSettingDoc(SAGA_IMPORT_PAUSED_STATE_KEY);
  if (!current) return;
  await databases.deleteDocument(DATABASE_ID, PLATFORM_SETTINGS_COLLECTION_ID, current.$id).catch(() => null);
}

async function saveSagaImportProgress(input = {}) {
  const progress = compactSagaImportProgress({ ...input, updatedAt: nowIso() });
  if (!progress.runId) return null;
  await upsertPlatformSettingDoc(SAGA_IMPORT_PROGRESS_KEY, { progress, savedAt: nowIso() }).catch(() => null);
  return progress;
}

async function loadSagaAllUsersLastRunState() {
  if (!PLATFORM_SETTINGS_COLLECTION_ID) return null;
  const doc = await getSettingDoc(SAGA_IMPORT_ALL_USERS_LAST_RUN_KEY);
  if (!doc) return null;
  const parsed = parseJsonObject(doc.settings_json, {});
  const lastRunAt = cleanString(parsed.lastRunAt || "");
  const status = cleanString(parsed.status || "");
  const message = cleanString(parsed.message || "");
  if (!lastRunAt) return null;
  return { lastRunAt, status, message };
}

async function saveSagaAllUsersLastRunState(input = {}) {
  if (!PLATFORM_SETTINGS_COLLECTION_ID) return null;
  const payload = {
    lastRunAt: cleanString(input.lastRunAt) || nowIso(),
    status: cleanString(input.status) || "completed",
    message: cleanString(input.message || ""),
  };
  await upsertPlatformSettingDoc(SAGA_IMPORT_ALL_USERS_LAST_RUN_KEY, payload).catch(() => null);
  return payload;
}

async function loadSagaSyncHistory() {
  if (!PLATFORM_SETTINGS_COLLECTION_ID) return [];
  const doc = await getSettingDoc(SAGA_IMPORT_SYNC_HISTORY_KEY);
  if (!doc) return [];
  const parsed = parseJsonObject(doc.settings_json, {});
  return Array.isArray(parsed.history) ? parsed.history.slice(0, 20) : [];
}

async function saveSagaSyncHistoryEntry(input = {}) {
  if (!PLATFORM_SETTINGS_COLLECTION_ID) return null;
  const current = await loadSagaSyncHistory();
  const entry = {
    runId: cleanString(input.runId),
    origin: cleanString(input.origin) || "manual",
    status: cleanString(input.status) || "completed",
    startedAt: cleanString(input.startedAt),
    completedAt: cleanString(input.completedAt) || nowIso(),
    windowDays: Math.max(1, Number(input.windowDays) || 7),
    usersCreated: Number(input.usersCreated) || 0,
    usersSkipped: Number(input.usersSkipped) || 0,
    flightsCreated: Number(input.flightsCreated) || 0,
    flightsDeleted: Number(input.flightsDeleted) || 0,
    flightsSkipped: Number(input.flightsSkipped) || 0,
    creditsCreated: Number(input.creditsCreated) || 0,
    creditsSkipped: Number(input.creditsSkipped) || 0,
    message: cleanString(input.message).slice(0, 500),
  };
  const history = [entry, ...current.filter((item) => cleanString(item?.runId) !== entry.runId)].slice(0, 12);
  await upsertPlatformSettingDoc(SAGA_IMPORT_SYNC_HISTORY_KEY, { history, savedAt: nowIso() }).catch(() => null);
  return entry;
}

async function saveSagaImportMapping(input) {
  if (!PLATFORM_SETTINGS_COLLECTION_ID) {
    throw Object.assign(new Error("Colecao de configuracoes da plataforma nao configurada."), { status: 500 });
  }
  const settings = capSagaImportMappingForStorage(sanitizeSagaImportMapping({ ...input, updatedAt: nowIso() }));
  const saved = await upsertPlatformSettingDoc(SAGA_IMPORT_MAPPING_KEY, settings);
  if (!saved) {
    throw Object.assign(new Error("Nao foi possivel salvar o de-para SAGA (limite de configuracao)."), { status: 500 });
  }
  return { ...settings, updatedAt: settings.updatedAt || nowIso() };
}

function sanitizeSagaImportCredentials(input = {}) {
  return {
    email: cleanString(input.email).toLowerCase(),
    password: String(input.password || ""),
    updatedAt: input.updatedAt || null,
  };
}

async function loadSagaImportCredentials() {
  if (!PLATFORM_SETTINGS_COLLECTION_ID) return sanitizeSagaImportCredentials();
  const doc = await getSettingDoc(SAGA_IMPORT_CREDENTIALS_KEY);
  if (!doc) return sanitizeSagaImportCredentials();
  return sanitizeSagaImportCredentials(parseJsonObject(doc.settings_json, {}));
}

async function saveSagaImportCredentials(input = {}) {
  if (!PLATFORM_SETTINGS_COLLECTION_ID) return sanitizeSagaImportCredentials(input);
  const settings = sanitizeSagaImportCredentials({ ...input, updatedAt: nowIso() });
  if (!settings.email || !settings.password) return settings;
  const data = { key: SAGA_IMPORT_CREDENTIALS_KEY, settings_json: JSON.stringify(settings) };
  const current = await getSettingDoc(SAGA_IMPORT_CREDENTIALS_KEY);
  const doc = current
    ? await databases.updateDocument(DATABASE_ID, PLATFORM_SETTINGS_COLLECTION_ID, current.$id, data)
    : await databases.createDocument(DATABASE_ID, PLATFORM_SETTINGS_COLLECTION_ID, sdk.ID.unique(), data, ADMIN_DOC_PERMS);
  return { ...settings, updatedAt: doc.$updatedAt || settings.updatedAt };
}

async function loadSagaImportSettings() {
  const [mapping, catalogs, credentials] = await Promise.all([
    loadSagaImportMapping(),
    listSagaImportCatalogs(),
    loadSagaImportCredentials(),
  ]);
  return { mapping, catalogs, credentials };
}

function sanitizePlaneItCredentials(input = {}) {
  return {
    email: cleanString(input.email).toLowerCase(),
    password: String(input.password || ""),
    updatedAt: input.updatedAt || null,
  };
}

async function loadPlaneItCredentials() {
  if (!PLATFORM_SETTINGS_COLLECTION_ID) return sanitizePlaneItCredentials();
  const doc = await getSettingDoc(PLANE_IT_CREDENTIALS_KEY);
  if (!doc) return sanitizePlaneItCredentials();
  return sanitizePlaneItCredentials(parseJsonObject(doc.settings_json, {}));
}

async function savePlaneItCredentials(input = {}) {
  if (!PLATFORM_SETTINGS_COLLECTION_ID) {
    throw Object.assign(new Error("Colecao de configuracoes da plataforma nao configurada."), { status: 500 });
  }
  const settings = sanitizePlaneItCredentials({ ...input, updatedAt: nowIso() });
  if (!settings.email || !settings.password) {
    throw Object.assign(new Error("Informe login e senha do Plane It."), { status: 400 });
  }
  const data = { key: PLANE_IT_CREDENTIALS_KEY, settings_json: JSON.stringify(settings) };
  const current = await getSettingDoc(PLANE_IT_CREDENTIALS_KEY);
  const doc = current
    ? await databases.updateDocument(DATABASE_ID, PLATFORM_SETTINGS_COLLECTION_ID, current.$id, data)
    : await databases.createDocument(DATABASE_ID, PLATFORM_SETTINGS_COLLECTION_ID, sdk.ID.unique(), data, ADMIN_DOC_PERMS);
  planeItSessionCache = null;
  return { ...settings, updatedAt: doc.$updatedAt || settings.updatedAt };
}

function planeItSessionCacheMatches(credentials) {
  return (
    planeItSessionCache &&
    planeItSessionCache.email === cleanString(credentials.email).toLowerCase() &&
    cleanString(planeItSessionCache.accessToken) &&
    planeItSessionCache.cookieJar instanceof Map &&
    Date.now() - Number(planeItSessionCache.createdAt || 0) < PLANE_IT_SESSION_TTL_MS
  );
}

async function planeItFetch(path, options = {}, cookieJar = new Map()) {
  const headers = {
    accept: "application/json, text/plain, */*",
    "user-agent": "Mozilla/5.0",
    ...(options.headers || {}),
  };
  const cookie = sagaCookieHeader(cookieJar);
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${PLANE_IT_BASE_URL}${path}`, {
    ...options,
    headers,
    redirect: "manual",
  });
  sagaMergeCookies(cookieJar, response.headers);
  const text = await response.text();
  return { response, text };
}

function parsePlaneItJson(text) {
  try {
    return JSON.parse(text || "{}");
  } catch {
    return {};
  }
}

async function planeItLoginSession(credentials) {
  if (planeItSessionCacheMatches(credentials)) {
    return {
      accessToken: planeItSessionCache.accessToken,
      cookieJar: new Map(planeItSessionCache.cookieJar),
    };
  }

  const email = cleanString(credentials.email).toLowerCase();
  const password = String(credentials.password || "");
  if (!email || !password) {
    throw Object.assign(new Error("Credenciais Plane It nao configuradas pelo administrador."), { status: 400 });
  }

  const cookieJar = new Map();
  await planeItFetch("/login", {
    method: "GET",
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  }, cookieJar);

  const basicAuth = Buffer.from(`${email}:${password}`, "utf8").toString("base64");
  const login = await planeItFetch("/api/v1/login", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      origin: PLANE_IT_BASE_URL,
      referer: `${PLANE_IT_BASE_URL}/login`,
      "content-type": "application/json",
    },
  }, cookieJar);
  const status = Number(login.response.status || 0);
  const body = parsePlaneItJson(login.text);
  const accessToken = cleanString(body?.data?.access_token || body?.access_token);
  if (status >= 400 || Number(body?.codigo) !== 200 || !accessToken) {
    throw Object.assign(new Error(cleanString(body?.mensagem) || "Falha ao autenticar no Plane It."), { status: status || 502 });
  }

  await planeItFetch(`/auth/redirect?token=${encodeURIComponent(accessToken)}`, {
    method: "GET",
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      referer: `${PLANE_IT_BASE_URL}/login`,
    },
  }, cookieJar);

  planeItSessionCache = {
    email,
    accessToken,
    cookieJar: new Map(cookieJar),
    createdAt: Date.now(),
  };
  return { accessToken, cookieJar };
}

async function fetchPlaneItAircraftTotals(input = {}) {
  const rawIds = Array.isArray(input.planeItIds) ? input.planeItIds : [];
  const planeItIds = Array.from(new Set(rawIds.map(cleanString).filter(Boolean))).slice(0, 100);
  if (!planeItIds.length) return { totals: {}, updatedAt: nowIso() };
  const credentials = await loadPlaneItCredentials();
  const session = await planeItLoginSession(credentials);
  const params = new URLSearchParams();
  for (const id of planeItIds) params.append("idAeronave[]", id);

  let result = await planeItFetch(`/api/spa/v1/aeronaves/totais?${params.toString()}`, {
    method: "GET",
    headers: {
      referer: `${PLANE_IT_BASE_URL}/`,
      "x-requested-with": "XMLHttpRequest",
    },
  }, session.cookieJar);

  if (Number(result.response.status) === 401 || Number(result.response.status) === 419 || Number(result.response.status) === 403) {
    planeItSessionCache = null;
    const fresh = await planeItLoginSession(credentials);
    result = await planeItFetch(`/api/spa/v1/aeronaves/totais?${params.toString()}`, {
      method: "GET",
      headers: {
        referer: `${PLANE_IT_BASE_URL}/`,
        "x-requested-with": "XMLHttpRequest",
      },
    }, fresh.cookieJar);
  }

  const status = Number(result.response.status || 0);
  const body = parsePlaneItJson(result.text);
  if (status >= 400 || Number(body?.codigo) >= 400) {
    throw Object.assign(new Error(cleanString(body?.mensagem) || "Falha ao consultar aeronaves no Plane It."), { status: status || 502 });
  }

  const data = body?.data && typeof body.data === "object" ? body.data : {};
  const totals = {};
  for (const id of planeItIds) {
    const row = data[id] && typeof data[id] === "object" ? data[id] : null;
    const hours = Number(row?.horasVooEtapaDecimalTotal);
    totals[id] = {
      planeItId: id,
      horasVooEtapaDecimalTotal: Number.isFinite(hours) ? hours : null,
    };
  }
  return { totals, updatedAt: nowIso() };
}

async function requireSagaMappingActor(actorUserId) {
  if (!actorUserId) throw Object.assign(new Error("Autenticacao necessaria."), { status: 401 });
  const role = await getActorRole(actorUserId);
  if (!["admin", "instrutor", "aluno"].includes(role)) {
    throw Object.assign(new Error("Sem permissao para configurar de-para SAGA."), { status: 403 });
  }
  return role;
}

async function loadSagaImportSettingsForActor(actorUserId) {
  const settings = await loadSagaImportSettings();
  const role = await requireSagaMappingActor(actorUserId);
  if (role === "admin") return settings;
  return {
    mapping: settings.mapping,
    catalogs: settings.catalogs,
    credentials: {
      email: cleanString(settings.credentials?.email),
      password: "",
      updatedAt: settings.credentials?.updatedAt || null,
    },
  };
}

async function saveSagaImportMappingForActor(actorUserId, input = {}) {
  const role = await requireSagaMappingActor(actorUserId);
  if (role === "admin") {
    return saveSagaImportMapping(input);
  }
  const existing = await loadSagaImportMapping();
  const incoming = sanitizeSagaImportMapping(input);
  return saveSagaImportMapping({
    ...existing,
    missionBySaga: {
      ...(existing.missionBySaga || {}),
      ...(incoming.missionBySaga || {}),
    },
  });
}

async function listSagaImportCatalogs() {
  const [aircraftDocs, modelDocs, trackDocs] = await Promise.all([
    safeListAllDocuments(AIRCRAFTS_COLLECTION_ID, [
      sdk.Query.equal("school_id", [SCHOOL_ID]),
      ...selectQuery(["$id", "registration", "nickname", "active", "model_id"]),
    ]),
    safeListAllDocuments(AIRCRAFT_MODELS_COLLECTION_ID, [
      ...selectQuery(["$id", "name", "manufacturer"]),
    ]),
    safeListAllDocuments(TRAINING_TRACKS_COLLECTION_ID, [
      sdk.Query.equal("school_id", [SCHOOL_ID]),
      ...selectQuery(["$id", "name", "is_active", "stages_json"]),
    ]),
  ]);
  const modelsById = new Map(modelDocs.map((doc) => [doc.$id, doc]));
  return {
    aircrafts: aircraftDocs.map((doc) => ({
      id: doc.$id,
      registration: cleanString(doc.registration),
      nickname: cleanString(doc.nickname),
      active: doc.active !== false,
      modelId: cleanString(doc.model_id),
      modelName: cleanString(modelsById.get(doc.model_id)?.name),
    })),
    aircraftModels: modelDocs.map((doc) => ({
      id: doc.$id,
      name: cleanString(doc.name),
      manufacturer: cleanString(doc.manufacturer),
    })),
    trainingTracks: trackDocs.map((doc) => ({
      id: doc.$id,
      name: cleanString(doc.name),
      active: doc.is_active !== false,
      stages: parseJsonList(doc.stages_json),
    })),
  };
}

function extractSagaAircraftRegistration(value) {
  const raw = cleanString(value).toUpperCase();
  const match = raw.match(/\b[A-Z]{2}-[A-Z0-9]{3}\b/);
  return match?.[0] || "";
}

function uniqueCleanValues(values) {
  return Array.from(new Set((values || []).map(cleanString).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function resolveSagaCreditModelMappingId(creditAircraftBySaga, sagaModel) {
  const map = creditAircraftBySaga && typeof creditAircraftBySaga === "object" ? creditAircraftBySaga : {};
  const direct = cleanString(map[cleanString(sagaModel)]);
  if (direct) return direct;
  const normalizedSagaModel = normalizeSearch(sagaModel);
  if (!normalizedSagaModel) return "";
  for (const [mappedSagaModel, mappedModelId] of Object.entries(map)) {
    if (normalizeSearch(mappedSagaModel) === normalizedSagaModel) {
      const cleanMappedModelId = cleanString(mappedModelId);
      if (cleanMappedModelId) return cleanMappedModelId;
    }
  }
  return "";
}

function hasSagaCreditModelMapping(creditAircraftBySaga, sagaModel) {
  return Boolean(resolveSagaCreditModelMappingId(creditAircraftBySaga, sagaModel));
}

function proposeSagaImportMapping(flights, savedMapping, catalogs, credits = [], scheduledFlights = []) {
  const mapping = sanitizeSagaImportMapping(savedMapping);
  const aircrafts = catalogs?.aircrafts || [];
  const tracks = catalogs?.trainingTracks || [];
  const models = catalogs?.aircraftModels || [];
  const aircraftByRegistration = new Map(aircrafts.map((item) => [normalizeAircraftIdent(item.registration), item]));
  const aircraftByNickname = new Map(aircrafts.map((item) => [normalizeSearch(item.nickname), item]).filter(([key]) => key));
  const modelsByName = new Map(models.map((item) => [normalizeSearch(item.name), item]).filter(([key]) => key));
  const tracksByName = new Map(tracks.map((item) => [normalizeSearch(item.name), item]));
  const aircraftBySaga = { ...mapping.aircraftBySaga };
  const aircraftIdByRegistration = { ...mapping.aircraftIdByRegistration };
  const courseBySaga = { ...mapping.courseBySaga };
  const creditAircraftBySaga = { ...mapping.creditAircraftBySaga };

  for (const sagaAircraft of uniqueCleanValues((flights || []).map((flight) => flight.aeronave))) {
    if (aircraftBySaga[sagaAircraft]) continue;
    const registration = extractSagaAircraftRegistration(sagaAircraft);
    const match = registration ? aircraftByRegistration.get(normalizeAircraftIdent(registration)) : null;
    if (match?.registration) aircraftBySaga[sagaAircraft] = match.registration;
  }

  for (const schedule of scheduledFlights || []) {
    const sagaAircraft = cleanString(schedule.aircraft);
    const sagaAircraftId = cleanString(schedule.aircraftSagaId);
    if (!sagaAircraft || !sagaAircraftId) continue;
    const mappedRegistration = cleanString(aircraftBySaga[sagaAircraft]);
    const registration =
      mappedRegistration ||
      cleanString(aircraftByRegistration.get(normalizeAircraftIdent(sagaAircraft))?.registration) ||
      extractSagaAircraftRegistration(sagaAircraft);
    const normalizedRegistration = normalizeAircraftIdent(registration);
    if (normalizedRegistration && !aircraftIdByRegistration[normalizedRegistration]) {
      aircraftIdByRegistration[normalizedRegistration] = sagaAircraftId;
    }
  }

  for (const sagaCourse of uniqueCleanValues((flights || []).map((flight) => flight.curso))) {
    if (courseBySaga[sagaCourse]) continue;
    const normalized = normalizeSearch(sagaCourse);
    const exact = tracksByName.get(normalized);
    const loose =
      exact ||
      tracks.find((track) => {
        const name = normalizeSearch(track.name);
        return name && normalized && (name.includes(normalized) || normalized.includes(name));
      });
    if (loose?.id) courseBySaga[sagaCourse] = loose.id;
  }

  for (const sagaCreditModel of uniqueCleanValues((credits || []).map((credit) => credit.model))) {
    if (hasSagaCreditModelMapping(creditAircraftBySaga, sagaCreditModel)) continue;
    const normalized = normalizeSearch(sagaCreditModel);
    const aircraftMatch = aircraftByNickname.get(normalized) || aircrafts.find((aircraft) => {
      const nickname = normalizeSearch(aircraft.nickname);
      const registration = normalizeSearch(aircraft.registration);
      return (nickname && (nickname.includes(normalized) || normalized.includes(nickname))) ||
        (registration && (registration.includes(normalized) || normalized.includes(registration)));
    });
    const modelMatch = modelsByName.get(normalized) || models.find((model) => {
      const name = normalizeSearch(model.name);
      return name && normalized && (name.includes(normalized) || normalized.includes(name));
    });
    if (aircraftMatch?.modelId) creditAircraftBySaga[sagaCreditModel] = aircraftMatch.modelId;
    else if (modelMatch?.id) creditAircraftBySaga[sagaCreditModel] = modelMatch.id;
  }

  return {
    aircraftBySaga,
    aircraftIdByRegistration,
    courseBySaga,
    creditAircraftBySaga,
    flightColumnMap: mapping.flightColumnMap,
    creditColumnMap: mapping.creditColumnMap,
    sendFlightsToSaga: mapping.sendFlightsToSaga === true,
    syncScheduleFromSaga: mapping.syncScheduleFromSaga === true,
    missingAircrafts: uniqueCleanValues((flights || []).map((flight) => flight.aeronave)).filter((value) => !aircraftBySaga[value]),
    missingCourses: uniqueCleanValues((flights || []).map((flight) => flight.curso)).filter((value) => !courseBySaga[value]),
    missingCreditAircrafts: uniqueCleanValues((credits || []).map((credit) => credit.model)).filter((value) => !hasSagaCreditModelMapping(creditAircraftBySaga, value)),
  };
}

function sagaDocId(prefix, rawId) {
  const clean = cleanString(rawId).replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^[^a-zA-Z0-9]+/, "");
  return `${prefix}_${clean || crypto.randomBytes(6).toString("hex")}`.slice(0, 36);
}

function sagaUserRole(user, instructorCanacs) {
  const canac = cleanString(user.codigoAnac);
  const profile = normalizeSearch(user.perfil);
  if (canac && instructorCanacs.has(canac)) return "instrutor";
  if (/instrutor|inva|diretor|admin/.test(profile)) return "instrutor";
  return "aluno";
}

function sagaEmailLooksValid(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanString(value));
}

function dateBrToIso(value) {
  const match = cleanString(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return "";
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function sagaHoursValue(value) {
  const raw = cleanString(value);
  const paren = raw.match(/\((\d{1,4}):(\d{2})h?\)/i);
  if (paren) return Number((Number(paren[1]) + Number(paren[2]) / 60).toFixed(2));
  const hhmm = raw.match(/(\d{1,4}):(\d{2})h?/i);
  if (hhmm) return Number((Number(hhmm[1]) + Number(hhmm[2]) / 60).toFixed(2));
  const hours = raw.match(/([\d.,]+)\s*h/i);
  if (hours) {
    const parsed = Number(String(hours[1]).replace(",", "."));
    return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
  }
  const parsed = Number(raw.replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : 0;
}

function sagaMoneyValue(value) {
  const raw = cleanString(value);
  if (!raw) return 0;
  const normalized = raw.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : 0;
}

async function sagaLoginSession(email, password, logs = []) {
  const cleanEmail = cleanString(email);
  const cleanPassword = String(password || "");
  if (!cleanEmail || !cleanPassword) throw Object.assign(new Error("Email e senha do SAGA sao obrigatorios."), { status: 400 });
  const cookieJar = new Map();
  const preLogin = await sagaFetch(
    "/login",
    { method: "GET", headers: { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" } },
    cookieJar,
  );
  const token = extractSagaCsrfToken(preLogin.html);
  if (!token) throw Object.assign(new Error("Token CSRF do SAGA nao encontrado no pre-login."), { status: 502 });
  const form = new URLSearchParams();
  form.set("_token", token);
  form.set("email", cleanEmail);
  form.set("password", cleanPassword);
  const login = await sagaFetch(
    "/login",
    {
      method: "POST",
      body: form.toString(),
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "content-type": "application/x-www-form-urlencoded",
        origin: SAGA_BASE_URL,
        referer: `${SAGA_BASE_URL}/login`,
      },
    },
    cookieJar,
  );
  const location = login.response.headers.get("location") || "";
  const hasSagaSession = Boolean(cleanString(cookieJar.get("saga_session")));
  const ok = (login.response.status === 302 && location.includes("/dashboard")) ||
    (login.response.status === 200 && /dashboard|logout|\/users/i.test(login.html) && !/name=["']_token["']/i.test(login.html)) ||
    (login.response.status === 302 && location.includes("/login") && hasSagaSession);
  logs.push(`SAGA login para importacao: status ${login.response.status}, redirect ${location || "sem redirect"}.`);
  if (!ok) {
    logs.push(`SAGA login debug: saga_session_cookie=${hasSagaSession ? "yes" : "no"}, html_has_token=${/name=["']_token["']/i.test(login.html) ? "yes" : "no"}, html_size=${String(login.html || "").length}.`);
    throw Object.assign(new Error("Login SAGA nao confirmado durante importacao."), { status: 401 });
  }
  await saveSagaAuthSession(cookieJar, cleanEmail).catch((err) => {
    logs.push(`Sessao SAGA autenticada, mas nao foi possivel salvar a sessao: ${err?.message || err}.`);
  });
  return cookieJar;
}

async function sagaApiV2Login(email, password, logs = []) {
  const cleanEmail = cleanString(email);
  const cleanPassword = String(password || "");
  if (!cleanEmail || !cleanPassword) return "";
  const response = await fetch(`${SAGA_BASE_URL}/api/v2/login`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0",
    },
    body: JSON.stringify({
      user: cleanEmail,
      password: cleanPassword,
    }),
  }).catch(() => null);
  if (!response) {
    logs.push("API v2 login: falha de rede.");
    return "";
  }
  if (response.status === 429) {
    logs.push("API v2 login: throttled (HTTP 429).");
    return "";
  }
  if (!response.ok) {
    logs.push(`API v2 login: HTTP ${response.status}.`);
    return "";
  }
  try {
    const parsed = await response.json();
    return cleanString(parsed?.token);
  } catch {
    logs.push("API v2 login: resposta nao era JSON valido.");
    return "";
  }
}

async function fetchSagaCreditsForUsers(usersList, cookieJar, logs = []) {
  const rows = [];
  const fetchedSagaUserIds = [];
  for (const user of usersList || []) {
    const sagaUserId = cleanString(user.id);
    if (!sagaUserId) continue;
    const cookieSnapshot = sagaCloneCookieJar(cookieJar);
    const creditPage = await sagaFetch(
      `/credits/create?student_id=${encodeURIComponent(sagaUserId)}`,
      {
        method: "GET",
        headers: {
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          referer: `${SAGA_BASE_URL}/credits/create`,
        },
      },
      cookieJar,
    );
    if (isSagaLoginResponse(creditPage)) {
      sagaRestoreCookieJar(cookieJar, cookieSnapshot);
      logs.push(`Creditos SAGA ${sagaUserId}: SAGA retornou tela de login; mantendo sessao autenticada anterior.`);
      continue;
    }
    fetchedSagaUserIds.push(sagaUserId);
    const parsed = translateSagaCreditRows(creditPage.html);
    for (const [rowIndex, row] of parsed.rows.entries()) {
      rows.push({
        ...row,
        sagaRowIndex: rowIndex,
        sagaUserId,
        studentName: cleanString(user.nome),
        studentEmail: cleanString(user.email),
        studentAnac: cleanString(user.codigoAnac),
      });
    }
    logs.push(`Creditos SAGA ${sagaUserId}: status ${creditPage.response.status}, ${parsed.rows.length} linhas.`);
  }
  return { rows, fetchedSagaUserIds };
}

async function fetchSagaUsersTableFromSession(cookieJar, logs = []) {
  const users = await sagaFetch(
    `/users/ajax?_=${Date.now()}`,
    {
      method: "GET",
      headers: {
        accept: "application/json, text/javascript, */*; q=0.01",
        referer: `${SAGA_BASE_URL}/users`,
        "x-requested-with": "XMLHttpRequest",
      },
    },
    cookieJar,
  );
  if (isSagaLoginResponse(users)) {
    logs.push("GET /users/ajax: sessao expirada ao montar cache de usuarios para sync de escala.");
    return new Map();
  }
  try {
    const usersJson = JSON.parse(users.html);
    const rows = Array.isArray(usersJson?.data) ? usersJson.data.map(translateSagaUserRow) : [];
    return new Map(rows.map((row) => [cleanString(row.id), row]).filter(([id]) => id));
  } catch {
    logs.push("GET /users/ajax: resposta invalida ao montar cache de usuarios para sync de escala.");
    return new Map();
  }
}

async function ensureSagaScheduleUserImported(sagaUserId, role, options = {}) {
  const safeSagaUserId = cleanString(sagaUserId);
  if (!safeSagaUserId) return { skipped: true, reason: "missing_saga_user_id" };
  const usersBySagaId = options.usersBySagaId instanceof Map ? options.usersBySagaId : new Map();
  if (usersBySagaId.get(safeSagaUserId)) return { skipped: true, reason: "already_mapped" };
  const sagaUsersById = options.sagaUsersById instanceof Map ? options.sagaUsersById : new Map();
  const sagaUser = sagaUsersById.get(safeSagaUserId);
  if (!sagaUser) return { skipped: true, reason: "saga_user_not_found" };
  const detail = options.cookieJar
    ? await fetchSagaUserDetail(options.cookieJar, safeSagaUserId, { apiV2Token: options.apiV2Token }).catch(() => null)
    : null;
  const result = await importSagaUser(detail ? { ...sagaUser, detail } : sagaUser, role === "instrutor" ? "instrutor" : "aluno", {
    testMode: false,
    useEmailAlias: false,
  });
  if (result.userId) usersBySagaId.set(safeSagaUserId, result.userId);
  return result;
}

async function findAuthUserByEmail(email) {
  const cleanEmail = cleanString(email);
  if (!cleanEmail) return null;
  try {
    const res = await users.list({
      queries: [sdk.Query.equal("email", [cleanEmail]), sdk.Query.limit(1)],
      total: true,
    });
    return res.users?.[0] || null;
  } catch {
    return null;
  }
}

async function reauthenticateAdminByEmail(email, password) {
  const cleanEmail = cleanString(email).toLowerCase();
  const cleanPassword = String(password || "");
  if (!cleanEmail || !cleanPassword) {
    throw Object.assign(new Error("E-mail do admin e senha sao obrigatorios."), { status: 400 });
  }

  const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.APPWRITE_ENDPOINT || "";
  const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.APPWRITE_PROJECT_ID || "";
  if (!endpoint || !projectId) {
    throw Object.assign(new Error("Appwrite endpoint/project nao configurados para reautenticacao."), { status: 500 });
  }

  const authClient = new sdk.Client().setEndpoint(endpoint).setProject(projectId);
  const account = new sdk.Account(authClient);
  let session = null;
  try {
    session = await account.createEmailPasswordSession(cleanEmail, cleanPassword);
    if (!session?.userId) throw new Error("Sessao de admin nao retornou usuario.");
    const actor = await requireAdmin(session.userId);
    if (cleanString(actor.email).toLowerCase() !== cleanEmail) {
      throw Object.assign(new Error("A reautenticacao nao corresponde ao e-mail do admin informado."), { status: 403 });
    }
    return actor;
  } catch (err) {
    if (err?.status || err?.code === 403) throw err;
    throw Object.assign(new Error("Login root invalido. Verifique o e-mail/senha do admin."), { status: 401 });
  } finally {
    if (session?.$id) {
      await account.deleteSession(session.$id).catch(() => undefined);
    }
  }
}

async function createStudentImpersonationToken(payload = {}, req = null) {
  const adminEmail = cleanString(payload.adminEmail).toLowerCase();
  const studentEmail = cleanString(payload.studentEmail).toLowerCase();
  const password = String(payload.password || "");
  if (!adminEmail || !studentEmail || !password) {
    throw Object.assign(new Error("Informe adminEmail, studentEmail e password."), { status: 400 });
  }
  if (adminEmail === studentEmail) {
    throw Object.assign(new Error("O e-mail do admin e do aluno devem ser diferentes."), { status: 400 });
  }

  const [adminUser, targetUser] = await Promise.all([
    reauthenticateAdminByEmail(adminEmail, password),
    findAuthUserByEmail(studentEmail),
  ]);
  if (!targetUser) {
    throw Object.assign(new Error("Usuario nao encontrado para o e-mail informado."), { status: 404 });
  }

  const targetRole = await getActorRole(targetUser.$id);
  if (!["aluno", "instrutor"].includes(targetRole)) {
    throw Object.assign(new Error("Login root permitido apenas para acessar contas de alunos ou instrutores."), {
      status: 403,
    });
  }

  const token = await users.createToken({ userId: targetUser.$id, length: 64, expire: 60 });
  const auditEvent = await createAuditEvent(adminUser.$id, {
    eventType: "admin_impersonation_login",
    entityType: "user",
    entityId: targetUser.$id,
    reason: `Login root para ${targetRole} ${targetUser.email || studentEmail}`,
    afterSnapshot: {
      targetUserId: targetUser.$id,
      targetEmail: targetUser.email || studentEmail,
      targetRole,
    },
    ip: req?.headers?.["x-forwarded-for"] || req?.headers?.["x-real-ip"] || "",
    userAgent: req?.headers?.["user-agent"] || "",
  }).catch(() => null);

  return {
    userId: targetUser.$id,
    secret: token.secret,
    adminUserId: adminUser.$id,
    targetEmail: targetUser.email || studentEmail,
    auditEventId: auditEvent?.$id || null,
  };
}

async function updateSagaProfileFields(userId, sagaUser, role, { enableAccess = false } = {}) {
  const profileId = await upsertProfile(userId, sagaUser.email || "", role);
  const detail = sagaUser && typeof sagaUser.detail === "object" ? sagaUser.detail : {};
  const emergency = detail.emergency_contact && typeof detail.emergency_contact === "object" ? detail.emergency_contact : {};
  const rg = detail.rg && typeof detail.rg === "object" ? detail.rg : {};
  const medical = detail.medical_certificate && typeof detail.medical_certificate === "object" ? detail.medical_certificate : {};
  const ratings = Array.isArray(detail.licenses) ? detail.licenses : [];
  const types = Array.isArray(detail.types) ? detail.types : [];
  const anacRatingsPayload = ratings.length || types.length
    ? { source: "saga_api_v2", ratings, types }
    : (sagaUser.habilitacao ? { source: "saga", ratings: sagaUser.habilitacao } : null);
  const anacMedicalPayload = Object.keys(medical).length
    ? { source: "saga_api_v2", ...medical }
    : (sagaUser.cma ? { source: "saga", cma: sagaUser.cma } : null);
  const phone = cleanString(detail.phone || sagaUser.phone).slice(0, 32) || null;
  const city = cleanString(detail.address_city).slice(0, 255) || null;
  const ufRaw = cleanString(detail.address_state);
  const ufNormalizedMap = {
    "acre": "AC",
    "alagoas": "AL",
    "amapa": "AP",
    "amazonas": "AM",
    "bahia": "BA",
    "ceara": "CE",
    "distrito federal": "DF",
    "espirito santo": "ES",
    "goias": "GO",
    "maranhao": "MA",
    "mato grosso": "MT",
    "mato grosso do sul": "MS",
    "minas gerais": "MG",
    "para": "PA",
    "paraiba": "PB",
    "parana": "PR",
    "pernambuco": "PE",
    "piaui": "PI",
    "rio de janeiro": "RJ",
    "rio grande do norte": "RN",
    "rio grande do sul": "RS",
    "rondonia": "RO",
    "roraima": "RR",
    "santa catarina": "SC",
    "sao paulo": "SP",
    "sergipe": "SE",
    "tocantins": "TO",
  };
  const ufKey = ufRaw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const uf = (ufRaw.length === 2 ? ufRaw : ufNormalizedMap[ufKey] || "").toUpperCase().slice(0, 2) || null;
  const street = cleanString(detail.address_street).slice(0, 255) || null;
  const zip = cleanString(detail.address_zipcode).slice(0, 16) || null;
  const genderRaw = cleanString(detail.gender || detail.sexo).toUpperCase();
  const sexo = genderRaw === "M" ? "Masculino" : genderRaw === "F" ? "Feminino" : null;
  const sagaNickname = cleanString(detail.nickname || sagaUser.nickname).slice(0, 128) || null;
  const fields = {
    ...(enableAccess ? { is_active: true, approval_status: "approved" } : {}),
    full_name: cleanString(sagaUser.nome).slice(0, 255) || null,
    nickname: sagaNickname,
    cpf: cleanString(sagaUser.cpf).slice(0, 14) || null,
    birth_date: cleanString(detail.birthdate).slice(0, 10) || dateBrToIso(sagaUser.nascimento) || null,
    anac_code: cleanString(sagaUser.codigoAnac).slice(0, 32) || null,
    phone,
    rg: cleanString(rg.number || detail.rg_number).slice(0, 32) || null,
    rg_orgao_expedidor: cleanString(rg.issuing_body || detail.rg_issuing_body).slice(0, 64) || null,
    rg_data_emissao: cleanString(rg.issuing_date || detail.rg_issuing_date).slice(0, 10) || null,
    endereco: street,
    cep: zip,
    cidade: city,
    uf,
    nacionalidade: cleanString(detail.nationality).slice(0, 128) || null,
    estado_civil: cleanString(detail.civil_state).slice(0, 64) || null,
    sexo,
    naturalidade: cleanString(detail.birthplace).slice(0, 255) || null,
    filiacao_pai: cleanString(detail.father_name).slice(0, 255) || null,
    filiacao_mae: cleanString(detail.mother_name).slice(0, 255) || null,
    escolaridade: cleanString(detail.study?.level || detail.study_level).slice(0, 255) || null,
    escolaridade_periodo: cleanString(detail.study?.time || detail.study_time).slice(0, 255) || null,
    escolaridade_curso: cleanString(detail.study?.course || detail.study_course).slice(0, 255) || null,
    alergias_medicamentos: cleanString(emergency.allergy).slice(0, 512) || null,
    emergencia_nome: cleanString(emergency.name).slice(0, 255) || null,
    emergencia_parentesco: cleanString(emergency.relation).slice(0, 255) || null,
    emergencia_endereco: cleanString(emergency.address).slice(0, 255) || null,
    emergencia_telefone: cleanString(emergency.phone).slice(0, 32) || null,
    anac_medical_json: anacMedicalPayload ? JSON.stringify(anacMedicalPayload) : null,
    anac_ratings_json: anacRatingsPayload ? JSON.stringify(anacRatingsPayload) : null,
  };
  try {
    await databases.updateDocument(DATABASE_ID, PROFILES_COLLECTION_ID, profileId, {
      ...fields,
      saga_user_id: cleanString(sagaUser.id).slice(0, 64) || null,
    });
  } catch (err) {
    const message = String(err?.message || "");
    if (!/attribute|unknown|invalid document structure/i.test(message)) throw err;
    await databases.updateDocument(DATABASE_ID, PROFILES_COLLECTION_ID, profileId, fields);
  }
  return profileId;
}

function sagaTestEmailAlias(email) {
  const localPart = cleanString(email).toLowerCase().split("@", 1)[0].replace(/[^a-z0-9._+-]/g, "");
  return `gabrielpirexs+${localPart || "saga"}@gmail.com`;
}

async function importSagaUser(sagaUser, role, { testMode = false, useEmailAlias = false, createOnly = false } = {}) {
  const sagaId = cleanString(sagaUser.id);
  const email = useEmailAlias ? sagaTestEmailAlias(sagaUser.email) : cleanString(sagaUser.email).toLowerCase();
  if (!sagaId || !sagaEmailLooksValid(email)) {
    return { skipped: true, reason: "missing_email_or_id", userId: null };
  }

  const cpfPassword = cleanString(sagaUser.cpf).replace(/\D/g, "");
  const shouldUseCpfPassword = cpfPassword.length === 11;
  const deterministicId = sagaDocId(testMode ? "saga_test" : useEmailAlias ? "saga_alias" : "saga", sagaId);
  let authUser = null;
  try {
    authUser = await users.get({ userId: deterministicId });
  } catch {
    authUser = await findAuthUserByEmail(email);
  }

  let created = false;
  if (authUser && createOnly) {
    return { skipped: true, reason: "already_exists", created: false, updated: false, userId: authUser.$id };
  }
  if (!authUser) {
    authUser = await users.create({
      userId: deterministicId,
      email,
      password: shouldUseCpfPassword ? cpfPassword : crypto.randomBytes(18).toString("base64url"),
      name: cleanString(sagaUser.nome).slice(0, 128) || email,
    });
    authUser = await users.updateStatus({ userId: authUser.$id, status: true });
    created = true;
  } else if (cleanString(sagaUser.nome) && authUser.name !== cleanString(sagaUser.nome).slice(0, 128)) {
    try {
      authUser = await users.updateName({ userId: authUser.$id, name: cleanString(sagaUser.nome).slice(0, 128) });
    } catch {
      // Name updates are best effort during imports.
    }
  }
  if (!created && shouldUseCpfPassword) {
    try {
      await users.updatePassword({ userId: authUser.$id, password: cpfPassword });
    } catch {
      // Password updates are best effort during imports.
    }
  }

  const labels = Array.from(
    new Set([...(authUser.labels || []).filter((label) => !VALID_ROLES.has(String(label).toLowerCase())), role]),
  );
  await users.updateLabels({ userId: authUser.$id, labels });
  await updateSagaProfileFields(authUser.$id, { ...sagaUser, email }, role, { enableAccess: created });
  return { created, updated: !created, userId: authUser.$id };
}

function sagaRoundMoney(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

function isUnknownCreatedByAttributeError(err) {
  const message = String(err?.message || err || "");
  return /Unknown attribute:\s*"created_by"|Unknown attribute:\s*"updated_by"/i.test(message);
}

function paymentCalculatedAtFromFlight(flightDoc, fallbackIso = "") {
  const flightDate = cleanString(flightDoc?.flight_date).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(flightDate)) return cleanString(fallbackIso) || nowIso();
  const startRaw = cleanString(flightDoc?.start_time).slice(0, 5);
  const time = /^\d{2}:\d{2}$/.test(startRaw) ? startRaw : "12:00";
  const parsed = new Date(`${flightDate}T${time}:00-03:00`);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return `${flightDate}T${time}:00.000Z`;
}

async function getAircraftModelIdByIdent(aircraftIdent) {
  const normalized = normalizeAircraftIdent(aircraftIdent);
  if (!normalized || !AIRCRAFTS_COLLECTION_ID) return "";
  const page = await databases.listDocuments(DATABASE_ID, AIRCRAFTS_COLLECTION_ID, [
    sdk.Query.equal("school_id", [SCHOOL_ID]),
    sdk.Query.equal("registration", [normalized]),
    ...selectQuery(["$id", "model_id"]),
    sdk.Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  return cleanString(page.documents?.[0]?.model_id);
}

async function getInstructorCostsForUser(instructorUserId) {
  const safeUserId = cleanString(instructorUserId);
  if (!safeUserId || !INSTRUCTOR_COSTS_COLLECTION_ID) return null;
  const page = await databases.listDocuments(DATABASE_ID, INSTRUCTOR_COSTS_COLLECTION_ID, [
    sdk.Query.equal("instructor_user_id", [safeUserId]),
    sdk.Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  const doc = page.documents?.[0];
  if (!doc) return null;
  return {
    monthlyFixedCost: Number(doc.monthly_fixed_cost ?? 0) || 0,
    modelCosts: parseJsonList(doc.model_costs_json).map((item) => ({
      modelId: cleanString(item.modelId),
      hourlyDayRate: Number(item.hourlyDayRate ?? 0) || 0,
      hourlyNightRate: Number(item.hourlyNightRate ?? 0) || 0,
      fixedDayRate: Number(item.fixedDayRate ?? 0) || 0,
      fixedNightRate: Number(item.fixedNightRate ?? 0) || 0,
    })),
  };
}

async function resolveStudentHourlyRateServer(studentUserId, modelId, isNight) {
  if (!STUDENT_CREDITS_COLLECTION_ID || !studentUserId) {
    return { hourlyRate: 0, source: "none", creditId: null };
  }
  const todayIso = nowIso().slice(0, 10);
  const withModel = async () => databases.listDocuments(DATABASE_ID, STUDENT_CREDITS_COLLECTION_ID, [
    sdk.Query.equal("school_id", [SCHOOL_ID]),
    sdk.Query.equal("user_id", [studentUserId]),
    sdk.Query.equal("aircraft_model_id", [modelId]),
    sdk.Query.equal("is_night", [Boolean(isNight)]),
    sdk.Query.greaterThanEqual("expires_at", todayIso),
    sdk.Query.orderAsc("expires_at"),
    sdk.Query.limit(20),
  ]);
  if (modelId) {
    const page = await withModel().catch(() => ({ documents: [] }));
    for (const doc of page.documents || []) {
      const hours = Number(doc.hours ?? 0);
      const amountPaid = Number(doc.amount_paid ?? 0);
      if (hours > 0) return { hourlyRate: amountPaid / hours, source: "model_credit", creditId: doc.$id };
    }
  }
  const studentLast = await databases.listDocuments(DATABASE_ID, STUDENT_CREDITS_COLLECTION_ID, [
    sdk.Query.equal("school_id", [SCHOOL_ID]),
    sdk.Query.equal("user_id", [studentUserId]),
    sdk.Query.orderDesc("purchase_date"),
    sdk.Query.limit(1),
  ]).catch(() => ({ documents: [] }));
  const anyDoc = studentLast.documents?.[0];
  if (anyDoc) {
    const hours = Number(anyDoc.hours ?? 0);
    const amountPaid = Number(anyDoc.amount_paid ?? 0);
    return { hourlyRate: hours > 0 ? amountPaid / hours : 0, source: "last_student_credit", creditId: anyDoc.$id };
  }
  if (modelId) {
    const modelLast = await databases.listDocuments(DATABASE_ID, STUDENT_CREDITS_COLLECTION_ID, [
      sdk.Query.equal("school_id", [SCHOOL_ID]),
      sdk.Query.equal("aircraft_model_id", [modelId]),
      sdk.Query.equal("is_night", [Boolean(isNight)]),
      sdk.Query.orderDesc("purchase_date"),
      sdk.Query.limit(1),
    ]).catch(() => ({ documents: [] }));
    const modelDoc = modelLast.documents?.[0];
    if (modelDoc) {
      const hours = Number(modelDoc.hours ?? 0);
      const amountPaid = Number(modelDoc.amount_paid ?? 0);
      return { hourlyRate: hours > 0 ? amountPaid / hours : 0, source: "last_model_credit", creditId: modelDoc.$id };
    }
  }
  return { hourlyRate: 0, source: "none", creditId: null };
}

async function saveInstructorPaymentSnapshotServer(flightDoc, actorUserId, calculatedAt) {
  if (!FLIGHT_INSTRUCTOR_PAYMENTS_COLLECTION_ID || !flightDoc?.$id) return;
  const existing = await databases.listDocuments(DATABASE_ID, FLIGHT_INSTRUCTOR_PAYMENTS_COLLECTION_ID, [
    sdk.Query.equal("flight_id", [flightDoc.$id]),
    sdk.Query.limit(1),
  ]).catch(() => ({ total: 0, documents: [] }));
  const calculatedAtEffective = paymentCalculatedAtFromFlight(flightDoc, calculatedAt);
  if ((existing.total || 0) > 0) {
    const existingDoc = existing.documents?.[0];
    if (existingDoc?.$id && docDate(existingDoc, "calculated_at") !== cleanString(flightDoc?.flight_date).slice(0, 10)) {
      try {
        await databases.updateDocument(DATABASE_ID, FLIGHT_INSTRUCTOR_PAYMENTS_COLLECTION_ID, existingDoc.$id, {
          calculated_at: calculatedAtEffective,
          updated_by: actorUserId,
        });
      } catch (err) {
        if (!isUnknownCreatedByAttributeError(err)) throw err;
        await databases.updateDocument(DATABASE_ID, FLIGHT_INSTRUCTOR_PAYMENTS_COLLECTION_ID, existingDoc.$id, {
          calculated_at: calculatedAtEffective,
        });
      }
    }
    return;
  }
  const instructorUserId = cleanString(flightDoc.instructor_user_id);
  if (!instructorUserId) return;
  const studentUserId = cleanString(flightDoc.student_user_id || flightDoc.user_id);
  const modelId = await getAircraftModelIdByIdent(cleanString(flightDoc.aircraft_ident));
  const instructorCosts = await getInstructorCostsForUser(instructorUserId);
  const modelCost = (instructorCosts?.modelCosts || []).find((item) => cleanString(item.modelId) === modelId);
  const isNight = Boolean(flightDoc.is_night);
  const blockMinutes = Number(flightDoc.block_time_minutes || flightDoc.total_flight_minutes || 0) || 0;
  const flightHours = blockMinutes > 0 ? blockMinutes / 60 : 0;
  const hourlyRate = isNight ? Number(modelCost?.hourlyNightRate || 0) : Number(modelCost?.hourlyDayRate || 0);
  const fixedRate = isNight ? Number(modelCost?.fixedNightRate || 0) : Number(modelCost?.fixedDayRate || 0);
  const totalCalculated = sagaRoundMoney(hourlyRate * flightHours + fixedRate);
  const studentRate = await resolveStudentHourlyRateServer(studentUserId, modelId, isNight);
  const studentAmount = sagaRoundMoney(studentRate.hourlyRate * flightHours);
  const payload = {
    flight_id: flightDoc.$id,
    instructor_user_id: instructorUserId || null,
    school_id: SCHOOL_ID,
    aircraft_model_id: modelId || null,
    aircraft_model_name: null,
    is_night: isNight,
    hourly_rate_applied: hourlyRate,
    fixed_rate_applied: fixedRate,
    flight_minutes_considered: blockMinutes || null,
    total_calculated: totalCalculated,
    calculated_at: calculatedAtEffective,
    student_user_id: studentUserId || null,
    student_hourly_rate_applied: sagaRoundMoney(studentRate.hourlyRate),
    student_amount_calculated: studentAmount,
    student_rate_source: studentRate.source || "none",
    student_credit_id: studentRate.creditId || null,
    created_by: actorUserId,
    updated_by: actorUserId,
  };
  const perms = [
    sdk.Permission.read(sdk.Role.label("admin")),
    sdk.Permission.update(sdk.Role.label("admin")),
    sdk.Permission.delete(sdk.Role.label("admin")),
  ];
  try {
    await databases.createDocument(
      DATABASE_ID,
      FLIGHT_INSTRUCTOR_PAYMENTS_COLLECTION_ID,
      sdk.ID.unique(),
      payload,
      perms,
    );
  } catch (err) {
    if (!isUnknownCreatedByAttributeError(err)) throw err;
    const { created_by: _createdBy, updated_by: _updatedBy, ...compatPayload } = payload;
    await databases.createDocument(
      DATABASE_ID,
      FLIGHT_INSTRUCTOR_PAYMENTS_COLLECTION_ID,
      sdk.ID.unique(),
      compatPayload,
      perms,
    );
  }
}

async function refreshZeroStudentPaymentSnapshots(userId, actorUserId, logs = null) {
  const safeUserId = cleanString(userId);
  if (!safeUserId || !FLIGHT_INSTRUCTOR_PAYMENTS_COLLECTION_ID || !FLIGHTS_COLLECTION_ID) return 0;
  const payments = await safeListAllDocuments(FLIGHT_INSTRUCTOR_PAYMENTS_COLLECTION_ID, [
    sdk.Query.equal("student_user_id", [safeUserId]),
    ...selectQuery([
      "$id",
      "flight_id",
      "aircraft_model_id",
      "is_night",
      "flight_minutes_considered",
      "student_amount_calculated",
    ]),
  ]).catch(() => []);
  const zeroPayments = payments.filter((payment) => Number(payment.student_amount_calculated || 0) === 0);
  let updated = 0;
  for (const payment of zeroPayments) {
    const flightId = cleanString(payment.flight_id);
    if (!flightId || !payment.$id) continue;
    const flight = await databases.getDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, flightId, [
      sdk.Query.select(["aircraft_ident", "block_time_minutes", "total_flight_minutes", "is_night"]),
    ]).catch(() => null);
    if (!flight) continue;
    const modelId = cleanString(payment.aircraft_model_id) || await getAircraftModelIdByIdent(cleanString(flight.aircraft_ident));
    const isNight = typeof payment.is_night === "boolean" ? payment.is_night : Boolean(flight.is_night);
    const minutes = Number(
      payment.flight_minutes_considered ||
      flight.block_time_minutes ||
      flight.total_flight_minutes ||
      0,
    ) || 0;
    const studentRate = await resolveStudentHourlyRateServer(safeUserId, modelId, isNight);
    const studentAmount = sagaRoundMoney(studentRate.hourlyRate * (minutes / 60));
    if (studentAmount <= 0) continue;
    const patch = {
      student_hourly_rate_applied: sagaRoundMoney(studentRate.hourlyRate),
      student_amount_calculated: studentAmount,
      student_rate_source: studentRate.source || "none",
      student_credit_id: studentRate.creditId || null,
      updated_by: actorUserId,
    };
    try {
      await databases.updateDocument(DATABASE_ID, FLIGHT_INSTRUCTOR_PAYMENTS_COLLECTION_ID, payment.$id, patch);
    } catch (err) {
      if (!isUnknownCreatedByAttributeError(err)) throw err;
      const { updated_by: _updatedBy, ...compatPatch } = patch;
      await databases.updateDocument(DATABASE_ID, FLIGHT_INSTRUCTOR_PAYMENTS_COLLECTION_ID, payment.$id, compatPatch);
    }
    updated += 1;
  }
  if (updated > 0 && Array.isArray(logs)) {
    logs.push(`Pagamentos de voos: ${updated} lancamento(s) zerado(s) recalculado(s) apos atualizar os creditos.`);
  }
  return updated;
}

async function syncSagaUserAnac(userId, sagaUser) {
  const anacCode = cleanString(sagaUser.codigoAnac);
  const cpf = cleanString(sagaUser.cpf).replace(/\D/g, "");
  if (!SYNC_ANAC_FUNCTION_ID || !userId || !anacCode || cpf.length !== 11) {
    return { skipped: true, reason: "missing_anac_or_cpf" };
  }
  try {
    const execution = await functions.createExecution({
      functionId: SYNC_ANAC_FUNCTION_ID,
      body: JSON.stringify({
        userId,
        anacCode,
        cpf,
        birthDate: dateBrToIso(sagaUser.nascimento) || "",
      }),
      async: false,
    });
    const body = parseJsonObject(execution.responseBody, {});
    if (execution.status === "failed" || execution.responseStatusCode >= 400) {
      return { error: true, message: body.message || `ANAC status ${execution.responseStatusCode}` };
    }
    return { pending: body.pending !== false, message: body.message || "ANAC consultada." };
  } catch (err) {
    return { error: true, message: String(err?.message || err) };
  }
}

function sagaCreditRowBaseKey(userId, credit) {
  const stableTotalValue = cleanString(credit._originalTotalValue ?? credit.totalValue);
  return [
    cleanString(userId),
    cleanString(credit.model),
    cleanString(credit.purchaseDate),
    cleanString(credit.expiresAt),
    stableTotalValue,
    sagaHoursValue(credit.hours || credit.hoursHhmm).toFixed(2),
  ].join("|");
}

function assignSagaCreditRowOccurrences(userId, credits) {
  const occurrenceCounts = new Map();
  return (credits || []).map((credit, index) => {
    const sagaRowIndex = Number.isInteger(credit?.sagaRowIndex) ? credit.sagaRowIndex : index;
    const baseKey = sagaCreditRowBaseKey(userId, credit);
    const sagaRowOccurrence = occurrenceCounts.get(baseKey) || 0;
    occurrenceCounts.set(baseKey, sagaRowOccurrence + 1);
    return { ...credit, sagaRowIndex, sagaRowOccurrence };
  });
}

function sagaCreditDocId(testMode, userId, credit) {
  const segment = credit?.segmentPart === "night" || credit?.isNight === true ? "night" : "day";
  const stableTotalValue = cleanString(credit._originalTotalValue ?? credit.totalValue);
  const sagaRowIndex = Number.isInteger(credit?.sagaRowIndex)
    ? credit.sagaRowIndex
    : Number.isInteger(credit?._sourceCredit?.sagaRowIndex)
      ? credit._sourceCredit.sagaRowIndex
      : 0;
  const raw = [
    userId,
    cleanString(credit.model),
    cleanString(credit.purchaseDate),
    cleanString(credit.expiresAt),
    stableTotalValue,
    segment,
    `row:${sagaRowIndex}`,
  ].join("|");
  const hash = crypto.createHash("sha1").update(raw).digest("hex").slice(0, 20);
  const prefix = testMode ? "saga_test_credit" : "saga_credit";
  return `${prefix}_${hash}`;
}

function isSagaManagedCreditDocId(docId, testMode = false) {
  const safeId = cleanString(docId);
  if (!safeId) return false;
  if (testMode) return safeId.startsWith("saga_test_credit_") || safeId.startsWith("saga_test_fin_credit_");
  return safeId.startsWith("saga_credit_") || safeId.startsWith("saga_fin_credit_");
}

function sagaFallbackHoursFromCells(cells) {
  const rawCells = Array.isArray(cells) ? cells : [];
  let candidate = 0;
  for (const value of rawCells) {
    const text = cleanString(value);
    // Ignore money-like values; we only want duration-looking columns.
    if (!text || (!/[h:]/i.test(text) && !/^\d+(?:[.,]\d+)?$/.test(text))) continue;
    const parsed = sagaHoursValue(text);
    if (parsed > candidate && parsed <= 200) candidate = parsed;
  }
  return candidate;
}

async function purgeMissingSagaCreditsForUser(userId, expectedDocIds, { testMode = false } = {}) {
  if (!STUDENT_CREDITS_COLLECTION_ID) return { deleted: 0 };
  const safeUserId = cleanString(userId);
  if (!safeUserId) return { deleted: 0 };
  const expected = new Set(Array.from(expectedDocIds || []).map(cleanString).filter(Boolean));
  const docs = await listAllDocuments(STUDENT_CREDITS_COLLECTION_ID, [
    sdk.Query.equal("school_id", [SCHOOL_ID]),
    sdk.Query.equal("user_id", [safeUserId]),
    ...selectQuery(["$id"]),
  ]).catch(() => []);
  let deleted = 0;
  for (const doc of docs) {
    const docId = cleanString(doc?.$id);
    if (!isSagaManagedCreditDocId(docId, testMode)) continue;
    if (expected.has(docId)) continue;
    await databases.deleteDocument(DATABASE_ID, STUDENT_CREDITS_COLLECTION_ID, docId);
    deleted += 1;
  }
  return { deleted };
}

function sagaFinancialCreditDocId(testMode, userId, entry) {
  const raw = [
    userId,
    cleanString(entry.id),
    cleanString(entry.data),
    cleanString(entry.valorTotal),
    cleanString(entry.natureza),
  ].join("_").replace(/[^a-zA-Z0-9._-]/g, "_");
  return sagaDocId(testMode ? "saga_test_fin_credit" : "saga_fin_credit", raw);
}

function sagaCreditFingerprint(userId, credit) {
  return [
    userId,
    dateBrToIso(credit.purchaseDate) || cleanString(credit.purchaseDate),
    sagaMoneyValue(credit.totalValue).toFixed(2),
    cleanString(credit.model).toLowerCase(),
    sagaHoursValue(credit.hours || credit.hoursHhmm).toFixed(2),
  ].join("|");
}

function extractGfvCaktoCreditId(...values) {
  for (const value of values) {
    const match = cleanString(value).match(/GFV-CAKTO:([A-Za-z0-9_-]+)/);
    if (match?.[1]) return match[1];
  }
  return "";
}

function sagaCreditImportFingerprint(userId, credit, modelId) {
  return [
    cleanString(userId),
    sagaCreditPurchaseDateIso(credit.purchaseDate) || dateBrToIso(credit.purchaseDate) || cleanString(credit.purchaseDate),
    sagaMoneyValue(credit._originalTotalValue ?? credit.totalValue).toFixed(2),
    cleanString(modelId),
    sagaHoursValue(credit.hours || credit.hoursHhmm).toFixed(2),
  ].join("|");
}

function localCreditImportFingerprint(doc) {
  return [
    cleanString(doc.user_id),
    sagaCreditPurchaseDateIso(doc.purchase_date) || cleanString(doc.purchase_date),
    Number(doc.amount_paid || 0).toFixed(2),
    cleanString(doc.aircraft_model_id),
    Number(doc.hours || 0).toFixed(2),
  ].join("|");
}

async function findExistingCreditForSagaImport(userId, credit, modelId, { testMode = false } = {}) {
  if (!STUDENT_CREDITS_COLLECTION_ID) return null;
  const safeUserId = cleanString(userId);
  if (!safeUserId) return null;

  const markerCreditId = extractGfvCaktoCreditId(credit.notes, credit.segmentNote);
  if (markerCreditId) {
    const byMarker = await databases.getDocument(DATABASE_ID, STUDENT_CREDITS_COLLECTION_ID, markerCreditId).catch(() => null);
    if (byMarker && cleanString(byMarker.user_id) === safeUserId) {
      return { docId: markerCreditId, reason: "already_exists_via_cakto" };
    }
  }

  const sourceCredit = credit._sourceCredit || credit;
  const occurrenceIndex = Number.isInteger(credit.sagaRowOccurrence)
    ? credit.sagaRowOccurrence
    : Number.isInteger(sourceCredit.sagaRowOccurrence)
      ? sourceCredit.sagaRowOccurrence
      : 0;

  const targetFingerprint = sagaCreditImportFingerprint(safeUserId, credit, modelId);
  const docs = await databases.listDocuments(DATABASE_ID, STUDENT_CREDITS_COLLECTION_ID, [
    sdk.Query.equal("school_id", [SCHOOL_ID]),
    sdk.Query.equal("user_id", [safeUserId]),
    ...selectQuery(["$id", "user_id", "purchase_date", "amount_paid", "aircraft_model_id", "hours", "notes"]),
    sdk.Query.limit(200),
  ]).catch(() => ({ documents: [] }));

  const matchingDocs = [];
  for (const doc of docs.documents || []) {
    const docId = cleanString(doc.$id);
    if (markerCreditId && extractGfvCaktoCreditId(doc.notes) === markerCreditId) {
      return { docId, reason: "already_exists_via_cakto" };
    }
    if (localCreditImportFingerprint(doc) !== targetFingerprint) continue;
    // Somente creditos locais (nao gerenciados pelo SAGA) entram na deduplicacao
    // entre sistemas. Creditos saga_* sao identificados pelo sagaRowIndex no docId.
    if (isSagaManagedCreditDocId(docId, testMode)) continue;
    matchingDocs.push(doc);
  }

  matchingDocs.sort((a, b) => cleanString(a.$id).localeCompare(cleanString(b.$id)));

  if (matchingDocs.length > occurrenceIndex) {
    const matched = matchingDocs[occurrenceIndex];
    return { docId: cleanString(matched.$id), reason: "already_exists_local_match" };
  }
  return null;
}

function sagaFinancialEntryMatchesStudent(entry, sagaUser) {
  const client = normalizeSearch(entry?.cliente);
  const rawClient = cleanString(entry?.cliente).replace(/\D/g, "");
  if (!client && !rawClient) return false;
  const textChecks = [sagaUser?.nome, sagaUser?.name, sagaUser?.email, sagaUser?.codigoAnac, sagaUser?.id]
    .map(normalizeSearch)
    .filter(Boolean);
  if (textChecks.some((value) => client.includes(value) || value.includes(client))) return true;
  const numericChecks = [sagaUser?.cpf, sagaUser?.codigoAnac, sagaUser?.id]
    .map((value) => cleanString(value).replace(/\D/g, ""))
    .filter(Boolean);
  return numericChecks.some((value) => rawClient.includes(value) || value.includes(rawClient));
}

function findSagaCreditForFinancialEntry(entry, userId, creditRows) {
  const entryDate = dateBrToIso(entry.data) || cleanString(entry.data);
  const entryAmount = sagaMoneyValue(entry.valorTotal);
  const candidates = (creditRows || []).filter((credit) => {
    if (cleanString(credit.userId) && cleanString(credit.userId) !== userId) return false;
    const creditDate = dateBrToIso(credit.purchaseDate) || cleanString(credit.purchaseDate);
    const creditAmount = sagaMoneyValue(credit.totalValue);
    const sameDate = !entryDate || !creditDate || entryDate === creditDate;
    const sameAmount = entryAmount <= 0 || creditAmount <= 0 || Math.abs(entryAmount - creditAmount) < 0.01;
    return sameDate && sameAmount;
  });
  return candidates[0] || null;
}

function findSagaFinancialModel(entry, matchedCredit, mapping, catalogs) {
  const matchedModel = cleanString(matchedCredit?.model);
  if (matchedModel) {
    return {
      sagaModel: matchedModel,
      modelId: resolveSagaCreditModelMappingId(mapping?.creditAircraftBySaga, matchedModel),
    };
  }
  const haystack = normalizeSearch(`${entry?.natureza || ""} ${entry?.acoes || ""}`);
  for (const [sagaModel, modelId] of Object.entries(mapping.creditAircraftBySaga || {})) {
    if (sagaModel && haystack.includes(normalizeSearch(sagaModel))) return { sagaModel: cleanString(sagaModel), modelId: cleanString(modelId) };
  }
  for (const model of catalogs.aircraftModels || []) {
    if (model?.name && haystack.includes(normalizeSearch(model.name))) return { sagaModel: cleanString(model.name), modelId: cleanString(model.id) };
  }
  return { sagaModel: "", modelId: "" };
}

function sagaFinancialHours(entry, matchedCredit) {
  const matchedHours = sagaHoursValue(matchedCredit?.hours || matchedCredit?.hoursHhmm);
  if (matchedHours > 0) return matchedHours;
  return sagaHoursValue(`${entry?.natureza || ""} ${entry?.acoes || ""}`);
}

function sagaRoundCreditHours(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

function sagaCreditPurchaseDateIso(value) {
  const br = dateBrToIso(value);
  if (br) return br;
  const raw = cleanString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function sagaResolveCreditModelIdForFlightGroup(group, mapping, catalogs) {
  const firstLeg = group?.legs?.[0] || {};
  const sagaAircraft = cleanString(firstLeg.aeronave);
  const mappedRegistration = cleanString(mapping?.aircraftBySaga?.[sagaAircraft]);
  if (!mappedRegistration) return "";
  const normalized = normalizeAircraftIdent(mappedRegistration);
  const aircraft = (catalogs?.aircrafts || []).find(
    (item) => normalizeAircraftIdent(item.registration) === normalized,
  );
  return cleanString(aircraft?.modelId);
}

function sagaLegNightMinutes(leg) {
  const explicitNight = parseDurationToMinutes(leg?.nightTime || "");
  if (explicitNight > 0) return explicitNight;
  const isNight = /not/i.test(cleanString(leg?.diurnoOuNoturno));
  if (!isNight) return 0;
  return parseDurationToMinutes(leg?.tempoDeVooHhmm || leg?.tempoDeVooHoras || "");
}

function collectSagaNightHourDemands(selectedGroups, usersByCanac, mapping, catalogs) {
  const demands = [];
  for (const group of selectedGroups || []) {
    const firstLeg = group?.legs?.[0] || {};
    const userId = usersByCanac.get(cleanString(firstLeg.canacAluno)) || "";
    if (!userId) continue;
    const modelId = sagaResolveCreditModelIdForFlightGroup(group, mapping, catalogs);
    if (!modelId) continue;
    const flightDate = sagaCreditPurchaseDateIso(firstLeg.dataDoVoo) || dateBrToIso(firstLeg.dataDoVoo) || "";
    if (!flightDate) continue;
    const nightMinutes = (group?.legs || []).reduce((acc, leg) => acc + sagaLegNightMinutes(leg), 0);
    const hours = sagaRoundCreditHours(nightMinutes / 60);
    if (hours <= 0) continue;
    demands.push({ userId, modelId, flightDate, hours });
  }
  return demands;
}

function sagaCreditAmountForHours(credit, hours, originalHours) {
  const effectiveHours = sagaRoundCreditHours(hours);
  if (effectiveHours <= 0) return 0;
  const hourlyValue = sagaMoneyValue(credit?.hourlyValue);
  if (hourlyValue > 0) return Number((effectiveHours * hourlyValue).toFixed(2));
  const totalValue = sagaMoneyValue(credit?._originalTotalValue ?? credit?.totalValue);
  if (totalValue > 0 && originalHours > 0) {
    return Number(((totalValue * effectiveHours) / originalHours).toFixed(2));
  }
  return 0;
}

function buildSagaEffectiveCreditRow(credit, { hours, isNight, segmentPart, segmentNote = "" }) {
  const originalTotalValue = cleanString(credit._originalTotalValue ?? credit.totalValue);
  return {
    sagaUserId: credit.sagaUserId,
    sagaRowIndex: credit.sagaRowIndex,
    sagaRowOccurrence: credit.sagaRowOccurrence,
    studentName: credit.studentName,
    studentEmail: credit.studentEmail,
    studentAnac: credit.studentAnac,
    userId: credit.userId,
    modelId: credit.modelId,
    model: credit.model,
    purchaseDate: credit.purchaseDate,
    expiresAt: credit.expiresAt,
    hourlyValue: credit.hourlyValue,
    notes: credit.notes,
    responsible: credit.responsible,
    rawCells: credit.rawCells,
    _originalTotalValue: originalTotalValue,
    hours,
    hoursHhmm: "",
    totalValue: sagaCreditAmountForHours(credit, hours, credit.originalHours),
    isNight,
    segmentPart,
    segmentNote,
    _sourceCredit: credit._sourceCredit || credit,
  };
}

function segmentSagaCreditsForNightModel(purchases, demands) {
  const sourceCredits = (purchases || [])
    .map((credit) => {
      const purchaseDateIso = sagaCreditPurchaseDateIso(credit.purchaseDate);
      const hours = sagaHoursValue(credit.hours || credit.hoursHhmm);
      const originalTotalValue = cleanString(credit.totalValue);
      return {
        ...credit,
        _originalTotalValue: originalTotalValue,
        purchaseDateIso,
        originalHours: hours,
        remainingHours: hours,
        nightHoursTaken: 0,
        _sourceCredit: credit,
      };
    })
    .filter((credit) => credit.originalHours > 0)
    .sort((a, b) => a.purchaseDateIso.localeCompare(b.purchaseDateIso) || a.originalHours - b.originalHours);

  const sortedDemands = [...(demands || [])]
    .filter((demand) => sagaRoundCreditHours(demand?.hours) > 0 && cleanString(demand?.flightDate))
    .sort((a, b) => cleanString(a.flightDate).localeCompare(cleanString(b.flightDate)));

  let nightHoursReclassified = 0;
  let uncoveredNightHours = 0;
  for (const demand of sortedDemands) {
    let remaining = sagaRoundCreditHours(demand.hours);
    let index = sourceCredits.length - 1;
    while (index >= 0 && sourceCredits[index].purchaseDateIso > demand.flightDate) index -= 1;
    if (index < 0) {
      uncoveredNightHours = sagaRoundCreditHours(uncoveredNightHours + remaining);
      continue;
    }
    while (index >= 0 && remaining > 0) {
      const credit = sourceCredits[index];
      if (credit.remainingHours > 0) {
        const consumed = sagaRoundCreditHours(Math.min(credit.remainingHours, remaining));
        credit.remainingHours = sagaRoundCreditHours(credit.remainingHours - consumed);
        credit.nightHoursTaken = sagaRoundCreditHours(credit.nightHoursTaken + consumed);
        remaining = sagaRoundCreditHours(remaining - consumed);
        nightHoursReclassified = sagaRoundCreditHours(nightHoursReclassified + consumed);
      }
      index -= 1;
    }
    if (remaining > 0) uncoveredNightHours = sagaRoundCreditHours(uncoveredNightHours + remaining);
  }

  const effectiveCredits = [];
  let nightCreditRecordsCreated = 0;
  for (const credit of sourceCredits) {
    const dayHours = sagaRoundCreditHours(credit.originalHours - credit.nightHoursTaken);
    const nightHours = sagaRoundCreditHours(credit.nightHoursTaken);
    if (dayHours > 0) {
      effectiveCredits.push(buildSagaEffectiveCreditRow(credit, { hours: dayHours, isNight: false, segmentPart: "day" }));
    }
    if (nightHours > 0) {
      nightCreditRecordsCreated += 1;
      effectiveCredits.push(
        buildSagaEffectiveCreditRow(credit, {
          hours: nightHours,
          isNight: true,
          segmentPart: "night",
          segmentNote: "Credito noturno reclassificado na importacao SAGA",
        }),
      );
    }
  }

  return { effectiveCredits, nightHoursReclassified, nightCreditRecordsCreated, uncoveredNightHours };
}

function segmentSagaCreditsForNight(purchases, demands) {
  const modelIds = new Set();
  for (const purchase of purchases || []) modelIds.add(cleanString(purchase.modelId));
  for (const demand of demands || []) modelIds.add(cleanString(demand.modelId));
  if (!modelIds.size && (purchases || []).length) modelIds.add("");

  const effectiveCredits = [];
  let nightHoursReclassified = 0;
  let nightCreditRecordsCreated = 0;
  let uncoveredNightHours = 0;
  for (const modelId of modelIds) {
    const modelPurchases = (purchases || []).filter((purchase) => cleanString(purchase.modelId) === modelId);
    if (!modelPurchases.length) continue;
    const modelDemands = (demands || []).filter((demand) => cleanString(demand.modelId) === modelId);
    const part = segmentSagaCreditsForNightModel(modelPurchases, modelDemands);
    effectiveCredits.push(...part.effectiveCredits);
    nightHoursReclassified = sagaRoundCreditHours(nightHoursReclassified + part.nightHoursReclassified);
    nightCreditRecordsCreated += part.nightCreditRecordsCreated;
    uncoveredNightHours = sagaRoundCreditHours(uncoveredNightHours + part.uncoveredNightHours);
  }

  return { effectiveCredits, nightHoursReclassified, nightCreditRecordsCreated, uncoveredNightHours };
}

function buildSagaUnsegmentedCredits(purchases) {
  return (purchases || [])
    .map((credit) => {
      const hours = sagaHoursValue(credit.hours || credit.hoursHhmm);
      if (hours <= 0) return null;
      return buildSagaEffectiveCreditRow(
        {
          ...credit,
          _originalTotalValue: cleanString(credit.totalValue),
          originalHours: hours,
          _sourceCredit: credit,
        },
        { hours, isNight: false, segmentPart: "day" },
      );
    })
    .filter(Boolean);
}

async function loadSagaCreditCookieJar(logs = []) {
  const credentials = await loadSagaImportCredentials().catch(() => ({ email: "", password: "" }));
  try {
    const session = await loadSagaAuthSession();
    await assertSagaAuthSessionAlive(session.cookieJar);
    return { cookieJar: session.cookieJar, loginEmail: session.loginEmail || credentials.email || "" };
  } catch (err) {
    if (!credentials.email || !credentials.password) throw err;
    logs.push(`Sessao SAGA indisponivel; tentando login com credenciais salvas (${credentials.email}).`);
    const cookieJar = await sagaLoginSession(credentials.email, credentials.password, logs);
    return { cookieJar, loginEmail: credentials.email };
  }
}

async function sagaCreditPage(cookieJar, sagaStudentId) {
  const page = await sagaFetchHtmlFollow(
    `/credits/create?student_id=${encodeURIComponent(sagaStudentId)}`,
    {
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        referer: `${SAGA_BASE_URL}/credits/create`,
      },
    },
    cookieJar,
  );
  if (isSagaLoginResponse(page)) {
    throw Object.assign(new Error("Sessao SAGA expirada ao abrir a tela de creditos."), { status: 401 });
  }
  return page;
}

function resolveSagaCreditAircraftIcaoForLocalModel(mapping, modelId) {
  const candidates = Object.entries(mapping?.creditAircraftBySaga || {})
    .filter(([, localModelId]) => cleanString(localModelId) === cleanString(modelId))
    .map(([sagaModel]) => cleanString(sagaModel))
    .filter(Boolean);
  return candidates.find((sagaModel) => sagaModel === SAGA_CREDIT_AIRCRAFT_ICAO) ||
    candidates.find((sagaModel) => !/^\d+$/.test(sagaModel)) ||
    SAGA_CREDIT_AIRCRAFT_ICAO;
}

async function createManualSagaCredit(localCreditDoc, logs = []) {
  const userId = cleanString(localCreditDoc?.user_id);
  if (!userId) return { ok: false, status: "skipped", message: "Aluno nao informado para lancamento no SAGA." };
  const profile = await getProfileByUserId(userId).catch(() => null);
  const sagaStudentId = cleanString(profile?.saga_user_id) || cleanString(userId).match(/^saga_(\d+)$/)?.[1] || "";
  if (!sagaStudentId) {
    return { ok: false, status: "skipped", message: "Aluno sem saga_user_id vinculado no perfil." };
  }

  const { cookieJar, loginEmail } = await loadSagaCreditCookieJar(logs);
  const marker = `GFV-MANUAL:${localCreditDoc.$id}`;
  let page = await sagaCreditPage(cookieJar, sagaStudentId);
  if (String(page.html || "").includes(marker)) {
    await saveSagaAuthSession(cookieJar, loginEmail).catch(() => undefined);
    return { ok: true, status: "already_exists", marker, sagaStudentId };
  }

  const csrfToken = resolveSagaCsrfToken(page.html, cookieJar);
  if (!csrfToken) {
    throw Object.assign(new Error("Token CSRF do formulario de creditos do SAGA nao encontrado."), { status: 502 });
  }
  const mapping = await loadSagaImportMapping().catch(() => defaultSagaImportMapping());
  const aircraftIcao = resolveSagaCreditAircraftIcaoForLocalModel(mapping, localCreditDoc.aircraft_model_id);
  const form = new URLSearchParams({
    _token: csrfToken,
    student_id: sagaStudentId,
    created_at: asIsoDate(localCreditDoc.purchase_date),
    aircraft_icao: aircraftIcao,
    type: SAGA_CREDIT_TYPE,
    hours: String(positiveNumber(localCreditDoc.hours)),
    value: String(Math.round(positiveNumber(localCreditDoc.amount_paid) * 100) / 100),
    bank_id: SAGA_CREDIT_BANK_ID,
    expiration_at: asIsoDate(localCreditDoc.expires_at || addDaysIso(localCreditDoc.purchase_date, localCreditDoc.validity_days)),
    notes: [
      `Credito manual Flight Viewer. ${marker}`,
      cleanString(localCreditDoc.payment_method) ? `Pagamento: ${cleanString(localCreditDoc.payment_method)}` : "",
      cleanString(localCreditDoc.notes),
    ].filter(Boolean).join(" "),
  });

  const post = await sagaFetch(
    "/credits",
    {
      method: "POST",
      body: form.toString(),
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "content-type": "application/x-www-form-urlencoded",
        origin: SAGA_BASE_URL,
        referer: `${SAGA_BASE_URL}/credits/create?student_id=${encodeURIComponent(sagaStudentId)}`,
      },
    },
    cookieJar,
  );
  if (isSagaLoginResponse(post)) {
    throw Object.assign(new Error("Sessao SAGA expirou ao lancar o credito."), { status: 401 });
  }

  page = await sagaCreditPage(cookieJar, sagaStudentId);
  if (!String(page.html || "").includes(marker)) {
    const location = cleanString(post.response.headers.get("location"));
    throw Object.assign(new Error(`SAGA nao confirmou o credito (HTTP ${post.response.status}, redirect ${location || "ausente"}).`), {
      status: 502,
    });
  }
  await saveSagaAuthSession(cookieJar, loginEmail).catch(() => undefined);
  return { ok: true, status: "completed", marker, sagaStudentId };
}

/**
 * Lança no SAGA a MULTA de um cancelamento como remoção de crédito
 * (POST /credits?action=remove). Espelha createManualSagaCredit para sessão/CSRF/
 * idempotência (marca `GFV-PENALTY:<ref>` nas notas e verifica antes de postar). O
 * valor monetário sai do mesmo cálculo de tarifa/hora do aluno usado no custo do voo.
 * Best-effort: chamada de forma assíncrona pela schedule-booking; nunca deve derrubar
 * o cancelamento.
 */
async function registerSagaCancellationPenalty(params, logs = []) {
  const studentUserId = cleanString(params?.studentUserId);
  const penaltyHours = positiveNumber(params?.penaltyHours);
  if (!studentUserId) return { ok: false, status: "skipped", message: "Aluno nao informado." };
  if (penaltyHours <= 0) return { ok: false, status: "skipped", message: "Sem multa a lancar." };

  const profile = await getProfileByUserId(studentUserId).catch(() => null);
  const sagaStudentId =
    cleanString(profile?.saga_user_id) || cleanString(studentUserId).match(/^saga_(\d+)$/)?.[1] || "";
  if (!sagaStudentId) return { ok: false, status: "skipped", message: "Aluno sem saga_user_id vinculado." };

  const modelId = cleanString(params?.aircraftModelId);
  const penaltyRef = cleanString(params?.penaltyRef) || `${sagaStudentId}-${cleanString(params?.createdAt)}`;
  const marker = `GFV-PENALTY:${penaltyRef}`;

  const { cookieJar, loginEmail } = await loadSagaCreditCookieJar(logs);
  let page = await sagaCreditPage(cookieJar, sagaStudentId);
  if (String(page.html || "").includes(marker)) {
    await saveSagaAuthSession(cookieJar, loginEmail).catch(() => undefined);
    return { ok: true, status: "already_exists", marker, sagaStudentId };
  }

  const csrfToken = resolveSagaCsrfToken(page.html, cookieJar);
  if (!csrfToken) {
    throw Object.assign(new Error("Token CSRF do formulario de creditos do SAGA nao encontrado."), { status: 502 });
  }

  const mapping = await loadSagaImportMapping().catch(() => defaultSagaImportMapping());
  const aircraftIcao = resolveSagaCreditAircraftIcaoForLocalModel(mapping, modelId);
  const rate = await resolveStudentHourlyRateServer(studentUserId, modelId, Boolean(params?.isNight)).catch(() => ({
    hourlyRate: 0,
  }));
  const value = Math.round(Number(rate?.hourlyRate || 0) * penaltyHours * 100) / 100;
  const createdAt = asIsoDate(params?.createdAt) || nowIso().slice(0, 10);
  const pct = Math.round(Number(params?.penaltyPct || 0));
  const notes = [
    `MULTA ${pct}% - Voo cancelado: ${cleanString(params?.flightWhen)} - Cancelamento em: ${cleanString(params?.cancelledWhen)}`.trim(),
    marker,
  ]
    .filter(Boolean)
    .join(" ");

  // hours em formato BR (vírgula) como no lançamento manual do SAGA; value em ponto.
  const form = new URLSearchParams({
    _token: csrfToken,
    student_id: sagaStudentId,
    created_at: createdAt,
    aircraft_icao: aircraftIcao,
    type: SAGA_CREDIT_TYPE,
    hours: String(penaltyHours).replace(".", ","),
    value: String(value),
    bank_id: SAGA_CREDIT_PENALTY_BANK_ID,
    expiration_at: createdAt,
    notes,
  });

  const post = await sagaFetch(
    "/credits?action=remove",
    {
      method: "POST",
      body: form.toString(),
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "content-type": "application/x-www-form-urlencoded",
        origin: SAGA_BASE_URL,
        referer: `${SAGA_BASE_URL}/credits/create?student_id=${encodeURIComponent(sagaStudentId)}`,
      },
    },
    cookieJar,
  );
  if (isSagaLoginResponse(post)) {
    throw Object.assign(new Error("Sessao SAGA expirou ao lancar a multa."), { status: 401 });
  }

  page = await sagaCreditPage(cookieJar, sagaStudentId);
  const confirmed = String(page.html || "").includes(marker);
  await saveSagaAuthSession(cookieJar, loginEmail).catch(() => undefined);
  if (!confirmed) {
    const location = cleanString(post.response.headers.get("location"));
    throw Object.assign(
      new Error(`SAGA nao confirmou a multa (HTTP ${post.response.status}, redirect ${location || "ausente"}).`),
      { status: 502 },
    );
  }
  return { ok: true, status: "completed", marker, sagaStudentId, value, hours: penaltyHours };
}

async function upsertSagaCredit(actorUserId, credit, userId, mapping, catalogs, { testMode = false, createOnly = false } = {}) {
  if (!STUDENT_CREDITS_COLLECTION_ID) {
    return { skipped: true, reason: "credits_collection_missing", aircraft: cleanString(credit.model) };
  }
  const sagaModel = cleanString(credit.model);
  const modelId = resolveSagaCreditModelMappingId(mapping?.creditAircraftBySaga, sagaModel);
  const model = (catalogs.aircraftModels || []).find((item) => item.id === modelId);
  let hours = sagaHoursValue(credit.hours || credit.hoursHhmm);
  if (hours <= 0) {
    hours = sagaFallbackHoursFromCells(credit.rawCells);
  }
  if (!modelId) {
    return { skipped: true, reason: "missing_credit_aircraft_mapping", aircraft: sagaModel };
  }
  if (hours <= 0) {
    return { skipped: true, reason: "zero_credit_balance", aircraft: sagaModel };
  }
  const docId = sagaCreditDocId(testMode, userId, credit);
  const purchaseDate = dateBrToIso(credit.purchaseDate) || nowIso().slice(0, 10);
  const rawExpiresAt = dateBrToIso(credit.expiresAt);
  const expiresAt = (rawExpiresAt && rawExpiresAt > purchaseDate) ? rawExpiresAt : addDaysIso(purchaseDate, 60);
  const validityDays = Math.max(0, Math.round((new Date(`${expiresAt}T12:00:00`).getTime() - new Date(`${purchaseDate}T12:00:00`).getTime()) / 86400000));
  const splitAmount =
    typeof credit.totalValue === "number" && Number.isFinite(credit.totalValue)
      ? Number(credit.totalValue.toFixed(2))
      : sagaMoneyValue(credit.totalValue);
  const originalAmount = sagaMoneyValue(credit._originalTotalValue ?? credit.totalValue);
  const data = sanitizeCreditInput({
    userId,
    purchaseDate,
    aircraftModelId: modelId,
    aircraftModelName: model?.name || sagaModel,
    amountPaid: splitAmount > 0 ? splitAmount : originalAmount,
    paymentMethod: "SAGA",
    paymentInstallments: null,
    validityDays,
    hours,
    notes: [
      "Importado do SAGA",
      cleanString(credit.notes),
      cleanString(credit.responsible),
      cleanString(credit.segmentNote),
    ].filter(Boolean).join(". "),
    isNight: Boolean(credit.isNight),
  });
  const payload = {
    ...data,
    school_id: SCHOOL_ID,
    created_by: actorUserId,
    updated_by: actorUserId,
  };
  const existing = await databases.getDocument(DATABASE_ID, STUDENT_CREDITS_COLLECTION_ID, docId).catch(() => null);
  if (existing) {
    if (createOnly) return { skipped: true, reason: "already_exists", hours, aircraft: sagaModel, docId, covered: true };
    try {
      await databases.updateDocument(DATABASE_ID, STUDENT_CREDITS_COLLECTION_ID, docId, {
        ...data,
        updated_by: actorUserId,
      });
    } catch (err) {
      if (!isUnknownCreatedByAttributeError(err)) throw err;
      await databases.updateDocument(DATABASE_ID, STUDENT_CREDITS_COLLECTION_ID, docId, data);
    }
    return { updated: true, hours, aircraft: sagaModel, docId };
  }

  const duplicate = await findExistingCreditForSagaImport(userId, credit, modelId, { testMode });
  if (duplicate) {
    return {
      skipped: true,
      reason: duplicate.reason,
      hours,
      aircraft: sagaModel,
      docId: duplicate.docId,
      covered: true,
    };
  }

  try {
    await databases.createDocument(DATABASE_ID, STUDENT_CREDITS_COLLECTION_ID, docId, payload, creditPermissions(userId));
  } catch (err) {
    if (!isUnknownCreatedByAttributeError(err)) throw err;
    const { created_by: _createdBy, updated_by: _updatedBy, ...compatPayload } = payload;
    await databases.createDocument(DATABASE_ID, STUDENT_CREDITS_COLLECTION_ID, docId, compatPayload, creditPermissions(userId));
  }
  return { created: true, hours, aircraft: sagaModel, docId };
}

async function upsertSagaFinancialCredit(actorUserId, entry, userId, mapping, catalogs, { testMode = false, matchedCredit = null, createOnly = false } = {}) {
  if (!STUDENT_CREDITS_COLLECTION_ID) {
    return { skipped: true, reason: "credits_collection_missing", aircraft: "" };
  }
  const { sagaModel, modelId } = findSagaFinancialModel(entry, matchedCredit, mapping, catalogs);
  const model = (catalogs.aircraftModels || []).find((item) => cleanString(item.id) === modelId);
  const hours = sagaFinancialHours(entry, matchedCredit);
  if (!modelId) return { skipped: true, reason: "missing_credit_aircraft_mapping", aircraft: sagaModel || cleanString(entry.natureza) };
  if (hours <= 0) return { skipped: true, reason: "missing_financial_credit_hours", aircraft: sagaModel };
  const purchaseDate = dateBrToIso(entry.data) || dateBrToIso(matchedCredit?.purchaseDate) || nowIso().slice(0, 10);
  const rawExpiresAt2 = dateBrToIso(matchedCredit?.expiresAt);
  const expiresAt = (rawExpiresAt2 && rawExpiresAt2 > purchaseDate) ? rawExpiresAt2 : addDaysIso(purchaseDate, 60);
  const validityDays = Math.max(0, Math.round((new Date(`${expiresAt}T12:00:00`).getTime() - new Date(`${purchaseDate}T12:00:00`).getTime()) / 86400000));
  const data = sanitizeCreditInput({
    userId,
    purchaseDate,
    aircraftModelId: modelId,
    aircraftModelName: model?.name || sagaModel,
    amountPaid: sagaMoneyValue(entry.valorTotal) || sagaMoneyValue(matchedCredit?.totalValue),
    paymentMethod: cleanString(entry.banco) || "SAGA",
    paymentInstallments: null,
    validityDays,
    hours,
    notes: [
      "Importado do financeiro SAGA",
      cleanString(entry.natureza),
      cleanString(entry.status),
      cleanString(entry.id) ? `ID ${cleanString(entry.id)}` : "",
    ].filter(Boolean).join(". "),
    isNight: false,
  });
  const docId = sagaFinancialCreditDocId(testMode, userId, entry);
  const existing = await databases.getDocument(DATABASE_ID, STUDENT_CREDITS_COLLECTION_ID, docId).catch(() => null);
  if (existing) {
    if (createOnly) return { skipped: true, reason: "already_exists", hours, aircraft: sagaModel, docId, covered: true };
    try {
      await databases.updateDocument(DATABASE_ID, STUDENT_CREDITS_COLLECTION_ID, docId, {
        ...data,
        updated_by: actorUserId,
      });
    } catch (err) {
      if (!isUnknownCreatedByAttributeError(err)) throw err;
      await databases.updateDocument(DATABASE_ID, STUDENT_CREDITS_COLLECTION_ID, docId, data);
    }
    return { updated: true, hours, aircraft: sagaModel, docId };
  }

  const duplicateCredit = matchedCredit || {
    purchaseDate: entry.data,
    totalValue: entry.valorTotal,
    hours,
    model: sagaModel,
    notes: entry.natureza,
  };
  const duplicate = await findExistingCreditForSagaImport(userId, duplicateCredit, modelId, { testMode });
  if (duplicate) {
    return {
      skipped: true,
      reason: duplicate.reason,
      hours,
      aircraft: sagaModel,
      docId: duplicate.docId,
      covered: true,
    };
  }

  const payload = {
    ...data,
    school_id: SCHOOL_ID,
    created_by: actorUserId,
    updated_by: actorUserId,
  };
  try {
    await databases.createDocument(DATABASE_ID, STUDENT_CREDITS_COLLECTION_ID, docId, payload, creditPermissions(userId));
  } catch (err) {
    if (!isUnknownCreatedByAttributeError(err)) throw err;
    const { created_by: _createdBy, updated_by: _updatedBy, ...compatPayload } = payload;
    await databases.createDocument(DATABASE_ID, STUDENT_CREDITS_COLLECTION_ID, docId, compatPayload, creditPermissions(userId));
  }
  return { created: true, hours, aircraft: sagaModel, docId };
}

function sagaFlightLegNumber(flight) {
  const parsed = Number(cleanString(flight?.perna).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function sagaFlightGroupKey(id, legs, ordinal) {
  if (ordinal <= 1) return cleanString(id);
  const firstLeg = legs[0] || {};
  const lastLeg = legs[legs.length - 1] || firstLeg;
  const raw = [
    id,
    ordinal,
    firstLeg.dataDoVoo,
    firstLeg.canacAluno,
    firstLeg.aeronave,
    firstLeg.acionamento || firstLeg.decolagem,
    lastLeg.corte || lastLeg.pouso,
    legs.length,
  ].map(cleanString).join("_");
  return `${cleanString(id)}_${crypto.createHash("sha1").update(raw).digest("hex").slice(0, 8)}`;
}

function sagaFlightStartsNewGroup(current, flight) {
  if (!current) return true;
  const firstLeg = current.legs[0] || {};
  const previousLeg = current.legs[current.legs.length - 1] || {};
  if (cleanString(firstLeg.dataDoVoo) !== cleanString(flight.dataDoVoo)) return true;
  if (cleanString(firstLeg.canacAluno) !== cleanString(flight.canacAluno)) return true;
  if (cleanString(firstLeg.aeronave) !== cleanString(flight.aeronave)) return true;
  const previousLegNumber = sagaFlightLegNumber(previousLeg);
  const nextLegNumber = sagaFlightLegNumber(flight);
  return previousLegNumber > 0 && nextLegNumber > 0 && nextLegNumber <= previousLegNumber;
}

function groupSagaFlightsById(flights) {
  const groups = [];
  const activeById = new Map();
  const ordinalsById = new Map();
  for (const flight of flights || []) {
    const id = cleanString(flight.id);
    if (!id) continue;
    let group = activeById.get(id);
    if (sagaFlightStartsNewGroup(group, flight)) {
      const ordinal = (ordinalsById.get(id) || 0) + 1;
      ordinalsById.set(id, ordinal);
      group = { id, ordinal, key: "", legs: [] };
      activeById.set(id, group);
      groups.push(group);
    }
    group.legs.push(flight);
  }
  return groups.map((group) => {
    const legs = group.legs.sort((a, b) => sagaFlightLegNumber(a) - sagaFlightLegNumber(b));
    return { ...group, key: sagaFlightGroupKey(group.id, legs, group.ordinal), legs };
  });
}

function sagaRouteFromLegs(legs) {
  const route = [];
  for (const leg of legs) {
    const origem = cleanString(leg.origem).toUpperCase();
    const destino = cleanString(leg.destino).toUpperCase();
    if (origem && route[route.length - 1] !== origem) route.push(origem);
    if (destino && route[route.length - 1] !== destino) route.push(destino);
  }
  return route.join(" - ");
}

function sagaMetaLeg(leg, legIndex, flightDate) {
  const flightTime = cleanString(leg.tempoDeVooHhmm || leg.tempoDeVooHoras);
  const serviceTime = cleanString(leg.tempoDeServicoHhmm || leg.tempoDeServicoHoras);
  const night = /not/i.test(cleanString(leg.diurnoOuNoturno));
  return {
    id: String((legIndex ?? 0) + 1),
    date: flightDate || dateBrToIso(cleanString(leg.dataDoVoo)) || "",
    role: "Instrutor de voo",
    dep: cleanString(leg.origem).toUpperCase(),
    arr: cleanString(leg.destino).toUpperCase(),
    landings: Math.max(0, Math.round(Number(cleanString(leg.numeroPousos).replace(",", ".")) || 0)),
    flightTime,
    navTime: "",
    ifrTime: /ifr/i.test(cleanString(leg.regrasDeVoo)) ? flightTime : "",
    nightTime: night ? flightTime : "",
    serviceTime,
    distance: cleanString(leg.distancia),
    engineStart: cleanString(leg.acionamento),
    takeoff: cleanString(leg.decolagem),
    landing: cleanString(leg.pouso),
    engineCut: cleanString(leg.corte),
    mission: cleanString(leg.missaoDoAluno),
    functionOnBoard: cleanString(leg.funcaoABordo),
    rules: cleanString(leg.regrasDeVoo),
    dayNight: cleanString(leg.diurnoOuNoturno),
    logbook: cleanString(leg.diarioDeBordo),
    grade: cleanString(leg.grau),
  };
}

function isSagaLoginResponse(result) {
  const status = result?.response?.status || 0;
  const location = result?.response?.headers?.get?.("location") || "";
  const html = String(result?.html || "");
  const hasLoginForm = /<form\b[^>]*action=["'][^"']*\/login["']/i.test(html) ||
    (/<input\b[^>]*name=["']email["']/i.test(html) && /<input\b[^>]*name=["']password["']/i.test(html));
  return (status >= 300 && status < 400 && /\/login(?:$|[?#])/i.test(location)) || hasLoginForm;
}

function sagaLookupSummary(group) {
  const firstLeg = group.legs[0] || {};
  const lastLeg = group.legs[group.legs.length - 1] || firstLeg;
  const totalFlightMinutes = group.legs.reduce((acc, leg) => acc + parseDurationToMinutes(leg.tempoDeVooHhmm || leg.tempoDeVooHoras), 0);
  const totalServiceMinutes = group.legs.reduce(
    (acc, leg) => acc + (sagaLegBlockMinutes(leg) ?? parseDurationToMinutes(leg.tempoDeServicoHhmm || leg.tempoDeServicoHoras)),
    0,
  );
  const landings = group.legs.reduce((acc, leg) => acc + Math.max(0, Math.round(Number(cleanString(leg.numeroPousos).replace(",", ".")) || 0)), 0);
  const flightDate = dateBrToIso(firstLeg.dataDoVoo) || "";
  return {
    id: group.id,
    date: flightDate,
    student: cleanString(firstLeg.aluno),
    studentCanac: cleanString(firstLeg.canacAluno),
    instructor: cleanString(firstLeg.instrutor),
    instructorCanac: cleanString(firstLeg.canacInstrutor),
    aircraft: cleanString(firstLeg.aeronave),
    course: cleanString(firstLeg.curso),
    mission: cleanString(firstLeg.missaoDoAluno),
    route: sagaRouteFromLegs(group.legs),
    start: cleanString(firstLeg.acionamento || firstLeg.decolagem).slice(0, 5),
    end: cleanString(lastLeg.corte || lastLeg.pouso).slice(0, 5),
    flightTime: `${String(Math.floor(totalFlightMinutes / 60)).padStart(2, "0")}:${String(totalFlightMinutes % 60).padStart(2, "0")}`,
    serviceTime: `${String(Math.floor(totalServiceMinutes / 60)).padStart(2, "0")}:${String(totalServiceMinutes % 60).padStart(2, "0")}`,
    landings,
  };
}

function sagaFormatDurationMinutes(minutes) {
  const safeMinutes = Math.max(0, Math.round(Number(minutes) || 0));
  return `${String(Math.floor(safeMinutes / 60)).padStart(2, "0")}:${String(safeMinutes % 60).padStart(2, "0")}`;
}

function sagaPdfLineKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function sagaPdfLines(text) {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
}

function sagaDecodeHtmlEntities(value) {
  const named = {
    nbsp: " ",
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    "#039": "'",
    ccedil: "ç",
    Ccedil: "Ç",
    atilde: "ã",
    Atilde: "Ã",
    aacute: "á",
    Aacute: "Á",
    agrave: "à",
    Agrave: "À",
    acirc: "â",
    Acirc: "Â",
    eacute: "é",
    Eacute: "É",
    ecirc: "ê",
    Ecirc: "Ê",
    iacute: "í",
    Iacute: "Í",
    oacute: "ó",
    Oacute: "Ó",
    ocirc: "ô",
    Ocirc: "Ô",
    otilde: "õ",
    Otilde: "Õ",
    uacute: "ú",
    Uacute: "Ú",
  };
  return String(value || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (match, entity) => {
    const key = String(entity);
    if (Object.prototype.hasOwnProperty.call(named, key)) return named[key];
    if (key.startsWith("#x")) {
      const code = Number.parseInt(key.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (key.startsWith("#")) {
      const code = Number.parseInt(key.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return match;
  });
}

function sagaTextFromDocumentHtml(html) {
  return sagaDecodeHtmlEntities(String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "\n")
    .replace(/<input\b[^>]*>/gi, (tag) => {
      const match = String(tag || "").match(/\bvalue\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const value = match ? (match[1] ?? match[2] ?? match[3] ?? "") : "";
      return value ? ` ${value} ` : " ";
    })
    .replace(/<(?:br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|section|article|header|footer|table|thead|tbody|tfoot|tr|td|th|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim());
}

function sagaPdfLineContainsLabel(line, label) {
  return sagaPdfLineKey(line).includes(sagaPdfLineKey(label));
}

function sagaPdfValueFromLabelLine(line, label) {
  const raw = String(line || "").trim();
  const labelKey = sagaPdfLineKey(label);
  const rawChars = Array.from(raw);
  for (let end = rawChars.length; end >= 0; end -= 1) {
    const prefix = rawChars.slice(0, end).join("");
    const key = sagaPdfLineKey(prefix);
    if (key === labelKey || key.endsWith(labelKey)) {
      return rawChars.slice(end).join("").replace(/^[:\s-]+/, "").trim();
    }
  }
  return raw.replace(new RegExp(`^${String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:?\\s*`, "i"), "").trim();
}

function sagaStripLeadingSectionLabels(text, labels) {
  const lines = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const labelList = Array.isArray(labels) ? labels : [labels];
  for (let guard = 0; guard < 5 && lines.length; guard += 1) {
    const first = lines[0];
    const matchedLabel = labelList.find((label) => sagaPdfLineKey(first).startsWith(sagaPdfLineKey(label)));
    if (!matchedLabel) break;
    const value = sagaPdfValueFromLabelLine(first, matchedLabel);
    if (value && sagaPdfLineKey(value) !== sagaPdfLineKey(first)) {
      lines[0] = value;
    } else {
      lines.shift();
    }
  }
  return lines.join("\n").trim();
}

function sagaPdfExtractSection(lines, label, stopLabels) {
  const startIndex = lines.findIndex((line) => sagaPdfLineContainsLabel(line, label));
  if (startIndex < 0) return "";
  const parts = [];
  const firstValue = sagaPdfValueFromLabelLine(lines[startIndex], label);
  if (firstValue) parts.push(firstValue);
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (stopLabels.some((stopLabel) => sagaPdfLineContainsLabel(line, stopLabel))) break;
    parts.push(line);
  }
  return sagaStripLeadingSectionLabels(parts.join("\n"), label);
}

function sagaSplitResultFromComments(comments) {
  const text = cleanString(comments);
  const match = text.match(/(?:^|\n)\s*Resultado\s*:\s*([\s\S]*)$/i);
  if (!match) return { commentsMd: text, result: "" };
  return {
    commentsMd: text.slice(0, match.index).trim(),
    result: cleanString(sagaTextBeforeLabels(match[1], ["ASSINATURAS"])),
  };
}

function sagaTextBeforeLabels(text, labels) {
  let out = String(text || "");
  for (const label of labels) {
    const index = sagaPdfLineKey(out).indexOf(sagaPdfLineKey(label));
    if (index < 0) continue;
    let rawIndex = 0;
    let normalized = "";
    for (const char of Array.from(out)) {
      if (sagaPdfLineKey(normalized + char).length > index) break;
      normalized += char;
      rawIndex += char.length;
    }
    out = out.slice(0, rawIndex);
  }
  return out.trim();
}

function sagaPdfNumberFromLabel(lines, labels) {
  const labelList = Array.isArray(labels) ? labels : [labels];
  for (const label of labelList) {
    const index = lines.findIndex((line) => sagaPdfLineContainsLabel(line, label));
    if (index < 0) continue;
    const candidates = [
      sagaPdfValueFromLabelLine(lines[index], label),
      lines[index + 1] || "",
    ];
    for (const candidate of candidates) {
      const match = String(candidate).match(/-?\d+(?:[.,]\d+)?/);
      if (!match) continue;
      const parsed = Number(match[0].replace(",", "."));
      if (Number.isFinite(parsed)) {
        const unitSource = `${lines[index]} ${candidate}`;
        const unit = /\bkg\b/i.test(unitSource) ? "kg" : "l";
        return { value: parsed, unit };
      }
    }
  }
  return null;
}

function sagaPdfStationNumber(lines, labels) {
  const labelList = Array.isArray(labels) ? labels : [labels];
  for (const label of labelList) {
    const index = lines.findIndex((line) => sagaPdfLineContainsLabel(line, label));
    if (index < 0) continue;
    const sameLine = sagaPdfValueFromLabelLine(lines[index], label);
    const candidates = [sameLine, lines[index + 1] || "", lines[index + 2] || ""];
    for (const candidate of candidates) {
      const match = String(candidate).match(/-?\d+(?:[.,]\d+)?/);
      if (!match) continue;
      const parsed = Number(match[0].replace(",", "."));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function sagaPdfBlock(lines, startLabel, stopLabels) {
  const startIndex = lines.findIndex((line) => sagaPdfLineContainsLabel(line, startLabel));
  if (startIndex < 0) return [];
  const out = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (stopLabels.some((stopLabel) => sagaPdfLineContainsLabel(line, stopLabel))) break;
    out.push(line);
  }
  return out;
}

function sagaPdfNumbersFromBlock(lines) {
  const matches = lines.join("\n").match(/-?\d+(?:[.,]\d+)?/g) || [];
  return matches.map((value) => Number(value.replace(",", "."))).filter((value) => Number.isFinite(value));
}

function sagaPdfDurationToMinutes(value) {
  const raw = cleanString(value).replace(/\s*h$/i, "");
  const match = raw.match(/^(\d{1,3}):(\d{2})$/);
  if (!match) return 0;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes > 59) return 0;
  return hours * 60 + minutes;
}

function sagaParsePdfLegRows(lines) {
  const startIndex = lines.findIndex((line) => sagaPdfLineKey(line) === "PERNAS" || sagaPdfLineContainsLabel(line, "PERNAS"));
  if (startIndex < 0) return { legs: [], totalNavigationTime: "00:00" };
  const stopLabels = ["DESCRICAO DO PERIGO", "DESCRICAO DO RISCO", "PARECER DO INSTRUTOR", "ASSINATURAS", "PESO E BALANCEAMENTO"];
  const block = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (stopLabels.some((label) => sagaPdfLineContainsLabel(line, label))) break;
    block.push(line);
  }

  const legs = [];
  const joined = block.join(" ");
  const rowPattern = /(\d{2}\/\d{2}\/\d{4})\s+(?:\[[^\]]+\]|[A-Z]{1,4})\s+([A-Z]{4})\s+([A-Z]{4})\s+(\d+)\s+(\d{1,3}:\d{2})h?\s+(\d{1,3}:\d{2})h?\s+(\d{1,3}:\d{2})h?\s+(\d{1,3}:\d{2})h?\s+(\d{1,3}:\d{2})h?/g;
  for (const match of joined.matchAll(rowPattern)) {
    const navMinutes = sagaPdfDurationToMinutes(match[6]);
    legs.push({
      date: match[1],
      dep: match[2],
      arr: match[3],
      landings: Number(match[4]) || 0,
      flightTime: sagaFormatDurationMinutes(sagaPdfDurationToMinutes(match[5])),
      navTime: sagaFormatDurationMinutes(navMinutes),
      ifrTime: sagaFormatDurationMinutes(sagaPdfDurationToMinutes(match[7])),
      nightTime: sagaFormatDurationMinutes(sagaPdfDurationToMinutes(match[8])),
      serviceTime: sagaFormatDurationMinutes(sagaPdfDurationToMinutes(match[9])),
    });
  }

  const totalNavigationMinutes = legs.reduce((acc, leg) => acc + sagaPdfDurationToMinutes(leg.navTime), 0);
  return { legs, totalNavigationTime: sagaFormatDurationMinutes(totalNavigationMinutes) };
}

function sagaParseExerciseGrade(value) {
  const match = cleanString(value).match(/(?:^|\s)(NO|[1-4])(?:\s*\((?:SA|IN|NO)\))?(?=\s|$)/);
  if (!match) return null;
  const grade = String(match[1] || "").toUpperCase();
  return grade === "NO" ? "NO" : grade;
}

function sagaExerciseTitleKey(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function dedupeSagaExercises(exercises) {
  const byTitle = new Map();
  for (const exercise of Array.isArray(exercises) ? exercises : []) {
    const title = cleanString(exercise?.title);
    const key = sagaExerciseTitleKey(title);
    if (!key) continue;
    const current = byTitle.get(key);
    const next = {
      ...exercise,
      title,
      grade: ["NO", "1", "2", "3", "4"].includes(cleanString(exercise?.grade))
        ? cleanString(exercise.grade)
        : "NO",
    };
    if (!current || (current.grade === "NO" && next.grade !== "NO")) byTitle.set(key, next);
  }
  return Array.from(byTitle.values());
}

function sagaParseExerciseRows(lines) {
  const headerIndex = lines.findIndex((line, index) => {
    const joined = [line, lines[index + 1], lines[index + 2]].filter(Boolean).join(" ");
    return sagaPdfLineContainsLabel(joined, "EXERCICIO") &&
      sagaPdfLineContainsLabel(joined, "GRAU");
  });
  if (headerIndex < 0) return [];
  const rows = [];
  const stopLabels = ["COMENTARIOS", "PESO E BALANCEAMENTO", "PERNAS", "ASSINATURAS", "NOTA DO BRIEFING"];
  const dataLines = [];
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (stopLabels.some((label) => sagaPdfLineContainsLabel(line, label))) break;
    if (sagaPdfLineContainsLabel(line, "EXERCICIO") || sagaPdfLineKey(line) === "GRAU" || sagaPdfLineContainsLabel(line, "PROFICIENCIA ACEITAVEL")) continue;
    dataLines.push(line);
  }

  for (let index = 0; index < dataLines.length; index += 1) {
    const line = dataLines[index];
    const inlineGrade = line.match(/(?:^|\s)(NO|[1-4])(?:\s*\((?:SA|IN|NO)\))?(?=\s|$)/);
    if (inlineGrade) {
      const title = line.slice(0, inlineGrade.index).trim();
      const grade = sagaParseExerciseGrade(inlineGrade[0]);
      if (title && grade && !sagaPdfLineContainsLabel(title, "GRAUS")) rows.push({ title, grade });
      continue;
    }
    const nextGrade = sagaParseExerciseGrade(dataLines[index + 1] || "");
    if (nextGrade && line.trim()) {
      rows.push({ title: line.trim(), grade: nextGrade });
      index += 1;
    }
  }

  return dedupeSagaExercises(rows);
}

function sagaParseFlightRecordPdfText(text) {
  const lines = sagaPdfLines(sagaDecodeHtmlEntities(text));
  const sectionStops = [
    "OBJETIVO DA LICAO",
    "NOTA DO BRIEFING",
    "COMENTARIOS",
    "PESO E BALANCEAMENTO",
    "OCUPANTES",
    "BAGAGEM",
    "COMBUSTIVEL",
    "DISCREPANCIAS",
    "OCORRENCIAS",
  ];
  const briefingStops = [...sectionStops, "GRAUS: SATISFATORIO", "GRAUS: SATISFATÓRIO"];
  const rawComments = sagaPdfExtractSection(lines, "COMENTARIOS", ["PERNAS", "DATA", "PESO E BALANCEAMENTO", "DISCREPANCIAS", "OCORRENCIAS"]);
  const commentsResult = sagaSplitResultFromComments(rawComments);
  const dangerMd = sagaPdfExtractSection(lines, "DESCRICAO DO PERIGO", ["DESCRICAO DO RISCO", "DESCRICAO DO GERENCIAMENTO DO RISCO", "PARECER DO INSTRUTOR", "ASSINATURAS"]);
  const riskMd = sagaPdfExtractSection(lines, "DESCRICAO DO RISCO", ["DESCRICAO DO GERENCIAMENTO DO RISCO", "PARECER DO INSTRUTOR", "ASSINATURAS"]);
  const managementMd = sagaPdfExtractSection(lines, "DESCRICAO DO GERENCIAMENTO DO RISCO", ["PARECER DO INSTRUTOR", "ASSINATURAS"]);
  const resultFromLine = commentsResult.result || sagaTextBeforeLabels(
    sagaPdfExtractSection(lines, "RESULTADO", ["PERNAS", "DATA", "PESO E BALANCEAMENTO", "OCUPANTES", "BAGAGEM", "COMBUSTIVEL", "DISCREPANCIAS", "OCORRENCIAS"]),
    ["ASSINATURAS"],
  );
  const occupantsKg = sagaPdfStationNumber(lines, ["OCUPANTES"]);
  const personsOnBoard = sagaPdfNumberFromLabel(lines, ["PESSOAS A BORDO", "PESSOAS À BORDO"]);
  const baggageKg = sagaPdfStationNumber(lines, ["BAGAGEM"]);
  const rampFuelKg = sagaPdfStationNumber(lines, ["COMBUSTIVEL TOTAL A BORDO", "COMBUSTIVEL (TOTAL A BORDO)", "COMBUSTIVEL TOTAL"]);
  const taxiFuel = sagaPdfNumberFromLabel(lines, ["COMBUSTIVEL TAXI", "COMBUSTIVEL TÁXI"]);
  const tripFuel = sagaPdfNumberFromLabel(lines, ["COMBUSTIVEL ATE POUSO", "COMBUSTIVEL ATÉ POUSO", "COMBUSTIVEL POUSO"]);
  const taxiFuelKg = sagaPdfStationNumber(lines, ["COMBUSTIVEL (TAXI)", "COMBUSTIVEL TAXI"]);
  const tripFuelKg = sagaPdfStationNumber(lines, ["COMBUSTIVEL ETAPA", "COMBUSTIVEL (ETAPA)"]);
  const likelyPersonsFromOccupants = occupantsKg && occupantsKg > 0 && occupantsKg <= 10 ? Math.round(occupantsKg) : null;
  const wbFallback = sagaPdfNumbersFromBlock(sagaPdfBlock(lines, "PESO E BALANCEAMENTO", ["COMENTARIOS", "COMENTÃRIOS", "PERNAS", "ASSINATURAS"]));

  const pdfLegRows = sagaParsePdfLegRows(lines);

  return {
    objectiveMd: sagaPdfExtractSection(lines, "OBJETIVO DA LICAO", sectionStops),
    briefingMd: sagaPdfExtractSection(lines, "NOTA DO BRIEFING", briefingStops),
    commentsMd: commentsResult.commentsMd,
    dangerMd,
    riskMd,
    managementMd,
    result: resultFromLine,
    exercises: sagaParseExerciseRows(lines),
    legs: pdfLegRows.legs,
    totalNavigationTime: pdfLegRows.totalNavigationTime,
    weightBalance: {
      personsOnBoard: personsOnBoard?.value ?? likelyPersonsFromOccupants,
      occupantsWeightKg: occupantsKg ?? wbFallback[3] ?? null,
      baggageWeightKg: baggageKg ?? wbFallback[6] ?? null,
      rampFuel: rampFuelKg != null ? { value: rampFuelKg, unit: "kg" } : wbFallback[9] != null ? { value: wbFallback[9], unit: "kg" } : null,
      taxiFuel: taxiFuelKg != null ? { value: taxiFuelKg, unit: "kg" } : wbFallback[15] != null ? { value: wbFallback[15], unit: "kg" } : null,
      tripFuel: tripFuelKg != null ? { value: tripFuelKg, unit: "kg" } : wbFallback[21] != null ? { value: wbFallback[21], unit: "kg" } : null,
    },
  };
}

function sagaRecordHasExtractedData(record) {
  const wb = record?.weightBalance || {};
  return Boolean(
    cleanString(record?.objectiveMd) ||
      cleanString(record?.briefingMd) ||
      cleanString(record?.commentsMd) ||
      cleanString(record?.dangerMd) ||
      cleanString(record?.riskMd) ||
      cleanString(record?.managementMd) ||
      cleanString(record?.result) ||
      cleanString(record?.totalNavigationTime) ||
      (Array.isArray(record?.legs) && record.legs.length > 0) ||
      (Array.isArray(record?.exercises) && record.exercises.length > 0) ||
      wb.personsOnBoard != null ||
      wb.occupantsWeightKg != null ||
      wb.baggageWeightKg != null ||
      wb.rampFuel?.value != null ||
      wb.taxiFuel?.value != null ||
      wb.tripFuel?.value != null,
  );
}

async function sagaFetchFlightRecordPdf(flightId, cookieJar, logs, statuses, locations, htmlLengths) {
  const path = `/flight_records/pdf/${encodeURIComponent(flightId)}`;
  logs.push(`GET ${path}: consultando PDF da ficha SAGA.`);
  let url = `${SAGA_BASE_URL}${path}`;
  let response = null;
  let bodyBuffer = null;
  let contentType = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const headers = {
      accept: "application/pdf,text/html;q=0.9,*/*;q=0.8",
      referer: attempt === 0 ? `${SAGA_BASE_URL}/flight_records/${encodeURIComponent(flightId)}` : `${SAGA_BASE_URL}${path}`,
    };
    const cookie = sagaCookieHeader(cookieJar);
    if (cookie) headers.cookie = cookie;
    response = await fetch(url, { method: "GET", headers, redirect: "manual" });
    sagaMergeCookies(cookieJar, response.headers);
    contentType = response.headers.get("content-type") || "";
    const location = response.headers.get("location") || "";
    statuses.flightRecordPdf = response.status;
    locations.flightRecordPdf = location || null;

    if (response.status >= 300 && response.status < 400 && location) {
      const nextUrl = new URL(location, url).toString();
      logs.push(`GET ${path}: redirect ${response.status} para ${nextUrl}.`);
      if (/\/login(?:$|[?#])/i.test(nextUrl)) {
        return { ok: false, url: `${SAGA_BASE_URL}${path}`, message: "Sessao SAGA expirada ao consultar o PDF da ficha." };
      }
      url = nextUrl;
      continue;
    }

    bodyBuffer = Buffer.from(await response.arrayBuffer());
    break;
  }

  if (!response || !bodyBuffer) {
    return { ok: false, url: `${SAGA_BASE_URL}${path}`, message: "PDF da ficha nao foi retornado pelo SAGA." };
  }

  htmlLengths.flightRecordPdf = bodyBuffer.length;
  const looksLikePdf = bodyBuffer.subarray(0, 5).toString("utf8") === "%PDF-";
  if (/application\/pdf/i.test(contentType) || looksLikePdf) {
    const buffer = bodyBuffer;
    const parsed = await pdfParse(buffer);
    logs.push(`GET ${path}: PDF lido (${buffer.length} bytes, ${cleanString(parsed.text).length} caracteres de texto, content-type ${contentType || "sem content-type"}).`);
    return {
      ok: true,
      url: `${SAGA_BASE_URL}${path}`,
      ...sagaParseFlightRecordPdfText(parsed.text || ""),
    };
  }

  const html = bodyBuffer.toString("utf8");
  if (isSagaLoginResponse({ response, html })) {
    logs.push(`GET ${path}: SAGA retornou login ao consultar o PDF.`);
    return { ok: false, url: `${SAGA_BASE_URL}${path}`, message: "Sessao SAGA expirada ao consultar o PDF da ficha." };
  }
  if (/text\/html/i.test(contentType) || /<!doctype html|<html\b/i.test(html)) {
    const parsedFromHtml = sagaParseFlightRecordPdfText(sagaTextFromDocumentHtml(html));
    if (sagaRecordHasExtractedData(parsedFromHtml)) {
      logs.push(`GET ${path}: ficha veio em HTML; dados extraidos do HTML (${bodyBuffer.length} bytes).`);
      return {
        ok: true,
        url: `${SAGA_BASE_URL}${path}`,
        ...parsedFromHtml,
      };
    }
  }
  logs.push(`GET ${path}: resposta nao-PDF (status ${response.status}, content-type ${contentType || "sem content-type"}, ${bodyBuffer.length} bytes).`);
  return {
    ok: false,
    url: `${SAGA_BASE_URL}${path}`,
    message: `PDF da ficha nao foi retornado pelo SAGA (status ${response.status}, ${contentType || "sem content-type"}).`,
  };
}

function sagaApplyPdfNavigationToMetaLegs(metaLegs, pdfRecord) {
  if (!pdfRecord?.ok) return metaLegs.map((leg) => ({ ...leg, navTime: leg.navTime || "00:00" }));
  const pdfLegs = Array.isArray(pdfRecord.legs) ? pdfRecord.legs : [];
  if (pdfLegs.length === metaLegs.length) {
    return metaLegs.map((leg, index) => ({ ...leg, navTime: cleanString(pdfLegs[index]?.navTime) || "00:00" }));
  }
  const totalNavigationTime = cleanString(pdfRecord.totalNavigationTime);
  if (totalNavigationTime) {
    return metaLegs.map((leg, index) => ({ ...leg, navTime: index === 0 ? totalNavigationTime : "00:00" }));
  }
  return metaLegs.map((leg) => ({ ...leg, navTime: leg.navTime || "00:00" }));
}

async function sagaLookupFlight(payload = {}) {
  const flightId = cleanString(payload.sagaFlightId || payload.flightId || payload.id);
  if (!flightId) throw Object.assign(new Error("Informe o ID do voo no SAGA."), { status: 400 });
  const logs = [];
  const statuses = {};
  const locations = {};
  const htmlLengths = {};

  // Sessão + mapping em paralelo (2 leituras de DB → 1 round-trip)
  const [session, mapping] = await Promise.all([
    loadSagaAuthSession(),
    loadSagaImportMapping(),
  ]);
  const { cookieJar } = session;

  const range = sagaDateRangeMonths(24);
  const filteredPath = `/reports/operations?start_date=${range.startDate}&end_date=${range.endDate}&id=${encodeURIComponent(flightId)}`;
  logs.push(`GET /reports/operations: buscando voo SAGA ${flightId} usando sessao salva do admin.`);

  // Inicia o PDF em paralelo com a busca de operacoes; download e parse sao a parte mais lenta.
  const pdfPromise = sagaFetchFlightRecordPdf(flightId, cookieJar, logs, statuses, locations, htmlLengths)
    .catch((err) => {
      logs.push(`PDF da ficha SAGA ${flightId}: ${err?.message || err}.`);
      return {
        ok: false,
        url: `${SAGA_BASE_URL}/flight_records/pdf/${encodeURIComponent(flightId)}`,
        message: "Nao foi possivel consultar o PDF da ficha.",
      };
    });

  let operations = await sagaFetch(
    filteredPath,
    {
      method: "GET",
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        referer: `${SAGA_BASE_URL}/reports/operations`,
      },
    },
    cookieJar,
  );
  statuses.operations = operations.response.status;
  locations.operations = operations.response.headers.get("location") || null;
  htmlLengths.operations = operations.html.length;
  if (isSagaLoginResponse(operations)) {
    throw Object.assign(new Error("Sessao SAGA expirada. Atualize o login em Admin > Import antes de consultar pela ficha."), { status: 401 });
  }

  let parsed = translateSagaFlightRows(operations.html);
  let mappedRows = applySagaFlightColumnMap(parsed.rows, mapping.flightColumnMap);
  let group = groupSagaFlightsById(mappedRows).find((item) => cleanString(item.id) === flightId);
  if (!group) {
    logs.push("GET /reports/operations: filtro por ID nao retornou a linha esperada; buscando no periodo completo e filtrando localmente.");
    const fallbackPath = `/reports/operations?start_date=${range.startDate}&end_date=${range.endDate}`;
    operations = await sagaFetch(
      fallbackPath,
      {
        method: "GET",
        headers: {
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          referer: `${SAGA_BASE_URL}/reports/operations`,
        },
      },
      cookieJar,
    );
    statuses.operationsFallback = operations.response.status;
    locations.operationsFallback = operations.response.headers.get("location") || null;
    htmlLengths.operationsFallback = operations.html.length;
    if (isSagaLoginResponse(operations)) {
      throw Object.assign(new Error("Sessao SAGA expirada. Atualize o login em Admin > Import antes de consultar pela ficha."), { status: 401 });
    }
    parsed = translateSagaFlightRows(operations.html);
    mappedRows = applySagaFlightColumnMap(parsed.rows, mapping.flightColumnMap);
    group = groupSagaFlightsById(mappedRows).find((item) => cleanString(item.id) === flightId);
  }

  // Aguarda PDF e salva sessao em paralelo; o PDF provavelmente ja terminou enquanto buscava operacoes.
  const [pdfRecord] = await Promise.all([
    pdfPromise,
    saveSagaAuthSession(cookieJar, session.loginEmail).catch(() => null),
  ]);

  if (!group) {
    logs.push(`Voo SAGA ${flightId} nao encontrado no periodo ${range.startDate} a ${range.endDate}.`);
    return { ok: false, flight: null, message: "Voo SAGA nao encontrado nos ultimos 24 meses.", statuses, locations, htmlLengths, logs };
  }

  const firstLeg = group.legs[0] || {};
  const flightDate = dateBrToIso(firstLeg.dataDoVoo) || "";
  const metaLegs = group.legs.map((leg, legIndex) => sagaMetaLeg(leg, legIndex, flightDate));
  const metaLegsWithPdfNavigation = sagaApplyPdfNavigationToMetaLegs(metaLegs, pdfRecord);
  logs.push(`Voo SAGA ${flightId}: ${group.legs.length} perna(s) encontradas.`);
  return {
    ok: true,
    flight: {
      id: group.id,
      summary: sagaLookupSummary(group),
      legs: group.legs,
      metaLegs: metaLegsWithPdfNavigation,
      pdfRecord,
      headers: parsed.headers,
    },
    statuses,
    locations,
    htmlLengths,
    logs,
  };
}

function sagaFlightPermissions(studentUserId, instructorUserId) {
  const perms = [
    sdk.Permission.read(sdk.Role.users()),
    sdk.Permission.read(sdk.Role.label("admin")),
    sdk.Permission.update(sdk.Role.label("admin")),
    sdk.Permission.delete(sdk.Role.label("admin")),
    sdk.Permission.read(sdk.Role.label("instrutor")),
    sdk.Permission.update(sdk.Role.label("instrutor")),
  ];
  if (studentUserId) {
    perms.push(sdk.Permission.read(sdk.Role.user(studentUserId)));
    perms.push(sdk.Permission.update(sdk.Role.user(studentUserId)));
  }
  if (instructorUserId) {
    perms.push(sdk.Permission.read(sdk.Role.user(instructorUserId)));
    perms.push(sdk.Permission.update(sdk.Role.user(instructorUserId)));
  }
  return Array.from(new Set(perms));
}

function ghostFlightPermissions(instructorUserId) {
  const perms = [
    sdk.Permission.read(sdk.Role.label("admin")),
    sdk.Permission.update(sdk.Role.label("admin")),
    sdk.Permission.delete(sdk.Role.label("admin")),
    sdk.Permission.read(sdk.Role.label("instrutor")),
    sdk.Permission.update(sdk.Role.label("instrutor")),
  ];
  if (instructorUserId) {
    perms.push(sdk.Permission.read(sdk.Role.user(instructorUserId)));
    perms.push(sdk.Permission.update(sdk.Role.user(instructorUserId)));
  }
  return Array.from(new Set(perms));
}

function flightVideoPermissions(videoDoc, flightDoc) {
  const uploadedBy = cleanString(videoDoc?.uploaded_by);
  const isGhost = isGhostFlightDoc(flightDoc);
  const perms = isGhost
    ? [
        sdk.Permission.read(sdk.Role.label("admin")),
        sdk.Permission.update(sdk.Role.label("admin")),
        sdk.Permission.delete(sdk.Role.label("admin")),
        sdk.Permission.read(sdk.Role.label("instrutor")),
      ]
    : [
        sdk.Permission.read(sdk.Role.users()),
        sdk.Permission.read(sdk.Role.label("admin")),
        sdk.Permission.update(sdk.Role.label("admin")),
        sdk.Permission.delete(sdk.Role.label("admin")),
        sdk.Permission.read(sdk.Role.label("instrutor")),
      ];
  if (uploadedBy) {
    perms.push(sdk.Permission.read(sdk.Role.user(uploadedBy)));
    perms.push(sdk.Permission.update(sdk.Role.user(uploadedBy)));
    perms.push(sdk.Permission.delete(sdk.Role.user(uploadedBy)));
  }
  return Array.from(new Set(perms));
}

function isGhostFlightSource(sourceFilename) {
  return cleanString(sourceFilename).startsWith(GHOST_FLIGHT_SOURCE_PREFIX);
}

function isGhostFlightDoc(doc) {
  return isGhostFlightSource(doc?.source_filename) || cleanString(doc?.name).toLowerCase().startsWith("voo temporario");
}

function sagaImportZuluToLocalClock(raw) {
  const match = cleanString(raw).match(/^(\d{2}):(\d{2})$/);
  if (!match) return cleanString(raw);
  const total = (Number(match[1]) * 60 + Number(match[2]) - 180 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function sagaImportNormalizeDuration(raw) {
  const digits = cleanString(raw).replace(/\D/g, "").slice(0, 4);
  if (!digits) return "";
  if (digits.length <= 2) return digits;
  const hh = Math.max(0, Number(digits.slice(0, 2)) || 0);
  if (digits.length === 3) return `${String(hh).padStart(2, "0")}:${digits[2]}`;
  const mm = Math.min(59, Math.max(0, Number(digits.slice(2, 4)) || 0));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function sagaImportSanitizeAerodrome(value) {
  const code = cleanString(value).toUpperCase();
  return code === "---" ? "" : code;
}

function sagaImportInstructorOutcome(text) {
  const normalized = cleanString(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(reprovado|reprovada|insatisfatorio|inapto|nao aprovado|nao aprovada)\b/.test(normalized)) return "failed";
  if (/\b(aprovado|aprovada|satisfatorio|apto|apta)\b/.test(normalized)) return "approved";
  return "";
}

function sagaMissionCode(value) {
  const normalized = cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  const pieces = normalized.split(/\s+[-–—]\s+/).reverse();
  for (const piece of pieces) {
    const match = piece.match(/\b([A-Z]{1,5})\s*[- ]?\s*(\d{1,3}[A-Z]?)\b/);
    if (match) return `${match[1]}${match[2]}`;
  }
  const match = normalized.match(/\b([A-Z]{1,5})\s*[- ]?\s*(\d{1,3}[A-Z]?)\b/);
  return match ? `${match[1]}${match[2]}` : "";
}

function sagaMissionKey(value) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function sagaMissionMatchScore(targetCode, mission) {
  const normalizedTarget = sagaMissionKey(targetCode);
  if (!normalizedTarget) return 0;
  const values = [
    mission?.code,
    mission?.name,
    mission?.title,
    `${mission?.type || ""}${mission?.order || ""}`,
  ]
    .map((value) => cleanString(value))
    .filter(Boolean);
  let best = 0;
  for (const value of values) {
    const key = sagaMissionKey(value);
    if (!key) continue;
    if (key === normalizedTarget) return 1;
    const extracted = sagaMissionKey(sagaMissionCode(value));
    if (extracted && extracted === normalizedTarget) return 0.98;
    const contains = key.includes(normalizedTarget) || normalizedTarget.includes(key);
    if (contains) best = Math.max(best, 0.85);
    const prefix = key.startsWith(normalizedTarget) || normalizedTarget.startsWith(key);
    if (prefix) best = Math.max(best, 0.8);
  }
  return best;
}

function sagaMissionLookupKey(rawMission) {
  const raw = cleanString(rawMission);
  if (!raw) return "";
  const code = sagaMissionCode(raw);
  return sagaMissionKey(code || raw);
}

function sagaMissionCanonicalKey(value) {
  const key = sagaMissionKey(value);
  const match = key.match(/^([A-Z]{1,8})0*(\d+)([A-Z]?)$/);
  if (!match) return key;
  return `${match[1]}${Number(match[2])}${match[3]}`;
}

function sagaMissionCodeV2(value) {
  const normalized = cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  const pieces = normalized.split(/\s*[-\u2013\u2014:|/]\s*/).reverse();
  for (const piece of pieces) {
    const match = piece.match(/\b([A-Z]{1,8})\s*[- ]?\s*(\d{1,3}[A-Z]?)\b/);
    if (match) return `${match[1]}${match[2]}`;
  }
  const match = normalized.match(/\b([A-Z]{1,8})\s*[- ]?\s*(\d{1,3}[A-Z]?)\b/);
  return match ? `${match[1]}${match[2]}` : "";
}

function sagaMissionLookupKeyV2(rawMission) {
  const raw = cleanString(rawMission);
  if (!raw) return "";
  return sagaMissionKey(sagaMissionCodeV2(raw) || raw);
}

function sagaMissionScopedKey(trainingTrackId, lookupKey) {
  const trackId = cleanString(trainingTrackId);
  const missionKey = sagaMissionKey(lookupKey);
  return trackId && missionKey ? `${trackId}::${missionKey}` : "";
}

function sagaMissionTargetKeys(rawMission) {
  const raw = cleanString(rawMission);
  const values = [raw, sagaMissionCodeV2(raw), ...raw.split(/\s*[-\u2013\u2014:|/]\s*/)];
  return Array.from(new Set(values.flatMap((value) => [
    sagaMissionKey(value),
    sagaMissionCanonicalKey(value),
  ].filter(Boolean))));
}

function sagaMissionAliasesV2(mission) {
  const values = [
    mission?.id,
    mission?.code,
    mission?.name,
    mission?.title,
    `${mission?.type || ""}${mission?.order || ""}`,
  ];
  return Array.from(new Set(values.flatMap((value) => {
    const cleanValue = cleanString(value);
    if (!cleanValue) return [];
    const code = sagaMissionCodeV2(cleanValue);
    return [
      sagaMissionKey(cleanValue),
      sagaMissionCanonicalKey(cleanValue),
      sagaMissionKey(code),
      sagaMissionCanonicalKey(code),
    ].filter(Boolean);
  })));
}

function sagaMissionMatchScoreV2(rawMission, mission) {
  const targets = sagaMissionTargetKeys(rawMission);
  if (!targets.length) return 0;
  const aliases = sagaMissionAliasesV2(mission);
  if (targets.some((target) => aliases.includes(target))) return 1;
  let best = 0;
  for (const target of targets) {
    for (const alias of aliases) {
      if (target.length < 4 || alias.length < 4) continue;
      if (alias.includes(target) || target.includes(alias)) best = Math.max(best, 0.88);
      if (alias.startsWith(target) || target.startsWith(alias)) best = Math.max(best, 0.84);
    }
  }
  return best;
}

function sagaResolveTrainingMissionFromId(track, missionId, rawMission, missionCode) {
  if (!track || !missionId) return null;
  for (const stage of Array.isArray(track.stages) ? track.stages : []) {
    for (const mission of Array.isArray(stage?.missions) ? stage.missions : []) {
      if (cleanString(mission.id) !== cleanString(missionId)) continue;
      return {
        trackId: cleanString(track.id),
        stageId: cleanString(stage.id) || null,
        missionId: cleanString(mission.id) || null,
        snapshot: {
          source: "saga",
          trackId: cleanString(track.id),
          trackName: cleanString(track.name),
          stageId: cleanString(stage.id) || null,
          stageName: cleanString(stage.name) || null,
          missionId: cleanString(mission.id) || null,
          missionName: cleanString(mission.name || mission.title) || cleanString(rawMission),
          missionCode: missionCode || sagaMissionCode(rawMission) || null,
          rawMission: cleanString(rawMission) || null,
          missionType: cleanString(mission.type) || null,
          durationMinutes: Number(mission.durationMinutes) || null,
          maneuvers: Array.isArray(mission.maneuvers) ? mission.maneuvers : [],
          maneuverSectionIds: Array.isArray(mission.maneuverSectionIds) ? mission.maneuverSectionIds : [],
          missionMatchScore: 1,
          mappedManually: true,
        },
      };
    }
  }
  return null;
}

function trainingMissionTypeLabel(type) {
  const normalized = cleanString(type).toUpperCase();
  if (normalized === "DC") return "Duplo comando";
  if (normalized === "SL") return "Solo";
  if (normalized === "PIC") return "Piloto em comando";
  return normalized;
}

function formatMissionDurationMinutes(minutes) {
  const value = Math.max(0, Math.round(Number(minutes) || 0));
  if (value <= 0) return "";
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  if (hours === 0) return `${mins}min`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h${String(mins).padStart(2, "0")}min`;
}

function formatSagaMissionOptionLabel(parts = {}) {
  const type = cleanString(parts.type).toUpperCase();
  const order = cleanString(parts.order);
  const name = cleanString(parts.name || parts.title);
  const stageName = cleanString(parts.stageName);
  const code = type && order ? `${type}${order}` : "";
  const meta = [trainingMissionTypeLabel(type), formatMissionDurationMinutes(parts.durationMinutes)]
    .filter(Boolean)
    .join(" · ");
  return [code, name, meta, stageName].filter(Boolean).join(" — ");
}

function sagaMissionOptionsForTrack(catalogs, trainingTrackId) {
  const trackId = cleanString(trainingTrackId);
  const track = (catalogs?.trainingTracks || []).find((row) => cleanString(row.id) === trackId);
  if (!track || !Array.isArray(track.stages)) return [];
  const options = [];
  for (const stage of track.stages) {
    const stageName = cleanString(stage?.name);
    const missions = Array.isArray(stage?.missions) ? stage.missions : [];
    for (const mission of missions) {
      const id = cleanString(mission?.id);
      if (!id) continue;
      options.push({
        value: id,
        label: formatSagaMissionOptionLabel({
          type: mission?.type,
          order: mission?.order,
          name: mission?.name,
          title: mission?.title,
          durationMinutes: mission?.durationMinutes,
          stageName,
        }),
      });
    }
  }
  return options;
}

function sagaAllMissionOptions(catalogs) {
  const options = [];
  for (const track of catalogs?.trainingTracks || []) {
    for (const option of sagaMissionOptionsForTrack(catalogs, track.id)) {
      options.push({
        value: option.value,
        label: `${cleanString(track.name)}: ${option.label}`,
      });
    }
  }
  return options;
}

function sagaFlightNeedsMissionMapping(group, mapping, catalogs) {
  const firstLeg = group?.legs?.[0] || {};
  const rawMission = cleanString(firstLeg.missaoDoAluno);
  if (!rawMission) return false;
  const sagaCourse = cleanString(firstLeg.curso);
  const trainingTrackId = cleanString(mapping?.courseBySaga?.[sagaCourse]);
  if (!trainingTrackId) return false;
  const resolved = sagaResolveTrainingMission(trainingTrackId, catalogs, rawMission, mapping?.missionBySaga);
  return !cleanString(resolved.missionId);
}

function sagaResolveTrainingMission(trainingTrackId, catalogs, rawMission, missionBySaga = {}) {
  const track = (catalogs?.trainingTracks || []).find((item) => cleanString(item.id) === cleanString(trainingTrackId));
  const missionCode = sagaMissionCodeV2(rawMission);
  const lookupKey = sagaMissionLookupKeyV2(rawMission);
  const scopedLookupKey = sagaMissionScopedKey(trainingTrackId, lookupKey);
  const mappedMissionId = cleanString(
    missionBySaga?.[scopedLookupKey] ||
      missionBySaga?.[lookupKey] ||
      missionBySaga?.[sagaMissionKey(rawMission)] ||
      missionBySaga?.[cleanString(rawMission)],
  );
  if (track && mappedMissionId) {
    const mapped = sagaResolveTrainingMissionFromId(track, mappedMissionId, rawMission, missionCode);
    if (mapped) return mapped;
  }
  if (!track || !cleanString(rawMission)) {
    return {
      trackId: cleanString(trainingTrackId) || null,
      stageId: null,
      missionId: null,
      snapshot: {
        source: "saga",
        trackId: cleanString(trainingTrackId) || null,
        rawMission: cleanString(rawMission) || null,
        missionCode: missionCode || null,
      },
    };
  }
  const candidates = [];
  for (const stage of Array.isArray(track.stages) ? track.stages : []) {
    for (const mission of Array.isArray(stage?.missions) ? stage.missions : []) {
      const score = sagaMissionMatchScoreV2(rawMission, mission);
      if (score >= 0.84) candidates.push({ stage, mission, score });
    }
  }
  candidates.sort((left, right) => right.score - left.score);
  const bestCandidate = candidates[0] || null;
  const ambiguous = Boolean(
    bestCandidate &&
    candidates[1] &&
    candidates[1].score === bestCandidate.score &&
    cleanString(candidates[1].mission?.id) !== cleanString(bestCandidate.mission?.id),
  );
  if (bestCandidate && !ambiguous) {
      return {
        trackId: cleanString(track.id),
        stageId: cleanString(bestCandidate.stage.id) || null,
        missionId: cleanString(bestCandidate.mission.id) || null,
        snapshot: {
          source: "saga",
          trackId: cleanString(track.id),
          trackName: cleanString(track.name),
          stageId: cleanString(bestCandidate.stage.id) || null,
          stageName: cleanString(bestCandidate.stage.name) || null,
          missionId: cleanString(bestCandidate.mission.id) || null,
          missionName: cleanString(bestCandidate.mission.name || bestCandidate.mission.title) || cleanString(rawMission),
          missionCode,
          rawMission: cleanString(rawMission) || null,
          missionType: cleanString(bestCandidate.mission.type) || null,
          durationMinutes: Number(bestCandidate.mission.durationMinutes) || null,
          maneuvers: Array.isArray(bestCandidate.mission.maneuvers) ? bestCandidate.mission.maneuvers : [],
          maneuverSectionIds: Array.isArray(bestCandidate.mission.maneuverSectionIds) ? bestCandidate.mission.maneuverSectionIds : [],
          missionMatchScore: bestCandidate.score,
        },
      };
  }
  return {
    trackId: cleanString(track.id),
    stageId: null,
    missionId: null,
    snapshot: {
      source: "saga",
      trackId: cleanString(track.id),
      trackName: cleanString(track.name),
      rawMission: cleanString(rawMission) || null,
      missionCode,
    },
  };
}

async function sagaRunConcurrent(items, limit, worker) {
  const safeLimit = Math.max(1, Math.min(Math.round(Number(limit) || 1), 8));
  const results = new Array(items.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(safeLimit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

function sagaImportFuelInput(input) {
  if (!input || typeof input.value !== "number" || !Number.isFinite(input.value)) {
    return { value: null, unit: "l", weightKg: null };
  }
  const unit = input.unit === "kg" ? "kg" : "l";
  return {
    value: input.value,
    unit,
    weightKg: unit === "kg" ? input.value : Number((input.value * 0.72).toFixed(2)),
  };
}

function sagaImportWeightBalanceMeta(pdfRecord, aircraftIdent) {
  const wb = pdfRecord?.weightBalance;
  if (!wb) return null;
  return {
    version: "WEIGHT_BALANCE_V1",
    aircraft: {
      registration: cleanString(aircraftIdent),
      emptyWeightKg: null,
      emptyArmMm: null,
      occupantsArmMm: null,
      occupantsMaxKg: null,
      baggageArmMm: null,
      baggageMaxKg: null,
      fuelArmMm: null,
      fuelMaxKg: null,
      fuelDensityKgPerL: 0.72,
      maxWeightKg: null,
      armMinMm: null,
      armMaxMm: null,
    },
    inputs: {
      personsOnBoard: typeof wb.personsOnBoard === "number" ? wb.personsOnBoard : null,
      occupantsWeightKg: typeof wb.occupantsWeightKg === "number" ? wb.occupantsWeightKg : null,
      baggageWeightKg: typeof wb.baggageWeightKg === "number" ? wb.baggageWeightKg : null,
      rampFuel: sagaImportFuelInput(wb.rampFuel),
      taxiFuel: sagaImportFuelInput(wb.taxiFuel),
      tripFuel: sagaImportFuelInput(wb.tripFuel),
    },
    results: {
      stationIssues: ["Dados da aeronave indisponiveis na importacao SAGA; calculo de envelope pendente."],
      points: [
        { id: "ramp", label: "Rampa", weightKg: null, momentKgMm: null, armMm: null, inEnvelope: null, issues: ["Dados insuficientes para calcular."] },
        { id: "takeoff", label: "Decolagem", weightKg: null, momentKgMm: null, armMm: null, inEnvelope: null, issues: ["Dados insuficientes para calcular."] },
        { id: "landing", label: "Pouso", weightKg: null, momentKgMm: null, armMm: null, inEnvelope: null, issues: ["Dados insuficientes para calcular."] },
      ],
      isComplete: false,
      isWithinLimits: false,
    },
    updatedAt: nowIso(),
  };
}

function sagaImportMetaLegFromLookup(leg, summary, fallbackDate) {
  return {
    id: crypto.randomUUID(),
    date: cleanString(leg.date || summary?.date || fallbackDate),
    role: cleanString(leg.role) || "Instrutor de voo",
    studentRole: "",
    instructorRole: cleanString(leg.role) || "Instrutor de voo",
    dep: sagaImportSanitizeAerodrome(leg.dep),
    arr: sagaImportSanitizeAerodrome(leg.arr),
    landings: Number.isFinite(leg.landings) ? leg.landings : 0,
    flightTime: sagaImportNormalizeDuration(leg.flightTime || "") || "00:00",
    navTime: sagaImportNormalizeDuration(leg.navTime || "") || "00:00",
    ifrTime: sagaImportNormalizeDuration(leg.ifrTime || "") || "00:00",
    nightTime: sagaImportNormalizeDuration(leg.nightTime || "") || "00:00",
    serviceTime: sagaImportNormalizeDuration(leg.serviceTime || "") || "00:00",
    engineStart: sagaImportZuluToLocalClock(leg.engineStart || ""),
    takeoff: sagaImportZuluToLocalClock(leg.takeoff || ""),
    landing: sagaImportZuluToLocalClock(leg.landing || ""),
    engineCut: sagaImportZuluToLocalClock(leg.engineCut || ""),
    distance: cleanString(leg.distance),
  };
}

// Bloco meta.training do registro da ficha, espelhando os campos materializados
// do documento (a ficha no app lê meta.training antes dos campos do documento).
function buildSagaTrainingMetaBlock(materialized) {
  const trackId = cleanString(materialized.training_track_id);
  if (!trackId) return null;
  const missionId = cleanString(materialized.training_mission_id) || null;
  let snapshot = null;
  try {
    const parsed = JSON.parse(cleanString(materialized.training_snapshot_json) || "null");
    if (parsed && typeof parsed === "object") snapshot = parsed;
  } catch {
    snapshot = null;
  }
  const snapshots = [];
  for (const candidate of [snapshot, ...(Array.isArray(snapshot?.snapshots) ? snapshot.snapshots : [])]) {
    const candidateMissionId = cleanString(candidate?.missionId);
    if (!candidateMissionId || snapshots.some((item) => cleanString(item.missionId) === candidateMissionId)) continue;
    snapshots.push(candidate);
  }
  return {
    trackId,
    stageId: cleanString(materialized.training_stage_id) || undefined,
    missionId: missionId || undefined,
    missionIds: Array.from(new Set([missionId, ...snapshots.map((item) => cleanString(item.missionId))].filter(Boolean))),
    snapshot,
    snapshots,
  };
}

function buildSagaFlightCsvMeta(group, firstLeg, materialized, studentUserId, instructorUserId, pdfRecord = null) {
  const lastLeg = group.legs[group.legs.length - 1] || firstLeg;
  const flightDate = materialized.flight_date || "";
  const lookupSummary = sagaLookupSummary(group);
  const groupKey = cleanString(group.key || group.id);
  const metaLegs = sagaApplyPdfNavigationToMetaLegs(
    group.legs.map((leg, legIndex) => sagaMetaLeg(leg, legIndex, flightDate)),
    pdfRecord,
  ).map((leg) => sagaImportMetaLegFromLookup(leg, lookupSummary, flightDate));
  const firstEngineStart = metaLegs.find((leg) => cleanString(leg.engineStart))?.engineStart || "";
  const lastEngineCut = [...metaLegs].reverse().find((leg) => cleanString(leg.engineCut))?.engineCut || "";
  const firstTakeoff = metaLegs.find((leg) => cleanString(leg.takeoff))?.takeoff || "";
  const lastLanding = [...metaLegs].reverse().find((leg) => cleanString(leg.landing))?.landing || "";
  const pdfOk = pdfRecord?.ok === true;
  const trainingMeta = buildSagaTrainingMetaBlock(materialized);
  const meta = {
    source: "saga",
    sagaFlightId: group.id,
    sagaFlightGroupKey: groupKey,
    sagaFlightGroupOrdinal: group.ordinal || 1,
    ...(trainingMeta ? { training: trainingMeta } : {}),
    header: {
      studentUserId: studentUserId || "",
      studentLabel: cleanString(firstLeg.aluno),
      studentName: cleanString(firstLeg.aluno),
      instructorUserId: instructorUserId || null,
      instructorName: cleanString(firstLeg.instrutor) || null,
      date: flightDate,
      aircraft: materialized.aircraft_ident || "",
      startTime: firstEngineStart || materialized.start_time || null,
      departureTimeUtc: firstEngineStart || sagaImportZuluToLocalClock(cleanString(firstLeg.acionamento).slice(0, 5)) || null,
      engineCutoffTimeUtc: lastEngineCut || sagaImportZuluToLocalClock(cleanString(lastLeg.corte).slice(0, 5)) || null,
      takeoffTimeUtc: firstTakeoff || sagaImportZuluToLocalClock(cleanString(firstLeg.decolagem).slice(0, 5)) || null,
      landingTimeUtc: lastLanding || sagaImportZuluToLocalClock(cleanString(lastLeg.pouso).slice(0, 5)) || null,
      isNight: group.legs.some((leg) => /not/i.test(cleanString(leg.diurnoOuNoturno))),
    },
    preFlight: {
      objectiveMd: pdfOk ? cleanString(pdfRecord.objectiveMd) : "",
      briefingMd: pdfOk ? cleanString(pdfRecord.briefingMd) : "",
    },
    legs: metaLegs,
    exercises: pdfOk && Array.isArray(pdfRecord.exercises)
      ? dedupeSagaExercises(pdfRecord.exercises).map((exercise) => ({
          id: sagaDocId("saga_exercise", `${groupKey}_${cleanString(exercise.title)}`).slice(0, 64),
          title: cleanString(exercise.title),
          grade: ["NO", "1", "2", "3", "4"].includes(cleanString(exercise.grade)) ? cleanString(exercise.grade) : "NO",
        })).filter((exercise) => exercise.title)
      : [],
    ...(pdfOk && pdfRecord.weightBalance ? { weightBalance: sagaImportWeightBalanceMeta(pdfRecord, materialized.aircraft_ident) } : {}),
    risk: {
      commentsMd: pdfOk ? cleanString(pdfRecord.commentsMd) : "",
      dangerMd: pdfOk ? cleanString(pdfRecord.dangerMd) : "",
      riskMd: pdfOk ? cleanString(pdfRecord.riskMd) : "",
      managementMd: pdfOk ? cleanString(pdfRecord.managementMd) : "",
      instructorOutcome: pdfOk ? sagaImportInstructorOutcome(pdfRecord.result) : "",
      instructorOpinionMd: pdfOk ? cleanString(pdfRecord.result) : "",
    },
    saga: {
      legs: group.legs,
      pdfRecord: pdfRecord || null,
    },
  };
  return `${META_PREFIX}${Buffer.from(JSON.stringify(meta), "utf8").toString("base64")}\n`;
}

function sagaSignaturePermissions(studentUserId, instructorUserId) {
  return Array.from(new Set([
    sdk.Permission.read(sdk.Role.label("admin")),
    sdk.Permission.update(sdk.Role.label("admin")),
    sdk.Permission.delete(sdk.Role.label("admin")),
    studentUserId ? sdk.Permission.read(sdk.Role.user(studentUserId)) : null,
    instructorUserId ? sdk.Permission.read(sdk.Role.user(instructorUserId)) : null,
  ].filter(Boolean)));
}

async function ensureSagaInstructorSignature(flightDoc, signedAt, logs = null) {
  const flightId = cleanString(flightDoc?.$id);
  const instructorUserId = cleanString(flightDoc?.instructor_user_id);
  const studentUserId = cleanString(flightDoc?.student_user_id || flightDoc?.user_id);
  if (!FLIGHT_SIGNATURES_COLLECTION_ID || !flightId || !instructorUserId) return false;
  const existing = await databases.listDocuments(DATABASE_ID, FLIGHT_SIGNATURES_COLLECTION_ID, [
    sdk.Query.equal("flight_id", [flightId]),
    sdk.Query.equal("signer_role", ["instructor"]),
    sdk.Query.limit(100),
  ]).catch(() => ({ documents: [] }));
  if ((existing.documents || []).some((doc) => cleanString(doc.status || "active") === "active")) return false;

  const effectiveSignedAt = cleanString(signedAt) || nowIso();
  const payloadSnapshotJson = stableStringify({
    source: "saga_import",
    flightId,
    sagaFlightId: cleanString(flightDoc.saga_flight_id),
    signerUserId: instructorUserId,
    signerRole: "instructor",
    signedAt: effectiveSignedAt,
  });
  const payload = {
    flight_id: flightId,
    signer_user_id: instructorUserId,
    signer_role: "instructor",
    signed_at: effectiveSignedAt,
    user_agent: "SAGA import",
    content_hash: sha256(payloadSnapshotJson),
    payload_version: "saga-import-v1",
    payload_hash_alg: "SHA-256",
    payload_snapshot_json: payloadSnapshotJson,
    reauthenticated_at: null,
    auth_method: "saga_import",
    school_id: flightDoc.school_id || SCHOOL_ID,
    status: "active",
  };
  const signatureId = sdk.ID.unique();
  try {
    await databases.createDocument(
      DATABASE_ID,
      FLIGHT_SIGNATURES_COLLECTION_ID,
      signatureId,
      payload,
      sagaSignaturePermissions(studentUserId, instructorUserId),
    );
  } catch (err) {
    if (Number(err?.code) === 409 || /already exists|duplicate/i.test(String(err?.message || ""))) return false;
    if (!/attribute|unknown|invalid document structure/i.test(String(err?.message || ""))) throw err;
    const {
      payload_version: _payloadVersion,
      payload_hash_alg: _payloadHashAlg,
      payload_snapshot_json: _payloadSnapshotJson,
      reauthenticated_at: _reauthenticatedAt,
      auth_method: _authMethod,
      ...compatPayload
    } = payload;
    await databases.createDocument(
      DATABASE_ID,
      FLIGHT_SIGNATURES_COLLECTION_ID,
      signatureId,
      compatPayload,
      sagaSignaturePermissions(studentUserId, instructorUserId),
    );
  }
  if (Array.isArray(logs)) logs.push(`Ficha SAGA ${cleanString(flightDoc.saga_flight_id) || flightId}: assinatura INVA importada.`);
  return true;
}

async function repairExistingSagaFlight(docId, logs = null) {
  const flightDoc = await databases.getDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, docId).catch(() => null);
  if (!flightDoc) return { repaired: false };
  const signatures = FLIGHT_SIGNATURES_COLLECTION_ID
    ? await databases.listDocuments(DATABASE_ID, FLIGHT_SIGNATURES_COLLECTION_ID, [
        sdk.Query.equal("flight_id", [docId]),
        sdk.Query.limit(100),
      ]).catch(() => ({ documents: [] }))
    : { documents: [] };
  const activeRoles = new Set(
    (signatures.documents || [])
      .filter((signature) => cleanString(signature.status || "active") === "active")
      .map((signature) => cleanString(signature.signer_role)),
  );
  const patch = {
    instructor_signed: true,
    student_signed: activeRoles.has("student"),
    admin_operator_signed: activeRoles.has("admin_operator"),
    instructor_signed_at: flightDoc.instructor_signed_at || flightDoc.saga_imported_at || nowIso(),
    flight_status: "Realizado",
  };
  const decoded = decodeFlightRecordCsv(flightDoc.csv_text);
  if (decoded.meta && Array.isArray(decoded.meta.exercises)) {
    const deduped = dedupeSagaExercises(decoded.meta.exercises);
    if (deduped.length !== decoded.meta.exercises.length) {
      patch.csv_text = encodeFlightRecordCsv({
        meta: { ...decoded.meta, exercises: deduped },
        telemetryCsv: decoded.telemetryCsv,
        telemetryFiles: decoded.telemetryFiles,
      });
    }
  }
  const updated = await databases.updateDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, docId, patch);
  const signatureCreated = await ensureSagaInstructorSignature(updated, patch.instructor_signed_at, logs);
  return { repaired: Boolean(patch.csv_text) || signatureCreated };
}

async function updateSagaFlightDocument(docId, materialized, optionalFields, studentUserId, instructorUserId) {
  const existing = await databases.getDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, docId).catch(() => null);
  const permissions = existing
    ? Array.from(new Set([...(existing.$permissions || []), ...sagaFlightPermissions(studentUserId, instructorUserId)]))
    : sagaFlightPermissions(studentUserId, instructorUserId);
  try {
    return await databases.updateDocument(
      DATABASE_ID,
      FLIGHTS_COLLECTION_ID,
      docId,
      { ...materialized, ...optionalFields },
      permissions,
    );
  } catch (err) {
    const message = String(err?.message || "");
    if (!/attribute|unknown|invalid document structure/i.test(message)) throw err;
    return databases.updateDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, docId, materialized, permissions);
  }
}

async function ensureSagaStudentTrack(studentUserId, trainingTrackId) {
  try {
    await assignStudentTrainingTrack(studentUserId, trainingTrackId, true, "active");
    return true;
  } catch {
    return false;
  }
}

async function importSagaFlightGroup(group, mapping, catalogs, usersByCanac, { testMode = false, cookieJar = null, logs = null, pdfRecordOverride = undefined, forceStudentUserId = null, forceInstructorUserId = null, existingDocId = null, skipMissionMapping = false, missionRemapped = false, createOnly = false, assignTrainingTrack = true } = {}) {
  const firstLeg = group.legs[0] || {};
  const groupKey = cleanString(group.key || group.id);
  const sagaAircraft = cleanString(firstLeg.aeronave);
  const sagaCourse = cleanString(firstLeg.curso);
  const aircraftIdent = cleanString(mapping.aircraftBySaga?.[sagaAircraft]);
  const trainingTrackId = cleanString(mapping.courseBySaga?.[sagaCourse]);
  const studentUserId = usersByCanac.get(normalizeCanac(firstLeg.canacAluno)) || cleanString(forceStudentUserId) || null;
  const instructorUserId = usersByCanac.get(normalizeCanac(firstLeg.canacInstrutor)) || cleanString(forceInstructorUserId) || null;
  const rawMission = cleanString(firstLeg.missaoDoAluno);
  const resolvedMission = sagaResolveTrainingMission(trainingTrackId, catalogs, rawMission, mapping?.missionBySaga);
  const baseFailure = {
    id: group.id,
    date: cleanString(firstLeg.dataDoVoo),
    student: cleanString(firstLeg.aluno),
    aircraft: sagaAircraft,
    course: sagaCourse,
  };
  if (!aircraftIdent) {
    return { skipped: true, reason: "missing_aircraft_mapping", ...baseFailure };
  }
  if (!trainingTrackId) {
    return { skipped: true, reason: "missing_course_mapping", ...baseFailure };
  }
  if (!studentUserId) {
    return { skipped: true, reason: "missing_student", ...baseFailure };
  }

  const docId = cleanString(existingDocId) || sagaDocId(testMode ? "saga_test_flight" : "saga_flight", groupKey);
  const existingDoc = await databases.getDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, docId).catch(() => null);
  if (existingDoc && createOnly) {
    return { skipped: true, duplicate: true, reason: "already_exists", id: group.id, documentId: docId };
  }
  const totalFlightMinutes = group.legs.reduce((acc, leg) => acc + parseDurationToMinutes(leg.tempoDeVooHhmm || leg.tempoDeVooHoras), 0);
  const blockTimeMinutes = group.legs.reduce(
    (acc, leg) => acc + (sagaLegBlockMinutes(leg) ?? parseDurationToMinutes(leg.tempoDeServicoHhmm || leg.tempoDeServicoHoras)),
    0,
  );
  const landings = group.legs.reduce((acc, leg) => acc + Math.max(0, Math.round(Number(cleanString(leg.numeroPousos).replace(",", ".")) || 0)), 0);
  const totalMiles = group.legs.reduce((acc, leg) => acc + parseMiles(leg.distancia), 0);
  const materialized = {
    school_id: SCHOOL_ID,
    user_id: studentUserId,
    student_user_id: studentUserId,
    instructor_user_id: instructorUserId,
    created_by_role: "admin",
    name: `SAGA ${group.id}${group.ordinal > 1 ? ` #${group.ordinal}` : ""} - ${cleanString(firstLeg.aluno) || "Voo"}`.slice(0, 255),
    source_filename: `${testMode ? "saga-test-flight" : "saga-flight"}-${groupKey}`,
    csv_text: "",
    csv_file_id: null,
    aircraft_ident: aircraftIdent,
    duration_sec: totalFlightMinutes * 60,
    flight_date: dateBrToIso(firstLeg.dataDoVoo) || null,
    start_time: cleanString(firstLeg.acionamento || firstLeg.decolagem).slice(0, 8) || null,
    from_to: sagaRouteFromLegs(group.legs).slice(0, 255) || null,
    landings,
    block_time_minutes: blockTimeMinutes || null,
    total_flight_minutes: totalFlightMinutes || null,
    total_miles: totalMiles || null,
    telemetry_present: false,
    is_night: group.legs.some((leg) => /not/i.test(cleanString(leg.diurnoOuNoturno))),
    training_track_id: trainingTrackId,
    training_stage_id: resolvedMission.stageId,
    training_mission_id: resolvedMission.missionId,
    training_snapshot_json: JSON.stringify({ ...resolvedMission.snapshot, course: sagaCourse, mission: rawMission || null }),
    training_mission_ids_json: resolvedMission.missionId ? JSON.stringify([resolvedMission.missionId]) : null,
    flight_status: "Realizado",
    instructor_signed: true,
    student_signed: false,
    admin_operator_signed: false,
    instructor_signed_at: nowIso(),
  };
  let pdfRecord = pdfRecordOverride === undefined ? null : pdfRecordOverride;
  if (pdfRecordOverride === undefined && cookieJar) {
    const statuses = {};
    const locations = {};
    const htmlLengths = {};
    pdfRecord = await sagaFetchFlightRecordPdf(group.id, cookieJar, logs || [], statuses, locations, htmlLengths)
      .catch((err) => {
        if (logs) logs.push(`Ficha SAGA ${group.id}: ${err?.message || err}.`);
        return { ok: false, message: "Nao foi possivel consultar a ficha SAGA durante o import." };
      });
    if (logs) {
      logs.push(pdfRecord?.ok
        ? `Ficha SAGA ${group.id}: dados da ficha aplicados ao voo importado.`
        : `Ficha SAGA ${group.id}: ${pdfRecord?.message || "sem dados aplicados"}`);
    }
  }
  // Missão ajustada manualmente no app (snapshot sem source "saga"): reimports e
  // recargas não devem sobrescrever, exceto quando o usuário remapeia explicitamente.
  const existingSnapshotSource = (() => {
    try {
      const parsed = JSON.parse(cleanString(existingDoc?.training_snapshot_json) || "null");
      return parsed && typeof parsed === "object" ? cleanString(parsed.source) : "";
    } catch {
      return "";
    }
  })();
  const manualMissionAdjustment = Boolean(
    existingDoc &&
    cleanString(existingDoc.training_mission_id) &&
    existingSnapshotSource !== "saga" &&
    existingSnapshotSource !== "saga_schedule",
  );
  const preserveExistingTraining = Boolean(existingDoc) && !missionRemapped && (skipMissionMapping || manualMissionAdjustment);
  if (preserveExistingTraining) {
    materialized.training_track_id = cleanString(existingDoc.training_track_id) || trainingTrackId;
    materialized.training_stage_id = cleanString(existingDoc.training_stage_id) || null;
    materialized.training_mission_id = cleanString(existingDoc.training_mission_id) || null;
    materialized.training_snapshot_json = cleanString(existingDoc.training_snapshot_json) || materialized.training_snapshot_json;
    materialized.training_mission_ids_json = cleanString(existingDoc.training_mission_ids_json) || materialized.training_mission_ids_json;
  }
  materialized.csv_text = buildSagaFlightCsvMeta(group, firstLeg, materialized, studentUserId, instructorUserId, pdfRecord);
  if (existingDoc) {
    const merged = mergeSagaCsvPreservingTelemetry(materialized.csv_text, existingDoc.csv_text, { preserveTraining: preserveExistingTraining });
    materialized.csv_text = merged.csvText;
    if (merged.hasTelemetry) {
      materialized.telemetry_present = true;
      if (existingDoc.csv_file_id) {
        materialized.csv_file_id = existingDoc.csv_file_id;
      }
    } else if (existingDoc.telemetry_present || existingDoc.csv_file_id) {
      materialized.telemetry_present = Boolean(existingDoc.telemetry_present);
      if (existingDoc.csv_file_id) {
        materialized.csv_file_id = existingDoc.csv_file_id;
      }
    }
  }
  const optionalFields = {
    saga_flight_id: `${testMode ? "test:" : ""}${groupKey}`.slice(0, 64),
    saga_legs_json: JSON.stringify(group.legs.map((leg) => ({ ...leg, sagaFlightId: group.id, sagaFlightGroupKey: groupKey }))).slice(0, 65535),
    saga_imported_at: nowIso(),
  };

  if (existingDoc) {
    const updatedDoc = await updateSagaFlightDocument(docId, materialized, optionalFields, studentUserId, instructorUserId);
    await ensureSagaInstructorSignature(updatedDoc, materialized.instructor_signed_at, logs);
    await saveInstructorPaymentSnapshotServer(updatedDoc, "saga-import", materialized.instructor_signed_at);
    const assigned = await ensureSagaStudentTrack(studentUserId, trainingTrackId);
    return { updated: true, duplicate: true, id: group.id, documentId: docId, trackAssigned: assigned };
  }

  /*
  try {
    await databases.getDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, docId);
    return { skipped: true, duplicate: true, id: group.id };
  } catch {
    // Not found is expected for new imports.
  }

  */
  let doc;
  try {
    doc = await databases.createDocument(
      DATABASE_ID,
      FLIGHTS_COLLECTION_ID,
      docId,
      { ...materialized, ...optionalFields },
      sagaFlightPermissions(studentUserId, instructorUserId),
    );
  } catch (err) {
    const message = String(err?.message || "");
    if (!/attribute|unknown|invalid document structure/i.test(message)) throw err;
    doc = await databases.createDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, docId, materialized, sagaFlightPermissions(studentUserId, instructorUserId));
  }

  const trackAssigned = assignTrainingTrack
    ? await ensureSagaStudentTrack(studentUserId, trainingTrackId)
    : false;
  await ensureSagaInstructorSignature(doc, materialized.instructor_signed_at, logs);
  await saveInstructorPaymentSnapshotServer(doc, "saga-import", materialized.instructor_signed_at);
  return { created: true, id: group.id, documentId: doc.$id, trackAssigned };
}

function resolveSagaScheduleAircraft(schedule, mapping, catalogs) {
  const sagaAircraft = cleanString(schedule.aircraft);
  const mapped = cleanString(mapping.aircraftBySaga?.[sagaAircraft]);
  if (mapped) return mapped;
  const normalized = normalizeAircraftIdent(sagaAircraft);
  const match = (catalogs?.aircrafts || []).find((aircraft) => normalizeAircraftIdent(aircraft.registration) === normalized);
  return cleanString(match?.registration);
}

function sagaScheduleDurationMinutes(schedule) {
  const start = Date.parse(cleanString(schedule.startAt));
  const end = Date.parse(cleanString(schedule.endAt));
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) return Math.round((end - start) / 60000);
  return clockDiffMinutes(sagaLocalDateTimeParts(schedule.startAtRaw).time, sagaLocalDateTimeParts(schedule.endAtRaw).time) || 0;
}

function buildSagaScheduledFlightCsvMeta(schedule, materialized, studentUserId, instructorUserId) {
  const start = sagaLocalDateTimeParts(schedule.startAtRaw || schedule.startAt);
  const end = sagaLocalDateTimeParts(schedule.endAtRaw || schedule.endAt);
  const usedInstructorAsStudent = Boolean(instructorUserId) && cleanString(studentUserId) === cleanString(instructorUserId);
  const studentLabel = usedInstructorAsStudent
    ? cleanString(schedule.instructorName) || cleanString(schedule.studentName)
    : cleanString(schedule.studentName);
  const cancellationReasonText = cleanString(materialized.from_to) || cleanString(schedule.notes);
  const meta = {
    source: "saga_schedule",
    sourceVersion: 1,
    scheduleId: cleanString(schedule.id),
    importedAt: nowIso(),
    ...(materialized.flight_status === "Cancelado"
      ? {
          cancellation: {
            reasonCode: "Cancelado no SAGA",
            reasonText: cancellationReasonText,
            updatedAt: nowIso(),
          },
        }
      : {}),
    header: {
      flightDate: materialized.flight_date || start.date || "",
      studentUserId,
      instructorUserId: instructorUserId || null,
      studentLabel,
      studentName: studentLabel,
      instructorName: cleanString(schedule.instructorName) || null,
      aircraft: materialized.aircraft_ident || "",
      startTime: materialized.start_time || start.time || null,
      departureTimeUtc: start.time || null,
      engineCutoffTimeUtc: end.time || null,
      isNight: false,
      notes: cleanString(schedule.notes),
      ...(usedInstructorAsStudent ? { sagaStudentFallback: "instructor" } : {}),
    },
    preFlight: {
      objectiveMd: cleanString(schedule.notes),
      briefingMd: "",
    },
    legs: [],
    risk: {
      commentsMd: "",
      dangerMd: "",
      riskMd: "",
      managementMd: "",
      instructorOpinionMd: "",
    },
    saga: {
      schedule: schedule.raw,
    },
  };
  return `${META_PREFIX}${Buffer.from(JSON.stringify(meta), "utf8").toString("base64")}\n`;
}

async function importSagaScheduledFlight(schedule, mapping, catalogs, usersBySagaId, { testMode = false, existingDocId = "" } = {}) {
  const aircraftIdent = resolveSagaScheduleAircraft(schedule, mapping, catalogs);
  const sagaStudentUserId = usersBySagaId.get(cleanString(schedule.studentSagaId)) || null;
  const instructorUserId = usersBySagaId.get(cleanString(schedule.instructorSagaId)) || null;
  const studentUserId = sagaStudentUserId || instructorUserId || null;
  const usedInstructorAsStudent = !sagaStudentUserId && Boolean(instructorUserId);
  const studentLabel = usedInstructorAsStudent
    ? cleanString(schedule.instructorName) || cleanString(schedule.studentName) || "Instrutor"
    : cleanString(schedule.studentName);
  const cancelled = sagaScheduleIsCancelledStatus(schedule.status);
  const scheduleNotes = cleanString(schedule.notes);
  const cancellationReasonText = [
    scheduleNotes,
    cleanString(schedule.status) ? `Status SAGA: ${cleanString(schedule.status)}` : "",
    usedInstructorAsStudent ? "SAGA sem aluno; instrutor usado como aluno no import." : "",
  ].filter(Boolean).join(" | ");
  const start = sagaLocalDateTimeParts(schedule.startAtRaw || schedule.startAt);
  const end = sagaLocalDateTimeParts(schedule.endAtRaw || schedule.endAt);
  const baseFailure = {
    id: schedule.id,
    date: start.date,
    student: studentLabel,
    aircraft: cleanString(schedule.aircraft),
    course: "",
  };
  if (!aircraftIdent) return { skipped: true, reason: "missing_aircraft_mapping", ...baseFailure };
  if (!studentUserId) return { skipped: true, reason: "missing_student", ...baseFailure };
  if (!start.date) return { skipped: true, reason: "missing_schedule_date", ...baseFailure };

  const sagaScheduleId = cleanString(schedule.id).slice(0, 64) || null;
  const existingBySagaScheduleId = sagaScheduleId
    ? await databases.listDocuments(DATABASE_ID, FLIGHTS_COLLECTION_ID, [
        sdk.Query.equal("saga_schedule_id", [sagaScheduleId]),
        sdk.Query.limit(1),
      ]).catch(() => ({ documents: [] }))
    : { documents: [] };
  const forcedExistingDoc = cleanString(existingDocId)
    ? await databases.getDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, cleanString(existingDocId)).catch(() => null)
    : null;
  const existingDocBySchedule = existingBySagaScheduleId.documents?.[0] || forcedExistingDoc || null;
  const docId = cleanString(existingDocBySchedule?.$id) || sagaDocId(testMode ? "saga_test_schedule" : "saga_schedule", schedule.id);
  const existingDoc = existingDocBySchedule || await databases.getDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, docId).catch(() => null);
  const durationMinutes = sagaScheduleDurationMinutes(schedule);
  const materialized = {
    school_id: SCHOOL_ID,
    user_id: studentUserId,
    student_user_id: studentUserId,
    instructor_user_id: instructorUserId,
    created_by_role: "admin",
    name: `SAGA Agendado ${schedule.id} - ${studentLabel || "Voo"}`.slice(0, 255),
    source_filename: `${testMode ? "saga-test-schedule" : "saga-schedule"}-${schedule.id}`,
    csv_text: "",
    csv_file_id: null,
    aircraft_ident: aircraftIdent,
    duration_sec: durationMinutes > 0 ? durationMinutes * 60 : null,
    flight_date: start.date,
    start_time: start.time || null,
    from_to: (cancelled ? cancellationReasonText : scheduleNotes).slice(0, 255) || null,
    landings: 0,
    block_time_minutes: durationMinutes || null,
    total_flight_minutes: durationMinutes || null,
    total_miles: null,
    telemetry_present: false,
    is_night: false,
    training_track_id: null,
    training_stage_id: null,
    training_mission_id: null,
    training_snapshot_json: JSON.stringify({
      source: "saga_schedule",
      notes: scheduleNotes || null,
      status: cleanString(schedule.status) || null,
      usedInstructorAsStudent,
    }),
    flight_status: cancelled ? "Cancelado" : "Confirmado",
  };
  materialized.csv_text = buildSagaScheduledFlightCsvMeta(schedule, materialized, studentUserId, instructorUserId);
  const optionalFields = {
    saga_flight_id: `${testMode ? "test:" : ""}schedule:${cleanString(schedule.id)}`.slice(0, 64),
    saga_schedule_id: sagaScheduleId,
    saga_legs_json: JSON.stringify([schedule.raw]).slice(0, 65535),
    saga_imported_at: nowIso(),
  };

  if (existingDoc) {
    await updateSagaFlightDocument(docId, materialized, optionalFields, studentUserId, instructorUserId);
    return { updated: true, duplicate: true, id: schedule.id, documentId: docId };
  }

  let doc;
  try {
    doc = await databases.createDocument(
      DATABASE_ID,
      FLIGHTS_COLLECTION_ID,
      docId,
      { ...materialized, ...optionalFields },
      sagaFlightPermissions(studentUserId, instructorUserId),
    );
  } catch (err) {
    const message = String(err?.message || "");
    if (!/attribute|unknown|invalid document structure/i.test(message)) throw err;
    doc = await databases.createDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, docId, materialized, sagaFlightPermissions(studentUserId, instructorUserId));
  }
  return { created: true, id: schedule.id, documentId: doc.$id };
}

async function sagaImportData(payload = {}, actorUserId = "saga-import", runtimeLog = null) {
  const logLine = (message) => {
    if (typeof runtimeLog === "function") runtimeLog(message);
  };
  const importRunId = cleanString(payload.importRunId) || crypto.randomUUID();
  const usersInput = Array.isArray(payload.users) ? payload.users : [];
  const testMode = payload.testMode !== false;
  const useEmailAlias = payload.useEmailAlias === true;
  const immutableSync = payload.immutableSync === true;
  const syncWindowDays = Math.max(1, Math.min(365, Math.round(Number(payload.syncWindowDays) || 7)));
  const rawScope = payload.scope && typeof payload.scope === "object" ? payload.scope : {};
  const importScope = {
    users: rawScope.users !== false,
    pastFlights: rawScope.pastFlights !== false,
    schedule: rawScope.schedule !== false,
    credits: rawScope.credits !== false,
  };
  let mapping = sanitizeSagaImportMapping(payload.mapping || (await loadSagaImportMapping()));
  const catalogs = await listSagaImportCatalogs();
  const flightsInput = applySagaFlightColumnMap(Array.isArray(payload.flights) ? payload.flights : [], mapping.flightColumnMap);
  const financialEntriesInput = Array.isArray(payload.financialEntries) ? payload.financialEntries : [];
  const groupedFlights = groupSagaFlightsById(flightsInput);
  const requestedSagaUserIds = new Set((Array.isArray(payload.selectedSagaUserIds) ? payload.selectedSagaUserIds : []).map(cleanString).filter(Boolean));
  const selectedStudentCanacs = new Set(
    requestedSagaUserIds.size
      ? usersInput.filter((user) => requestedSagaUserIds.has(cleanString(user.id))).map((user) => cleanString(user.codigoAnac)).filter(Boolean)
      : [],
  );
  const filteredGroups = requestedSagaUserIds.size
    ? groupedFlights.filter((group) => group.legs.some((leg) => selectedStudentCanacs.has(cleanString(leg.canacAluno))))
    : groupedFlights;
  const selectedGroups = importScope.pastFlights ? (testMode ? filteredGroups.slice(0, 5) : filteredGroups) : [];
  const scheduleLogs = [];
  let scheduledFlights = [];
  let importCookieJar = null;
  let apiV2Token = "";
  if (importScope.users) {
    apiV2Token = await sagaApiV2Login(payload.email, payload.password, scheduleLogs).catch(() => "");
    if (!apiV2Token) scheduleLogs.push("API v2 login indisponivel; enriquecimento de usuario vai usar fallback.");
  }
  try {
    importCookieJar = await sagaLoginSession(payload.email, payload.password, scheduleLogs);
    if (importScope.schedule) {
      scheduledFlights = await fetchSagaScheduledFlights(importCookieJar, scheduleLogs);
    } else {
      scheduleLogs.push("Escopo de import: escala desativada.");
    }
    await saveSagaAuthSession(importCookieJar, payload.email).catch((err) => {
      scheduleLogs.push(`Sessao SAGA da escala atualizada, mas nao foi possivel salvar os cookies finais: ${err?.message || err}.`);
    });
  } catch (err) {
    scheduleLogs.push(`Escala SAGA nao importada: ${String(err?.message || err)}`);
  }
  const todayIso = sagaTodayIso();
  const scheduleDateOf = (schedule) =>
    sagaLocalDateTimeParts(schedule.startAtRaw || schedule.startAt).date || sagaScheduleDateIso(schedule.raw);
  const todayScheduledCount = scheduledFlights.filter((schedule) => scheduleDateOf(schedule) === todayIso).length;
  const filteredScheduledFlights = requestedSagaUserIds.size
    ? scheduledFlights.filter((schedule) => requestedSagaUserIds.has(cleanString(schedule.studentSagaId)))
    : scheduledFlights;
  scheduleLogs.push(
    `Escala SAGA: ${todayScheduledCount} agendados para hoje (${todayIso}); ${filteredScheduledFlights.length}/${scheduledFlights.length} mantidos apos selecao.`,
  );
  const canacBySagaUserId = new Map(usersInput.map((user) => [cleanString(user.id), cleanString(user.codigoAnac)]).filter(([, canac]) => canac));
  const nameBySagaUserId = new Map(usersInput.map((user) => [cleanString(user.id), normalizeSearch(user.nome)]).filter(([, name]) => name));
  const realizedStudentDateKeys = new Set();
  const realizedStudentNameDateKeys = new Set();
  for (const group of groupedFlights) {
    for (const leg of group.legs || []) {
      const rawDate = cleanString(leg.dataDoVoo);
      const date = dateBrToIso(rawDate) || (/^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : "");
      const canac = cleanString(leg.canacAluno);
      const name = normalizeSearch(leg.aluno);
      if (date && canac) realizedStudentDateKeys.add(`${canac}|${date}`);
      if (date && name) realizedStudentNameDateKeys.add(`${name}|${date}`);
    }
  }
  const scheduledFlightsWithoutRealizedSameDay = filteredScheduledFlights.filter((schedule) => {
    const canac = canacBySagaUserId.get(cleanString(schedule.studentSagaId));
    const studentName = nameBySagaUserId.get(cleanString(schedule.studentSagaId)) || normalizeSearch(schedule.studentName);
    const date = scheduleDateOf(schedule);
    return !(
      (canac && date && realizedStudentDateKeys.has(`${canac}|${date}`)) ||
      (studentName && date && realizedStudentNameDateKeys.has(`${studentName}|${date}`))
    );
  });
  const schedulesSkippedByRealizedSameDay = filteredScheduledFlights.length - scheduledFlightsWithoutRealizedSameDay.length;
  scheduleLogs.push(
    `Escala SAGA: ${scheduledFlightsWithoutRealizedSameDay.length}/${filteredScheduledFlights.length} agendados mantidos; ${schedulesSkippedByRealizedSameDay} ignorados por voo realizado do aluno no mesmo dia.`,
  );
  const selectedScheduledFlights = testMode
    ? scheduledFlightsWithoutRealizedSameDay.slice(0, 5)
    : scheduledFlightsWithoutRealizedSameDay;
  const selectedCanacs = new Set();
  const instructorCanacs = new Set();
  const selectedSagaUserIds = new Set();
  for (const id of requestedSagaUserIds) selectedSagaUserIds.add(id);
  for (const group of selectedGroups) {
    for (const leg of group.legs) {
      if (cleanString(leg.canacAluno)) selectedCanacs.add(cleanString(leg.canacAluno));
      if (cleanString(leg.canacInstrutor)) {
        selectedCanacs.add(cleanString(leg.canacInstrutor));
        instructorCanacs.add(cleanString(leg.canacInstrutor));
      }
    }
  }
  for (const schedule of selectedScheduledFlights) {
    if (cleanString(schedule.studentSagaId)) selectedSagaUserIds.add(cleanString(schedule.studentSagaId));
    if (cleanString(schedule.instructorSagaId)) selectedSagaUserIds.add(cleanString(schedule.instructorSagaId));
  }
  const selectedUsersUnscoped = testMode && (selectedCanacs.size || selectedSagaUserIds.size)
    ? usersInput.filter((user) => selectedCanacs.has(cleanString(user.codigoAnac)) || selectedSagaUserIds.has(cleanString(user.id)))
    : requestedSagaUserIds.size
      ? usersInput.filter((user) => selectedCanacs.has(cleanString(user.codigoAnac)) || selectedSagaUserIds.has(cleanString(user.id)))
      : usersInput;
  const selectedUsers = importScope.users ? selectedUsersUnscoped : [];

  const summary = {
    importRunId,
    testMode,
    useEmailAlias,
    selectedSagaUsers: requestedSagaUserIds.size,
    requestedUsers: selectedUsers.length,
    requestedFlightGroups: selectedGroups.length,
    requestedScheduledFlights: selectedScheduledFlights.length,
    usersCreated: 0,
    usersUpdated: 0,
    usersSkipped: 0,
    flightsCreated: 0,
    flightsUpdated: 0,
    flightsSkipped: 0,
    duplicateFlights: 0,
    scheduledFlightsCreated: 0,
    scheduledFlightsUpdated: 0,
    scheduledFlightsSkipped: 0,
    trainingAssignmentsTouched: 0,
    anacSynced: 0,
    anacPending: 0,
    anacFailed: 0,
    creditsCreated: 0,
    creditsUpdated: 0,
    creditsSkipped: 0,
    financialCreditsCreated: 0,
    financialCreditsUpdated: 0,
    financialCreditsSkipped: 0,
    creditHoursImported: 0,
    nightHoursReclassified: 0,
    nightCreditRecordsCreated: 0,
    skippedFlights: [],
    skippedCredits: [],
    missing: {
      aircrafts: [],
      courses: [],
      students: [],
      creditAircrafts: [],
    },
    logs: [...scheduleLogs],
    scope: importScope,
  };

  try {
  const resumeRunId = cleanString(payload.resumeRunId);
  const resumeFlightIndex = Number.isFinite(Number(payload.resumeFlightIndex)) ? Math.max(0, Math.floor(Number(payload.resumeFlightIndex))) : -1;
  const pausedState = resumeRunId ? await loadSagaImportPausedState(resumeRunId) : null;
  const checkpoint =
    resumeFlightIndex >= 0
      ? {
          flightIndex: resumeFlightIndex,
          userPhaseDone: true,
          counters: pausedState?.checkpoint?.counters || {},
        }
      : pausedState?.checkpoint || null;
  if (checkpoint?.counters && typeof checkpoint.counters === "object") {
    Object.assign(summary, checkpoint.counters);
    summary.importRunId = importRunId;
    summary.logs.push(`Retomando import na ficha ${(Number(checkpoint.flightIndex) || 0) + 1}/${selectedGroups.length}.`);
  } else if (checkpoint?.summary && typeof checkpoint.summary === "object") {
    Object.assign(summary, compactSagaImportSummary(checkpoint.summary));
    summary.importRunId = importRunId;
    summary.logs.push(`Retomando import na ficha ${(Number(checkpoint.flightIndex) || 0) + 1}/${selectedGroups.length}.`);
  }
  if (checkpoint?.userPhaseDone && importRunId) {
    const lastDoc = await getSettingDoc(SAGA_IMPORT_LAST_SUMMARY_KEY);
    const lastParsed = lastDoc ? parseJsonObject(lastDoc.settings_json, {}) : {};
    const lastSummary = lastParsed.summary;
    if (lastSummary && cleanString(lastSummary.importRunId) === importRunId) {
      const merged = compactSagaImportSummary(lastSummary);
      Object.assign(summary, merged);
      summary.importRunId = importRunId;
      summary.logs = [
        ...summary.logs,
        ...(Array.isArray(merged.logs) ? merged.logs.slice(-15) : []),
      ].slice(-40);
    }
  }

  let lastProgressAt = 0;
  async function reportProgress(stage, message, current = 0, total = 0, force = false, extra = {}) {
    const now = Date.now();
    if (!force && now - lastProgressAt < 1500) return;
    lastProgressAt = now;
    const progressLogs = Array.isArray(extra.logs)
      ? extra.logs
      : Array.isArray(summary.logs)
        ? summary.logs.slice(-6).map(truncateSagaImportLogLine)
        : [];
    await saveSagaImportProgress({
      runId: importRunId,
      status: cleanString(extra.status) || "running",
      stage,
      message,
      current,
      total,
      logs: progressLogs,
      pendingMission: extra.pendingMission,
    }).catch(() => null);
  }
  await reportProgress("Preparando import", "Sessao SAGA, escala e listas locais carregadas.", 0, selectedUsers.length + selectedGroups.length + selectedScheduledFlights.length, true);

  const startFlightIndex = Math.max(0, Number(checkpoint?.flightIndex) || 0);
  const pdfGroupsToFetch = checkpoint?.userPhaseDone
    ? selectedGroups.slice(startFlightIndex)
    : selectedGroups;
  const pdfRecordByGroupKey = new Map();
  const pdfPrefetchPromise = importCookieJar && pdfGroupsToFetch.length
    ? sagaRunConcurrent(pdfGroupsToFetch, 3, async (group, index) => {
        const localLogs = [];
        const statuses = {};
        const locations = {};
        const htmlLengths = {};
        const record = await sagaFetchFlightRecordPdf(group.id, new Map(importCookieJar), localLogs, statuses, locations, htmlLengths)
          .catch((err) => {
            localLogs.push(`Ficha SAGA ${group.id}: ${err?.message || err}.`);
            return { ok: false, message: "Nao foi possivel consultar a ficha SAGA durante o import." };
          });
        await reportProgress(
          "Fichas PDF",
          `${index + 1}/${pdfGroupsToFetch.length} fichas PDF consultadas.`,
          index + 1,
          pdfGroupsToFetch.length,
        );
        return { key: cleanString(group.key || group.id), record, logs: localLogs };
      }).then((items) => {
        for (const item of items) {
          if (!item) continue;
          pdfRecordByGroupKey.set(item.key, item.record);
          if (item.logs?.length) summary.logs.push(...item.logs.slice(0, 2).map(truncateSagaImportLogLine));
        }
      })
    : Promise.resolve();

  const usersByCanac = new Map();
  const usersBySagaId = new Map();
  const existingProfiles = await safeListAllDocuments(PROFILES_COLLECTION_ID, [
    sdk.Query.equal("school_id", [SCHOOL_ID]),
    ...selectQuery(["$id", "user_id", "anac_code", "saga_user_id"]),
  ]);
  for (const profile of existingProfiles) {
    if (cleanString(profile.anac_code) && cleanString(profile.user_id)) usersByCanac.set(cleanString(profile.anac_code), cleanString(profile.user_id));
    if (cleanString(profile.saga_user_id) && cleanString(profile.user_id)) usersBySagaId.set(cleanString(profile.saga_user_id), cleanString(profile.user_id));
  }
  if (checkpoint?.usersByCanac?.length) {
    for (const [key, value] of checkpoint.usersByCanac) {
      if (cleanString(key) && cleanString(value)) usersByCanac.set(cleanString(key), cleanString(value));
    }
  }
  if (checkpoint?.usersBySagaId?.length) {
    for (const [key, value] of checkpoint.usersBySagaId) {
      if (cleanString(key) && cleanString(value)) usersBySagaId.set(cleanString(key), cleanString(value));
    }
  }

  const importedUsers = Array.isArray(checkpoint?.importedUsers) ? [...checkpoint.importedUsers] : [];
  let userIndex = 0;
  if (!checkpoint?.userPhaseDone) for (const sagaUser of selectedUsers) {
    const role = sagaUserRole(sagaUser, instructorCanacs);
    const alreadyKnownUserId =
      usersBySagaId.get(cleanString(sagaUser.id)) ||
      usersByCanac.get(cleanString(sagaUser.codigoAnac)) ||
      "";
    const detail = importCookieJar && !(immutableSync && alreadyKnownUserId)
      ? await fetchSagaUserDetail(importCookieJar, sagaUser.id, { apiV2Token }).catch(() => null)
      : null;
    const sagaUserWithDetail = detail ? { ...sagaUser, detail } : sagaUser;
    const result = await importSagaUser(sagaUserWithDetail, role, { testMode, useEmailAlias, createOnly: immutableSync });
    if (result.userId && cleanString(sagaUser.codigoAnac)) usersByCanac.set(cleanString(sagaUser.codigoAnac), result.userId);
    if (result.userId && cleanString(sagaUser.id)) usersBySagaId.set(cleanString(sagaUser.id), result.userId);
    if (result.userId) {
      importedUsers.push({ sagaUser: sagaUserWithDetail, userId: result.userId, role });
      if (result.created || !immutableSync) {
        const anac = await syncSagaUserAnac(result.userId, sagaUserWithDetail);
        if (anac.error) summary.anacFailed += 1;
        else if (anac.skipped || anac.pending) summary.anacPending += 1;
        else summary.anacSynced += 1;
      }
    }
    if (result.created) summary.usersCreated += 1;
    else if (result.updated) summary.usersUpdated += 1;
    else summary.usersSkipped += 1;
    userIndex += 1;
    await reportProgress("Usuarios e ANAC", `${userIndex}/${selectedUsers.length} usuarios processados.`, userIndex, selectedUsers.length);
  }
  if (!checkpoint?.userPhaseDone) {
    await reportProgress("Usuarios e ANAC", `${selectedUsers.length}/${selectedUsers.length} usuarios processados.`, selectedUsers.length, selectedUsers.length, true);
    await pdfPrefetchPromise;
    await reportProgress("Fichas PDF", `${pdfRecordByGroupKey.size}/${selectedGroups.length} fichas PDF prontas para aplicar.`, pdfRecordByGroupKey.size, selectedGroups.length, true);
  } else {
    summary.logs.push(`Retomada: import continuando na ficha ${startFlightIndex + 1}/${selectedGroups.length}.`);
    await pdfPrefetchPromise;
    await reportProgress(
      "Fichas PDF",
      `${pdfRecordByGroupKey.size}/${pdfGroupsToFetch.length} fichas PDF prontas (retomada).`,
      pdfRecordByGroupKey.size,
      pdfGroupsToFetch.length,
      true,
    );
    if (importedUsers.length) {
      const rebuilt = [];
      for (const row of importedUsers) {
        const sagaUserId = cleanString(row?.sagaUserId || row?.sagaUser?.id);
        const userId = cleanString(row?.userId);
        if (!userId) continue;
        const sagaUser =
          usersInput.find((user) => cleanString(user.id) === sagaUserId) ||
          usersInput.find((user) => usersByCanac.get(cleanString(user.codigoAnac)) === userId) ||
          row?.sagaUser ||
          null;
        if (!sagaUser) continue;
        rebuilt.push({
          sagaUser,
          userId,
          role: cleanString(row?.role) || sagaUserRole(sagaUser, instructorCanacs),
        });
      }
      importedUsers.length = 0;
      importedUsers.push(...rebuilt);
    } else if (selectedUsers.length) {
      for (const sagaUser of selectedUsers) {
        const userId =
          usersByCanac.get(cleanString(sagaUser.codigoAnac)) ||
          usersBySagaId.get(cleanString(sagaUser.id)) ||
          null;
        if (!userId) continue;
        importedUsers.push({
          sagaUser,
          userId,
          role: sagaUserRole(sagaUser, instructorCanacs),
        });
      }
      if (importedUsers.length) {
        summary.logs.push(`Retomada: ${importedUsers.length} aluno(s) reassociado(s) para voos e creditos.`);
      }
    }
  }

  let flightIndex = startFlightIndex;
  for (let groupIdx = startFlightIndex; groupIdx < selectedGroups.length; groupIdx += 1) {
    const group = selectedGroups[groupIdx];
    if (!immutableSync && sagaFlightNeedsMissionMapping(group, mapping, catalogs)) {
      const firstLeg = group.legs?.[0] || {};
      const rawMission = cleanString(firstLeg.missaoDoAluno);
      const sagaCourse = cleanString(firstLeg.curso);
      const trainingTrackId = cleanString(mapping.courseBySaga?.[sagaCourse]);
      const track = (catalogs.trainingTracks || []).find((item) => cleanString(item.id) === trainingTrackId);
      const lookupKey = sagaMissionLookupKeyV2(rawMission);
      const pendingMission = {
        lookupKey,
        rawMission,
        missionCode: sagaMissionCodeV2(rawMission),
        trainingTrackId,
        trackName: cleanString(track?.name) || sagaCourse,
        sagaFlightId: cleanString(group.id),
        studentName: cleanString(firstLeg.aluno),
        flightDate: cleanString(firstLeg.dataDoVoo),
        course: sagaCourse,
      };
      await reportProgress(
        "Missao sem correspondencia",
        `Selecione a missao local para "${rawMission}".`,
        groupIdx,
        selectedGroups.length,
        true,
        { status: "awaiting_mission_mapping", pendingMission, logs: [] },
      );
      await saveSagaImportLastSummary(compactSagaImportSummary(summary)).catch(() => null);
      return {
        ok: true,
        paused: true,
        summary: minimalSagaImportPauseSummary(summary),
        pendingMission,
        resumeFlightIndex: groupIdx,
      };
    }
    const groupKey = cleanString(group.key || group.id);
    const result = await importSagaFlightGroup(group, mapping, catalogs, usersByCanac, {
      testMode,
      cookieJar: importCookieJar,
      logs: summary.logs,
      pdfRecordOverride: pdfRecordByGroupKey.has(groupKey) ? pdfRecordByGroupKey.get(groupKey) : undefined,
      skipMissionMapping: immutableSync,
      createOnly: immutableSync,
      assignTrainingTrack: !immutableSync,
    });
    if (result.created) {
      summary.flightsCreated += 1;
      summary.logs.push(`Voo importado: id=${result.id || group.id} doc=${result.documentId || "(sem-doc)"} student=${cleanString(group.legs?.[0]?.aluno)} date=${cleanString(group.legs?.[0]?.dataDoVoo)}`);
      if (result.trackAssigned !== false) summary.trainingAssignmentsTouched += 1;
      flightIndex += 1;
      await reportProgress("Voos realizados", `${flightIndex}/${selectedGroups.length} voos realizados processados.`, flightIndex, selectedGroups.length);
      continue;
    }
    if (result.updated) {
      summary.flightsUpdated += 1;
      summary.logs.push(`Voo atualizado: id=${result.id || group.id} doc=${result.documentId || "(sem-doc)"} duplicate=${result.duplicate ? "yes" : "no"}`);
      if (result.duplicate) summary.duplicateFlights += 1;
      if (result.trackAssigned) summary.trainingAssignmentsTouched += 1;
      flightIndex += 1;
      await reportProgress("Voos realizados", `${flightIndex}/${selectedGroups.length} voos realizados processados.`, flightIndex, selectedGroups.length);
      continue;
    }
    summary.flightsSkipped += 1;
    if (result.duplicate) summary.duplicateFlights += 1;
    if (result.reason === "missing_aircraft_mapping") summary.missing.aircrafts.push(cleanString(group.legs[0]?.aeronave));
    if (result.reason === "missing_course_mapping") summary.missing.courses.push(cleanString(group.legs[0]?.curso));
    if (result.reason === "missing_student") summary.missing.students.push(cleanString(group.legs[0]?.aluno));
    summary.skippedFlights.push({
      id: result.id || group.id,
      date: result.date || cleanString(group.legs[0]?.dataDoVoo),
      student: result.student || cleanString(group.legs[0]?.aluno),
      aircraft: result.aircraft || cleanString(group.legs[0]?.aeronave),
      course: result.course || cleanString(group.legs[0]?.curso),
      reason: result.reason || "unknown",
      message: sagaImportSkipReasonLabel(result.reason || "unknown"),
    });
    flightIndex += 1;
    await reportProgress("Voos realizados", `${flightIndex}/${selectedGroups.length} voos realizados processados.`, flightIndex, selectedGroups.length);
  }
  await reportProgress("Voos realizados", `${selectedGroups.length}/${selectedGroups.length} voos realizados processados.`, selectedGroups.length, selectedGroups.length, true);

  let scheduleIndex = 0;
  for (const schedule of selectedScheduledFlights) {
    const result = await importSagaScheduledFlight(schedule, mapping, catalogs, usersBySagaId, { testMode });
    if (result.created) {
      summary.scheduledFlightsCreated += 1;
      summary.flightsCreated += 1;
      scheduleIndex += 1;
      await reportProgress("Voos agendados", `${scheduleIndex}/${selectedScheduledFlights.length} agendados processados.`, scheduleIndex, selectedScheduledFlights.length);
      continue;
    }
    if (result.updated) {
      summary.scheduledFlightsUpdated += 1;
      summary.flightsUpdated += 1;
      if (result.duplicate) summary.duplicateFlights += 1;
      scheduleIndex += 1;
      await reportProgress("Voos agendados", `${scheduleIndex}/${selectedScheduledFlights.length} agendados processados.`, scheduleIndex, selectedScheduledFlights.length);
      continue;
    }
    summary.scheduledFlightsSkipped += 1;
    summary.flightsSkipped += 1;
    if (result.reason === "missing_aircraft_mapping") summary.missing.aircrafts.push(cleanString(schedule.aircraft));
    if (result.reason === "missing_student") summary.missing.students.push(cleanString(schedule.studentName));
    summary.skippedFlights.push({
      id: `schedule:${result.id || schedule.id}`,
      date: result.date || sagaLocalDateTimeParts(schedule.startAtRaw || schedule.startAt).date,
      student: result.student || cleanString(schedule.studentName),
      aircraft: result.aircraft || cleanString(schedule.aircraft),
      course: "",
      reason: result.reason || "unknown",
      message: sagaImportSkipReasonLabel(result.reason || "unknown"),
    });
    scheduleIndex += 1;
    await reportProgress("Voos agendados", `${scheduleIndex}/${selectedScheduledFlights.length} agendados processados.`, scheduleIndex, selectedScheduledFlights.length);
  }
  await reportProgress("Voos agendados", `${selectedScheduledFlights.length}/${selectedScheduledFlights.length} agendados processados.`, selectedScheduledFlights.length, selectedScheduledFlights.length, true);

  const importedStudents = importedUsers.filter((item) => item.role === "aluno");
  if (importScope.credits && importedStudents.length && STUDENT_CREDITS_COLLECTION_ID) {
    try {
      await reportProgress("Creditos", `Buscando creditos SAGA de ${importedStudents.length} aluno(s).`, 0, importedStudents.length, true);
      const cookieJar = await sagaLoginSession(payload.email, payload.password, summary.logs);
      const { rows: fetchedCreditRows, fetchedSagaUserIds } = await fetchSagaCreditsForUsers(
        importedStudents.map((item) => item.sagaUser),
        cookieJar,
        summary.logs,
      );
      const windowStart = sagaDateRangeDays(syncWindowDays).startDate;
      const creditRows = applySagaCreditColumnMap(fetchedCreditRows, mapping.creditColumnMap)
        .filter((credit) => !immutableSync || (dateBrToIso(credit.purchaseDate) || "") >= windowStart);
      logLine(`Creditos SAGA: ${creditRows.length} linhas brutas para ${importedStudents.length} aluno(s).`);
      const creditModels = uniqueCleanValues(creditRows.map((credit) => credit.model));
      logLine(`Creditos SAGA modelos: ${creditModels.join(", ") || "(nenhum)"}`);
      const proposedCreditMapping = proposeSagaImportMapping(flightsInput, mapping, catalogs, creditRows, scheduledFlights);
      mapping = {
        ...mapping,
        creditAircraftBySaga: { ...proposedCreditMapping.creditAircraftBySaga, ...mapping.creditAircraftBySaga },
      };
      const unmappedCreditModels = creditModels.filter((model) => !cleanString(mapping.creditAircraftBySaga?.[model]));
      if (unmappedCreditModels.length) {
        summary.logs.push(`Creditos sem de-para de modelo: ${unmappedCreditModels.join(", ")}`);
        logLine(`Creditos sem de-para: ${unmappedCreditModels.join(", ")}`);
      }
      await saveSagaAuthSession(cookieJar, payload.email).catch((err) => {
        summary.logs.push(`Sessao SAGA atualizada, mas nao foi possivel salvar os cookies finais: ${err?.message || err}.`);
      });
      const userBySagaId = new Map(importedStudents.map((item) => [cleanString(item.sagaUser.id), item.userId]));
      const creditRowsByUserId = new Map();
      const coveredCreditFingerprints = new Set();
      const expectedSagaCreditDocIdsByUserId = new Map();
      for (const credit of creditRows) {
        const userId = userBySagaId.get(cleanString(credit.sagaUserId));
        if (!userId) continue;
        const list = creditRowsByUserId.get(userId) || [];
        list.push({ ...credit, userId, modelId: cleanString(mapping.creditAircraftBySaga?.[cleanString(credit.model)]) });
        creditRowsByUserId.set(userId, list);
      }
      for (const [userId, userCredits] of creditRowsByUserId.entries()) {
        creditRowsByUserId.set(userId, assignSagaCreditRowOccurrences(userId, userCredits));
      }
      const { settings: creditSalesSettings } = await loadFlightCreditSalesConfig();
      const segmentNightHours = creditSalesSettings.nightHoursDifferentFromDay !== false;

      const effectiveCreditsByUserId = new Map();
      if (segmentNightHours) {
        const nightDemands = collectSagaNightHourDemands(selectedGroups, usersByCanac, mapping, catalogs);
        const nightDemandsByUserId = new Map();
        for (const demand of nightDemands) {
          const list = nightDemandsByUserId.get(demand.userId) || [];
          list.push(demand);
          nightDemandsByUserId.set(demand.userId, list);
        }
        for (const [userId, userCredits] of creditRowsByUserId.entries()) {
          const userDemands = nightDemandsByUserId.get(userId) || [];
          const segmented = segmentSagaCreditsForNight(userCredits, userDemands);
          summary.nightHoursReclassified += segmented.nightHoursReclassified || 0;
          summary.nightCreditRecordsCreated += segmented.nightCreditRecordsCreated || 0;
          if (segmented.uncoveredNightHours > 0) {
            summary.logs.push(`Creditos noturnos: aluno ${userId} com ${segmented.uncoveredNightHours}h sem saldo diurno suficiente para reclassificar.`);
          }
          let effectiveCredits = segmented.effectiveCredits;
          if (!effectiveCredits.length && userCredits.length) {
            effectiveCredits = buildSagaUnsegmentedCredits(userCredits);
            summary.logs.push(
              `Creditos: segmentacao noturna nao gerou pacotes para o aluno ${userId}; importando ${effectiveCredits.length} pacote(s) diurno(s) original(is).`,
            );
          }
          effectiveCreditsByUserId.set(userId, effectiveCredits);
        }
      } else {
        for (const [userId, userCredits] of creditRowsByUserId.entries()) {
          effectiveCreditsByUserId.set(userId, buildSagaUnsegmentedCredits(userCredits));
        }
      }

      const effectiveCreditTotal = Array.from(effectiveCreditsByUserId.values()).reduce((acc, credits) => acc + credits.length, 0);
      let effectiveCreditIndex = 0;
      for (const [userId, effectiveCredits] of effectiveCreditsByUserId.entries()) {
        for (const credit of effectiveCredits) {
          const result = await upsertSagaCredit(actorUserId, credit, userId, mapping, catalogs, { testMode, createOnly: immutableSync });
          if (result.created) {
            summary.creditsCreated += 1;
            summary.creditHoursImported += result.hours || 0;
            coveredCreditFingerprints.add(sagaCreditFingerprint(userId, credit._sourceCredit || credit));
            if (result.docId) {
              const set = expectedSagaCreditDocIdsByUserId.get(userId) || new Set();
              set.add(cleanString(result.docId));
              expectedSagaCreditDocIdsByUserId.set(userId, set);
            }
          } else if (result.updated) {
            summary.creditsUpdated += 1;
            summary.creditHoursImported += result.hours || 0;
            coveredCreditFingerprints.add(sagaCreditFingerprint(userId, credit._sourceCredit || credit));
            if (result.docId) {
              const set = expectedSagaCreditDocIdsByUserId.get(userId) || new Set();
              set.add(cleanString(result.docId));
              expectedSagaCreditDocIdsByUserId.set(userId, set);
            }
          } else {
            summary.creditsSkipped += 1;
            if (result.covered) {
              coveredCreditFingerprints.add(sagaCreditFingerprint(userId, credit._sourceCredit || credit));
            }
            if (result.docId) {
              const set = expectedSagaCreditDocIdsByUserId.get(userId) || new Set();
              set.add(cleanString(result.docId));
              expectedSagaCreditDocIdsByUserId.set(userId, set);
            }
            if (result.reason === "missing_credit_aircraft_mapping") summary.missing.creditAircrafts.push(cleanString(result.aircraft));
            summary.skippedCredits.push({
              student: cleanString(credit.studentName),
              model: cleanString(credit.model),
              hours: cleanString(credit.hours || credit.hoursHhmm),
              reason: result.reason || "unknown",
              message: sagaImportCreditSkipReasonLabel(result.reason || "unknown"),
            });
          }
          effectiveCreditIndex += 1;
          await reportProgress("Creditos", `${effectiveCreditIndex}/${effectiveCreditTotal} pacotes de credito processados.`, effectiveCreditIndex, effectiveCreditTotal);
        }
      }
      const financialEntries = financialEntriesInput.filter((entry) =>
        !/cancel|estorn|exclu/i.test(cleanString(entry.status)) &&
        (!immutableSync || (dateBrToIso(entry.data) || "") >= windowStart)
      );
      let financialCoveredByCredit = 0;
      let financialIndex = 0;
      for (const entry of financialEntries) {
        const student = importedStudents.find((item) => sagaFinancialEntryMatchesStudent(entry, item.sagaUser));
        if (!student) {
          financialIndex += 1;
          await reportProgress("Financeiro", `${financialIndex}/${financialEntries.length} lancamentos financeiros analisados.`, financialIndex, financialEntries.length);
          continue;
        }
        const userCreditRows = creditRowsByUserId.get(student.userId) || [];
        const matchedCredit = findSagaCreditForFinancialEntry(entry, student.userId, userCreditRows);
        if (matchedCredit && coveredCreditFingerprints.has(sagaCreditFingerprint(student.userId, matchedCredit))) {
          financialCoveredByCredit += 1;
          financialIndex += 1;
          await reportProgress("Financeiro", `${financialIndex}/${financialEntries.length} lancamentos financeiros analisados.`, financialIndex, financialEntries.length);
          continue;
        }
        const result = await upsertSagaFinancialCredit(actorUserId, entry, student.userId, mapping, catalogs, {
          testMode,
          matchedCredit,
          createOnly: immutableSync,
        });
        if (result.created) {
          summary.financialCreditsCreated += 1;
          summary.creditHoursImported += result.hours || 0;
          if (result.docId) {
            const set = expectedSagaCreditDocIdsByUserId.get(student.userId) || new Set();
            set.add(cleanString(result.docId));
            expectedSagaCreditDocIdsByUserId.set(student.userId, set);
          }
        } else if (result.updated) {
          summary.financialCreditsUpdated += 1;
          summary.creditHoursImported += result.hours || 0;
          if (result.docId) {
            const set = expectedSagaCreditDocIdsByUserId.get(student.userId) || new Set();
            set.add(cleanString(result.docId));
            expectedSagaCreditDocIdsByUserId.set(student.userId, set);
          }
        } else {
          summary.financialCreditsSkipped += 1;
          if (result.covered && matchedCredit) {
            coveredCreditFingerprints.add(sagaCreditFingerprint(student.userId, matchedCredit));
          }
          if (result.reason === "missing_credit_aircraft_mapping") summary.missing.creditAircrafts.push(cleanString(result.aircraft));
          summary.skippedCredits.push({
            student: cleanString(entry.cliente),
            model: cleanString(result.aircraft || entry.natureza),
            hours: cleanString(matchedCredit?.hours || matchedCredit?.hoursHhmm),
            reason: result.reason || "unknown",
            message: sagaImportCreditSkipReasonLabel(result.reason || "unknown"),
          });
        }
        financialIndex += 1;
        await reportProgress("Financeiro", `${financialIndex}/${financialEntries.length} lancamentos financeiros analisados.`, financialIndex, financialEntries.length);
      }
      if (financialEntriesInput.length) {
        summary.logs.push(`Financeiro SAGA: ${summary.financialCreditsCreated} creditos criados, ${summary.financialCreditsUpdated} atualizados, ${summary.financialCreditsSkipped} ignorados, ${financialCoveredByCredit} ja cobertos por creditos SAGA.`);
      }
      const importedStudentsBySagaId = new Map(importedStudents.map((item) => [cleanString(item.sagaUser.id), item]));
      for (const fetchedSagaUserId of immutableSync ? [] : (fetchedSagaUserIds || [])) {
        const importedStudent = importedStudentsBySagaId.get(cleanString(fetchedSagaUserId));
        if (!importedStudent?.userId) continue;
        const expectedDocIds = expectedSagaCreditDocIdsByUserId.get(importedStudent.userId) || new Set();
        const cleanup = await purgeMissingSagaCreditsForUser(importedStudent.userId, expectedDocIds, { testMode });
        if (cleanup.deleted > 0) {
          summary.logs.push(`Creditos SAGA: ${cleanup.deleted} credito(s) removido(s) por nao existir(em) mais no SAGA para o aluno ${importedStudent.userId}.`);
        }
      }
      summary.creditHoursImported = Number(summary.creditHoursImported.toFixed(2));
      summary.nightHoursReclassified = Number(summary.nightHoursReclassified.toFixed(2));
    } catch (err) {
      summary.logs.push(`Creditos SAGA nao importados: ${String(err?.message || err)}`);
    }
  } else if (importedStudents.length) {
    summary.logs.push("Creditos SAGA nao importados: colecao de creditos nao configurada.");
  } else if (!importScope.credits) {
    summary.logs.push("Escopo de import: creditos desativados.");
  }

  summary.missing.aircrafts = uniqueCleanValues(summary.missing.aircrafts);
  summary.missing.courses = uniqueCleanValues(summary.missing.courses);
  summary.missing.students = uniqueCleanValues(summary.missing.students);
  summary.missing.creditAircrafts = uniqueCleanValues(summary.missing.creditAircrafts);
  summary.logs.push(`Usuarios: ${summary.usersCreated} criados, ${summary.usersUpdated} atualizados, ${summary.usersSkipped} ignorados.`);
  summary.logs.push(`Voos: ${summary.flightsCreated} criados, ${summary.flightsUpdated} atualizados, ${summary.duplicateFlights} duplicados, ${summary.flightsSkipped} ignorados.`);
  summary.logs.push(`Escala: ${summary.scheduledFlightsCreated} previstos criados, ${summary.scheduledFlightsUpdated} atualizados, ${summary.scheduledFlightsSkipped} ignorados.`);
  summary.logs.push(`ANAC: ${summary.anacSynced} atualizados, ${summary.anacPending} pendentes, ${summary.anacFailed} falhas.`);
  summary.logs.push(`Creditos: ${summary.creditsCreated} criados, ${summary.creditsUpdated} atualizados, ${summary.creditsSkipped} ignorados (${summary.creditHoursImported}h).`);
  summary.logs.push(`Creditos noturnos: ${summary.nightCreditRecordsCreated} ordens noturnas geradas (${summary.nightHoursReclassified}h reclassificadas).`);
  logLine(`Resumo voos: ${summary.flightsCreated} criados, ${summary.flightsUpdated} atualizados, ${summary.flightsSkipped} ignorados.`);
  logLine(`Resumo creditos: ${summary.creditsCreated} criados, ${summary.creditsUpdated} atualizados, ${summary.creditsSkipped} ignorados.`);
  const compactSummary = compactSagaImportSummary(summary);
  await clearSagaImportPausedState().catch(() => null);
  await saveSagaImportLastSummary(compactSummary).catch((err) => {
    summary.logs.push(`Nao foi possivel salvar resumo da importacao: ${err?.message || err}`);
  });
  await saveSagaImportMapping(mapping).catch((err) => {
    summary.logs.push(`Nao foi possivel persistir de-para final: ${err?.message || err}`);
  });
  await saveSagaImportProgress({
    runId: importRunId,
    status: "completed",
    stage: "Concluido",
    message: `Import finalizado: ${summary.flightsCreated} voos criados, ${summary.flightsUpdated} atualizados, ${summary.flightsSkipped} ignorados.`,
    current: 1,
    total: 1,
    logs: [],
  }).catch(() => null);
  return { ok: true, summary: compactSummary };
  } catch (err) {
    summary.logs.push(`Erro inesperado durante importacao: ${String(err?.message || err)}`);
    logLine(`Erro importacao: ${String(err?.message || err)}`);
    const compactSummary = compactSagaImportSummary(summary);
    await saveSagaImportLastSummary(compactSummary).catch(() => {});
    await saveSagaImportProgress({
      runId: importRunId,
      status: "failed",
      stage: "Erro",
      message: String(err?.message || err).slice(0, 500),
      current: 0,
      total: 1,
      logs: [],
    }).catch(() => null);
    return { ok: false, summary: compactSummary, message: String(err?.message || err) };
  }
}

async function sagaResumeImportData(payload = {}, actorUserId = "saga-import", runtimeLog = null) {
  const runId = cleanString(payload.runId || payload.importRunId);
  const lookupKey = cleanString(payload.lookupKey);
  const missionId = cleanString(payload.missionId);
  if (!runId || !lookupKey || !missionId) {
    throw Object.assign(new Error("Informe runId, lookupKey e missionId para retomar o import."), { status: 400 });
  }
  const paused = await loadSagaImportPausedState(runId);
  const mapping = await loadSagaImportMapping();
  const missionBySaga = { ...(mapping.missionBySaga || {}), [lookupKey]: missionId };
  await saveSagaImportMapping({ ...mapping, missionBySaga }).catch((err) => {
    throw Object.assign(new Error(`Nao foi possivel salvar de-para da missao: ${err?.message || err}`), { status: 500 });
  });
  const resumeFlightIndex = Number.isFinite(Number(payload.resumeFlightIndex))
    ? Math.max(0, Math.floor(Number(payload.resumeFlightIndex)))
    : Number(paused?.checkpoint?.flightIndex) || 0;
  const resumeBody = {
    users: Array.isArray(payload.users) ? payload.users : [],
    flights: Array.isArray(payload.flights) ? payload.flights : [],
    financialEntries: Array.isArray(payload.financialEntries) ? payload.financialEntries : [],
    email: cleanString(payload.email),
    password: String(payload.password || ""),
    scope: payload.scope && typeof payload.scope === "object" ? payload.scope : paused?.payload?.scope,
    testMode: payload.testMode !== false,
    useEmailAlias: payload.useEmailAlias === true,
    selectedSagaUserIds: Array.isArray(payload.selectedSagaUserIds)
      ? payload.selectedSagaUserIds
      : paused?.payload?.selectedSagaUserIds || [],
    importRunId: runId,
    mapping: { ...mapping, missionBySaga },
    resumeRunId: runId,
    resumeFlightIndex,
  };
  return sagaImportData(resumeBody, actorUserId, runtimeLog);
}

function sagaImportSkipReasonLabel(reason) {
  if (reason === "missing_aircraft_mapping") return "Aeronave sem de-para.";
  if (reason === "missing_course_mapping") return "Curso/trilha sem de-para.";
  if (reason === "missing_mission_mapping") return "Missao sem correspondencia na trilha.";
  if (reason === "missing_student") return "Aluno nao encontrado/importado pelo CANAC.";
  if (reason === "missing_schedule_date") return "Data do agendamento nao encontrada.";
  if (reason === "duplicate") return "Voo ja importado.";
  return "Motivo nao identificado.";
}

function sagaImportCreditSkipReasonLabel(reason) {
  if (reason === "missing_credit_aircraft_mapping") return "Aeronave/modelo de credito sem de-para.";
  if (reason === "zero_credit_balance") return "Saldo de credito zerado no SAGA.";
  if (reason === "missing_financial_credit_hours") return "Lancamento financeiro sem horas identificaveis.";
  if (reason === "credits_collection_missing") return "Colecao de creditos nao configurada.";
  if (reason === "already_exists") return "Credito ja importado anteriormente.";
  if (reason === "already_exists_via_cakto") return "Credito ja lancado via Cakto; ignorado para evitar duplicacao.";
  if (reason === "already_exists_local_match") return "Credito ja existe no sistema com os mesmos dados.";
  if (reason === "already_exists_saga_match") return "Credito ja importado do SAGA com os mesmos dados.";
  return "Motivo nao identificado.";
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

const ROLE_PRIORITY = ["admin", "instrutor", "aluno"];

function getEffectiveRole(profile) {
  const active = cleanString(profile?.active_role);
  const legacy = cleanString(profile?.role);
  return normalizeRole(active || legacy);
}

function normalizeRoleList(value, fallback = "aluno") {
  if (Array.isArray(value)) {
    const roles = value
      .map((item) => normalizeRole(String(item)))
      .filter((role, index, arr) => arr.indexOf(role) === index);
    if (roles.length > 0) return roles;
  }
  if (typeof value === "string" && value.trim()) {
    return [normalizeRole(value)];
  }
  return [normalizeRole(fallback)];
}

function pickDefaultActiveRole(roles) {
  for (const role of ROLE_PRIORITY) {
    if (roles.includes(role)) return role;
  }
  return roles[0] || "aluno";
}

function parseProfileRoles(profile) {
  const legacyRole = normalizeRole(profile?.role);
  const roles = Array.isArray(profile?.roles) && profile.roles.length > 0
    ? normalizeRoleList(profile.roles, legacyRole)
    : [legacyRole];
  const activeCandidate = getEffectiveRole(profile);
  const activeRole = roles.includes(activeCandidate) ? activeCandidate : pickDefaultActiveRole(roles);
  return { roles, activeRole };
}

function parseRoleCustomSlugsJson(profile) {
  const raw = profile?.role_custom_slugs_json;
  if (!raw || typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function customSlugForRole(profile, role) {
  const slug = parseRoleCustomSlugsJson(profile)?.[role];
  return slug && typeof slug === "string" ? cleanString(slug) || null : null;
}

function normalizeSlugList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanString(item))
    .filter(Boolean)
    .filter((slug, index, arr) => arr.indexOf(slug) === index);
}

function parseAssignedRoleSlugs(profile) {
  if (Array.isArray(profile?.assigned_role_slugs) && profile.assigned_role_slugs.length > 0) {
    return normalizeSlugList(profile.assigned_role_slugs);
  }
  if (Array.isArray(profile?.roles) && profile.roles.length > 0) {
    const slugs = normalizeSlugList(profile.roles);
    if (slugs.length > 0) return slugs;
  }
  const { roles, activeRole } = parseProfileRoles(profile);
  const slugsMap = parseRoleCustomSlugsJson(profile);
  return roles.map((portal) => slugsMap[portal] || portal);
}

function parseActiveRoleSlug(profile, assignedSlugs) {
  const explicit = cleanString(profile?.active_role_slug);
  if (explicit && assignedSlugs.includes(explicit)) return explicit;
  const activePortal = getEffectiveRole(profile);
  const slugsMap = parseRoleCustomSlugsJson(profile);
  const mapped = slugsMap[activePortal];
  if (mapped && assignedSlugs.includes(mapped)) return mapped;
  if (assignedSlugs.includes(activePortal)) return activePortal;
  return pickDefaultActiveSlug(assignedSlugs);
}

function pickDefaultActiveSlug(slugs) {
  for (const portal of ROLE_PRIORITY) {
    const match = slugs.find((slug) => slug === portal);
    if (match) return match;
  }
  return slugs[0] || "aluno";
}

async function getTenantRoleDocBySlug(slug) {
  const safeSlug = cleanString(slug);
  if (!safeSlug || !TENANT_ROLES_COLLECTION_ID || !DATABASE_ID) return null;
  try {
    const res = await databases.listDocuments(DATABASE_ID, TENANT_ROLES_COLLECTION_ID, [
      sdk.Query.equal("school_id", [SCHOOL_ID]),
      sdk.Query.equal("slug", [safeSlug]),
      sdk.Query.limit(1),
    ]);
    return res.documents[0] || null;
  } catch {
    return null;
  }
}

function parseRolePermissionsJson(value) {
  if (!value || typeof value !== "string") return { tabs: {}, actions: {} };
  try {
    const parsed = JSON.parse(value);
    return {
      tabs: parsed && typeof parsed.tabs === "object" && parsed.tabs ? parsed.tabs : {},
      actions: parsed && typeof parsed.actions === "object" && parsed.actions ? parsed.actions : {},
    };
  } catch {
    return { tabs: {}, actions: {} };
  }
}

async function tenantRoleAllowsTab(slug, tabKey) {
  if (cleanString(slug) === "admin") return true;
  const role = await getTenantRoleDocBySlug(slug);
  if (!role) return false;
  const permissions = parseRolePermissionsJson(role.permissions_json);
  return permissions.tabs?.[tabKey] === true;
}

async function resolvePortalTypeForSlug(slug) {
  const safeSlug = cleanString(slug);
  if (VALID_ROLES.has(safeSlug)) return safeSlug;
  if (!TENANT_ROLES_COLLECTION_ID || !DATABASE_ID) return "aluno";
  try {
    const res = await databases.listDocuments(DATABASE_ID, TENANT_ROLES_COLLECTION_ID, [
      sdk.Query.equal("school_id", [SCHOOL_ID]),
      sdk.Query.equal("slug", [safeSlug]),
      sdk.Query.limit(1),
    ]);
    const portal = cleanString(res.documents[0]?.portal_type);
    return VALID_ROLES.has(portal) ? portal : "aluno";
  } catch {
    return "aluno";
  }
}

function resolveCustomRoleSlugForActive(activeSlug, portalType) {
  if (activeSlug === "admin" && portalType === "admin") return null;
  return activeSlug;
}

async function syncUserRoleLabel(userId, activeRole) {
  const user = await users.get({ userId });
  const labels = Array.from(
    new Set([
      ...(user.labels || []).filter((label) => !VALID_ROLES.has(String(label).toLowerCase())),
      activeRole,
    ]),
  );
  await users.updateLabels({ userId, labels });
  return labels;
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
  if (Array.isArray(value)) return value;
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

function clockDiffMinutes(start, end) {
  const startMinutes = parseClockMinutes(start);
  const endMinutes = parseClockMinutes(end);
  if (startMinutes === null || endMinutes === null) return null;
  const diff = endMinutes >= startMinutes ? endMinutes - startMinutes : endMinutes + 24 * 60 - startMinutes;
  return diff > 0 ? diff : null;
}

function sagaLegBlockMinutes(leg) {
  return clockDiffMinutes(cleanString(leg?.acionamento).slice(0, 5), cleanString(leg?.corte).slice(0, 5));
}

function metaLegBlockMinutes(leg) {
  return clockDiffMinutes(leg?.engineStart, leg?.engineCut);
}

function metaBlockMinutes(meta) {
  let total = 0;
  let found = false;
  for (const leg of meta?.legs || []) {
    const minutes = metaLegBlockMinutes(leg);
    if (minutes === null) continue;
    total += minutes;
    found = true;
  }
  if (found && total > 0) return total;
  return clockDiffMinutes(meta?.header?.departureTimeUtc, meta?.header?.engineCutoffTimeUtc);
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
  return decodeFlightRecordCsv(csvText).meta;
}

function decodeFlightRecordCsv(recordText) {
  const normalized = String(recordText || "").replace(/^\uFEFF/, "");
  const lines = normalized.split(/\r?\n/);
  const first = (lines[0] || "").trim();
  if (!first.startsWith(META_PREFIX)) {
    return { meta: null, telemetryCsv: normalized, telemetryFiles: null };
  }
  let meta = null;
  try {
    const encoded = first.slice(META_PREFIX.length).trim();
    meta = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  } catch {
    meta = null;
  }
  const second = (lines[1] || "").trim();
  if (second.startsWith(TELEMETRY_FILES_PREFIX)) {
    const fallbackCsv = lines.slice(2).join("\n");
    try {
      const encoded = second.slice(TELEMETRY_FILES_PREFIX.length).trim();
      const parsed = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
      const telemetryFiles = Array.isArray(parsed?.files)
        ? parsed.files.filter((file) => file && typeof file.name === "string" && typeof file.text === "string")
        : [];
      if (telemetryFiles.length > 0) {
        return { meta, telemetryCsv: fallbackCsv, telemetryFiles };
      }
    } catch {
      // Fall back to any merged CSV appended after the marker.
    }
    return { meta, telemetryCsv: fallbackCsv, telemetryFiles: null };
  }
  return { meta, telemetryCsv: lines.slice(1).join("\n"), telemetryFiles: null };
}

function encodeFlightRecordCsv({ meta, telemetryCsv, telemetryFiles }) {
  const metaEncoded = Buffer.from(JSON.stringify(meta), "utf8").toString("base64");
  const files = (telemetryFiles || []).filter((file) => cleanString(file?.name) && cleanString(file?.text));
  if (files.length > 0) {
    const filesEncoded = Buffer.from(JSON.stringify({ files }), "utf8").toString("base64");
    return `${META_PREFIX}${metaEncoded}\n${TELEMETRY_FILES_PREFIX}${filesEncoded}`;
  }
  const csv = cleanString(telemetryCsv);
  if (!csv) return `${META_PREFIX}${metaEncoded}\n`;
  return `${META_PREFIX}${metaEncoded}\n${csv}`;
}

function hasDecodedTelemetry(decoded) {
  return Boolean(cleanString(decoded?.telemetryCsv)) || (Array.isArray(decoded?.telemetryFiles) && decoded.telemetryFiles.length > 0);
}

function ghostObservationFromMeta(meta) {
  return cleanString(meta?.preFlight?.objectiveMd || meta?.risk?.commentsMd);
}

function buildGhostSourceFilename(input) {
  const date = cleanString(input.flightDate || input.date).replace(/[^\d-]/g, "") || todayIso();
  const aircraft = cleanString(input.aircraftIdent || input.aircraft).replace(/[^a-z0-9-]/gi, "").toUpperCase() || "AIRCRAFT";
  return `${GHOST_FLIGHT_SOURCE_PREFIX}${date}-${aircraft}-${Date.now()}`;
}

async function userFlightIdentity(userId) {
  const safeUserId = cleanString(userId);
  if (!safeUserId) return { name: "", anac: "" };
  const [profile, user] = await Promise.all([
    getProfileByUserId(safeUserId).catch(() => null),
    users.get({ userId: safeUserId }).catch(() => null),
  ]);
  return {
    name: cleanString(profile?.full_name || profile?.nickname || user?.name || user?.email || safeUserId),
    anac: cleanString(profile?.anac_code),
  };
}

function buildGhostFlightMeta(input, identities) {
  const flightDate = asIsoDate(input.flightDate || input.date);
  const startTime = cleanString(input.startTime || input.time).slice(0, 5);
  const aircraft = cleanString(input.aircraftIdent || input.aircraft).toUpperCase();
  const observation = cleanString(input.observation).slice(0, 4096);
  return {
    header: {
      studentUserId: cleanString(input.studentUserId),
      studentLabel: identities.student.name || cleanString(input.studentUserId),
      studentName: identities.student.name || undefined,
      studentAnac: identities.student.anac || undefined,
      instructorUserId: cleanString(input.instructorUserId),
      instructorName: identities.instructor.name || undefined,
      instructorAnac: identities.instructor.anac || undefined,
      date: flightDate,
      startTime: startTime || undefined,
      departureTimeUtc: startTime || undefined,
      aircraft,
    },
    preFlight: {
      objectiveMd: observation,
      briefingMd: "",
      instructorSuggestionMd: "",
      studentSuggestionMd: "",
    },
    legs: [
      {
        id: "ghost-leg-1",
        date: flightDate,
        role: "",
        studentRole: "",
        instructorRole: "",
        dep: "",
        arr: "",
        landings: 0,
        flightTime: "",
        navTime: "",
        ifrTime: "",
        nightTime: "",
        serviceTime: "",
        engineStart: startTime || "",
        takeoff: "",
        landing: "",
        engineCut: "",
        distance: "",
      },
    ],
    risk: {
      commentsMd: observation,
      dangerMd: "",
      riskMd: "",
      managementMd: "",
      instructorOutcome: "",
      instructorOpinionMd: "",
    },
  };
}

async function createFlightDocumentCompat(docId, payload, permissions) {
  try {
    return await databases.createDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, docId, payload, permissions);
  } catch (err) {
    const message = String(err?.message || "");
    if (!/attribute|unknown|invalid document structure/i.test(message)) throw err;
    const {
      from_to,
      landings,
      block_time_minutes,
      total_flight_minutes,
      total_miles,
      telemetry_present,
      instructor_suggestion_md,
      student_suggestion_md,
      instructor_suggestion_present,
      student_suggestion_present,
      weight_balance_complete,
      is_night,
      training_mission_ids_json,
      flight_seq_number,
      ...compatPayload
    } = payload;
    return databases.createDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, docId, compatPayload, permissions);
  }
}

async function updateDocumentCompat(collectionId, docId, patch, permissions) {
  try {
    if (permissions) return await databases.updateDocument(DATABASE_ID, collectionId, docId, patch, permissions);
    return await databases.updateDocument(DATABASE_ID, collectionId, docId, patch);
  } catch (err) {
    const message = String(err?.message || "");
    if (!/attribute|unknown|invalid document structure/i.test(message)) throw err;
    if (!Object.prototype.hasOwnProperty.call(patch, "flight_id")) throw err;
    const fallback = { flight_id: patch.flight_id };
    if (permissions) return databases.updateDocument(DATABASE_ID, collectionId, docId, fallback, permissions);
    return databases.updateDocument(DATABASE_ID, collectionId, docId, fallback);
  }
}

async function createGhostFlight(actorUserId, input = {}) {
  await requireAdmin(actorUserId);
  const studentUserId = cleanString(input.studentUserId);
  const instructorUserId = cleanString(input.instructorUserId);
  const aircraftIdent = cleanString(input.aircraftIdent || input.aircraft).toUpperCase();
  const flightDate = asIsoDate(input.flightDate || input.date);
  const startTime = cleanString(input.startTime || input.time).slice(0, 5);
  if (!studentUserId || !instructorUserId || !aircraftIdent || !flightDate) {
    throw Object.assign(new Error("Informe data, aeronave, instrutor e aluno para criar o voo temporario."), { status: 400 });
  }

  const identities = {
    student: await userFlightIdentity(studentUserId),
    instructor: await userFlightIdentity(instructorUserId),
  };
  const meta = buildGhostFlightMeta({ ...input, studentUserId, instructorUserId, aircraftIdent, flightDate, startTime }, identities);
  const csvText = encodeFlightRecordCsv({ meta, telemetryCsv: "" });
  const sourceFilename = buildGhostSourceFilename({ flightDate, aircraftIdent });
  const docId = sdk.ID.unique();
  const doc = await createFlightDocumentCompat(
    docId,
    {
      school_id: SCHOOL_ID,
      user_id: studentUserId,
      student_user_id: studentUserId,
      instructor_user_id: instructorUserId,
      created_by_role: "admin",
      name: `Voo temporario ${aircraftIdent} ${flightDate}${startTime ? ` ${startTime}` : ""}`,
      source_filename: sourceFilename,
      csv_text: csvText,
      csv_file_id: null,
      aircraft_ident: aircraftIdent,
      duration_sec: null,
      flight_date: flightDate,
      start_time: startTime || null,
      training_track_id: null,
      training_stage_id: null,
      training_mission_id: null,
      training_snapshot_json: null,
      flight_status: "Realizado",
      from_to: "Voo temporario sem ficha SAGA",
      landings: null,
      block_time_minutes: null,
      total_flight_minutes: null,
      total_miles: null,
      telemetry_present: false,
      instructor_suggestion_md: null,
      student_suggestion_md: null,
      instructor_suggestion_present: false,
      student_suggestion_present: false,
      weight_balance_complete: false,
      is_night: false,
      training_mission_ids_json: null,
      flight_seq_number: null,
    },
    ghostFlightPermissions(instructorUserId),
  );
  await createAuditEvent(actorUserId, {
    eventType: "ghost_flight_created",
    entityType: "flight",
    entityId: doc.$id,
    reason: cleanString(input.observation) || "Voo temporario criado para upload antecipado.",
    afterSnapshot: { flightId: doc.$id, studentUserId, instructorUserId, aircraftIdent, flightDate, startTime },
  });
  return { flight: toFlight({ ...doc, csv_text: csvText }) };
}

async function updateGhostFlight(actorUserId, input = {}) {
  await requireAdmin(actorUserId);
  const flightId = cleanString(input.flightId || input.id);
  if (!flightId) throw Object.assign(new Error("Voo temporario nao informado."), { status: 400 });
  const current = await databases.getDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, flightId, selectQuery(FLIGHT_DETAIL_SELECT));
  if (!isGhostFlightDoc(current)) throw Object.assign(new Error("O voo informado nao e um voo temporario."), { status: 400 });

  const studentUserId = cleanString(input.studentUserId || current.student_user_id || current.user_id);
  const instructorUserId = cleanString(input.instructorUserId || current.instructor_user_id);
  const aircraftIdent = cleanString(input.aircraftIdent || input.aircraft || current.aircraft_ident).toUpperCase();
  const flightDate = asIsoDate(input.flightDate || input.date || current.flight_date);
  const startTime = cleanString(input.startTime ?? input.time ?? current.start_time).slice(0, 5);
  if (!studentUserId || !instructorUserId || !aircraftIdent || !flightDate) {
    throw Object.assign(new Error("Informe data, aeronave, instrutor e aluno para atualizar o voo temporario."), { status: 400 });
  }

  const [currentCsvText, identities] = await Promise.all([
    loadFlightCsvText(current),
    Promise.all([userFlightIdentity(studentUserId), userFlightIdentity(instructorUserId)]),
  ]);
  const decoded = decodeFlightRecordCsv(currentCsvText);
  const meta = buildGhostFlightMeta({ ...input, studentUserId, instructorUserId, aircraftIdent, flightDate, startTime }, {
    student: identities[0],
    instructor: identities[1],
  });
  const csvText = encodeFlightRecordCsv({
    meta,
    telemetryCsv: decoded.telemetryCsv,
    telemetryFiles: decoded.telemetryFiles,
  });
  const patch = {
    user_id: studentUserId,
    student_user_id: studentUserId,
    instructor_user_id: instructorUserId,
    name: `Voo temporario ${aircraftIdent} ${flightDate}${startTime ? ` ${startTime}` : ""}`,
    csv_text: csvText,
    aircraft_ident: aircraftIdent,
    flight_date: flightDate,
    start_time: startTime || null,
  };
  if (!isGhostFlightSource(current.source_filename)) {
    patch.source_filename = buildGhostSourceFilename({ flightDate, aircraftIdent });
  }
  const updated = await databases.updateDocument(
    DATABASE_ID,
    FLIGHTS_COLLECTION_ID,
    flightId,
    patch,
    ghostFlightPermissions(instructorUserId),
  );
  await createAuditEvent(actorUserId, {
    eventType: "ghost_flight_updated",
    entityType: "flight",
    entityId: flightId,
    reason: cleanString(input.observation) || "Voo temporario atualizado.",
    beforeSnapshot: {
      studentUserId: current.student_user_id || current.user_id || null,
      instructorUserId: current.instructor_user_id || null,
      aircraftIdent: current.aircraft_ident || null,
      flightDate: current.flight_date || null,
      startTime: current.start_time || null,
    },
    afterSnapshot: { flightId, studentUserId, instructorUserId, aircraftIdent, flightDate, startTime },
  });
  return { flight: toFlight({ ...updated, csv_text: csvText }) };
}

async function deleteGhostFlight(actorUserId, input = {}) {
  await requireAdmin(actorUserId);
  const flightId = cleanString(input.flightId || input.id);
  if (!flightId) throw Object.assign(new Error("Voo temporario nao informado."), { status: 400 });
  const ghost = await databases.getDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, flightId, selectQuery(FLIGHT_DETAIL_SELECT));
  if (!isGhostFlightDoc(ghost)) throw Object.assign(new Error("O voo informado nao e um voo temporario."), { status: 400 });

  const summary = { deletedDocuments: 0, deletedByCollection: {}, deletedFiles: 0, fileErrors: [], errors: [] };
  await deleteDocsByEqual(summary, FLIGHT_MANEUVER_REVIEWS_COLLECTION_ID, "flight_id", [flightId]);
  await deleteDocsByEqual(summary, FLIGHT_MANEUVERS_COLLECTION_ID, "flight_id", [flightId]);
  await deleteDocsByEqual(summary, FLIGHT_VIDEOS_COLLECTION_ID, "flight_id", [flightId]);
  await deleteDocsByEqual(summary, FLIGHT_TELEMETRY_SUMMARIES_COLLECTION_ID, "flight_id", [flightId]);
  await deleteDocsByEqual(summary, FLIGHT_LANDINGS_COLLECTION_ID, "flight_id", [flightId]);
  await deleteDocsByEqual(summary, FLIGHT_TAKEOFFS_COLLECTION_ID, "flight_id", [flightId]);
  await deleteDocsByEqual(summary, FLIGHT_TELEMETRY_ALERTS_COLLECTION_ID, "flight_id", [flightId]);
  if (ghost.csv_file_id && FLIGHTS_CSV_BUCKET_ID) {
    await deleteStorageFileQuietly(summary, FLIGHTS_CSV_BUCKET_ID, ghost.csv_file_id);
  }
  await databases.deleteDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, flightId);
  summary.deletedDocuments += 1;
  summary.deletedByCollection[FLIGHTS_COLLECTION_ID] = (summary.deletedByCollection[FLIGHTS_COLLECTION_ID] || 0) + 1;
  await createAuditEvent(actorUserId, {
    eventType: "ghost_flight_deleted",
    entityType: "flight",
    entityId: flightId,
    reason: cleanString(input.reason) || "Voo temporario excluido.",
    beforeSnapshot: {
      flightId,
      studentUserId: ghost.student_user_id || ghost.user_id || null,
      instructorUserId: ghost.instructor_user_id || null,
      aircraftIdent: ghost.aircraft_ident || null,
      flightDate: ghost.flight_date || null,
      startTime: ghost.start_time || null,
    },
    afterSnapshot: summary,
  });
  return { ok: true, flightId, deleted: summary };
}

async function listFlightVideosForFlight(flightId) {
  if (!FLIGHT_VIDEOS_COLLECTION_ID || !flightId) return [];
  return listAllDocuments(FLIGHT_VIDEOS_COLLECTION_ID, [
    sdk.Query.equal("flight_id", [flightId]),
    ...selectQuery(["$id", "$permissions", "flight_id", "uploaded_by", "processing_status"]),
  ]);
}

async function hasMaterializedTelemetry(flightId) {
  const docs = await listDocumentsByFieldIn(
    FLIGHT_TELEMETRY_SUMMARIES_COLLECTION_ID,
    "flight_id",
    [flightId],
    selectQuery(["$id", "telemetry_present"]),
    1,
  );
  return docs.some((doc) => doc.telemetry_present !== false);
}

function isSagaRealFlight(doc) {
  return !isGhostFlightDoc(doc) && (cleanString(doc?.saga_flight_id) || cleanString(doc?.source_filename).toLowerCase().includes("saga"));
}

async function listGhostMergeCandidates(actorUserId, input = {}) {
  await requireAdmin(actorUserId);
  const ghostFlightId = cleanString(input.ghostFlightId || input.flightId);
  if (!ghostFlightId) throw Object.assign(new Error("Voo temporario nao informado."), { status: 400 });
  const ghost = await databases.getDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, ghostFlightId, selectQuery(FLIGHT_DETAIL_SELECT));
  if (!isGhostFlightDoc(ghost)) throw Object.assign(new Error("O voo informado nao e um voo temporario."), { status: 400 });

  const queries = [
    sdk.Query.equal("school_id", [SCHOOL_ID]),
    sdk.Query.equal("flight_status", ["Realizado"]),
    sdk.Query.limit(100),
    sdk.Query.orderDesc("flight_date"),
    sdk.Query.orderDesc("start_time"),
    ...selectQuery(FLIGHT_DETAIL_SELECT),
  ];
  if (ghost.flight_date) queries.splice(2, 0, sdk.Query.equal("flight_date", [ghost.flight_date]));
  if (ghost.aircraft_ident) queries.splice(2, 0, sdk.Query.equal("aircraft_ident", [ghost.aircraft_ident]));
  const page = await listDocumentsPage(FLIGHTS_COLLECTION_ID, queries);
  const ghostMeta = decodeFlightMeta(await loadFlightCsvText(ghost));
  const candidates = [];
  for (const doc of page.documents) {
    if (doc.$id === ghostFlightId || !isSagaRealFlight(doc)) continue;
    const docStudentUserId = cleanString(doc.student_user_id || doc.user_id);
    const ghostStudentUserId = cleanString(ghost.student_user_id || ghost.user_id);
    if (ghostStudentUserId && docStudentUserId && ghostStudentUserId !== docStudentUserId) continue;
    const decoded = decodeFlightRecordCsv(await loadFlightCsvText(doc));
    const videos = await listFlightVideosForFlight(doc.$id);
    const telemetryBlocked = Boolean(doc.telemetry_present) || hasDecodedTelemetry(decoded) || (await hasMaterializedTelemetry(doc.$id));
    candidates.push({
      ...toFlight({ ...doc, csv_text: encodeFlightRecordCsv({ meta: decoded.meta || decodeFlightMeta(doc.csv_text), telemetryCsv: decoded.telemetryCsv, telemetryFiles: decoded.telemetryFiles }) }),
      mergeBlockedReason: telemetryBlocked
        ? "Voo real ja possui telemetria."
        : videos.length > 0
          ? "Voo real ja possui video."
          : "",
      matchScore:
        (doc.aircraft_ident && doc.aircraft_ident === ghost.aircraft_ident ? 40 : 0) +
        (doc.flight_date && doc.flight_date === ghost.flight_date ? 30 : 0) +
        (docStudentUserId && docStudentUserId === ghostStudentUserId ? 20 : 0) +
        (doc.instructor_user_id && doc.instructor_user_id === ghost.instructor_user_id ? 10 : 0) +
        (ghostMeta?.header?.startTime && doc.start_time === ghostMeta.header.startTime ? 5 : 0),
    });
  }
  candidates.sort((a, b) => b.matchScore - a.matchScore || flightDateTimeKey(b).localeCompare(flightDateTimeKey(a)));
  return { candidates: candidates.slice(0, 25) };
}

async function reassignFlightChildren(collectionId, fromFlightId, toFlightId, patchExtras = {}, permissionsForDoc = null) {
  if (!collectionId) return 0;
  const docs = await listAllDocuments(collectionId, [sdk.Query.equal("flight_id", [fromFlightId])]);
  for (const doc of docs) {
    const permissions = typeof permissionsForDoc === "function" ? permissionsForDoc(doc) : undefined;
    await updateDocumentCompat(collectionId, doc.$id, { flight_id: toFlightId, ...patchExtras }, permissions);
  }
  return docs.length;
}

async function finalizeGhostFlightMerge(actorUserId, input = {}) {
  await requireAdmin(actorUserId);
  const ghostFlightId = cleanString(input.ghostFlightId);
  const realFlightId = cleanString(input.realFlightId);
  if (!ghostFlightId || !realFlightId || ghostFlightId === realFlightId) {
    throw Object.assign(new Error("Informe o voo temporario e o voo real."), { status: 400 });
  }
  const [ghost, real] = await Promise.all([
    databases.getDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, ghostFlightId, selectQuery(FLIGHT_DETAIL_SELECT)),
    databases.getDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, realFlightId, selectQuery(FLIGHT_DETAIL_SELECT)),
  ]);
  if (!isGhostFlightDoc(ghost)) throw Object.assign(new Error("O voo de origem nao e temporario."), { status: 400 });
  if (isGhostFlightDoc(real) || !isSagaRealFlight(real)) throw Object.assign(new Error("Selecione um voo real importado do SAGA."), { status: 400 });

  const [ghostCsvText, realCsvText, ghostVideos, realVideos] = await Promise.all([
    loadFlightCsvText(ghost),
    loadFlightCsvText(real),
    listFlightVideosForFlight(ghostFlightId),
    listFlightVideosForFlight(realFlightId),
  ]);
  const pendingGhostVideo = ghostVideos.find((video) => ["processing", "uploading"].includes(cleanString(video.processing_status)));
  if (pendingGhostVideo) throw Object.assign(new Error("Aguarde o processamento do video temporario terminar antes de apontar para o voo real."), { status: 409 });
  if (realVideos.length > 0) throw Object.assign(new Error("O voo real ja possui video vinculado."), { status: 409 });

  const ghostDecoded = decodeFlightRecordCsv(ghostCsvText);
  const realDecoded = decodeFlightRecordCsv(realCsvText);
  const realHasTelemetry = Boolean(real.telemetry_present) || hasDecodedTelemetry(realDecoded) || (await hasMaterializedTelemetry(realFlightId));
  if (realHasTelemetry) throw Object.assign(new Error("O voo real ja possui telemetria."), { status: 409 });
  if (!realDecoded.meta) throw Object.assign(new Error("A ficha do voo real nao possui metadados validos."), { status: 409 });

  const mergedCsvText = encodeFlightRecordCsv({
    meta: realDecoded.meta,
    telemetryCsv: ghostDecoded.telemetryCsv,
    telemetryFiles: ghostDecoded.telemetryFiles,
  });
  const ghostHasTelemetry = hasDecodedTelemetry(ghostDecoded);
  await updateDocumentCompat(FLIGHTS_COLLECTION_ID, realFlightId, {
    csv_text: mergedCsvText,
    csv_file_id: null,
    duration_sec: ghost.duration_sec || real.duration_sec || null,
    telemetry_present: ghostHasTelemetry,
  });

  const identityPatch = {
    student_user_id: real.student_user_id || real.user_id || null,
    instructor_user_id: real.instructor_user_id || null,
    aircraft_ident: real.aircraft_ident || null,
    flight_date: real.flight_date || null,
    start_time: real.start_time || null,
  };
  const transferred = {
    videos: await reassignFlightChildren(
      FLIGHT_VIDEOS_COLLECTION_ID,
      ghostFlightId,
      realFlightId,
      {},
      (video) => flightVideoPermissions(video, real),
    ),
    telemetrySummaries: await reassignFlightChildren(FLIGHT_TELEMETRY_SUMMARIES_COLLECTION_ID, ghostFlightId, realFlightId, identityPatch),
    landings: await reassignFlightChildren(FLIGHT_LANDINGS_COLLECTION_ID, ghostFlightId, realFlightId, identityPatch),
    takeoffs: await reassignFlightChildren(FLIGHT_TAKEOFFS_COLLECTION_ID, ghostFlightId, realFlightId, identityPatch),
    alerts: await reassignFlightChildren(FLIGHT_TELEMETRY_ALERTS_COLLECTION_ID, ghostFlightId, realFlightId, identityPatch),
    maneuvers: await reassignFlightChildren(FLIGHT_MANEUVERS_COLLECTION_ID, ghostFlightId, realFlightId, {
      student_id: real.student_user_id || real.user_id || null,
      instructor_id: real.instructor_user_id || null,
      aircraft_ident: real.aircraft_ident || null,
    }),
    reviews: await reassignFlightChildren(FLIGHT_MANEUVER_REVIEWS_COLLECTION_ID, ghostFlightId, realFlightId),
  };

  if (ghost.csv_file_id && FLIGHTS_CSV_BUCKET_ID) {
    await storage.deleteFile(FLIGHTS_CSV_BUCKET_ID, ghost.csv_file_id).catch(() => undefined);
  }
  await databases.deleteDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, ghostFlightId);
  await createAuditEvent(actorUserId, {
    eventType: "ghost_flight_merged",
    entityType: "flight",
    entityId: realFlightId,
    reason: "Voo temporario apontado para voo real SAGA.",
    beforeSnapshot: { ghostFlightId, realFlightId },
    afterSnapshot: { transferred },
  });
  return { ok: true, realFlightId, ghostFlightId, transferred };
}

function mergeSagaFlightMetaWithExisting(sagaMeta, existingMeta, { preserveTraining = true } = {}) {
  if (!sagaMeta) return existingMeta;
  if (!existingMeta) return sagaMeta;
  return {
    ...sagaMeta,
    schedule: existingMeta.schedule ?? sagaMeta.schedule,
    // preserveTraining: ajuste manual/skip de missão mantém o training existente;
    // caso contrário (resolução nova do SAGA ou remap explícito) o novo vence.
    training: preserveTraining
      ? (existingMeta.training ?? sagaMeta.training)
      : (sagaMeta.training ?? existingMeta.training),
    cancellation: existingMeta.cancellation ?? sagaMeta.cancellation,
    technicalLog: existingMeta.technicalLog ?? sagaMeta.technicalLog,
    maintenanceSnapshot: existingMeta.maintenanceSnapshot ?? sagaMeta.maintenanceSnapshot,
    preFlight: {
      ...(sagaMeta.preFlight || {}),
      instructorSuggestionMd: existingMeta.preFlight?.instructorSuggestionMd ?? sagaMeta.preFlight?.instructorSuggestionMd ?? "",
      studentSuggestionMd: existingMeta.preFlight?.studentSuggestionMd ?? sagaMeta.preFlight?.studentSuggestionMd ?? "",
    },
    weightBalance: sagaMeta.weightBalance || existingMeta.weightBalance || undefined,
  };
}

function mergeSagaCsvPreservingTelemetry(sagaCsvText, existingCsvText, { preserveTraining = true } = {}) {
  const sagaDecoded = decodeFlightRecordCsv(sagaCsvText);
  const existingDecoded = decodeFlightRecordCsv(existingCsvText);
  const mergedMeta = mergeSagaFlightMetaWithExisting(sagaDecoded.meta, existingDecoded.meta, { preserveTraining });
  const telemetryCsv = cleanString(existingDecoded.telemetryCsv);
  const telemetryFiles = existingDecoded.telemetryFiles;
  const hasTelemetry = Boolean(telemetryCsv) || (Array.isArray(telemetryFiles) && telemetryFiles.length > 0);
  const csvText = encodeFlightRecordCsv({
    meta: mergedMeta || sagaDecoded.meta || existingDecoded.meta,
    telemetryCsv,
    telemetryFiles,
  });
  return { csvText, hasTelemetry };
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
  const today = new Date().toISOString().slice(0, 10);
  return date >= today;
}

function isCompletedFlight(flight) {
  if (isFutureFlight(flight)) return false;
  if (isScheduledFlightStatusValue(flight.flightStatus)) return false;
  const hasDuration = (flight.durationSec || 0) > 0;
  if (!hasDuration) return false;
  // SAGA may import realized flights with duration but zero landing count (e.g. local SBJD->SBJD).
  return (flight.landings || 0) > 0 || flight.flightStatus === "Realizado";
}

function normalizeFlightStatus(value, flight) {
  if (VALID_FLIGHT_STATUSES.has(value)) return value;
  return isFutureFlight(flight) ? "Confirmado" : "Realizado";
}

function parseInstructorAvailability(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row) =>
        typeof row.dayOfWeek === "number" &&
        (row.period === "morning" || row.period === "afternoon" || row.period === "night") &&
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
        (row.period === "morning" || row.period === "afternoon" || row.period === "night") &&
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
    weekday_only: Boolean(credit.weekdayOnly ?? false),
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

function toProfileDocuments(docs) {
  const allowed = new Set([
    "identification",
    "voterTitle",
    "proofOfResidence",
    "militaryCertificate",
    "enrollmentForm",
  ]);
  const documents = {};
  for (const doc of docs || []) {
    const type = doc.document_type || "";
    if (!allowed.has(type) || !doc.file_id) continue;
    documents[type] = {
      fileId: doc.file_id,
      fileName: doc.file_name || "Documento",
      mimeType: doc.mime_type || "application/octet-stream",
      size: typeof doc.file_size === "number" ? doc.file_size : 0,
      uploadedAt: doc.uploaded_at || "",
    };
  }
  return documents;
}

async function getProfileDocumentsByUserIds(userIds) {
  if (!PROFILE_DOCUMENTS_COLLECTION_ID || !userIds.length) return new Map();
  const docs = [];
  const batchSize = 50;
  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);
    docs.push(
      ...(await listAllDocuments(PROFILE_DOCUMENTS_COLLECTION_ID, [
        sdk.Query.equal("user_id", batch),
        ...selectQuery(PROFILE_DOCUMENT_SELECT),
      ]).catch(() => [])),
    );
  }
  const grouped = new Map();
  for (const doc of docs) {
    const userId = doc.user_id || "";
    if (!userId) continue;
    if (!grouped.has(userId)) grouped.set(userId, []);
    grouped.get(userId).push(doc);
  }
  return new Map(Array.from(grouped.entries()).map(([userId, rows]) => [userId, toProfileDocuments(rows)]));
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

async function resolveProfilePortal(profile) {
  if (!profile) return "";
  const assigned = parseAssignedRoleSlugs(profile);
  const activeSlug = parseActiveRoleSlug(profile, assigned);
  if (activeSlug === "admin") return "admin";
  const fromSlug = await resolvePortalTypeForSlug(activeSlug);
  if (fromSlug) return fromSlug;
  return getEffectiveRole(profile);
}

async function requireAdmin(actorUserId) {
  if (!actorUserId) throw Object.assign(new Error("Unauthorized request."), { status: 401 });
  const [profile, actor] = await Promise.all([getProfileByUserId(actorUserId), users.get({ userId: actorUserId })]);
  const profilePortal = await resolveProfilePortal(profile);
  const labelRole = deriveRoleFromLabels(actor?.labels || []);
  if (profilePortal !== "admin" && labelRole !== "admin") {
    throw Object.assign(new Error("Apenas administradores podem acessar usuarios."), { status: 403 });
  }
  return actor;
}

async function requireInstructorOrAdmin(actorUserId) {
  if (!actorUserId) throw Object.assign(new Error("Unauthorized request."), { status: 401 });
  const [profile, actor] = await Promise.all([getProfileByUserId(actorUserId), users.get({ userId: actorUserId })]);
  const profilePortal = await resolveProfilePortal(profile);
  const labelRole = deriveRoleFromLabels(actor?.labels || []);
  if (!["admin", "instrutor"].includes(profilePortal) && !["admin", "instrutor"].includes(labelRole)) {
    throw Object.assign(new Error("Apenas administradores ou instrutores podem consultar voos do SAGA."), { status: 403 });
  }
  return actor;
}

async function requireUsersListAccess(actorUserId) {
  if (!actorUserId) throw Object.assign(new Error("Unauthorized request."), { status: 401 });
  const [profile, actor] = await Promise.all([getProfileByUserId(actorUserId), users.get({ userId: actorUserId })]);
  const profilePortal = await resolveProfilePortal(profile);
  const labelRole = deriveRoleFromLabels(actor?.labels || []);
  if (profilePortal === "admin" || labelRole === "admin") return actor;
  if (profilePortal !== "instrutor" && labelRole !== "instrutor") {
    throw Object.assign(new Error("Apenas administradores ou instrutores podem acessar usuarios."), { status: 403 });
  }
  const assigned = parseAssignedRoleSlugs(profile);
  const activeSlug = parseActiveRoleSlug(profile, assigned);
  if (await tenantRoleAllowsTab(activeSlug, "users")) return actor;
  throw Object.assign(new Error("Role sem permissao para acessar usuarios."), { status: 403 });
}

function contractPermissions(recipientUserId) {
  return [
    sdk.Permission.read(sdk.Role.users()),
    sdk.Permission.update(sdk.Role.label("admin")),
    sdk.Permission.delete(sdk.Role.label("admin")),
    sdk.Permission.read(sdk.Role.user(recipientUserId)),
  ];
}

function profileDocumentPermissions(userId) {
  return [
    sdk.Permission.read(sdk.Role.users()),
    sdk.Permission.read(sdk.Role.user(userId)),
    sdk.Permission.update(sdk.Role.user(userId)),
    sdk.Permission.delete(sdk.Role.user(userId)),
  ];
}

function signaturePermissions() {
  return [
    sdk.Permission.read(sdk.Role.users()),
    sdk.Permission.update(sdk.Role.label("admin")),
    sdk.Permission.delete(sdk.Role.label("admin")),
  ];
}

function parseJsonSafe(value, fallback) {
  if (!value || typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function richTextDoc(text) {
  return JSON.stringify({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  });
}

function sagaOnlyDigits(value) {
  return cleanString(value).replace(/\D/g, "");
}

function formatSagaCpf(value) {
  const digits = sagaOnlyDigits(value).slice(0, 11);
  if (digits.length !== 11) return cleanString(value);
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function toSagaBirthdate(value) {
  const raw = cleanString(value);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return dateBrToIso(raw) || raw.slice(0, 10);
}

function mapSagaGender(sexo) {
  const normalized = cleanString(sexo).toUpperCase();
  return normalized === "F" ? "F" : normalized === "M" ? "M" : "";
}

function resolveSagaCourseName(trackId, trackName, mapping) {
  const courseBySaga = mapping?.courseBySaga || {};
  for (const [sagaCourse, gfTrackId] of Object.entries(courseBySaga)) {
    if (cleanString(gfTrackId) === cleanString(trackId)) return sagaCourse;
  }
  return cleanString(trackName);
}

const SAGA_ENROLLMENT_COURSE = "Piloto Privado - Prático";

function stripSagaAnacForStorage(data) {
  if (!data || typeof data !== "object") return null;
  const { picture_jpeg, ...rest } = data;
  return rest;
}

function parseSagaAnacFromLeadOrProfile(profile, lead) {
  const raw = cleanString(lead?.saga_anac_json) || cleanString(profile?.saga_anac_json);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function fetchSagaAnacPerson(cookieJar, { anacCode, birthDate, cpf }) {
  const anacDigits = sagaOnlyDigits(anacCode);
  const cpfDigits = sagaOnlyDigits(cpf);
  const birth = toSagaBirthdate(birthDate);
  if (!anacDigits || cpfDigits.length !== 11 || !birth) {
    return { ok: false, message: "ANAC, CPF (11 digitos) e data de nascimento sao obrigatorios." };
  }
  const path = `/anac/person/${anacDigits}/${birth}/${cpfDigits}`;
  const result = await sagaFetch(
    path,
    {
      method: "GET",
      headers: {
        accept: "application/json, text/javascript, */*; q=0.01",
        referer: `${SAGA_BASE_URL}/users/create?access_type=student`,
        "x-requested-with": "XMLHttpRequest",
      },
    },
    cookieJar,
  );
  if (isSagaLoginResponse(result)) {
    return { ok: false, message: "Sessao SAGA expirada na consulta ANAC." };
  }
  if (result.response.status >= 400) {
    return { ok: false, message: `SAGA retornou HTTP ${result.response.status} na consulta ANAC.` };
  }
  try {
    const data = JSON.parse(result.html);
    if (!cleanString(data?.name)) {
      return { ok: false, message: "Dados ANAC nao encontrados no SAGA." };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, message: "Resposta invalida da consulta ANAC no SAGA." };
  }
}

async function resolveSagaAnacPersonData(cookieJar, profile, lead) {
  const cached = parseSagaAnacFromLeadOrProfile(profile, lead);
  if (cached?.name) return { ok: true, data: cached, source: "cache" };
  const anacCode = cleanString(profile?.anac_code) || cleanString(lead?.anac_code);
  const birthDate = cleanString(profile?.birth_date) || cleanString(lead?.birth_date);
  const cpf = cleanString(profile?.cpf) || cleanString(lead?.cpf);
  const fetched = await fetchSagaAnacPerson(cookieJar, { anacCode, birthDate, cpf });
  if (!fetched.ok) return fetched;
  return { ok: true, data: fetched.data, source: "saga" };
}

function appendSagaAnacFieldsToForm(form, sagaAnac) {
  if (!sagaAnac || typeof sagaAnac !== "object") return;
  const cma = sagaAnac.cma && typeof sagaAnac.cma === "object" ? sagaAnac.cma : {};
  form.set("medical_certificate[class]", cleanString(cma.class));
  form.set("medical_certificate[val]", cleanString(cma.val));
  form.set("medical_certificate[issued_by]", cleanString(cma.issued_by));
  form.set("medical_certificate[remarks]", typeof cma.remarks === "string" ? cma.remarks : "");
  if (Array.isArray(sagaAnac.licenses)) {
    form.set("licenses", JSON.stringify(sagaAnac.licenses));
  }
  if (Array.isArray(sagaAnac.types)) {
    form.set("types", JSON.stringify(sagaAnac.types));
  }
  if (Array.isArray(sagaAnac.languages)) {
    form.set("languages", JSON.stringify(sagaAnac.languages));
  }
  const anacName = cleanString(sagaAnac.name);
  if (anacName) {
    form.set("name", anacName);
    form.set("nickname", anacName.replace(/\s+/g, ""));
  }
}

async function persistSagaAnacJsonOnLead(leadId, sagaAnac) {
  if (!leadId || !CRM_LEADS_COLLECTION_ID || !sagaAnac) return;
  const stored = stripSagaAnacForStorage(sagaAnac);
  if (!stored) return;
  try {
    await databases.updateDocument(DATABASE_ID, CRM_LEADS_COLLECTION_ID, leadId, {
      saga_anac_json: JSON.stringify(stored),
    });
  } catch (err) {
    const message = String(err?.message || "");
    if (!/attribute|unknown|invalid document structure/i.test(message)) throw err;
  }
}

async function persistSagaAnacJsonOnProfile(recipientUserId, sagaAnac) {
  if (!recipientUserId || !sagaAnac) return;
  const profileDoc = await getProfileByUserId(recipientUserId);
  if (!profileDoc?.$id) return;
  const stored = stripSagaAnacForStorage(sagaAnac);
  if (!stored) return;
  try {
    await databases.updateDocument(DATABASE_ID, PROFILES_COLLECTION_ID, profileDoc.$id, {
      saga_anac_json: JSON.stringify(stored),
    });
  } catch (err) {
    const message = String(err?.message || "");
    if (!/attribute|unknown|invalid document structure/i.test(message)) throw err;
  }
}

function sagaAnacEnrollmentMissingFields(sagaAnac) {
  if (!sagaAnac || typeof sagaAnac !== "object") return ["name"];
  const missing = [];
  if (!cleanString(sagaAnac.name)) missing.push("name");
  const cma = sagaAnac.cma && typeof sagaAnac.cma === "object" ? sagaAnac.cma : {};
  if (!cleanString(cma.class)) missing.push("medical_certificate[class]");
  if (!cleanString(cma.val)) missing.push("medical_certificate[val]");
  if (!cleanString(cma.issued_by)) missing.push("medical_certificate[issued_by]");
  if (typeof cma.remarks !== "string") missing.push("medical_certificate[remarks]");
  if (!Array.isArray(sagaAnac.licenses) || sagaAnac.licenses.length === 0) missing.push("licenses");
  if (!Array.isArray(sagaAnac.types) || sagaAnac.types.length === 0) missing.push("types");
  if (!Array.isArray(sagaAnac.languages) || sagaAnac.languages.length === 0) missing.push("languages");
  return missing;
}

function hasSagaAnacData(profile, lead) {
  const cached = parseSagaAnacFromLeadOrProfile(profile, lead);
  return sagaAnacEnrollmentMissingFields(cached).length === 0;
}

async function lookupSagaAnacPersonCore(cookieJar, payload = {}) {
  const anacCode = cleanString(payload.anacCode);
  const birthDate = cleanString(payload.birthDate);
  const cpf = cleanString(payload.cpf);
  const result = await fetchSagaAnacPerson(cookieJar, { anacCode, birthDate, cpf });
  if (!result.ok) return result;
  const stored = stripSagaAnacForStorage(result.data);
  return { ok: true, data: stored };
}

async function persistSagaAnacLookupResult(payload, stored) {
  const leadId = cleanString(payload.leadId);
  const userId = cleanString(payload.userId);
  const email = cleanString(payload.email).toLowerCase();
  const cpf = cleanString(payload.cpf);
  if (leadId) await persistSagaAnacJsonOnLead(leadId, stored).catch(() => undefined);
  if (userId) await persistSagaAnacJsonOnProfile(userId, stored).catch(() => undefined);
  if (email && CRM_LEADS_COLLECTION_ID && !leadId) {
    try {
      const leads = await listAllDocuments(CRM_LEADS_COLLECTION_ID, [
        sdk.Query.equal("email", [email]),
        sdk.Query.limit(1),
      ]);
      const lead = leads[0];
      if (lead?.$id) {
        const updates = { saga_anac_json: JSON.stringify(stored) };
        const cpfDigits = sagaOnlyDigits(cpf);
        if (cpfDigits.length === 11) updates.cpf = formatSagaCpf(cpfDigits);
        await databases.updateDocument(DATABASE_ID, CRM_LEADS_COLLECTION_ID, lead.$id, updates).catch(() => undefined);
      }
    } catch {
      // best-effort
    }
  }
}

async function lookupSagaAnacPersonPublic(payload = {}) {
  const cookieSession = await loadSagaAuthSession();
  const cookieJar = cookieSession.cookieJar;
  await assertSagaAuthSessionAlive(cookieJar);
  const result = await lookupSagaAnacPersonCore(cookieJar, payload);
  if (!result.ok) return result;
  await saveSagaAuthSession(cookieJar, cookieSession.loginEmail).catch(() => undefined);
  await persistSagaAnacLookupResult(payload, result.data);
  return { ok: true, data: result.data };
}

async function lookupSagaAnacPersonAdmin(actorUserId, payload = {}) {
  await requireAdmin(actorUserId);
  const leadId = cleanString(payload.leadId);
  let anacCode = cleanString(payload.anacCode);
  let birthDate = cleanString(payload.birthDate);
  let cpf = cleanString(payload.cpf);
  let userId = cleanString(payload.userId);
  if (leadId) {
    const lead = await getLeadById(leadId).catch(() => null);
    if (lead) {
      anacCode = anacCode || cleanString(lead.anac_code);
      birthDate = birthDate || cleanString(lead.birth_date);
      cpf = cpf || cleanString(lead.cpf);
      userId = userId || cleanString(lead.user_id);
    }
  }
  if (userId && (!cpf || !anacCode || !birthDate)) {
    const profile = await getProfileByUserId(userId);
    if (profile) {
      anacCode = anacCode || cleanString(profile.anac_code);
      birthDate = birthDate || cleanString(profile.birth_date);
      cpf = cpf || cleanString(profile.cpf);
    }
  }
  const cookieSession = await loadSagaAuthSession();
  const cookieJar = cookieSession.cookieJar;
  await assertSagaAuthSessionAlive(cookieJar);
  const result = await lookupSagaAnacPersonCore(cookieJar, { anacCode, birthDate, cpf });
  if (!result.ok) return result;
  await saveSagaAuthSession(cookieJar, cookieSession.loginEmail).catch(() => undefined);
  await persistSagaAnacLookupResult({ ...payload, leadId, userId, anacCode, birthDate, cpf }, result.data);
  return { ok: true, data: result.data };
}

async function resolveSagaCsrfTokenForUser(cookieJar, sagaUserId) {
  const paths = [`/users/${sagaUserId}/edit`, `/users/${sagaUserId}`];
  for (const path of paths) {
    const page = await sagaFetchHtmlFollow(
      path,
      {
        headers: {
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          referer: `${SAGA_BASE_URL}/users`,
        },
      },
      cookieJar,
    );
    const token = resolveSagaCsrfToken(page.html, cookieJar);
    if (token) return { token, referer: `${SAGA_BASE_URL}${path}` };
  }
  const createContext = await fetchSagaStudentCreateContext(cookieJar);
  if (createContext.token) {
    return {
      token: createContext.token,
      referer: createContext.referer || `${SAGA_BASE_URL}/users/${sagaUserId}`,
    };
  }
  return { token: null, referer: `${SAGA_BASE_URL}/users/${sagaUserId}` };
}

async function deleteSagaUserAdmin(actorUserId, payload = {}) {
  await requireAdmin(actorUserId);
  const sagaUserId = cleanString(payload.sagaUserId);
  const userId = cleanString(payload.userId);
  if (!sagaUserId) {
    throw Object.assign(new Error("ID SAGA nao informado."), { status: 400 });
  }
  const cookieSession = await loadSagaAuthSession();
  const cookieJar = cookieSession.cookieJar;
  await assertSagaAuthSessionAlive(cookieJar);
  const csrf = await resolveSagaCsrfTokenForUser(cookieJar, sagaUserId);
  if (!csrf.token) {
    return { ok: false, message: "Token CSRF do SAGA nao encontrado para exclusao. Faca login novamente em Admin > Import." };
  }
  const form = new URLSearchParams();
  form.set("_token", csrf.token);
  form.set("_method", "DELETE");
  const post = await sagaFetch(
    `/users/${sagaUserId}`,
    {
      method: "POST",
      body: form.toString(),
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "content-type": "application/x-www-form-urlencoded",
        origin: SAGA_BASE_URL,
        referer: csrf.referer,
      },
    },
    cookieJar,
  );
  await saveSagaAuthSession(cookieJar, cookieSession.loginEmail).catch(() => undefined);
  if (isSagaLoginResponse(post)) {
    return { ok: false, message: "Sessao SAGA expirada ao excluir usuario." };
  }
  const status = post.response.status;
  if (status >= 400) {
    return { ok: false, message: `SAGA retornou HTTP ${status} ao excluir usuario.` };
  }
  if (userId) {
    const profileDoc = await getProfileByUserId(userId);
    if (profileDoc?.$id) {
      try {
        await databases.updateDocument(DATABASE_ID, PROFILES_COLLECTION_ID, profileDoc.$id, {
          saga_user_id: null,
        });
      } catch (err) {
        const message = String(err?.message || "");
        if (!/attribute|unknown|invalid document structure/i.test(message)) throw err;
      }
    }
  }
  return { ok: true, message: `Usuario ${sagaUserId} excluido no SAGA.` };
}

function buildSagaStudentForm(profile, lead, token, sagaAnac, { useStudentEmail = false } = {}) {
  const data = contractProfileData(profile, lead);
  const form = new URLSearchParams();
  const anacDigits = sagaOnlyDigits(data.anacCode || lead?.anac_code);
  const fullName = cleanString(data.fullName);
  form.set("_token", token);
  form.set("anac", anacDigits || cleanString(data.anacCode || lead?.anac_code));
  form.set("birthdate", toSagaBirthdate(data.birthDate || lead?.birth_date));
  form.set("cpf", formatSagaCpf(data.cpf || lead?.cpf));
  form.set("business_config_id", "1");
  form.set("name", fullName);
  form.set("nickname", fullName.replace(/\s+/g, ""));
  form.set("course", SAGA_ENROLLMENT_COURSE);
  form.set("access_type", "student");
  form.set("is_coordinator", "0");
  form.set("gender", mapSagaGender(profile?.sexo));
  form.set("email", useStudentEmail ? (cleanString(data.email) || cleanString(lead?.email) || "").toLowerCase() : (anacDigits ? `aluno+${anacDigits}@epeac.com.br` : ""));
  appendSagaAnacFieldsToForm(form, sagaAnac);
  return form;
}

function sagaCreateRedirectLocation(result) {
  return String(result?.response?.headers?.get?.("location") || "");
}

function sagaCreateRedirectPath(result) {
  const location = sagaCreateRedirectLocation(result);
  if (!location) return "";
  try {
    if (location.startsWith("http://") || location.startsWith("https://")) {
      return new URL(location).pathname;
    }
  } catch {
    // ignore malformed Location header
  }
  return location.startsWith("/") ? location.split("?")[0] : `/${location.split("?")[0]}`;
}

function sagaCreateResponseSucceeded(result) {
  const path = sagaCreateRedirectPath(result);
  if (/\/users\/create|\/students\/create/i.test(path)) return false;
  if (extractSagaStudentIdFromResponse(result)) return true;
  const status = result?.response?.status ?? 0;
  if (status === 302 || status === 303) {
    if (/\/users\/\d+/i.test(path) || /\/students\/\d+/i.test(path)) return true;
    // Laravel redireciona para a listagem apos criar com sucesso
    if (/^\/users\/?$/i.test(path) || /^\/students\/?$/i.test(path)) return true;
  }
  return false;
}

async function persistSagaUserIdOnProfile(recipientUserId, sagaUserId) {
  const profileDoc = await getProfileByUserId(recipientUserId);
  if (!profileDoc?.$id) return;
  try {
    await databases.updateDocument(DATABASE_ID, PROFILES_COLLECTION_ID, profileDoc.$id, {
      saga_user_id: cleanString(sagaUserId).slice(0, 64) || null,
    });
  } catch (err) {
    const message = String(err?.message || "");
    if (!/attribute|unknown|invalid document structure/i.test(message)) throw err;
  }
}

async function findSagaUserIdByAnac(cookieJar, anacCode) {
  const anacDigits = sagaOnlyDigits(anacCode);
  if (!anacDigits) return null;
  const users = await sagaFetch(
    `/users/ajax?_=${Date.now()}`,
    {
      method: "GET",
      headers: {
        accept: "application/json, text/javascript, */*; q=0.01",
        referer: `${SAGA_BASE_URL}/users`,
        "x-requested-with": "XMLHttpRequest",
      },
    },
    cookieJar,
  );
  if (isSagaLoginResponse(users)) return null;
  try {
    const usersJson = JSON.parse(users.html);
    const rows = Array.isArray(usersJson?.data) ? usersJson.data.map(translateSagaUserRow) : [];
    const match = rows.find((row) => sagaOnlyDigits(row.codigoAnac) === anacDigits);
    return match?.id ? cleanString(match.id) : null;
  } catch {
    return null;
  }
}

function extractSagaStudentIdFromResponse(result) {
  const location = result?.response?.headers?.get?.("location") || "";
  const locMatch = location.match(/\/(?:students|users)\/(\d+)/i);
  if (locMatch?.[1]) return locMatch[1];
  const html = String(result?.html || "");
  const urlMatch = html.match(/\/(?:students|users)\/(\d+)/i);
  return urlMatch?.[1] || "";
}

async function createSagaStudentFromEnrollment({
  profile,
  lead,
  recipientUserId,
  trainingTrackId,
  trainingTrackName,
  ignoreSagaDuplicates = false,
  useStudentEmail = false,
}) {
  try {
    const existingId = cleanString(profile?.saga_user_id);
    if (existingId) {
      return { ok: true, skipped: true, sagaUserId: existingId, message: "Perfil ja vinculado ao SAGA." };
    }

    const anacCode = cleanString(profile?.anac_code) || cleanString(lead?.anac_code);
    const anacDigits = sagaOnlyDigits(anacCode);
    if (!anacDigits) {
      return { ok: false, message: "Codigo ANAC ausente; nao foi possivel criar no SAGA." };
    }

    const cookieSession = await loadSagaAuthSession();
    const cookieJar = cookieSession.cookieJar;
    await assertSagaAuthSessionAlive(cookieJar);

    if (!ignoreSagaDuplicates) {
      const foundId = await findSagaUserIdByAnac(cookieJar, anacCode);
      if (foundId) {
        await persistSagaUserIdOnProfile(recipientUserId, foundId);
        return { ok: true, skipped: true, sagaUserId: foundId, message: "Aluno ja existia no SAGA; perfil vinculado." };
      }
    }

    const createContext = await fetchSagaStudentCreateContext(cookieJar);
    if (!createContext.token || !createContext.page) {
      const attemptSummary = (createContext.attempts || [])
        .map((item) => `${item.path} HTTP ${item.status}${item.login ? " (login)" : item.token ? " (ok)" : ""}`)
        .join("; ");
      return {
        ok: false,
        message: attemptSummary
          ? `Token CSRF do SAGA nao encontrado na criacao de aluno. Tentativas: ${attemptSummary}. Faca login novamente em Admin > Import.`
          : "Token CSRF do SAGA nao encontrado na tela de criacao de aluno. Faca login novamente em Admin > Import.",
      };
    }

    const sagaAnacResult = await resolveSagaAnacPersonData(cookieJar, profile, lead);
    if (!sagaAnacResult.ok) {
      return { ok: false, message: sagaAnacResult.message || "Nao foi possivel obter dados ANAC no SAGA." };
    }
    const sagaAnac = sagaAnacResult.data;
    const anacMissing = sagaAnacEnrollmentMissingFields(sagaAnac);
    if (anacMissing.length) {
      return {
        ok: false,
        message: `Dados ANAC incompletos para o SAGA: ${anacMissing.join(", ")}. Consulte ANAC novamente no CRM.`,
      };
    }
    if (sagaAnacResult.source === "saga") {
      await persistSagaAnacJsonOnLead(lead?.$id, sagaAnac).catch(() => undefined);
      await persistSagaAnacJsonOnProfile(recipientUserId, sagaAnac).catch(() => undefined);
    }

    const token = createContext.token;
    const createPath = createContext.path || "/users/create";
    const createReferer = createContext.referer || `${SAGA_BASE_URL}${createPath}`;

    const form = buildSagaStudentForm(profile, lead, token, sagaAnac, { useStudentEmail });
    const postResult = await sagaPostStudentCreate(cookieJar, {
      html: createContext.html || createContext.page?.html || "",
      createPath,
      createReferer,
      formBody: form.toString(),
    });
    const post = postResult.post;
    const postPath = postResult.postPath;
    await saveSagaAuthSession(cookieJar, cookieSession.loginEmail).catch(() => undefined);

    if (isSagaLoginResponse(post)) {
      return { ok: false, message: "Sessao SAGA expirada ao enviar cadastro." };
    }

    const status = post.response.status;
    const redirectLocation = sagaCreateRedirectLocation(post);
    if (status >= 400) {
      const attemptSummary = (postResult.attempts || []).map((item) => `${item.postPath} HTTP ${item.status}`).join("; ");
      return {
        ok: false,
        message: attemptSummary
          ? `SAGA retornou HTTP ${status} ao criar aluno. Tentativas: ${attemptSummary}.`
          : `SAGA retornou HTTP ${status} ao criar aluno (POST ${postPath}).`,
      };
    }

    if (!sagaCreateResponseSucceeded(post)) {
      const validationHint = sagaHtmlSnippet(post.html, 240);
      if (/\/users\/create|\/students\/create/i.test(redirectLocation)) {
        return {
          ok: false,
          message: validationHint
            ? `SAGA nao criou o aluno (voltou para cadastro). ${validationHint}`
            : "SAGA nao criou o aluno (redirecionou de volta para a tela de cadastro).",
        };
      }
      if (/erro|invalid|already exists|ja existe|obrigat/i.test(post.html)) {
        return { ok: false, message: `SAGA recusou criacao: ${validationHint}` };
      }
      return {
        ok: false,
        message: redirectLocation
          ? `SAGA nao criou o aluno (HTTP ${status}, Location: ${redirectLocation}).`
          : `SAGA nao criou o aluno (HTTP ${status}).`,
      };
    }

    let sagaUserId = extractSagaStudentIdFromResponse(post);
    if (!sagaUserId) {
      sagaUserId = await findSagaUserIdByAnac(cookieJar, anacCode);
      if (!sagaUserId) {
        return { ok: false, message: "SAGA nao criou o aluno; nao encontrado pela ANAC apos o envio." };
      }
    }

    await persistSagaUserIdOnProfile(recipientUserId, sagaUserId);
    return { ok: true, sagaUserId, message: "Aluno criado no SAGA." };
  } catch (err) {
    return { ok: false, message: String(err?.message || err).slice(0, 500) };
  }
}

function contractProfileData(profile, fallback = {}) {
  return {
    fullName: cleanString(profile?.full_name || fallback.name),
    cpf: cleanString(profile?.cpf),
    phone: cleanString(profile?.phone || fallback.phone),
    birthDate: cleanString(profile?.birth_date),
    email: cleanString(profile?.email || fallback.email),
    rg: cleanString(profile?.rg),
    rgOrgaoExpedidor: cleanString(profile?.rg_orgao_expedidor),
    rgIssueDate: cleanString(profile?.rg_data_emissao),
    endereco: cleanString(profile?.endereco),
    cep: cleanString(profile?.cep),
    city: cleanString(profile?.cidade),
    state: cleanString(profile?.uf),
    nacionalidade: cleanString(profile?.nacionalidade),
    estadoCivil: cleanString(profile?.estado_civil),
    sex: cleanString(profile?.sexo),
    birthplace: cleanString(profile?.naturalidade),
    fatherName: cleanString(profile?.filiacao_pai),
    motherName: cleanString(profile?.filiacao_mae),
    educationLevel: cleanString(profile?.escolaridade),
    educationPeriod: cleanString(profile?.escolaridade_periodo),
    educationCourse: cleanString(profile?.escolaridade_curso),
    allergies: cleanString(profile?.alergias_medicamentos),
    emergencyName: cleanString(profile?.emergencia_nome),
    emergencyRelation: cleanString(profile?.emergencia_parentesco),
    emergencyAddress: cleanString(profile?.emergencia_endereco),
    emergencyPhone: cleanString(profile?.emergencia_telefone),
    anacCode: cleanString(profile?.anac_code),
  };
}

function formatDateBr(value) {
  if (!value) return "";
  const date = new Date(String(value).includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("pt-BR");
}

function resolveSystemContractVars(contentJson, profileData) {
  const map = {
    "{{nome_completo}}": profileData.fullName,
    "{{cpf}}": profileData.cpf,
    "{{rg}}": profileData.rg,
    "{{rg_orgao_expedidor}}": profileData.rgOrgaoExpedidor,
    "{{data_nascimento}}": formatDateBr(profileData.birthDate),
    "{{endereco}}": profileData.endereco,
    "{{nacionalidade}}": profileData.nacionalidade,
    "{{estado_civil}}": profileData.estadoCivil,
    "{{email}}": profileData.email,
    "{{telefone}}": profileData.phone,
    "{{codigo_anac}}": profileData.anacCode,
    "{{data_hoje}}": formatDateBr(new Date().toISOString()),
  };
  let out = String(contentJson || "");
  for (const [key, value] of Object.entries(map)) out = out.split(key).join(value || "");
  return out;
}

async function getLeadById(leadId) {
  if (!CRM_LEADS_COLLECTION_ID) throw Object.assign(new Error("Coleção de CRM não configurada."), { status: 500 });
  return databases.getDocument(DATABASE_ID, CRM_LEADS_COLLECTION_ID, leadId);
}

async function loadCrmStatusSettings() {
  if (!CRM_STATUS_SETTINGS_COLLECTION_ID) return [];
  try {
    const docs = await listAllDocuments(CRM_STATUS_SETTINGS_COLLECTION_ID, [sdk.Query.limit(100)]);
    return docs.map(toStatusSettingFromDoc);
  } catch {
    return [];
  }
}

async function buildCrmLeadStatusChangePayload(lead, targetStatus) {
  const settings = await loadCrmStatusSettings();
  return buildLeadStatusMove(lead, targetStatus, settings);
}

async function listProfileDocumentsByUserId(userId) {
  if (!PROFILE_DOCUMENTS_COLLECTION_ID) return [];
  const res = await databases.listDocuments(DATABASE_ID, PROFILE_DOCUMENTS_COLLECTION_ID, [
    sdk.Query.equal("user_id", [userId]),
    sdk.Query.limit(50),
  ]);
  return res.documents || [];
}

function missingEnrollmentRequirements(lead, profile, documents) {
  const data = contractProfileData(profile, lead);
  const missing = [];
  if (!lead?.user_id) missing.push("Conta vinculada ao lead");
  const fieldLabels = [
    ["fullName", "Nome completo"],
    ["email", "E-mail"],
    ["phone", "Telefone"],
    ["cpf", "CPF"],
    ["rg", "RG"],
    ["rgOrgaoExpedidor", "Órgão expedidor do RG"],
    ["rgIssueDate", "Data de emissão do RG"],
    ["birthDate", "Data de nascimento"],
    ["sex", "Sexo"],
    ["endereco", "Endereço"],
    ["cep", "CEP"],
    ["city", "Cidade"],
    ["state", "UF"],
    ["birthplace", "Naturalidade"],
    ["fatherName", "Filiação (pai)"],
    ["motherName", "Filiação (mãe)"],
    ["nacionalidade", "Nacionalidade"],
    ["estadoCivil", "Estado civil"],
    ["educationLevel", "Escolaridade"],
    ["allergies", "Alergias a medicamentos"],
    ["emergencyName", "Contato de emergência (nome)"],
    ["emergencyRelation", "Contato de emergência (parentesco)"],
    ["emergencyAddress", "Contato de emergência (endereço)"],
    ["emergencyPhone", "Contato de emergência (telefone)"],
    ["anacCode", "Código ANAC"],
  ];
  for (const [key, label] of fieldLabels) {
    if (!data[key]) missing.push(label);
  }
  const byType = new Set((documents || []).map((doc) => cleanString(doc.document_type)));
  const docLabels = {
    identification: "Documento de identificação",
    voterTitle: "Título de eleitor",
    proofOfResidence: "Comprovante de residência",
  };
  for (const [type, label] of Object.entries(docLabels)) {
    if (!byType.has(type)) missing.push(label);
  }
  if (!hasSagaAnacData(profile, lead)) {
    const cached = parseSagaAnacFromLeadOrProfile(profile, lead);
    const anacMissing = sagaAnacEnrollmentMissingFields(cached);
    if (anacMissing.length) {
      missing.push(`Dados ANAC do SAGA incompletos: ${anacMissing.join(", ")}`);
    } else {
      missing.push("Dados ANAC do SAGA (consulte ANAC no detalhe do lead)");
    }
  }
  return missing;
}

async function listEnrollmentTemplates() {
  if (!CONTRACT_TEMPLATES_COLLECTION_ID) return [];
  const res = await databases.listDocuments(DATABASE_ID, CONTRACT_TEMPLATES_COLLECTION_ID, [
    sdk.Query.equal("school_id", [SCHOOL_ID]),
    sdk.Query.equal("standard_type", ["matricula"]),
    sdk.Query.orderDesc("created_at"),
    sdk.Query.limit(100),
  ]);
  return res.documents || [];
}

async function createContractDocument(payload, recipientUserId) {
  return databases.createDocument(
    DATABASE_ID,
    CONTRACTS_COLLECTION_ID,
    sdk.ID.unique(),
    payload,
    contractPermissions(recipientUserId),
  );
}

async function uploadEnrollmentPdfFile(contract, pdfBytes, suffix) {
  if (!FLIGHTS_CSV_BUCKET_ID) {
    throw Object.assign(new Error("Storage nao configurado."), { status: 500 });
  }
  const fileName = `ficha-matricula-${contract.recipient_user_id}-${suffix}.pdf`;
  const inputFile =
    typeof File !== "undefined"
      ? new File([pdfBytes], fileName, { type: "application/pdf" })
      : sdk.InputFile?.fromBuffer
        ? sdk.InputFile.fromBuffer(pdfBytes, fileName)
        : null;
  if (!inputFile) throw Object.assign(new Error("Upload de PDF nao suportado neste runtime."), { status: 500 });
  return storage.createFile(
    FLIGHTS_CSV_BUCKET_ID,
    sdk.ID.unique(),
    inputFile,
    profileDocumentPermissions(contract.recipient_user_id),
  );
}

async function ensureEnrollmentFormPreview(contract) {
  if (contract.contract_kind !== "enrollment_form") {
    throw Object.assign(new Error("Contrato nao e uma ficha de matricula."), { status: 400 });
  }
  const pdfBytes = await renderEnrollmentPdf({
    ...contract,
    signed_by_recipient_at: null,
    signed_by_admin_at: null,
  });
  const uploaded = await uploadEnrollmentPdfFile(contract, pdfBytes, "preview");
  await databases.updateDocument(DATABASE_ID, CONTRACTS_COLLECTION_ID, contract.$id, {
    enrollment_pdf_file_id: uploaded.$id,
  });
  await syncEnrollmentFormProfileDocument(contract, {
    fileId: uploaded.$id,
    fileName: `ficha-matricula-${contract.recipient_user_id}-preview.pdf`,
    fileSize: pdfBytes.length,
  });
  return uploaded.$id;
}

async function sendContractNotificationEmail(contract, recipient) {
  try {
    const { settings } = await loadEmailSettings();
    const { publicSettings: brand } = await loadEmailBrandSettings();
    const result = await sendEmailToUser(settings, brand, recipient, {
      eventType: "contract.created",
      eyebrow: "Contrato para assinatura",
      title: "Novo documento disponível para assinatura",
      intro: `Olá${recipient.name ? `, ${recipient.name}` : ""}.`,
      body: `O documento "${contract.template_name || "Contrato"}" está disponível na plataforma para assinatura.`,
      ctaLabel: "Abrir plataforma",
      url: brand.appUrl || APP_URL,
    });
    if (result?.status !== "skipped") {
      await databases.updateDocument(DATABASE_ID, CONTRACTS_COLLECTION_ID, contract.$id, {
        email_sent_at: new Date().toISOString(),
      }).catch(() => undefined);
    }
  } catch (err) {
    console.warn("Contract email skipped:", err?.message || err);
  }
}

async function getTrainingTrackName(trackId) {
  const safeTrackId = cleanString(trackId);
  if (!safeTrackId || !TRAINING_TRACKS_COLLECTION_ID) return "";
  try {
    const doc = await databases.getDocument(DATABASE_ID, TRAINING_TRACKS_COLLECTION_ID, safeTrackId);
    return cleanString(doc.name);
  } catch {
    return "";
  }
}

async function runEnrollmentAutomation(actorUserId, payload = {}) {
  await requireAdmin(actorUserId);
  if (!CONTRACTS_COLLECTION_ID) throw Object.assign(new Error("Coleção de contratos não configurada."), { status: 500 });
  const leadId = cleanString(payload.leadId);
  if (!leadId) throw Object.assign(new Error("Lead não informado."), { status: 400 });
  const trainingTrackId = cleanString(payload.trainingTrackId);
  if (!trainingTrackId) {
    throw Object.assign(new Error("Selecione a trilha de treinamento do aluno."), { status: 400 });
  }
  const trainingTrackName = await getTrainingTrackName(trainingTrackId);
  if (!trainingTrackName) {
    throw Object.assign(new Error("Trilha de treinamento inválida ou não encontrada."), { status: 400 });
  }
  const lead = await getLeadById(leadId);
  const recipientUserId = cleanString(lead.user_id);
  const profile = recipientUserId ? await getProfileByUserId(recipientUserId) : null;
  const documents = recipientUserId ? await listProfileDocumentsByUserId(recipientUserId) : [];
  const missing = missingEnrollmentRequirements(lead, profile, documents);
  if (missing.length > 0) {
    throw Object.assign(new Error(`Pendências para matrícula: ${missing.join(", ")}.`), { status: 422 });
  }
  if (recipientUserId) {
    await assignStudentTrainingTrack(recipientUserId, trainingTrackId, true, "active");
  }

  let sagaResult = null;
  if (payload.createInSaga !== false && recipientUserId) {
    sagaResult = await createSagaStudentFromEnrollment({
      profile,
      lead,
      recipientUserId,
      trainingTrackId,
      trainingTrackName,
      ignoreSagaDuplicates: payload.ignoreSagaDuplicates === true,
      useStudentEmail: payload.useStudentEmail === true,
    });
    if (!sagaResult.ok && !sagaResult.skipped) {
      throw Object.assign(new Error(sagaResult.message || "Falha ao criar aluno no SAGA."), { status: 422 });
    }
  }

  const profileData = contractProfileData(profile, lead);
  const customVarValues = payload.customVarValues && typeof payload.customVarValues === "object" ? payload.customVarValues : {};
  const enrollmentTrackMeta = { trainingTrackId, trainingTrackName };
  const now = new Date().toISOString();
  const allTemplates = await listEnrollmentTemplates();
  const requestedTemplateIds = Array.isArray(payload.templateIds)
    ? payload.templateIds.map(cleanString).filter(Boolean)
    : null;
  const allowedTemplateIds = new Set(allTemplates.map((item) => item.$id));
  const templates =
    requestedTemplateIds === null
      ? allTemplates
      : allTemplates.filter((item) => requestedTemplateIds.includes(item.$id) && allowedTemplateIds.has(item.$id));
  const created = [];

  for (const template of templates) {
    const doc = await createContractDocument({
      school_id: SCHOOL_ID,
      template_id: template.$id,
      template_name: cleanString(template.name) || "Contrato de matrícula",
      lead_id: lead.$id,
      standard_type: "matricula",
      contract_kind: "standard_contract",
      recipient_user_id: recipientUserId,
      recipient_name: profileData.fullName,
      content_resolved_json: resolveSystemContractVars(template.content_json, profileData),
      custom_var_values_json: JSON.stringify(customVarValues),
      status: "pending",
      created_by: actorUserId,
      created_at: now,
    }, recipientUserId);
    created.push(doc);
  }

  const enrollmentForm = await createContractDocument({
    school_id: SCHOOL_ID,
    template_id: "enrollment_form",
    template_name: "Ficha de matrícula",
    lead_id: lead.$id,
    standard_type: "matricula",
    contract_kind: "enrollment_form",
    recipient_user_id: recipientUserId,
    recipient_name: profileData.fullName,
    content_resolved_json: richTextDoc("Ficha de matrícula gerada a partir do PDF padrão da escola. Assine para concluir o processo de matrícula."),
    custom_var_values_json: JSON.stringify(enrollmentTrackMeta),
    status: "pending",
    created_by: actorUserId,
    created_at: now,
  }, recipientUserId);
  await ensureEnrollmentFormPreview(enrollmentForm);
  created.push(enrollmentForm);

  const statusPayload = await buildCrmLeadStatusChangePayload(lead, "aguardando_assinatura_pagamento");
  await databases.updateDocument(DATABASE_ID, CRM_LEADS_COLLECTION_ID, lead.$id, statusPayload);

  for (const contract of created) {
    await sendContractNotificationEmail(contract, {
      userId: recipientUserId,
      email: profileData.email,
      name: profileData.fullName,
    });
  }

  return {
    createdContracts: created.length,
    nextStatus: "aguardando_assinatura_pagamento",
    saga: sagaResult,
  };
}

async function loadEnrollmentPhotoBytes(profile) {
  const fileId = cleanString(profile?.anac_photo_file_id);
  if (!fileId || !FLIGHTS_CSV_BUCKET_ID) return null;
  try {
    const buffer = await storage.getFileDownload(FLIGHTS_CSV_BUCKET_ID, fileId);
    return Buffer.from(buffer);
  } catch (err) {
    console.warn("Enrollment photo load skipped:", err?.message || err);
    return null;
  }
}

function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function buildEnrollmentPdfExtras(contract, profile, documents) {
  const lead = contract.lead_id ? await getLeadById(contract.lead_id).catch(() => null) : null;
  const docTypes = new Set((documents || []).map((doc) => cleanString(doc.document_type)));
  const medical = parseJsonObject(profile?.anac_medical_json, {});
  const data = contractProfileData(profile, lead || {});
  const trackMeta = parseJsonObject(contract.custom_var_values_json, {});
  let courseName = cleanString(trackMeta.trainingTrackName);
  if (!courseName && trackMeta.trainingTrackId) {
    courseName = await getTrainingTrackName(trackMeta.trainingTrackId);
  }
  if (!courseName) courseName = cleanString(lead?.desired_course);
  return {
    courseName,
    sex: data.sex,
    cep: data.cep,
    city: data.city,
    state: data.state,
    birthplace: data.birthplace,
    fatherName: data.fatherName,
    motherName: data.motherName,
    rgIssueDate: formatDateBr(data.rgIssueDate) || data.rgIssueDate,
    educationLevel: data.educationLevel,
    educationPeriod: data.educationPeriod,
    educationCourse: data.educationCourse,
    allergies: data.allergies || "Nenhuma",
    emergencyName: data.emergencyName,
    emergencyRelation: data.emergencyRelation,
    emergencyAddress: data.emergencyAddress,
    emergencyPhone: data.emergencyPhone,
    signLocation: data.city,
    documentFlags: {
      identification: docTypes.has("identification"),
      voterTitle: docTypes.has("voterTitle"),
      proofOfResidence: docTypes.has("proofOfResidence"),
      militaryCertificate: docTypes.has("militaryCertificate"),
      medical: Boolean(cleanString(medical.validade)),
    },
    medicalClass: cleanString(medical.classe),
    medicalIssuer: cleanString(medical.orgao_expedidor),
    medicalValidUntil: formatDateBr(medical.validade),
    anacLicenses: parseJsonArray(profile?.anac_licenses_json),
    anacRatings: parseJsonArray(profile?.anac_ratings_json),
    enrollmentStartDate: formatDateBr(contract.created_at),
    enrollmentNumber: cleanString(contract.$id).slice(-6).toUpperCase(),
  };
}

async function renderEnrollmentPdf(contract) {
  const [profile, brandResult] = await Promise.all([
    getProfileByUserId(contract.recipient_user_id),
    loadEmailBrandSettings(),
  ]);
  const documents = await listProfileDocumentsByUserId(contract.recipient_user_id);
  const profileData = contractProfileData(profile, {
    name: contract.recipient_name,
    email: profile?.email,
    phone: profile?.phone,
  });
  const brand = brandResult.publicSettings || defaultEmailBrandSettings();
  const logoDataUrl = await logoUrlToDataUrl(brand.logoUrl);
  const photoBytes = await loadEnrollmentPhotoBytes(profile);
  const issuedAt = contract.created_at ? new Date(contract.created_at) : new Date();
  const extras = await buildEnrollmentPdfExtras(contract, profile, documents);

  return buildEnrollmentFormPdf({
    profileData: {
      ...profileData,
      birthDateFormatted: formatDateBr(profileData.birthDate),
    },
    brand,
    logoDataUrl,
    photoBytes,
    issuedAt,
    extras,
    signatures: {
      recipient: Boolean(contract.signed_by_recipient_at),
      admin: Boolean(contract.signed_by_admin_at),
      recipientAt: formatDateBr(contract.signed_by_recipient_at),
      adminAt: formatDateBr(contract.signed_by_admin_at),
    },
  });
}

async function syncEnrollmentFormProfileDocument(contract, { fileId, fileName, fileSize }) {
  const userId = cleanString(contract.recipient_user_id);
  const safeFileId = cleanString(fileId);
  if (!userId || !safeFileId || !PROFILE_DOCUMENTS_COLLECTION_ID) return null;

  const safeName = cleanString(fileName) || `ficha-matricula-${userId}.pdf`;
  const existing = await databases.listDocuments(DATABASE_ID, PROFILE_DOCUMENTS_COLLECTION_ID, [
    sdk.Query.equal("user_id", [userId]),
    sdk.Query.equal("document_type", ["enrollmentForm"]),
    sdk.Query.limit(1),
  ]);
  const payload = {
    school_id: SCHOOL_ID,
    user_id: userId,
    document_type: "enrollmentForm",
    file_id: safeFileId,
    file_name: safeName,
    mime_type: "application/pdf",
    file_size: typeof fileSize === "number" && fileSize > 0 ? fileSize : 0,
    uploaded_at: new Date().toISOString(),
  };
  if (existing.documents?.[0]) {
    await databases.updateDocument(DATABASE_ID, PROFILE_DOCUMENTS_COLLECTION_ID, existing.documents[0].$id, payload);
  } else {
    await databases.createDocument(
      DATABASE_ID,
      PROFILE_DOCUMENTS_COLLECTION_ID,
      sdk.ID.unique(),
      payload,
      profileDocumentPermissions(userId),
    );
  }
  return safeFileId;
}

async function attachEnrollmentFormToProfile(contract) {
  if (contract.contract_kind !== "enrollment_form" || contract.status !== "signed_both") return null;
  if (contract.signed_pdf_file_id) {
    await syncEnrollmentFormProfileDocument(contract, {
      fileId: contract.signed_pdf_file_id,
      fileName: `ficha-matricula-${contract.recipient_user_id}.pdf`,
    });
    return contract.signed_pdf_file_id;
  }
  if (!FLIGHTS_CSV_BUCKET_ID || !PROFILE_DOCUMENTS_COLLECTION_ID) {
    throw Object.assign(new Error("Storage ou coleção de documentos do perfil não configurados."), { status: 500 });
  }
  const pdfBytes = await renderEnrollmentPdf(contract);
  const fileName = `ficha-matricula-${contract.recipient_user_id}.pdf`;
  const inputFile =
    typeof File !== "undefined"
      ? new File([pdfBytes], fileName, { type: "application/pdf" })
      : sdk.InputFile?.fromBuffer
        ? sdk.InputFile.fromBuffer(pdfBytes, fileName)
        : null;
  if (!inputFile) throw Object.assign(new Error("Upload de PDF não suportado neste runtime."), { status: 500 });
  const uploaded = await storage.createFile(
    FLIGHTS_CSV_BUCKET_ID,
    sdk.ID.unique(),
    inputFile,
    profileDocumentPermissions(contract.recipient_user_id),
  );
  await syncEnrollmentFormProfileDocument(contract, {
    fileId: uploaded.$id,
    fileName,
    fileSize: pdfBytes.length,
  });
  await databases.updateDocument(DATABASE_ID, CONTRACTS_COLLECTION_ID, contract.$id, {
    signed_pdf_file_id: uploaded.$id,
  });
  return uploaded.$id;
}

async function signContract(actorUserId, payload = {}) {
  const contractId = cleanString(payload.contractId);
  const signerRole = cleanString(payload.signerRole);
  if (!contractId) throw Object.assign(new Error("Contrato não informado."), { status: 400 });
  if (!["aluno", "instrutor", "admin"].includes(signerRole)) {
    throw Object.assign(new Error("Papel de assinatura inválido."), { status: 400 });
  }
  const contract = await databases.getDocument(DATABASE_ID, CONTRACTS_COLLECTION_ID, contractId);
  if (contract.status === "cancelled") throw Object.assign(new Error("Contrato cancelado."), { status: 400 });
  if (signerRole === "admin") {
    await requireAdmin(actorUserId);
  } else {
    const role = await getActorRole(actorUserId);
    if (actorUserId !== contract.recipient_user_id || role !== signerRole) {
      throw Object.assign(new Error("Usuário sem permissão para assinar este contrato."), { status: 403 });
    }
  }

  const already = await databases.listDocuments(DATABASE_ID, CONTRACT_SIGNATURES_COLLECTION_ID, [
    sdk.Query.equal("contract_id", [contractId]),
    sdk.Query.equal("signer_user_id", [actorUserId]),
    sdk.Query.equal("signer_role", [signerRole]),
    sdk.Query.limit(1),
  ]);
  const now = new Date().toISOString();
  if (!already.documents?.[0]) {
    await databases.createDocument(DATABASE_ID, CONTRACT_SIGNATURES_COLLECTION_ID, sdk.ID.unique(), {
      contract_id: contractId,
      signer_user_id: actorUserId,
      signer_role: signerRole,
      signed_at: now,
      school_id: contract.school_id || SCHOOL_ID,
      created_at: now,
    }, signaturePermissions());
  }

  const recipientSigned = signerRole === "admin" ? Boolean(contract.signed_by_recipient_at) : true;
  const adminSigned = signerRole === "admin" ? true : Boolean(contract.signed_by_admin_at);
  const patch = {
    status: recipientSigned && adminSigned ? "signed_both" : adminSigned ? "signed_admin" : "signed_recipient",
  };
  if (signerRole === "admin" && !contract.signed_by_admin_at) patch.signed_by_admin_at = now;
  if (signerRole !== "admin" && !contract.signed_by_recipient_at) patch.signed_by_recipient_at = now;
  let updated = await databases.updateDocument(DATABASE_ID, CONTRACTS_COLLECTION_ID, contractId, patch);
  if (updated.contract_kind === "enrollment_form" && updated.status === "signed_both") {
    await attachEnrollmentFormToProfile(updated);
    updated = await databases.getDocument(DATABASE_ID, CONTRACTS_COLLECTION_ID, contractId);
  }
  return updated;
}

async function ensureEnrollmentFormPreviewForActor(actorUserId, payload = {}) {
  const contractId = cleanString(payload.contractId);
  if (!contractId) throw Object.assign(new Error("Contrato nao informado."), { status: 400 });
  const contract = await databases.getDocument(DATABASE_ID, CONTRACTS_COLLECTION_ID, contractId);
  const role = await getActorRole(actorUserId);
  if (role === "admin") {
    await requireAdmin(actorUserId);
  } else if (actorUserId !== contract.recipient_user_id) {
    throw Object.assign(new Error("Usuario sem permissao para ver esta ficha."), { status: 403 });
  }
  const fileId = await ensureEnrollmentFormPreview(contract);
  return { fileId };
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
      : metaBlockMinutes(meta);
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
    isGhostFlight: isGhostFlightDoc(doc),
    ghostObservation: isGhostFlightDoc(doc) ? ghostObservationFromMeta(meta) : "",
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

function toProfile(profile, preference, documents = {}) {
  const defaultMedical = {
    classe: "",
    validade: "",
    orgao_expedidor: "",
    observacoes: "",
  };
  return {
    docId: profile?.$id || null,
    isActive: profile?.is_active !== false,
    fullName: profile?.full_name || "",
    nickname: profile?.nickname || "",
    cpf: profile?.cpf || "",
    phone: profile?.phone || "",
    birthDate: profile?.birth_date || "",
    weightKg: typeof profile?.weight_kg === "number" ? profile.weight_kg : null,
    heightCm: typeof profile?.height_cm === "number" ? profile.height_cm : null,
    anacCode: profile?.anac_code || "",
    sagaUserId: profile?.saga_user_id || "",
    anacRatings: parseJsonList(profile?.anac_ratings_json),
    anacLicenses: parseJsonList(profile?.anac_licenses_json),
    anacMedical: parseJsonObject(profile?.anac_medical_json, defaultMedical),
    anacPhotoFileId: profile?.anac_photo_file_id || "",
    anacSyncStatus: profile?.anac_sync_status || "",
    anacSyncError: profile?.anac_sync_error || "",
    anacLastSyncAt: profile?.anac_last_sync_at || "",
    rg: profile?.rg || "",
    rgOrgaoExpedidor: profile?.rg_orgao_expedidor || "",
    rgDataEmissao: profile?.rg_data_emissao || "",
    endereco: profile?.endereco || "",
    cep: profile?.cep || "",
    cidade: profile?.cidade || "",
    uf: profile?.uf || "",
    nacionalidade: profile?.nacionalidade || "",
    estadoCivil: profile?.estado_civil || "",
    sexo: profile?.sexo || "",
    naturalidade: profile?.naturalidade || "",
    filiacaoPai: profile?.filiacao_pai || "",
    filiacaoMae: profile?.filiacao_mae || "",
    escolaridade: profile?.escolaridade || "",
    escolaridadePeriodo: profile?.escolaridade_periodo || "",
    escolaridadeCurso: profile?.escolaridade_curso || "",
    alergiasMedicamentos: profile?.alergias_medicamentos || "",
    emergenciaNome: profile?.emergencia_nome || "",
    emergenciaParentesco: profile?.emergencia_parentesco || "",
    emergenciaEndereco: profile?.emergencia_endereco || "",
    emergenciaTelefone: profile?.emergencia_telefone || "",
    documents,
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

function toUserRecord(user, profile, preference, flights, plans, trainingTracks = [], profilesByUserId = new Map(), documents = {}) {
  const assignedRoleSlugs = parseAssignedRoleSlugs(profile);
  const activeRoleSlug = parseActiveRoleSlug(profile, assignedRoleSlugs);
  const activeRole = getEffectiveRole(profile);
  const roleCustomSlugs = parseRoleCustomSlugsJson(profile);
  const customRoleSlug = resolveCustomRoleSlugForActive(activeRoleSlug, activeRole) ?? profile?.custom_role_slug ?? null;
  const profilePayload = toProfile(profile, preference, documents);
  const summary = summarizeFlights(flights, plans, profilesByUserId);

  return {
    userId: user.$id,
    email: user.email || profile?.email || "",
    name: user.name || "",
    role: activeRole,
    roles: assignedRoleSlugs,
    activeRole,
    assignedRoleSlugs,
    activeRoleSlug,
    customRoleSlug,
    roleCustomSlugs,
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
    referralSource: null,
  };
}

function toUserSummary(user, profile, preference, flights, plans, trainingTracks = []) {
  const detail = toUserRecord(user, profile, preference, flights, plans, trainingTracks);
  return {
    userId: detail.userId,
    email: detail.email,
    name: detail.name,
    role: detail.role,
    roles: detail.assignedRoleSlugs ?? detail.roles,
    activeRole: detail.activeRole,
    assignedRoleSlugs: detail.assignedRoleSlugs ?? detail.roles,
    activeRoleSlug: detail.activeRoleSlug,
    customRoleSlug: detail.customRoleSlug,
    labels: detail.labels,
    emailVerification: detail.emailVerification,
    createdAt: detail.createdAt,
    profile: {
      docId: detail.profile.docId,
      isActive: detail.profile.isActive,
      fullName: detail.profile.fullName,
      nickname: detail.profile.nickname,
      cpf: detail.profile.cpf,
      phone: detail.profile.phone,
      anacCode: detail.profile.anacCode,
      sagaUserId: detail.profile.sagaUserId,
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
    if (isScheduledFlightStatusValue(row.status)) {
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

  // Voos temporarios (ghost) sao placeholders de telemetria sem voo real casado — nao contam
  // como executados no dashboard (por aviao, horas e KPIs), igual ao padrao dos relatorios
  // (listFlightReports usa ghostMode "exclude"). Filtrar aqui cobre tudo que deriva de periodRows.
  const periodRows = periodFlightDocs
    .filter((doc) => !isGhostFlightDoc(doc))
    .map((doc) => dashboardFlightRow(doc, telemetryByFlightId, aircraftByRegistration, modelsById, profilesByUserId))
    .filter((row) => rowMatchesDashboardFilters(row, filters));
  const futureRowsForOperationalCounts = upcomingPage.documents
    .map((doc) => dashboardFlightRow(doc, telemetryByFlightId, aircraftByRegistration, modelsById, profilesByUserId))
    .filter((row) => isScheduledFlightStatusValue(row.status) && rowMatchesDashboardFilters(row, filters));
  const upcomingRows = futureRowsForOperationalCounts
    .slice()
    .filter((row) => isScheduledFlightStatusValue(row.status) && rowMatchesDashboardFilters(row, filters))
    .sort((a, b) => flightDateTimeKey(a).localeCompare(flightDateTimeKey(b)))
    .slice(0, filters.upcomingLimit);
  const forecastRows = forecastFlightDocs
    .map((doc) => dashboardFlightRow(doc, telemetryByFlightId, aircraftByRegistration, modelsById, profilesByUserId))
    .filter((row) => isScheduledFlightStatusValue(row.status) && rowMatchesDashboardFilters(row, filters));
  const alertRows = alertDocs.map((doc) => dashboardAlertRow(doc, aircraftByRegistration, modelsById, profilesByUserId));

  const executedRows = periodRows.filter((row) => row.status === "Realizado");
  const futureRows = periodRows.filter((row) => isScheduledFlightStatusValue(row.status));
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

function weekEndFromWeekStart(weekStart) {
  const start = new Date(`${weekStart}T12:00:00`);
  if (Number.isNaN(start.getTime())) return weekStart;
  start.setDate(start.getDate() + 6);
  return start.toISOString().slice(0, 10);
}

function toScheduleWeekFlightRow(doc) {
  return {
    id: doc.$id,
    source_filename: doc.source_filename || "",
    created_at: doc.$createdAt,
    aircraft_ident: doc.aircraft_ident ?? null,
    duration_sec: typeof doc.duration_sec === "number" ? doc.duration_sec : null,
    flight_date: doc.flight_date ?? null,
    start_time: doc.start_time ?? null,
    student_user_id: doc.student_user_id ?? doc.user_id ?? null,
    instructor_user_id: doc.instructor_user_id ?? null,
    is_night: doc.is_night ?? false,
    schedule_week_start: doc.schedule_week_start ?? null,
    schedule_demand_id: doc.schedule_demand_id ?? null,
    saga_schedule_id: doc.saga_schedule_id ?? null,
    saga_schedule_sync_status: doc.saga_schedule_sync_status ?? null,
    saga_schedule_synced_at: doc.saga_schedule_synced_at ?? null,
  };
}

/** Lista todos os voos da semana (escola inteira) com API key — para escala do INVA. */
async function listScheduleWeekFlights(weekStart) {
  if (!FLIGHTS_COLLECTION_ID) throw Object.assign(new Error("Colecao de voos nao configurada."), { status: 500 });
  const normalizedWeekStart = cleanString(weekStart);
  if (!normalizedWeekStart) throw Object.assign(new Error("Semana nao informada."), { status: 400 });

  const weekEnd = weekEndFromWeekStart(normalizedWeekStart);
  const schoolFilter = sdk.Query.equal("school_id", [SCHOOL_ID]);
  const select = selectQuery(FLIGHT_SELECT);

  const [byDate, byScheduleWeek, autoRows, manualRows] = await Promise.all([
    listAllDocuments(FLIGHTS_COLLECTION_ID, [
      schoolFilter,
      sdk.Query.greaterThanEqual("flight_date", normalizedWeekStart),
      sdk.Query.lessThanEqual("flight_date", weekEnd),
      ...select,
    ]),
    listAllDocuments(FLIGHTS_COLLECTION_ID, [
      schoolFilter,
      sdk.Query.equal("schedule_week_start", normalizedWeekStart),
      ...select,
    ]),
    listAllDocuments(FLIGHTS_COLLECTION_ID, [
      sdk.Query.startsWith("source_filename", `auto-scale-${normalizedWeekStart}`),
      ...select,
    ]),
    listAllDocuments(FLIGHTS_COLLECTION_ID, [
      sdk.Query.startsWith("source_filename", `manual-scale-${normalizedWeekStart}`),
      ...select,
    ]),
  ]);

  const byId = new Map();
  for (const doc of [...byDate, ...byScheduleWeek, ...autoRows, ...manualRows]) {
    byId.set(doc.$id, toScheduleWeekFlightRow(doc));
  }
  return [...byId.values()];
}

async function listFlightReports(params = {}, actorUserId = "", actorRole = "") {
  const limit = clampReportLimit(params.limit);
  const cursor = String(params.cursor || "").trim();
  const safeActorRole = cleanString(actorRole);
  const filters = {
    fromDate: String(params.fromDate || "").trim(),
    toDate: String(params.toDate || "").trim(),
    aircrafts: stringList(params.aircrafts || params.aircraftIdents),
    models: stringList(params.models || params.modelIds),
    instructors: stringList(params.instructors || params.instructorUserIds),
    students: stringList(params.students || params.studentUserIds),
    status: VALID_FLIGHT_STATUSES.has(params.status) ? params.status : "all",
    ghostMode: ["include", "only"].includes(cleanString(params.ghostMode)) ? cleanString(params.ghostMode) : "exclude",
  };
  if (safeActorRole === "instrutor" && actorUserId) {
    filters.instructors = [actorUserId];
  }

  const flightQueries = [
    sdk.Query.equal("school_id", [SCHOOL_ID]),
    ...dateQuery("flight_date", filters.fromDate, filters.toDate),
    ...dashboardEqualQuery("aircraft_ident", stringList(params.aircraftIdents)),
    ...dashboardEqualQuery("instructor_user_id", stringList(params.instructorUserIds)),
    ...dashboardEqualQuery("student_user_id", stringList(params.studentUserIds)),
    sdk.Query.orderDesc("flight_date"),
    sdk.Query.orderDesc("start_time"),
    sdk.Query.limit(limit),
    ...selectQuery(FLIGHT_REPORT_SELECT),
  ];
  if (cursor) flightQueries.push(sdk.Query.cursorAfter(cursor));

  let flightsPage;
  if (filters.ghostMode === "only") {
    const [sourcePage, legacyNamePage] = await Promise.all([
      listDocumentsPage(FLIGHTS_COLLECTION_ID, [
        ...flightQueries,
        sdk.Query.startsWith("source_filename", GHOST_FLIGHT_SOURCE_PREFIX),
      ]).catch(() => ({ documents: [], total: 0 })),
      listDocumentsPage(FLIGHTS_COLLECTION_ID, [
        ...flightQueries,
        sdk.Query.startsWith("name", "Voo temporario"),
      ]).catch(() => ({ documents: [], total: 0 })),
    ]);
    const byId = new Map();
    for (const doc of [...(sourcePage.documents || []), ...(legacyNamePage.documents || [])]) byId.set(doc.$id, doc);
    flightsPage = { documents: Array.from(byId.values()), total: byId.size };
  } else {
    flightsPage = await listDocumentsPage(FLIGHTS_COLLECTION_ID, flightQueries);
  }
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

  const hydratedFlights = flights.map((doc) => toFlight(doc));

  const rows = hydratedFlights.map((flight) => {
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
    .filter((row) => {
      if (filters.ghostMode === "exclude" && row.isGhostFlight) return false;
      if (filters.ghostMode === "only" && !row.isGhostFlight) return false;
      return rowMatchesReportFilters(row, filters);
    })
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
  const raw = cleanString(search);
  const searchableFields = ["full_name", "nickname", "email", "anac_code", "cpf", "phone"];
  const [pages, localProfiles] = await Promise.all([
    Promise.all(
      searchableFields.map((field) =>
        databases.listDocuments(DATABASE_ID, PROFILES_COLLECTION_ID, [
          sdk.Query.equal("school_id", [SCHOOL_ID]),
          sdk.Query.search(field, raw),
          sdk.Query.limit(20),
          ...selectQuery(["user_id"]),
        ]).catch(() => ({ documents: [] })),
      ),
    ),
    listAllDocuments(PROFILES_COLLECTION_ID, [
      sdk.Query.equal("school_id", [SCHOOL_ID]),
      ...selectQuery(["user_id", ...searchableFields]),
    ]).catch(() => []),
  ]);
  return Array.from(new Set(
    [
      ...pages.flatMap((page) => page.documents || []),
      ...localProfiles.filter((profile) =>
        searchableFields.some((field) => normalizeSearch(profile[field]).includes(needle)),
      ),
    ]
      .map((profile) => cleanString(profile.user_id))
      .filter(Boolean),
  ));
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
      isFlightReviewClubMember: Boolean(doc.is_flight_review_club_member),
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

const VALID_STUDENT_TRACK_STATUS = new Set(["active", "paused", "completed"]);
const VALID_STUDENT_TRACK_TRANSITIONS = {
  active: new Set(["active", "paused", "completed"]),
  paused: new Set(["paused", "active", "completed"]),
  completed: new Set(["completed", "active"]),
};

function assertStudentTracksConfigured() {
  if (!STUDENT_TRACKS_COLLECTION_ID || !TRAINING_TRACKS_COLLECTION_ID) {
    throw Object.assign(new Error("Colecoes de trilha nao configuradas."), { status: 500 });
  }
}

async function requireStudentTrackAssignment(studentUserId, assignmentId) {
  const assignment = await databases.getDocument(DATABASE_ID, STUDENT_TRACKS_COLLECTION_ID, assignmentId);
  if (assignment.student_user_id !== studentUserId) {
    throw Object.assign(new Error("Trilha nao pertence ao aluno informado."), { status: 403 });
  }
  return assignment;
}

async function setPrimaryStudentTrainingTrack(targetUserId, trackId) {
  const studentUserId = cleanString(targetUserId);
  const safeTrackId = cleanString(trackId);
  if (!studentUserId || !safeTrackId) {
    throw Object.assign(new Error("Aluno ou trilha nao informados."), { status: 400 });
  }
  assertStudentTracksConfigured();

  const res = await databases.listDocuments(DATABASE_ID, STUDENT_TRACKS_COLLECTION_ID, [
    sdk.Query.equal("school_id", [SCHOOL_ID]),
    sdk.Query.equal("student_user_id", [studentUserId]),
    sdk.Query.limit(100),
  ]);
  const now = new Date().toISOString();
  await Promise.all(
    res.documents.map((doc) =>
      databases.updateDocument(DATABASE_ID, STUDENT_TRACKS_COLLECTION_ID, doc.$id, {
        is_primary: doc.track_id === safeTrackId,
        updated_at: now,
      }),
    ),
  );
}

async function assignStudentTrainingTrack(targetUserId, trackId, isPrimary = false, status = "active") {
  const studentUserId = cleanString(targetUserId);
  const safeTrackId = cleanString(trackId);
  const newStatus = VALID_STUDENT_TRACK_STATUS.has(status) ? status : "active";
  if (!studentUserId || !safeTrackId) {
    throw Object.assign(new Error("Aluno ou trilha nao informados."), { status: 400 });
  }
  assertStudentTracksConfigured();

  const existing = await databases.listDocuments(DATABASE_ID, STUDENT_TRACKS_COLLECTION_ID, [
    sdk.Query.equal("school_id", [SCHOOL_ID]),
    sdk.Query.equal("student_user_id", [studentUserId]),
    sdk.Query.equal("track_id", [safeTrackId]),
    sdk.Query.limit(1),
  ]);
  const now = new Date().toISOString();

  if (isPrimary) await setPrimaryStudentTrainingTrack(studentUserId, safeTrackId);

  if (existing.documents[0]) {
    const currentStatus = VALID_STUDENT_TRACK_STATUS.has(existing.documents[0].status) ? existing.documents[0].status : "active";
    if (!VALID_STUDENT_TRACK_TRANSITIONS[currentStatus].has(newStatus)) {
      throw Object.assign(new Error(`Transicao de status invalida: "${currentStatus}" -> "${newStatus}".`), { status: 400 });
    }
    await databases.updateDocument(DATABASE_ID, STUDENT_TRACKS_COLLECTION_ID, existing.documents[0].$id, {
      status: newStatus,
      is_primary: Boolean(isPrimary),
      updated_at: now,
    });
    return getUserDetail(studentUserId);
  }

  await databases.createDocument(
    DATABASE_ID,
    STUDENT_TRACKS_COLLECTION_ID,
    sdk.ID.unique(),
    {
      school_id: SCHOOL_ID,
      student_user_id: studentUserId,
      track_id: safeTrackId,
      status: newStatus,
      is_primary: Boolean(isPrimary),
      assigned_at: now,
      updated_at: now,
    },
    studentTrackDocumentPermissions(studentUserId),
  );
  return getUserDetail(studentUserId);
}

async function updatePrimaryStudentTrainingTrack(targetUserId, trackId) {
  const studentUserId = cleanString(targetUserId);
  const safeTrackId = cleanString(trackId);
  if (!studentUserId || !safeTrackId) {
    throw Object.assign(new Error("Aluno ou trilha nao informados."), { status: 400 });
  }
  assertStudentTracksConfigured();
  await setPrimaryStudentTrainingTrack(studentUserId, safeTrackId);
  return getUserDetail(studentUserId);
}

async function removeStudentTrainingTrack(targetUserId, assignmentId) {
  const studentUserId = cleanString(targetUserId);
  const safeAssignmentId = cleanString(assignmentId);
  if (!studentUserId || !safeAssignmentId) {
    throw Object.assign(new Error("Aluno ou vinculo de trilha nao informados."), { status: 400 });
  }
  assertStudentTracksConfigured();
  await requireStudentTrackAssignment(studentUserId, safeAssignmentId);
  await databases.deleteDocument(DATABASE_ID, STUDENT_TRACKS_COLLECTION_ID, safeAssignmentId);
  return getUserDetail(studentUserId);
}

async function setStudentTrackFlightReviewClubMembership(targetUserId, assignmentId, isMember) {
  const studentUserId = cleanString(targetUserId);
  const safeAssignmentId = cleanString(assignmentId);
  if (!studentUserId || !safeAssignmentId) {
    throw Object.assign(new Error("Aluno ou vinculo de trilha nao informados."), { status: 400 });
  }
  assertStudentTracksConfigured();
  await requireStudentTrackAssignment(studentUserId, safeAssignmentId);
  await databases.updateDocument(DATABASE_ID, STUDENT_TRACKS_COLLECTION_ID, safeAssignmentId, {
    is_flight_review_club_member: Boolean(isMember),
    updated_at: new Date().toISOString(),
  });
  return getUserDetail(studentUserId);
}

async function listSummaries({ search = "", role = "", customRoleSlug = "", limit = DEFAULT_LIMIT, offset = 0 } = {}) {
  const safeLimit = clampLimit(limit);
  const safeOffset = clampOffset(offset);
  const needle = normalizeSearch(search);
  const safeRole = VALID_ROLES.has(cleanString(role)) ? cleanString(role) : "";
  const safeCustomRoleSlug = cleanString(customRoleSlug);
  let pageUsers = [];
  let total = 0;

  if (safeRole) {
    const profileQueries = [
      sdk.Query.equal("role", [safeRole]),
      ...selectQuery(["user_id", "custom_role_slug"]),
    ];
    const matchingProfiles = await listAllDocuments(PROFILES_COLLECTION_ID, profileQueries);
    let matchingUserIds = matchingProfiles
      .filter((profile) => {
        const profileCustomRoleSlug = cleanString(profile.custom_role_slug);
        return safeCustomRoleSlug
          ? profileCustomRoleSlug === safeCustomRoleSlug
          : !profileCustomRoleSlug;
      })
      .map((profile) => cleanString(profile.user_id))
      .filter(Boolean);
    if (needle) {
      const [authRes, profileSearchUserIds] = await Promise.all([
        users.list({
          search: String(search || "").trim(),
          queries: [sdk.Query.limit(MAX_LIMIT), sdk.Query.offset(0)],
          total: true,
        }).catch(() => ({ users: [] })),
        findProfileSearchUserIds(search),
      ]);
      const searchIds = new Set([
        ...(authRes.users || []).map((user) => user.$id),
        ...profileSearchUserIds,
      ]);
      matchingUserIds = matchingUserIds.filter((userId) => searchIds.has(userId));
    }
    const matchingUsers = (await getUsersByIds(matchingUserIds)).sort((a, b) => {
      const aName = a.name || a.email || a.$id;
      const bName = b.name || b.email || b.$id;
      return aName.localeCompare(bName, "pt-BR");
    });
    total = matchingUsers.length;
    pageUsers = matchingUsers.slice(safeOffset, safeOffset + safeLimit);
  } else if (needle) {
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

async function searchFlightPickerUsers(actorUserId, payload = {}) {
  await requireAdmin(actorUserId);
  const role = cleanString(payload.role);
  if (!VALID_ROLES.has(role)) {
    throw Object.assign(new Error("Perfil invalido para busca."), { status: 400 });
  }
  const search = cleanString(payload.search);
  const limit = Math.min(20, Math.max(1, Number(payload.limit) || 10));
  let userIds = [];

  if (search) {
    const [authRes, profileSearchUserIds] = await Promise.all([
      users.list({
        search,
        queries: [sdk.Query.limit(25), sdk.Query.offset(0)],
        total: true,
      }).catch(() => ({ users: [] })),
      findProfileSearchUserIds(search).catch(() => []),
    ]);
    userIds = Array.from(new Set([
      ...(authRes.users || []).map((user) => user.$id),
      ...profileSearchUserIds,
    ].filter(Boolean)));
  } else {
    const [primaryPage, assignedPage] = await Promise.all([
      databases.listDocuments(DATABASE_ID, PROFILES_COLLECTION_ID, [
        sdk.Query.equal("school_id", [SCHOOL_ID]),
        sdk.Query.equal("role", [role]),
        sdk.Query.limit(limit * 3),
        ...selectQuery(["user_id"]),
      ]),
      databases.listDocuments(DATABASE_ID, PROFILES_COLLECTION_ID, [
        sdk.Query.equal("school_id", [SCHOOL_ID]),
        sdk.Query.equal("assigned_role_slugs", [role]),
        sdk.Query.limit(limit * 3),
        ...selectQuery(["user_id"]),
      ]).catch(() => ({ documents: [] })),
    ]);
    userIds = Array.from(new Set([
      ...(primaryPage.documents || []).map((profile) => cleanString(profile.user_id)),
      ...(assignedPage.documents || []).map((profile) => cleanString(profile.user_id)),
    ].filter(Boolean)));
  }

  if (!userIds.length) return { users: [] };
  const profilesByUserId = await getProfilesByUserIds(userIds);
  const roleMatches = await Promise.all(
    userIds.map(async (userId) => [userId, await profileHasPortalRole(profilesByUserId.get(userId), role)]),
  );
  const filteredIds = roleMatches
    .filter(([userId, matches]) => {
      const profile = profilesByUserId.get(userId);
      return matches && cleanString(profile?.school_id) === SCHOOL_ID;
    })
    .map(([userId]) => userId)
    .slice(0, limit);
  const authUsers = await getUsersByIds(filteredIds);
  const authById = new Map(authUsers.map((user) => [user.$id, user]));
  const rows = filteredIds
    .map((userId) => {
      const profile = profilesByUserId.get(userId);
      const auth = authById.get(userId);
      const fullName = cleanString(profile?.full_name || profile?.nickname || auth?.name || auth?.email || userId);
      return {
        userId,
        email: cleanString(auth?.email || profile?.email),
        name: cleanString(auth?.name || fullName),
        role,
        roles: parseAssignedRoleSlugs(profile),
        activeRole: cleanString(profile?.active_role || profile?.role) || role,
        assignedRoleSlugs: parseAssignedRoleSlugs(profile),
        activeRoleSlug: cleanString(profile?.active_role_slug),
        labels: auth?.labels || [],
        emailVerification: Boolean(auth?.emailVerification),
        createdAt: auth?.$createdAt || "",
        profile: {
          fullName,
          nickname: cleanString(profile?.nickname),
          anacCode: cleanString(profile?.anac_code),
        },
      };
    })
    .sort((a, b) => adminPickerUserLabel(a).localeCompare(adminPickerUserLabel(b), "pt-BR"));
  return { users: rows };
}

async function profileHasPortalRole(profile, role) {
  const safeRole = cleanString(role);
  if (!profile || !VALID_ROLES.has(safeRole)) return false;
  if (cleanString(profile.role) === safeRole || cleanString(profile.active_role) === safeRole) return true;
  const assignedSlugs = parseAssignedRoleSlugs(profile);
  if (assignedSlugs.includes(safeRole)) return true;
  const assignedPortals = await Promise.all(assignedSlugs.map((slug) => resolvePortalTypeForSlug(slug).catch(() => "")));
  return assignedPortals.includes(safeRole);
}

function adminPickerUserLabel(user) {
  return cleanString(user?.profile?.fullName || user?.name || user?.email || user?.userId);
}

async function backfillEnrollmentFormProfileDocument(userId, documents = {}) {
  if (documents?.enrollmentForm?.fileId || !CONTRACTS_COLLECTION_ID || !PROFILE_DOCUMENTS_COLLECTION_ID) {
    return documents;
  }
  const res = await databases.listDocuments(DATABASE_ID, CONTRACTS_COLLECTION_ID, [
    sdk.Query.equal("recipient_user_id", [userId]),
    sdk.Query.equal("contract_kind", ["enrollment_form"]),
    sdk.Query.orderDesc("created_at"),
    sdk.Query.limit(1),
  ]);
  const contract = res.documents?.[0];
  if (!contract) return documents;
  const fileId = cleanString(contract.signed_pdf_file_id) || cleanString(contract.enrollment_pdf_file_id);
  if (!fileId) return documents;
  const suffix = contract.signed_pdf_file_id ? "" : "-preview";
  await syncEnrollmentFormProfileDocument(contract, {
    fileId,
    fileName: `ficha-matricula-${userId}${suffix}.pdf`,
  });
  const refreshed = await getProfileDocumentsByUserIds([userId]);
  return refreshed.get(userId) || documents;
}

async function getUserDetail(targetUserId) {
  if (!targetUserId) {
    throw Object.assign(new Error("Usuario nao informado."), { status: 400 });
  }
  const user = await users.get({ userId: targetUserId });
  const [[profileByUserId, prefByUserId, documentsByUserId], flights, plans, trainingByUserId] = await Promise.all([
    Promise.all([
      getProfilesByUserIds([targetUserId]),
      getInstructorPrefsByUserIds([targetUserId]),
      getProfileDocumentsByUserIds([targetUserId]),
    ]),
    getFlightsByUserIds([targetUserId], { includeCsv: true }),
    getPlansByUserIds([targetUserId]),
    getTrainingAssignmentsByUserIds([targetUserId]),
  ]);
  let documents = documentsByUserId.get(targetUserId) || {};
  documents = await backfillEnrollmentFormProfileDocument(targetUserId, documents);
  // Resolve instructor names: collect unique instructor_user_id values from this user's flights
  const instructorIds = [...new Set(flights.map((f) => f.instructor_user_id).filter(Boolean))];
  const instructorProfilesByUserId = await getProfilesByUserIds(instructorIds);
  const record = toUserRecord(
    user,
    profileByUserId.get(targetUserId) || null,
    prefByUserId.get(targetUserId) || null,
    flights,
    plans,
    trainingByUserId.get(targetUserId) || [],
    instructorProfilesByUserId,
    documents,
  );
  if (CRM_LEADS_COLLECTION_ID) {
    const leadQueries = [
      [sdk.Query.equal("user_id", [targetUserId]), sdk.Query.orderDesc("$updatedAt"), sdk.Query.limit(1)],
      ...(user.email ? [[sdk.Query.equal("email", [cleanString(user.email).toLowerCase()]), sdk.Query.orderDesc("$updatedAt"), sdk.Query.limit(1)]] : []),
    ];
    for (const queries of leadQueries) {
      const result = await databases.listDocuments(DATABASE_ID, CRM_LEADS_COLLECTION_ID, queries).catch(() => ({ documents: [] }));
      const source = cleanString(result.documents?.[0]?.referral_source);
      if (source) {
        record.referralSource = source;
        break;
      }
    }
  }
  return record;
}

async function upsertProfile(userId, email, role, customRoleSlug = null, options = {}) {
  const existing = await getProfileByUserId(userId);
  const assignedSlugs = normalizeSlugList(
    options.assignedRoleSlugs ||
      (Array.isArray(options.roles) ? options.roles : null) ||
      parseAssignedRoleSlugs(existing || { role }),
  );
  const safeAssigned = assignedSlugs.length > 0 ? assignedSlugs : [normalizeRole(role)];
  let activeSlug = cleanString(options.activeRoleSlug) || parseActiveRoleSlug(existing || { role }, safeAssigned);
  if (!safeAssigned.includes(activeSlug)) {
    activeSlug = pickDefaultActiveSlug(safeAssigned);
  }
  const portalType = options.activeRole || normalizeRole(role);
  const resolvedPortal = await resolvePortalTypeForSlug(activeSlug);
  const safeActive = resolvedPortal || portalType;
  const slugForActive = resolveCustomRoleSlugForActive(activeSlug, safeActive);
  const roleCustomSlugs = options.roleCustomSlugs || parseRoleCustomSlugsJson(existing);
  const data = {
    user_id: userId,
    email,
    role: safeActive,
    roles: safeAssigned,
    assigned_role_slugs: safeAssigned,
    active_role: safeActive,
    active_role_slug: activeSlug,
    role_custom_slugs_json: JSON.stringify(roleCustomSlugs),
    school_id: SCHOOL_ID,
    is_active: existing?.is_active !== false,
    custom_role_slug: slugForActive || null,
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

async function createAdminUser(actorUserId, payload = {}) {
  await requireAdmin(actorUserId);
  const email = cleanString(payload.email).toLowerCase();
  const fullName = cleanString(payload.fullName).slice(0, 255);
  const password = String(payload.password || "");
  const role = VALID_ROLES.has(cleanString(payload.role)) ? cleanString(payload.role) : "aluno";
  if (!email || !sagaEmailLooksValid(email)) {
    throw Object.assign(new Error("E-mail invalido."), { status: 400 });
  }
  if (!fullName) {
    throw Object.assign(new Error("Nome completo nao informado."), { status: 400 });
  }
  if (password.length < 8) {
    throw Object.assign(new Error("A senha deve ter pelo menos 8 caracteres."), { status: 400 });
  }

  const authUser = await users.create({
    userId: sdk.ID.unique(),
    email,
    password,
    name: fullName.slice(0, 128),
  });
  try {
    await users.updateLabels({ userId: authUser.$id, labels: [role] });
    const profileId = await upsertProfile(authUser.$id, email, role);
    const profileUpdates = {
      full_name: fullName,
      phone: cleanString(payload.phone).slice(0, 32) || null,
      cpf: cleanString(payload.cpf).slice(0, 14) || null,
      birth_date: cleanString(payload.birthDate).slice(0, 10) || null,
      anac_code: cleanString(payload.anacCode).slice(0, 32) || null,
      is_active: payload.isActive !== false,
    };
    await databases.updateDocument(DATABASE_ID, PROFILES_COLLECTION_ID, profileId, profileUpdates);
  } catch (error) {
    await users.delete({ userId: authUser.$id }).catch(() => undefined);
    throw error;
  }
  return getUserDetail(authUser.$id);
}

async function updateRole(actorUserId, targetUserId, roleOrRoles, customRoleSlug = null, roleCustomSlugs = null) {
  await requireAdmin(actorUserId);
  const assignedRoleSlugs = normalizeSlugList(
    Array.isArray(roleOrRoles) ? roleOrRoles : [String(roleOrRoles || "")],
  );
  if (assignedRoleSlugs.length === 0) {
    throw Object.assign(new Error("Permissao invalida."), { status: 400 });
  }
  if (!targetUserId) {
    throw Object.assign(new Error("Usuario nao informado."), { status: 400 });
  }

  const existing = await getProfileByUserId(targetUserId);
  let activeSlug = parseActiveRoleSlug(existing, assignedRoleSlugs);
  if (!assignedRoleSlugs.includes(activeSlug)) {
    activeSlug = pickDefaultActiveSlug(assignedRoleSlugs);
  }
  const portalType = await resolvePortalTypeForSlug(activeSlug);

  const hasAdminAssignment = assignedRoleSlugs.includes("admin") ||
    (await Promise.all(assignedRoleSlugs.map((slug) => resolvePortalTypeForSlug(slug)))).includes("admin");
  if (actorUserId === targetUserId && !hasAdminAssignment) {
    throw Object.assign(new Error("Nao e permitido remover sua propria permissao de admin."), { status: 400 });
  }

  const user = await users.get({ userId: targetUserId });
  await syncUserRoleLabel(targetUserId, portalType);
  await upsertProfile(targetUserId, user.email || "", portalType, null, {
    assignedRoleSlugs,
    activeRoleSlug: activeSlug,
    activeRole: portalType,
  });

  return getUserDetail(targetUserId);
}

async function switchActiveRole(actorUserId, targetRoleSlug) {
  const safeSlug = cleanString(targetRoleSlug);
  const profile = await getProfileByUserId(actorUserId);
  if (!profile?.$id) {
    throw Object.assign(new Error("Perfil nao encontrado."), { status: 404 });
  }
  const assignedRoleSlugs = parseAssignedRoleSlugs(profile);
  if (!assignedRoleSlugs.includes(safeSlug)) {
    throw Object.assign(new Error("Role nao permitido para este usuario."), { status: 403 });
  }

  const portalType = await resolvePortalTypeForSlug(safeSlug);
  const user = await users.get({ userId: actorUserId });
  await syncUserRoleLabel(actorUserId, portalType);
  await upsertProfile(actorUserId, user.email || profile.email || "", portalType, null, {
    assignedRoleSlugs,
    activeRoleSlug: safeSlug,
    activeRole: portalType,
  });

  return getUserDetail(actorUserId);
}

function profileStringEqual(next, current) {
  return cleanString(next) === cleanString(current);
}

async function updateAdminUserProfile(actorUserId, targetUserId, payload = {}) {
  await requireAdmin(actorUserId);
  const safeUserId = cleanString(targetUserId);
  if (!safeUserId) throw Object.assign(new Error("Usuario nao informado."), { status: 400 });

  const profile = await getProfileByUserId(safeUserId);
  if (!profile?.$id) throw Object.assign(new Error("Perfil nao encontrado."), { status: 404 });

  const authUser = await users.get({ userId: safeUserId });
  const updates = {};

  if (payload.fullName !== undefined) {
    const fullName = cleanString(payload.fullName).slice(0, 255);
    if (!profileStringEqual(fullName, profile.full_name)) {
      updates.full_name = fullName || null;
      if (fullName && !profileStringEqual(fullName, authUser.name)) {
        await users.updateName({ userId: safeUserId, name: fullName.slice(0, 128) });
      }
    }
  }

  if (payload.email !== undefined) {
    const email = cleanString(payload.email).toLowerCase();
    const currentEmail = cleanString(authUser.email || profile.email).toLowerCase();
    if (email !== currentEmail) {
      if (!email || !sagaEmailLooksValid(email)) {
        throw Object.assign(new Error("E-mail invalido."), { status: 400 });
      }
      await users.updateEmail({ userId: safeUserId, email });
      updates.email = email;
    }
  }

  if (payload.cpf !== undefined) {
    const cpf = cleanString(payload.cpf).slice(0, 14) || null;
    if (!profileStringEqual(cpf, profile.cpf)) updates.cpf = cpf;
  }
  if (payload.phone !== undefined) {
    const phone = cleanString(payload.phone).slice(0, 32) || null;
    if (!profileStringEqual(phone, profile.phone)) updates.phone = phone;
  }
  if (payload.nickname !== undefined) {
    const nickname = cleanString(payload.nickname).slice(0, 128) || null;
    if (!profileStringEqual(nickname, profile.nickname)) updates.nickname = nickname;
  }
  if (payload.birthDate !== undefined) {
    const birthDate = cleanString(payload.birthDate);
    const nextBirth = birthDate ? (toSagaBirthdate(birthDate) || birthDate.slice(0, 10)) : null;
    if (!profileStringEqual(nextBirth, profile.birth_date)) updates.birth_date = nextBirth;
  }
  if (payload.anacCode !== undefined) {
    const anacCode = cleanString(payload.anacCode).slice(0, 32) || null;
    if (!profileStringEqual(anacCode, profile.anac_code)) updates.anac_code = anacCode;
  }
  if (payload.sagaUserId !== undefined) {
    const sagaUserId = cleanString(payload.sagaUserId).slice(0, 64) || null;
    const currentSaga = cleanString(profile.saga_user_id) || null;
    if (sagaUserId !== currentSaga) updates.saga_user_id = sagaUserId;
  }
  if (payload.weightKg !== undefined) {
    const weight = Number(payload.weightKg);
    const nextWeight = Number.isFinite(weight) && weight > 0 ? weight : null;
    const currentWeight = typeof profile.weight_kg === "number" ? profile.weight_kg : null;
    if (nextWeight !== currentWeight) updates.weight_kg = nextWeight;
  }
  if (payload.heightCm !== undefined) {
    const height = Number(payload.heightCm);
    const nextHeight = Number.isFinite(height) && height > 0 ? height : null;
    const currentHeight = typeof profile.height_cm === "number" ? profile.height_cm : null;
    if (nextHeight !== currentHeight) updates.height_cm = nextHeight;
  }
  if (payload.isActive !== undefined) {
    const nextActive = payload.isActive !== false;
    if (nextActive !== (profile.is_active !== false)) updates.is_active = nextActive;
  }

  if (Object.keys(updates).length === 0) {
    return getUserDetail(safeUserId);
  }

  try {
    await databases.updateDocument(DATABASE_ID, PROFILES_COLLECTION_ID, profile.$id, updates);
  } catch (err) {
    const message = String(err?.message || err);
    if (updates.saga_user_id !== undefined && /attribute|unknown|invalid document structure/i.test(message)) {
      const { saga_user_id: _ignored, ...rest } = updates;
      if (Object.keys(rest).length > 0) {
        await databases.updateDocument(DATABASE_ID, PROFILES_COLLECTION_ID, profile.$id, rest);
      }
      throw Object.assign(new Error("Nao foi possivel atualizar o ID SAGA neste ambiente."), { status: 500 });
    }
    throw err;
  }

  return getUserDetail(safeUserId);
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
  const creditId = sdk.ID.unique();
  const doc = await databases.createDocument(
    DATABASE_ID,
    STUDENT_CREDITS_COLLECTION_ID,
    creditId,
    {
      ...data,
      school_id: SCHOOL_ID,
      created_by: actorUserId,
      updated_by: actorUserId,
    },
    creditPermissions(data.user_id),
  );
  const sagaLogs = [];
  try {
    const saga = await createManualSagaCredit(doc, sagaLogs);
    return { doc, creditSaga: { ...saga, logs: sagaLogs.slice(-5) } };
  } catch (err) {
    return {
      doc,
      creditSaga: {
        ok: false,
        status: "failed",
        message: err?.message || String(err),
        logs: sagaLogs.slice(-5),
      },
    };
  }
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

function incrementDeletedCount(summary, collectionId, amount = 1) {
  const key = cleanString(collectionId) || "unknown";
  summary.deletedByCollection[key] = (summary.deletedByCollection[key] || 0) + amount;
  summary.deletedDocuments += amount;
}

function recordDeleteError(summary, collectionId, field, err) {
  summary.errors.push({
    collectionId: cleanString(collectionId) || "unknown",
    field: cleanString(field) || "",
    message: cleanString(err?.message || err).slice(0, 500),
  });
}

async function deleteDocumentQuietly(summary, collectionId, documentId, field = "") {
  if (!collectionId || !documentId) return;
  try {
    await databases.deleteDocument(DATABASE_ID, collectionId, documentId);
    incrementDeletedCount(summary, collectionId);
  } catch (err) {
    recordDeleteError(summary, collectionId, field, err);
  }
}

async function deleteDocsByEqual(summary, collectionId, field, values, extraQueries = []) {
  const cleanValues = Array.from(new Set((Array.isArray(values) ? values : [values]).map(cleanString).filter(Boolean)));
  if (!collectionId || !field || !cleanValues.length) return [];
  const deleted = [];
  try {
    const docs = await listDocumentsByFieldIn(collectionId, field, cleanValues, extraQueries, 25);
    const uniqueDocs = Array.from(new Map(docs.map((doc) => [doc.$id, doc])).values());
    for (const doc of uniqueDocs) {
      await databases.deleteDocument(DATABASE_ID, collectionId, doc.$id);
      deleted.push(doc);
      incrementDeletedCount(summary, collectionId);
    }
    return deleted;
  } catch (err) {
    recordDeleteError(summary, collectionId, field, err);
    return deleted;
  }
}

async function deleteStorageFileQuietly(summary, bucketId, fileId) {
  if (!bucketId || !fileId) return;
  try {
    await storage.deleteFile(bucketId, fileId);
    summary.deletedFiles += 1;
  } catch (err) {
    summary.fileErrors.push({
      bucketId: cleanString(bucketId) || "unknown",
      fileId: cleanString(fileId),
      message: cleanString(err?.message || err).slice(0, 500),
    });
  }
}

async function deleteAdminUserCascade(actorUserId, targetUserId, req) {
  const safeUserId = cleanString(targetUserId);
  if (!safeUserId) throw Object.assign(new Error("Usuario nao informado."), { status: 400 });
  if (actorUserId === safeUserId) {
    throw Object.assign(new Error("Nao e permitido excluir o proprio usuario logado."), { status: 400 });
  }

  const [targetUser, profile] = await Promise.all([
    users.get({ userId: safeUserId }),
    getProfileByUserId(safeUserId).catch(() => null),
  ]);
  const summary = {
    userId: safeUserId,
    deletedAuthUser: false,
    deletedDocuments: 0,
    deletedFiles: 0,
    deletedByCollection: {},
    errors: [],
    fileErrors: [],
  };
  const beforeSnapshot = {
    user: {
      id: targetUser.$id,
      email: targetUser.email || "",
      name: targetUser.name || "",
      labels: targetUser.labels || [],
    },
    profile: profile ? {
      id: profile.$id,
      role: profile.role || null,
      email: profile.email || null,
      fullName: profile.full_name || null,
      anacCode: profile.anac_code || null,
    } : null,
  };

  const profileDocs = await listAllDocuments(PROFILE_DOCUMENTS_COLLECTION_ID, [
    sdk.Query.equal("user_id", [safeUserId]),
  ]).catch((err) => {
    recordDeleteError(summary, PROFILE_DOCUMENTS_COLLECTION_ID, "user_id", err);
    return [];
  });

  const flightDocs = [];
  for (const field of ["student_user_id", "user_id", "instructor_user_id"]) {
    const docs = await listAllDocuments(FLIGHTS_COLLECTION_ID, [
      sdk.Query.equal(field, [safeUserId]),
      ...selectQuery(["$id", "csv_file_id"]),
    ]).catch((err) => {
      recordDeleteError(summary, FLIGHTS_COLLECTION_ID, field, err);
      return [];
    });
    flightDocs.push(...docs);
  }
  const uniqueFlights = Array.from(new Map(flightDocs.map((doc) => [doc.$id, doc])).values());
  const flightIds = uniqueFlights.map((doc) => doc.$id).filter(Boolean);

  await deleteDocsByEqual(summary, FLIGHT_MANEUVER_REVIEWS_COLLECTION_ID, "flight_id", flightIds);
  await deleteDocsByEqual(summary, FLIGHT_MANEUVERS_COLLECTION_ID, "flight_id", flightIds);
  await deleteDocsByEqual(summary, FLIGHT_VIDEOS_COLLECTION_ID, "flight_id", flightIds);
  await deleteDocsByEqual(summary, FLIGHT_SIGNATURES_COLLECTION_ID, "flight_id", flightIds);
  await deleteDocsByEqual(summary, FLIGHT_INSTRUCTOR_PAYMENTS_COLLECTION_ID, "flight_id", flightIds);
  await deleteDocsByEqual(summary, FLIGHT_TELEMETRY_SUMMARIES_COLLECTION_ID, "flight_id", flightIds);
  await deleteDocsByEqual(summary, FLIGHT_LANDINGS_COLLECTION_ID, "flight_id", flightIds);
  await deleteDocsByEqual(summary, FLIGHT_TAKEOFFS_COLLECTION_ID, "flight_id", flightIds);
  await deleteDocsByEqual(summary, FLIGHT_TELEMETRY_ALERTS_COLLECTION_ID, "flight_id", flightIds);

  for (const field of ["signer_user_id", "student_user_id", "instructor_user_id"]) {
    await deleteDocsByEqual(summary, FLIGHT_SIGNATURES_COLLECTION_ID, field, safeUserId);
  }
  for (const field of ["student_user_id", "instructor_user_id"]) {
    await deleteDocsByEqual(summary, FLIGHT_TELEMETRY_SUMMARIES_COLLECTION_ID, field, safeUserId);
    await deleteDocsByEqual(summary, FLIGHT_LANDINGS_COLLECTION_ID, field, safeUserId);
    await deleteDocsByEqual(summary, FLIGHT_TAKEOFFS_COLLECTION_ID, field, safeUserId);
    await deleteDocsByEqual(summary, FLIGHT_TELEMETRY_ALERTS_COLLECTION_ID, field, safeUserId);
  }
  for (const field of ["student_id", "instructor_id", "created_by"]) {
    await deleteDocsByEqual(summary, FLIGHT_MANEUVERS_COLLECTION_ID, field, safeUserId);
  }
  await deleteDocsByEqual(summary, FLIGHT_VIDEOS_COLLECTION_ID, "uploaded_by", safeUserId);

  for (const flight of uniqueFlights) {
    await deleteDocumentQuietly(summary, FLIGHTS_COLLECTION_ID, flight.$id, "user");
  }

  await deleteDocsByEqual(summary, WEEKLY_PLANS_COLLECTION_ID, "student_id", safeUserId, [sdk.Query.equal("school_id", [SCHOOL_ID])]);
  await deleteDocsByEqual(summary, STUDENT_TRACKS_COLLECTION_ID, "student_user_id", safeUserId);
  await deleteDocsByEqual(summary, STUDENT_CREDITS_COLLECTION_ID, "user_id", safeUserId);
  await deleteDocsByEqual(summary, PRODUCT_SALES_COLLECTION_ID, "user_id", safeUserId);
  await deleteDocsByEqual(summary, INSTRUCTOR_COSTS_COLLECTION_ID, "instructor_user_id", safeUserId);
  await deleteDocsByEqual(summary, FLIGHT_INSTRUCTOR_PAYMENTS_COLLECTION_ID, "instructor_user_id", safeUserId);
  await deleteDocsByEqual(summary, INSTRUCTOR_PREFS_COLLECTION_ID, "user_id", safeUserId);
  await deleteDocsByEqual(summary, STUDENT_OBSERVATIONS_COLLECTION_ID, "student_user_id", safeUserId);
  await deleteDocsByEqual(summary, STUDENT_OBSERVATIONS_COLLECTION_ID, "author_user_id", safeUserId);
  await deleteDocsByEqual(summary, PUSH_SUBSCRIPTIONS_COLLECTION_ID, "user_id", safeUserId);
  await deleteDocsByEqual(summary, NOTIFICATION_DELIVERIES_COLLECTION_ID, "recipient_user_id", safeUserId);
  await deleteDocsByEqual(summary, CONTRACTS_COLLECTION_ID, "recipient_user_id", safeUserId);
  await deleteDocsByEqual(summary, CONTRACT_SIGNATURES_COLLECTION_ID, "signer_user_id", safeUserId);
  await deleteDocsByEqual(summary, FUELINGS_COLLECTION_ID, "student_user_id", safeUserId);
  await deleteDocsByEqual(summary, FUELINGS_COLLECTION_ID, "responsible_user_id", safeUserId);
  await deleteDocsByEqual(summary, MAINTENANCE_ATTACHMENTS_COLLECTION_ID, "uploaded_by", safeUserId);

  for (const doc of profileDocs) {
    await deleteDocumentQuietly(summary, PROFILE_DOCUMENTS_COLLECTION_ID, doc.$id, "user_id");
    await deleteStorageFileQuietly(summary, FLIGHTS_CSV_BUCKET_ID, doc.file_id);
  }
  if (profile?.anac_photo_file_id) {
    await deleteStorageFileQuietly(summary, FLIGHTS_CSV_BUCKET_ID, profile.anac_photo_file_id);
  }
  if (profile) {
    await deleteDocumentQuietly(summary, PROFILES_COLLECTION_ID, profile.$id, "user_id");
  }

  for (const flight of uniqueFlights) {
    await deleteStorageFileQuietly(summary, FLIGHTS_CSV_BUCKET_ID, flight.csv_file_id);
  }

  await createAuditEvent(actorUserId, {
    eventType: "user_deleted_cascade",
    entityType: "user",
    entityId: safeUserId,
    reason: cleanString(req?.bodyJson?.reason) || "Exclusao manual via Admin Usuarios",
    beforeSnapshot,
    afterSnapshot: summary,
    ip: req?.headers?.["x-forwarded-for"] || req?.headers?.["x-real-ip"] || "",
    userAgent: req?.headers?.["user-agent"] || "",
  }).catch((err) => recordDeleteError(summary, AUDIT_EVENTS_COLLECTION_ID, "create", err));

  try {
    await users.delete({ userId: safeUserId });
    summary.deletedAuthUser = true;
  } catch (err) {
    recordDeleteError(summary, "auth.users", "userId", err);
  }

  return summary;
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
  return metaBlockMinutes(meta) ?? 0;
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

  const instructorVariableByInstructor = {};
  for (const payment of monthPayments) {
    addBreakdown(
      instructorVariableByInstructor,
      "instructors",
      userLabel(payment.instructor_user_id, data.usersById, data.profilesByUserId),
      roundMoney(-1 * numValue(payment.total_calculated)),
    );
  }
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
  const totalStudentsFlown = new Set(
    flights
      .map((flight) => cleanString(flight.studentUserId))
      .filter(Boolean),
  ).size;

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
      ...instructorVariableByInstructor,
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
    makeLine("meta_students_flown", null, 1, "Meta", "Alunos Voados", "number", "DISTINCT(flights.student_user_id)", totalStudentsFlown),
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

function helpCollectionId(kind, audience = "student") {
  if (audience === "instructor") {
    if (kind === "section") return INSTRUCTOR_HELP_SECTIONS_COLLECTION_ID;
    if (kind === "article") return INSTRUCTOR_HELP_ARTICLES_COLLECTION_ID;
    return "";
  }
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

async function createHelpDocument(kind, data, audience = "student") {
  const collectionId = helpCollectionId(kind, audience);
  if (!collectionId) throw Object.assign(new Error("Coleção da central de ajuda não configurada."), { status: 500 });
  return databases.createDocument(DATABASE_ID, collectionId, sdk.ID.unique(), sanitizeHelpData(data));
}

async function updateHelpDocument(kind, documentId, data, audience = "student") {
  const collectionId = helpCollectionId(kind, audience);
  if (!collectionId) throw Object.assign(new Error("Coleção da central de ajuda não configurada."), { status: 500 });
  if (!documentId) throw Object.assign(new Error("Documento da central de ajuda não informado."), { status: 400 });
  return databases.updateDocument(DATABASE_ID, collectionId, documentId, sanitizeHelpData(data));
}

async function deleteHelpDocument(kind, documentId, audience = "student") {
  const collectionId = helpCollectionId(kind, audience);
  if (!collectionId) throw Object.assign(new Error("Coleção da central de ajuda não configurada."), { status: 500 });
  if (!documentId) throw Object.assign(new Error("Documento da central de ajuda não informado."), { status: 400 });
  await databases.deleteDocument(DATABASE_ID, collectionId, documentId);
}

const EMAIL_SETTINGS_KEY = "email";
const EMAIL_BRAND_SETTINGS_KEY = "emailBrand";
const SCHOOL_RULES_KEY = "schoolRules";
const ONBOARDING_SETTINGS_KEY = "onboarding";
const REFER_AND_EARN_SETTINGS_KEY = "referAndEarn";
const GOOGLE_CALENDAR_SETTINGS_KEY = "googleCalendar";
const CAKTO_SETTINGS_KEY = "cakto";
const WPP_SETTINGS_KEY = "wpp";
const FLIGHT_CREDIT_SALES_SETTINGS_KEY = "flightCreditSales";
const NOTIFICATION_CHANNELS = ["email", "push"];
const STUDENT_PORTAL_TABS = ["home", "jornada", "meus-voos", "agendamento", "schedule", "creditos", "avisos", "manuais", "manobras", "ajuda", "perfil"];
const NOTIFICATION_EVENT_TYPES = ["flight.scheduled", "flight.updated", "flight.reopened", "flight.cancelled", "flight.reminder_24h", "weeklyPlan.submitted", "notice.published", "schedule.published", "cakto.sale_approved"];
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

function normalizeCanac(value) {
  return cleanString(value).replace(/\D+/g, "");
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
  const nextStatus = flightDoc.flight_status || "Confirmado";
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

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function randomShareToken() {
  return crypto.randomBytes(32).toString("base64url");
}

async function getActorRole(actorUserId) {
  if (!actorUserId) return "";
  const profile = await getProfileByUserId(actorUserId).catch(() => null);
  if (profile) return resolveProfilePortal(profile);
  const actor = await users.get({ userId: actorUserId }).catch(() => null);
  return deriveRoleFromLabels(actor?.labels || []);
}

function publicFlightFields(doc, csvText) {
  return {
    id: doc.$id,
    source_filename: doc.source_filename || "",
    created_at: doc.$createdAt || "",
    aircraft_ident: doc.aircraft_ident || null,
    duration_sec: typeof doc.duration_sec === "number" ? doc.duration_sec : null,
    flight_date: doc.flight_date || null,
    start_time: doc.start_time || null,
    student_user_id: doc.student_user_id || doc.user_id || null,
    instructor_user_id: doc.instructor_user_id || null,
    training_track_id: doc.training_track_id || null,
    training_stage_id: doc.training_stage_id || null,
    training_mission_id: doc.training_mission_id || null,
    training_snapshot_json: doc.training_snapshot_json || null,
    from_to: doc.from_to || null,
    landings: typeof doc.landings === "number" ? doc.landings : null,
    block_time_minutes: typeof doc.block_time_minutes === "number" ? doc.block_time_minutes : null,
    total_flight_minutes: typeof doc.total_flight_minutes === "number" ? doc.total_flight_minutes : null,
    total_miles: typeof doc.total_miles === "number" ? doc.total_miles : null,
    telemetry_present: typeof doc.telemetry_present === "boolean" ? doc.telemetry_present : null,
    instructor_suggestion_md: null,
    student_suggestion_md: null,
    instructor_suggestion_present: null,
    student_suggestion_present: null,
    weight_balance_complete: null,
    is_night: null,
    training_mission_ids_json: doc.training_mission_ids_json || null,
    schedule_week_start: doc.schedule_week_start || null,
    schedule_demand_id: doc.schedule_demand_id || null,
    flight_seq_number: typeof doc.flight_seq_number === "number" ? doc.flight_seq_number : null,
    instructor_signed: typeof doc.instructor_signed === "boolean" ? doc.instructor_signed : null,
    student_signed: typeof doc.student_signed === "boolean" ? doc.student_signed : null,
    admin_operator_signed: typeof doc.admin_operator_signed === "boolean" ? doc.admin_operator_signed : null,
    instructor_signed_at: doc.instructor_signed_at || null,
    flight_status: doc.flight_status || "Confirmado",
    csv_text: csvText || "",
  };
}

function toPublicVideo(doc) {
  return {
    id: doc.$id,
    flight_id: doc.flight_id || "",
    uploaded_by: doc.uploaded_by || "",
    file_url: doc.file_url || "",
    file_size: typeof doc.file_size === "number" ? doc.file_size : null,
    duration_sec: typeof doc.duration_sec === "number" ? doc.duration_sec : null,
    original_files_count: typeof doc.original_files_count === "number" ? doc.original_files_count : null,
    processing_status: doc.processing_status || "processing",
    telemetry_present: Boolean(doc.telemetry_present),
    telemetry_source: doc.telemetry_source || "none",
    telemetry_json: doc.telemetry_json || "",
    available_widgets: doc.available_widgets || "[]",
    apply_logo: Boolean(doc.apply_logo),
    processing_stage: doc.processing_stage || "",
    processing_percent: typeof doc.processing_percent === "number" ? doc.processing_percent : 0,
    processing_error: doc.processing_error || "",
    video_key: doc.video_key || "",
    processing_updated_at: doc.processing_updated_at || "",
    created_at: doc.$createdAt || doc.created_at || "",
  };
}

function toPublicTemplate(doc) {
  return {
    id: doc.$id,
    name: doc.name || "",
    category: doc.category || "other",
    aircraft_model_id: doc.aircraft_model_id || "",
    description: doc.description || null,
    is_active: doc.is_active !== false,
    created_at: doc.created_at || doc.$createdAt || "",
    updated_at: doc.updated_at || doc.$updatedAt || "",
  };
}

function toPublicManeuver(doc) {
  return {
    id: doc.$id,
    flight_id: doc.flight_id || "",
    template_id: doc.template_id || "",
    instructor_id: doc.instructor_id || "",
    student_id: doc.student_id || null,
    aircraft_ident: doc.aircraft_ident || null,
    start_time: doc.start_time || "",
    end_time: doc.end_time || "",
    status: doc.status || "draft",
    created_by: doc.created_by || "",
    created_at: doc.created_at || doc.$createdAt || "",
    updated_at: doc.updated_at || doc.$updatedAt || "",
  };
}

function toPublicReview(doc) {
  let analysis = { steps: [], alerts: [] };
  try {
    if (typeof doc.analysis_json === "string") analysis = JSON.parse(doc.analysis_json);
  } catch {
    analysis = { steps: [], alerts: [] };
  }
  return {
    id: doc.$id,
    flight_maneuver_id: doc.flight_maneuver_id || "",
    flight_id: doc.flight_id || "",
    status: doc.status || "unavailable",
    summary: doc.summary || null,
    analysis,
    created_at: doc.created_at || doc.$createdAt || "",
    updated_at: doc.updated_at || doc.$updatedAt || "",
  };
}

async function loadFlightCsvText(doc) {
  if (doc.csv_file_id && FLIGHTS_CSV_BUCKET_ID) {
    try {
      const buffer = await storage.getFileDownload(FLIGHTS_CSV_BUCKET_ID, doc.csv_file_id);
      if (Buffer.isBuffer(buffer)) return buffer.toString("utf8");
      if (buffer instanceof ArrayBuffer) return Buffer.from(buffer).toString("utf8");
      if (buffer) return Buffer.from(buffer).toString("utf8");
    } catch {
      // Fallback to document field below.
    }
  }
  return doc.csv_text || "";
}

async function authorizeFlightShare(actorUserId, flight) {
  if (!actorUserId) throw Object.assign(new Error("Unauthorized request."), { status: 401 });
  const role = await getActorRole(actorUserId);
  if (role === "admin") return;
  if (role === "instrutor" && flight.instructor_user_id === actorUserId) return;
  const studentUserId = flight.student_user_id || flight.user_id || "";
  if (role === "aluno" && studentUserId === actorUserId) return;
  throw Object.assign(new Error("Usuario sem permissao para compartilhar este voo."), { status: 403 });
}

async function createFlightPublicShare(actorUserId, payload = {}) {
  if (!FLIGHTS_COLLECTION_ID) throw Object.assign(new Error("Colecao de voos nao configurada."), { status: 500 });
  const flightId = cleanString(payload.flightId);
  if (!flightId) throw Object.assign(new Error("Voo nao informado."), { status: 400 });
  const flight = await databases.getDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, flightId);
  await authorizeFlightShare(actorUserId, flight);

  const token = randomShareToken();
  const now = nowIso();
  await databases.updateDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, flightId, {
    public_share_token_hash: sha256Hex(token),
    public_share_enabled: true,
    public_share_created_at: flight.public_share_created_at || now,
    public_share_last_generated_at: now,
  });

  const origin = cleanString(payload.origin) || APP_URL || "";
  const publicUrl = origin ? `${origin.replace(/\/+$/, "")}/share/flight-review/${token}` : `/share/flight-review/${token}`;
  return { publicUrl, token };
}

async function findPublicShareFlight(token, select = null) {
  const hash = sha256Hex(token);
  const queries = [
    sdk.Query.equal("public_share_token_hash", [hash]),
    sdk.Query.limit(1),
  ];
  if (select) queries.push(...selectQuery(select));
  const res = await databases.listDocuments(DATABASE_ID, FLIGHTS_COLLECTION_ID, queries);
  const flightDoc = res.documents[0];
  if (!flightDoc || flightDoc.public_share_enabled !== true) {
    throw Object.assign(new Error("Link publico nao encontrado ou desativado."), { status: 404 });
  }
  return flightDoc;
}

async function getPublicFlightReviewIntro(payload = {}) {
  if (!FLIGHTS_COLLECTION_ID) throw Object.assign(new Error("Colecao de voos nao configurada."), { status: 500 });
  const token = cleanString(payload.token);
  if (!token) throw Object.assign(new Error("Link publico invalido."), { status: 400 });

  const flightDoc = await findPublicShareFlight(token, FLIGHT_SELECT);
  const studentUserId = cleanString(flightDoc.student_user_id || flightDoc.user_id);
  const [studentProfile, studentUser, brandLoaded] = await Promise.all([
    studentUserId ? getProfileByUserId(studentUserId).catch(() => null) : Promise.resolve(null),
    studentUserId ? users.get({ userId: studentUserId }).catch(() => null) : Promise.resolve(null),
    loadEmailBrandSettings().catch(() => ({ settings: defaultEmailSettings(), doc: null })),
  ]);

  const missionName = flightDoc.name || flightDoc.source_filename || "Flight Review";
  const studentName =
    cleanString(studentProfile?.full_name) ||
    cleanString(studentUser?.name) ||
    cleanString(studentProfile?.email) ||
    "O aluno";
  const studentNickname = cleanString(studentProfile?.nickname) || studentName;

  return {
    flightId: flightDoc.$id,
    missionName,
    studentName,
    studentNickname,
    flightDate: flightDoc.flight_date || "",
    startTime: flightDoc.start_time || "",
    aircraftIdent: flightDoc.aircraft_ident || "",
    brandSettings: publicEmailBrandSettings(brandLoaded.settings, brandLoaded.doc?.$updatedAt || null),
  };
}

async function getPublicFlightReviewShare(payload = {}) {
  if (!FLIGHTS_COLLECTION_ID) throw Object.assign(new Error("Colecao de voos nao configurada."), { status: 500 });
  const token = cleanString(payload.token);
  if (!token) throw Object.assign(new Error("Link publico invalido."), { status: 400 });
  const flightDoc = await findPublicShareFlight(token, FLIGHT_DETAIL_SELECT);

  const flightId = flightDoc.$id;
  const [videoDocs, maneuverDocs, reviewDocs, brandLoaded] = await Promise.all([
    FLIGHT_VIDEOS_COLLECTION_ID
      ? databases
          .listDocuments(DATABASE_ID, FLIGHT_VIDEOS_COLLECTION_ID, [
            sdk.Query.equal("flight_id", [flightId]),
            sdk.Query.orderDesc("$createdAt"),
            sdk.Query.limit(100),
          ])
          .then((r) => r.documents)
          .catch(() => [])
      : Promise.resolve([]),
    FLIGHT_MANEUVERS_COLLECTION_ID
      ? databases
          .listDocuments(DATABASE_ID, FLIGHT_MANEUVERS_COLLECTION_ID, [
            sdk.Query.equal("flight_id", [flightId]),
            sdk.Query.orderAsc("start_time"),
            sdk.Query.limit(100),
          ])
          .then((r) => r.documents)
          .catch(() => [])
      : Promise.resolve([]),
    FLIGHT_MANEUVER_REVIEWS_COLLECTION_ID
      ? databases
          .listDocuments(DATABASE_ID, FLIGHT_MANEUVER_REVIEWS_COLLECTION_ID, [
            sdk.Query.equal("flight_id", [flightId]),
            sdk.Query.limit(100),
          ])
          .then((r) => r.documents)
          .catch(() => [])
      : Promise.resolve([]),
    loadEmailBrandSettings().catch(() => ({ settings: defaultEmailSettings(), doc: null })),
  ]);

  const templateIds = Array.from(new Set(maneuverDocs.map((doc) => doc.template_id).filter(Boolean)));
  const templateDocs = [];
  if (MANEUVER_TEMPLATES_COLLECTION_ID && templateIds.length > 0) {
    const docs = await Promise.all(
      templateIds.map((id) => databases.getDocument(DATABASE_ID, MANEUVER_TEMPLATES_COLLECTION_ID, id).catch(() => null)),
    );
    templateDocs.push(...docs.filter(Boolean));
  }

  const csvText = await loadFlightCsvText(flightDoc);
  const meta = decodeFlightMeta(csvText);
  const missionName =
    meta?.training?.missionName ||
    meta?.training?.snapshot?.missionName ||
    flightDoc.name ||
    flightDoc.source_filename ||
    "Flight Review";

  return {
    flight: publicFlightFields(flightDoc, csvText),
    missionName,
    videos: videoDocs.map(toPublicVideo).filter((video) => video.processing_status === "ready" && video.file_url),
    maneuvers: maneuverDocs.map(toPublicManeuver),
    maneuverReviews: reviewDocs.map(toPublicReview),
    maneuverTemplates: templateDocs.map(toPublicTemplate),
    brandSettings: publicEmailBrandSettings(brandLoaded.settings, brandLoaded.doc?.$updatedAt || null),
  };
}

async function requireVideoUploader(actorUserId, flightId, { studentExport = false } = {}) {
  if (!actorUserId) throw Object.assign(new Error("Unauthorized request."), { status: 401 });
  if (!FLIGHTS_COLLECTION_ID) throw Object.assign(new Error("Colecao de voos nao configurada."), { status: 500 });
  const [profile, actor] = await Promise.all([getProfileByUserId(actorUserId), users.get({ userId: actorUserId })]);
  const profileRole = normalizeRole(profile?.role);
  const labelRole = deriveRoleFromLabels(actor?.labels || []);
  const role = profileRole === "aluno" ? labelRole : profileRole;
  if (role === "admin") return;
  if (role === "instrutor") {
    if (!flightId) throw Object.assign(new Error("Voo nao informado."), { status: 400 });
    const flight = await databases.getDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, flightId, [
      sdk.Query.select(["instructor_user_id"]),
    ]);
    if (flight.instructor_user_id !== actorUserId) {
      throw Object.assign(new Error("Instrutor nao vinculado a este voo."), { status: 403 });
    }
    return;
  }
  // Aluno: somente para gravar o MP4 exportado (chave *-telemetry-<ts>.mp4)
  // do proprio voo — nunca para enviar/substituir os videos originais.
  if (studentExport) {
    if (!flightId) throw Object.assign(new Error("Voo nao informado."), { status: 400 });
    const flight = await databases.getDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, flightId, [
      sdk.Query.select(["student_user_id", "user_id"]),
    ]);
    const studentUserId = flight.student_user_id || flight.user_id || null;
    if (studentUserId === actorUserId) return;
    throw Object.assign(new Error("Aluno nao vinculado a este voo."), { status: 403 });
  }
  throw Object.assign(new Error("Apenas admin ou instrutor pode enviar videos."), { status: 403 });
}

async function getVideoWorkerConfig(actorUserId, payload) {
  if (!CF_WORKER_URL || !WORKER_SECRET) {
    throw Object.assign(new Error("Worker de video nao configurado."), { status: 500 });
  }
  const mode = cleanString(payload.mode);
  const flightId = cleanString(payload.flightId);

  const now = Math.floor(Date.now() / 1000);
  const base = {
    sub: actorUserId,
    flightId,
    iat: now,
    exp: now + 48 * 60 * 60,
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
    const isStudentExportKey = /-telemetry-\d+\.mp4$/.test(rawKey);
    await requireVideoUploader(actorUserId, flightId, { studentExport: isStudentExportKey });
    return {
      workerUrl: CF_WORKER_URL,
      uploadToken: signWorkerToken({ ...base, action: "upload", key: `flights/${rawKey}` }),
    };
  }

  if (mode === "list") {
    await requireVideoUploader(actorUserId, flightId);
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
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if ((parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") && base) {
        return new URL(`${parsed.pathname}${parsed.search}${parsed.hash}`, `${base}/`).toString();
      }
    } catch {
      return base;
    }
    return raw;
  }
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
      mode: "intentions",
      sagaOnlySchedule: false,
      bufferBeforeMinutes: 30,
      bufferAfterMinutes: 15,
      slotMinutes: 30,
      minRequestHours: 1,
      maxRequestHours: 4,
      weekdayMinHours: 1,
      weekdayMaxHours: 4,
      weekendMinHours: 1,
      weekendMaxHours: 4,
      weekdayMaxFlightsPerDay: null,
      weekendMaxFlightsPerDay: null,
      weeklyMaxFlightHours: null,
      weeklyMaxFlights: null,
      weekendMaxFlightHours: null,
      weekendMaxFlights: null,
      allowZeroCreditOneHour: false,
      allowStudentFlightIntentions: true,
      requireCreditsForIntentions: false,
      requireCreditsForBooking: false,
      scheduleStartTime: "06:00",
      allowNightFlights: false,
      nightFlightStartHour: 18,
      nightBookingWeekdays: [],
      cancellationPenalty48hPct: 0,
      cancellationPenalty24hPct: 0,
      cancellationPenalty12hPct: 0,
      cancellationPenalty1hPct: 0,
      autoDebitCancellationPenalty: false,
      minBookingLeadDays: 0,
      maxBookingLeadDays: 365,
      studentHiddenAircraftIdents: [],
      studentWaitlistAircraftIdents: [],
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

const SCHEDULE_SYSTEM_FAQ_IDS = [
  "how-it-works",
  "how-to-book",
  "how-to-view",
  "intentions-mode",
  "flight-duration",
  "booking-window",
  "weekly-limits",
  "credits",
  "night-flights",
  "cancellation",
  "status-colors",
  "views",
];

function emptyRichDoc() {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

function sanitizeScheduleStudentHelp(input) {
  const raw = input && typeof input === "object" ? input : {};
  const defaultEnabled = Object.fromEntries(SCHEDULE_SYSTEM_FAQ_IDS.map((id) => [id, true]));
  const systemFaqEnabled =
    raw.systemFaqEnabled && typeof raw.systemFaqEnabled === "object"
      ? { ...defaultEnabled, ...raw.systemFaqEnabled }
      : defaultEnabled;

  const onboardingSteps = (Array.isArray(raw.onboardingSteps) ? raw.onboardingSteps : [])
    .map((step, index) => {
      if (!step || typeof step !== "object") return null;
      const title = cleanString(step.title).slice(0, 200);
      const descriptionJson = parseStoredRichJsonField(step.descriptionJson) || emptyRichDoc();
      if (!title) return null;
      return {
        id: cleanString(step.id || `step-${index}`).slice(0, 64),
        title,
        descriptionJson,
        sortOrder: Number.isFinite(Number(step.sortOrder)) ? Number(step.sortOrder) : index,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, 5);

  const customFaqs = (Array.isArray(raw.customFaqs) ? raw.customFaqs : [])
    .map((faq, index) => {
      if (!faq || typeof faq !== "object") return null;
      const title = cleanString(faq.title).slice(0, 200);
      const answerJson = parseStoredRichJsonField(faq.answerJson) || emptyRichDoc();
      if (!title) return null;
      return {
        id: cleanString(faq.id || `faq-${index}`).slice(0, 64),
        title,
        answerJson,
        sortOrder: Number.isFinite(Number(faq.sortOrder)) ? Number(faq.sortOrder) : index,
        enabled: faq.enabled !== false,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, 10);

  const systemFaqTitles = (() => {
    if (!raw.systemFaqTitles || typeof raw.systemFaqTitles !== "object") return {};
    const result = {};
    for (const id of SCHEDULE_SYSTEM_FAQ_IDS) {
      const value = cleanString(raw.systemFaqTitles[id]).slice(0, 200);
      if (value) result[id] = value;
    }
    return result;
  })();

  return {
    onboardingEnabled: raw.onboardingEnabled !== false,
    onboardingSteps,
    customFaqs,
    systemFaqEnabled,
    systemFaqTitles,
  };
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
      mode: ["booking", "view", "closed", "intentions"].includes(settings?.schedule?.mode)
        ? settings.schedule.mode
        : defaults.schedule.mode,
      sagaOnlySchedule: Boolean(settings?.schedule?.sagaOnlySchedule ?? false),
      bufferBeforeMinutes: Math.max(0, Math.round(Number(settings?.schedule?.bufferBeforeMinutes ?? defaults.schedule.bufferBeforeMinutes))),
      bufferAfterMinutes: Math.max(0, Math.round(Number(settings?.schedule?.bufferAfterMinutes ?? defaults.schedule.bufferAfterMinutes))),
      slotMinutes: [15, 30, 45, 60].includes(Number(settings?.schedule?.slotMinutes))
        ? Number(settings.schedule.slotMinutes)
        : defaults.schedule.slotMinutes,
      scheduleStartTime: /^\d{2}:\d{2}$/.test(String(settings?.schedule?.scheduleStartTime ?? ""))
        ? String(settings.schedule.scheduleStartTime)
        : defaults.schedule.scheduleStartTime,
      minRequestHours,
      maxRequestHours,
      weekdayMinHours: Math.max(0.25, Number(settings?.schedule?.weekdayMinHours ?? minRequestHours)),
      weekdayMaxHours: Math.max(0.25, Number(settings?.schedule?.weekdayMaxHours ?? maxRequestHours)),
      weekendMinHours: Math.max(0.25, Number(settings?.schedule?.weekendMinHours ?? minRequestHours)),
      weekendMaxHours: Math.max(0.25, Number(settings?.schedule?.weekendMaxHours ?? maxRequestHours)),
      weekdayMaxFlightsPerDay: Number(settings?.schedule?.weekdayMaxFlightsPerDay) > 0
        ? Math.round(Number(settings.schedule.weekdayMaxFlightsPerDay))
        : null,
      weekendMaxFlightsPerDay: Number(settings?.schedule?.weekendMaxFlightsPerDay) > 0
        ? Math.round(Number(settings.schedule.weekendMaxFlightsPerDay))
        : null,
      weeklyMaxFlightHours: Number(settings?.schedule?.weeklyMaxFlightHours) > 0
        ? Math.round(Number(settings.schedule.weeklyMaxFlightHours) * 2) / 2
        : null,
      weeklyMaxFlights: Number(settings?.schedule?.weeklyMaxFlights) > 0
        ? Math.round(Number(settings.schedule.weeklyMaxFlights))
        : null,
      weekendMaxFlightHours: Number(settings?.schedule?.weekendMaxFlightHours) > 0
        ? Math.round(Number(settings.schedule.weekendMaxFlightHours) * 2) / 2
        : null,
      weekendMaxFlights: Number(settings?.schedule?.weekendMaxFlights) > 0
        ? Math.round(Number(settings.schedule.weekendMaxFlights))
        : null,
      allowZeroCreditOneHour: Boolean(settings?.schedule?.allowZeroCreditOneHour),
      allowStudentFlightIntentions: Boolean(
        settings?.schedule?.allowStudentFlightIntentions ?? defaults.schedule.allowStudentFlightIntentions,
      ),
      requireCreditsForIntentions: Boolean(
        settings?.schedule?.requireCreditsForIntentions ?? defaults.schedule.requireCreditsForIntentions,
      ),
      requireCreditsForBooking: Boolean(
        settings?.schedule?.requireCreditsForBooking ?? settings?.schedule?.requireCreditsForIntentions ?? false,
      ),
      allowNightFlights: Boolean(
        settings?.schedule?.allowNightFlights ?? defaults.schedule.allowNightFlights,
      ),
      nightFlightStartHour: (() => {
        const h = Number(settings?.schedule?.nightFlightStartHour ?? defaults.schedule.nightFlightStartHour);
        return Number.isFinite(h) && h >= 0 && h < 24 ? h : defaults.schedule.nightFlightStartHour;
      })(),
      nightBookingWeekdays: Array.isArray(settings?.schedule?.nightBookingWeekdays)
        ? [...new Set(settings.schedule.nightBookingWeekdays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
        : [],
      cancellationPenalty48hPct: Math.min(100, Math.max(0, Math.round(Number(settings?.schedule?.cancellationPenalty48hPct) || 0))),
      cancellationPenalty24hPct: Math.min(100, Math.max(0, Math.round(Number(settings?.schedule?.cancellationPenalty24hPct) || 0))),
      cancellationPenalty12hPct: Math.min(100, Math.max(0, Math.round(Number(settings?.schedule?.cancellationPenalty12hPct) || 0))),
      cancellationPenalty1hPct: Math.min(100, Math.max(0, Math.round(Number(settings?.schedule?.cancellationPenalty1hPct) || 0))),
      autoDebitCancellationPenalty: Boolean(settings?.schedule?.autoDebitCancellationPenalty),
      minBookingLeadDays: Math.max(0, Math.round(Number(settings?.schedule?.minBookingLeadDays) || 0)),
      maxBookingLeadDays: Math.max(0, Math.round(Number(settings?.schedule?.maxBookingLeadDays ?? 365))),
      studentHiddenAircraftIdents: Array.isArray(settings?.schedule?.studentHiddenAircraftIdents)
        ? [...new Set(settings.schedule.studentHiddenAircraftIdents.map((value) => cleanString(value).toUpperCase()).filter(Boolean))]
        : [],
      studentWaitlistAircraftIdents: Array.isArray(settings?.schedule?.studentWaitlistAircraftIdents)
        ? [...new Set(settings.schedule.studentWaitlistAircraftIdents.map((value) => cleanString(value).toUpperCase()).filter(Boolean))]
        : [],
    },
    scheduleStudentHelp: (() => sanitizeScheduleStudentHelp(settings?.scheduleStudentHelp))(),
    emailNotifications: Object.fromEntries(
      NOTIFICATION_EVENT_TYPES.map((eventType) => [
        eventType,
        {
          enabled: Boolean(settings?.emailNotifications?.[eventType]?.enabled ?? true),
          customNotice: cleanString(settings?.emailNotifications?.[eventType]?.customNotice).slice(0, 500),
        },
      ]),
    ),
    flightReviewClub: {
      enabled: Boolean(settings?.flightReviewClub?.enabled ?? false),
      landingPageType: ["internal_public_page", "external_url"].includes(settings?.flightReviewClub?.landingPageType)
        ? settings.flightReviewClub.landingPageType
        : "internal_public_page",
      externalUrl: cleanString(settings?.flightReviewClub?.externalUrl).slice(0, 2048),
      showInStudentMenu: Boolean(settings?.flightReviewClub?.showInStudentMenu ?? false),
      benefits: Array.isArray(settings?.flightReviewClub?.benefits)
        ? settings.flightReviewClub.benefits.map((b) => cleanString(b).slice(0, 500)).filter(Boolean).slice(0, 20)
        : [],
      ctaSubscriptionUrl: cleanString(settings?.flightReviewClub?.ctaSubscriptionUrl).slice(0, 2048),
      trialFlightCount: (() => { const n = Number(settings?.flightReviewClub?.trialFlightCount ?? 0); return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0; })(),
    },
    updatedAt: updatedAt || null,
  };
}

function sanitizeSchoolRulesInput(input) {
  return publicSchoolRules(input && typeof input === "object" ? input : {}, null);
}

function defaultGoogleCalendarSettings() {
  return {
    enabled: false,
    delegatedEmail: null,
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
    oauthClientConfigured: Boolean(GOOGLE_CALENDAR_OAUTH_CLIENT_ID && GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET),
    oauthConnected: Boolean(cleanString(safe.oauthRefreshToken)),
    oauthEmail: cleanString(safe.oauthEmail) || null,
    delegatedEmail: cleanString(safe.delegatedEmail) || null,
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
    delegatedEmail: cleanString(raw.delegatedEmail) || null,
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

function defaultWppSettings() {
  return {
    wabaId: "",
    phoneNumberId: "",
    graphApiVersion: "v23.0",
    apiKey: "",
    businessName: null,
    verifiedName: null,
    displayPhoneNumber: null,
    connectionStatus: "not_tested",
    lastTestAt: null,
    lastError: null,
  };
}

function normalizeWppApiVersion(value) {
  const version = cleanString(value).toLowerCase();
  return /^v\d{1,2}\.\d{1,2}$/.test(version) ? version : "v23.0";
}

function publicWppSettings(settings, updatedAt) {
  const safe = settings && typeof settings === "object" ? settings : defaultWppSettings();
  return {
    wabaId: cleanString(safe.wabaId),
    phoneNumberId: cleanString(safe.phoneNumberId),
    graphApiVersion: normalizeWppApiVersion(safe.graphApiVersion),
    apiKeyConfigured: Boolean(cleanString(safe.apiKey)),
    businessName: cleanString(safe.businessName) || null,
    verifiedName: cleanString(safe.verifiedName) || null,
    displayPhoneNumber: cleanString(safe.displayPhoneNumber) || null,
    connectionStatus: ["connected", "error"].includes(safe.connectionStatus) ? safe.connectionStatus : "not_tested",
    lastTestAt: cleanString(safe.lastTestAt) || null,
    lastError: cleanString(safe.lastError).slice(0, 1024) || null,
    updatedAt: updatedAt || null,
  };
}

async function loadWppSettings() {
  const doc = await getSettingDoc(WPP_SETTINGS_KEY);
  const settings = doc ? parseJsonObject(doc.settings_json, defaultWppSettings()) : defaultWppSettings();
  return { settings: { ...defaultWppSettings(), ...settings }, doc };
}

async function persistWppSettings(settings, currentDoc = null) {
  if (!PLATFORM_SETTINGS_COLLECTION_ID) {
    throw Object.assign(new Error("Coleção platform_settings não configurada no Appwrite."), { status: 500 });
  }
  const data = { key: WPP_SETTINGS_KEY, settings_json: JSON.stringify(settings) };
  const doc = currentDoc || await getSettingDoc(WPP_SETTINGS_KEY);
  return doc
    ? databases.updateDocument(DATABASE_ID, PLATFORM_SETTINGS_COLLECTION_ID, doc.$id, data)
    : databases.createDocument(DATABASE_ID, PLATFORM_SETTINGS_COLLECTION_ID, sdk.ID.unique(), data, ADMIN_DOC_PERMS);
}

async function saveWppSettings(input) {
  const { settings: current, doc } = await loadWppSettings();
  const raw = input && typeof input === "object" ? input : {};
  const next = {
    ...current,
    wabaId: cleanString(raw.wabaId).slice(0, 128),
    phoneNumberId: cleanString(raw.phoneNumberId).slice(0, 128),
    graphApiVersion: normalizeWppApiVersion(raw.graphApiVersion),
    apiKey: cleanString(raw.apiKey) || cleanString(current.apiKey),
    connectionStatus: "not_tested",
    lastError: null,
  };
  if (!next.wabaId || !next.phoneNumberId || !next.apiKey) {
    throw Object.assign(new Error("Informe WABA ID, Phone Number ID e token de acesso."), { status: 400 });
  }
  const saved = await persistWppSettings(next, doc);
  return publicWppSettings(next, saved.$updatedAt || nowIso());
}

function requireWppCredentials(settings) {
  if (!cleanString(settings?.apiKey) || !cleanString(settings?.wabaId) || !cleanString(settings?.phoneNumberId)) {
    throw Object.assign(new Error("Conecte a conta do WhatsApp antes de continuar."), { status: 400 });
  }
}

async function wppGraphRequest(settings, pathOrUrl, options = {}) {
  requireWppCredentials(settings);
  const base = `https://graph.facebook.com/${normalizeWppApiVersion(settings.graphApiVersion)}`;
  const url = String(pathOrUrl || "").startsWith("https://") ? new URL(pathOrUrl) : new URL(`${base}/${String(pathOrUrl || "").replace(/^\//, "")}`);
  if (url.hostname !== "graph.facebook.com") throw Object.assign(new Error("Destino inválido para a API do WhatsApp."), { status: 400 });
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerMessage = cleanString(data?.error?.error_user_msg || data?.error?.message || data?.message);
    const isInvalidWabaId = Number(data?.error?.code) === 100 && /message_templates|nonexisting field/i.test(providerMessage);
    const message = isInvalidWabaId
      ? "O WABA ID informado não é uma Conta do WhatsApp Business. Ele parece ser um App ID ou Business Manager ID. Na Meta Business Suite, abra Configurações > Contas > Contas do WhatsApp, selecione a conta e copie o ID exibido no painel lateral."
      : providerMessage || `WhatsApp API retornou HTTP ${response.status}.`;
    throw Object.assign(new Error(message), { status: response.status >= 500 ? 502 : 422 });
  }
  return data;
}

async function testWppConnection() {
  const { settings, doc } = await loadWppSettings();
  requireWppCredentials(settings);
  try {
    const [business, phone] = await Promise.all([
      wppGraphRequest(settings, `${encodeURIComponent(settings.wabaId)}?fields=id,name`),
      wppGraphRequest(settings, `${encodeURIComponent(settings.phoneNumberId)}?fields=id,display_phone_number,verified_name,quality_rating`),
      // Valida o tipo do ID e a permissão whatsapp_business_management.
      // IDs de App/Business também respondem a fields=id,name, mas não possuem esta edge.
      wppGraphRequest(settings, `${encodeURIComponent(settings.wabaId)}/message_templates?limit=1&fields=id`),
    ]);
    const next = {
      ...settings,
      businessName: cleanString(business?.name) || null,
      verifiedName: cleanString(phone?.verified_name) || null,
      displayPhoneNumber: cleanString(phone?.display_phone_number) || null,
      connectionStatus: "connected",
      lastTestAt: nowIso(),
      lastError: null,
    };
    const saved = await persistWppSettings(next, doc);
    return publicWppSettings(next, saved.$updatedAt || nowIso());
  } catch (err) {
    const next = { ...settings, connectionStatus: "error", lastTestAt: nowIso(), lastError: cleanString(err?.message).slice(0, 1024) };
    await persistWppSettings(next, doc).catch(() => null);
    throw err;
  }
}

function normalizeWppTemplate(template) {
  const quality = template?.quality_score;
  return {
    id: cleanString(template?.id),
    name: cleanString(template?.name),
    status: cleanString(template?.status) || "PENDING",
    category: cleanString(template?.category) || "UTILITY",
    language: cleanString(template?.language) || "pt_BR",
    components: Array.isArray(template?.components) ? template.components : [],
    qualityScore: cleanString(typeof quality === "object" ? quality?.score : quality) || null,
    rejectedReason: cleanString(template?.rejected_reason) || null,
  };
}

async function listWppTemplates() {
  const { settings, doc } = await loadWppSettings();
  requireWppCredentials(settings);
  try {
    const fields = "id,name,status,category,language,components,quality_score,rejected_reason";
    let nextUrl = `${settings.wabaId}/message_templates?limit=100&fields=${encodeURIComponent(fields)}`;
    const templates = [];
    for (let page = 0; nextUrl && page < 10; page += 1) {
      const response = await wppGraphRequest(settings, nextUrl);
      templates.push(...(Array.isArray(response?.data) ? response.data.map(normalizeWppTemplate) : []));
      nextUrl = cleanString(response?.paging?.next);
    }
    return templates.sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    const next = { ...settings, connectionStatus: "error", lastTestAt: nowIso(), lastError: cleanString(err?.message).slice(0, 1024) };
    await persistWppSettings(next, doc).catch(() => null);
    throw err;
  }
}

function wppTemplateComponents(input) {
  const headerText = cleanString(input?.headerText).slice(0, 60);
  const bodyText = cleanString(input?.bodyText).slice(0, 1024);
  const footerText = cleanString(input?.footerText).slice(0, 60);
  if (!bodyText) throw Object.assign(new Error("Informe o conteúdo da mensagem."), { status: 400 });
  const components = [];
  if (headerText) {
    const header = { type: "HEADER", format: "TEXT", text: headerText };
    const headerVars = [...headerText.matchAll(/\{\{(\d+)\}\}/g)];
    if (headerVars.length) header.example = { header_text: headerVars.map((_, index) => `Exemplo ${index + 1}`) };
    components.push(header);
  }
  const body = { type: "BODY", text: bodyText };
  const indexes = [...bodyText.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
  const count = indexes.length ? Math.max(...indexes) : 0;
  if (count) body.example = { body_text: [Array.from({ length: count }, (_, index) => `Exemplo ${index + 1}`)] };
  components.push(body);
  if (footerText) components.push({ type: "FOOTER", text: footerText });
  const buttons = Array.isArray(input?.buttons) ? input.buttons.filter((button) => button && typeof button === "object").slice(0, 10) : [];
  if (buttons.length) components.push({ type: "BUTTONS", buttons });
  return components;
}

function sanitizeWppTemplateInput(input) {
  const name = cleanString(input?.name).toLowerCase();
  if (!/^[a-z0-9_]+$/.test(name)) throw Object.assign(new Error("Nome de template inválido."), { status: 400 });
  const category = ["MARKETING", "UTILITY", "AUTHENTICATION"].includes(input?.category) ? input.category : "UTILITY";
  const language = cleanString(input?.language) || "pt_BR";
  return { id: cleanString(input?.id), name, category, language, components: wppTemplateComponents(input) };
}

async function createWppTemplate(input) {
  const { settings } = await loadWppSettings();
  const template = sanitizeWppTemplateInput(input);
  const response = await wppGraphRequest(settings, `${settings.wabaId}/message_templates`, {
    method: "POST",
    body: { name: template.name, language: template.language, category: template.category, components: template.components },
  });
  return normalizeWppTemplate({ ...template, ...response, id: response?.id || template.id, status: response?.status || "PENDING" });
}

async function updateWppTemplate(input) {
  const { settings } = await loadWppSettings();
  const template = sanitizeWppTemplateInput(input);
  if (!template.id) throw Object.assign(new Error("Identificador do template não informado."), { status: 400 });
  const response = await wppGraphRequest(settings, template.id, {
    method: "POST",
    body: { category: template.category, components: template.components },
  });
  return normalizeWppTemplate({ ...template, ...response, id: template.id, status: response?.status || "PENDING" });
}

async function deleteWppTemplate(name) {
  const { settings } = await loadWppSettings();
  const cleanName = cleanString(name);
  if (!cleanName) throw Object.assign(new Error("Template não informado."), { status: 400 });
  return wppGraphRequest(settings, `${settings.wabaId}/message_templates?name=${encodeURIComponent(cleanName)}`, { method: "DELETE" });
}

async function sendWppTemplateTest(input) {
  const { settings } = await loadWppSettings();
  const to = cleanString(input?.to).replace(/\D/g, "");
  const name = cleanString(input?.templateName);
  const language = cleanString(input?.language) || "pt_BR";
  if (!name || to.length < 10) throw Object.assign(new Error("Informe o template e um telefone válido com DDI."), { status: 400 });
  const headerParameters = (Array.isArray(input?.headerParameters) ? input.headerParameters : []).map((value) => ({ type: "text", text: cleanString(value) }));
  const parameters = (Array.isArray(input?.bodyParameters) ? input.bodyParameters : []).map((value) => ({ type: "text", text: cleanString(value) }));
  const template = { name, language: { code: language } };
  const components = [];
  if (headerParameters.length) components.push({ type: "header", parameters: headerParameters });
  if (parameters.length) components.push({ type: "body", parameters });
  if (components.length) template.components = components;
  const response = await wppGraphRequest(settings, `${settings.phoneNumberId}/messages`, {
    method: "POST",
    body: { messaging_product: "whatsapp", recipient_type: "individual", to, type: "template", template },
  });
  return cleanString(response?.messages?.[0]?.id) || null;
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

function defaultOnboardingConfig() {
  return { enabled: false, showInStudentMenu: false };
}

function publicOnboardingConfig(settings, updatedAt) {
  return {
    enabled: Boolean(settings?.enabled),
    showInStudentMenu: Boolean(settings?.showInStudentMenu),
    updatedAt: updatedAt || null,
  };
}

function sanitizeOnboardingConfigInput(input) {
  const raw = input && typeof input === "object" ? input : {};
  return { enabled: Boolean(raw.enabled), showInStudentMenu: Boolean(raw.showInStudentMenu) };
}

async function loadOnboardingConfig() {
  const doc = await getSettingDoc(ONBOARDING_SETTINGS_KEY);
  if (!doc) {
    const defaults = defaultOnboardingConfig();
    return { settings: defaults, publicSettings: publicOnboardingConfig(defaults, null), doc: null };
  }
  const settings = parseJsonObject(doc.settings_json, defaultOnboardingConfig());
  return {
    settings,
    publicSettings: publicOnboardingConfig(settings, doc.$updatedAt || null),
    doc,
  };
}

async function saveOnboardingConfig(input) {
  if (!PLATFORM_SETTINGS_COLLECTION_ID) {
    throw Object.assign(new Error("Colecao de configuracoes da plataforma nao configurada."), { status: 500 });
  }
  const settings = sanitizeOnboardingConfigInput(input);
  const data = { key: ONBOARDING_SETTINGS_KEY, settings_json: JSON.stringify(settings) };
  const current = await loadOnboardingConfig();
  const doc = current.doc
    ? await databases.updateDocument(DATABASE_ID, PLATFORM_SETTINGS_COLLECTION_ID, current.doc.$id, data)
    : await databases.createDocument(
        DATABASE_ID,
        PLATFORM_SETTINGS_COLLECTION_ID,
        sdk.ID.unique(),
        data,
        ADMIN_DOC_PERMS,
      );
  return publicOnboardingConfig(settings, doc.$updatedAt || null);
}

function emptyRichDoc() {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

function legacyPlainTextToRichDoc(text) {
  const trimmed = cleanString(text);
  if (!trimmed) return emptyRichDoc();
  const blocks = trimmed.split(/\n\s*\n/).filter(Boolean);
  return {
    type: "doc",
    content: blocks.length
      ? blocks.map((block) => ({
          type: "paragraph",
          content: [{ type: "text", text: block.replace(/\n/g, " ") }],
        }))
      : [{ type: "paragraph" }],
  };
}

function sanitizeRulesJson(raw, legacyRules) {
  if (raw && typeof raw === "object" && raw.type === "doc") return raw;
  return legacyPlainTextToRichDoc(legacyRules);
}

function defaultReferralProgramConfig() {
  return { active: false, prize: "", requiredHours: 10, rulesJson: emptyRichDoc(), rulesHtml: "" };
}

function defaultReferAndEarnConfig() {
  return {
    aluno: defaultReferralProgramConfig(),
    instrutor: defaultReferralProgramConfig(),
  };
}

function sanitizeReferralProgramInput(raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  const requiredHours = Number(input.requiredHours);
  const legacyRules = cleanString(input.rules);
  return {
    active: Boolean(input.active),
    prize: cleanString(input.prize),
    requiredHours: Number.isFinite(requiredHours) && requiredHours > 0 ? requiredHours : 10,
    rulesJson: sanitizeRulesJson(input.rulesJson, legacyRules),
    rulesHtml: cleanString(input.rulesHtml),
  };
}

function sanitizeReferAndEarnConfigInput(input) {
  const raw = input && typeof input === "object" ? input : {};
  return {
    aluno: sanitizeReferralProgramInput(raw.aluno),
    instrutor: sanitizeReferralProgramInput(raw.instrutor),
  };
}

function publicReferAndEarnConfig(settings, updatedAt) {
  const safe = settings && typeof settings === "object" ? settings : defaultReferAndEarnConfig();
  return {
    aluno: sanitizeReferralProgramInput(safe.aluno),
    instrutor: sanitizeReferralProgramInput(safe.instrutor),
    updatedAt: updatedAt || null,
  };
}

async function loadReferAndEarnConfig() {
  const doc = await getSettingDoc(REFER_AND_EARN_SETTINGS_KEY);
  if (!doc) {
    const defaults = defaultReferAndEarnConfig();
    return { settings: defaults, publicSettings: publicReferAndEarnConfig(defaults, null), doc: null };
  }
  const settings = parseJsonObject(doc.settings_json, defaultReferAndEarnConfig());
  return {
    settings,
    publicSettings: publicReferAndEarnConfig(settings, doc.$updatedAt || null),
    doc,
  };
}

async function saveReferAndEarnConfig(input) {
  if (!PLATFORM_SETTINGS_COLLECTION_ID) {
    throw Object.assign(new Error("Colecao de configuracoes da plataforma nao configurada."), { status: 500 });
  }
  const settings = sanitizeReferAndEarnConfigInput(input);
  const data = { key: REFER_AND_EARN_SETTINGS_KEY, settings_json: JSON.stringify(settings) };
  const current = await loadReferAndEarnConfig();
  const doc = current.doc
    ? await databases.updateDocument(DATABASE_ID, PLATFORM_SETTINGS_COLLECTION_ID, current.doc.$id, data)
    : await databases.createDocument(
        DATABASE_ID,
        PLATFORM_SETTINGS_COLLECTION_ID,
        sdk.ID.unique(),
        data,
        ADMIN_DOC_PERMS,
      );
  return publicReferAndEarnConfig(settings, doc.$updatedAt || null);
}

function referrerFirstName(fullName) {
  const trimmed = cleanString(fullName);
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0] || trimmed;
}

async function isValidReferrerUserId(userId) {
  const safeUserId = cleanString(userId);
  if (!safeUserId) return false;
  const profile = await getProfileByUserId(safeUserId);
  if (!profile) return false;
  const role = normalizeRole(profile.role);
  return role === "aluno" || role === "instrutor";
}

async function getReferralWelcomeInfo(userId) {
  const { publicSettings: brand } = await loadEmailBrandSettings();
  const schoolName = cleanString(brand?.schoolName) || "Escola";
  const safeUserId = cleanString(userId);
  if (!safeUserId || !(await isValidReferrerUserId(safeUserId))) {
    return { valid: false, referrerFirstName: null, referrerNickname: null, schoolName };
  }
  const profile = await getProfileByUserId(safeUserId);
  const firstName = referrerFirstName(profile?.full_name);
  const nickname = cleanString(profile?.nickname) || null;
  return {
    valid: Boolean(nickname || firstName),
    referrerFirstName: firstName || null,
    referrerNickname: nickname,
    schoolName,
  };
}

function flightHoursFromDoc(doc) {
  if (isScheduledFlightStatusValue(doc?.flight_status)) return 0;
  if (typeof doc?.block_time_minutes === "number" && doc.block_time_minutes > 0) {
    return doc.block_time_minutes / 60;
  }
  if (typeof doc?.total_flight_minutes === "number" && doc.total_flight_minutes > 0) {
    return doc.total_flight_minutes / 60;
  }
  if (typeof doc?.duration_sec === "number" && doc.duration_sec > 0) {
    return doc.duration_sec / 3600;
  }
  return 0;
}

function roundReferralHours(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

async function listCrmLeadsByReferrer(referrerUserId) {
  if (!CRM_LEADS_COLLECTION_ID || !referrerUserId) return [];
  return listAllDocuments(CRM_LEADS_COLLECTION_ID, [
    sdk.Query.equal("referrer_user_id", [referrerUserId]),
    sdk.Query.orderDesc("qual_filled_at"),
    sdk.Query.limit(200),
  ]);
}

async function getMyReferrals(actorUserId) {
  if (!actorUserId) throw Object.assign(new Error("Unauthorized request."), { status: 401 });
  const role = await getActorRole(actorUserId);
  const program = role === "instrutor" ? "instrutor" : "aluno";
  const { publicSettings } = await loadReferAndEarnConfig();
  const programConfig = program === "instrutor" ? publicSettings.instrutor : publicSettings.aluno;
  const leads = await listCrmLeadsByReferrer(actorUserId);
  const studentUserIds = [...new Set(leads.map((lead) => cleanString(lead.user_id)).filter(Boolean))];
  const flights = studentUserIds.length ? await getFlightsByUserIds(studentUserIds) : [];
  const hoursByStudent = new Map();
  for (const flight of flights) {
    const studentId = cleanString(flight.student_user_id);
    if (!studentId) continue;
    const hours = flightHoursFromDoc(flight);
    if (hours <= 0) continue;
    hoursByStudent.set(studentId, roundReferralHours((hoursByStudent.get(studentId) || 0) + hours));
  }
  const requiredHours = programConfig.requiredHours || 10;
  const referrals = leads.map((lead) => {
    const userId = cleanString(lead.user_id) || null;
    const flownHours = userId ? hoursByStudent.get(userId) || 0 : 0;
    const progressPct = requiredHours > 0 ? Math.min(100, Math.round((flownHours / requiredHours) * 100)) : 0;
    return {
      id: lead.$id,
      name: cleanString(lead.name),
      email: cleanString(lead.email),
      crmStatus: cleanString(lead.crm_status) || "novo_lead",
      userId,
      flownHours,
      requiredHours,
      progressPct,
      qualifiedAt: cleanString(lead.qual_filled_at) || null,
    };
  });
  return { program, programConfig, referrals };
}

function parseStoredRichJsonField(value) {
  if (value && typeof value === "object" && value.type === "doc") return value;
  if (typeof value === "string" && value.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && parsed.type === "doc") return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

function mapOnboardingStepDoc(doc) {
  const plainDescription = cleanString(doc.description);
  const descriptionJson =
    parseStoredRichJsonField(doc.description_json) ||
    (plainDescription ? legacyPlainTextToRichDoc(plainDescription) : emptyRichDoc());
  const rawLayout = cleanString(doc.layout);
  const layout = ["hero", "split", "text-only", "video-focus", "list"].includes(rawLayout) ? rawLayout : "hero";
  const rawPos = cleanString(doc.media_position);
  const mediaPosition = ["left", "right", "top", "bottom"].includes(rawPos) ? rawPos : "right";
  return {
    id: doc.$id,
    title: cleanString(doc.title),
    subtitle: cleanString(doc.subtitle) || null,
    description: plainDescription || "",
    descriptionJson,
    descriptionHtml: cleanString(doc.description_html),
    imageFileId: cleanString(doc.image_file_id) || null,
    videoUrl: cleanString(doc.video_url) || null,
    layout,
    mediaPosition,
    sortOrder: Number(doc.sort_order) || 0,
    updatedAt: doc.$updatedAt || null,
  };
}

async function listOnboardingSteps() {
  if (!ONBOARDING_STEPS_COLLECTION_ID) return [];
  const res = await databases.listDocuments(DATABASE_ID, ONBOARDING_STEPS_COLLECTION_ID, [
    sdk.Query.equal("school_id", [SCHOOL_ID]),
    sdk.Query.orderAsc("sort_order"),
    sdk.Query.limit(100),
  ]);
  return (res.documents || []).map(mapOnboardingStepDoc);
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

function formatMoneyLabel(amount, currency) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return "";
  const code = /^[A-Z]{3}$/.test(cleanString(currency).toUpperCase()) ? cleanString(currency).toUpperCase() : "BRL";
  try {
    return value.toLocaleString("pt-BR", { style: "currency", currency: code });
  } catch {
    return `${code} ${value.toFixed(2)}`;
  }
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
  if (type === "crm.lead_qualified") {
    const name = cleanString(data.name) || "Novo lead";
    const email = cleanString(data.email) || "";
    const course = cleanString(data.course);
    const transferSchool = cleanString(data.transferSchool);
    return {
      eyebrow: "CRM — Novo lead",
      title: "Qualificação recebida",
      intro: `Um novo lead preencheu o formulário de qualificação.`,
      body: `${name}${email ? ` (${email})` : ""} preencheu o formulário de qualificação${course ? ` para o curso de ${course}` : ""}${transferSchool ? ` — vindo de transferência de ${transferSchool}` : ""}.`,
      details: [
        ["Nome", name],
        ...(email ? [["E-mail", email]] : []),
        ...(course ? [["Curso desejado", course]] : []),
        ...(transferSchool ? [["Transferência de", transferSchool]] : []),
      ],
      ctaLabel: "Abrir CRM",
      url,
    };
  }
  if (type === "cakto.sale_approved") {
    const name = cleanString(data.customerName) || "Cliente";
    const email = cleanString(data.customerEmail);
    const amountLabel = formatMoneyLabel(data.amount, data.currency);
    const paymentMethod = cleanString(data.paymentMethod);
    const installments = Number(data.paymentInstallments) || 0;
    const paymentLabel = paymentMethod
      ? `${paymentMethod}${installments > 1 ? ` (${installments}x)` : ""}`
      : "";
    const productLabel = cleanString(data.productLabel);
    const orderId = cleanString(data.orderId);
    return {
      eyebrow: "Vendas — Cakto",
      title: "Nova venda aprovada",
      intro: "Uma nova venda foi aprovada na Cakto.",
      body: `${name}${email ? ` (${email})` : ""} realizou uma compra${productLabel ? ` de ${productLabel}` : ""}${amountLabel ? ` no valor de ${amountLabel}` : ""}${paymentLabel ? ` via ${paymentLabel}` : ""}.`,
      details: [
        ["Cliente", name],
        ...(email ? [["E-mail", email]] : []),
        ...(productLabel ? [["Produto", productLabel]] : []),
        ...(amountLabel ? [["Valor", amountLabel]] : []),
        ...(paymentLabel ? [["Pagamento", paymentLabel]] : []),
        ...(orderId ? [["Pedido", orderId]] : []),
      ],
      ctaLabel: "Ver vendas",
      url,
    };
  }
  if (type === "crm.lead_registered") {
    const name = cleanString(data.name) || "Novo lead";
    const email = cleanString(data.email) || "";
    return {
      eyebrow: "CRM — Novo lead",
      title: "Lead registrado",
      intro: `Um novo lead foi registrado no CRM.`,
      body: `${name}${email ? ` (${email})` : ""} foi adicionado ao CRM.`,
      details: [
        ["Nome", name],
        ...(email ? [["E-mail", email]] : []),
      ],
      ctaLabel: "Abrir CRM",
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

async function listAdminUserIds() {
  try {
    const res = await users.list({
      queries: [sdk.Query.limit(100), sdk.Query.contains("labels", ["admin"])],
      total: true,
    });
    return (res.users || []).map((u) => cleanString(u.$id)).filter(Boolean);
  } catch {
    return [];
  }
}

async function notifyCrmLeadEventToAdmins(eventType, leadData) {
  const safeData = leadData && typeof leadData === "object" ? leadData : {};
  const [{ settings }, { publicSettings: brand }] = await Promise.all([
    loadEmailSettings(),
    loadEmailBrandSettings(),
  ]);
  const adminIds = await listAdminUserIds();
  if (adminIds.length === 0) return;
  const message = buildNotificationMessage({ eventType, data: safeData }, null);
  for (const adminId of adminIds) {
    try {
      const user = await users.get({ userId: adminId });
      if (settings.enabled && user?.email) {
        await sendEmailToUser(settings, brand, user, message);
      }
      await sendPushToUser(adminId, message);
    } catch {
      // skip user on failure
    }
  }
}

async function loadCaktoWebhookToken() {
  // O settings doc "cakto" é a fonte da verdade (setup-cakto.mjs mantém o token
  // do webhook sincronizado nele); a env pode ficar obsoleta após rotação.
  const doc = await getSettingDoc("cakto");
  const settings = parseJsonObject(doc?.settings_json, {});
  try {
    const fromSettings = cleanString(new URL(cleanString(settings.webhookUrl)).searchParams.get("token"));
    if (fromSettings) return fromSettings;
  } catch {
    // Sem webhookUrl válida — tenta a env abaixo.
  }
  return cleanString(process.env.CAKTO_WEBHOOK_TOKEN);
}

function timingSafeEqualString(left, right) {
  const a = Buffer.from(cleanString(left));
  const b = Buffer.from(cleanString(right));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

async function notifyCaktoSaleToAdmins(sale) {
  const safeSale = sale && typeof sale === "object" ? sale : {};
  const receiptId = cleanString(safeSale.receiptId);
  const dedupeKey = `cakto.sale_approved:${receiptId || sha256Hex(JSON.stringify(safeSale))}`;
  const adminIds = await listAdminUserIds();
  if (adminIds.length === 0) return [];
  return dispatchNotificationEvent("system", {
    eventType: "cakto.sale_approved",
    dedupeKey,
    recipientUserIds: adminIds,
    data: safeSale,
  });
}

/** E-mail (e push) aos admins quando o ALUNO solicita/altera/cancela um voo pela plataforma. */
async function notifyStudentScheduleEventToAdmins(kind, data) {
  const safe = data && typeof data === "object" ? data : {};
  const toBr = (iso) => {
    const match = cleanString(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : cleanString(iso);
  };
  const toHHMM = (minutes) => {
    const value = Number(minutes);
    if (!Number.isFinite(value) || value <= 0) return "";
    return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(Math.round(value) % 60).padStart(2, "0")}`;
  };
  const student = cleanString(safe.studentName) || "Aluno";
  const aircraft = cleanString(safe.aircraft) || "aeronave a definir";
  const when = [toBr(safe.flightDate), cleanString(safe.startTime)].filter(Boolean).join(" às ") || "data a definir";
  const duration = toHHMM(safe.durationMinutes);
  const notes = cleanString(safe.notes);
  const reason = cleanString(safe.reason);
  const penaltyHours = Number(safe.penaltyHours);
  const baseDetails = [
    ["Aluno", student],
    ["Aeronave", aircraft],
    ["Data e horário (acionamento)", when],
    duration ? ["Tempo de voo", duration] : null,
  ];

  let message;
  if (kind === "requested") {
    message = {
      eyebrow: "Escala",
      title: "Nova solicitação de voo",
      intro: "Um aluno solicitou um voo pela plataforma.",
      body: `${student} solicitou um voo em ${aircraft} para ${when}. A solicitação está pendente de confirmação da escola.`,
      details: [...baseDetails, notes ? ["Observações", notes] : null].filter(Boolean),
      ctaLabel: "Abrir escala",
      url: APP_URL,
    };
  } else if (kind === "rescheduled") {
    const previousWhen = [toBr(safe.previousFlightDate), cleanString(safe.previousStartTime)].filter(Boolean).join(" às ");
    const previousAircraft = cleanString(safe.previousAircraft);
    message = {
      eyebrow: "Escala",
      title: "Voo alterado pelo aluno",
      intro: "Um aluno alterou um voo agendado pela plataforma.",
      body: `${student} alterou o voo em ${previousAircraft || aircraft} de ${previousWhen || "?"} para ${when} (${aircraft}).${safe.statusReverted ? " O voo voltou para Pendente e precisa ser reconfirmado." : ""}`,
      details: [
        ...baseDetails,
        previousWhen ? ["Horário anterior", `${previousWhen}${previousAircraft && previousAircraft !== aircraft ? ` (${previousAircraft})` : ""}`] : null,
        safe.statusReverted ? ["Status", "Voltou para Pendente — reconfirmar"] : null,
      ].filter(Boolean),
      ctaLabel: "Abrir escala",
      url: APP_URL,
    };
  } else {
    message = {
      eyebrow: "Escala",
      title: "Voo cancelado pelo aluno",
      intro: "Um aluno cancelou um voo pela plataforma.",
      body: `${student} cancelou o voo em ${aircraft} de ${when}.`,
      details: [
        ...baseDetails,
        reason ? ["Motivo", reason] : null,
        Number.isFinite(penaltyHours) && penaltyHours > 0 ? ["Multa debitada", toHHMM(penaltyHours * 60) || `${penaltyHours}h`] : null,
      ].filter(Boolean),
      ctaLabel: "Abrir escala",
      url: APP_URL,
    };
  }

  const [{ settings }, { publicSettings: brand }] = await Promise.all([
    loadEmailSettings(),
    loadEmailBrandSettings(),
  ]);
  const adminIds = await listAdminUserIds();
  for (const adminId of adminIds) {
    try {
      const user = await users.get({ userId: adminId });
      if (settings.enabled && user?.email) {
        await sendEmailToUser(settings, brand, user, message);
      }
      await sendPushToUser(adminId, message);
    } catch {
      // skip user on failure
    }
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

async function googleOAuthAccessToken(refreshToken) {
  if (!GOOGLE_CALENDAR_OAUTH_CLIENT_ID || !GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET) {
    throw Object.assign(new Error("OAuth Client ID/Secret nao configurado na funcao Appwrite."), { status: 500 });
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CALENDAR_OAUTH_CLIENT_ID,
      client_secret: GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Falha ao renovar token OAuth Google.");
  }
  return data.access_token;
}

async function googleAccessToken(settings, impersonateEmail) {
  const refreshToken = settings && cleanString(settings.oauthRefreshToken);
  if (refreshToken) {
    return googleOAuthAccessToken(refreshToken);
  }
  // Fallback: service account JWT
  const serviceAccount = googleServiceAccountCredentials();
  if (!serviceAccount.clientEmail || !serviceAccount.privateKey) {
    throw Object.assign(new Error("Service account do Google Calendar nao configurado na funcao Appwrite."), { status: 500 });
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = {
    iss: serviceAccount.clientEmail,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  if (impersonateEmail) payload.sub = impersonateEmail;
  const claims = base64UrlEncode(JSON.stringify(payload));
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

async function googleCalendarRequest(settings, path, options = {}, impersonateEmail) {
  const accessToken = await googleAccessToken(settings, impersonateEmail);
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

function googleFlightEventBody(ctx, rules, includeAttendees) {
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
  const attendees = [];
  if (includeAttendees) {
    const studentEmail = cleanString(studentUser?.email);
    const instructorEmail = cleanString(instructorUser?.email);
    if (studentEmail) attendees.push({ email: studentEmail, displayName: studentName });
    if (instructorEmail) attendees.push({ email: instructorEmail, displayName: instructorName });
  }
  return {
    summary: `Voo - ${aircraft} - ${studentName}`,
    description,
    start: { dateTime: startDateTime, timeZone: "America/Sao_Paulo" },
    end: { dateTime: endDateTime, timeZone: "America/Sao_Paulo" },
    reminders: { useDefault: true },
    ...(attendees.length > 0 ? { attendees } : {}),
  };
}

async function getGoogleCalendarOAuthUrl(payload) {
  if (!GOOGLE_CALENDAR_OAUTH_CLIENT_ID) {
    throw Object.assign(new Error("GOOGLE_CALENDAR_OAUTH_CLIENT_ID nao configurado na funcao Appwrite."), { status: 500 });
  }
  const redirectUri = cleanString(payload.redirectUri);
  if (!redirectUri) throw Object.assign(new Error("redirectUri obrigatorio."), { status: 400 });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", GOOGLE_CALENDAR_OAUTH_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

async function exchangeGoogleCalendarOAuthCode(payload) {
  if (!GOOGLE_CALENDAR_OAUTH_CLIENT_ID || !GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET) {
    throw Object.assign(new Error("OAuth Client ID/Secret nao configurado na funcao Appwrite."), { status: 500 });
  }
  const code = cleanString(payload.code);
  const redirectUri = cleanString(payload.redirectUri);
  if (!code) throw Object.assign(new Error("Codigo de autorizacao nao informado."), { status: 400 });

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CALENDAR_OAUTH_CLIENT_ID,
      client_secret: GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const tokenData = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenData.refresh_token) {
    throw new Error(tokenData.error_description || tokenData.error || "Falha ao trocar codigo por token. Tente autorizar novamente.");
  }

  const infoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { authorization: `Bearer ${tokenData.access_token}` },
  });
  const infoData = await infoRes.json().catch(() => ({}));
  const oauthEmail = cleanString(infoData.email) || null;

  const { settings } = await loadGoogleCalendarSettings();
  const updated = { ...settings, oauthRefreshToken: tokenData.refresh_token, oauthEmail };
  const doc = await (async () => {
    const existing = await databases.listDocuments(DATABASE_ID, PLATFORM_SETTINGS_COLLECTION_ID, [sdk.Query.equal("key", GOOGLE_CALENDAR_SETTINGS_KEY)]);
    const data = { key: GOOGLE_CALENDAR_SETTINGS_KEY, settings_json: JSON.stringify(updated) };
    if (existing.total > 0) {
      return databases.updateDocument(DATABASE_ID, PLATFORM_SETTINGS_COLLECTION_ID, existing.documents[0].$id, data);
    }
    return databases.createDocument(DATABASE_ID, PLATFORM_SETTINGS_COLLECTION_ID, sdk.ID.unique(), data, ADMIN_DOC_PERMS);
  })();
  return publicGoogleCalendarSettings(updated, doc.$updatedAt || null);
}

async function disconnectGoogleCalendarOAuth() {
  const { settings } = await loadGoogleCalendarSettings();
  const updated = { ...settings, oauthRefreshToken: null, oauthEmail: null };
  const doc = await (async () => {
    const existing = await databases.listDocuments(DATABASE_ID, PLATFORM_SETTINGS_COLLECTION_ID, [sdk.Query.equal("key", GOOGLE_CALENDAR_SETTINGS_KEY)]);
    const data = { key: GOOGLE_CALENDAR_SETTINGS_KEY, settings_json: JSON.stringify(updated) };
    if (existing.total > 0) {
      return databases.updateDocument(DATABASE_ID, PLATFORM_SETTINGS_COLLECTION_ID, existing.documents[0].$id, data);
    }
    return databases.createDocument(DATABASE_ID, PLATFORM_SETTINGS_COLLECTION_ID, sdk.ID.unique(), data, ADMIN_DOC_PERMS);
  })();
  return publicGoogleCalendarSettings(updated, doc.$updatedAt || null);
}

async function syncFlightCalendarEvent(actorUserId, payload = {}) {
  const flightId = cleanString(payload.flightId);
  const mode = cleanString(payload.mode) || "upsert";
  if (!flightId) throw Object.assign(new Error("Voo nao informado."), { status: 400 });
  if (!FLIGHTS_COLLECTION_ID) throw Object.assign(new Error("Colecao de voos nao configurada."), { status: 500 });

  const { settings, publicSettings } = await loadGoogleCalendarSettings();
  if (!googleCalendarConfigured(settings)) return publicSettings;

  const allCalendars = sanitizeAircraftCalendars(settings.aircraftCalendars);
  const delegatedEmail = cleanString(settings.delegatedEmail) || null;
  const useOAuth = Boolean(cleanString(settings.oauthRefreshToken));
  const sendUpdates = useOAuth ? "all" : "none";

  try {
    const ctx = await getFlightCalendarContext(flightId);
    const aircraftIdent = normalizeAircraftIdent(ctx.flight.aircraft_ident);
    const storedAircraftIdent = normalizeAircraftIdent(ctx.flight.google_calendar_aircraft_ident);
    const eventId = cleanString(ctx.flight.google_calendar_event_id);

    if (mode === "cancel") {
      const calendarForDelete = storedAircraftIdent
        ? allCalendars.find((r) => r.aircraftIdent === storedAircraftIdent)
        : allCalendars.find((r) => r.aircraftIdent === aircraftIdent);
      if (eventId && calendarForDelete) {
        const cancelCalendarId = encodeURIComponent(calendarForDelete.calendarId);
        await googleCalendarRequest(settings, `/calendars/${cancelCalendarId}/events/${encodeURIComponent(eventId)}?sendUpdates=${sendUpdates}`, {
          method: "DELETE",
        }, delegatedEmail).catch((err) => {
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

    // --- UPSERT ---
    const aircraftCalendar = allCalendars.find((r) => r.aircraftIdent === aircraftIdent);
    if (!aircraftCalendar) {
      throw Object.assign(new Error(`Calendar ID nao configurado para a aeronave ${aircraftIdent || "do voo"}.`), { status: 422 });
    }
    const calendarId = encodeURIComponent(aircraftCalendar.calendarId);

    // Detect aircraft change: delete old event from old calendar before creating in new one
    let currentEventId = eventId;
    if (eventId && storedAircraftIdent && storedAircraftIdent !== aircraftIdent) {
      const oldCalendar = allCalendars.find((r) => r.aircraftIdent === storedAircraftIdent);
      if (oldCalendar) {
        const oldCalendarId = encodeURIComponent(oldCalendar.calendarId);
        await googleCalendarRequest(settings, `/calendars/${oldCalendarId}/events/${encodeURIComponent(eventId)}?sendUpdates=${sendUpdates}`, {
          method: "DELETE",
        }, delegatedEmail).catch((err) => {
          if (!String(err?.message || "").includes("Not Found")) throw err;
        });
      }
      currentEventId = null; // force POST to new calendar
    }

    const { publicSettings: rules } = await loadSchoolRules();
    const body = googleFlightEventBody(ctx, rules, useOAuth);
    const event = currentEventId
      ? await googleCalendarRequest(settings, `/calendars/${calendarId}/events/${encodeURIComponent(currentEventId)}?sendUpdates=${sendUpdates}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        }, delegatedEmail)
      : await googleCalendarRequest(settings, `/calendars/${calendarId}/events?sendUpdates=${sendUpdates}`, {
          method: "POST",
          body: JSON.stringify(body),
        }, delegatedEmail);
    await safeUpdateFlightCalendarFields(flightId, {
      google_calendar_event_id: event?.id || currentEventId || null,
      google_calendar_aircraft_ident: aircraftIdent || null,
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

function sagaScheduleLogEntry(patch) {
  return {
    at: nowIso(),
    ...patch,
  };
}

function truncateSagaScheduleLog(logs) {
  return JSON.stringify((Array.isArray(logs) ? logs : []).slice(-8)).slice(0, 4096);
}

async function safeUpdateFlightSagaScheduleFields(flightId, fields) {
  if (!FLIGHTS_COLLECTION_ID || !flightId) return;
  try {
    await databases.updateDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, flightId, fields);
  } catch (err) {
    const message = String(err?.message || err).toLowerCase();
    if (!message.includes("attribute") && !message.includes("invalid document structure")) throw err;
    const fallback = { ...fields };
    delete fallback.saga_schedule_error;
    delete fallback.saga_schedule_log_json;
    if (Object.keys(fallback).length === Object.keys(fields).length || Object.keys(fallback).length === 0) return;
    await databases.updateDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, flightId, fallback);
  }
}

function sagaScheduleDateTimes(flight) {
  const date = cleanString(flight.flight_date);
  const start = cleanString(flight.start_time).slice(0, 5);
  const durationSec = Number(flight.duration_sec || 0);
  const [hh, mm] = start.split(":").map(Number);
  if (!date || !Number.isFinite(hh) || !Number.isFinite(mm)) {
    throw Object.assign(new Error("Voo sem data ou horario valido para enviar ao SAGA."), { status: 422 });
  }
  const safeDurationMinutes = Math.max(30, Math.round((Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 3600) / 60));
  const endBase = new Date(`${date}T12:00:00`);
  const totalEndMinutes = hh * 60 + mm + safeDurationMinutes;
  endBase.setDate(endBase.getDate() + Math.floor(totalEndMinutes / 1440));
  const endMinutesInDay = ((totalEndMinutes % 1440) + 1440) % 1440;
  const endDate = endBase.toISOString().slice(0, 10);
  const endTime = `${String(Math.floor(endMinutesInDay / 60)).padStart(2, "0")}:${String(endMinutesInDay % 60).padStart(2, "0")}`;
  return {
    startAt: `${date}T${start}`,
    endAt: `${endDate}T${endTime}`,
  };
}

function sagaScheduleRequestHeaders(cookieJar) {
  const token = cleanString(cookieJar?.get("XSRF-TOKEN"));
  return {
    accept: "application/json,*/*",
    "content-type": "application/json",
    origin: SAGA_BASE_URL,
    referer: `${SAGA_BASE_URL}/schedules/management`,
    ...(token ? { "x-xsrf-token": decodeURIComponent(token) } : {}),
  };
}

async function sagaScheduleRequest(path, options, cookieJar) {
  const result = await sagaFetch(
    path,
    {
      ...options,
      headers: {
        ...sagaScheduleRequestHeaders(cookieJar),
        ...(options.headers || {}),
      },
    },
    cookieJar,
  );
  let data = null;
  try {
    data = result.html ? JSON.parse(result.html) : null;
  } catch {
    data = { raw: sagaHtmlSnippet(result.html, 1000) };
  }
  if (!result.response.ok) {
    const message = data?.message || `SAGA retornou HTTP ${result.response.status}.`;
    throw Object.assign(new Error(message), {
      status: result.response.status,
      sagaResponse: data,
      endpoint: `${SAGA_BASE_URL}${path}`,
    });
  }
  return { httpStatus: result.response.status, data, endpoint: `${SAGA_BASE_URL}${path}` };
}

function publicCaktoSettings(settings, updatedAt = null) {
  return {
    clientId: cleanString(settings.clientId),
    productId: cleanString(settings.productId),
    secretConfigured: Boolean(cleanString(settings.clientSecret)),
    webhookUrl: cleanString(settings.webhookUrl),
    updatedAt,
  };
}

function defaultFlightCreditSalesConfig() {
  return {
    studentPurchasesEnabled: false,
    nightHoursDifferentFromDay: true,
    weekdayDiscountPct: null,
    packages: [],
  };
}

function parseWeekdayDiscountPct(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 100) return null;
  return Number(parsed.toFixed(2));
}

function publicFlightCreditSalesConfig(settings, updatedAt = null, activeOnly = false) {
  const source = settings && typeof settings === "object" ? settings : defaultFlightCreditSalesConfig();
  const packages = Array.isArray(source.packages) ? source.packages : [];
  return {
    studentPurchasesEnabled: Boolean(source.studentPurchasesEnabled),
    nightHoursDifferentFromDay: source.nightHoursDifferentFromDay !== false,
    weekdayDiscountPct: parseWeekdayDiscountPct(source.weekdayDiscountPct),
    packages: packages
      .filter((item) => !activeOnly || item.active === true)
      .map((item) => ({
        id: cleanString(item.id),
        hours: Number(item.hours) || 0,
        hourPrice: Number(item.hourPrice) || 0,
        validityDays: Math.max(0, Math.round(Number(item.validityDays) || 0)),
        aircraftModelId: cleanString(item.aircraftModelId),
        aircraftModelName: cleanString(item.aircraftModelName),
        active: item.active === true,
        isDefault: item.isDefault === true,
        weekdayDiscountEligible: item.weekdayDiscountEligible !== false,
        eligibility: sanitizeEligibility(item.eligibility),
      }))
      .filter((item) => item.id && item.hours > 0 && item.hourPrice > 0 && item.validityDays > 0 && item.aircraftModelId),
    updatedAt,
  };
}

async function loadFlightCreditSalesConfig() {
  const doc = await getSettingDoc(FLIGHT_CREDIT_SALES_SETTINGS_KEY);
  const settings = doc
    ? parseJsonObject(doc.settings_json, defaultFlightCreditSalesConfig())
    : defaultFlightCreditSalesConfig();
  return {
    settings,
    publicSettings: publicFlightCreditSalesConfig(settings, doc?.$updatedAt || null),
    doc,
  };
}

function sanitizeEligibility(raw) {
  if (!raw || typeof raw !== "object") return { type: "all" };
  const type = cleanString(raw.type);
  if (type === "saga_id_range") {
    const min = raw.min != null ? Number(raw.min) : null;
    const max = raw.max != null ? Number(raw.max) : null;
    return {
      type: "saga_id_range",
      min: Number.isFinite(min) ? min : null,
      max: Number.isFinite(max) ? max : null,
    };
  }
  if (type === "created_date_range") {
    const isValidDate = (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
    const from = cleanString(raw.from) || null;
    const to = cleanString(raw.to) || null;
    return {
      type: "created_date_range",
      from: isValidDate(from) ? from : null,
      to: isValidDate(to) ? to : null,
    };
  }
  return { type: "all" };
}

async function sanitizeFlightCreditPackages(rawPackages) {
  if (!Array.isArray(rawPackages)) {
    throw Object.assign(new Error("Lista de pacotes invalida."), { status: 400 });
  }
  const seenIds = new Set();
  const packages = [];
  let defaultAssigned = false;
  for (const raw of rawPackages) {
    const id = cleanString(raw?.id) || crypto.randomUUID();
    const hours = Number(raw?.hours);
    const hourPrice = Number(raw?.hourPrice);
    const validityDays = Math.round(Number(raw?.validityDays));
    const aircraftModelId = cleanString(raw?.aircraftModelId);
    if (seenIds.has(id)) throw Object.assign(new Error("Existem pacotes com identificadores duplicados."), { status: 400 });
    if (!Number.isFinite(hours) || hours <= 0) throw Object.assign(new Error("Quantidade de horas invalida."), { status: 400 });
    if (!Number.isFinite(hourPrice) || hourPrice <= 0) throw Object.assign(new Error("Valor da hora invalido."), { status: 400 });
    if (!Number.isInteger(validityDays) || validityDays <= 0) throw Object.assign(new Error("Dias para expirar invalidos."), { status: 400 });
    if (!aircraftModelId) throw Object.assign(new Error("Modelo de aviao nao informado."), { status: 400 });
    if (!AIRCRAFT_MODELS_COLLECTION_ID) {
      throw Object.assign(new Error("Colecao de modelos de aeronave nao configurada."), { status: 500 });
    }
    const model = await databases.getDocument(DATABASE_ID, AIRCRAFT_MODELS_COLLECTION_ID, aircraftModelId);
    seenIds.add(id);
    packages.push({
      id,
      hours: Number(hours.toFixed(2)),
      hourPrice: Number(hourPrice.toFixed(2)),
      validityDays,
      aircraftModelId,
      aircraftModelName: cleanString(model.name) || aircraftModelId,
      active: raw?.isDefault === true ? true : raw?.active !== false,
      isDefault: raw?.isDefault === true && !defaultAssigned,
      weekdayDiscountEligible: raw?.weekdayDiscountEligible !== false,
      eligibility: sanitizeEligibility(raw?.eligibility),
    });
    if (raw?.isDefault === true && !defaultAssigned) defaultAssigned = true;
  }
  return packages;
}

async function saveFlightCreditSalesConfig(input) {
  if (!PLATFORM_SETTINGS_COLLECTION_ID) {
    throw Object.assign(new Error("Colecao de configuracoes da plataforma nao configurada."), { status: 500 });
  }
  const current = await loadFlightCreditSalesConfig();
  const weekdayDiscountPct = parseWeekdayDiscountPct(input?.weekdayDiscountPct);
  if (input?.weekdayDiscountPct != null && input.weekdayDiscountPct !== "" && weekdayDiscountPct == null) {
    throw Object.assign(new Error("Percentual de desconto seg-sex invalido (use valor entre 0 e 100, exclusivo)."), { status: 400 });
  }
  const settings = {
    studentPurchasesEnabled: Boolean(input?.studentPurchasesEnabled),
    nightHoursDifferentFromDay: input?.nightHoursDifferentFromDay !== false,
    weekdayDiscountPct,
    packages: await sanitizeFlightCreditPackages(input?.packages),
  };
  const data = {
    key: FLIGHT_CREDIT_SALES_SETTINGS_KEY,
    settings_json: JSON.stringify(settings),
    secret_json: current.doc?.secret_json || "{}",
    updated_at: new Date().toISOString(),
  };
  const doc = current.doc
    ? await databases.updateDocument(DATABASE_ID, PLATFORM_SETTINGS_COLLECTION_ID, current.doc.$id, data)
    : await databases.createDocument(
        DATABASE_ID,
        PLATFORM_SETTINGS_COLLECTION_ID,
        sdk.ID.unique(),
        data,
        ADMIN_DOC_PERMS,
      );
  return publicFlightCreditSalesConfig(settings, doc.$updatedAt || null);
}

async function loadCaktoSettings() {
  const doc = await getSettingDoc(CAKTO_SETTINGS_KEY);
  const publicData = parseJsonObject(doc?.settings_json, {});
  const secretData = parseJsonObject(doc?.secret_json, {});
  const settings = {
    clientId: cleanString(publicData.clientId),
    productId: cleanString(publicData.productId),
    webhookUrl: cleanString(publicData.webhookUrl),
    clientSecret: cleanString(secretData.clientSecret),
  };
  return { settings, publicSettings: publicCaktoSettings(settings, doc?.$updatedAt || null), doc };
}

async function saveCaktoSettings(input) {
  if (!PLATFORM_SETTINGS_COLLECTION_ID) {
    throw Object.assign(new Error("Coleção de configurações da plataforma não configurada."), { status: 500 });
  }
  const current = await loadCaktoSettings();
  const next = {
    clientId: cleanString(input?.clientId),
    productId: cleanString(input?.productId),
    webhookUrl: current.settings.webhookUrl,
    clientSecret: cleanString(input?.clientSecret) || current.settings.clientSecret,
  };
  if (!next.clientId || !next.productId || !next.clientSecret) {
    throw Object.assign(new Error("Informe client_id, client_secret e product_id da Cakto."), { status: 400 });
  }
  const data = {
    key: CAKTO_SETTINGS_KEY,
    settings_json: JSON.stringify({ clientId: next.clientId, productId: next.productId, webhookUrl: next.webhookUrl }),
    secret_json: JSON.stringify({ clientSecret: next.clientSecret }),
    updated_at: new Date().toISOString(),
  };
  const doc = current.doc
    ? await databases.updateDocument(DATABASE_ID, PLATFORM_SETTINGS_COLLECTION_ID, current.doc.$id, data)
    : await databases.createDocument(
        DATABASE_ID,
        PLATFORM_SETTINGS_COLLECTION_ID,
        sdk.ID.unique(),
        data,
        ADMIN_DOC_PERMS,
      );
  return publicCaktoSettings(next, doc.$updatedAt || null);
}

async function getCaktoAccessToken() {
  const { settings } = await loadCaktoSettings();
  if (!settings.clientId || !settings.clientSecret) {
    throw Object.assign(new Error("Credenciais da Cakto não configuradas."), { status: 400 });
  }
  const response = await fetch("https://api.cakto.com.br/public_api/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: settings.clientId, client_secret: settings.clientSecret }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw Object.assign(new Error(body.detail || body.error || "Falha ao autenticar na Cakto."), { status: 400 });
  }
  return { token: body.access_token, settings };
}

async function testCaktoConnection() {
  await getCaktoAccessToken();
}

function proposalProducts(input) {
  return Array.isArray(input?.products)
    ? input.products.map((item) => ({
        id: cleanString(item?.id),
        name: cleanString(item?.name),
        price: proposalProductPrice(item),
      }))
    : [];
}

function proposalProductPrice(item) {
  const candidates = [
    item?.price,
    item?.idealPrice,
    item?.ideal_price,
    item?.amountPaid,
    item?.amount_paid,
    item?.value,
    item?.totalValue,
    item?.total_value,
  ];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) return Math.round(value * 100) / 100;
  }
  return 0;
}

function proposalInfoPackages(input) {
  return Array.isArray(input?.infoPackages)
    ? input.infoPackages
      .map((item) => ({
        id: cleanString(item?.id),
        hours: Math.max(0, Number(item?.hours) || 0),
        hourPrice: Math.max(0, Number(item?.hourPrice) || 0),
        validityDays: Math.max(0, Math.round(Number(item?.validityDays) || 0)),
        aircraftModelName: cleanString(item?.aircraftModelName),
      }))
      .filter((item) => item.hours > 0 && item.hourPrice > 0)
    : [];
}

function proposalProductsFromJson(value) {
  const productsData = parseJsonObject(value, []);
  if (Array.isArray(productsData)) return proposalProducts({ products: productsData });
  return proposalProducts({ products: productsData?.products });
}

function proposalProductsTotalFromJson(value) {
  const productsData = parseJsonObject(value, []);
  const products = Array.isArray(productsData)
    ? productsData
    : Array.isArray(productsData?.products)
      ? productsData.products
      : [];
  return Math.round(products.reduce((sum, item) => sum + proposalProductPrice(item), 0) * 100) / 100;
}

function proposalPaymentTotal(doc) {
  return Math.round((Number(doc?.total_value || 0) + proposalProductsTotalFromJson(doc?.products_json)) * 100) / 100;
}

function mapCaktoProposal(doc) {
  const productsData = parseJsonObject(doc.products_json, []);
  const isObject = productsData !== null && typeof productsData === "object" && !Array.isArray(productsData);
  const packageMetadata =
    isObject && productsData.kind === "student_credit_package"
      ? productsData
      : null;
  const notes = isObject ? cleanString(productsData?.notes || "") : "";
  return {
    id: doc.$id,
    schoolId: doc.school_id || SCHOOL_ID,
    leadId: doc.lead_id || "",
    leadName: doc.lead_name || "",
    leadEmail: doc.lead_email || "",
    hours: Number(doc.hours) || 0,
    hourPrice: Number(doc.hour_price) || 0,
    totalValue: Number(doc.total_value) || 0,
    products: Array.isArray(productsData) ? productsData : Array.isArray(productsData?.products) ? productsData.products : [],
    notes,
    publicToken: doc.public_token || "",
    status: doc.status === "sent" ? "sent" : "draft",
    caktoOfferId: doc.cakto_offer_id || "",
    paymentUrl: doc.payment_url || "",
    paymentStatus: ["created", "paid", "failed"].includes(doc.payment_status) ? doc.payment_status : "pending",
    paymentError: doc.payment_error || "",
    paymentUpdatedAt: doc.payment_updated_at || null,
    proposalType: packageMetadata ? "student_credit_package" : "commercial",
    studentUserId: cleanString(packageMetadata?.studentUserId),
    creditPackageId: cleanString(packageMetadata?.packageId),
    creditPackageSnapshot: packageMetadata?.snapshot || null,
    creditId: cleanString(packageMetadata?.creditId),
    createdAt: doc.$createdAt || "",
  };
}

async function createCaktoOfferForProposal(doc) {
  const { token, settings } = await getCaktoAccessToken();
  if (!settings.productId) throw Object.assign(new Error("Produto padrão da Cakto não configurado."), { status: 400 });
  const price = proposalPaymentTotal(doc);
  const response = await fetch("https://api.cakto.com.br/public_api/offers/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: `Orçamento - ${cleanString(doc.lead_name) || doc.$id}`,
      price,
      product: settings.productId,
      type: "unique",
      status: "active",
      units: 1,
      intervalType: "lifetime",
      interval: 1,
      trial_days: 0,
      max_retries: 3,
      retry_interval: 1,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.id) {
    throw new Error(body.detail || body.message || "Falha ao criar oferta na Cakto.");
  }
  const offerId = cleanString(body.id);
  const query = new URLSearchParams();
  const name = cleanString(doc.lead_name);
  const email = cleanString(doc.lead_email);
  let cpfRaw = "";
  let phoneRaw = "";
  let profileUserId = "";
  const leadId = cleanString(doc.lead_id);
  if (leadId) {
    const lead = await getLeadById(leadId).catch(() => null);
    if (lead) {
      cpfRaw = cleanString(lead.cpf);
      phoneRaw = cleanString(lead.phone);
      profileUserId = cleanString(lead.user_id);
    } else {
      // Em propostas de pacote de horas, lead_id guarda o userId diretamente.
      profileUserId = leadId;
    }
  }
  if (profileUserId && (!cpfRaw || !phoneRaw)) {
    const profile = await getProfileByUserId(profileUserId).catch(() => null);
    if (!cpfRaw) cpfRaw = cleanString(profile?.cpf);
    if (!phoneRaw) phoneRaw = cleanString(profile?.phone);
  }
  const cpf = cpfRaw.replace(/\D/g, "");
  const phoneDigits = phoneRaw.replace(/\D/g, "");
  const phone = phoneDigits
    ? (phoneDigits.startsWith("55") ? phoneDigits : `55${phoneDigits}`)
    : "";
  if (name) query.set("name", name);
  if (email) query.set("email", email);
  if (cpf) query.set("cpf", cpf);
  if (phone) query.set("phone", phone);
  const paymentUrl = `https://pay.cakto.com.br/${offerId}${query.toString() ? `?${query.toString()}` : ""}`;
  return { offerId, paymentUrl };
}

async function updateProposalPayment(proposalId, patch) {
  return databases.updateDocument(DATABASE_ID, CRM_PROPOSALS_COLLECTION_ID, proposalId, {
    ...patch,
    payment_updated_at: new Date().toISOString(),
  });
}

async function createCaktoProposal(input) {
  const hours = Math.max(0, Number(input?.hours) || 0);
  const hourPrice = Math.max(0, Number(input?.hourPrice) || 0);
  if (!cleanString(input?.leadId) || hours <= 0 || hourPrice <= 0) {
    throw Object.assign(new Error("Dados do orçamento inválidos."), { status: 400 });
  }
  const products = proposalProducts(input);
  const infoPackages = proposalInfoPackages(input);
  const doc = await databases.createDocument(
    DATABASE_ID,
    CRM_PROPOSALS_COLLECTION_ID,
    sdk.ID.unique(),
    {
      school_id: SCHOOL_ID,
      lead_id: cleanString(input.leadId),
      lead_name: cleanString(input.leadName),
      lead_email: cleanString(input.leadEmail),
      hours,
      hour_price: hourPrice,
      total_value: Math.round(hours * hourPrice * 100) / 100,
      products_json: JSON.stringify({
        kind: "commercial",
        products,
        infoPackages,
        notes: cleanString(input?.notes || ""),
      }),
      public_token: crypto.randomUUID().replace(/-/g, "").slice(0, 24),
      status: "draft",
      payment_status: "pending",
    },
    [
      sdk.Permission.read(sdk.Role.any()),
      sdk.Permission.update(sdk.Role.label("admin")),
      sdk.Permission.delete(sdk.Role.label("admin")),
    ],
  );
  try {
    const payment = await createCaktoOfferForProposal(doc);
    return mapCaktoProposal(await updateProposalPayment(doc.$id, {
      cakto_offer_id: payment.offerId,
      payment_url: payment.paymentUrl,
      payment_status: "created",
      payment_error: "",
    }));
  } catch (error) {
    return mapCaktoProposal(await updateProposalPayment(doc.$id, {
      payment_status: "failed",
      payment_error: cleanString(error?.message).slice(0, 2048),
    }));
  }
}

function filterFlightCreditPackagesForUser(packages, profile, authUser) {
  const sagaIdNum = Number(cleanString(profile?.saga_user_id));
  const hasSagaId = Number.isFinite(sagaIdNum) && sagaIdNum > 0;
  const userCreatedAt = authUser?.$createdAt || null;
  return packages.filter((pkg) => {
    const el = pkg.eligibility || { type: "all" };
    if (!el.type || el.type === "all") return true;
    if (el.type === "saga_id_range") {
      if (!hasSagaId) return false;
      if (el.min != null && sagaIdNum < el.min) return false;
      if (el.max != null && sagaIdNum > el.max) return false;
      return true;
    }
    if (el.type === "created_date_range") {
      if (!userCreatedAt) return false;
      const createdMs = new Date(userCreatedAt).getTime();
      if (el.from && createdMs < new Date(el.from).getTime()) return false;
      if (el.to && createdMs > new Date(el.to + "T23:59:59.999Z").getTime()) return false;
      return true;
    }
    return true;
  });
}

async function getFlightCreditPackagesForStudentUserId(studentUserId) {
  const safeUserId = cleanString(studentUserId);
  if (!safeUserId) throw Object.assign(new Error("Aluno nao informado."), { status: 400 });
  const [profile, authUser, { settings, doc }] = await Promise.all([
    getProfileByUserId(safeUserId).catch(() => null),
    users.get({ userId: safeUserId }).catch(() => null),
    loadFlightCreditSalesConfig(),
  ]);
  const config = publicFlightCreditSalesConfig(settings, doc?.$updatedAt || null, true);
  if (!config.studentPurchasesEnabled) {
    config.packages = [];
  } else {
    config.packages = filterFlightCreditPackagesForUser(config.packages, profile, authUser);
  }
  return config;
}

async function listStaffCreditPurchaseStudents(search = "") {
  const needle = normalizeSearch(String(search || ""));
  if (needle.length < 3) return [];
  const page = await listSummaries({ search: String(search || "").trim(), limit: 50, offset: 0 });
  return (page.users || [])
    .filter((user) => {
      const roles = Array.isArray(user.assignedRoleSlugs) ? user.assignedRoleSlugs : Array.isArray(user.roles) ? user.roles : [];
      return user.role === "aluno" || user.activeRole === "aluno" || roles.includes("aluno");
    })
    .map((user) => ({
      userId: cleanString(user.userId),
      name: cleanString(user.name),
      email: cleanString(user.email),
    }))
    .slice(0, 25)
    .filter((user) => user.userId);
}

async function checkoutExtraProducts(input) {
  const items = proposalProducts({ products: Array.isArray(input) ? input : [] })
    .filter((item) => item.id && item.name && item.price > 0)
    .slice(0, 20);
  if (!items.length) return [];
  if (!SCHOOL_PRODUCTS_COLLECTION_ID) return items;

  const resolved = [];
  for (const item of items) {
    const doc = await databases.getDocument(DATABASE_ID, SCHOOL_PRODUCTS_COLLECTION_ID, item.id).catch(() => null);
    if (!doc || doc.deleted_at || doc.active === false || (doc.school_id && doc.school_id !== SCHOOL_ID)) {
      throw Object.assign(new Error(`Produto indisponivel: ${item.name || item.id}`), { status: 400 });
    }
    resolved.push({
      id: cleanString(doc.$id),
      name: cleanString(doc.name),
      price: Math.max(0, Number(doc.ideal_price) || 0),
    });
  }
  return resolved.filter((item) => item.id && item.name && item.price > 0);
}

async function createFlightCreditCheckoutForUser(
  targetUserId,
  packageId,
  customHoursInput = null,
  weekdayOnlyInput = false,
  { requireStudentPurchasesEnabled = true, extraProductsInput = [] } = {},
) {
  const safeUserId = cleanString(targetUserId);
  if (!safeUserId) throw Object.assign(new Error("Aluno nao informado."), { status: 400 });
  const { settings } = await loadFlightCreditSalesConfig();
  if (requireStudentPurchasesEnabled && !settings?.studentPurchasesEnabled) {
    throw Object.assign(new Error("A compra de horas pelo aluno esta desabilitada."), { status: 403 });
  }
  const weekdayOnly = weekdayOnlyInput === true;
  const weekdayDiscountPct = parseWeekdayDiscountPct(settings?.weekdayDiscountPct);
  if (weekdayOnly && !weekdayDiscountPct) {
    throw Object.assign(new Error("Modalidade somente seg-sex indisponivel."), { status: 403 });
  }
  const packages = (Array.isArray(settings.packages) ? settings.packages : []).filter((item) => item?.active === true);
  const selected = packages.find((item) => cleanString(item?.id) === cleanString(packageId));
  const normalized = publicFlightCreditSalesConfig({ studentPurchasesEnabled: true, packages: selected ? [selected] : [] }, null, true).packages[0];
  if (!normalized) throw Object.assign(new Error("Pacote indisponivel para compra."), { status: 404 });
  if (weekdayOnly && normalized.weekdayDiscountEligible === false) {
    throw Object.assign(new Error("Este pacote nao participa do desconto seg-sex."), { status: 403 });
  }
  const requestedCustomHours = Number(customHoursInput);
  const customHours = Number.isFinite(requestedCustomHours) ? Math.round(requestedCustomHours * 100) / 100 : null;
  const hasCustomHours = customHours !== null && customHours > 0;
  const sortedPackages = publicFlightCreditSalesConfig({ studentPurchasesEnabled: true, packages }, null, true).packages
    .filter((pkg) => !weekdayOnly || pkg.weekdayDiscountEligible !== false)
    .sort((a, b) => a.hours - b.hours);
  const referencePackage = hasCustomHours
    ? [...sortedPackages].reverse().find((pkg) => pkg.hours <= customHours) || sortedPackages[0]
    : normalized;
  if (!referencePackage) throw Object.assign(new Error("Pacote de referencia indisponivel."), { status: 404 });
  const finalHours = hasCustomHours ? customHours : normalized.hours;
  if (!Number.isFinite(finalHours) || finalHours <= 0) {
    throw Object.assign(new Error("Quantidade de horas invalida."), { status: 400 });
  }

  const actor = await users.get({ userId: safeUserId });
  const profile = await getProfileByUserId(safeUserId).catch(() => null);
  const baseHourPrice = referencePackage.hourPrice;
  const effectiveHourPrice = weekdayOnly
    ? Math.round(baseHourPrice * (1 - weekdayDiscountPct / 100) * 100) / 100
    : baseHourPrice;
  const totalValue = Math.round(finalHours * effectiveHourPrice * 100) / 100;
  const extraProducts = await checkoutExtraProducts(extraProductsInput);
  const snapshot = {
    packageId: normalized.id,
    referencePackageId: referencePackage.id,
    customHours: hasCustomHours ? finalHours : null,
    hours: finalHours,
    hourPrice: effectiveHourPrice,
    baseHourPrice,
    weekdayOnly,
    weekdayDiscountPct: weekdayOnly ? weekdayDiscountPct : null,
    totalValue,
    validityDays: referencePackage.validityDays,
    aircraftModelId: referencePackage.aircraftModelId,
    aircraftModelName: referencePackage.aircraftModelName,
  };
  const proposalId = sdk.ID.unique();
  const creditId = `fc_${crypto.createHash("sha256").update(proposalId).digest("hex").slice(0, 29)}`;
  const doc = await databases.createDocument(
    DATABASE_ID,
    CRM_PROPOSALS_COLLECTION_ID,
    proposalId,
    {
      school_id: SCHOOL_ID,
      lead_id: safeUserId,
      lead_name: cleanString(profile?.full_name) || cleanString(actor.name) || "Aluno",
      lead_email: cleanString(actor.email),
      hours: finalHours,
      hour_price: effectiveHourPrice,
      total_value: totalValue,
      products_json: JSON.stringify({
        kind: "student_credit_package",
        studentUserId: safeUserId,
        packageId: normalized.id,
        creditId,
        snapshot,
        products: extraProducts,
      }),
      public_token: crypto.randomUUID().replace(/-/g, "").slice(0, 24),
      status: "draft",
      payment_status: "pending",
    },
    [
      sdk.Permission.read(sdk.Role.any()),
      sdk.Permission.read(sdk.Role.user(safeUserId)),
      sdk.Permission.update(sdk.Role.label("admin")),
      sdk.Permission.delete(sdk.Role.label("admin")),
    ],
  );
  try {
    const payment = await createCaktoOfferForProposal(doc);
    const updated = await updateProposalPayment(doc.$id, {
      cakto_offer_id: payment.offerId,
      payment_url: payment.paymentUrl,
      payment_status: "created",
      payment_error: "",
    });
    return { proposalId: updated.$id, paymentUrl: payment.paymentUrl };
  } catch (error) {
    await updateProposalPayment(doc.$id, {
      payment_status: "failed",
      payment_error: cleanString(error?.message).slice(0, 2048),
    });
    throw Object.assign(new Error(cleanString(error?.message) || "Falha ao criar checkout."), { status: 400 });
  }
}

async function createFlightCreditCheckout(actorUserId, packageId, customHoursInput = null, weekdayOnlyInput = false) {
  if (!actorUserId) throw Object.assign(new Error("Autenticacao necessaria."), { status: 401 });
  const role = await getActorRole(actorUserId);
  if (role !== "aluno") {
    throw Object.assign(new Error("A compra de pacotes esta disponivel apenas para alunos."), { status: 403 });
  }
  return createFlightCreditCheckoutForUser(actorUserId, packageId, customHoursInput, weekdayOnlyInput);
}

async function adminCreateFlightCreditCheckout(actorUserId, targetUserId, packageId, customHoursInput = null, customHourPriceInput = null, weekdayOnlyInput = false, extraProductsInput = []) {
  await requireAdmin(actorUserId);
  const safeTargetUserId = cleanString(targetUserId);
  if (!safeTargetUserId) throw Object.assign(new Error("Usuário de destino não informado."), { status: 400 });
  const safePackageId = cleanString(packageId);
  const extraProducts = await checkoutExtraProducts(extraProductsInput);
  if (!safePackageId && extraProducts.length === 0) {
    throw Object.assign(new Error("Selecione um pacote de horas ou pelo menos um produto adicional."), { status: 400 });
  }
  const targetUser = await users.get({ userId: safeTargetUserId });
  const targetProfile = await getProfileByUserId(safeTargetUserId).catch(() => null);
  if (!safePackageId) {
    const snapshot = {
      packageId: "",
      referencePackageId: "",
      customHours: null,
      customHourPrice: null,
      hours: 0,
      hourPrice: 0,
      baseHourPrice: 0,
      weekdayOnly: false,
      weekdayDiscountPct: null,
      totalValue: 0,
      validityDays: 0,
      aircraftModelId: "",
      aircraftModelName: "",
    };
    const proposalId = sdk.ID.unique();
    const doc = await databases.createDocument(
      DATABASE_ID,
      CRM_PROPOSALS_COLLECTION_ID,
      proposalId,
      {
        school_id: SCHOOL_ID,
        lead_id: safeTargetUserId,
        lead_name: cleanString(targetProfile?.full_name) || cleanString(targetUser.name) || "Aluno",
        lead_email: cleanString(targetUser.email),
        hours: 0,
        hour_price: 0,
        total_value: 0,
        products_json: JSON.stringify({
          kind: "student_credit_package",
          studentUserId: safeTargetUserId,
          packageId: "",
          creditId: "",
          snapshot,
          products: extraProducts,
        }),
        public_token: crypto.randomUUID().replace(/-/g, "").slice(0, 24),
        status: "draft",
        payment_status: "pending",
      },
      [
        sdk.Permission.read(sdk.Role.any()),
        sdk.Permission.read(sdk.Role.user(safeTargetUserId)),
        sdk.Permission.update(sdk.Role.label("admin")),
        sdk.Permission.delete(sdk.Role.label("admin")),
      ],
    );
    try {
      const payment = await createCaktoOfferForProposal(doc);
      const updated = await updateProposalPayment(doc.$id, {
        cakto_offer_id: payment.offerId,
        payment_url: payment.paymentUrl,
        payment_status: "created",
        payment_error: "",
      });
      return { proposalId: updated.$id, paymentUrl: payment.paymentUrl };
    } catch (error) {
      await updateProposalPayment(doc.$id, {
        payment_status: "failed",
        payment_error: cleanString(error?.message).slice(0, 2048),
      });
      throw Object.assign(new Error(cleanString(error?.message) || "Falha ao criar checkout."), { status: 400 });
    }
  }
  const { settings } = await loadFlightCreditSalesConfig();
  const weekdayOnly = weekdayOnlyInput === true;
  const weekdayDiscountPct = parseWeekdayDiscountPct(settings?.weekdayDiscountPct);
  if (weekdayOnly && !weekdayDiscountPct) {
    throw Object.assign(new Error("Modalidade somente seg-sex indisponivel."), { status: 403 });
  }
  const packages = (Array.isArray(settings.packages) ? settings.packages : []).filter((item) => item?.active === true);
  const selected = packages.find((item) => cleanString(item?.id) === safePackageId);
  const normalized = publicFlightCreditSalesConfig({ studentPurchasesEnabled: true, packages: selected ? [selected] : [] }, null, true).packages[0];
  if (!normalized) throw Object.assign(new Error("Pacote indisponível ou inativo."), { status: 404 });
  if (weekdayOnly && normalized.weekdayDiscountEligible === false) {
    throw Object.assign(new Error("Este pacote nao participa do desconto seg-sex."), { status: 403 });
  }
  const requestedCustomHours = Number(customHoursInput);
  const customHours = Number.isFinite(requestedCustomHours) ? Math.round(requestedCustomHours * 100) / 100 : null;
  const hasCustomHours = customHours !== null && customHours > 0;
  const requestedCustomHourPrice = Number(customHourPriceInput);
  const customHourPrice = Number.isFinite(requestedCustomHourPrice)
    ? Math.round(requestedCustomHourPrice * 100) / 100
    : null;
  const hasCustomHourPrice = customHourPrice !== null && customHourPrice > 0;
  if (weekdayOnly && hasCustomHourPrice) {
    throw Object.assign(new Error("Desconto seg-sex nao se aplica com valor de hora personalizado."), { status: 400 });
  }
  const sortedPackages = publicFlightCreditSalesConfig({ studentPurchasesEnabled: true, packages }, null, true).packages
    .filter((pkg) => !weekdayOnly || pkg.weekdayDiscountEligible !== false)
    .sort((a, b) => a.hours - b.hours);
  const referencePackage = hasCustomHours
    ? [...sortedPackages].reverse().find((pkg) => pkg.hours <= customHours) || sortedPackages[0]
    : normalized;
  if (!referencePackage) throw Object.assign(new Error("Pacote de referência indisponível."), { status: 404 });
  const finalHours = hasCustomHours ? customHours : normalized.hours;
  if (!Number.isFinite(finalHours) || finalHours <= 0) {
    throw Object.assign(new Error("Quantidade de horas inválida."), { status: 400 });
  }
  const baseHourPrice = hasCustomHourPrice ? customHourPrice : referencePackage.hourPrice;
  const finalHourPrice = weekdayOnly
    ? Math.round(baseHourPrice * (1 - weekdayDiscountPct / 100) * 100) / 100
    : baseHourPrice;
  const totalValue = Math.round(finalHours * finalHourPrice * 100) / 100;
  const snapshot = {
    packageId: normalized.id,
    referencePackageId: referencePackage.id,
    customHours: hasCustomHours ? finalHours : null,
    customHourPrice: hasCustomHourPrice ? finalHourPrice : null,
    hours: finalHours,
    hourPrice: finalHourPrice,
    baseHourPrice,
    weekdayOnly,
    weekdayDiscountPct: weekdayOnly ? weekdayDiscountPct : null,
    totalValue,
    validityDays: referencePackage.validityDays,
    aircraftModelId: referencePackage.aircraftModelId,
    aircraftModelName: referencePackage.aircraftModelName,
  };
  const proposalId = sdk.ID.unique();
  const creditId = `fc_${crypto.createHash("sha256").update(proposalId).digest("hex").slice(0, 29)}`;
  const doc = await databases.createDocument(
    DATABASE_ID,
    CRM_PROPOSALS_COLLECTION_ID,
    proposalId,
    {
      school_id: SCHOOL_ID,
      lead_id: safeTargetUserId,
      lead_name: cleanString(targetProfile?.full_name) || cleanString(targetUser.name) || "Aluno",
      lead_email: cleanString(targetUser.email),
      hours: finalHours,
      hour_price: finalHourPrice,
      total_value: totalValue,
      products_json: JSON.stringify({
        kind: "student_credit_package",
        studentUserId: safeTargetUserId,
        packageId: normalized.id,
        creditId,
        snapshot,
        products: extraProducts,
      }),
      public_token: crypto.randomUUID().replace(/-/g, "").slice(0, 24),
      status: "draft",
      payment_status: "pending",
    },
    [
      sdk.Permission.read(sdk.Role.any()),
      sdk.Permission.read(sdk.Role.user(safeTargetUserId)),
      sdk.Permission.update(sdk.Role.label("admin")),
      sdk.Permission.delete(sdk.Role.label("admin")),
    ],
  );
  try {
    const payment = await createCaktoOfferForProposal(doc);
    const updated = await updateProposalPayment(doc.$id, {
      cakto_offer_id: payment.offerId,
      payment_url: payment.paymentUrl,
      payment_status: "created",
      payment_error: "",
    });
    return { proposalId: updated.$id, paymentUrl: payment.paymentUrl };
  } catch (error) {
    await updateProposalPayment(doc.$id, {
      payment_status: "failed",
      payment_error: cleanString(error?.message).slice(0, 2048),
    });
    throw Object.assign(new Error(cleanString(error?.message) || "Falha ao criar checkout."), { status: 400 });
  }
}

async function findFlightCreditProposalForPaymentLink(targetUserId, paymentUrl, proposalId = "") {
  const safeProposalId = cleanString(proposalId);
  if (safeProposalId) {
    return databases.getDocument(DATABASE_ID, CRM_PROPOSALS_COLLECTION_ID, safeProposalId).catch(() => null);
  }
  const safeTargetUserId = cleanString(targetUserId);
  const safePaymentUrl = cleanString(paymentUrl);
  if (!safeTargetUserId || !safePaymentUrl) return null;
  try {
    const page = await databases.listDocuments(DATABASE_ID, CRM_PROPOSALS_COLLECTION_ID, [
      sdk.Query.equal("lead_id", [safeTargetUserId]),
      sdk.Query.orderDesc("$createdAt"),
      sdk.Query.limit(50),
    ]);
    return (page.documents || []).find((doc) => cleanString(doc.payment_url) === safePaymentUrl) || null;
  } catch {
    // Fallback for projects without a lead_id index on proposals.
  }
  try {
    const page = await databases.listDocuments(DATABASE_ID, CRM_PROPOSALS_COLLECTION_ID, [
      sdk.Query.equal("payment_url", [safePaymentUrl]),
      sdk.Query.limit(1),
    ]);
    return (page.documents || []).find((doc) => cleanString(doc.lead_id) === safeTargetUserId) || null;
  } catch {
    return null;
  }
}

async function sendFlightCreditPaymentLinkEmail(actorUserId, input = {}) {
  await requireAdmin(actorUserId);
  const safeTargetUserId = cleanString(input.targetUserId);
  const safePaymentUrl = cleanString(input.paymentUrl);
  if (!safeTargetUserId) throw Object.assign(new Error("Aluno nao informado."), { status: 400 });
  if (!safePaymentUrl) throw Object.assign(new Error("Link de pagamento nao informado."), { status: 400 });
  try {
    const parsed = new URL(safePaymentUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("invalid");
  } catch {
    throw Object.assign(new Error("Link de pagamento invalido."), { status: 400 });
  }

  const safeProposalId = cleanString(input.proposalId);
  const [targetUser, targetProfile, { settings }, { publicSettings: brand }] = await Promise.all([
    users.get({ userId: safeTargetUserId }),
    getProfileByUserId(safeTargetUserId).catch(() => null),
    loadEmailSettings(),
    loadEmailBrandSettings(),
  ]);
  const proposal = await findFlightCreditProposalForPaymentLink(safeTargetUserId, safePaymentUrl, safeProposalId);
  if (!proposal) throw Object.assign(new Error("Proposta do link de pagamento nao encontrada para calcular o valor do email."), { status: 404 });
  if (proposal && cleanString(proposal.lead_id) && cleanString(proposal.lead_id) !== safeTargetUserId) {
    throw Object.assign(new Error("O link informado nao pertence ao aluno selecionado."), { status: 400 });
  }
  const email = cleanString(targetUser?.email) || cleanString(targetProfile?.email);
  if (!email) throw Object.assign(new Error("Aluno sem email cadastrado."), { status: 400 });
  const studentName = cleanString(targetProfile?.full_name) || cleanString(targetUser?.name) || email;
  const hours = Number(proposal?.hours || 0);
  const totalValue = proposalPaymentTotal(proposal);
  const details = [
    ["Aluno", studentName],
    hours > 0 ? ["Horas", `${hours.toLocaleString("pt-BR")} h`] : null,
    totalValue > 0 ? ["Valor", formatMoneyLabel(totalValue, "BRL")] : null,
  ].filter(Boolean);
  const result = await sendEmailToUser(settings, brand, { email, name: studentName }, {
    eyebrow: "Pagamento",
    title: "Seu link de pagamento esta pronto",
    intro: "A escola gerou um link de pagamento para voce.",
    body: "Use o botao abaixo para concluir o pagamento com seguranca. Depois da confirmacao, os creditos e produtos vinculados ao link serao lancados automaticamente.",
    details,
    ctaLabel: "Abrir pagamento",
    url: safePaymentUrl,
  });
  if (result.status !== "sent") {
    throw Object.assign(new Error(result.reason || "Email nao enviado."), { status: 400 });
  }
  return { ok: true, email, delivery: result };
}

async function retryCaktoProposal(proposalId) {
  const doc = await databases.getDocument(DATABASE_ID, CRM_PROPOSALS_COLLECTION_ID, cleanString(proposalId));
  if (doc.payment_url) return mapCaktoProposal(doc);
  try {
    const payment = await createCaktoOfferForProposal(doc);
    return mapCaktoProposal(await updateProposalPayment(doc.$id, {
      cakto_offer_id: payment.offerId,
      payment_url: payment.paymentUrl,
      payment_status: "created",
      payment_error: "",
    }));
  } catch (error) {
    await updateProposalPayment(doc.$id, {
      payment_status: "failed",
      payment_error: cleanString(error?.message).slice(0, 2048),
    });
    throw Object.assign(error, { status: 400 });
  }
}

function caktoPayloadData(payload) {
  if (Array.isArray(payload?.data)) return parseJsonObject(JSON.stringify(payload.data[0] || {}), {});
  return parseJsonObject(JSON.stringify(payload?.data || {}), {});
}

function caktoPayloadReceipt(payload) {
  const data = caktoPayloadData(payload);
  const customer = data.customer && typeof data.customer === "object" ? data.customer : {};
  const offer = data.offer && typeof data.offer === "object" ? data.offer : {};
  const product = data.product && typeof data.product === "object" ? data.product : {};
  const eventType = cleanString(payload?.event || payload?.event_type || payload?.eventType);
  const eventAt =
    (eventType === "purchase_approved" ? cleanString(data.paidAt) : "") ||
    (eventType === "refund" ? cleanString(data.refundedAt) : "") ||
    (eventType === "chargeback" ? cleanString(data.chargedbackAt) : "") ||
    cleanString(data.createdAt || payload?.createdAt || payload?.created_at);
  return {
    eventId: cleanString(data.id || payload?.id || payload?.event_id),
    eventType,
    orderId: cleanString(data.refId || data.ref_id || data.order_id),
    offerId: cleanString(offer.id || data.offer_id),
    productId: cleanString(product.id || data.product_id),
    customerName: cleanString(customer.name || customer.full_name),
    customerEmail: cleanString(customer.email),
    amount: Number(data.amount ?? data.total ?? data.price ?? 0) || 0,
    currency: cleanString(offer.currency || data.currency || "BRL").toUpperCase(),
    paymentMethod: cleanString(data.paymentMethodName || data.paymentMethod || data.payment_method),
    status: cleanString(data.status || eventType),
    eventAt: eventAt || null,
  };
}

function mapCaktoReceipt(doc) {
  const payloadJson = doc.payload_json || "{}";
  const payload = parseJsonObject(payloadJson, {});
  const normalized = caktoPayloadReceipt(payload);
  return {
    id: doc.$id,
    source: "cakto",
    eventId: normalized.eventId || doc.event_id || "",
    eventType: normalized.eventType || doc.event_type || "",
    orderId: normalized.orderId || doc.order_id || "",
    offerId: normalized.offerId || doc.offer_id || "",
    productId: normalized.productId || doc.product_id || "",
    proposalId: doc.proposal_id || "",
    customerName: normalized.customerName || doc.customer_name || "",
    customerEmail: normalized.customerEmail || doc.customer_email || "",
    amount: normalized.amount || Number(doc.amount) || 0,
    currency: normalized.currency || doc.currency || "BRL",
    paymentMethod: normalized.paymentMethod || doc.payment_method || "",
    status: normalized.status || doc.status || "",
    fulfillmentStatus: doc.fulfillment_status || "",
    fulfillmentError: doc.fulfillment_error || "",
    fulfillmentUpdatedAt: doc.fulfillment_updated_at || null,
    creditId: doc.credit_id || "",
    sagaStatus: doc.saga_status || "",
    sagaError: doc.saga_error || "",
    sagaCreditMarker: doc.saga_credit_marker || "",
    sagaUpdatedAt: doc.saga_updated_at || null,
    eventAt: normalized.eventAt || doc.event_at || null,
    receivedAt: doc.received_at || doc.$createdAt,
    payloadJson,
  };
}

function isSagaCreditDocument(doc) {
  const paymentMethod = cleanString(doc?.payment_method).toLowerCase();
  const createdBy = cleanString(doc?.created_by).toLowerCase();
  const notes = cleanString(doc?.notes).toLowerCase();
  if (createdBy === "saga-import") return true;
  if (paymentMethod === "saga") return true;
  return notes.includes("importado do saga") || notes.includes("importado do financeiro saga");
}

function mapSagaImportedReceipt(doc, usersById, profilesByUserId) {
  const amount = Number(doc.amount_paid || 0);
  const purchaseDate = cleanString(doc.purchase_date);
  const eventAt = /^\d{4}-\d{2}-\d{2}$/.test(purchaseDate) ? `${purchaseDate}T12:00:00.000Z` : cleanString(doc.$createdAt);
  const studentUserId = cleanString(doc.user_id);
  const studentLabel = userLabel(studentUserId, usersById, profilesByUserId);
  const paymentMethod = cleanString(doc.payment_method) || "SAGA";
  return {
    id: `saga:${doc.$id}`,
    source: "saga",
    eventId: cleanString(doc.$id),
    eventType: "saga_credit_created",
    orderId: "",
    offerId: "",
    productId: cleanString(doc.aircraft_model_id || doc.aircraft_model_name),
    proposalId: "",
    customerName: studentLabel || "Aluno",
    customerEmail: "",
    amount,
    currency: "BRL",
    paymentMethod,
    status: "approved",
    fulfillmentStatus: "",
    fulfillmentError: "",
    fulfillmentUpdatedAt: null,
    creditId: cleanString(doc.$id),
    sagaStatus: "completed",
    sagaError: "",
    sagaCreditMarker: cleanString(doc.created_by || doc.payment_method),
    sagaUpdatedAt: cleanString(doc.$updatedAt) || eventAt || null,
    eventAt: eventAt || null,
    receivedAt: eventAt || cleanString(doc.$createdAt),
    payloadJson: JSON.stringify(
      {
        source: "student_credits",
        user_id: studentUserId,
        aircraft_model_id: cleanString(doc.aircraft_model_id),
        aircraft_model_name: cleanString(doc.aircraft_model_name),
        amount_paid: amount,
        hours: Number(doc.hours || 0),
        payment_method: paymentMethod,
        purchase_date: purchaseDate || null,
        created_by: cleanString(doc.created_by) || null,
      },
      null,
      0,
    ),
  };
}

async function listCaktoReceipts(input) {
  const sourceFilter = cleanString(input?.source || "all").toLowerCase();
  const includeCakto = sourceFilter === "" || sourceFilter === "all" || sourceFilter === "cakto";
  const includeSaga = sourceFilter === "" || sourceFilter === "all" || sourceFilter === "saga";
  let rows = [];

  if (includeCakto) {
    const docs = await listAllDocuments(CAKTO_RECEIPTS_COLLECTION_ID, [
      sdk.Query.equal("school_id", [SCHOOL_ID]),
      sdk.Query.orderDesc("received_at"),
      sdk.Query.limit(500),
    ]);
    rows.push(...docs.map(mapCaktoReceipt));
  }

  if (includeSaga) {
    const sagaCredits = await listAllDocuments(STUDENT_CREDITS_COLLECTION_ID, [
        sdk.Query.equal("school_id", [SCHOOL_ID]),
      sdk.Query.orderDesc("purchase_date"),
      ...selectQuery(CREDIT_SELECT),
    ]).catch(() => []);
    const payments = sagaCredits.filter(isSagaCreditDocument).filter((doc) => Number(doc.amount_paid || 0) > 0);
    const sagaStudentUserIds = Array.from(
      new Set(payments.map((doc) => cleanString(doc.user_id)).filter(Boolean)),
    );
    const [usersList, profilesByUserId] = await Promise.all([
      getUsersByIds(sagaStudentUserIds),
      getProfilesByUserIds(sagaStudentUserIds),
    ]);
    const usersById = new Map((usersList || []).map((user) => [user.$id, user]));
    rows.push(...payments.map((doc) => mapSagaImportedReceipt(doc, usersById, profilesByUserId)));
  }

  const caktoCreditsById = new Set(
    rows
      .filter((row) => row.source === "cakto")
      .map((row) => cleanString(row.creditId))
      .filter(Boolean),
  );
  rows = rows.filter((row) => !(row.source === "saga" && cleanString(row.creditId) && caktoCreditsById.has(cleanString(row.creditId))));

  const search = cleanString(input?.search).toLowerCase();
  const from = cleanString(input?.dateFrom);
  const to = cleanString(input?.dateTo);
  const eventTypes = Array.isArray(input?.eventTypes)
    ? Array.from(new Set(input.eventTypes.map((value) => cleanString(value)).filter(Boolean)))
    : [];
  const hasEventTypes = eventTypes.length > 0;
  rows = rows.filter((row) => {
    if (hasEventTypes) {
      if (!eventTypes.includes(row.eventType)) return false;
    } else if (input?.eventType && row.eventType !== input.eventType) {
      return false;
    }
    if (input?.paymentMethod && row.paymentMethod !== input.paymentMethod) return false;
    const date = row.eventAt || row.receivedAt;
    if (from && date < `${from}T00:00:00`) return false;
    if (to && date > `${to}T23:59:59.999`) return false;
    if (search && ![
      row.customerName,
      row.customerEmail,
      row.orderId,
      row.offerId,
    ].some((value) => value.toLowerCase().includes(search))) return false;
    return true;
  });
  rows.sort((a, b) => String(b.eventAt || b.receivedAt || "").localeCompare(String(a.eventAt || a.receivedAt || "")));
  const summary = rows.reduce((acc, row) => {
    if (row.eventType === "purchase_approved" || row.eventType === "saga_imported_receipt" || row.eventType === "saga_credit_created") acc.approved += row.amount;
    else if (row.eventType === "refund" || row.eventType === "chargeback") acc.refunded += row.amount;
    else if (["pix_gerado", "boleto_gerado", "picpay_gerado", "openfinance_nubank_gerado"].includes(row.eventType)) acc.pending += row.amount;
    return acc;
  }, { approved: 0, refunded: 0, pending: 0 });
  const limit = Math.min(100, Math.max(1, Number(input?.limit) || 25));
  const offset = Math.max(0, Number(input?.offset) || 0);
  return { receipts: rows.slice(offset, offset + limit), total: rows.length, limit, offset, summary };
}

function resolveSagaScheduleAircraftId(aircraftIdent, mapping) {
  const normalizedIdent = normalizeAircraftIdent(aircraftIdent);
  const rawIdent = cleanString(aircraftIdent);
  const direct =
    cleanString(mapping.aircraftIdByRegistration?.[normalizedIdent]) ||
    cleanString(mapping.aircraftIdByRegistration?.[rawIdent]) ||
    cleanString(mapping.aircraftIdByRegistration?.[rawIdent.toLowerCase()]) ||
    cleanString(mapping.aircraftIdByRegistration?.[rawIdent.toUpperCase()]);
  if (direct) return direct;

  for (const [sagaAircraftKey, localAircraftIdent] of Object.entries(mapping.aircraftBySaga || {})) {
    if (normalizeAircraftIdent(localAircraftIdent) !== normalizedIdent) continue;
    const cleanSagaKey = cleanString(sagaAircraftKey);
    if (/^\d+$/.test(cleanSagaKey)) return cleanSagaKey;
    const sagaKeyId =
      cleanString(mapping.aircraftIdByRegistration?.[normalizeAircraftIdent(cleanSagaKey)]) ||
      cleanString(mapping.aircraftIdByRegistration?.[cleanSagaKey]) ||
      cleanString(mapping.aircraftIdByRegistration?.[cleanSagaKey.toLowerCase()]) ||
      cleanString(mapping.aircraftIdByRegistration?.[cleanSagaKey.toUpperCase()]);
    if (sagaKeyId) return sagaKeyId;
  }
  return "";
}

function sagaScheduleSummaryPayload(ctx, mapping, payload = {}) {
  const { flight, studentUser, instructorUser, studentProfile, instructorProfile } = ctx;
  const aircraftIdent = normalizeAircraftIdent(flight.aircraft_ident);
  const aircraftId = resolveSagaScheduleAircraftId(flight.aircraft_ident, mapping);
  if (!aircraftId) throw Object.assign(new Error(`ID SAGA da aeronave ${aircraftIdent || "do voo"} nao encontrado no de-para.`), { status: 422 });
  const studentSagaId = cleanString(studentProfile?.saga_user_id);
  const instructorSagaId = cleanString(instructorProfile?.saga_user_id);
  if (!studentSagaId) throw Object.assign(new Error(`ID SAGA do aluno ${cleanString(studentProfile?.full_name) || cleanString(studentUser?.name) || cleanString(flight.student_user_id) || "do voo"} nao encontrado no perfil.`), { status: 422 });
  if (cleanString(flight.instructor_user_id) && !instructorSagaId) {
    throw Object.assign(new Error(`ID SAGA do instrutor ${cleanString(instructorProfile?.full_name) || cleanString(instructorUser?.name) || cleanString(flight.instructor_user_id)} nao encontrado no perfil.`), { status: 422 });
  }
  const { startAt, endAt } = sagaScheduleDateTimes(flight);
  const studentName = cleanString(studentProfile?.full_name) || cleanString(studentUser?.name) || "Aluno";
  const instructorName = cleanString(instructorProfile?.full_name) || cleanString(instructorUser?.name);
  const notes = Object.prototype.hasOwnProperty.call(payload, "notes")
    ? cleanString(payload.notes)
    : [
        `GFV ${flight.$id}`,
        `Aluno: ${studentName}`,
        instructorName ? `Instrutor: ${instructorName}` : "",
        aircraftIdent ? `Aeronave: ${aircraftIdent}` : "",
        cleanString(flight.flight_date) ? `Data: ${cleanString(flight.flight_date)}` : "",
        cleanString(flight.start_time) ? `Horario: ${cleanString(flight.start_time).slice(0, 5)}` : "",
      ].filter(Boolean).join(" | ");
  return {
    aircraft_id: aircraftId,
    student_id: studentSagaId,
    instructor_id: instructorSagaId || studentSagaId,
    start_at: startAt,
    end_at: endAt,
    status: "PLANNED",
    notes: notes.slice(0, 255),
  };
}

async function syncSagaScheduleEvent(actorUserId, payload = {}) {
  const flightId = cleanString(payload.flightId);
  const mode = cleanString(payload.mode) === "cancel" ? "cancel" : "upsert";
  const allowCreate = payload.allowCreate === true;
  if (!flightId) throw Object.assign(new Error("Voo nao informado."), { status: 400 });
  // When called from another Appwrite function via API key there is no user context (actorUserId is null).
  // The API key itself authorises the call — skip the role check only in that case.
  if (actorUserId) await requireInstructorOrAdmin(actorUserId);

  const mapping = await loadSagaImportMapping();
  const logs = [];
  const baseResult = {
    ok: false,
    mode,
    status: "failed",
    message: "",
    flightId,
    sagaScheduleId: null,
    httpStatus: null,
    endpoint: null,
    requestPayload: null,
    response: null,
    logs,
  };

  const flight = await databases.getDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, flightId);
  const sagaScheduleId = cleanString(flight.saga_schedule_id) || cleanString(payload.sagaScheduleId);
  baseResult.sagaScheduleId = sagaScheduleId || null;

  if (mapping.sendFlightsToSaga !== true) {
    const entry = sagaScheduleLogEntry({ mode, status: "skipped", message: "Envio de voos ao SAGA desligado." });
    logs.push(entry.message);
    await safeUpdateFlightSagaScheduleFields(flightId, {
      saga_schedule_sync_status: "skipped",
      saga_schedule_synced_at: nowIso(),
      saga_schedule_error: null,
      saga_schedule_log_json: truncateSagaScheduleLog([entry]),
    });
    return { ...baseResult, ok: true, skipped: true, status: "skipped", message: entry.message };
  }

  if (mode === "cancel" && !sagaScheduleId) {
    const entry = sagaScheduleLogEntry({ mode, status: "skipped", message: "Voo sem ID de agenda SAGA; remocao remota ignorada." });
    logs.push(entry.message);
    await safeUpdateFlightSagaScheduleFields(flightId, {
      saga_schedule_sync_status: "skipped",
      saga_schedule_synced_at: nowIso(),
      saga_schedule_error: null,
      saga_schedule_log_json: truncateSagaScheduleLog([entry]),
    });
    return { ...baseResult, ok: true, skipped: true, status: "skipped", message: entry.message };
  }

  if (mode === "upsert" && !sagaScheduleId && !allowCreate) {
    const entry = sagaScheduleLogEntry({ mode, status: "skipped", message: "Voo antigo ou ja existente sem ID SAGA; criacao remota ignorada." });
    logs.push(entry.message);
    await safeUpdateFlightSagaScheduleFields(flightId, {
      saga_schedule_sync_status: "skipped",
      saga_schedule_synced_at: nowIso(),
      saga_schedule_error: null,
      saga_schedule_log_json: truncateSagaScheduleLog([entry]),
    });
    return { ...baseResult, ok: true, skipped: true, status: "skipped", message: entry.message };
  }

  try {
    const ctx = await getFlightCalendarContext(flightId);
    const cookieSession = await loadSagaAuthSession();
    const requestPayload = sagaScheduleSummaryPayload(ctx, mapping, payload);
    baseResult.requestPayload = requestPayload;
    const path = mode === "cancel"
      ? `/schedules/management/${encodeURIComponent(sagaScheduleId)}`
      : sagaScheduleId
        ? `/schedules/management/${encodeURIComponent(sagaScheduleId)}`
        : "/schedules/management";
    const bodyPayload = mode === "cancel"
      ? undefined
      : {
          ...(sagaScheduleId ? { schedule_id: sagaScheduleId, event_id: "" } : {}),
          ...requestPayload,
        };
    const sagaResult = await sagaScheduleRequest(
      path,
      {
        method: mode === "cancel" ? "DELETE" : sagaScheduleId ? "PUT" : "POST",
        ...(bodyPayload ? { body: JSON.stringify(bodyPayload) } : {}),
      },
      cookieSession.cookieJar,
    );
    const nextSagaScheduleId = cleanString(sagaResult.data?.schedule?.id) || sagaScheduleId || null;
    const status = mode === "cancel" ? "cancelled" : "synced";
    const message = mode === "cancel"
      ? `Evento SAGA ${nextSagaScheduleId || sagaScheduleId} removido.`
      : sagaScheduleId
        ? `Evento SAGA ${nextSagaScheduleId} atualizado.`
        : `Evento SAGA ${nextSagaScheduleId} criado.`;
    const entry = sagaScheduleLogEntry({
      mode,
      status,
      message,
      endpoint: sagaResult.endpoint,
      httpStatus: sagaResult.httpStatus,
      sagaScheduleId: nextSagaScheduleId,
      requestPayload: bodyPayload || null,
    });
    logs.push(message);
    await safeUpdateFlightSagaScheduleFields(flightId, {
      saga_schedule_id: nextSagaScheduleId,
      saga_schedule_sync_status: status,
      saga_schedule_synced_at: nowIso(),
      saga_schedule_error: null,
      saga_schedule_log_json: truncateSagaScheduleLog([entry]),
    });
    return {
      ...baseResult,
      ok: true,
      status,
      message,
      sagaScheduleId: nextSagaScheduleId,
      httpStatus: sagaResult.httpStatus,
      endpoint: sagaResult.endpoint,
      requestPayload: bodyPayload || null,
      response: sagaResult.data,
    };
  } catch (err) {
    const message = String(err?.message || err);
    const entry = sagaScheduleLogEntry({
      mode,
      status: "failed",
      message,
      endpoint: err?.endpoint || null,
      httpStatus: err?.status || null,
      requestPayload: baseResult.requestPayload,
      response: err?.sagaResponse || null,
    });
    logs.push(message);
    await safeUpdateFlightSagaScheduleFields(flightId, {
      saga_schedule_sync_status: "failed",
      saga_schedule_synced_at: nowIso(),
      saga_schedule_error: message.slice(0, 1024),
      saga_schedule_log_json: truncateSagaScheduleLog([entry]),
    });
    return {
      ...baseResult,
      ok: false,
      status: "failed",
      message,
      httpStatus: err?.status || null,
      endpoint: err?.endpoint || null,
      requestPayload: baseResult.requestPayload,
      response: err?.sagaResponse || null,
    };
  }
}

// ─── Escala somente no SAGA (saga-only) ───────────────────────────────────────
// Ações usadas quando a escola opta por não salvar a escala no sistema: a agenda
// do SAGA é lida/editada diretamente, sem criar documentos de voo locais.
// Sem actorUserId a chamada veio de outra function via API key (schedule-booking),
// que já validou as regras da escala — mesmo padrão de syncSagaScheduleEvent.

function normalizeSagaUserKey(value) {
  const raw = cleanString(value);
  const numeric = raw.match(/^saga[_-]?(\d+)$/i)?.[1];
  return numeric || raw;
}

// Resolve aluno/instrutor dos eventos SAGA para usuários locais. Todo aluno e
// instrutor existem nos dois sistemas: perfil com saga_user_id ou (fallback)
// user_id no padrão "saga_<id>". Instrutor com id SAGA "0" significa sem instrutor.
async function attachLocalUsersToSagaSchedules(schedules) {
  const rows = Array.isArray(schedules) ? schedules : [];
  const sagaIds = Array.from(new Set(
    rows
      .flatMap((row) => [cleanString(row.studentSagaId), cleanString(row.instructorSagaId)])
      .filter((id) => id && id !== "0"),
  ));
  if (!sagaIds.length || !PROFILES_COLLECTION_ID) return rows;

  const localBySagaId = new Map();
  const profileKeys = Array.from(new Set(sagaIds.flatMap((id) => [id, `saga_${id}`])));
  const profiles = await listDocumentsByFieldIn(
    PROFILES_COLLECTION_ID,
    "saga_user_id",
    profileKeys,
    [...selectQuery(["user_id", "full_name", "saga_user_id"])],
  ).catch(() => []);
  for (const profile of profiles) {
    const key = normalizeSagaUserKey(profile.saga_user_id);
    if (key && cleanString(profile.user_id) && !localBySagaId.has(key)) {
      localBySagaId.set(key, { userId: cleanString(profile.user_id), name: cleanString(profile.full_name) });
    }
  }

  const missing = sagaIds.filter((id) => !localBySagaId.has(id));
  if (missing.length) {
    const fallbackProfiles = await listDocumentsByFieldIn(
      PROFILES_COLLECTION_ID,
      "user_id",
      missing.map((id) => `saga_${id}`),
      [...selectQuery(["user_id", "full_name"])],
    ).catch(() => []);
    for (const profile of fallbackProfiles) {
      const numeric = cleanString(profile.user_id).match(/^saga_(\d+)$/i)?.[1];
      if (numeric && !localBySagaId.has(numeric)) {
        localBySagaId.set(numeric, { userId: cleanString(profile.user_id), name: cleanString(profile.full_name) });
      }
    }
  }

  return rows.map((row) => {
    const studentSagaId = cleanString(row.studentSagaId);
    const rawInstructorSagaId = cleanString(row.instructorSagaId);
    const instructorSagaId = rawInstructorSagaId === "0" ? "" : rawInstructorSagaId;
    const student = studentSagaId ? localBySagaId.get(studentSagaId) || null : null;
    const instructor = instructorSagaId ? localBySagaId.get(instructorSagaId) || null : null;
    return {
      ...row,
      instructorSagaId,
      studentUserId: student?.userId || "",
      instructorUserId: instructor?.userId || "",
      studentName: cleanString(row.studentName) || student?.name || "",
      instructorName: instructorSagaId ? cleanString(row.instructorName) || instructor?.name || "" : "",
    };
  });
}

/**
 * De-para de aeronave para eventos da AGENDA: o nome vem cru (ex.: "GROUND"),
 * enquanto as chaves do aircraftBySaga usam "MODELO / MATRÍCULA". Resolve por:
 * 1) ID SAGA da aeronave (aircraftIdByRegistration invertido);
 * 2) segmento da chave do de-para; 3) catálogo local por matrícula normalizada.
 */
function resolveScheduleAircraftIdent(row, mapping, catalogs) {
  const sagaName = cleanString(row.aircraft);
  if (sagaName) {
    const direct = cleanString(mapping.aircraftBySaga?.[sagaName]);
    if (direct) return direct;
    const normalized = normalizeAircraftIdent(sagaName);
    if (normalized) {
      for (const [key, ident] of Object.entries(mapping.aircraftBySaga || {})) {
        const segments = String(key).split("/").map((part) => normalizeAircraftIdent(part));
        if (segments.includes(normalized)) return cleanString(ident);
      }
    }
  }
  const sagaId = cleanString(row.aircraftSagaId);
  if (sagaId) {
    for (const [registration, mappedId] of Object.entries(mapping.aircraftIdByRegistration || {})) {
      if (cleanString(mappedId) !== sagaId) continue;
      const normalized = normalizeAircraftIdent(registration);
      const catalogMatch = (catalogs?.aircrafts || []).find((aircraft) => normalizeAircraftIdent(aircraft.registration) === normalized);
      return cleanString(catalogMatch?.registration) || cleanString(registration);
    }
  }
  return resolveSagaScheduleAircraft(row, mapping, catalogs);
}

async function sagaListSchedulesDirect(actorUserId, payload = {}) {
  if (actorUserId) await requireInstructorOrAdmin(actorUserId);
  const monthCount = Math.min(6, Math.max(1, Number(payload.monthCount) || 3));
  const logs = [];
  const { cookieJar } = await loadSagaAuthSession();
  const schedules = await fetchSagaScheduledFlights(cookieJar, logs, {
    skipFutureFilter: true,
    monthCount,
  });
  // O campo raw é grande e desnecessário para exibição da escala.
  const slim = schedules.map(({ raw, ...rest }) => rest);
  // De-para de aeronave: o nome do SAGA (ex.: "GROUND") vira a matrícula local,
  // evitando cards/colunas duplicados na escala.
  const [mapping, catalogs] = await Promise.all([
    loadSagaImportMapping().catch(() => ({ aircraftBySaga: {} })),
    listSagaImportCatalogs().catch(() => ({ aircrafts: [] })),
  ]);
  const mapped = slim.map((row) => {
    const ident = resolveScheduleAircraftIdent(row, mapping, catalogs);
    return ident ? { ...row, aircraft: ident } : row;
  });
  const enriched = await attachLocalUsersToSagaSchedules(mapped);
  return { ok: true, schedules: enriched, logs };
}

function sagaDirectScheduleDateTimes(date, startTime, durationMinutes) {
  const safeDate = cleanString(date);
  const start = cleanString(startTime).slice(0, 5);
  const [hh, mm] = start.split(":").map(Number);
  const duration = Math.max(15, Math.round(Number(durationMinutes) || 0));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safeDate) || !Number.isFinite(hh) || !Number.isFinite(mm)) {
    throw Object.assign(new Error("Data ou horario invalido para o evento SAGA."), { status: 422 });
  }
  const endBase = new Date(`${safeDate}T12:00:00`);
  const totalEndMinutes = hh * 60 + mm + duration;
  endBase.setDate(endBase.getDate() + Math.floor(totalEndMinutes / 1440));
  const endMinutesInDay = ((totalEndMinutes % 1440) + 1440) % 1440;
  const endDate = endBase.toISOString().slice(0, 10);
  const endTime = `${String(Math.floor(endMinutesInDay / 60)).padStart(2, "0")}:${String(endMinutesInDay % 60).padStart(2, "0")}`;
  return { startAt: `${safeDate}T${start}`, endAt: `${endDate}T${endTime}` };
}

async function sagaUpsertScheduleDirect(actorUserId, payload = {}) {
  if (actorUserId) await requireInstructorOrAdmin(actorUserId);
  const mapping = await loadSagaImportMapping();
  const scheduleId = cleanString(payload.scheduleId);
  const aircraftIdent = normalizeAircraftIdent(payload.aircraftIdent);
  const aircraftId = resolveSagaScheduleAircraftId(payload.aircraftIdent, mapping);
  if (!aircraftId) {
    throw Object.assign(new Error(`ID SAGA da aeronave ${aircraftIdent || "informada"} nao encontrado no de-para.`), { status: 422 });
  }

  let studentSagaId = cleanString(payload.studentSagaId);
  let studentName = cleanString(payload.studentName);
  if (!studentSagaId) {
    const studentUserId = cleanString(payload.studentUserId);
    if (!studentUserId) throw Object.assign(new Error("Aluno nao informado."), { status: 400 });
    const profile = await getProfileByUserId(studentUserId).catch(() => null);
    studentSagaId = cleanString(profile?.saga_user_id);
    studentName = studentName || cleanString(profile?.full_name);
    if (!studentSagaId) {
      throw Object.assign(new Error(`ID SAGA do aluno ${studentName || studentUserId} nao encontrado no perfil.`), { status: 422 });
    }
  }

  let instructorSagaId = cleanString(payload.instructorSagaId);
  let instructorName = cleanString(payload.instructorName);
  const instructorUserId = cleanString(payload.instructorUserId);
  if (!instructorSagaId && instructorUserId) {
    const instructorProfile = await getProfileByUserId(instructorUserId).catch(() => null);
    instructorSagaId = cleanString(instructorProfile?.saga_user_id);
    instructorName = instructorName || cleanString(instructorProfile?.full_name);
    if (!instructorSagaId) {
      throw Object.assign(new Error(`ID SAGA do instrutor ${instructorName || instructorUserId} nao encontrado no perfil.`), { status: 422 });
    }
  }

  const requestedStatus = cleanString(payload.sagaStatus).toUpperCase();
  const sagaStatus = ["PLANNED", "PENDING", "CONFIRMED", "CANCELED"].includes(requestedStatus) ? requestedStatus : "PLANNED";

  const { startAt, endAt } = sagaDirectScheduleDateTimes(payload.date, payload.startTime, payload.durationMinutes);
  // rawNotes substitui o texto inteiro (usado p/ preservar notas existentes em alteração/cancelamento).
  const notes = Object.prototype.hasOwnProperty.call(payload, "rawNotes")
    ? cleanString(payload.rawNotes)
    : [
        "GFV escala",
        studentName ? `Aluno: ${studentName}` : "",
        instructorName ? `Instrutor: ${instructorName}` : "",
        aircraftIdent ? `Aeronave: ${aircraftIdent}` : "",
        cleanString(payload.notes),
      ].filter(Boolean).join(" | ");

  const requestPayload = {
    aircraft_id: aircraftId,
    student_id: studentSagaId,
    // "0" = sem instrutor no SAGA — eventos criados sem instrutor nunca herdam o aluno.
    instructor_id: instructorSagaId || "0",
    start_at: startAt,
    end_at: endAt,
    status: sagaStatus,
    notes: notes.slice(0, 255),
  };

  const { cookieJar } = await loadSagaAuthSession();
  const path = scheduleId ? `/schedules/management/${encodeURIComponent(scheduleId)}` : "/schedules/management";
  const result = await sagaScheduleRequest(
    path,
    {
      method: scheduleId ? "PUT" : "POST",
      body: JSON.stringify({ ...(scheduleId ? { schedule_id: scheduleId, event_id: "" } : {}), ...requestPayload }),
    },
    cookieJar,
  );
  const nextScheduleId = cleanString(result.data?.schedule?.id) || scheduleId || null;
  return {
    ok: true,
    scheduleId: nextScheduleId,
    created: !scheduleId,
    message: scheduleId ? `Evento SAGA ${nextScheduleId} atualizado.` : `Evento SAGA ${nextScheduleId} criado.`,
    httpStatus: result.httpStatus,
    endpoint: result.endpoint,
  };
}

async function sagaCancelScheduleDirect(actorUserId, payload = {}) {
  if (actorUserId) await requireInstructorOrAdmin(actorUserId);
  const scheduleId = cleanString(payload.scheduleId);
  if (!scheduleId) throw Object.assign(new Error("Evento SAGA nao informado."), { status: 400 });
  const { cookieJar } = await loadSagaAuthSession();
  const result = await sagaScheduleRequest(
    `/schedules/management/${encodeURIComponent(scheduleId)}`,
    { method: "DELETE" },
    cookieJar,
  );
  return {
    ok: true,
    scheduleId,
    message: `Evento SAGA ${scheduleId} removido.`,
    httpStatus: result.httpStatus,
    endpoint: result.endpoint,
  };
}

function sagaScheduleFingerprint(schedule, usersBySagaId, mapping, catalogs) {
  const studentUserId =
    usersBySagaId.get(cleanString(schedule.studentSagaId)) ||
    usersBySagaId.get(cleanString(schedule.instructorSagaId)) ||
    "";
  const aircraftIdent = resolveSagaScheduleAircraft(schedule, mapping, catalogs) || "";
  const start = sagaLocalDateTimeParts(schedule.startAtRaw || schedule.startAt);
  return `${studentUserId}|${start.date}|${start.time}|${normalizeAircraftIdent(aircraftIdent)}`;
}

function flightScheduleFingerprint(flight) {
  const studentUserId = cleanString(flight.student_user_id || flight.user_id);
  const date = cleanString(flight.flight_date);
  const time = cleanString(flight.start_time).slice(0, 5);
  const aircraft = normalizeAircraftIdent(cleanString(flight.aircraft_ident));
  if (!studentUserId || !date || !time || !aircraft) return "";
  return `${studentUserId}|${date}|${time}|${aircraft}`;
}

function scheduleLooksLinkedToSagaFromLocalSync(flight, scheduleId) {
  const schedule = cleanString(scheduleId);
  if (!schedule) return false;
  const directScheduleId = cleanString(flight?.saga_schedule_id);
  if (directScheduleId && directScheduleId === schedule) return true;
  const sagaFlightId = cleanString(flight?.saga_flight_id);
  if (!sagaFlightId) return false;
  return new RegExp(`(?:^|:)schedule:${schedule}(?:$|:)`, "i").test(sagaFlightId);
}

async function syncSagaScheduleFromImportSettings(actorUserId = "system", options = {}) {
  const mapping = await loadSagaImportMapping();
  const forceRun = options.force === true;
  if (!forceRun && mapping.syncScheduleFromSaga !== true) {
    return { ok: true, skipped: true, message: "Sync de escala SAGA desativado nas configuracoes." };
  }
  const credentials = await loadSagaImportCredentials();
  if (!credentials.email || !credentials.password) {
    return { ok: false, skipped: true, message: "Credenciais SAGA ausentes para sync automatico da escala." };
  }
  const catalogs = await listSagaImportCatalogs();
  const logs = [];
  const cookieJar = await sagaLoginSession(credentials.email, credentials.password, logs);
  const apiV2Token = await sagaApiV2Login(credentials.email, credentials.password, logs).catch(() => "");
  const schedules = await fetchSagaScheduledFlights(cookieJar, logs);
  const sagaUsersById = await fetchSagaUsersTableFromSession(cookieJar, logs);
  const profiles = await safeListAllDocuments(PROFILES_COLLECTION_ID, [
    sdk.Query.equal("school_id", [SCHOOL_ID]),
    ...selectQuery(["$id", "user_id", "saga_user_id"]),
  ]);
  const usersBySagaId = new Map(
    profiles
      .map((profile) => [cleanString(profile.saga_user_id), cleanString(profile.user_id)])
      .filter(([sagaId, userId]) => sagaId && userId),
  );
  const fingerprints = new Set();
  const createdOrUpdated = [];
  const importedUsers = { students: 0, instructors: 0 };
  for (const schedule of schedules) {
    const scheduleId = cleanString(schedule.id);
    if (!scheduleId) continue;
    if (fingerprints.has(scheduleId)) continue;
    fingerprints.add(scheduleId);
    const studentSagaId = cleanString(schedule.studentSagaId);
    const instructorSagaId = cleanString(schedule.instructorSagaId);
    if (studentSagaId && !usersBySagaId.get(studentSagaId)) {
      const imported = await ensureSagaScheduleUserImported(studentSagaId, "aluno", {
        usersBySagaId,
        sagaUsersById,
        cookieJar,
        apiV2Token,
      });
      if (imported.userId && !imported.skipped) importedUsers.students += 1;
    }
    if (instructorSagaId && !usersBySagaId.get(instructorSagaId)) {
      const imported = await ensureSagaScheduleUserImported(instructorSagaId, "instrutor", {
        usersBySagaId,
        sagaUsersById,
        cookieJar,
        apiV2Token,
      });
      if (imported.userId && !imported.skipped) importedUsers.instructors += 1;
    }

    const fingerprint = sagaScheduleFingerprint(schedule, usersBySagaId, mapping, catalogs);
    const sameDayFlights = await databases.listDocuments(DATABASE_ID, FLIGHTS_COLLECTION_ID, [
      sdk.Query.equal("school_id", [SCHOOL_ID]),
      sdk.Query.equal("flight_status", ["Pendente", "Confirmado", "Previsto"]),
      sdk.Query.equal("flight_date", [sagaLocalDateTimeParts(schedule.startAtRaw || schedule.startAt).date]),
      sdk.Query.limit(200),
    ]).catch(() => ({ documents: [] }));
    const existingBySagaId = (sameDayFlights.documents || []).find((doc) => scheduleLooksLinkedToSagaFromLocalSync(doc, scheduleId));
    if (existingBySagaId) {
      const result = await importSagaScheduledFlight(schedule, mapping, catalogs, usersBySagaId, { testMode: false });
      createdOrUpdated.push(result);
      continue;
    }
    if (fingerprint) {
      const duplicatedDoc = (sameDayFlights.documents || []).find((doc) => flightScheduleFingerprint(doc) === fingerprint);
      if (duplicatedDoc) {
        if (!sagaScheduleIsCancelledStatus(schedule.status)) continue;
        const result = await importSagaScheduledFlight(schedule, mapping, catalogs, usersBySagaId, { testMode: false, existingDocId: duplicatedDoc.$id });
        createdOrUpdated.push(result);
        continue;
      }
    }
    const result = await importSagaScheduledFlight(schedule, mapping, catalogs, usersBySagaId, { testMode: false });
    createdOrUpdated.push(result);
  }
  return {
    ok: true,
    skipped: false,
    forced: forceRun,
    imported: createdOrUpdated.filter((item) => item.created).length,
    updated: createdOrUpdated.filter((item) => item.updated).length,
    importedUsers,
    logs,
  };
}

async function sagaImportAllUsersFromSaga(actorUserId = "system", options = {}) {
  const mapping = await loadSagaImportMapping();
  const forceRun = options.force === true;
  const flightsOnly = options.flightsOnly === true;
  const windowDays = flightsOnly ? 365 : 7;
  const origin = cleanString(options.origin) || (actorUserId === "system" ? "cron" : "manual");
  const minIntervalMs = 55 * 60 * 1000;
  const nowMs = Date.now();
  if (!forceRun && mapping.syncAllUsersFromSaga !== true) {
    return { ok: true, skipped: true, message: "Sync geral SAGA desativado nas configuracoes.", logs: [] };
  }
  if (!forceRun) {
    const lastRun = await loadSagaAllUsersLastRunState();
    const lastRunMs = lastRun?.lastRunAt ? Date.parse(lastRun.lastRunAt) : 0;
    if (Number.isFinite(lastRunMs) && lastRunMs > 0) {
      const elapsed = Math.max(0, nowMs - lastRunMs);
      if (elapsed < minIntervalMs) {
        const waitMinutes = Math.ceil((minIntervalMs - elapsed) / 60000);
        return {
          ok: true,
          skipped: true,
          message: `Sync geral executado recentemente; proxima execucao em ~${waitMinutes} min.`,
          logs: [],
        };
      }
    }
  }
  const credentials = await loadSagaImportCredentials();
  if (!credentials.email || !credentials.password) {
    return { ok: false, skipped: true, message: "Credenciais SAGA ausentes para sync geral.", logs: [] };
  }

  const logs = [];
  const startedAt = nowIso();
  const importRunId = cleanString(options.importRunId) || `saga-sync-all-${Date.now()}`;
  await saveSagaImportProgress({
    runId: importRunId,
    status: "running",
    stage: "Preparando sincronizacao",
    message: `Conectando ao SAGA e carregando a janela dos ultimos ${windowDays} dias.`,
    current: 0,
    total: 1,
    logs: [],
  }).catch(() => null);
  const result = await sagaFetchUsers({
    email: credentials.email,
    password: credentials.password,
    sendFlightsToSaga: mapping.sendFlightsToSaga === true,
    operationsDays: windowDays,
    skipCreditPreview: true,
    skipSchedulePreview: true,
  });
  logs.push(...(Array.isArray(result.logs) ? result.logs : []));

  let usersToImport = result.users || [];
  let flightsToImport = result.flights || [];
  if (flightsOnly) {
    const allGroups = groupSagaFlightsById(Array.isArray(result.flights) ? result.flights : []);
    const allDocIds = allGroups.map((group) => sagaDocId("saga_flight", group.key));
    const existingIds = new Set();
    const batchSize = 100;
    for (let index = 0; index < allDocIds.length; index += batchSize) {
      const chunk = allDocIds.slice(index, index + batchSize);
      if (!chunk.length) continue;
      const found = await databases.listDocuments(DATABASE_ID, FLIGHTS_COLLECTION_ID, [
        sdk.Query.equal("$id", chunk),
        sdk.Query.select(["$id"]),
        sdk.Query.limit(chunk.length),
      ]).catch(() => ({ documents: [] }));
      for (const document of found.documents || []) existingIds.add(cleanString(document.$id));
    }
    const newGroups = allGroups.filter((group) => !existingIds.has(sagaDocId("saga_flight", group.key)));
    const participantCanacs = new Set();
    for (const group of newGroups) {
      for (const leg of group.legs || []) {
        const studentCanac = cleanString(leg.canacAluno);
        const instructorCanac = cleanString(leg.canacInstrutor);
        if (studentCanac) participantCanacs.add(studentCanac);
        if (instructorCanac) participantCanacs.add(instructorCanac);
      }
    }
    flightsToImport = newGroups.flatMap((group) => group.legs || []);
    usersToImport = (result.users || []).filter((user) => participantCanacs.has(cleanString(user.codigoAnac)));
    logs.push(
      `Sync somente voos: ${newGroups.length}/${allGroups.length} voo(s) novo(s); ${usersToImport.length} participante(s) elegiveis para criacao se ausentes.`,
    );
  }

  const scope = {
    users: true,
    pastFlights: true,
    schedule: false,
    credits: !flightsOnly,
  };
  const summaryResult = await sagaImportData(
    {
      users: usersToImport,
      flights: flightsToImport,
      financialEntries: flightsOnly ? [] : (result.financialEntries || []),
      mapping,
      scope,
      testMode: false,
      useEmailAlias: false,
      email: credentials.email,
      password: credentials.password,
      importRunId,
      immutableSync: true,
      syncWindowDays: windowDays,
    },
    actorUserId,
    null,
  );

  const summary = summaryResult?.summary || {};
  const operationsRange = sagaDateRangeDays(windowDays);
  const flightGroups = groupSagaFlightsById(Array.isArray(result.flights) ? result.flights : []);
  const staleCleanup = await purgeMissingSagaImportedFlightsForActor("system", flightGroups, operationsRange, logs);
  summary.flightsDeleted = staleCleanup.deletedFlights.length;
  summary.deletedFlights = staleCleanup.deletedFlights;
  summary.staleCleanup = staleCleanup.diagnostics;
  await saveSagaImportLastSummary(compactSagaImportSummary(summary)).catch(() => null);
  await saveSagaImportProgress({
    runId: importRunId,
    status: summaryResult?.ok === false ? "failed" : "completed",
    stage: summaryResult?.ok === false ? "Falha" : "Concluido",
    message: summaryResult?.ok === false
      ? (summaryResult?.message || "A sincronizacao geral falhou.")
      : flightsOnly
        ? `Concluido: ${Number(summary.flightsCreated) || 0} voos criados, ${Number(summary.usersCreated) || 0} usuarios necessarios criados e ${Number(summary.flightsDeleted) || 0} voos removidos.`
        : `Concluido: ${Number(summary.usersCreated) || 0} usuarios, ${Number(summary.flightsCreated) || 0} voos e ${Number(summary.creditsCreated) || 0} creditos criados; ${Number(summary.flightsDeleted) || 0} voos removidos.`,
    current: 1,
    total: 1,
    logs: [...logs.slice(-4), ...(Array.isArray(summary.logs) ? summary.logs.slice(-4) : [])],
  }).catch(() => null);
  const summaryLogs = Array.isArray(summary.logs) ? summary.logs.slice(-40) : [];
  await saveSagaAllUsersLastRunState({
    lastRunAt: nowIso(),
    status: summaryResult?.ok === false ? "failed" : "completed",
    message: summaryResult?.message || "",
  }).catch(() => null);
  await saveSagaSyncHistoryEntry({
    runId: importRunId,
    origin,
    status: summaryResult?.ok === false ? "failed" : "completed",
    startedAt,
    completedAt: nowIso(),
    windowDays,
    usersCreated: summary.usersCreated,
    usersSkipped: summary.usersSkipped,
    flightsCreated: summary.flightsCreated,
    flightsDeleted: summary.flightsDeleted,
    flightsSkipped: summary.flightsSkipped,
    creditsCreated: summary.creditsCreated,
    creditsSkipped: summary.creditsSkipped,
    message: summaryResult?.message || "",
  }).catch(() => null);
  return {
    ok: summaryResult?.ok !== false,
    skipped: false,
    forced: forceRun,
    importRunId,
    origin,
    flightsOnly,
    message: summaryResult?.message || "",
    usersCreated: Number(summary.usersCreated) || 0,
    usersSkipped: Number(summary.usersSkipped) || 0,
    flightsCreated: Number(summary.flightsCreated) || 0,
    flightsUpdated: Number(summary.flightsUpdated) || 0,
    flightsDeleted: Number(summary.flightsDeleted) || 0,
    flightsSkipped: Number(summary.flightsSkipped) || 0,
    creditsCreated: Number(summary.creditsCreated) || 0,
    creditsUpdated: Number(summary.creditsUpdated) || 0,
    creditsSkipped: Number(summary.creditsSkipped) || 0,
    logs: [...logs.slice(-20), ...summaryLogs],
  };
}

async function recordSagaAllUsersSyncFailure(input = {}, err) {
  const runId = cleanString(input.importRunId) || `saga-sync-all-failed-${Date.now()}`;
  const message = cleanString(err?.message || err || "Falha desconhecida na sincronizacao geral.");
  await saveSagaImportProgress({
    runId,
    status: "failed",
    stage: "Falha",
    message,
    current: 0,
    total: 1,
    logs: [],
  }).catch(() => null);
  await saveSagaSyncHistoryEntry({
    runId,
    origin: cleanString(input.origin) || "cron",
    status: "failed",
    startedAt: cleanString(input.startedAt) || nowIso(),
    completedAt: nowIso(),
    windowDays: 7,
    message,
  }).catch(() => null);
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
    sdk.Query.equal("flight_status", ["Pendente", "Confirmado", "Previsto"]),
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
    "cakto.sale_approved": {
      eventType: "cakto.sale_approved",
      data: {
        customerName: "João Silva",
        customerEmail: "joao@example.com",
        amount: 4500,
        currency: "BRL",
        paymentMethod: "PIX",
        productLabel: "Pacote 10h — C152",
        orderId: "ORD-12345",
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

async function sendAutomationHtmlEmail({ email, subject, html }) {
  const { settings } = await loadEmailSettings();
  const apiKey = cleanString(settings.resendApiKey);
  const fromEmail = cleanString(settings.fromEmail);
  if (!settings.enabled) return { status: "skipped", reason: "Email desabilitado." };
  if (!apiKey || !fromEmail) return { status: "skipped", reason: "Resend não configurado." };
  if (!cleanString(email)) return { status: "skipped", reason: "Destinatário sem email." };
  const resend = new Resend(apiKey);
  const fromName = cleanString(settings.fromName);
  const result = await sendResendEmail(() => resend.emails.send({
    from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
    to: [cleanString(email)],
    replyTo: cleanString(settings.replyTo) || undefined,
    subject: cleanString(subject).slice(0, 255),
    html: sanitizeHtml(String(html || "")),
  }));
  if (result?.error) throw Object.assign(new Error(result.error.message || "Falha no Resend."), { status: 502 });
  return { status: "sent", providerMessageId: result?.data?.id || null };
}

async function sendAutomationWpp(input) {
  const messageId = await sendWppTemplateTest(input);
  return { status: "sent", providerMessageId: messageId };
}

let cachedStudentAutomationService = null;
function studentAutomationService() {
  if (cachedStudentAutomationService) return cachedStudentAutomationService;
  cachedStudentAutomationService = createStudentAutomationService({
    sdk,
    databases,
    users,
    functions,
    databaseId: DATABASE_ID,
    schoolId: SCHOOL_ID,
    schoolName: "Escola",
    functionId: ADMIN_USERS_FUNCTION_ID,
    appUrl: APP_URL,
    timezone: process.env.SCHOOL_TIMEZONE || "America/Sao_Paulo",
    adminPerms: ADMIN_DOC_PERMS,
    requireAdmin,
    getStudentsProgress,
    listAdminUserIds,
    sendEmail: sendAutomationHtmlEmail,
    sendPush: sendPushToUser,
    sendWpp: sendAutomationWpp,
    collections: {
      automations: STUDENT_AUTOMATIONS_COLLECTION_ID,
      states: AUTOMATION_STATES_COLLECTION_ID,
      runs: AUTOMATION_RUNS_COLLECTION_ID,
      stepRuns: AUTOMATION_STEP_RUNS_COLLECTION_ID,
      jobs: AUTOMATION_JOBS_COLLECTION_ID,
      templates: AUTOMATION_EMAIL_TEMPLATES_COLLECTION_ID,
      crmStatuses: STUDENT_CRM_STATUSES_COLLECTION_ID,
      crmProfiles: STUDENT_CRM_PROFILES_COLLECTION_ID,
      profiles: PROFILES_COLLECTION_ID,
      flights: FLIGHTS_COLLECTION_ID,
      studentTracks: STUDENT_TRACKS_COLLECTION_ID,
      credits: STUDENT_CREDITS_COLLECTION_ID,
      pushSubscriptions: PUSH_SUBSCRIPTIONS_COLLECTION_ID,
      instructorStudents: INSTRUCTOR_STUDENTS_COLLECTION_ID,
    },
  });
  return cachedStudentAutomationService;
}

async function loadSchoolInstructorAnacs() {
  const profiles = await safeListAllDocuments(PROFILES_COLLECTION_ID, [
    sdk.Query.equal("school_id", [SCHOOL_ID]),
    ...selectQuery(["$id", "user_id", "anac_code", "role", "roles", "active_role"]),
  ]);
  const anacs = new Set();
  const userIds = new Set();
  for (const profile of profiles) {
    const { roles } = parseProfileRoles(profile);
    if (!roles.includes("instrutor")) continue;
    const anac = cleanString(profile.anac_code);
    const userId = cleanString(profile.user_id);
    if (anac) anacs.add(anac);
    if (userId) userIds.add(userId);
  }
  return { anacs, userIds };
}

async function sagaImportSelfFlights(actorUserId, runtimeLog, importRunId = null, options = {}) {
  const logLine = (msg) => { if (typeof runtimeLog === "function") runtimeLog(msg); };
  if (!actorUserId) throw Object.assign(new Error("Autenticacao necessaria."), { status: 401 });

  const allInstructors = options.allInstructors === true;
  const operationsDays = Number(options.operationsDays) > 0 ? Number(options.operationsDays) : (allInstructors ? 7 : 30);
  if (allInstructors) await requireAdmin(actorUserId);

  const runId = importRunId || crypto.randomUUID();
  await saveSagaImportProgress({ runId, status: "running", stage: "login", message: "Conectando ao SAGA...", current: 0, total: 0, logs: [] });

  let anac = "";
  let instructorAnacs = null;
  let instructorUserIds = null;
  if (allInstructors) {
    const instructors = await loadSchoolInstructorAnacs();
    instructorAnacs = instructors.anacs;
    instructorUserIds = instructors.userIds;
    if (!instructorAnacs.size) {
      throw Object.assign(new Error("Nenhum instrutor com codigo ANAC encontrado na escola."), { status: 400 });
    }
  } else {
    const profile = await getProfileByUserId(actorUserId);
    anac = cleanString(profile?.anac_code);
    if (!anac) throw Object.assign(new Error("Codigo ANAC nao encontrado no perfil. Atualize seu cadastro antes de sincronizar."), { status: 400 });
  }

  const { credentials, mapping } = await loadSagaImportSettings();
  if (!credentials.email || !credentials.password) {
    throw Object.assign(new Error("Credenciais SAGA nao configuradas pelo administrador."), { status: 400 });
  }

  logLine(`[sagaImportSelfFlights] ANAC=${anac || "all-instructors"} userId=${actorUserId} days=${operationsDays}`);
  const logs = [];

  const makeSummary = (overrides = {}) => ({
    importRunId: runId, testMode: false, useEmailAlias: false,
    selectedSagaUsers: 0, requestedUsers: 0, requestedFlightGroups: 0, requestedScheduledFlights: 0,
    usersCreated: 0, usersUpdated: 0, usersSkipped: 0,
    flightsCreated: 0, flightsUpdated: 0, flightsDeleted: 0, flightsSkipped: 0, duplicateFlights: 0,
    scheduledFlightsCreated: 0, scheduledFlightsUpdated: 0, scheduledFlightsSkipped: 0,
    trainingAssignmentsTouched: 0, anacSynced: 0, anacPending: 0, anacFailed: 0,
    creditsCreated: 0, creditsUpdated: 0, creditsSkipped: 0, creditHoursImported: 0,
    nightHoursReclassified: 0, nightCreditRecordsCreated: 0,
    deletedFlights: [],
    staleCleanup: {
      totalSchoolDocs: 0,
      actorLinkedDocs: 0,
      candidates: 0,
      deleted: 0,
      failed: 0,
      skippedOutOfRange: 0,
      skippedNoSagaKey: 0,
      skippedPresentInSaga: 0,
      failures: [],
    },
    skippedFlights: [], skippedCredits: [],
    missing: { aircrafts: [], courses: [], students: [], creditAircrafts: [] },
    logs,
    ...overrides,
  });

  const cookieJar = await sagaLoginSession(credentials.email, credentials.password, logs);
  await saveSagaImportProgress({ runId, status: "running", stage: "fetch", message: "Buscando voos no SAGA...", current: 0, total: 0, logs });

  const operationsRange = sagaDateRangeDays(operationsDays);
  const operationsPath = `/reports/operations?start_date=${operationsRange.startDate}&end_date=${operationsRange.endDate}`;
  const operations = await sagaFetch(operationsPath, {
    method: "GET",
    headers: { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", referer: `${SAGA_BASE_URL}/users` },
  }, cookieJar);
  const allFlightRows = translateSagaFlightRows(operations.html);
  const mappedFlightRows = applySagaFlightColumnMap(allFlightRows.rows, mapping.flightColumnMap);

  const myFlightRows = allInstructors
    ? mappedFlightRows.filter((row) => instructorAnacs.has(cleanString(row.canacInstrutor)))
    : mappedFlightRows.filter(
      (row) => cleanString(row.canacAluno) === anac || cleanString(row.canacInstrutor) === anac,
    );
  logs.push(
    allInstructors
      ? `Voos filtrados por instrutores da escola (janela ${operationsDays} dias): ${myFlightRows.length}/${mappedFlightRows.length} voo(s).`
      : `Voos filtrados por ANAC ${anac} (janela ${operationsDays} dias): ${myFlightRows.length}/${mappedFlightRows.length} voo(s).`,
  );
  logLine(`[sagaImportSelfFlights] ${myFlightRows.length} voo(s) filtrados.`);

  await saveSagaImportProgress({ runId, status: "running", stage: "check", message: `${myFlightRows.length} voo(s) encontrado(s), verificando novos...`, current: 0, total: myFlightRows.length, logs });

  const [catalogs, existingProfiles] = await Promise.all([
    listSagaImportCatalogs(),
    safeListAllDocuments(PROFILES_COLLECTION_ID, [
      sdk.Query.equal("school_id", [SCHOOL_ID]),
      ...selectQuery(["$id", "user_id", "anac_code", "saga_user_id"]),
    ]),
  ]);

  const usersByCanac = new Map();
  for (const p of existingProfiles) {
    if (cleanString(p.anac_code) && cleanString(p.user_id)) usersByCanac.set(cleanString(p.anac_code), cleanString(p.user_id));
  }

  const groups = groupSagaFlightsById(myFlightRows);
  logs.push(`Grupos de voos: ${groups.length}.`);

  // Batch-check which flights already exist in Appwrite — only import new ones
  const allDocIds = groups.map((g) => sagaDocId("saga_flight", g.key));
  const existingIds = new Set();
  const BATCH = 100;
  for (let i = 0; i < allDocIds.length; i += BATCH) {
    const chunk = allDocIds.slice(i, i + BATCH);
    const found = await databases.listDocuments(DATABASE_ID, FLIGHTS_COLLECTION_ID, [
      sdk.Query.equal("$id", chunk),
      sdk.Query.select(["$id"]),
      sdk.Query.limit(chunk.length),
    ]).catch(() => ({ documents: [] }));
    for (const d of found.documents) existingIds.add(d.$id);
  }

  const newGroups = groups.filter((g) => !existingIds.has(sagaDocId("saga_flight", g.key)));
  const existingGroups = groups.filter((g) => existingIds.has(sagaDocId("saga_flight", g.key)));
  const skippedCount = groups.length - newGroups.length;
  logs.push(`Ja importados: ${skippedCount}. Novos para importar: ${newGroups.length}.`);
  logLine(`[sagaImportSelfFlights] ${newGroups.length} novo(s), ${skippedCount} ja existentes.`);

  const summary = makeSummary({ requestedFlightGroups: groups.length, flightsSkipped: skippedCount });
  const staleCleanup = await purgeMissingSagaImportedFlightsForActor(
    actorUserId,
    groups,
    operationsRange,
    logs,
    allInstructors ? { linkedUserIds: instructorUserIds } : {},
  );
  summary.flightsDeleted = staleCleanup.deletedFlights.length;
  summary.deletedFlights = staleCleanup.deletedFlights;
  summary.staleCleanup = staleCleanup.diagnostics;

  let repairedExisting = 0;
  // Optional repair mode for existing imported flights; disabled by default in self-sync flow.
  const shouldRepairExisting = options?.repairExisting === true;
  if (shouldRepairExisting) {
    for (const group of existingGroups) {
      const repair = await repairExistingSagaFlight(sagaDocId("saga_flight", group.key), logs);
      if (repair.repaired) repairedExisting += 1;
    }
  } else if (existingGroups.length > 0) {
    logs.push(`Voos existentes ignorados para reparo automatico: ${existingGroups.length}.`);
  }
  if (repairedExisting > 0) {
    summary.flightsUpdated += repairedExisting;
    logs.push(`Voos SAGA existentes reparados: ${repairedExisting}.`);
  }

  if (!newGroups.length) {
    const message = repairedExisting > 0
      ? `${repairedExisting} voo(s) existente(s) reparado(s). ${summary.flightsDeleted} removido(s) por nao existir(em) mais no SAGA.`
      : summary.flightsDeleted > 0
        ? `${summary.flightsDeleted} voo(s) removido(s) localmente por terem sido apagados no SAGA.`
        : "Todos os voos ja estao importados.";
    await saveSagaImportProgress({ runId, status: "completed", stage: "done", message, current: 0, total: 0, logs });
    await saveSagaImportLastSummary(compactSagaImportSummary(summary)).catch(() => null);
    return { ok: true, summary };
  }

  await saveSagaImportProgress({ runId, status: "running", stage: "import", message: `${newGroups.length} voo(s) novo(s) para importar`, current: 0, total: newGroups.length, logs });

  for (let i = 0; i < newGroups.length; i++) {
    const group = newGroups[i];
    const result = await importSagaFlightGroup(group, mapping, catalogs, usersByCanac, { testMode: false, cookieJar, logs });
    if (result.created) {
      summary.flightsCreated += 1;
    } else if (result.updated) {
      summary.flightsUpdated += 1;
    } else if (result.skipped) {
      summary.flightsSkipped += 1;
      if (result.reason && result.reason !== "already_exists") {
        summary.skippedFlights.push({ id: result.id, date: result.date, student: result.student, aircraft: result.aircraft, course: result.course, reason: result.reason });
        if (result.reason === "missing_aircraft_mapping") summary.missing.aircrafts.push(result.aircraft);
        if (result.reason === "missing_course_mapping") summary.missing.courses.push(result.course);
        if (result.reason === "missing_student") summary.missing.students.push(result.student);
      }
    }
    await saveSagaImportProgress({ runId, status: "running", stage: "import", message: `Importando voo ${i + 1} de ${newGroups.length}...`, current: i + 1, total: newGroups.length, logs });
  }

  summary.missing.aircrafts = [...new Set(summary.missing.aircrafts.filter(Boolean))];
  summary.missing.courses = [...new Set(summary.missing.courses.filter(Boolean))];
  summary.missing.students = [...new Set(summary.missing.students.filter(Boolean))];
  logs.push(`Voos: ${summary.flightsCreated} criados, ${summary.flightsUpdated} atualizados, ${summary.flightsDeleted} removidos, ${summary.flightsSkipped} ignorados.`);
  logLine(`[sagaImportSelfFlights] ${summary.flightsCreated} criados, ${summary.flightsUpdated} atualizados, ${summary.flightsDeleted} removidos, ${summary.flightsSkipped} ignorados.`);

  await saveSagaImportProgress({
    runId,
    status: "completed",
    stage: "done",
    message: `Concluido: ${summary.flightsCreated} novo(s), ${summary.flightsUpdated} atualizado(s), ${summary.flightsDeleted} removido(s).`,
    current: newGroups.length,
    total: newGroups.length,
    logs,
  });
  await saveSagaImportLastSummary(compactSagaImportSummary(summary)).catch(() => null);
  return { ok: true, summary };
}

async function purgeMissingSagaImportedFlightsForActor(actorUserId, groups, operationsRange, logs = [], options = {}) {
  const linkedUserIds = options.linkedUserIds instanceof Set ? options.linkedUserIds : null;
  const sagaKeysPresent = new Set((groups || []).map((group) => cleanString(group?.key)).filter(Boolean));
  const startDate = cleanString(operationsRange?.startDate);
  const endDate = cleanString(operationsRange?.endDate);
  const diagnostics = {
    totalSchoolDocs: 0,
    actorLinkedDocs: 0,
    candidates: 0,
    deleted: 0,
    failed: 0,
    skippedOutOfRange: 0,
    skippedNoSagaKey: 0,
    skippedPresentInSaga: 0,
    failures: [],
  };
  const inRange = (value) => {
    const date = cleanString(value).slice(0, 10);
    if (!date) return false;
    if (startDate && date < startDate) return false;
    if (endDate && date > endDate) return false;
    return true;
  };
  const schoolDocs = await safeListAllDocuments(FLIGHTS_COLLECTION_ID, [
    sdk.Query.equal("school_id", [SCHOOL_ID]),
    ...selectQuery(["$id", "flight_date", "student_user_id", "user_id", "instructor_user_id", "saga_flight_id"]),
  ]);
  diagnostics.totalSchoolDocs = schoolDocs.length;
  const docs = schoolDocs.filter((doc) => {
    if (actorUserId === "system" && !linkedUserIds) return true;
    const studentUserId = cleanString(doc?.student_user_id || doc?.user_id);
    const legacyUserId = cleanString(doc?.user_id);
    const instructorUserId = cleanString(doc?.instructor_user_id);
    if (linkedUserIds) {
      return (studentUserId && linkedUserIds.has(studentUserId))
        || (legacyUserId && linkedUserIds.has(legacyUserId))
        || (instructorUserId && linkedUserIds.has(instructorUserId));
    }
    return studentUserId === actorUserId || legacyUserId === actorUserId || instructorUserId === actorUserId;
  });
  diagnostics.actorLinkedDocs = docs.length;
  const staleDocs = docs.filter((doc) => {
    if (!inRange(doc?.flight_date)) {
      diagnostics.skippedOutOfRange += 1;
      return false;
    }
    const sagaKey = parseSagaGroupKeyFromFlightDoc(doc);
    if (!sagaKey) {
      diagnostics.skippedNoSagaKey += 1;
      return false;
    }
    if (sagaKeysPresent.has(sagaKey)) {
      diagnostics.skippedPresentInSaga += 1;
      return false;
    }
    return true;
  });
  diagnostics.candidates = staleDocs.length;

  logs.push(
    `[saga-sync-cleanup] actor=${actorUserId} escola=${diagnostics.totalSchoolDocs} vinculados=${diagnostics.actorLinkedDocs} ` +
    `candidatos=${diagnostics.candidates} emSAGA=${sagaKeysPresent.size} foraFaixa=${diagnostics.skippedOutOfRange} ` +
    `semSagaKey=${diagnostics.skippedNoSagaKey} presentesNoSAGA=${diagnostics.skippedPresentInSaga}`,
  );

  const deletedFlights = [];
  for (const doc of staleDocs) {
    const flightId = cleanString(doc?.$id);
    if (!flightId) continue;
    try {
      const deletionActorId = actorUserId === "system"
        ? cleanString(doc?.student_user_id || doc?.user_id || doc?.instructor_user_id)
        : actorUserId;
      if (!deletionActorId) throw new Error("Voo SAGA sem usuario vinculado para autorizar a exclusao.");
      await sagaDeleteFlight(deletionActorId, { flightId });
      const sagaFlightId = cleanString(doc?.saga_flight_id);
      deletedFlights.push({
        flightId,
        sagaFlightId,
        reason: "missing_in_saga",
        message: "Voo removido localmente por ter sido apagado no SAGA.",
      });
      diagnostics.deleted += 1;
      logs.push(`Voo removido por exclusao no SAGA: local=${flightId}${sagaFlightId ? ` saga=${sagaFlightId}` : ""}.`);
    } catch (err) {
      const sagaFlightId = cleanString(doc?.saga_flight_id);
      const message = cleanString(err?.message || err);
      diagnostics.failed += 1;
      diagnostics.failures.push({
        flightId,
        sagaFlightId,
        message,
      });
      logs.push(`Falha ao remover voo local ${flightId}${sagaFlightId ? ` (saga=${sagaFlightId})` : ""}: ${message}.`);
    }
  }
  logs.push(`[saga-sync-cleanup] resultado removidos=${diagnostics.deleted} falhas=${diagnostics.failed}.`);
  return { deletedFlights, diagnostics };
}

function parseSagaGroupKeyFromFlightDoc(flightDoc) {
  const raw = cleanString(flightDoc?.saga_flight_id);
  if (!raw) return "";
  let value = raw;
  if (value.startsWith("test:")) value = value.slice(5);
  if (value.toLowerCase().startsWith("schedule:")) return "";
  return value;
}

async function sagaReloadSingleFlight(actorUserId, payload = {}, runtimeLog = null) {
  if (!actorUserId) throw Object.assign(new Error("Autenticacao necessaria."), { status: 401 });
  const flightId = cleanString(payload.flightId);
  if (!flightId) throw Object.assign(new Error("Informe o voo local para recarregar."), { status: 400 });

  const actorRole = await getActorRole(actorUserId);
  const allowed = new Set(["admin", "instrutor", "aluno"]);
  if (!allowed.has(actorRole)) {
    throw Object.assign(new Error("Somente aluno/instrutor/admin pode recarregar voo do SAGA."), { status: 403 });
  }

  const logs = [];
  const logLine = (message) => {
    logs.push(message);
    if (typeof runtimeLog === "function") runtimeLog(message);
  };

  const flightDoc = await databases.getDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, flightId).catch(() => null);
  if (!flightDoc) throw Object.assign(new Error("Voo nao encontrado."), { status: 404 });

  const studentUserId = cleanString(flightDoc.student_user_id || flightDoc.user_id);
  const instructorUserId = cleanString(flightDoc.instructor_user_id);
  if (
    actorRole !== "admin" &&
    actorUserId !== studentUserId &&
    actorUserId !== instructorUserId
  ) {
    throw Object.assign(new Error("Sem permissao para recarregar este voo."), { status: 403 });
  }

  const sagaFlightIdHint = cleanString(payload.sagaFlightId);
  const groupKey = sagaFlightIdHint || parseSagaGroupKeyFromFlightDoc(flightDoc);
  if (!groupKey) {
    throw Object.assign(new Error("Voo sem vinculo com SAGA para recarregar."), { status: 400 });
  }

  const missionLookupKey = cleanString(payload.missionLookupKey);
  const missionId = cleanString(payload.missionId);
  const skipMissionMapping = payload.skipMissionMapping === true;

  const { credentials, mapping: originalMapping } = await loadSagaImportSettings();
  let mapping = sanitizeSagaImportMapping(originalMapping);
  if (missionLookupKey && missionId) {
    mapping = sanitizeSagaImportMapping({
      ...mapping,
      missionBySaga: {
        ...(mapping.missionBySaga || {}),
        [missionLookupKey]: missionId,
      },
    });
    await saveSagaImportMapping(mapping).catch(() => null);
    logLine(`De-para de missao atualizado para ${missionLookupKey} -> ${missionId}.`);
  }
  if (!credentials.email || !credentials.password) {
    throw Object.assign(new Error("Credenciais SAGA nao configuradas pelo administrador."), { status: 400 });
  }
  const catalogs = await listSagaImportCatalogs();
  const session = await sagaLoginSession(credentials.email, credentials.password, logs);
  const range = sagaDateRangeMonths(24);
  const filteredPath = `/reports/operations?start_date=${range.startDate}&end_date=${range.endDate}&id=${encodeURIComponent(groupKey)}`;
  const operations = await sagaFetch(
    filteredPath,
    {
      method: "GET",
      headers: { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", referer: `${SAGA_BASE_URL}/users` },
    },
    session,
  );
  const translated = translateSagaFlightRows(operations.html);
  const mappedRows = applySagaFlightColumnMap(translated.rows, mapping.flightColumnMap);
  let group = groupSagaFlightsById(mappedRows).find((item) => cleanString(item.key || item.id) === groupKey);
  if (!group) {
    const fallbackPath = `/reports/operations?start_date=${range.startDate}&end_date=${range.endDate}`;
    const fallbackOperations = await sagaFetch(
      fallbackPath,
      {
        method: "GET",
        headers: { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", referer: `${SAGA_BASE_URL}/users` },
      },
      session,
    );
    const fallbackTranslated = translateSagaFlightRows(fallbackOperations.html);
    const fallbackMappedRows = applySagaFlightColumnMap(fallbackTranslated.rows, mapping.flightColumnMap);
    group = groupSagaFlightsById(fallbackMappedRows).find((item) => cleanString(item.key || item.id) === groupKey);
  }
  if (!group) {
    throw Object.assign(new Error(`Voo SAGA ${groupKey} nao encontrado para recarga.`), { status: 404 });
  }

  if (!skipMissionMapping && sagaFlightNeedsMissionMapping(group, mapping, catalogs)) {
    const firstLeg = group.legs?.[0] || {};
    const rawMission = cleanString(firstLeg.missaoDoAluno);
    const sagaCourse = cleanString(firstLeg.curso);
    const trainingTrackId = cleanString(mapping.courseBySaga?.[sagaCourse]);
    const track = (catalogs.trainingTracks || []).find((item) => cleanString(item.id) === trainingTrackId);
    const lookupKey = sagaMissionLookupKeyV2(rawMission);
    const missionOptions = sagaMissionOptionsForTrack(catalogs, trainingTrackId);
    const pendingMission = {
      lookupKey,
      rawMission,
      missionCode: sagaMissionCodeV2(rawMission),
      trainingTrackId,
      trackName: cleanString(track?.name) || sagaCourse,
      sagaFlightId: cleanString(group.id),
      studentName: cleanString(firstLeg.aluno),
      flightDate: cleanString(firstLeg.dataDoVoo),
      course: sagaCourse,
      missionOptions: missionOptions.length > 0 ? missionOptions : sagaAllMissionOptions(catalogs),
    };
    return {
      ok: true,
      paused: true,
      refreshed: false,
      skipped: true,
      reason: "missing_mission_mapping",
      message: `Missao SAGA sem correspondencia: ${rawMission || lookupKey}. Selecione o de-para para continuar.`,
      flightId,
      sagaFlightId: groupKey,
      pendingMission,
      logs,
    };
  }

  const existingProfiles = await safeListAllDocuments(PROFILES_COLLECTION_ID, [
    sdk.Query.equal("school_id", [SCHOOL_ID]),
    ...selectQuery(["$id", "user_id", "anac_code"]),
  ]);
  const usersByCanac = new Map();
  for (const profile of existingProfiles) {
    const profileCanac = normalizeCanac(profile.anac_code);
    const profileUserId = cleanString(profile.user_id);
    if (profileCanac && profileUserId) {
      usersByCanac.set(profileCanac, profileUserId);
    }
  }
  // Do not override SAGA CANAC mapping with current flight ownership:
  // reload must follow the latest instructor/student resolved from SAGA.

  const result = await importSagaFlightGroup(
    group,
    mapping,
    catalogs,
    usersByCanac,
    {
      testMode: false,
      cookieJar: session,
      logs,
      forceStudentUserId: studentUserId || null,
      forceInstructorUserId: null,
      existingDocId: flightId,
      skipMissionMapping,
      missionRemapped: Boolean(missionLookupKey && missionId),
    },
  );

  if (result.skipped) {
    return {
      ok: true,
      message: result.reason ? sagaImportSkipReasonLabel(result.reason) : "Voo SAGA nao foi atualizado.",
      flightId,
      sagaFlightId: groupKey,
      refreshed: false,
      skipped: true,
      reason: result.reason || "unknown",
      logs,
    };
  }

  return {
    ok: true,
    message: result.updated ? "Dados do voo recarregados do SAGA." : "Voo recarregado do SAGA.",
    flightId,
    sagaFlightId: groupKey,
    refreshed: true,
    created: result.created === true,
    updated: result.updated === true,
    logs,
  };
}

async function sagaDeleteFlight(actorUserId, payload = {}) {
  if (!actorUserId) throw Object.assign(new Error("Autenticacao necessaria."), { status: 401 });
  const flightId = cleanString(payload.flightId);
  if (!flightId) throw Object.assign(new Error("Informe o voo para exclusao."), { status: 400 });

  const actorRole = await getActorRole(actorUserId);
  const allowed = new Set(["admin", "instrutor", "aluno"]);
  if (!allowed.has(actorRole)) {
    throw Object.assign(new Error("Somente aluno/instrutor/admin pode excluir voo."), { status: 403 });
  }

  const doc = await databases.getDocument(
    DATABASE_ID,
    FLIGHTS_COLLECTION_ID,
    flightId,
  ).catch(() => null);
  if (!doc) throw Object.assign(new Error("Voo nao encontrado."), { status: 404 });

  const studentUserId = cleanString(doc.student_user_id || doc.user_id);
  const instructorUserId = cleanString(doc.instructor_user_id);
  if (actorRole !== "admin" && actorUserId !== studentUserId && actorUserId !== instructorUserId) {
    throw Object.assign(new Error("Sem permissao para excluir este voo."), { status: 403 });
  }

  const isSagaImported =
    cleanString(doc.saga_flight_id).length > 0 ||
    cleanString(doc.source_filename).toLowerCase().includes("saga");
  if (Boolean(doc.instructor_signed) && !isSagaImported) {
    throw Object.assign(new Error("Nao e possivel apagar um voo assinado pelo instrutor."), { status: 403 });
  }

  if (cleanString(doc.csv_file_id) && FLIGHTS_CSV_BUCKET_ID) {
    await storage.deleteFile(FLIGHTS_CSV_BUCKET_ID, cleanString(doc.csv_file_id)).catch(() => null);
  }
  const cleanupSummary = { deletedByCollection: {}, deletedDocuments: 0, errors: [], fileErrors: [], deletedFiles: 0 };
  await deleteDocsByEqual(cleanupSummary, FLIGHT_SIGNATURES_COLLECTION_ID, "flight_id", [flightId]).catch(() => null);
  await deleteDocsByEqual(cleanupSummary, FLIGHT_MANEUVERS_COLLECTION_ID, "flight_id", [flightId]).catch(() => null);
  await deleteDocsByEqual(cleanupSummary, FLIGHT_MANEUVER_REVIEWS_COLLECTION_ID, "flight_id", [flightId]).catch(() => null);
  await deleteDocsByEqual(cleanupSummary, FLIGHT_VIDEOS_COLLECTION_ID, "flight_id", [flightId]).catch(() => null);
  await deleteDocsByEqual(cleanupSummary, FLIGHT_INSTRUCTOR_PAYMENTS_COLLECTION_ID, "flight_id", [flightId]).catch(() => null);
  await deleteDocsByEqual(cleanupSummary, FLIGHT_TELEMETRY_SUMMARIES_COLLECTION_ID, "flight_id", [flightId]).catch(() => null);
  await deleteDocsByEqual(cleanupSummary, FLIGHT_TELEMETRY_ALERTS_COLLECTION_ID, "flight_id", [flightId]).catch(() => null);
  await deleteDocsByEqual(cleanupSummary, FLIGHT_LANDINGS_COLLECTION_ID, "flight_id", [flightId]).catch(() => null);
  await deleteDocsByEqual(cleanupSummary, FLIGHT_TAKEOFFS_COLLECTION_ID, "flight_id", [flightId]).catch(() => null);
  await databases.deleteDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, flightId);

  return { ok: true, deleted: true, flightId };
}

async function sagaImportSelfCredits(actorUserId, runtimeLog) {
  const logLine = (msg) => { if (typeof runtimeLog === "function") runtimeLog(msg); };
  if (!actorUserId) throw Object.assign(new Error("Autenticacao necessaria."), { status: 401 });

  const profile = await getProfileByUserId(actorUserId);
  const anac = cleanString(profile?.anac_code);
  if (!anac) throw Object.assign(new Error("Codigo ANAC nao encontrado no perfil. Atualize seu cadastro antes de sincronizar."), { status: 400 });

  const [{ credentials, mapping, catalogs }, { settings: creditSalesSettings }] = await Promise.all([
    loadSagaImportSettings(),
    loadFlightCreditSalesConfig(),
  ]);
  if (!credentials.email || !credentials.password) {
    throw Object.assign(new Error("Credenciais SAGA nao configuradas pelo administrador."), { status: 400 });
  }
  const segmentNightHours = creditSalesSettings.nightHoursDifferentFromDay !== false;

  logLine(`[sagaImportSelfCredits] ANAC=${anac} userId=${actorUserId}`);
  const logs = [];

  const cookieJar = await sagaLoginSession(credentials.email, credentials.password, logs);
  const sagaUsersById = await fetchSagaUsersTableFromSession(cookieJar, logs);

  const sagaUser = Array.from(sagaUsersById.values()).find((u) => cleanString(u.codigoAnac) === anac);
  if (!sagaUser) {
    logs.push(`SAGA: nenhum usuario encontrado com ANAC ${anac}.`);
    const emptySummary = {
      importRunId: crypto.randomUUID(), testMode: false, useEmailAlias: false,
      selectedSagaUsers: 0, requestedUsers: 0, requestedFlightGroups: 0, requestedScheduledFlights: 0,
      usersCreated: 0, usersUpdated: 0, usersSkipped: 0,
      flightsCreated: 0, flightsUpdated: 0, flightsSkipped: 0, duplicateFlights: 0,
      scheduledFlightsCreated: 0, scheduledFlightsUpdated: 0, scheduledFlightsSkipped: 0,
      trainingAssignmentsTouched: 0, anacSynced: 0, anacPending: 0, anacFailed: 0,
      creditsCreated: 0, creditsUpdated: 0, creditsSkipped: 0, creditHoursImported: 0,
      nightHoursReclassified: 0, nightCreditRecordsCreated: 0,
      skippedFlights: [], skippedCredits: [],
      missing: { aircrafts: [], courses: [], students: [], creditAircrafts: [] },
      logs,
    };
    return { ok: true, summary: emptySummary };
  }

  logs.push(`SAGA: usuario encontrado — ID ${cleanString(sagaUser.id)}, nome: ${cleanString(sagaUser.nome)}.`);
  const { rows: rawCredits, fetchedSagaUserIds } = await fetchSagaCreditsForUsers([sagaUser], cookieJar, logs);
  const creditRows = applySagaCreditColumnMap(rawCredits, mapping.creditColumnMap);
  logs.push(`Creditos SAGA: ${creditRows.length} linha(s) encontrada(s) para ANAC ${anac}.`);
  logLine(`[sagaImportSelfCredits] ${creditRows.length} credito(s) para importar.`);

  const importRunId = crypto.randomUUID();
  const summary = {
    importRunId, testMode: false, useEmailAlias: false,
    selectedSagaUsers: 1, requestedUsers: 0, requestedFlightGroups: 0, requestedScheduledFlights: 0,
    usersCreated: 0, usersUpdated: 0, usersSkipped: 0,
    flightsCreated: 0, flightsUpdated: 0, flightsSkipped: 0, duplicateFlights: 0,
    scheduledFlightsCreated: 0, scheduledFlightsUpdated: 0, scheduledFlightsSkipped: 0,
    trainingAssignmentsTouched: 0, anacSynced: 0, anacPending: 0, anacFailed: 0,
    creditsCreated: 0, creditsUpdated: 0, creditsSkipped: 0, creditHoursImported: 0,
    nightHoursReclassified: 0, nightCreditRecordsCreated: 0,
    skippedFlights: [], skippedCredits: [],
    missing: { aircrafts: [], courses: [], students: [], creditAircrafts: [] },
    logs,
  };

  const creditRowsWithUser = assignSagaCreditRowOccurrences(
    actorUserId,
    creditRows.map((c) => ({ ...c, userId: actorUserId })),
  );
  let effectiveCredits = buildSagaUnsegmentedCredits(creditRowsWithUser);
  if (segmentNightHours && creditRowsWithUser.length > 0) {
    try {
      const operationsRange = sagaDateRangeDays(7);
      const operationsPath = `/reports/operations?start_date=${operationsRange.startDate}&end_date=${operationsRange.endDate}`;
      const operations = await sagaFetch(operationsPath, {
        method: "GET",
        headers: { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", referer: `${SAGA_BASE_URL}/users` },
      }, cookieJar);
      const allFlightRows2 = translateSagaFlightRows(operations.html);
      const mappedFlightRows2 = applySagaFlightColumnMap(allFlightRows2.rows, mapping.flightColumnMap);
      const myFlightRows2 = mappedFlightRows2.filter(
        (row) => cleanString(row.canacAluno) === anac || cleanString(row.canacInstrutor) === anac,
      );
      const myFlightGroups2 = groupSagaFlightsById(myFlightRows2);
      const usersByCanac2 = new Map([[anac, actorUserId]]);
      const nightDemands = collectSagaNightHourDemands(myFlightGroups2, usersByCanac2, mapping, catalogs);
      const segmented = segmentSagaCreditsForNight(creditRowsWithUser, nightDemands);
      summary.nightHoursReclassified = segmented.nightHoursReclassified || 0;
      summary.nightCreditRecordsCreated = segmented.nightCreditRecordsCreated || 0;
      if (segmented.uncoveredNightHours > 0) {
        logs.push(`Creditos noturnos: ${segmented.uncoveredNightHours}h sem saldo diurno suficiente para reclassificar.`);
      }
      effectiveCredits = segmented.effectiveCredits.length ? segmented.effectiveCredits : buildSagaUnsegmentedCredits(creditRowsWithUser);
    } catch (err) {
      logs.push(`Aviso: nao foi possivel calcular horas noturnas (${err?.message || err}). Importando sem reclassificacao.`);
      effectiveCredits = buildSagaUnsegmentedCredits(creditRowsWithUser);
    }
  }

  const expectedDocIds = new Set();
  for (const credit of effectiveCredits) {
    const result = await upsertSagaCredit(actorUserId, credit, actorUserId, mapping, catalogs, { testMode: false });
    if (result.created) {
      summary.creditsCreated += 1;
      summary.creditHoursImported += result.hours || 0;
      if (result.docId) expectedDocIds.add(cleanString(result.docId));
    } else if (result.updated) {
      summary.creditsUpdated += 1;
      summary.creditHoursImported += result.hours || 0;
      if (result.docId) expectedDocIds.add(cleanString(result.docId));
    } else {
      summary.creditsSkipped += 1;
      if (result.docId) expectedDocIds.add(cleanString(result.docId));
      summary.skippedCredits.push({
        student: cleanString(credit.studentName),
        model: cleanString(credit.model),
        hours: cleanString(credit.hours || credit.hoursHhmm),
        reason: result.reason || "unknown",
        message: sagaImportCreditSkipReasonLabel(result.reason || "unknown"),
      });
    }
  }
  if ((fetchedSagaUserIds || []).includes(cleanString(sagaUser.id))) {
    const cleanup = await purgeMissingSagaCreditsForUser(actorUserId, expectedDocIds, { testMode: false });
    if (cleanup.deleted > 0) {
      logs.push(`Creditos SAGA: ${cleanup.deleted} credito(s) removido(s) por nao existir(em) mais no SAGA.`);
    }
  }

  summary.creditHoursImported = Number(summary.creditHoursImported.toFixed(2));
  summary.flightPaymentsUpdated = await refreshZeroStudentPaymentSnapshots(actorUserId, actorUserId, logs);
  summary.logs.push(`Creditos: ${summary.creditsCreated} criados, ${summary.creditsUpdated} atualizados, ${summary.creditsSkipped} ignorados (${summary.creditHoursImported}h).`);
  logLine(`[sagaImportSelfCredits] ${summary.creditsCreated} criados, ${summary.creditsUpdated} atualizados, ${summary.creditsSkipped} ignorados.`);
  await saveSagaImportLastSummary(compactSagaImportSummary(summary)).catch(() => null);
  return { ok: true, summary };
}

module.exports = async ({ req, res, log, error }) => {
  try {
    if (!DATABASE_ID || !PROFILES_COLLECTION_ID) {
      return jsonResponse(res, 500, { message: "Missing APPWRITE_DATABASE_ID or APPWRITE_PROFILES_COLLECTION_ID." });
    }

    const actorUserId = await resolveActorUserId(req);
    const payload = parseFunctionPayload(req);
    const action = String(payload.action || "listSummaries");
    const appwriteEvent = cleanString(req?.headers?.["x-appwrite-event"]);
    const appwriteTrigger = cleanString(req?.headers?.["x-appwrite-trigger"]);
    log(`[action=${action}] userId=${actorUserId || "(none)"}`);

    if (appwriteEvent && appwriteTrigger === "event") {
      const result = await studentAutomationService().processEvent(appwriteEvent, payload);
      return jsonResponse(res, 200, { ok: true, automationEvent: appwriteEvent, ...result });
    }

    if (!actorUserId && action === "listSummaries") {
      const [reminderResult, scheduleResult, automationScan] = await Promise.all([
        runFlightReminderScan("system"),
        syncSagaScheduleFromImportSettings("system").catch((err) => ({ ok: false, message: String(err?.message || err) })),
        studentAutomationService().periodicScan().catch((err) => ({ ok: false, message: String(err?.message || err) })),
      ]);
      const cronSyncInput = { origin: "cron", importRunId: `saga-sync-all-${Date.now()}`, startedAt: nowIso() };
      const allUsersSyncResult = await sagaImportAllUsersFromSaga("system", cronSyncInput).catch(async (err) => {
        await recordSagaAllUsersSyncFailure(cronSyncInput, err);
        return { ok: false, message: String(err?.message || err) };
      });
      return jsonResponse(res, 200, {
        ok: true,
        ...reminderResult,
        sagaScheduleSync: scheduleResult,
        sagaAllUsersSync: allUsersSyncResult,
        automationScan,
      });
    }

    if (action === "resumeStudentAutomation") {
      const result = await studentAutomationService().resume(payload.jobId, payload.token);
      return jsonResponse(res, 200, { ok: true, result });
    }

    if (action === "listStudentAutomations") {
      const automations = await studentAutomationService().listAutomations(actorUserId);
      return jsonResponse(res, 200, { automations });
    }

    if (action === "getStudentAutomation") {
      const automation = await studentAutomationService().getAutomation(actorUserId, payload.id);
      return jsonResponse(res, 200, { automation });
    }

    if (action === "saveStudentAutomation") {
      const automation = await studentAutomationService().saveAutomation(actorUserId, payload.id, payload.automation);
      return jsonResponse(res, 200, { automation });
    }

    if (action === "duplicateStudentAutomation") {
      const automation = await studentAutomationService().duplicateAutomation(actorUserId, payload.id);
      return jsonResponse(res, 200, { automation });
    }

    if (action === "setStudentAutomationStatus") {
      const automation = await studentAutomationService().setAutomationStatus(actorUserId, payload.id, payload.status);
      return jsonResponse(res, 200, { automation });
    }

    if (action === "deleteStudentAutomation") {
      await studentAutomationService().deleteAutomation(actorUserId, payload.id);
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "simulateStudentAutomation") {
      const simulation = await studentAutomationService().simulation(actorUserId, payload.id, payload.studentUserId);
      return jsonResponse(res, 200, { simulation });
    }

    if (action === "testStudentAutomation") {
      await studentAutomationService().testAutomation(actorUserId, payload.id, payload.studentUserId);
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "listAutomationEmailTemplates") {
      const templates = await studentAutomationService().listTemplates(actorUserId);
      return jsonResponse(res, 200, { templates });
    }

    if (action === "saveAutomationEmailTemplate") {
      const template = await studentAutomationService().saveTemplate(actorUserId, payload.id, payload.template);
      return jsonResponse(res, 200, { template });
    }

    if (action === "duplicateAutomationEmailTemplate") {
      const template = await studentAutomationService().duplicateTemplate(actorUserId, payload.id);
      return jsonResponse(res, 200, { template });
    }

    if (action === "deleteAutomationEmailTemplate") {
      await studentAutomationService().deleteTemplate(actorUserId, payload.id);
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "sendAutomationEmailTemplateTest") {
      await studentAutomationService().sendTemplateTest(actorUserId, payload.id, payload.email);
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "listStudentCrmStatuses") {
      const statuses = await studentAutomationService().listStatuses(actorUserId);
      return jsonResponse(res, 200, { statuses });
    }

    if (action === "saveStudentCrmStatus") {
      const status = await studentAutomationService().saveStatus(actorUserId, payload.id, payload.crmStatus);
      return jsonResponse(res, 200, { status });
    }

    if (action === "archiveStudentCrmStatus") {
      await studentAutomationService().archiveStatus(actorUserId, payload.id);
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "listStudentCrmProfiles") {
      const crmProfiles = await studentAutomationService().listCrmProfiles(actorUserId);
      return jsonResponse(res, 200, { crmProfiles });
    }

    if (action === "setStudentCrmProfileStatus") {
      await studentAutomationService().setCrmProfileStatus(actorUserId, payload.studentUserId, payload.statusId);
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "listAutomationRuns") {
      const result = await studentAutomationService().listRuns(actorUserId, payload);
      return jsonResponse(res, 200, result);
    }

    if (action === "getAutomationRunDetail") {
      const runDetail = await studentAutomationService().runDetail(actorUserId, payload.id);
      return jsonResponse(res, 200, { runDetail });
    }

    if (action === "registerPushSubscription") {
      await registerPushSubscription(actorUserId, payload.subscription);
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "deletePushSubscription") {
      await deletePushSubscription(actorUserId, payload.endpoint);
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "notifyCrmLeadEvent") {
      const validTypes = new Set(["crm.lead_qualified", "crm.lead_registered"]);
      const evtType = cleanString(payload.eventType);
      if (!validTypes.has(evtType)) return jsonResponse(res, 400, { message: "Tipo de evento inválido." });
      await notifyCrmLeadEventToAdmins(evtType, payload.leadData);
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "notifyStudentScheduleEvent") {
      // Chamada interna da function schedule-booking (via API key, sem actorUserId)
      // — mesmo padrão das actions saga*Direct. Com actorUserId, exige admin.
      if (actorUserId) await requireAdmin(actorUserId);
      const validKinds = new Set(["requested", "rescheduled", "cancelled"]);
      const kind = cleanString(payload.kind);
      if (!validKinds.has(kind)) return jsonResponse(res, 400, { message: "Tipo de evento inválido." });
      await notifyStudentScheduleEventToAdmins(kind, payload.data);
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "registerSagaCancellationPenalty") {
      // Chamada interna da schedule-booking (via API key, sem actorUserId) quando um
      // cancelamento debita multa — lança a remoção de crédito no SAGA. Best-effort:
      // qualquer falha é logada, não derruba o cancelamento (execução assíncrona).
      if (actorUserId) await requireAdmin(actorUserId);
      const result = await registerSagaCancellationPenalty(payload).catch((err) => ({
        ok: false,
        status: "error",
        message: err?.message || String(err),
      }));
      log(
        `[registerSagaCancellationPenalty] student=${cleanString(payload.studentUserId)} ref=${cleanString(payload.penaltyRef)} result=${JSON.stringify(result)}`,
      );
      return jsonResponse(res, 200, { ok: true, result });
    }

    if (action === "notifyCaktoSaleEvent") {
      // Chamada interna da function cakto-webhook — autenticada pelo token do webhook.
      const expectedToken = await loadCaktoWebhookToken();
      if (!expectedToken || !timingSafeEqualString(payload.token, expectedToken)) {
        return jsonResponse(res, 401, { message: "Token inválido." });
      }
      const deliveries = await notifyCaktoSaleToAdmins(payload.sale);
      log(`[notifyCaktoSaleEvent] receipt=${cleanString(payload.sale?.receiptId)} deliveries=${JSON.stringify(deliveries)}`);
      return jsonResponse(res, 200, { ok: true, deliveries });
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

    if (action === "getOnboardingPublic") {
      const { publicSettings } = await loadOnboardingConfig();
      const steps = await listOnboardingSteps();
      return jsonResponse(res, 200, { onboarding: publicSettings, steps });
    }

    if (action === "getReferAndEarnPublic") {
      const { publicSettings } = await loadReferAndEarnConfig();
      const { publicSettings: brand } = await loadEmailBrandSettings();
      return jsonResponse(res, 200, {
        referAndEarn: publicSettings,
        schoolName: cleanString(brand?.schoolName) || "Escola",
      });
    }

    if (action === "getReferralWelcome") {
      const welcome = await getReferralWelcomeInfo(payload.userId);
      return jsonResponse(res, 200, { welcome });
    }

    if (action === "getReferAndEarnConfig") {
      const { publicSettings } = await loadReferAndEarnConfig();
      return jsonResponse(res, 200, { referAndEarn: publicSettings });
    }

    if (action === "saveReferAndEarnConfig") {
      await requireAdmin(actorUserId);
      const referAndEarn = await saveReferAndEarnConfig(payload.config || payload);
      return jsonResponse(res, 200, { referAndEarn });
    }

    if (action === "lookupSagaAnacPerson") {
      const result = await lookupSagaAnacPersonPublic(payload);
      return jsonResponse(res, result.ok === false ? 422 : 200, result);
    }

    if (action === "getPublicFlightReviewShare") {
      if (payload.summaryOnly === true) {
        const intro = await getPublicFlightReviewIntro(payload);
        return jsonResponse(res, 200, { intro });
      }
      const share = await getPublicFlightReviewShare(payload);
      return jsonResponse(res, 200, { share });
    }

    if (action === "createFlightPublicShare") {
      const share = await createFlightPublicShare(actorUserId, payload);
      return jsonResponse(res, 200, { share });
    }

    if (action === "sagaLookupFlight") {
      await requireInstructorOrAdmin(actorUserId);
      const result = await sagaLookupFlight(payload);
      return jsonResponse(res, result.ok === false ? 404 : 200, result);
    }

    if (action === "syncSagaScheduleEvent") {
      const result = await syncSagaScheduleEvent(actorUserId, payload);
      return jsonResponse(res, 200, result);
    }

    if (action === "sagaListSchedulesDirect") {
      const result = await sagaListSchedulesDirect(actorUserId, payload);
      return jsonResponse(res, 200, result);
    }

    if (action === "sagaUpsertScheduleDirect") {
      const result = await sagaUpsertScheduleDirect(actorUserId, payload);
      return jsonResponse(res, 200, result);
    }

    if (action === "sagaCancelScheduleDirect") {
      const result = await sagaCancelScheduleDirect(actorUserId, payload);
      return jsonResponse(res, 200, result);
    }

    if (action === "signContract") {
      const contract = await signContract(actorUserId, payload);
      return jsonResponse(res, 200, { ok: true, contract });
    }

    if (action === "ensureEnrollmentFormPreview") {
      const result = await ensureEnrollmentFormPreviewForActor(actorUserId, payload);
      return jsonResponse(res, 200, { ok: true, ...result });
    }

    if (action === "getMyReferrals") {
      const referrals = await getMyReferrals(actorUserId);
      return jsonResponse(res, 200, { referrals });
    }

    if (action === "impersonateStudent") {
      const sessionToken = await createStudentImpersonationToken(payload, req);
      return jsonResponse(res, 200, { ok: true, sessionToken });
    }

    if (action === "sagaImportSelfFlights") {
      if (!actorUserId) return jsonResponse(res, 401, { ok: false, message: "Autenticacao necessaria." });
      const result = await sagaImportSelfFlights(actorUserId, log, cleanString(payload.importRunId) || null, payload);
      return jsonResponse(res, 200, result);
    }

    if (action === "sagaImportAllInstructorFlights") {
      if (!actorUserId) return jsonResponse(res, 401, { ok: false, message: "Autenticacao necessaria." });
      await requireAdmin(actorUserId);
      const result = await sagaImportSelfFlights(actorUserId, log, cleanString(payload.importRunId) || null, {
        allInstructors: true,
        operationsDays: 7,
      });
      return jsonResponse(res, 200, result);
    }

    if (action === "sagaImportSelfCredits") {
      if (!actorUserId) return jsonResponse(res, 401, { ok: false, message: "Autenticacao necessaria." });
      const result = await sagaImportSelfCredits(actorUserId, log);
      return jsonResponse(res, 200, result);
    }

    if (action === "sagaReloadSingleFlight") {
      const result = await sagaReloadSingleFlight(actorUserId, payload, log);
      return jsonResponse(res, 200, result);
    }

    if (action === "sagaDeleteFlight") {
      const result = await sagaDeleteFlight(actorUserId, payload);
      return jsonResponse(res, 200, result);
    }

    if (action === "listStaffCreditPurchaseStudents") {
      if (!actorUserId) return jsonResponse(res, 401, { message: "Autenticacao necessaria." });
      await requireInstructorOrAdmin(actorUserId);
      const students = await listStaffCreditPurchaseStudents(payload.search);
      return jsonResponse(res, 200, { students });
    }

    if (action === "getStaffFlightCreditPackagesForStudent") {
      if (!actorUserId) return jsonResponse(res, 401, { message: "Autenticacao necessaria." });
      await requireInstructorOrAdmin(actorUserId);
      const config = await getFlightCreditPackagesForStudentUserId(payload.targetUserId);
      return jsonResponse(res, 200, { config });
    }

    if (action === "staffCreateFlightCreditCheckout") {
      if (!actorUserId) return jsonResponse(res, 401, { message: "Autenticacao necessaria." });
      await requireInstructorOrAdmin(actorUserId);
      const checkout = await createFlightCreditCheckoutForUser(
        payload.targetUserId,
        payload.packageId,
        payload.customHours,
        payload.weekdayOnly === true,
        { extraProductsInput: payload.extraProducts },
      );
      return jsonResponse(res, 200, { checkout });
    }

    if (action === "getAvailableFlightCreditPackages") {
      if (!actorUserId) return jsonResponse(res, 401, { message: "Autenticacao necessaria." });
      const [profile, authUser, { settings, doc }] = await Promise.all([
        getProfileByUserId(actorUserId).catch(() => null),
        users.get({ userId: actorUserId }).catch(() => null),
        loadFlightCreditSalesConfig(),
      ]);
      const profileRole = normalizeRole(profile?.role);
      const labelRole = deriveRoleFromLabels(authUser?.labels || []);
      const role = profileRole === "aluno" && labelRole ? labelRole : profileRole || labelRole;
      if (role !== "aluno") return jsonResponse(res, 403, { message: "Apenas alunos podem consultar pacotes para compra." });
      const config = publicFlightCreditSalesConfig(settings, doc?.$updatedAt || null, true);
      if (!config.studentPurchasesEnabled) {
        config.packages = [];
      } else {
        config.packages = filterFlightCreditPackagesForUser(config.packages, profile, authUser);
      }
      return jsonResponse(res, 200, { config });
    }

    if (action === "createFlightCreditCheckout") {
      const checkout = await createFlightCreditCheckout(actorUserId, payload.packageId, payload.customHours, payload.weekdayOnly === true);
      return jsonResponse(res, 200, { checkout });
    }

    if (action === "adminCreateFlightCreditCheckout") {
      const checkout = await adminCreateFlightCreditCheckout(
        actorUserId,
        payload.targetUserId,
        payload.packageId,
        payload.customHours,
        payload.customHourPrice,
        payload.weekdayOnly === true,
        payload.extraProducts,
      );
      return jsonResponse(res, 200, { checkout });
    }

    if (action === "sendFlightCreditPaymentLinkEmail") {
      const result = await sendFlightCreditPaymentLinkEmail(actorUserId, payload);
      return jsonResponse(res, 200, result);
    }

    if (action === "sagaGetLastImportSummary") {
      const doc = await getSettingDoc(SAGA_IMPORT_LAST_SUMMARY_KEY);
      const parsed = doc ? parseJsonObject(doc.settings_json, {}) : {};
      return jsonResponse(res, 200, { ok: true, summary: parsed.summary || null, savedAt: parsed.savedAt || null });
    }

    if (action === "sagaGetImportProgress") {
      const doc = await getSettingDoc(SAGA_IMPORT_PROGRESS_KEY);
      const parsed = doc ? parseJsonObject(doc.settings_json, {}) : {};
      const progress = parsed.progress || null;
      const requestedRunId = cleanString(payload.runId);
      return jsonResponse(res, 200, {
        ok: true,
        progress: !requestedRunId || cleanString(progress?.runId) === requestedRunId ? progress : null,
        savedAt: parsed.savedAt || null,
      });
    }

    if (action === "sagaGetSyncHistory") {
      await requireAdmin(actorUserId);
      const history = await loadSagaSyncHistory();
      return jsonResponse(res, 200, { ok: true, history });
    }

    if (action === "getStudentsProgress") {
      await requireInstructorOrAdmin(actorUserId);
      const studentsProgress = await getStudentsProgress(payload);
      return jsonResponse(res, 200, { studentsProgress });
    }

    if (action === "switchActiveRole") {
      if (!actorUserId) return jsonResponse(res, 401, { message: "Autenticacao necessaria." });
      const roleSlug = String(payload.roleSlug || payload.role || "");
      const user = await switchActiveRole(actorUserId, roleSlug);
      return jsonResponse(res, 200, { user });
    }

    if (action === "getDetail") {
      await requireInstructorOrAdmin(actorUserId);
      const user = await getUserDetail(String(payload.userId || ""));
      const executedIds = (user.executedFlights || []).map((flight) => flight.id);
      log(
        `[getDetail] userId=${user.userId} executed=${executedIds.length} planned=${(user.plannedFlights || []).length} has739=${executedIds.includes("saga_flight_739")} ids=${executedIds.slice(0, 20).join(",")}`,
      );
      return jsonResponse(res, 200, { user });
    }

    if (action === "listFlightReports") {
      await requireInstructorOrAdmin(actorUserId);
      const actorRole = await getActorRole(actorUserId);
      const report = await listFlightReports(payload, actorUserId, actorRole);
      return jsonResponse(res, 200, report);
    }

    if (action === "createGhostFlight") {
      const result = await createGhostFlight(actorUserId, payload);
      return jsonResponse(res, 200, result);
    }

    if (action === "updateGhostFlight") {
      const result = await updateGhostFlight(actorUserId, payload);
      return jsonResponse(res, 200, result);
    }

    if (action === "deleteGhostFlight") {
      const result = await deleteGhostFlight(actorUserId, payload);
      return jsonResponse(res, 200, result);
    }

    if (action === "listGhostMergeCandidates") {
      const result = await listGhostMergeCandidates(actorUserId, payload);
      return jsonResponse(res, 200, result);
    }

    if (action === "finalizeGhostFlightMerge") {
      const result = await finalizeGhostFlightMerge(actorUserId, payload);
      return jsonResponse(res, 200, result);
    }

    if (action === "sagaGetImportSettings") {
      const settings = await loadSagaImportSettingsForActor(actorUserId);
      return jsonResponse(res, 200, { ok: true, ...settings });
    }

    if (action === "sagaSaveImportMapping") {
      const mapping = await saveSagaImportMappingForActor(actorUserId, payload.mapping || payload);
      return jsonResponse(res, 200, { ok: true, mapping });
    }

    if (action === "sagaSyncAllUsersFromSagaJob") {
      const syncInput = {
        force: payload.force === true,
        origin: actorUserId ? "manual" : "cron",
        importRunId: cleanString(payload.importRunId),
        startedAt: nowIso(),
      };
      try {
        const result = await sagaImportAllUsersFromSaga(actorUserId || "system", syncInput);
        return jsonResponse(res, 200, result);
      } catch (err) {
        await recordSagaAllUsersSyncFailure(syncInput, err);
        throw err;
      }
    }

    if (action === "sagaSyncAllUsersFlightsOnly") {
      await requireAdmin(actorUserId);
      const syncInput = {
        force: true,
        flightsOnly: true,
        origin: "manual-flights-only",
        importRunId: cleanString(payload.importRunId),
        startedAt: nowIso(),
      };
      try {
        const result = await sagaImportAllUsersFromSaga(actorUserId, syncInput);
        return jsonResponse(res, 200, result);
      } catch (err) {
        await recordSagaAllUsersSyncFailure(syncInput, err);
        throw err;
      }
    }

    if (action === "listSummaries" || action === "list") {
      await requireUsersListAccess(actorUserId);
      const page = await listSummaries({
        search: String(payload.search || ""),
        role: String(payload.role || ""),
        customRoleSlug: String(payload.customRoleSlug || ""),
        limit: payload.limit,
        offset: payload.offset,
      });
      log(
        `[listSummaries] search="${String(payload.search || "")}" total=${page.total} pageUsers=${(page.users || []).length}`,
      );
      return jsonResponse(res, 200, page);
    }

    await requireAdmin(actorUserId);

    if (action === "createUser") {
      const user = await createAdminUser(actorUserId, payload.user || payload);
      return jsonResponse(res, 200, { user });
    }

    if (action === "lookupSagaAnacPersonAdmin") {
      const result = await lookupSagaAnacPersonAdmin(actorUserId, payload);
      return jsonResponse(res, result.ok === false ? 422 : 200, result);
    }

    if (action === "deleteSagaUser") {
      const result = await deleteSagaUserAdmin(actorUserId, payload);
      return jsonResponse(res, result.ok === false ? 422 : 200, result);
    }

    if (action === "sagaFetchUsers") {
      const result = await sagaFetchUsers(payload);
      return jsonResponse(res, 200, result);
    }

    if (action === "sagaImportData") {
      const result = await sagaImportData(payload, actorUserId, log);
      return jsonResponse(res, 200, result);
    }

    if (action === "sagaResumeImportData") {
      const result = await sagaResumeImportData(payload, actorUserId, log);
      return jsonResponse(res, 200, result);
    }

    if (action === "sagaSyncScheduleJob") {
      const result = await syncSagaScheduleFromImportSettings(actorUserId || "system", {
        force: payload.force === true,
      });
      return jsonResponse(res, 200, result);
    }

    if (action === "sagaFetchSchedules") {
      await requireAdmin(actorUserId);
      const logs = [];
      const { cookieJar } = await loadSagaAuthSession();
      const schedulesRaw = await fetchSagaScheduledFlights(cookieJar, logs, { skipFutureFilter: true, monthCount: 4 });
      const schedules = await sagaResolveScheduledByNamesFromProfiles(schedulesRaw);
      return jsonResponse(res, 200, { ok: true, schedules, logs });
    }

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

    if (action === "getCaktoSettings") {
      await requireAdmin(actorUserId);
      const { publicSettings } = await loadCaktoSettings();
      return jsonResponse(res, 200, { settings: publicSettings });
    }

    if (action === "planeItGetSettings") {
      await requireAdmin(actorUserId);
      const settings = await loadPlaneItCredentials();
      return jsonResponse(res, 200, { settings });
    }

    if (action === "planeItSaveSettings") {
      await requireAdmin(actorUserId);
      const settings = await savePlaneItCredentials(payload.settings || payload);
      return jsonResponse(res, 200, { settings });
    }

    if (action === "planeItAircraftTotals") {
      await requireAdmin(actorUserId);
      const result = await fetchPlaneItAircraftTotals(payload);
      return jsonResponse(res, 200, result);
    }

    if (action === "getFlightCreditSalesConfig") {
      await requireAdmin(actorUserId);
      const { publicSettings } = await loadFlightCreditSalesConfig();
      return jsonResponse(res, 200, { config: publicSettings });
    }

    if (action === "saveFlightCreditSalesConfig") {
      await requireAdmin(actorUserId);
      const config = await saveFlightCreditSalesConfig(payload.config);
      return jsonResponse(res, 200, { config });
    }

    if (action === "saveCaktoSettings") {
      await requireAdmin(actorUserId);
      const settings = await saveCaktoSettings(payload.settings);
      return jsonResponse(res, 200, { settings });
    }

    if (action === "testCaktoConnection") {
      await requireAdmin(actorUserId);
      await testCaktoConnection();
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "createCaktoProposal") {
      await requireAdmin(actorUserId);
      const proposal = await createCaktoProposal(payload.proposal);
      return jsonResponse(res, 200, { proposal });
    }

    if (action === "retryCaktoProposal") {
      await requireAdmin(actorUserId);
      const proposal = await retryCaktoProposal(payload.proposalId);
      return jsonResponse(res, 200, { proposal });
    }

    if (action === "listCaktoReceipts") {
      await requireAdmin(actorUserId);
      const page = await listCaktoReceipts(payload);
      return jsonResponse(res, 200, page);
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

    if (action === "getOnboardingConfig") {
      const { publicSettings } = await loadOnboardingConfig();
      const steps = await listOnboardingSteps();
      return jsonResponse(res, 200, { onboarding: publicSettings, steps });
    }

    if (action === "saveOnboardingConfig") {
      const onboarding = await saveOnboardingConfig(payload.config || payload);
      return jsonResponse(res, 200, { onboarding });
    }

    if (action === "getGoogleCalendarSettings") {
      const { publicSettings } = await loadGoogleCalendarSettings();
      return jsonResponse(res, 200, { googleCalendarSettings: publicSettings });
    }

    if (action === "getWppSettings") {
      await requireAdmin(actorUserId);
      const { settings, doc } = await loadWppSettings();
      return jsonResponse(res, 200, { settings: publicWppSettings(settings, doc?.$updatedAt || null) });
    }

    if (action === "saveWppSettings") {
      await requireAdmin(actorUserId);
      const settings = await saveWppSettings(payload.settings);
      return jsonResponse(res, 200, { settings });
    }

    if (action === "testWppConnection") {
      await requireAdmin(actorUserId);
      const settings = await testWppConnection();
      return jsonResponse(res, 200, { settings });
    }

    if (action === "listWppTemplates") {
      await requireAdmin(actorUserId);
      const templates = await listWppTemplates();
      return jsonResponse(res, 200, { templates });
    }

    if (action === "createWppTemplate") {
      await requireAdmin(actorUserId);
      const template = await createWppTemplate(payload.template);
      return jsonResponse(res, 200, { template });
    }

    if (action === "updateWppTemplate") {
      await requireAdmin(actorUserId);
      const template = await updateWppTemplate(payload.template);
      return jsonResponse(res, 200, { template });
    }

    if (action === "deleteWppTemplate") {
      await requireAdmin(actorUserId);
      await deleteWppTemplate(payload.name);
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "sendWppTemplateTest") {
      await requireAdmin(actorUserId);
      const messageId = await sendWppTemplateTest(payload.test);
      return jsonResponse(res, 200, { ok: true, messageId });
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

    if (action === "getGoogleCalendarOAuthUrl") {
      const authUrl = await getGoogleCalendarOAuthUrl(payload);
      return jsonResponse(res, 200, { authUrl });
    }

    if (action === "exchangeGoogleCalendarOAuthCode") {
      const googleCalendarSettings = await exchangeGoogleCalendarOAuthCode(payload);
      return jsonResponse(res, 200, { googleCalendarSettings });
    }

    if (action === "disconnectGoogleCalendarOAuth") {
      const googleCalendarSettings = await disconnectGoogleCalendarOAuth();
      return jsonResponse(res, 200, { googleCalendarSettings });
    }

    if (action === "sendTestEmail") {
      await sendTestEmail(payload.to, payload.templateType);
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "sendContractEmail") {
      const contractId = cleanString(payload.contractId);
      if (!contractId) throw Object.assign(new Error("Contrato não informado."), { status: 400 });
      const contract = await databases.getDocument(DATABASE_ID, CONTRACTS_COLLECTION_ID, contractId);
      await sendContractNotificationEmail(contract, {
        userId: contract.recipient_user_id,
        email: cleanString(payload.recipientEmail),
        name: cleanString(payload.recipientName || contract.recipient_name),
      });
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "runEnrollmentAutomation") {
      const result = await runEnrollmentAutomation(actorUserId, payload);
      return jsonResponse(res, 200, { ok: true, ...result });
    }

    if (action === "updateRole") {
      const assignedRoleSlugs = Array.isArray(payload.assignedRoleSlugs)
        ? payload.assignedRoleSlugs.map((item) => String(item))
        : Array.isArray(payload.roles)
          ? payload.roles.map((item) => String(item))
          : [String(payload.role || "")];
      const user = await updateRole(actorUserId, String(payload.userId || ""), assignedRoleSlugs);
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

    if (action === "updateProfile") {
      const user = await updateAdminUserProfile(actorUserId, String(payload.userId || ""), payload.profile || payload);
      return jsonResponse(res, 200, { user });
    }

    if (action === "createCredit") {
      const created = await createCredit(actorUserId, payload.credit);
      return jsonResponse(res, 200, { ok: true, creditSaga: created.creditSaga });
    }

    if (action === "updateCredit") {
      await updateCredit(actorUserId, String(payload.creditId || ""), payload.credit);
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "deleteCredit") {
      await deleteCredit(String(payload.creditId || ""), String(payload.userId || ""));
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "deleteUserCascade") {
      const deletion = await deleteAdminUserCascade(actorUserId, String(payload.userId || ""), req);
      return jsonResponse(res, 200, { ok: true, deletion });
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

    if (action === "createHelpSectionInstructor") {
      const document = await createHelpDocument("section", payload.data, "instructor");
      return jsonResponse(res, 200, { document });
    }

    if (action === "updateHelpSectionInstructor") {
      const document = await updateHelpDocument("section", String(payload.documentId || ""), payload.data, "instructor");
      return jsonResponse(res, 200, { document });
    }

    if (action === "deleteHelpSectionInstructor") {
      await deleteHelpDocument("section", String(payload.documentId || ""), "instructor");
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "createHelpArticleInstructor") {
      const document = await createHelpDocument("article", payload.data, "instructor");
      return jsonResponse(res, 200, { document });
    }

    if (action === "updateHelpArticleInstructor") {
      const document = await updateHelpDocument("article", String(payload.documentId || ""), payload.data, "instructor");
      return jsonResponse(res, 200, { document });
    }

    if (action === "deleteHelpArticleInstructor") {
      await deleteHelpDocument("article", String(payload.documentId || ""), "instructor");
      return jsonResponse(res, 200, { ok: true });
    }

    if (action === "assignStudentTrainingTrack") {
      const user = await assignStudentTrainingTrack(
        payload.userId,
        payload.trackId,
        payload.isPrimary === true,
        String(payload.status || "active"),
      );
      return jsonResponse(res, 200, { user });
    }

    if (action === "setPrimaryStudentTrainingTrack") {
      const user = await updatePrimaryStudentTrainingTrack(payload.userId, payload.trackId);
      return jsonResponse(res, 200, { user });
    }

    if (action === "removeStudentTrainingTrack") {
      const user = await removeStudentTrainingTrack(payload.userId, payload.assignmentId);
      return jsonResponse(res, 200, { user });
    }

    if (action === "setStudentTrackFlightReviewClubMembership") {
      const user = await setStudentTrackFlightReviewClubMembership(payload.userId, payload.assignmentId, payload.isMember === true);
      return jsonResponse(res, 200, { user });
    }

    if (action === "listScheduleWeekFlights") {
      await requireInstructorOrAdmin(actorUserId);
      const scheduleWeekFlights = await listScheduleWeekFlights(String(payload.weekStart || ""));
      return jsonResponse(res, 200, { scheduleWeekFlights });
    }

    if (action === "getDashboardSummary") {
      const dashboard = await getDashboardSummary(payload);
      return jsonResponse(res, 200, { dashboard });
    }

    if (action === "searchFlightPickerUsers") {
      const result = await searchFlightPickerUsers(actorUserId, payload);
      return jsonResponse(res, 200, result);
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
    return jsonResponse(res, status, { message: err?.message || "Unexpected function error.", ...(err?.sagaResult || {}) });
  }
};

