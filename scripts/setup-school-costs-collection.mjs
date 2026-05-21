import { Client, Databases, Permission, Role } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const COLLECTION_ID = process.env.APPWRITE_SCHOOL_COSTS_COL_ID || "school_costs";

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
  const col = await db.createCollection(DATABASE_ID, COLLECTION_ID, "school_costs", PERMISSIONS, true, true);
  console.log(`  + Created collection school_costs (${col.$id})`);
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

async function main() {
  console.log("=== Appwrite School Costs Collection Setup ===");
  await ensureCollection();
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "school_id", 64, true), "school_id");
  await attr(() => db.createFloatAttribute(DATABASE_ID, COLLECTION_ID, "enrollment_cost", false, 0), "enrollment_cost");
  // payment_method_costs_json stores: Record<method, {fixedCost, percentCost}>
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "payment_method_costs_json", 8192, false), "payment_method_costs_json");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "updated_at", 32, false), "updated_at");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "updated_by", 64, false), "updated_by");

  console.log("\nAdd to .env.local:");
  console.log(`VITE_APPWRITE_SCHOOL_COSTS_COL_ID=${COLLECTION_ID}`);
  console.log("\nDone.");
}

main().catch((error) => {
  console.error("Setup failed:", error?.message ?? error);
  process.exit(1);
});
