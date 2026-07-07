import { Client, Databases, ID, Permission, Role } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("Missing env vars. Required: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const ADMIN_PERMS = [
  Permission.read(Role.label("admin")),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

const AIRCRAFTS_PERMS = [
  ...ADMIN_PERMS,
  Permission.read(Role.label("instrutor")),
  Permission.read(Role.label("aluno")),
  Permission.read(Role.users()),
];

const AIRCRAFT_MODELS_PERMS = [
  ...ADMIN_PERMS,
  Permission.read(Role.label("instrutor")),
  Permission.read(Role.label("aluno")),
  Permission.read(Role.users()),
];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureCollection(name) {
  const list = await db.listCollections(DATABASE_ID);
  const found = list.collections.find((c) => c.name === name);
  if (found) {
    console.log(`  • Collection "${name}" already exists (${found.$id})`);
    return found;
  }
  const col = await db.createCollection(DATABASE_ID, ID.unique(), name, ADMIN_PERMS, true, true);
  console.log(`  ✓ Created collection "${name}" (${col.$id})`);
  return col;
}

async function attr(createFn, label) {
  try {
    await createFn();
    await sleep(700);
    console.log(`     ✓ ${label}`);
  } catch (error) {
    const msg = error?.message ?? String(error);
    if (msg.toLowerCase().includes("already exists")) {
      console.log(`     • ${label} (already exists)`);
      return;
    }
    throw error;
  }
}

async function idx(colId, key, attributes, orders = ["ASC"]) {
  try {
    await db.createIndex(DATABASE_ID, colId, key, "key", attributes, orders);
    await sleep(700);
    console.log(`     ✓ index ${key}`);
  } catch (error) {
    const msg = error?.message ?? String(error);
    if (msg.toLowerCase().includes("already exists")) {
      console.log(`     • index ${key} (already exists)`);
      return;
    }
    throw error;
  }
}

async function ensureCollectionWithPerms(name, permissions) {
  const list = await db.listCollections(DATABASE_ID);
  const found = list.collections.find((c) => c.name === name);
  if (found) {
    await db.updateCollection(DATABASE_ID, found.$id, name, permissions, true, true);
    console.log(`  • Collection "${name}" already exists (${found.$id}) — permissions updated`);
    return found;
  }
  const col = await db.createCollection(DATABASE_ID, ID.unique(), name, permissions, true, true);
  console.log(`  ✓ Created collection "${name}" (${col.$id})`);
  return col;
}

async function setupAircraftModels() {
  console.log("\n[1/8] aircraft_models...");
  const col = await ensureCollectionWithPerms("aircraft_models", AIRCRAFT_MODELS_PERMS);
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "name", 128, true), "name");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "manufacturer", 128, true), "manufacturer");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "category", 32, true), "category");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "default_image", 1024, false), "default_image");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "vx_kt", false), "vx_kt");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "vy_kt", false), "vy_kt");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "vs_clean_kt", false), "vs_clean_kt");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "vso_kt", false), "vso_kt");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "white_arc_min_kt", false), "white_arc_min_kt");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "white_arc_max_kt", false), "white_arc_max_kt");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "green_arc_min_kt", false), "green_arc_min_kt");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "green_arc_max_kt", false), "green_arc_max_kt");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "yellow_arc_min_kt", false), "yellow_arc_min_kt");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "yellow_arc_max_kt", false), "yellow_arc_max_kt");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "vne_kt", false), "vne_kt");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "va_kt", false), "va_kt");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "best_glide_kt", false), "best_glide_kt");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "vref_flap0_kt", false), "vref_flap0_kt");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "vref_flap1_kt", false), "vref_flap1_kt");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "vref_flap2_kt", false), "vref_flap2_kt");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "rpm_cruise", false), "rpm_cruise");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "rpm_takeoff_max", false), "rpm_takeoff_max");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "op_oil_temp_unit", 1, false, "F"), "op_oil_temp_unit");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "op_oil_temp_attention", false), "op_oil_temp_attention");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "op_oil_temp_danger", false), "op_oil_temp_danger");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "op_oil_pressure_attention_psi", false), "op_oil_pressure_attention_psi");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "op_oil_pressure_danger_psi", false), "op_oil_pressure_danger_psi");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "op_rpm_attention", false), "op_rpm_attention");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "op_rpm_danger", false), "op_rpm_danger");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "op_fuel_pressure_attention_psi", false), "op_fuel_pressure_attention_psi");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "op_fuel_pressure_danger_psi", false), "op_fuel_pressure_danger_psi");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "op_gload_attention", false), "op_gload_attention");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "op_gload_danger", false), "op_gload_danger");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "op_touchdown_ias_attention_kt", false), "op_touchdown_ias_attention_kt");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "op_touchdown_ias_danger_kt", false), "op_touchdown_ias_danger_kt");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "op_best_climb_after_takeoff_kt", false), "op_best_climb_after_takeoff_kt");
  await idx(id, "models_name_idx", ["name"]);
  return id;
}

