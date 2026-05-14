import { Client, Databases, ID, Permission, Role } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("Missing APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY or APPWRITE_DATABASE_ID.");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);
const COLLECTION_PERMISSIONS = [Permission.create(Role.users())];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureCollection(databaseId, name) {
  const list = await db.listCollections(databaseId);
  const found = list.collections.find((collection) => collection.name === name);
  if (found) {
    const currentPermissions = new Set(found.$permissions ?? []);
    let changed = false;
    for (const permission of COLLECTION_PERMISSIONS) {
      if (!currentPermissions.has(permission)) {
        currentPermissions.add(permission);
        changed = true;
      }
    }
    if (changed) {
      return db.updateCollection(databaseId, found.$id, found.name, Array.from(currentPermissions), true, found.enabled);
    }
    return found;
  }
  return db.createCollection(databaseId, ID.unique(), name, COLLECTION_PERMISSIONS, true, true);
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
  console.log("Starting Appwrite telemetry metrics setup...");
  const telemetrySummaries = await ensureCollection(DATABASE_ID, "flight_telemetry_summaries");
  const landings = await ensureCollection(DATABASE_ID, "flight_landings");
  const takeoffs = await ensureCollection(DATABASE_ID, "flight_takeoffs");

  await configureTelemetrySummaries(DATABASE_ID, telemetrySummaries.$id);
  await configureLandings(DATABASE_ID, landings.$id);
  await configureTakeoffs(DATABASE_ID, takeoffs.$id);

  console.log("\nTelemetry setup complete. Add these frontend variables:\n");
  console.log(`VITE_APPWRITE_FLIGHT_TELEMETRY_SUMMARIES_COL_ID=${telemetrySummaries.$id}`);
  console.log(`VITE_APPWRITE_FLIGHT_LANDINGS_COL_ID=${landings.$id}`);
  console.log(`VITE_APPWRITE_FLIGHT_TAKEOFFS_COL_ID=${takeoffs.$id}`);
}

main().catch((error) => {
  console.error("Telemetry setup failed:", error?.message ?? error);
  process.exit(1);
});
