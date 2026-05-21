import { Client, Databases } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const COLLECTION_ID = process.env.APPWRITE_SCHOOL_COSTS_COL_ID || process.env.APPWRITE_SCHOOL_COSTS_COLLECTION_ID || "school_costs";

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
  console.log("=== Adding manual DRE fields to school_costs collection ===");
  console.log(`Collection: ${COLLECTION_ID}`);
  await attr(
    () => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "manual_dre_lines_json", 32768, false),
    "manual_dre_lines_json (string 32768, nullable)",
  );
  await attr(
    () => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "manual_dre_values_json", 32768, false),
    "manual_dre_values_json (string 32768, nullable)",
  );
  console.log("\nDone.");
}

main().catch((error) => {
  console.error("Setup failed:", error?.message ?? error);
  process.exit(1);
});
