import { Client, Databases, ID, Permission, Role } from "node-appwrite";

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
const FLIGHT_TELEMETRY_SUMMARIES_COL_NAME = "flight_telemetry_summaries";
const FLIGHT_LANDINGS_COL_NAME = "flight_landings";
const FLIGHT_TAKEOFFS_COL_NAME = "flight_takeoffs";

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);
const FLIGHT_DATA_PERMISSIONS = [
  // Authenticated users — can create, read, update; only admin can delete
  Permission.create(Role.users()),
  Permission.read(Role.users()),
  Permission.update(Role.users()),
  Permission.create(Role.label("admin")),
  Permission.read(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
  Permission.create(Role.label("instrutor")),
  Permission.read(Role.label("instrutor")),
  Permission.update(Role.label("instrutor")),
];

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
  if (found) {
    // Always enforce required permissions (replace, not union) so stale/extra perms are removed
    const sortedCurrent = [...(found.$permissions ?? [])].sort().join(",");
    const sortedRequired = [...FLIGHT_DATA_PERMISSIONS].sort().join(",");
    if (sortedCurrent !== sortedRequired) {
      return db.updateCollection(databaseId, found.$id, found.name, FLIGHT_DATA_PERMISSIONS, found.documentSecurity, found.enabled);
    }
    return found;
  }
  return db.createCollection(databaseId, ID.unique(), name, FLIGHT_DATA_PERMISSIONS, true, true);
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
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "from_to", 255, false), "from_to");
  await safeCreateAttribute(() => db.createIntegerAttribute(databaseId, collectionId, "landings", false), "landings");
  await safeCreateAttribute(
    () => db.createIntegerAttribute(databaseId, collectionId, "total_flight_minutes", false),
    "total_flight_minutes",
  );
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "total_miles", false), "total_miles");
  await safeCreateAttribute(
    () => db.createBooleanAttribute(databaseId, collectionId, "telemetry_present", false),
    "telemetry_present",
  );
  await safeCreateAttribute(
    () => db.createStringAttribute(databaseId, collectionId, "instructor_suggestion_md", 65535, false),
    "instructor_suggestion_md",
  );
  await safeCreateAttribute(
    () => db.createStringAttribute(databaseId, collectionId, "student_suggestion_md", 65535, false),
    "student_suggestion_md",
  );
  await safeCreateAttribute(
    () => db.createBooleanAttribute(databaseId, collectionId, "instructor_suggestion_present", false),
    "instructor_suggestion_present",
  );
  await safeCreateAttribute(
    () => db.createBooleanAttribute(databaseId, collectionId, "student_suggestion_present", false),
    "student_suggestion_present",
  );
  await safeCreateAttribute(
    () => db.createBooleanAttribute(databaseId, collectionId, "weight_balance_complete", false),
    "weight_balance_complete",
  );
  await safeCreateAttribute(() => db.createBooleanAttribute(databaseId, collectionId, "is_night", false), "is_night");
  await safeCreateAttribute(
    () => db.createStringAttribute(databaseId, collectionId, "training_mission_ids_json", 4096, false),
    "training_mission_ids_json",
  );
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "flight_status", 16, false), "flight_status");

  await safeCreateIndex(databaseId, collectionId, "flights_student_idx", ["student_user_id"]);
  await safeCreateIndex(databaseId, collectionId, "flights_instructor_idx", ["instructor_user_id"]);
  await safeCreateIndex(databaseId, collectionId, "flights_date_idx", ["flight_date"]);
  await safeCreateIndex(databaseId, collectionId, "flights_date_time_idx", ["flight_date", "start_time"], ["ASC", "ASC"]);
  await safeCreateIndex(databaseId, collectionId, "flights_aircraft_date_idx", ["aircraft_ident", "flight_date"], ["ASC", "ASC"]);
  await safeCreateIndex(databaseId, collectionId, "flights_status_idx", ["flight_status"]);
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
  await safeCreateAttribute(() => db.createBooleanAttribute(databaseId, collectionId, "telemetry_present", false), "telemetry_present");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "telemetry_source", 32, false), "telemetry_source");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "telemetry_json", 1048576, false), "telemetry_json");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "available_widgets", 512, false), "available_widgets");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "created_at", 64, false), "created_at");
  await safeCreateIndex(databaseId, collectionId, "flight_videos_flight_idx", ["flight_id"]);
}

