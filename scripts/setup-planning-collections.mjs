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

// Students create their own docs (document-level perms handle read/write/delete).
// Collection-level: any authenticated user can create; admin and instrutor can read all.
const STUDENT_PLAN_PERMS = [
  Permission.create(Role.users()),
  Permission.read(Role.label("admin")),
  Permission.read(Role.label("instrutor")),
];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureCollection(name, perms) {
  const list = await db.listCollections(DATABASE_ID);
  const found = list.collections.find((c) => c.name === name);
  if (found) {
    console.log(`  • Collection "${name}" already exists (${found.$id})`);
    return found;
  }
  const col = await db.createCollection(DATABASE_ID, ID.unique(), name, perms, true, true);
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

async function migrateOperationalWeeks() {
  console.log("\n[0/3] Migrating aircraft_operational_weeks — adding is_open_for_requests...");
  const list = await db.listCollections(DATABASE_ID);
  const col = list.collections.find((c) => c.name === "aircraft_operational_weeks");
  if (!col) {
    console.log("  ! Collection not found. Run setup-admin-collections.mjs first.");
    return null;
  }
  await attr(
    () => db.createBooleanAttribute(DATABASE_ID, col.$id, "is_open_for_requests", false, false),
    "is_open_for_requests"
  );
  await idx(col.$id, "opweek_open_idx", ["is_open_for_requests"]);
  return col.$id;
}

async function setupWeeklyPlans() {
  console.log("\n[1/3] weekly_flight_plans...");
  const col = await ensureCollection("weekly_flight_plans", STUDENT_PLAN_PERMS);
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "student_id", 64, true), "student_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "operational_week_id", 64, true), "operational_week_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "week_start", 16, true), "week_start");
  await attr(() => db.createIntegerAttribute(DATABASE_ID, id, "requested_flights_count", true, 1, 7), "requested_flights_count");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "status", 16, true), "status");
  await attr(() => db.createDatetimeAttribute(DATABASE_ID, id, "updated_at", false), "updated_at");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "items_json", 16384, false), "items_json");
  await idx(id, "wfp_student_idx", ["student_id"]);
  await idx(id, "wfp_student_week_idx", ["student_id", "week_start"]);
  await idx(id, "wfp_status_idx", ["status"]);
  return id;
}

async function setupWeeklyPlanItems() {
  console.log("\n[2/3] weekly_flight_plan_items...");
  const col = await ensureCollection("weekly_flight_plan_items", STUDENT_PLAN_PERMS);
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "weekly_plan_id", 64, true), "weekly_plan_id");
  await attr(() => db.createIntegerAttribute(DATABASE_ID, id, "position", true, 0, 6), "position");
  await attr(() => db.createFloatAttribute(DATABASE_ID, id, "duration_hours", true), "duration_hours");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "flexibility_level", 16, true), "flexibility_level");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "preferred_aircraft", 64, false), "preferred_aircraft");
  await attr(() => db.createIntegerAttribute(DATABASE_ID, id, "priority_level", true, 1, 3), "priority_level");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "notes", 512, false), "notes");
  await idx(id, "wfpi_plan_idx", ["weekly_plan_id"]);
  await idx(id, "wfpi_plan_pos_idx", ["weekly_plan_id", "position"]);
  return id;
}

async function setupWeeklyPlanAvailability() {
  console.log("\n[3/3] weekly_flight_plan_availability...");
  const col = await ensureCollection("weekly_flight_plan_availability", STUDENT_PLAN_PERMS);
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "plan_item_id", 64, true), "plan_item_id");
  await attr(() => db.createIntegerAttribute(DATABASE_ID, id, "day_of_week", true, 0, 6), "day_of_week");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "period", 16, true), "period");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "availability_type", 16, true), "availability_type");
  await idx(id, "wfpa_item_idx", ["plan_item_id"]);
  return id;
}

async function main() {
  console.log("=== Appwrite Planning Collections Setup ===");
  console.log(`Database: ${DATABASE_ID}\n`);

  await migrateOperationalWeeks();
  const plansId = await setupWeeklyPlans();
  const itemsId = await setupWeeklyPlanItems();
  const availId = await setupWeeklyPlanAvailability();

  console.log("\n=== Setup Complete ===");
  console.log("Add these to your .env.local:\n");
  console.log(`VITE_APPWRITE_WEEKLY_PLANS_COL_ID=${plansId}`);
  console.log(`VITE_APPWRITE_WEEKLY_PLAN_ITEMS_COL_ID=${itemsId}`);
  console.log(`VITE_APPWRITE_WEEKLY_PLAN_AVAIL_COL_ID=${availId}`);
}

main().catch((error) => {
  console.error("Setup failed:", error?.message ?? error);
  process.exit(1);
});
