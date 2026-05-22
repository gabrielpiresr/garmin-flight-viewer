const crypto = require("node:crypto");
const sdk = require("node-appwrite");

const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.APPWRITE_ENDPOINT || "";
const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.APPWRITE_PROJECT_ID || "";
const apiKey = process.env.APPWRITE_API_KEY || "";

const adminClient = new sdk.Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new sdk.Databases(adminClient);
const users = new sdk.Users(adminClient);
const storage = new sdk.Storage(adminClient);

const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const FLIGHTS_COLLECTION_ID = process.env.APPWRITE_FLIGHTS_COLLECTION_ID || process.env.APPWRITE_COLLECTION_ID;
const SIGNATURES_COLLECTION_ID = process.env.APPWRITE_FLIGHT_SIGNATURES_COLLECTION_ID || process.env.APPWRITE_FLIGHT_SIGNATURES_COL_ID || "flight_signatures";
const AUDIT_EVENTS_COLLECTION_ID =
  process.env.APPWRITE_AUDIT_EVENTS_COLLECTION_ID ||
  process.env.APPWRITE_AUDIT_EVENTS_COL_ID ||
  "audit_events";
const PROFILES_COLLECTION_ID = process.env.APPWRITE_PROFILES_COLLECTION_ID || process.env.APPWRITE_PROFILES_COL_ID;
const BUCKET_ID = process.env.APPWRITE_BUCKET_ID || "";
const SCHOOL_ID = process.env.SCHOOL_ID || process.env.APPWRITE_SCHOOL_ID || "escola_principal";

const META_PREFIX = "#GFV_META_V1:";
const TELEMETRY_FILES_PREFIX = "#GFV_TELEMETRY_FILES_V1:";
const VALID_SIGNER_ROLES = new Set(["student", "instructor", "admin_operator"]);
const PAYLOAD_VERSION = "flight_signature_v1";

