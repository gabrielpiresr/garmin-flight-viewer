const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const sdk = require("node-appwrite");
const { buildEnrollmentFormPdf } = require("./enrollmentFormPdf");
const { Resend } = require("resend");
const webpush = require("web-push");
const pdfParse = require("pdf-parse");

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
const PLATFORM_SETTINGS_COLLECTION_ID = process.env.APPWRITE_PLATFORM_SETTINGS_COLLECTION_ID;
const ONBOARDING_STEPS_COLLECTION_ID = process.env.APPWRITE_ONBOARDING_STEPS_COLLECTION_ID;
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
const GOOGLE_CALENDAR_OAUTH_CLIENT_ID = process.env.GOOGLE_CALENDAR_OAUTH_CLIENT_ID || "";
const GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET = process.env.GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET || "";
// Identificador único da escola — usado para isolar dados em ambiente multi-tenant.
const SYNC_ANAC_FUNCTION_ID = process.env.APPWRITE_SYNC_ANAC_FUNCTION_ID || process.env.VITE_APPWRITE_SYNC_ANAC_FUNCTION_ID || "sync-anac-profile";
const SCHOOL_ID = process.env.SCHOOL_ID || "escola_principal";
const VALID_ROLES = new Set(["admin", "instrutor", "aluno"]);
const VALID_FLIGHT_STATUSES = new Set(["Pendente", "Confirmado", "Previsto", "Cancelado", "Realizado"]);
const SCHEDULED_FLIGHT_STATUSES = new Set(["Pendente", "Confirmado", "Previsto"]);

