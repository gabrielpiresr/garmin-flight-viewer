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

const VALID_ROLES = new Set(["admin", "instrutor", "aluno"]);

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

async function hasInstructorStudentRelation(instructorUserId, studentUserId) {
  const res = await databases.listDocuments(DATABASE_ID, INSTRUCTOR_STUDENTS_COLLECTION_ID, [
    sdk.Query.equal("instructor_user_id", instructorUserId),
    sdk.Query.equal("student_user_id", studentUserId),
    sdk.Query.limit(1),
  ]);
  return res.total > 0;
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

    if (!studentUserId || !sourceFilename || !csvText) {
      return jsonResponse(res, 400, { message: "Missing required fields." });
    }

    const actorProfile = await getProfileByUserId(userId);
    const actorRole = actorProfile?.role;
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
        user_id: studentUserId,
        student_user_id: studentUserId,
        instructor_user_id: userId,
        created_by_role: actorRole,
        name: [aircraftIdent, sourceFilename].filter(Boolean).join(" ") || "Voo",
        source_filename: sourceFilename,
        csv_text: csvFileId ? "" : csvText,
        csv_file_id: csvFileId,
        aircraft_ident: aircraftIdent,
        duration_sec: Number.isFinite(durationSec) ? durationSec : null,
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
