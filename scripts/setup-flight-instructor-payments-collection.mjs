import { Client, Databases, Permission, Role } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const COLLECTION_ID = process.env.APPWRITE_FLIGHT_INSTRUCTOR_PAYMENTS_COL_ID || "flight_instructor_payments";

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("Missing env vars. Required: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const PERMISSIONS = [
  Permission.read(Role.label("admin")),
  Permission.create(Role.label("admin")),
  Permission.create(Role.label("instrutor")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureCollection() {
  try {
    const col = await db.getCollection(DATABASE_ID, COLLECTION_ID);
    await db.updateCollection(DATABASE_ID, COLLECTION_ID, col.name, PERMISSIONS, true, true);
    console.log(`  - Collection already exists (${COLLECTION_ID}); permissions updated`);
    return col;
  } catch (error) {
    const msg = error?.message ?? String(error);
    const normalized = msg.toLowerCase();
    if (!normalized.includes("not found") && !normalized.includes("could not be found")) throw error;
  }
  const col = await db.createCollection(DATABASE_ID, COLLECTION_ID, "flight_instructor_payments", PERMISSIONS, true, true);
  console.log(`  + Created collection flight_instructor_payments (${col.$id})`);
  return col;
}

async function attr(createFn, label) {
  try {
    await createFn();
    await sleep(650);
    console.log(`     + ${label}`);
  } catch (error) {
    const msg = error?.message ?? String(error);
    if (msg.toLowerCase().includes("already exists")) {
      console.log(`     - ${label} already exists`);
      return;
    }
    throw error;
  }
}

async function idx(key, attributes, orders = ["ASC"]) {
  try {
    await db.createIndex(DATABASE_ID, COLLECTION_ID, key, "key", attributes, orders);
    await sleep(650);
    console.log(`     + index ${key}`);
  } catch (error) {
    const msg = error?.message ?? String(error);
    if (msg.toLowerCase().includes("already exists")) {
      console.log(`     - index ${key} already exists`);
      return;
    }
    throw error;
  }
}

async function main() {
  console.log("=== Appwrite Flight Instructor Payments Collection Setup ===");
  await ensureCollection();
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "flight_id", 64, true), "flight_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "instructor_user_id", 64, true), "instructor_user_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "school_id", 64, false), "school_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "aircraft_model_id", 64, false), "aircraft_model_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "aircraft_model_name", 128, false), "aircraft_model_name");
  await attr(() => db.createBooleanAttribute(DATABASE_ID, COLLECTION_ID, "is_night", false, false), "is_night");
  await attr(() => db.createFloatAttribute(DATABASE_ID, COLLECTION_ID, "hourly_rate_applied", false, 0), "hourly_rate_applied");
  await attr(() => db.createFloatAttribute(DATABASE_ID, COLLECTION_ID, "fixed_rate_applied", false, 0), "fixed_rate_applied");
  await attr(() => db.createIntegerAttribute(DATABASE_ID, COLLECTION_ID, "flight_minutes_considered", false, 0), "flight_minutes_considered");
  await attr(() => db.createFloatAttribute(DATABASE_ID, COLLECTION_ID, "total_calculated", false, 0), "total_calculated");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "calculated_at", 32, true), "calculated_at");
  await idx("fip_flight_idx", ["flight_id"]);
  await idx("fip_instructor_idx", ["instructor_user_id"]);
  console.log("\nAdd to .env.local:");
  console.log(`VITE_APPWRITE_FLIGHT_INSTRUCTOR_PAYMENTS_COL_ID=${COLLECTION_ID}`);
  console.log("\nDone.");
}

main().catch((error) => {
  console.error("Setup failed:", error?.message ?? error);
  process.exit(1);
});
