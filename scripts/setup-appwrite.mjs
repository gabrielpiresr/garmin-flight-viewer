import { Client, Databases, ID } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;

if (!ENDPOINT || !PROJECT_ID || !API_KEY) {
  console.error("Missing APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID or APPWRITE_API_KEY.");
  process.exit(1);
}

const DB_NAME = "flights-db";
const FLIGHTS_COL_NAME = "flights";
const PROFILES_COL_NAME = "profiles";
const REL_COL_NAME = "instructor_students";
const FLIGHT_VIDEOS_COL_NAME = "flight_videos";

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureDatabase() {
  const existing = await db.list();
  const found = existing.databases.find((database) => database.name === DB_NAME);
  if (found) return found;
  return db.create(ID.unique(), DB_NAME);
}

async function ensureCollection(databaseId, name) {
  const list = await db.listCollections(databaseId);
  const found = list.collections.find((collection) => collection.name === name);
  if (found) return found;
  return db.createCollection(databaseId, ID.unique(), name, [], true, true);
}

async function safeCreateAttribute(createFn, label) {
  try {
    await createFn();
    await sleep(700);
    console.log(`   ✓ ${label}`);
  } catch (error) {
    const message = error?.message ?? String(error);
    if (message.toLowerCase().includes("already exists")) {
      console.log(`   • ${label} (already exists)`);
      return;
    }
    throw error;
  }
}

async function safeCreateIndex(databaseId, collectionId, key, attributes, orders = ["ASC"]) {
  try {
    await db.createIndex(databaseId, collectionId, key, "key", attributes, orders);
    await sleep(700);
    console.log(`   ✓ index ${key}`);
  } catch (error) {
    const message = error?.message ?? String(error);
    if (message.toLowerCase().includes("already exists")) {
      console.log(`   • index ${key} (already exists)`);
      return;
    }
    throw error;
  }
}

async function configureFlights(databaseId, collectionId) {
  console.log("\nConfiguring flights collection...");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "name", 255, true), "name");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "source_filename", 255, true), "source_filename");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "user_id", 64, false), "user_id (legacy)");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "student_user_id", 64, true), "student_user_id");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "instructor_user_id", 64, false), "instructor_user_id");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "created_by_role", 16, true), "created_by_role");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "aircraft_ident", 64, false), "aircraft_ident");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "duration_sec", false), "duration_sec");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "flight_date", 10, false), "flight_date");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "start_time", 8, false), "start_time");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "csv_file_id", 64, false), "csv_file_id");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "csv_text", 10485760, false), "csv_text");

  await safeCreateIndex(databaseId, collectionId, "flights_student_idx", ["student_user_id"]);
  await safeCreateIndex(databaseId, collectionId, "flights_instructor_idx", ["instructor_user_id"]);
  await safeCreateIndex(databaseId, collectionId, "flights_date_idx", ["flight_date"]);
}

