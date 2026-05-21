import { Client, Databases } from "node-appwrite";

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

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attr(createFn, label) {
  try {
    await createFn();
    await sleep(650);
    console.log(`  + ${label}`);
  } catch (error) {
    const msg = error?.message ?? String(error);
    if (msg.toLowerCase().includes("already exists")) {
      console.log(`  - ${label} already exists`);
      return;
    }
    throw error;
  }
}

async function main() {
  console.log("=== Adding student payment fields to flight_instructor_payments ===");
  console.log(`Collection: ${COLLECTION_ID}`);

  // Which student this flight belongs to
  await attr(
    () => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "student_user_id", 64, false),
    "student_user_id (string 64, nullable)",
  );

  // Effective hourly rate resolved from student credits
  await attr(
    () => db.createFloatAttribute(DATABASE_ID, COLLECTION_ID, "student_hourly_rate_applied", false, 0),
    "student_hourly_rate_applied (float, default 0)",
  );

  // student_hourly_rate_applied × (flight_minutes_considered / 60)
  await attr(
    () => db.createFloatAttribute(DATABASE_ID, COLLECTION_ID, "student_amount_calculated", false, 0),
    "student_amount_calculated (float, default 0)",
  );

  // How the rate was resolved:
  //   "model_credit"        — from student's non-expired credits for this model + day/night type
  //   "last_student_credit" — student had no matching credits; used their most recent purchase
  //   "last_model_credit"   — student never bought anything; used latest purchase by anyone for this model/type
  //   "none"                — no credits found anywhere
  await attr(
    () => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "student_rate_source", 32, false),
    "student_rate_source (string 32, nullable)",
  );

  // The $id of the specific StudentCreditPurchase document used as rate source (nullable)
  await attr(
    () => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "student_credit_id", 64, false),
    "student_credit_id (string 64, nullable)",
  );

  console.log("\nDone.");
}

main().catch((error) => {
  console.error("Setup failed:", error?.message ?? error);
  process.exit(1);
});
