import { Client, Databases, Permission, Role } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const COLLECTION_ID = process.env.APPWRITE_FUELINGS_COL_ID || "aircraft_fuelings";

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("Missing env vars. Required: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const PERMISSIONS = [
  Permission.read(Role.users()),
  Permission.read(Role.label("admin")),
  Permission.read(Role.label("instrutor")),
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
  const col = await db.createCollection(DATABASE_ID, COLLECTION_ID, "aircraft_fuelings", PERMISSIONS, true, true);
  console.log(`  + Created collection aircraft_fuelings (${col.$id})`);
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
  console.log("=== Appwrite Fuelings Collection Setup ===");
  await ensureCollection();
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "school_id", 64, true), "school_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "occurred_at", 32, true), "occurred_at");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "aerodrome", 8, true), "aerodrome");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "responsible_user_id", 64, true), "responsible_user_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "responsible_name", 256, true), "responsible_name");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "aircraft_id", 64, true), "aircraft_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "aircraft_registration", 32, true), "aircraft_registration");
  await attr(() => db.createFloatAttribute(DATABASE_ID, COLLECTION_ID, "quantity_liters", true), "quantity_liters");
  await attr(() => db.createFloatAttribute(DATABASE_ID, COLLECTION_ID, "price_per_liter", true), "price_per_liter");
  await attr(() => db.createFloatAttribute(DATABASE_ID, COLLECTION_ID, "total_value", true), "total_value");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "payment_method", 32, true), "payment_method");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "fuel_type", 16, true), "fuel_type");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "student_user_id", 64, false), "student_user_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "student_name", 256, false), "student_name");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "flight_id", 64, false), "flight_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "created_by", 64, true), "created_by");
  await idx("fuelings_school_date_idx", ["school_id", "occurred_at"], ["ASC", "DESC"]);
  await idx("fuelings_aircraft_idx", ["aircraft_id"]);
  await idx("fuelings_responsible_idx", ["responsible_user_id"]);
  await idx("fuelings_student_idx", ["student_user_id"]);
  console.log("\nAdd to .env.local if you changed the default id:");
  console.log(`VITE_APPWRITE_FUELINGS_COL_ID=${COLLECTION_ID}`);
}

main().catch((error) => {
  console.error("Setup failed:", error?.message ?? error);
  process.exit(1);
});
