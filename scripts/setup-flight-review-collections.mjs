import { Client, Databases, ID, Permission, Role } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error(
    "Missing env vars. Required: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID",
  );
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const TEMPLATE_PERMS = [
  Permission.read(Role.users()),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

const FLIGHT_MANEUVER_PERMS = [
  Permission.read(Role.users()),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
  Permission.create(Role.label("instrutor")),
  Permission.update(Role.label("instrutor")),
  Permission.delete(Role.label("instrutor")),
];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureCollection(name, perms) {
  const list = await db.listCollections(DATABASE_ID);
  const found = list.collections.find((c) => c.name === name);
  if (found) {
    await db.updateCollection(DATABASE_ID, found.$id, name, perms, false, true);
    console.log(`  • Collection "${name}" already exists (${found.$id})`);
    return found;
  }
  const col = await db.createCollection(DATABASE_ID, ID.unique(), name, perms, false, true);
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

async function setupManeuverTemplates() {
  console.log("\n[1/4] maneuver_templates...");
  const col = await ensureCollection("maneuver_templates", TEMPLATE_PERMS);
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "name", 255, true), "name");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "category", 64, true), "category");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "aircraft_model_id", 64, true), "aircraft_model_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "description", 4096, false), "description");
  await attr(() => db.createBooleanAttribute(DATABASE_ID, id, "is_active", true), "is_active");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "created_at", 64, true), "created_at");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "updated_at", 64, true), "updated_at");
  await idx(id, "mnt_model_idx", ["aircraft_model_id"]);
  await idx(id, "mnt_active_idx", ["is_active"]);
  await idx(id, "mnt_model_active_idx", ["aircraft_model_id", "is_active"], ["ASC", "ASC"]);
  return id;
}

async function setupManeuverTemplateSteps() {
  console.log("\n[2/4] maneuver_template_steps...");
  const col = await ensureCollection("maneuver_template_steps", TEMPLATE_PERMS);
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "template_id", 64, true), "template_id");
  await attr(() => db.createIntegerAttribute(DATABASE_ID, id, "order_index", true), "order_index");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "name", 255, true), "name");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "description", 4096, false), "description");
  await attr(
    () => db.createStringAttribute(DATABASE_ID, id, "expected_execution_text", 8192, false),
    "expected_execution_text",
  );
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "end_condition_json", 1024, false), "end_condition_json");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "parameters_json", 2048, false), "parameters_json");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "created_at", 64, true), "created_at");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "updated_at", 64, true), "updated_at");
  await idx(id, "mns_template_idx", ["template_id"]);
  await idx(id, "mns_template_order_idx", ["template_id", "order_index"], ["ASC", "ASC"]);
  return id;
}

async function setupFlightManeuvers() {
  console.log("\n[3/4] flight_maneuvers...");
  const col = await ensureCollection("flight_maneuvers", FLIGHT_MANEUVER_PERMS);
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "flight_id", 64, true), "flight_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "template_id", 64, true), "template_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "instructor_id", 64, true), "instructor_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "student_id", 64, false), "student_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "aircraft_ident", 64, false), "aircraft_ident");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "start_time", 64, true), "start_time");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "end_time", 64, true), "end_time");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "status", 32, true), "status");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "created_by", 64, true), "created_by");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "created_at", 64, true), "created_at");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "updated_at", 64, true), "updated_at");
  await idx(id, "fm_flight_idx", ["flight_id"]);
  await idx(id, "fm_instructor_idx", ["instructor_id"]);
  await idx(id, "fm_flight_status_idx", ["flight_id", "status"], ["ASC", "ASC"]);
  return id;
}

async function setupFlightManeuverReviews() {
  console.log("\n[4/4] flight_maneuver_reviews...");
  const col = await ensureCollection("flight_maneuver_reviews", FLIGHT_MANEUVER_PERMS);
  const id = col.$id;
  await attr(
    () => db.createStringAttribute(DATABASE_ID, id, "flight_maneuver_id", 64, true),
    "flight_maneuver_id",
  );
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "flight_id", 64, true), "flight_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "status", 32, true), "status");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "analysis_json", 8192, true), "analysis_json");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "created_at", 64, true), "created_at");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "updated_at", 64, true), "updated_at");
  await idx(id, "fmr_maneuver_idx", ["flight_maneuver_id"]);
  await idx(id, "fmr_flight_idx", ["flight_id"]);
  return id;
}

async function main() {
  console.log("=== Flight Review Collections Setup ===");
  console.log(`Database: ${DATABASE_ID}\n`);

  const templatesId = await setupManeuverTemplates();
  const stepsId = await setupManeuverTemplateSteps();
  const maneuversId = await setupFlightManeuvers();
  const reviewsId = await setupFlightManeuverReviews();

  console.log("\n=== Setup Complete ===");
  console.log("Add these to your .env.local:\n");
  console.log(`VITE_APPWRITE_MANEUVER_TEMPLATES_COL_ID=${templatesId}`);
  console.log(`VITE_APPWRITE_MANEUVER_TEMPLATE_STEPS_COL_ID=${stepsId}`);
  console.log(`VITE_APPWRITE_FLIGHT_MANEUVERS_COL_ID=${maneuversId}`);
  console.log(`VITE_APPWRITE_FLIGHT_MANEUVER_REVIEWS_COL_ID=${reviewsId}`);
}

main().catch((error) => {
  console.error("Setup failed:", error?.message ?? error);
  process.exit(1);
});
