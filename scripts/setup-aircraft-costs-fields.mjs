import { Client, Databases } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const COLLECTION_ID = process.env.APPWRITE_AIRCRAFTS_COL_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID || !COLLECTION_ID) {
  console.error("Missing env vars. Required: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID, APPWRITE_AIRCRAFTS_COL_ID");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  console.log("=== Adding cost fields to aircrafts collection ===");
  await attr(() => db.createFloatAttribute(DATABASE_ID, COLLECTION_ID, "cost_hangar_monthly", false, 0), "cost_hangar_monthly");
  await attr(() => db.createFloatAttribute(DATABASE_ID, COLLECTION_ID, "cost_insurance_monthly", false, 0), "cost_insurance_monthly");
  await attr(() => db.createFloatAttribute(DATABASE_ID, COLLECTION_ID, "cost_leasing_monthly", false, 0), "cost_leasing_monthly");
  await attr(() => db.createFloatAttribute(DATABASE_ID, COLLECTION_ID, "cost_per_flight_hour", false, 0), "cost_per_flight_hour");
  await attr(() => db.createFloatAttribute(DATABASE_ID, COLLECTION_ID, "cost_maintenance_reserve_monthly", false, 0), "cost_maintenance_reserve_monthly");
  await attr(() => db.createFloatAttribute(DATABASE_ID, COLLECTION_ID, "cost_other_fixed_monthly", false, 0), "cost_other_fixed_monthly");
  console.log("\nDone.");
}

main().catch((error) => {
  console.error("Setup failed:", error?.message ?? error);
  process.exit(1);
});
