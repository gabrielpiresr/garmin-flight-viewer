import { Client, Databases, Permission, Role } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const COLLECTION_ID = process.env.APPWRITE_INSTRUCTOR_COSTS_COL_ID || "instructor_costs";

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("Missing env vars. Required: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const PERMISSIONS = [
  Permission.read(Role.label("admin")),
  Permission.create(Role.label("admin")),
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
  const col = await db.createCollection(DATABASE_ID, COLLECTION_ID, "instructor_costs", PERMISSIONS, true, true);
  console.log(`  + Created collection instructor_costs (${col.$id})`);
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
  console.log("=== Appwrite Instructor Costs Collection Setup ===");
  await ensureCollection();
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "school_id", 64, false), "school_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "instructor_user_id", 64, true), "instructor_user_id");
  await attr(() => db.createFloatAttribute(DATABASE_ID, COLLECTION_ID, "monthly_fixed_cost", false, 0), "monthly_fixed_cost");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "model_costs_json", 65535, false), "model_costs_json");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "updated_at", 32, false), "updated_at");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "updated_by", 64, false), "updated_by");
  await idx("instructor_costs_user_idx", ["instructor_user_id"]);
  console.log("\nAdd to .env.local:");
  console.log(`VITE_APPWRITE_INSTRUCTOR_COSTS_COL_ID=${COLLECTION_ID}`);
  console.log("\nDone.");
}

main().catch((error) => {
  console.error("Setup failed:", error?.message ?? error);
  process.exit(1);
});
