const sdk = require("node-appwrite");

const client = new sdk.Client()
  .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT || "")
  .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID || "")
  .setKey(process.env.APPWRITE_API_KEY || "");

const databases = new sdk.Databases(client);
const storage = new sdk.Storage(client);

const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const FLIGHTS_COLLECTION_ID = process.env.APPWRITE_FLIGHTS_COLLECTION_ID;
const PROFILES_COLLECTION_ID = process.env.APPWRITE_PROFILES_COLLECTION_ID;
const INSTRUCTOR_STUDENTS_COLLECTION_ID = process.env.APPWRITE_INSTRUCTOR_STUDENTS_COLLECTION_ID;
const BUCKET_ID = process.env.APPWRITE_BUCKET_ID || "";
const SCHOOL_ID = process.env.SCHOOL_ID || process.env.APPWRITE_SCHOOL_ID || "escola_principal";

const VALID_ROLES = new Set(["admin", "instrutor", "aluno"]);
const META_PREFIX = "#GFV_META_V1:";
const TELEMETRY_FILES_PREFIX = "#GFV_TELEMETRY_FILES_V1:";

function jsonResponse(res, status, payload) {
  return res.json(payload, status);
}

async function getProfileByUserId(userId) {
  const res = await databases.listDocuments(DATABASE_ID, PROFILES_COLLECTION_ID, [
    sdk.Query.equal("user_id", userId),
    sdk.Query.limit(1),
  ]);
  return res.documents[0] || null;
}

function getEffectiveRole(profile) {
  const active = String(profile?.active_role || "").trim();
  const legacy = String(profile?.role || "").trim();
  const role = active || legacy;
  return VALID_ROLES.has(role) ? role : "aluno";
}

async function hasInstructorStudentRelation(instructorUserId, studentUserId) {
  const res = await databases.listDocuments(DATABASE_ID, INSTRUCTOR_STUDENTS_COLLECTION_ID, [
    sdk.Query.equal("instructor_user_id", instructorUserId),
    sdk.Query.equal("student_user_id", studentUserId),
    sdk.Query.limit(1),
  ]);
  return res.total > 0;
}

