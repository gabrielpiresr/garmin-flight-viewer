import { Client, Databases, Permission, Role } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const CLOSINGS_ID = process.env.APPWRITE_FINANCIAL_MONTHLY_CLOSINGS_COL_ID || "financial_monthly_closings";
const LINES_ID = process.env.APPWRITE_FINANCIAL_MONTHLY_CLOSING_LINES_COL_ID || "financial_monthly_closing_lines";

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

async function ensureCollection(id, name) {
  try {
    const col = await db.getCollection(DATABASE_ID, id);
    await db.updateCollection(DATABASE_ID, id, col.name || name, PERMISSIONS, true, true);
    console.log(`  - Collection already exists (${id}); permissions updated`);
    return;
  } catch (error) {
    const msg = error?.message ?? String(error);
    if (!msg.toLowerCase().includes("not found") && !msg.toLowerCase().includes("could not be found")) throw error;
  }
  await db.createCollection(DATABASE_ID, id, name, PERMISSIONS, true, true);
  console.log(`  + Created collection ${name} (${id})`);
}

async function attr(collectionId, createFn, label) {
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

async function idx(collectionId, key, attributes, orders = ["ASC"]) {
  try {
    await db.createIndex(DATABASE_ID, collectionId, key, "key", attributes, orders);
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

async function setupClosings() {
  console.log("\n[1/2] financial_monthly_closings...");
  await ensureCollection(CLOSINGS_ID, "financial_monthly_closings");
  await attr(CLOSINGS_ID, () => db.createStringAttribute(DATABASE_ID, CLOSINGS_ID, "school_id", 64, true), "school_id");
  await attr(CLOSINGS_ID, () => db.createStringAttribute(DATABASE_ID, CLOSINGS_ID, "month", 7, true), "month");
  await attr(CLOSINGS_ID, () => db.createStringAttribute(DATABASE_ID, CLOSINGS_ID, "status", 16, true), "status");
  await attr(CLOSINGS_ID, () => db.createStringAttribute(DATABASE_ID, CLOSINGS_ID, "closed_at", 32, false), "closed_at");
  await attr(CLOSINGS_ID, () => db.createStringAttribute(DATABASE_ID, CLOSINGS_ID, "closed_by", 64, false), "closed_by");
  await attr(CLOSINGS_ID, () => db.createStringAttribute(DATABASE_ID, CLOSINGS_ID, "reopened_at", 32, false), "reopened_at");
  await attr(CLOSINGS_ID, () => db.createStringAttribute(DATABASE_ID, CLOSINGS_ID, "reopened_by", 64, false), "reopened_by");
  await attr(CLOSINGS_ID, () => db.createStringAttribute(DATABASE_ID, CLOSINGS_ID, "notes", 2048, false), "notes");
  await attr(CLOSINGS_ID, () => db.createStringAttribute(DATABASE_ID, CLOSINGS_ID, "cards_json", 32768, false), "cards_json");
  await idx(CLOSINGS_ID, "fmc_school_month_idx", ["school_id", "month"]);
  await idx(CLOSINGS_ID, "fmc_status_idx", ["status"]);
}

async function setupLines() {
  console.log("\n[2/2] financial_monthly_closing_lines...");
  await ensureCollection(LINES_ID, "financial_monthly_closing_lines");
  await attr(LINES_ID, () => db.createStringAttribute(DATABASE_ID, LINES_ID, "closing_id", 64, true), "closing_id");
  await attr(LINES_ID, () => db.createStringAttribute(DATABASE_ID, LINES_ID, "line_key", 128, true), "line_key");
  await attr(LINES_ID, () => db.createStringAttribute(DATABASE_ID, LINES_ID, "parent_line_key", 128, false), "parent_line_key");
  await attr(LINES_ID, () => db.createIntegerAttribute(DATABASE_ID, LINES_ID, "level", true), "level");
  await attr(LINES_ID, () => db.createStringAttribute(DATABASE_ID, LINES_ID, "section", 128, true), "section");
  await attr(LINES_ID, () => db.createStringAttribute(DATABASE_ID, LINES_ID, "label", 255, true), "label");
  await attr(LINES_ID, () => db.createFloatAttribute(DATABASE_ID, LINES_ID, "amount", true), "amount");
  await attr(LINES_ID, () => db.createStringAttribute(DATABASE_ID, LINES_ID, "value_type", 16, true), "value_type");
  await attr(LINES_ID, () => db.createStringAttribute(DATABASE_ID, LINES_ID, "formula_label", 512, false), "formula_label");
  await attr(LINES_ID, () => db.createStringAttribute(DATABASE_ID, LINES_ID, "breakdown_json", 32768, false), "breakdown_json");
  await attr(LINES_ID, () => db.createIntegerAttribute(DATABASE_ID, LINES_ID, "sort_order", false, 0), "sort_order");
  await idx(LINES_ID, "fmcl_closing_idx", ["closing_id"]);
  await idx(LINES_ID, "fmcl_closing_order_idx", ["closing_id", "sort_order"]);
}

async function main() {
  console.log("=== Appwrite Financial DRE Collections Setup ===");
  await setupClosings();
  await setupLines();
  console.log("\nAdd to .env.local and function env:");
  console.log(`VITE_APPWRITE_FINANCIAL_MONTHLY_CLOSINGS_COL_ID=${CLOSINGS_ID}`);
  console.log(`VITE_APPWRITE_FINANCIAL_MONTHLY_CLOSING_LINES_COL_ID=${LINES_ID}`);
  console.log(`APPWRITE_FINANCIAL_MONTHLY_CLOSINGS_COL_ID=${CLOSINGS_ID}`);
  console.log(`APPWRITE_FINANCIAL_MONTHLY_CLOSING_LINES_COL_ID=${LINES_ID}`);
  console.log("\nDone.");
}

main().catch((error) => {
  console.error("Setup failed:", error?.message ?? error);
  process.exit(1);
});