async function configureTelemetrySummaries(databaseId, collectionId) {
  console.log("\nConfiguring flight_telemetry_summaries collection...");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "flight_id", 64, true), "flight_id");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "student_user_id", 64, true), "student_user_id");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "instructor_user_id", 64, false), "instructor_user_id");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "aircraft_ident", 64, false), "aircraft_ident");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "flight_date", 10, false), "flight_date");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "start_time", 8, false), "start_time");
  await safeCreateAttribute(() => db.createBooleanAttribute(databaseId, collectionId, "telemetry_present", true), "telemetry_present");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "parser_version", 32, true), "parser_version");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "processed_at", 64, true), "processed_at");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "duration_sec", false), "duration_sec");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "distance_m", false), "distance_m");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "distance_nm", false), "distance_nm");
  await safeCreateAttribute(() => db.createIntegerAttribute(databaseId, collectionId, "point_count", true), "point_count");
  await safeCreateAttribute(() => db.createIntegerAttribute(databaseId, collectionId, "takeoff_count", true), "takeoff_count");
  await safeCreateAttribute(() => db.createIntegerAttribute(databaseId, collectionId, "landing_count", true), "landing_count");
  await safeCreateAttribute(() => db.createIntegerAttribute(databaseId, collectionId, "tgl_count", true), "tgl_count");
  await safeCreateAttribute(() => db.createIntegerAttribute(databaseId, collectionId, "smooth_landing_count", true), "smooth_landing_count");
  await safeCreateAttribute(() => db.createIntegerAttribute(databaseId, collectionId, "medium_landing_count", true), "medium_landing_count");
  await safeCreateAttribute(() => db.createIntegerAttribute(databaseId, collectionId, "hard_landing_count", true), "hard_landing_count");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "best_touchdown_g", false), "best_touchdown_g");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "best_touchdown_vert_speed_fpm", false), "best_touchdown_vert_speed_fpm");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "slowest_landing_ias_kt", false), "slowest_landing_ias_kt");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "slowest_landing_gs_kt", false), "slowest_landing_gs_kt");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "max_touchdown_g", false), "max_touchdown_g");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "max_descent_rate_fpm", false), "max_descent_rate_fpm");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "longest_takeoff_ground_roll_ft", false), "longest_takeoff_ground_roll_ft");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "shortest_takeoff_ground_roll_ft", false), "shortest_takeoff_ground_roll_ft");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "fastest_takeoff_ias_kt", false), "fastest_takeoff_ias_kt");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "max_headwind_kt", false), "max_headwind_kt");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "max_tailwind_kt", false), "max_tailwind_kt");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "max_crosswind_kt", false), "max_crosswind_kt");
  await safeCreateAttribute(() => db.createIntegerAttribute(databaseId, collectionId, "aerodrome_count", true), "aerodrome_count");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "aerodromes_json", 4096, false), "aerodromes_json");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "max_oil_pressure_psi", false), "max_oil_pressure_psi");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "max_oil_temp_f", false), "max_oil_temp_f");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "max_normal_g", false), "max_normal_g");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "max_lateral_g", false), "max_lateral_g");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "max_cht_f", false), "max_cht_f");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "max_egt_f", false), "max_egt_f");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "max_rpm", false), "max_rpm");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "max_map_inhg", false), "max_map_inhg");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "max_fuel_flow_gph", false), "max_fuel_flow_gph");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "max_fuel_pressure_psi", false), "max_fuel_pressure_psi");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "min_fuel_qty", false), "min_fuel_qty");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "max_oat_c", false), "max_oat_c");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "summary_json", 65535, false), "summary_json");

  await safeCreateIndex(databaseId, collectionId, "telemetry_summary_flight_idx", ["flight_id"]);
  await safeCreateIndex(databaseId, collectionId, "telemetry_summary_student_idx", ["student_user_id"]);
  await safeCreateIndex(databaseId, collectionId, "telemetry_summary_instructor_idx", ["instructor_user_id"]);
  await safeCreateIndex(databaseId, collectionId, "telemetry_summary_date_idx", ["flight_date"]);
  await safeCreateIndex(databaseId, collectionId, "telemetry_summary_aircraft_idx", ["aircraft_ident"]);
  await safeCreateIndex(databaseId, collectionId, "telemetry_summary_aircraft_date_idx", ["aircraft_ident", "flight_date"], ["ASC", "ASC"]);
  await safeCreateIndex(databaseId, collectionId, "telemetry_summary_hard_landings_idx", ["hard_landing_count"]);
}

async function configureLandings(databaseId, collectionId) {
  console.log("\nConfiguring flight_landings collection...");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "flight_id", 64, true), "flight_id");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "student_user_id", 64, true), "student_user_id");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "instructor_user_id", 64, false), "instructor_user_id");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "aircraft_ident", 64, false), "aircraft_ident");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "flight_date", 10, false), "flight_date");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "start_time", 8, false), "start_time");
  await safeCreateAttribute(() => db.createIntegerAttribute(databaseId, collectionId, "sequence", true), "sequence");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "segment_type", 16, true), "segment_type");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "touchdown_time", 64, false), "touchdown_time");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "impact_label", 16, false), "impact_label");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "td_impact_g", false), "td_impact_g");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "td_vert_speed_fpm", false), "td_vert_speed_fpm");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "td_ias_kt", false), "td_ias_kt");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "td_gs_kt", false), "td_gs_kt");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "td_pitch_deg", false), "td_pitch_deg");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "td_crab_angle_deg", false), "td_crab_angle_deg");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "flare_duration_sec", false), "flare_duration_sec");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "flare_dist_ft", false), "flare_dist_ft");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "lda_ft", false), "lda_ft");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "max_braking_g", false), "max_braking_g");

  await safeCreateIndex(databaseId, collectionId, "landings_flight_idx", ["flight_id"]);
  await safeCreateIndex(databaseId, collectionId, "landings_student_idx", ["student_user_id"]);
  await safeCreateIndex(databaseId, collectionId, "landings_instructor_idx", ["instructor_user_id"]);
  await safeCreateIndex(databaseId, collectionId, "landings_date_idx", ["flight_date"]);
  await safeCreateIndex(databaseId, collectionId, "landings_aircraft_idx", ["aircraft_ident"]);
  await safeCreateIndex(databaseId, collectionId, "landings_impact_idx", ["impact_label"]);
}