function decodeBase64Json(encoded) {
  try {
    return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function decodeFlightRecord(recordText) {
  const normalized = String(recordText || "").replace(/^\uFEFF/, "");
  const lines = normalized.split(/\r?\n/);
  const first = String(lines[0] || "").trim();
  if (!first.startsWith(META_PREFIX)) return { meta: null, telemetryCsv: normalized };

  const meta = decodeBase64Json(first.slice(META_PREFIX.length).trim());
  const second = String(lines[1] || "").trim();
  if (second.startsWith(TELEMETRY_FILES_PREFIX)) {
    const parsed = decodeBase64Json(second.slice(TELEMETRY_FILES_PREFIX.length).trim());
    const files = Array.isArray(parsed?.files) ? parsed.files : [];
    const telemetryCsv = files
      .map((file) => (typeof file?.text === "string" ? file.text.trim() : ""))
      .filter(Boolean)
      .join("\n");
    return { meta, telemetryCsv: telemetryCsv || lines.slice(2).join("\n") };
  }

  return { meta, telemetryCsv: lines.slice(1).join("\n") };
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

function blockMinutesFromMeta(meta) {
  let total = 0;
  let found = false;
  for (const leg of meta?.legs || []) {
    const minutes = clockDiffMinutes(leg.engineStart, leg.engineCut);
    if (minutes === null) continue;
    total += minutes;
    found = true;
  }
  return found ? total : clockDiffMinutes(meta?.header?.departureTimeUtc, meta?.header?.engineCutoffTimeUtc);
}

function firstLegEngineStart(meta) {
  return (meta?.legs || []).find((leg) => String(leg.engineStart || "").trim())?.engineStart?.trim() || null;
}

function parseMiles(value) {
  const normalized = String(value || "").replace(/[^\d.,-]/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function isWeightBalanceComplete(meta) {
  const weightBalance = meta?.weightBalance;
  return Boolean(
    weightBalance &&
      weightBalance.inputs?.occupantsWeightKg != null &&
      weightBalance.inputs?.baggageWeightKg != null &&
      weightBalance.inputs?.rampFuel?.value != null &&
      weightBalance.inputs?.taxiFuel?.value != null &&
      weightBalance.inputs?.tripFuel?.value != null &&
      weightBalance.results?.isComplete,
  );
}

function buildMaterializedFields(csvText, fallbackMissionId) {
  const decoded = decodeFlightRecord(csvText);
  const meta = decoded.meta;
  const training = meta?.training || {};
  const missionIds = Array.from(new Set([...(training.missionIds || []), training.missionId || "", fallbackMissionId || ""].filter(Boolean)));
  if (!meta) {
    return {
      flight_date: null,
      start_time: null,
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
      schedule_week_start: null,
      schedule_demand_id: null,
    };
  }

  const airports = [];
  for (const leg of meta.legs || []) {
    const dep = String(leg.dep || "").trim().toUpperCase();
    const arr = String(leg.arr || "").trim().toUpperCase();
    if (dep && airports[airports.length - 1] !== dep) airports.push(dep);
    if (arr && airports[airports.length - 1] !== arr) airports.push(arr);
  }
  const totalFlightMinutes = (meta.legs || []).reduce((acc, leg) => acc + parseDurationToMinutes(leg.flightTime), 0);
  const blockTimeMinutes = blockMinutesFromMeta(meta);
  const landings = (meta.legs || []).reduce((acc, leg) => acc + Math.max(0, Math.round(Number(leg.landings || 0))), 0);
  const totalMiles = (meta.legs || []).reduce((acc, leg) => acc + parseMiles(leg.distance), 0);
  const instructorSuggestion = String(meta.preFlight?.instructorSuggestionMd || "").trim();
  const studentSuggestion = String(meta.preFlight?.studentSuggestionMd || "").trim();

  return {
    flight_date: meta.header?.date || null,
    start_time: firstLegEngineStart(meta) || String(meta.header?.departureTimeUtc || meta.header?.startTime || "").trim() || null,
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
    weight_balance_complete: isWeightBalanceComplete(meta),
    is_night: meta.header?.isNight ?? false,
    training_mission_ids_json: missionIds.length > 0 ? JSON.stringify(missionIds) : null,
    schedule_week_start: meta.schedule?.weekStart || null,
    schedule_demand_id: meta.schedule?.demandId || null,
  };
}

module.exports = async ({ req, res, log, error }) => {
  try {
    if (!DATABASE_ID || !FLIGHTS_COLLECTION_ID || !PROFILES_COLLECTION_ID || !INSTRUCTOR_STUDENTS_COLLECTION_ID) {
      return jsonResponse(res, 500, { message: "Missing required function environment variables." });
    }

    const userId = req.headers["x-appwrite-user-id"];
    if (!userId) {
      return jsonResponse(res, 401, { message: "Unauthorized request." });
    }

    const payload = req.bodyJson || {};
    const studentUserId = String(payload.studentUserId || "").trim();
    const sourceFilename = String(payload.source_filename || "").trim();
    const csvText = String(payload.csv_text || "");
    const aircraftIdent = payload.aircraft_ident ? String(payload.aircraft_ident) : null;
    const durationSec = payload.duration_sec == null ? null : Number(payload.duration_sec);
    const materializedFields = buildMaterializedFields(csvText, payload.trainingMissionId || payload.training_mission_id || null);

    if (!studentUserId || !sourceFilename || !csvText) {
      return jsonResponse(res, 400, { message: "Missing required fields." });
    }

    const actorProfile = await getProfileByUserId(userId);
    const actorRole = getEffectiveRole(actorProfile);
    if (!VALID_ROLES.has(actorRole)) {
      return jsonResponse(res, 403, { message: "User role is not allowed." });
    }
    if (actorRole === "aluno") {
      return jsonResponse(res, 403, { message: "Students cannot create flights." });
    }

    if (actorRole === "instrutor") {
      const allowed = await hasInstructorStudentRelation(userId, studentUserId);
      if (!allowed) {
        return jsonResponse(res, 403, { message: "Instructor is not linked to this student." });
      }
    }

    const permissions = [
      sdk.Permission.read(sdk.Role.user(studentUserId)),
      sdk.Permission.read(sdk.Role.user(userId)),
      sdk.Permission.update(sdk.Role.user(userId)),
      sdk.Permission.delete(sdk.Role.user(userId)),
      sdk.Permission.read(sdk.Role.label("admin")),
      sdk.Permission.update(sdk.Role.label("admin")),
      sdk.Permission.delete(sdk.Role.label("admin")),
      sdk.Permission.read(sdk.Role.label("instrutor")),
      sdk.Permission.update(sdk.Role.label("instrutor")),
    ];

    let csvFileId = null;
    if (BUCKET_ID) {
      const uploaded = await storage.createFile(
        BUCKET_ID,
        sdk.ID.unique(),
        sdk.InputFile.fromBuffer(Buffer.from(csvText, "utf8"), sourceFilename),
        permissions,
      );
      csvFileId = uploaded.$id;
    }

    const doc = await databases.createDocument(
      DATABASE_ID,
      FLIGHTS_COLLECTION_ID,
      sdk.ID.unique(),
      {
        school_id: SCHOOL_ID,
        user_id: studentUserId,
        student_user_id: studentUserId,
        instructor_user_id: userId,
        created_by_role: actorRole,
        name: [aircraftIdent, materializedFields.flight_date, materializedFields.start_time].filter(Boolean).join(" ") || sourceFilename || "Voo",
        source_filename: sourceFilename,
        csv_text: csvFileId ? "" : csvText,
        csv_file_id: csvFileId,
        aircraft_ident: aircraftIdent,
        duration_sec: Number.isFinite(durationSec) ? durationSec : null,
        flight_date: materializedFields.flight_date,
        start_time: materializedFields.start_time,
        training_track_id: payload.trainingTrackId || payload.training_track_id || null,
        training_stage_id: payload.trainingStageId || payload.training_stage_id || null,
        training_mission_id: payload.trainingMissionId || payload.training_mission_id || null,
        training_snapshot_json: payload.trainingSnapshot ? JSON.stringify(payload.trainingSnapshot) : payload.training_snapshot_json || null,
        flight_status: "Confirmado",
        ...materializedFields,
      },
      permissions,
    );

    return jsonResponse(res, 201, { id: doc.$id });
  } catch (err) {
    error(String(err?.message || err));
    log(String(err?.stack || ""));
    return jsonResponse(res, 500, { message: err?.message || "Unexpected function error." });
  }
};