async function configureProfiles(databaseId, collectionId) {
  console.log("\nConfiguring profiles collection...");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "user_id", 64, true), "user_id");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "email", 255, true), "email");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "role", 16, true), "role");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "full_name", 255, false), "full_name");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "cpf", 14, false), "cpf");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "phone", 32, false), "phone");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "birth_date", 10, false), "birth_date");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "weight_kg", false), "weight_kg");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "height_cm", false), "height_cm");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "anac_code", 32, false), "anac_code");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "anac_ratings_json", 65535, false), "anac_ratings_json");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "anac_licenses_json", 65535, false), "anac_licenses_json");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "anac_medical_json", 8192, false), "anac_medical_json");
  await safeCreateAttribute(
    () => db.createStringAttribute(databaseId, collectionId, "anac_photo_file_id", 64, false),
    "anac_photo_file_id",
  );
  await safeCreateAttribute(
    () => db.createStringAttribute(databaseId, collectionId, "anac_sync_status", 16, false),
    "anac_sync_status",
  );
  await safeCreateAttribute(
    () => db.createStringAttribute(databaseId, collectionId, "anac_sync_error", 1024, false),
    "anac_sync_error",
  );
  await safeCreateAttribute(
    () => db.createStringAttribute(databaseId, collectionId, "anac_last_sync_at", 64, false),
    "anac_last_sync_at",
  );
  await safeCreateAttribute(
    () => db.createStringAttribute(databaseId, collectionId, "instructor_availability_json", 8192, false),
    "instructor_availability_json",
  );
  await safeCreateAttribute(
    () => db.createStringAttribute(databaseId, collectionId, "instructor_preference_level", 16, false),
    "instructor_preference_level",
  );
  await safeCreateIndex(databaseId, collectionId, "profiles_user_idx", ["user_id"]);
  await safeCreateIndex(databaseId, collectionId, "profiles_role_idx", ["role"]);
  await safeCreateIndex(databaseId, collectionId, "profiles_cpf_idx", ["cpf"]);
  await safeCreateIndex(databaseId, collectionId, "profiles_anac_code_idx", ["anac_code"]);
}

async function configureInstructorStudents(databaseId, collectionId) {
  console.log("\nConfiguring instructor_students collection...");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "instructor_user_id", 64, true), "instructor_user_id");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "student_user_id", 64, true), "student_user_id");
  await safeCreateIndex(databaseId, collectionId, "rel_instructor_idx", ["instructor_user_id"]);
  await safeCreateIndex(databaseId, collectionId, "rel_student_idx", ["student_user_id"]);
}

async function configureFlightVideos(databaseId, collectionId) {
  console.log("\nConfiguring flight_videos collection...");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "flight_id", 64, true), "flight_id");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "uploaded_by", 64, true), "uploaded_by");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "file_url", 2048, false), "file_url");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "processing_status", 32, true), "processing_status");
  await safeCreateAttribute(() => db.createIntegerAttribute(databaseId, collectionId, "file_size", false), "file_size");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "duration_sec", false), "duration_sec");
  await safeCreateAttribute(() => db.createIntegerAttribute(databaseId, collectionId, "original_files_count", false), "original_files_count");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "created_at", 64, false), "created_at");
  await safeCreateIndex(databaseId, collectionId, "flight_videos_flight_idx", ["flight_id"]);
}

async function main() {
  console.log("Starting Appwrite RBAC setup...");
  const database = await ensureDatabase();
  const flights = await ensureCollection(database.$id, FLIGHTS_COL_NAME);
  const profiles = await ensureCollection(database.$id, PROFILES_COL_NAME);
  const relationships = await ensureCollection(database.$id, REL_COL_NAME);
  const flightVideos = await ensureCollection(database.$id, FLIGHT_VIDEOS_COL_NAME);

  await configureFlights(database.$id, flights.$id);
  await configureProfiles(database.$id, profiles.$id);
  await configureInstructorStudents(database.$id, relationships.$id);
  await configureFlightVideos(database.$id, flightVideos.$id);

  console.log("\nSetup complete. Copy these frontend variables:\n");
  console.log(`VITE_APPWRITE_ENDPOINT=${ENDPOINT}`);
  console.log(`VITE_APPWRITE_PROJECT_ID=${PROJECT_ID}`);
  console.log(`VITE_APPWRITE_DATABASE_ID=${database.$id}`);
  console.log(`VITE_APPWRITE_COLLECTION_ID=${flights.$id}`);
  console.log(`VITE_APPWRITE_PROFILES_COLLECTION_ID=${profiles.$id}`);
  console.log(`VITE_APPWRITE_INSTRUCTOR_STUDENTS_COLLECTION_ID=${relationships.$id}`);
  console.log(`VITE_APPWRITE_VIDEOS_COLLECTION_ID=${flightVideos.$id}`);
}

main().catch((error) => {
  console.error("Setup failed:", error?.message ?? error);
  process.exit(1);
});
