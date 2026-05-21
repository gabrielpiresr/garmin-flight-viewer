import { Client, Databases } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const COLLECTION_ID = process.env.APPWRITE_STUDENT_CREDITS_COL_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID || !COLLECTION_ID) {
  console.error("Missing env vars. Required: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID, APPWRITE_STUDENT_CREDITS_COL_ID");
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
  console.log("=== Adding cost_snapshot_json to student_credits collection ===");
  // JSON snapshot: {enrollmentCost, paymentMethodFixedCost, paymentMethodPercentCost,
  //                 totalCostCalculated, appliedAt}
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "cost_snapshot_json", 4096, false), "cost_snapshot_json");
  console.log("\nDone.");
}

main().catch((error) => {
  console.error("Setup failed:", error?.message ?? error);
  process.exit(1);
});