async function setupAircrafts() {
  console.log("\n[2/8] aircrafts...");
  const col = await ensureCollection("aircrafts");
  const id = col.$id;
  await db.updateCollection(DATABASE_ID, id, "aircrafts", AIRCRAFTS_PERMS, true, true);
  console.log("     ✓ permissions: admin full, authenticated users read");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "school_id", 64, true), "school_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "model_id", 64, true), "model_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "registration", 16, true), "registration");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "nickname", 64, false), "nickname");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "serial_number", 64, false), "serial_number");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "owner_name", 256, false), "owner_name");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "operator_name", 256, false), "operator_name");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "logbook_sequence_number", 64, false), "logbook_sequence_number");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "plane_it_id", 64, false), "plane_it_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "image_url", 1024, false), "image_url");
  await attr(() => db.createBooleanAttribute(DATABASE_ID, id, "active", true), "active");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "wb_empty_weight_kg", false), "wb_empty_weight_kg");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "wb_empty_arm_mm", false), "wb_empty_arm_mm");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "wb_occupants_arm_mm", false), "wb_occupants_arm_mm");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "wb_occupants_max_kg", false), "wb_occupants_max_kg");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "wb_baggage_arm_mm", false), "wb_baggage_arm_mm");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "wb_baggage_max_kg", false), "wb_baggage_max_kg");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "wb_fuel_arm_mm", false), "wb_fuel_arm_mm");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "wb_fuel_max_kg", false), "wb_fuel_max_kg");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "wb_fuel_density_kg_l", false), "wb_fuel_density_kg_l");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "wb_max_weight_kg", false), "wb_max_weight_kg");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "wb_arm_min_mm", false), "wb_arm_min_mm");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "wb_arm_max_mm", false), "wb_arm_max_mm");
  await idx(id, "aircrafts_school_idx", ["school_id"]);
  await idx(id, "aircrafts_model_idx", ["model_id"]);
  return id;
}

async function setupMaintenanceRules() {
  console.log("\n[3/8] aircraft_model_maintenance_rules...");
  const col = await ensureCollection("aircraft_model_maintenance_rules");
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "model_id", 64, true), "model_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "name", 128, true), "name");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "max_flight_hours", false), "max_flight_hours");
  await attr(() => db.createIntegerAttribute(DATABASE_ID, id, "max_days", false), "max_days");
  await attr(() => db.createIntegerAttribute(DATABASE_ID, id, "estimated_downtime_days", false), "estimated_downtime_days");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "estimated_cost", false), "estimated_cost");
  await idx(id, "maint_model_idx", ["model_id"]);
  return id;
}

async function setupOperationalWeeks() {
  console.log("\n[4/8] aircraft_operational_weeks...");
  const col = await ensureCollection("aircraft_operational_weeks");
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "aircraft_id", 64, true), "aircraft_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "week_start", 16, true), "week_start");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "week_end", 16, true), "week_end");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "created_by", 64, true), "created_by");
  await attr(() => db.createBooleanAttribute(DATABASE_ID, id, "is_open_for_requests", false, false), "is_open_for_requests");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "schedule_closed_at", 64, false), "schedule_closed_at");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "daily_caps_json", 512, false), "daily_caps_json");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "group_caps_json", 2048, false), "group_caps_json");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "slots_json", 4096, false), "slots_json");
  await idx(id, "opweek_aircraft_idx", ["aircraft_id"]);
  await idx(id, "opweek_start_idx", ["week_start"]);
  return id;
}

async function setupDailyCaps() {
  console.log("\n[5/8] aircraft_operational_daily_caps...");
  const col = await ensureCollection("aircraft_operational_daily_caps");
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "operational_week_id", 64, true), "operational_week_id");
  await attr(() => db.createIntegerAttribute(DATABASE_ID, id, "day_of_week", true, 0, 6), "day_of_week");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "max_hours", true), "max_hours");
  await idx(id, "dailycap_week_idx", ["operational_week_id"]);
  return id;
}

