import { Client, Databases } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID;
const PROGRAM_ITEMS_COL_ID =
  process.env.APPWRITE_MAINTENANCE_PROGRAM_ITEMS_COL_ID || process.env.VITE_APPWRITE_MAINTENANCE_PROGRAM_ITEMS_COL_ID;
const WORK_ORDERS_COL_ID =
  process.env.APPWRITE_MAINTENANCE_WORK_ORDERS_COL_ID || process.env.VITE_APPWRITE_MAINTENANCE_WORK_ORDERS_COL_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID || !PROGRAM_ITEMS_COL_ID || !WORK_ORDERS_COL_ID) {
  console.error(
    "Missing env vars. Required: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID, APPWRITE_MAINTENANCE_PROGRAM_ITEMS_COL_ID, APPWRITE_MAINTENANCE_WORK_ORDERS_COL_ID",
  );
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
    console.log(`created ${label}`);
  } catch (error) {
    const msg = error?.message ?? String(error);
    if (msg.toLowerCase().includes("already exists")) {
      console.log(`${label} already exists`);
      return;
    }
    throw error;
  }
}

async function main() {
  console.log("Migrating maintenance checklist attributes...");
  await attr(
    () => db.createStringAttribute(DATABASE_ID, PROGRAM_ITEMS_COL_ID, "checklist_json", 16384, false),
    "maintenance_program_items.checklist_json",
  );
  await attr(
    () => db.createStringAttribute(DATABASE_ID, WORK_ORDERS_COL_ID, "checklist_execution_json", 32768, false),
    "maintenance_work_orders.checklist_execution_json",
  );
  console.log("Maintenance checklist migration complete.");
}

main().catch((error) => {
  console.error("Migration failed:", error?.message ?? error);
  process.exit(1);
});