function isScheduledFlightStatusValue(value) {
  return SCHEDULED_FLIGHT_STATUSES.has(cleanString(value));
}
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
];
const PROFILE_SELECT = [
  "$id",
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
    for (const row of parsed.rows) {
      rows.push({
        ...row,
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
  return {
    id: cleanString(schedule.id),
    startAt,
    endAt,
    startAtRaw,
    endAtRaw,
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

async function fetchSagaScheduledFlights(cookieJar, logs = []) {
  const monthResults = await sagaRunConcurrent(sagaScheduleMonthTargets(3), 3, async (target) => {
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
      .filter((schedule) => schedule.id && (schedule.active || sagaScheduleIsCancelledStatus(schedule.status)) && sagaScheduleIsTodayOrFuture(schedule.raw));
    rows.push(...translated);
    localLogs.push(`GET ${path}: status ${result.response.status}, ${translated.length}/${schedules.length} voos agendados de hoje em diante.`);
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

  const operationsRange = sagaDateRangeMonths(24);
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

  logs.push("GET /credits/create: buscando amostra de creditos dos alunos para preview.");
  const creditPreview = await fetchSagaCreditPreview(translatedUsers, cookieJar, logs, statuses, htmlLengths);
  logs.push(`GET /credits/create: ${creditPreview.rows.length} linhas de creditos extraidas de ${creditPreview.sampledUserIds.length} alunos.`);
  const scheduleLogs = [];
  const scheduledFlights = await fetchSagaScheduledFlights(cookieJar, scheduleLogs).catch((err) => {
    logs.push(`GET /schedules/management: nao foi possivel carregar escala para IDs de aeronave: ${err?.message || err}.`);
    return [];
  });
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
    if (creditAircraftBySaga[sagaCreditModel]) continue;
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
    missingCreditAircrafts: uniqueCleanValues((credits || []).map((credit) => credit.model)).filter((value) => !creditAircraftBySaga[value]),
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
    const parsed = translateSagaCreditRows(creditPage.html);
    for (const row of parsed.rows) {
      rows.push({
        ...row,
        sagaUserId,
        studentName: cleanString(user.nome),
        studentEmail: cleanString(user.email),
        studentAnac: cleanString(user.codigoAnac),
      });
    }
    logs.push(`Creditos SAGA ${sagaUserId}: status ${creditPage.response.status}, ${parsed.rows.length} linhas.`);
  }
  return rows;
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
    ...(enableAccess ? { is_active: true } : {}),
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

async function importSagaUser(sagaUser, role, { testMode = false, useEmailAlias = false } = {}) {
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

function sagaCreditDocId(testMode, userId, credit) {
  const segment = credit?.segmentPart === "night" || credit?.isNight === true ? "night" : "day";
  const stableTotalValue = cleanString(credit._originalTotalValue ?? credit.totalValue);
  const raw = [
    userId,
    cleanString(credit.model),
    cleanString(credit.purchaseDate),
    cleanString(credit.expiresAt),
    stableTotalValue,
    segment,
  ].join("|");
  const hash = crypto.createHash("sha1").update(raw).digest("hex").slice(0, 20);
  const prefix = testMode ? "saga_test_credit" : "saga_credit";
  return `${prefix}_${hash}`;
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
  if (matchedModel) return { sagaModel: matchedModel, modelId: cleanString(mapping.creditAircraftBySaga?.[matchedModel]) };
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

async function upsertSagaCredit(actorUserId, credit, userId, mapping, catalogs, { testMode = false } = {}) {
  if (!STUDENT_CREDITS_COLLECTION_ID) {
    // #region agent log
    fetch('http://127.0.0.1:7507/ingest/74fbafb9-127e-4adf-aee6-0b36f081c2f1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8edc56'},body:JSON.stringify({sessionId:'8edc56',runId:'saga-import-debug',hypothesisId:'H5',location:'main.js:1628',message:'credit skipped missing credits collection',data:{userId,model:cleanString(credit?.model)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return { skipped: true, reason: "credits_collection_missing", aircraft: cleanString(credit.model) };
  }
  const sagaModel = cleanString(credit.model);
  const modelId = cleanString(mapping.creditAircraftBySaga?.[sagaModel]);
  const model = (catalogs.aircraftModels || []).find((item) => item.id === modelId);
  const hours = sagaHoursValue(credit.hours || credit.hoursHhmm);
  if (!modelId) {
    // #region agent log
    fetch('http://127.0.0.1:7507/ingest/74fbafb9-127e-4adf-aee6-0b36f081c2f1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8edc56'},body:JSON.stringify({sessionId:'8edc56',runId:'saga-import-debug',hypothesisId:'H5',location:'main.js:1635',message:'credit skipped missing model mapping',data:{userId,sagaUserId:cleanString(credit?.sagaUserId),model:sagaModel,hoursRaw:cleanString(credit?.hours||credit?.hoursHhmm)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return { skipped: true, reason: "missing_credit_aircraft_mapping", aircraft: sagaModel };
  }
  if (hours <= 0) {
    // #region agent log
    fetch('http://127.0.0.1:7507/ingest/74fbafb9-127e-4adf-aee6-0b36f081c2f1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8edc56'},body:JSON.stringify({sessionId:'8edc56',runId:'saga-import-debug',hypothesisId:'H5',location:'main.js:1636',message:'credit skipped zero hours',data:{userId,sagaUserId:cleanString(credit?.sagaUserId),model:sagaModel,hoursRaw:cleanString(credit?.hours||credit?.hoursHhmm),hours},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
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
    // #region agent log
    fetch('http://127.0.0.1:7507/ingest/74fbafb9-127e-4adf-aee6-0b36f081c2f1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8edc56'},body:JSON.stringify({sessionId:'8edc56',runId:'saga-import-debug',hypothesisId:'H5',location:'main.js:1661',message:'credit updated existing doc',data:{userId,sagaUserId:cleanString(credit?.sagaUserId),docId,model:sagaModel,hours},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    try {
      await databases.updateDocument(DATABASE_ID, STUDENT_CREDITS_COLLECTION_ID, docId, {
        ...data,
        updated_by: actorUserId,
      });
    } catch (err) {
      if (!isUnknownCreatedByAttributeError(err)) throw err;
      await databases.updateDocument(DATABASE_ID, STUDENT_CREDITS_COLLECTION_ID, docId, data);
    }
    return { updated: true, hours, aircraft: sagaModel };
  }
  try {
    await databases.createDocument(DATABASE_ID, STUDENT_CREDITS_COLLECTION_ID, docId, payload, creditPermissions(userId));
  } catch (err) {
    if (!isUnknownCreatedByAttributeError(err)) throw err;
    const { created_by: _createdBy, updated_by: _updatedBy, ...compatPayload } = payload;
    await databases.createDocument(DATABASE_ID, STUDENT_CREDITS_COLLECTION_ID, docId, compatPayload, creditPermissions(userId));
  }
  return { created: true, hours, aircraft: sagaModel };
}

async function upsertSagaFinancialCredit(actorUserId, entry, userId, mapping, catalogs, { testMode = false, matchedCredit = null } = {}) {
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
    try {
      await databases.updateDocument(DATABASE_ID, STUDENT_CREDITS_COLLECTION_ID, docId, {
        ...data,
        updated_by: actorUserId,
      });
    } catch (err) {
      if (!isUnknownCreatedByAttributeError(err)) throw err;
      await databases.updateDocument(DATABASE_ID, STUDENT_CREDITS_COLLECTION_ID, docId, data);
    }
    return { updated: true, hours, aircraft: sagaModel };
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
  return { created: true, hours, aircraft: sagaModel };
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
  const meta = {
    source: "saga",
    sagaFlightId: group.id,
    sagaFlightGroupKey: groupKey,
    sagaFlightGroupOrdinal: group.ordinal || 1,
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
  const meta = decodeFlightMeta(flightDoc.csv_text);
  if (meta && Array.isArray(meta.exercises)) {
    const deduped = dedupeSagaExercises(meta.exercises);
    if (deduped.length !== meta.exercises.length) {
      patch.csv_text = `${META_PREFIX}${Buffer.from(JSON.stringify({ ...meta, exercises: deduped }), "utf8").toString("base64")}\n`;
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

async function importSagaFlightGroup(group, mapping, catalogs, usersByCanac, { testMode = false, cookieJar = null, logs = null, pdfRecordOverride = undefined } = {}) {
  const firstLeg = group.legs[0] || {};
  const groupKey = cleanString(group.key || group.id);
  const sagaAircraft = cleanString(firstLeg.aeronave);
  const sagaCourse = cleanString(firstLeg.curso);
  const aircraftIdent = cleanString(mapping.aircraftBySaga?.[sagaAircraft]);
  const trainingTrackId = cleanString(mapping.courseBySaga?.[sagaCourse]);
  const studentUserId = usersByCanac.get(cleanString(firstLeg.canacAluno)) || null;
  const instructorUserId = usersByCanac.get(cleanString(firstLeg.canacInstrutor)) || null;
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
    // #region agent log
    fetch('http://127.0.0.1:7507/ingest/74fbafb9-127e-4adf-aee6-0b36f081c2f1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8edc56'},body:JSON.stringify({sessionId:'8edc56',runId:'saga-import-debug',hypothesisId:'H1',location:'main.js:2664',message:'flight skipped missing aircraft mapping',data:{groupId:group?.id,groupKey,sagaAircraft,date:cleanString(firstLeg?.dataDoVoo),studentCanac:cleanString(firstLeg?.canacAluno)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return { skipped: true, reason: "missing_aircraft_mapping", ...baseFailure };
  }
  if (!trainingTrackId) {
    // #region agent log
    fetch('http://127.0.0.1:7507/ingest/74fbafb9-127e-4adf-aee6-0b36f081c2f1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8edc56'},body:JSON.stringify({sessionId:'8edc56',runId:'saga-import-debug',hypothesisId:'H1',location:'main.js:2665',message:'flight skipped missing course mapping',data:{groupId:group?.id,groupKey,sagaCourse,date:cleanString(firstLeg?.dataDoVoo),studentCanac:cleanString(firstLeg?.canacAluno)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return { skipped: true, reason: "missing_course_mapping", ...baseFailure };
  }
  if (!studentUserId) {
    // #region agent log
    fetch('http://127.0.0.1:7507/ingest/74fbafb9-127e-4adf-aee6-0b36f081c2f1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8edc56'},body:JSON.stringify({sessionId:'8edc56',runId:'saga-import-debug',hypothesisId:'H1',location:'main.js:2666',message:'flight skipped missing student mapping',data:{groupId:group?.id,groupKey,date:cleanString(firstLeg?.dataDoVoo),student:cleanString(firstLeg?.aluno),studentCanac:cleanString(firstLeg?.canacAluno)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return { skipped: true, reason: "missing_student", ...baseFailure };
  }

  const docId = sagaDocId(testMode ? "saga_test_flight" : "saga_flight", groupKey);
  const existingDoc = await databases.getDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, docId).catch(() => null);
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
  materialized.csv_text = buildSagaFlightCsvMeta(group, firstLeg, materialized, studentUserId, instructorUserId, pdfRecord);
  const optionalFields = {
    saga_flight_id: `${testMode ? "test:" : ""}${groupKey}`.slice(0, 64),
    saga_legs_json: JSON.stringify(group.legs.map((leg) => ({ ...leg, sagaFlightId: group.id, sagaFlightGroupKey: groupKey }))).slice(0, 65535),
    saga_imported_at: nowIso(),
  };

  if (existingDoc) {
    // #region agent log
    fetch('http://127.0.0.1:7507/ingest/74fbafb9-127e-4adf-aee6-0b36f081c2f1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8edc56'},body:JSON.stringify({sessionId:'8edc56',runId:'saga-import-debug',hypothesisId:'H2',location:'main.js:2727',message:'flight updated existing doc',data:{groupId:group?.id,groupKey,docId,date:materialized.flight_date,studentUserId,aircraftIdent},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
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

  const trackAssigned = await ensureSagaStudentTrack(studentUserId, trainingTrackId);
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
  // #region agent log
  fetch('http://127.0.0.1:7507/ingest/74fbafb9-127e-4adf-aee6-0b36f081c2f1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8edc56'},body:JSON.stringify({sessionId:'8edc56',runId:'saga-import-debug',hypothesisId:'H3',location:'main.js:2912',message:'flight selection counts',data:{testMode,requestedSagaUsers:requestedSagaUserIds.size,flightsInput:flightsInput.length,groupedFlights:groupedFlights.length,filteredGroups:filteredGroups.length,selectedGroups:selectedGroups.length},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
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
  // #region agent log
  fetch('http://127.0.0.1:7507/ingest/74fbafb9-127e-4adf-aee6-0b36f081c2f1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8edc56'},body:JSON.stringify({sessionId:'8edc56',runId:'saga-import-debug',hypothesisId:'H4',location:'main.js:2950',message:'selected users for import',data:{usersInput:usersInput.length,selectedUsers:selectedUsers.length,selectedCanacs:selectedCanacs.size,instructorCanacs:instructorCanacs.size},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

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
    const detail = importCookieJar
      ? await fetchSagaUserDetail(importCookieJar, sagaUser.id, { apiV2Token }).catch(() => null)
      : null;
    const sagaUserWithDetail = detail ? { ...sagaUser, detail } : sagaUser;
    const result = await importSagaUser(sagaUserWithDetail, role, { testMode, useEmailAlias });
    if (result.userId && cleanString(sagaUser.codigoAnac)) usersByCanac.set(cleanString(sagaUser.codigoAnac), result.userId);
    if (result.userId && cleanString(sagaUser.id)) usersBySagaId.set(cleanString(sagaUser.id), result.userId);
    if (result.userId) {
      importedUsers.push({ sagaUser: sagaUserWithDetail, userId: result.userId, role });
      const anac = await syncSagaUserAnac(result.userId, sagaUserWithDetail);
      if (anac.error) summary.anacFailed += 1;
      else if (anac.skipped || anac.pending) summary.anacPending += 1;
      else summary.anacSynced += 1;
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
    if (sagaFlightNeedsMissionMapping(group, mapping, catalogs)) {
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
  // #region agent log
  fetch('http://127.0.0.1:7507/ingest/74fbafb9-127e-4adf-aee6-0b36f081c2f1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8edc56'},body:JSON.stringify({sessionId:'8edc56',runId:'saga-import-debug',hypothesisId:'H4',location:'main.js:3078',message:'imported users role split',data:{importedUsers:importedUsers.length,importedStudents:importedStudents.length,importedInstructors:importedUsers.filter((item)=>item.role==='instrutor').length},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  if (importScope.credits && importedStudents.length && STUDENT_CREDITS_COLLECTION_ID) {
    try {
      await reportProgress("Creditos", `Buscando creditos SAGA de ${importedStudents.length} aluno(s).`, 0, importedStudents.length, true);
      const cookieJar = await sagaLoginSession(payload.email, payload.password, summary.logs);
      const creditRows = applySagaCreditColumnMap(
        await fetchSagaCreditsForUsers(importedStudents.map((item) => item.sagaUser), cookieJar, summary.logs),
        mapping.creditColumnMap,
      );
      // #region agent log
      fetch('http://127.0.0.1:7507/ingest/74fbafb9-127e-4adf-aee6-0b36f081c2f1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'8edc56'},body:JSON.stringify({sessionId:'8edc56',runId:'saga-import-debug',hypothesisId:'H5',location:'main.js:3085',message:'credit rows fetched after remap',data:{importedStudents:importedStudents.length,creditRows:creditRows.length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
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
      for (const credit of creditRows) {
        const userId = userBySagaId.get(cleanString(credit.sagaUserId));
        if (!userId) continue;
        const list = creditRowsByUserId.get(userId) || [];
        list.push({ ...credit, userId, modelId: cleanString(mapping.creditAircraftBySaga?.[cleanString(credit.model)]) });
        creditRowsByUserId.set(userId, list);
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
          const result = await upsertSagaCredit(actorUserId, credit, userId, mapping, catalogs, { testMode });
          if (result.created) {
            summary.creditsCreated += 1;
            summary.creditHoursImported += result.hours || 0;
            coveredCreditFingerprints.add(sagaCreditFingerprint(userId, credit._sourceCredit || credit));
          } else if (result.updated) {
            summary.creditsUpdated += 1;
            summary.creditHoursImported += result.hours || 0;
            coveredCreditFingerprints.add(sagaCreditFingerprint(userId, credit._sourceCredit || credit));
          } else {
            summary.creditsSkipped += 1;
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
      const financialEntries = financialEntriesInput.filter((entry) => !/cancel|estorn|exclu/i.test(cleanString(entry.status)));
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
        const result = await upsertSagaFinancialCredit(actorUserId, entry, student.userId, mapping, catalogs, { testMode, matchedCredit });
        if (result.created) {
          summary.financialCreditsCreated += 1;
          summary.creditHoursImported += result.hours || 0;
        } else if (result.updated) {
          summary.financialCreditsUpdated += 1;
          summary.creditHoursImported += result.hours || 0;
        } else {
          summary.financialCreditsSkipped += 1;
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

async function requireInstructorOrAdmin(actorUserId) {
  if (!actorUserId) throw Object.assign(new Error("Unauthorized request."), { status: 401 });
  const [profile, actor] = await Promise.all([getProfileByUserId(actorUserId), users.get({ userId: actorUserId })]);
  const profileRole = normalizeRole(profile?.role);
  const labelRole = deriveRoleFromLabels(actor?.labels || []);
  if (!["admin", "instrutor"].includes(profileRole) && !["admin", "instrutor"].includes(labelRole)) {
    throw Object.assign(new Error("Apenas administradores ou instrutores podem consultar voos do SAGA."), { status: 403 });
  }
  return actor;
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

  await databases.updateDocument(DATABASE_ID, CRM_LEADS_COLLECTION_ID, lead.$id, {
    crm_status: "aguardando_assinatura_pagamento",
  });

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
  const role = VALID_ROLES.has(profile?.role) ? profile.role : deriveRoleFromLabels(user.labels || []);
  const profilePayload = toProfile(profile, preference, documents);
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

  const periodRows = periodFlightDocs
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
      normalizeSearch([profile.full_name, profile.nickname, profile.cpf, profile.phone, profile.anac_code, profile.email, profile.user_id].join(" ")).includes(
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
  return toUserRecord(
    user,
    profileByUserId.get(targetUserId) || null,
    prefByUserId.get(targetUserId) || null,
    flights,
    plans,
    trainingByUserId.get(targetUserId) || [],
    instructorProfilesByUserId,
    documents,
  );
}

async function upsertProfile(userId, email, role, customRoleSlug = null) {
  const existing = await getProfileByUserId(userId);
  const data = {
    user_id: userId,
    email,
    role,
    school_id: SCHOOL_ID,
    is_active: existing?.is_active !== false,
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
const ONBOARDING_SETTINGS_KEY = "onboarding";
const REFER_AND_EARN_SETTINGS_KEY = "referAndEarn";
const GOOGLE_CALENDAR_SETTINGS_KEY = "googleCalendar";
const CAKTO_SETTINGS_KEY = "cakto";
const FLIGHT_CREDIT_SALES_SETTINGS_KEY = "flightCreditSales";
const NOTIFICATION_CHANNELS = ["email", "push"];
const STUDENT_PORTAL_TABS = ["home", "jornada", "meus-voos", "agendamento", "schedule", "creditos", "avisos", "manuais", "manobras", "ajuda", "perfil"];
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
  const [profile, actor] = await Promise.all([
    getProfileByUserId(actorUserId).catch(() => null),
    users.get({ userId: actorUserId }).catch(() => null),
  ]);
  const profileRole = normalizeRole(profile?.role);
  const labelRole = deriveRoleFromLabels(actor?.labels || []);
  return profileRole === "aluno" && labelRole ? labelRole : profileRole || labelRole;
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

  return {
    flightId: flightDoc.$id,
    missionName,
    studentName,
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
      mode: "intentions",
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
      mode: ["booking", "view", "closed", "intentions"].includes(settings?.schedule?.mode)
        ? settings.schedule.mode
        : defaults.schedule.mode,
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
    packages: [],
  };
}

function publicFlightCreditSalesConfig(settings, updatedAt = null, activeOnly = false) {
  const source = settings && typeof settings === "object" ? settings : defaultFlightCreditSalesConfig();
  const packages = Array.isArray(source.packages) ? source.packages : [];
  return {
    studentPurchasesEnabled: Boolean(source.studentPurchasesEnabled),
    nightHoursDifferentFromDay: source.nightHoursDifferentFromDay !== false,
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

async function sanitizeFlightCreditPackages(rawPackages) {
  if (!Array.isArray(rawPackages)) {
    throw Object.assign(new Error("Lista de pacotes invalida."), { status: 400 });
  }
  const seenIds = new Set();
  const packages = [];
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
      active: raw?.active !== false,
    });
  }
  return packages;
}

async function saveFlightCreditSalesConfig(input) {
  if (!PLATFORM_SETTINGS_COLLECTION_ID) {
    throw Object.assign(new Error("Colecao de configuracoes da plataforma nao configurada."), { status: 500 });
  }
  const current = await loadFlightCreditSalesConfig();
  const settings = {
    studentPurchasesEnabled: Boolean(input?.studentPurchasesEnabled),
    nightHoursDifferentFromDay: input?.nightHoursDifferentFromDay !== false,
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
        price: Math.max(0, Number(item?.price) || 0),
      }))
    : [];
}

function proposalProductsFromJson(value) {
  const productsData = parseJsonObject(value, []);
  if (Array.isArray(productsData)) return proposalProducts({ products: productsData });
  return proposalProducts({ products: productsData?.products });
}

function mapCaktoProposal(doc) {
  const productsData = parseJsonObject(doc.products_json, []);
  const packageMetadata =
    productsData && !Array.isArray(productsData) && productsData.kind === "student_credit_package"
      ? productsData
      : null;
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
  const products = proposalProductsFromJson(doc.products_json);
  const price = Math.round((Number(doc.total_value || 0) + products.reduce((sum, item) => sum + (Number(item.price) || 0), 0)) * 100) / 100;
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
  return { offerId: cleanString(body.id), paymentUrl: `https://pay.cakto.com.br/${cleanString(body.id)}` };
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
      products_json: JSON.stringify(products),
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

async function createFlightCreditCheckout(actorUserId, packageId) {
  if (!actorUserId) throw Object.assign(new Error("Autenticacao necessaria."), { status: 401 });
  const role = await getActorRole(actorUserId);
  if (role !== "aluno") {
    throw Object.assign(new Error("A compra de pacotes esta disponivel apenas para alunos."), { status: 403 });
  }
  const { settings } = await loadFlightCreditSalesConfig();
  if (!settings?.studentPurchasesEnabled) {
    throw Object.assign(new Error("A compra de horas pelo aluno esta desabilitada."), { status: 403 });
  }
  const selected = (Array.isArray(settings.packages) ? settings.packages : [])
    .find((item) => cleanString(item?.id) === cleanString(packageId) && item?.active === true);
  const normalized = publicFlightCreditSalesConfig({ studentPurchasesEnabled: true, packages: selected ? [selected] : [] }, null, true).packages[0];
  if (!normalized) throw Object.assign(new Error("Pacote indisponivel para compra."), { status: 404 });

  const actor = await users.get({ userId: actorUserId });
  const profile = await getProfileByUserId(actorUserId).catch(() => null);
  const totalValue = Math.round(normalized.hours * normalized.hourPrice * 100) / 100;
  const snapshot = {
    packageId: normalized.id,
    hours: normalized.hours,
    hourPrice: normalized.hourPrice,
    totalValue,
    validityDays: normalized.validityDays,
    aircraftModelId: normalized.aircraftModelId,
    aircraftModelName: normalized.aircraftModelName,
  };
  const proposalId = sdk.ID.unique();
  const creditId = `fc_${crypto.createHash("sha256").update(proposalId).digest("hex").slice(0, 29)}`;
  const doc = await databases.createDocument(
    DATABASE_ID,
    CRM_PROPOSALS_COLLECTION_ID,
    proposalId,
    {
      school_id: SCHOOL_ID,
      lead_id: actorUserId,
      lead_name: cleanString(profile?.full_name) || cleanString(actor.name) || "Aluno",
      lead_email: cleanString(actor.email),
      hours: normalized.hours,
      hour_price: normalized.hourPrice,
      total_value: totalValue,
      products_json: JSON.stringify({
        kind: "student_credit_package",
        studentUserId: actorUserId,
        packageId: normalized.id,
        creditId,
        snapshot,
        products: [],
      }),
      public_token: crypto.randomUUID().replace(/-/g, "").slice(0, 24),
      status: "draft",
      payment_status: "pending",
    },
    [
      sdk.Permission.read(sdk.Role.any()),
      sdk.Permission.read(sdk.Role.user(actorUserId)),
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

async function adminCreateFlightCreditCheckout(actorUserId, targetUserId, packageId) {
  await requireAdmin(actorUserId);
  const safeTargetUserId = cleanString(targetUserId);
  if (!safeTargetUserId) throw Object.assign(new Error("Usuário de destino não informado."), { status: 400 });
  const safePackageId = cleanString(packageId);
  if (!safePackageId) throw Object.assign(new Error("Pacote não informado."), { status: 400 });
  const { settings } = await loadFlightCreditSalesConfig();
  const selected = (Array.isArray(settings.packages) ? settings.packages : [])
    .find((item) => cleanString(item?.id) === safePackageId && item?.active === true);
  const normalized = publicFlightCreditSalesConfig({ studentPurchasesEnabled: true, packages: selected ? [selected] : [] }, null, true).packages[0];
  if (!normalized) throw Object.assign(new Error("Pacote indisponível ou inativo."), { status: 404 });
  const targetUser = await users.get({ userId: safeTargetUserId });
  const targetProfile = await getProfileByUserId(safeTargetUserId).catch(() => null);
  const totalValue = Math.round(normalized.hours * normalized.hourPrice * 100) / 100;
  const snapshot = {
    packageId: normalized.id,
    hours: normalized.hours,
    hourPrice: normalized.hourPrice,
    totalValue,
    validityDays: normalized.validityDays,
    aircraftModelId: normalized.aircraftModelId,
    aircraftModelName: normalized.aircraftModelName,
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
      hours: normalized.hours,
      hour_price: normalized.hourPrice,
      total_value: totalValue,
      products_json: JSON.stringify({
        kind: "student_credit_package",
        studentUserId: safeTargetUserId,
        packageId: normalized.id,
        creditId,
        snapshot,
        products: [],
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

async function listCaktoReceipts(input) {
  const docs = await listAllDocuments(CAKTO_RECEIPTS_COLLECTION_ID, [
    sdk.Query.equal("school_id", [SCHOOL_ID]),
    sdk.Query.orderDesc("received_at"),
    sdk.Query.limit(500),
  ]);
  const search = cleanString(input?.search).toLowerCase();
  const from = cleanString(input?.dateFrom);
  const to = cleanString(input?.dateTo);
  const rows = docs.map(mapCaktoReceipt).filter((row) => {
    if (input?.eventType && row.eventType !== input.eventType) return false;
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
  const summary = rows.reduce((acc, row) => {
    if (row.eventType === "purchase_approved") acc.approved += row.amount;
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
  }
  return "";
}

function sagaScheduleSummaryPayload(ctx, mapping) {
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
  const notes = [
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
    const requestPayload = sagaScheduleSummaryPayload(ctx, mapping);
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

async function sagaImportSelfFlights(actorUserId, runtimeLog, importRunId = null) {
  const logLine = (msg) => { if (typeof runtimeLog === "function") runtimeLog(msg); };
  if (!actorUserId) throw Object.assign(new Error("Autenticacao necessaria."), { status: 401 });

  const runId = importRunId || crypto.randomUUID();
  await saveSagaImportProgress({ runId, status: "running", stage: "login", message: "Conectando ao SAGA...", current: 0, total: 0, logs: [] });

  const profile = await getProfileByUserId(actorUserId);
  const anac = cleanString(profile?.anac_code);
  if (!anac) throw Object.assign(new Error("Codigo ANAC nao encontrado no perfil. Atualize seu cadastro antes de sincronizar."), { status: 400 });

  const { credentials, mapping } = await loadSagaImportSettings();
  if (!credentials.email || !credentials.password) {
    throw Object.assign(new Error("Credenciais SAGA nao configuradas pelo administrador."), { status: 400 });
  }

  logLine(`[sagaImportSelfFlights] ANAC=${anac} userId=${actorUserId}`);
  const logs = [];

  const makeSummary = (overrides = {}) => ({
    importRunId: runId, testMode: false, useEmailAlias: false,
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
    ...overrides,
  });

  const cookieJar = await sagaLoginSession(credentials.email, credentials.password, logs);
  await saveSagaImportProgress({ runId, status: "running", stage: "fetch", message: "Buscando voos no SAGA...", current: 0, total: 0, logs });

  const operationsRange = sagaDateRangeMonths(24);
  const operationsPath = `/reports/operations?start_date=${operationsRange.startDate}&end_date=${operationsRange.endDate}`;
  const operations = await sagaFetch(operationsPath, {
    method: "GET",
    headers: { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", referer: `${SAGA_BASE_URL}/users` },
  }, cookieJar);
  const allFlightRows = translateSagaFlightRows(operations.html);
  const mappedFlightRows = applySagaFlightColumnMap(allFlightRows.rows, mapping.flightColumnMap);

  const myFlightRows = mappedFlightRows.filter(
    (row) => cleanString(row.canacAluno) === anac || cleanString(row.canacInstrutor) === anac,
  );
  logs.push(`Voos filtrados por ANAC ${anac}: ${myFlightRows.length}/${mappedFlightRows.length} voo(s).`);
  logLine(`[sagaImportSelfFlights] ${myFlightRows.length} voo(s) filtrados para ANAC ${anac}.`);

  if (!myFlightRows.length) {
    await saveSagaImportProgress({ runId, status: "completed", stage: "done", message: "Nenhum voo encontrado no SAGA.", current: 0, total: 0, logs });
    const zeroSummary = makeSummary();
    await saveSagaImportLastSummary(compactSagaImportSummary(zeroSummary)).catch(() => null);
    return { ok: true, summary: zeroSummary };
  }

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

  let repairedExisting = 0;
  for (const group of existingGroups) {
    const repair = await repairExistingSagaFlight(sagaDocId("saga_flight", group.key), logs);
    if (repair.repaired) repairedExisting += 1;
  }
  if (repairedExisting > 0) {
    summary.flightsUpdated += repairedExisting;
    logs.push(`Voos SAGA existentes reparados: ${repairedExisting}.`);
  }

  if (!newGroups.length) {
    const message = repairedExisting > 0
      ? `${repairedExisting} voo(s) existente(s) reparado(s).`
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
  logs.push(`Voos: ${summary.flightsCreated} criados, ${summary.flightsUpdated} atualizados, ${summary.flightsSkipped} ignorados.`);
  logLine(`[sagaImportSelfFlights] ${summary.flightsCreated} criados, ${summary.flightsUpdated} atualizados, ${summary.flightsSkipped} ignorados.`);

  await saveSagaImportProgress({ runId, status: "completed", stage: "done", message: `Concluido: ${summary.flightsCreated} novo(s), ${summary.flightsUpdated} atualizado(s).`, current: newGroups.length, total: newGroups.length, logs });
  await saveSagaImportLastSummary(compactSagaImportSummary(summary)).catch(() => null);
  return { ok: true, summary };
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
  const rawCredits = await fetchSagaCreditsForUsers([sagaUser], cookieJar, logs);
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

  const creditRowsWithUser = creditRows.map((c) => ({ ...c, userId: actorUserId }));
  let effectiveCredits = buildSagaUnsegmentedCredits(creditRowsWithUser);
  if (segmentNightHours && creditRowsWithUser.length > 0) {
    try {
      const operationsRange = sagaDateRangeMonths(24);
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

  for (const credit of effectiveCredits) {
    const result = await upsertSagaCredit(actorUserId, credit, actorUserId, mapping, catalogs, { testMode: false });
    if (result.created) {
      summary.creditsCreated += 1;
      summary.creditHoursImported += result.hours || 0;
    } else if (result.updated) {
      summary.creditsUpdated += 1;
      summary.creditHoursImported += result.hours || 0;
    } else {
      summary.creditsSkipped += 1;
      summary.skippedCredits.push({
        student: cleanString(credit.studentName),
        model: cleanString(credit.model),
        hours: cleanString(credit.hours || credit.hoursHhmm),
        reason: result.reason || "unknown",
        message: sagaImportCreditSkipReasonLabel(result.reason || "unknown"),
      });
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
    log(`[action=${action}] userId=${actorUserId || "(none)"}`);

    if (!actorUserId && action === "listSummaries") {
      const [reminderResult, scheduleResult] = await Promise.all([
        runFlightReminderScan("system"),
        syncSagaScheduleFromImportSettings("system").catch((err) => ({ ok: false, message: String(err?.message || err) })),
      ]);
      return jsonResponse(res, 200, { ok: true, ...reminderResult, sagaScheduleSync: scheduleResult });
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
      const result = await sagaImportSelfFlights(actorUserId, log, cleanString(payload.importRunId) || null);
      return jsonResponse(res, 200, result);
    }

    if (action === "sagaImportSelfCredits") {
      if (!actorUserId) return jsonResponse(res, 401, { ok: false, message: "Autenticacao necessaria." });
      const result = await sagaImportSelfCredits(actorUserId, log);
      return jsonResponse(res, 200, result);
    }

    if (action === "getAvailableFlightCreditPackages") {
      if (!actorUserId) return jsonResponse(res, 401, { message: "Autenticacao necessaria." });
      const role = await getActorRole(actorUserId);
      if (role !== "aluno") return jsonResponse(res, 403, { message: "Apenas alunos podem consultar pacotes para compra." });
      const { settings, doc } = await loadFlightCreditSalesConfig();
      const config = publicFlightCreditSalesConfig(settings, doc?.$updatedAt || null, true);
      if (!config.studentPurchasesEnabled) config.packages = [];
      return jsonResponse(res, 200, { config });
    }

    if (action === "createFlightCreditCheckout") {
      const checkout = await createFlightCreditCheckout(actorUserId, payload.packageId);
      return jsonResponse(res, 200, { checkout });
    }

    if (action === "adminCreateFlightCreditCheckout") {
      const checkout = await adminCreateFlightCreditCheckout(actorUserId, payload.targetUserId, payload.packageId);
      return jsonResponse(res, 200, { checkout });
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

    if (action === "getStudentsProgress") {
      await requireInstructorOrAdmin(actorUserId);
      const studentsProgress = await getStudentsProgress(payload);
      return jsonResponse(res, 200, { studentsProgress });
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
      const report = await listFlightReports(payload);
      return jsonResponse(res, 200, report);
    }

    await requireAdmin(actorUserId);

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

    if (action === "sagaGetImportSettings") {
      const settings = await loadSagaImportSettings();
      return jsonResponse(res, 200, { ok: true, ...settings });
    }

    if (action === "sagaSaveImportMapping") {
      const mapping = await saveSagaImportMapping(payload.mapping || payload);
      return jsonResponse(res, 200, { ok: true, mapping });
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

    if (action === "updateProfile") {
      const user = await updateAdminUserProfile(actorUserId, String(payload.userId || ""), payload.profile || payload);
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

    if (action === "listSummaries" || action === "list") {
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