async function configureTakeoffs(databaseId, collectionId) {
  console.log("\nConfiguring flight_takeoffs collection...");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "flight_id", 64, true), "flight_id");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "student_user_id", 64, true), "student_user_id");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "instructor_user_id", 64, false), "instructor_user_id");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "aircraft_ident", 64, false), "aircraft_ident");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "flight_date", 10, false), "flight_date");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "start_time", 8, false), "start_time");
  await safeCreateAttribute(() => db.createIntegerAttribute(databaseId, collectionId, "sequence", true), "sequence");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "segment_type", 16, true), "segment_type");
  await safeCreateAttribute(() => db.createStringAttribute(databaseId, collectionId, "liftoff_time", 64, false), "liftoff_time");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "ground_roll_ft", false), "ground_roll_ft");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "ground_roll_duration_sec", false), "ground_roll_duration_sec");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "time_to_agl100_sec", false), "time_to_agl100_sec");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "time_to_agl500_sec", false), "time_to_agl500_sec");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "rotation_ias_kt", false), "rotation_ias_kt");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "liftoff_ias_kt", false), "liftoff_ias_kt");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "rpm_at_liftoff", false), "rpm_at_liftoff");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "map_at_liftoff", false), "map_at_liftoff");
  await safeCreateAttribute(() => db.createFloatAttribute(databaseId, collectionId, "fuel_flow_at_liftoff", false), "fuel_flow_at_liftoff");

  await safeCreateIndex(databaseId, collectionId, "takeoffs_flight_idx", ["flight_id"]);
  await safeCreateIndex(databaseId, collectionId, "takeoffs_student_idx", ["student_user_id"]);
  await safeCreateIndex(databaseId, collectionId, "takeoffs_instructor_idx", ["instructor_user_id"]);
  await safeCreateIndex(databaseId, collectionId, "takeoffs_date_idx", ["flight_date"]);
  await safeCreateIndex(databaseId, collectionId, "takeoffs_aircraft_idx", ["aircraft_ident"]);
}

async function main() {
  console.log("Starting Appwrite RBAC setup...");
  const database = await ensureDatabase();
  const flights = await ensureCollection(database.$id, FLIGHTS_COL_NAME);
  const profiles = await ensureCollection(database.$id, PROFILES_COL_NAME);
  const relationships = await ensureCollection(database.$id, REL_COL_NAME);
  const flightVideos = await ensureCollection(database.$id, FLIGHT_VIDEOS_COL_NAME);
  const telemetrySummaries = await ensureCollection(database.$id, FLIGHT_TELEMETRY_SUMMARIES_COL_NAME);
  const landings = await ensureCollection(database.$id, FLIGHT_LANDINGS_COL_NAME);
  const takeoffs = await ensureCollection(database.$id, FLIGHT_TAKEOFFS_COL_NAME);

  await configureFlights(database.$id, flights.$id);
  await configureProfiles(database.$id, profiles.$id);
  await configureInstructorStudents(database.$id, relationships.$id);
  await configureFlightVideos(database.$id, flightVideos.$id);
  await configureTelemetrySummaries(database.$id, telemetrySummaries.$id);
  await configureLandings(database.$id, landings.$id);
  await configureTakeoffs(database.$id, takeoffs.$id);

  console.log("\nSetup complete. Copy these frontend variables:\n");
  console.log(`VITE_APPWRITE_ENDPOINT=${ENDPOINT}`);
  console.log(`VITE_APPWRITE_PROJECT_ID=${PROJECT_ID}`);
  console.log(`VITE_APPWRITE_DATABASE_ID=${database.$id}`);
  console.log(`VITE_APPWRITE_COLLECTION_ID=${flights.$id}`);
  console.log(`VITE_APPWRITE_PROFILES_COLLECTION_ID=${profiles.$id}`);
  console.log(`VITE_APPWRITE_INSTRUCTOR_STUDENTS_COLLECTION_ID=${relationships.$id}`);
  console.log(`VITE_APPWRITE_VIDEOS_COLLECTION_ID=${flightVideos.$id}`);
  console.log(`VITE_APPWRITE_FLIGHT_TELEMETRY_SUMMARIES_COL_ID=${telemetrySummaries.$id}`);
  console.log(`VITE_APPWRITE_FLIGHT_LANDINGS_COL_ID=${landings.$id}`);
  console.log(`VITE_APPWRITE_FLIGHT_TAKEOFFS_COL_ID=${takeoffs.$id}`);
}

main().catch((error) => {
  console.error("Setup failed:", error?.message ?? error);
  process.exit(1);
});