function jsonResponse(res, status, payload) {
  return res.json(payload, status);
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
  if (!first.startsWith(META_PREFIX)) return { meta: null };
  const meta = decodeBase64Json(first.slice(META_PREFIX.length).trim());
  const second = String(lines[1] || "").trim();
  if (second.startsWith(TELEMETRY_FILES_PREFIX)) return { meta };
  return { meta };
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

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

async function getProfileByUserId(userId) {
  if (!PROFILES_COLLECTION_ID) return null;
  const res = await databases.listDocuments(DATABASE_ID, PROFILES_COLLECTION_ID, [
    sdk.Query.equal("user_id", [userId]),
    sdk.Query.limit(1),
  ]);
  return res.documents[0] || null;
}

async function getCsvText(flightDoc) {
  const inline = String(flightDoc.csv_text || "");
  const csvFileId = flightDoc.csv_file_id ? String(flightDoc.csv_file_id) : "";
  if (!csvFileId || !BUCKET_ID) return inline;
  try {
    const file = await storage.getFileDownload(BUCKET_ID, csvFileId);
    if (Buffer.isBuffer(file)) return file.toString("utf8");
    if (file instanceof ArrayBuffer) return Buffer.from(file).toString("utf8");
    if (file && typeof file.arrayBuffer === "function") return Buffer.from(await file.arrayBuffer()).toString("utf8");
  } catch {
    return inline;
  }
  return inline;
}

function buildPayload({ flightDoc, meta, signerRole }) {
  return {
    version: PAYLOAD_VERSION,
    flightId: flightDoc.$id,
    schoolId: flightDoc.school_id || SCHOOL_ID,
    signerRole,
    aircraftIdent: flightDoc.aircraft_ident || meta?.header?.aircraft || null,
    flightDate: flightDoc.flight_date || meta?.header?.date || null,
    startTime: flightDoc.start_time || meta?.header?.startTime || meta?.header?.departureTimeUtc || null,
    studentUserId: flightDoc.student_user_id || flightDoc.user_id || meta?.header?.studentUserId || null,
    instructorUserId: flightDoc.instructor_user_id || meta?.header?.instructorUserId || null,
    header: meta?.header || null,
    legs: meta?.legs || [],
    technicalLog: meta?.technicalLog || null,
    weightBalance: meta?.weightBalance || null,
    flightStatus: flightDoc.flight_status || null,
  };
}

async function reauthenticateUser(email, password, expectedUserId) {
  const authClient = new sdk.Client().setEndpoint(endpoint).setProject(projectId);
  const account = new sdk.Account(authClient);
  let session;
  try {
    session = await account.createEmailPasswordSession(email, password);
  } catch (err) {
    if (err?.code === 401) throw new Error("Senha incorreta.");
    throw err;
  }
  if (session?.userId !== expectedUserId) throw new Error("A reautenticação não corresponde ao usuário atual.");
}

function assertFlightLink({ flightDoc, userId, profileRole, signerRole }) {
  if (signerRole === "student" && profileRole !== "aluno") throw new Error("Papel de assinatura inválido para o seu perfil.");
  if (signerRole === "instructor" && profileRole !== "instrutor") throw new Error("Papel de assinatura inválido para o seu perfil.");
  if (signerRole === "admin_operator" && profileRole !== "admin") throw new Error("Papel de assinatura inválido para o seu perfil.");
  if (signerRole === "student" && (flightDoc.student_user_id || flightDoc.user_id) !== userId) {
    throw new Error("Você não está vinculado a este voo como aluno.");
  }
  if (signerRole === "instructor" && flightDoc.instructor_user_id !== userId) {
    throw new Error("Você não está vinculado a este voo como instrutor.");
  }
}

async function assertNoDuplicate(flightId, signerRole) {
  const existing = await databases.listDocuments(DATABASE_ID, SIGNATURES_COLLECTION_ID, [
    sdk.Query.equal("flight_id", [flightId]),
    sdk.Query.equal("signer_role", [signerRole]),
    sdk.Query.limit(100),
  ]);
  if (existing.documents.some((doc) => String(doc.status || "active") === "active")) {
    throw new Error("Você já assinou este voo.");
  }
}

function signaturePermissions(flightDoc, actorUserId) {
  const permissions = [
    sdk.Permission.read(sdk.Role.user(actorUserId)),
    sdk.Permission.read(sdk.Role.label("admin")),
    sdk.Permission.update(sdk.Role.label("admin")),
    sdk.Permission.delete(sdk.Role.label("admin")),
  ];
  const studentUserId = flightDoc.student_user_id || flightDoc.user_id;
  const instructorUserId = flightDoc.instructor_user_id;
  if (studentUserId) permissions.push(sdk.Permission.read(sdk.Role.user(studentUserId)));
  if (instructorUserId) permissions.push(sdk.Permission.read(sdk.Role.user(instructorUserId)));
  return Array.from(new Set(permissions));
}

function toSignatureDoc(doc) {
  return {
    id: doc.$id,
    flight_id: doc.flight_id,
    signer_user_id: doc.signer_user_id,
    signer_role: doc.signer_role,
    signed_at: doc.signed_at,
    user_agent: doc.user_agent || null,
    content_hash: doc.content_hash || null,
    payload_version: doc.payload_version || null,
    payload_hash_alg: doc.payload_hash_alg || null,
    payload_snapshot_json: doc.payload_snapshot_json || null,
    reauthenticated_at: doc.reauthenticated_at || null,
    auth_method: doc.auth_method || null,
    school_id: doc.school_id || SCHOOL_ID,
    status: doc.status || "active",
    invalidated_at: doc.invalidated_at || null,
    invalidated_by: doc.invalidated_by || null,
    invalidation_reason: doc.invalidation_reason || null,
    invalidated_by_event_id: doc.invalidated_by_event_id || null,
    created_at: doc.$createdAt,
  };
}

function auditPermissions() {
  return [
    sdk.Permission.read(sdk.Role.label("admin")),
  ];
}

function snapshotJson(value) {
  const text = stableStringify(value ?? null);
  return text.length > 65535 ? text.slice(0, 65535) : text;
}

async function createAuditEvent(actorUserId, input = {}) {
  if (!AUDIT_EVENTS_COLLECTION_ID) return null;
  const beforeSnapshotJson = snapshotJson(input.beforeSnapshot ?? null);
  const afterSnapshotJson = snapshotJson(input.afterSnapshot ?? null);
  const eventPayload = {
    event_type: String(input.eventType || "").slice(0, 64),
    entity_type: String(input.entityType || "").slice(0, 64),
    entity_id: String(input.entityId || "").slice(0, 128),
    actor_user_id: String(actorUserId || "").slice(0, 64),
    actor_role: String(input.actorRole || "").slice(0, 32),
    school_id: SCHOOL_ID,
    occurred_at: new Date().toISOString(),
    ip: String(input.ip || "").slice(0, 128) || null,
    user_agent: String(input.userAgent || "").slice(0, 512) || null,
    reason: String(input.reason || "").slice(0, 2048) || null,
    before_snapshot_json: beforeSnapshotJson,
    after_snapshot_json: afterSnapshotJson,
    before_hash: sha256(beforeSnapshotJson),
    after_hash: sha256(afterSnapshotJson),
  };
  return databases.createDocument(
    DATABASE_ID,
    AUDIT_EVENTS_COLLECTION_ID,
    sdk.ID.unique(),
    {
      ...eventPayload,
      event_hash: sha256(stableStringify(eventPayload)),
    },
    auditPermissions(),
  );
}

module.exports = async ({ req, res, log, error }) => {
  try {
    if (!endpoint || !projectId || !apiKey || !DATABASE_ID || !FLIGHTS_COLLECTION_ID || !SIGNATURES_COLLECTION_ID) {
      return jsonResponse(res, 500, { message: "Missing required function environment variables." });
    }

    const actorUserId = req.headers["x-appwrite-user-id"];
    if (!actorUserId) return jsonResponse(res, 401, { message: "Unauthorized request." });

    const body = req.bodyJson || {};
    const flightId = String(body.flightId || "").trim();
    const signerRole = String(body.signerRole || "").trim();
    const password = String(body.password || "");
    const userAgent = String(body.userAgent || req.headers["user-agent"] || "").slice(0, 512);
    if (!flightId || !VALID_SIGNER_ROLES.has(signerRole) || !password) {
      return jsonResponse(res, 400, { message: "Missing required fields." });
    }

    const [actorUser, actorProfile, flightDoc] = await Promise.all([
      users.get(actorUserId),
      getProfileByUserId(actorUserId),
      databases.getDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, flightId),
    ]);
    assertFlightLink({ flightDoc, userId: actorUserId, profileRole: actorProfile?.role || "", signerRole });
    await assertNoDuplicate(flightId, signerRole);
    await reauthenticateUser(actorUser.email, password, actorUserId);

    const csvText = await getCsvText(flightDoc);
    const { meta } = decodeFlightRecord(csvText);
    const payloadSnapshotJson = stableStringify(buildPayload({ flightDoc, meta, signerRole }));
    const signedAt = new Date().toISOString();
    const signatureDoc = await databases.createDocument(
      DATABASE_ID,
      SIGNATURES_COLLECTION_ID,
      sdk.ID.unique(),
      {
        flight_id: flightId,
        signer_user_id: actorUserId,
        signer_role: signerRole,
        signed_at: signedAt,
        user_agent: userAgent,
        content_hash: sha256(payloadSnapshotJson),
        payload_version: PAYLOAD_VERSION,
        payload_hash_alg: "SHA-256",
        payload_snapshot_json: payloadSnapshotJson,
        reauthenticated_at: signedAt,
        auth_method: "password_reauth",
        school_id: flightDoc.school_id || SCHOOL_ID,
        status: "active",
      },
      signaturePermissions(flightDoc, actorUserId),
    );

    const patch = {};
    if (signerRole === "student") patch.student_signed = true;
    if (signerRole === "instructor") {
      patch.instructor_signed = true;
      patch.instructor_signed_at = signedAt;
      patch.flight_status = "Realizado";
    }
    if (signerRole === "admin_operator") patch.admin_operator_signed = true;
    await databases.updateDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, flightId, patch);
    await createAuditEvent(actorUserId, {
      eventType: "flight_signed",
      entityType: "flight",
      entityId: flightId,
      actorRole: signerRole,
      reason: `Assinatura ${signerRole}`,
      beforeSnapshot: { flightId, signerRole, flightStatus: flightDoc.flight_status || null },
      afterSnapshot: {
        signatureId: signatureDoc.$id,
        signerRole,
        signedAt,
        contentHash: signatureDoc.content_hash,
        patch,
      },
      userAgent,
      ip: req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "",
    });

    return jsonResponse(res, 200, { signature: toSignatureDoc(signatureDoc) });
  } catch (err) {
    const message = err?.message || "Unexpected function error.";
    const status = /senha incorreta|reautenticação/i.test(message)
      ? 401
      : /não está vinculado|inválido|já assinou|Papel de assinatura/i.test(message)
        ? 403
        : 500;
    error(message);
    log(String(err?.stack || ""));
    return jsonResponse(res, status, { message });
  }
};