async function setupGroupCaps() {
  console.log("\n[6/8] aircraft_operational_group_caps...");
  const col = await ensureCollection("aircraft_operational_group_caps");
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "operational_week_id", 64, true), "operational_week_id");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "max_hours", true), "max_hours");
  await idx(id, "groupcap_week_idx", ["operational_week_id"]);
  return id;
}

async function setupGroupCapDays() {
  console.log("\n[7/8] aircraft_operational_group_cap_days...");
  const col = await ensureCollection("aircraft_operational_group_cap_days");
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "group_cap_id", 64, true), "group_cap_id");
  await attr(() => db.createIntegerAttribute(DATABASE_ID, id, "day_of_week", true, 0, 6), "day_of_week");
  await idx(id, "groupcapday_group_idx", ["group_cap_id"]);
  return id;
}

async function setupOperationalSlots() {
  console.log("\n[8/8] aircraft_operational_slots...");
  const col = await ensureCollection("aircraft_operational_slots");
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "operational_week_id", 64, true), "operational_week_id");
  await attr(() => db.createIntegerAttribute(DATABASE_ID, id, "day_of_week", true, 0, 6), "day_of_week");
  await attr(() => db.createIntegerAttribute(DATABASE_ID, id, "start_hour", true), "start_hour");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "state", 16, true), "state");
  await idx(id, "slots_week_idx", ["operational_week_id"]);
  await idx(id, "slots_week_day_idx", ["operational_week_id", "day_of_week"]);
  return id;
}

const OBS_PERMS = [
  Permission.read(Role.label("admin")),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
  Permission.read(Role.label("instrutor")),
  Permission.create(Role.label("instrutor")),
];

async function setupStudentObservations() {
  console.log("\n[9/9] student_observations...");
  const list = await db.listCollections(DATABASE_ID);
  const found = list.collections.find((c) => c.name === "student_observations");
  let col;
  if (found) {
    console.log(`  • Collection "student_observations" already exists (${found.$id})`);
    col = found;
  } else {
    col = await db.createCollection(DATABASE_ID, ID.unique(), "student_observations", OBS_PERMS, true, true);
    console.log(`  ✓ Created collection "student_observations" (${col.$id})`);
  }
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "student_user_id", 36, true), "student_user_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "author_user_id", 36, true), "author_user_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "author_name", 128, true), "author_name");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "author_role", 20, true), "author_role");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "content", 2048, true), "content");
  await idx(id, "obs_student_idx", ["student_user_id"]);
  return id;
}

async function main() {
  console.log("=== Appwrite Admin Collections Setup ===");
  console.log(`Database: ${DATABASE_ID}\n`);

  const modelsId = await setupAircraftModels();
  const aircraftsId = await setupAircrafts();
  const maintId = await setupMaintenanceRules();
  const weeksId = await setupOperationalWeeks();
  const dailyCapsId = await setupDailyCaps();
  const groupCapsId = await setupGroupCaps();
  const groupCapDaysId = await setupGroupCapDays();
  const slotsId = await setupOperationalSlots();
  const obsId = await setupStudentObservations();

  console.log("\n=== Setup Complete ===");
  console.log("Add these to your .env.local:\n");
  console.log(`VITE_SCHOOL_ID=escola_principal`);
  console.log(`VITE_APPWRITE_AIRCRAFT_MODELS_COL_ID=${modelsId}`);
  console.log(`VITE_APPWRITE_AIRCRAFTS_COL_ID=${aircraftsId}`);
  console.log(`VITE_APPWRITE_MAINTENANCE_RULES_COL_ID=${maintId}`);
  console.log(`VITE_APPWRITE_OP_WEEKS_COL_ID=${weeksId}`);
  console.log(`VITE_APPWRITE_DAILY_CAPS_COL_ID=${dailyCapsId}`);
  console.log(`VITE_APPWRITE_GROUP_CAPS_COL_ID=${groupCapsId}`);
  console.log(`VITE_APPWRITE_GROUP_CAP_DAYS_COL_ID=${groupCapDaysId}`);
  console.log(`VITE_APPWRITE_OP_SLOTS_COL_ID=${slotsId}`);
  console.log(`VITE_APPWRITE_STUDENT_OBSERVATIONS_COL_ID=${obsId}`);
}

main().catch((error) => {
  console.error("Setup failed:", error?.message ?? error);
  process.exit(1);
});
