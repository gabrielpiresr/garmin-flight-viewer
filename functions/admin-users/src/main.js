const sdk = require("node-appwrite");

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
  return date > new Date().toISOString().slice(0, 10);
}

function isPlannedFlight(flight) {
  return flight.status === "draft" || isFutureFlight(flight);
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
  const distanceNm = legs.reduce((acc, leg) => acc + parseMiles(leg.distance), 0);
  const durationSec =
    typeof doc.duration_sec === "number" && doc.duration_sec > 0
      ? doc.duration_sec
      : totalMinutes > 0
        ? totalMinutes * 60
        : null;
  const sourceFilename = doc.source_filename || "";
  const status =
    meta?.status === "draft" || (!meta && (sourceFilename.startsWith("auto-scale-") || sourceFilename.startsWith("manual-scale-")))
      ? "draft"
      : "submitted";

  return {
    id: doc.$id,
    name: doc.name || "Voo",
    createdAt: doc.$createdAt || "",
    updatedAt: doc.$updatedAt || "",
    sourceFilename,
    aircraftIdent: meta?.header?.aircraft || doc.aircraft_ident || null,
    durationSec,
    flightDate: doc.flight_date || meta?.header?.date || (doc.$createdAt || "").slice(0, 10) || null,
    startTime: doc.start_time || meta?.header?.startTime || null,
    status,
    route: buildRoute(legs),
    landings,
    distanceNm: Number(distanceNm.toFixed(1)),
    studentName: meta?.header?.studentName || meta?.header?.studentLabel || "",
    studentAnac: meta?.header?.studentAnac || "",
    instructorName: meta?.header?.instructorName || "",
    instructorAnac: meta?.header?.instructorAnac || "",
    scheduleWeekStart: meta?.schedule?.weekStart || null,
    scheduleDemandId: meta?.schedule?.demandId || null,
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
  const plannedFlights = normalizedFlights.filter(isPlannedFlight);
  const plannedIds = new Set(plannedFlights.map((flight) => flight.id));
  const executedFlights = normalizedFlights.filter((flight) => !plannedIds.has(flight.id));
  const futureIntentions = plans.map(toPlan).sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  const executedHours = executedFlights.reduce((acc, flight) => acc + ((flight.durationSec || 0) / 3600), 0);
  const plannedHours = plannedFlights.reduce((acc, flight) => acc + ((flight.durationSec || 0) / 3600), 0);
  const requestedFlights = futureIntentions.reduce((acc, plan) => acc + plan.requestedFlightsCount, 0);
  const requestedHours = futureIntentions.reduce((acc, plan) => acc + plan.totalHours, 0);
  const landings = executedFlights.reduce((acc, flight) => acc + (flight.landings || 0), 0);

  return {
    executedFlights,
    plannedFlights,
    futureIntentions,
    executed: {
      count: executedFlights.length,
      hours: Number(executedHours.toFixed(1)),
      landings,
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

function toUserRecord(user, profile, preference, flights, plans) {
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
  };
}

function toUserSummary(user, profile, preference, flights, plans) {
  const detail = toUserRecord(user, profile, preference, flights, plans);
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

  return allUsers
    .map((user) => {
      const profile = profileByUserId.get(user.$id) || null;
      const preference = instructorPrefByUserId.get(user.$id) || null;
      return toUserRecord(user, profile, preference, flightsByUser.get(user.$id) || [], plansByUser.get(user.$id) || []);
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
  const { flightsByUser, plansByUser } = groupDataByUserId(flights, plans);
  const usersPage = pageUsers.map((user) =>
    toUserSummary(
      user,
      profileByUserId.get(user.$id) || null,
      prefByUserId.get(user.$id) || null,
      flightsByUser.get(user.$id) || [],
      plansByUser.get(user.$id) || [],
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
  const [[profileByUserId, prefByUserId], flights, plans] = await Promise.all([
    Promise.all([getProfilesByUserIds([targetUserId]), getInstructorPrefsByUserIds([targetUserId])]),
    getFlightsByUserIds([targetUserId], { includeCsv: true }),
    getPlansByUserIds([targetUserId]),
  ]);
  return toUserRecord(
    user,
    profileByUserId.get(targetUserId) || null,
    prefByUserId.get(targetUserId) || null,
    flights,
    plans,
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

module.exports = async ({ req, res, log, error }) => {
  try {
    if (!DATABASE_ID || !PROFILES_COLLECTION_ID) {
      return jsonResponse(res, 500, { message: "Missing APPWRITE_DATABASE_ID or APPWRITE_PROFILES_COLLECTION_ID." });
    }

    const actorUserId = req.headers["x-appwrite-user-id"];
    await requireAdmin(actorUserId);

    const payload = req.bodyJson || {};
    const action = String(payload.action || "listSummaries");

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

    if (action === "getDetail") {
      const user = await getUserDetail(String(payload.userId || ""));
      return jsonResponse(res, 200, { user });
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
