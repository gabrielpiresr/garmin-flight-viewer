import { Client, Databases, Permission, Role } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const COLLECTION_ID = process.env.APPWRITE_PRODUCT_SALES_COL_ID || "product_sales";

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
  const col = await db.createCollection(DATABASE_ID, COLLECTION_ID, "product_sales", PERMISSIONS, true, true);
  console.log(`  + Created collection product_sales (${col.$id})`);
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
  console.log("=== Appwrite Product Sales Collection Setup ===");
  await ensureCollection();
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "school_id", 64, false), "school_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "user_id", 64, true), "user_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "product_id", 64, true), "product_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "product_name", 255, true), "product_name");
  await attr(() => db.createFloatAttribute(DATABASE_ID, COLLECTION_ID, "ideal_price", false, 0), "ideal_price");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "sale_date", 10, true), "sale_date");
  await attr(() => db.createFloatAttribute(DATABASE_ID, COLLECTION_ID, "amount_paid", true), "amount_paid");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "payment_method", 64, true), "payment_method");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "notes", 1024, false), "notes");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "created_by", 64, false), "created_by");
  await idx("sales_user_idx", ["user_id"]);
  await idx("sales_school_date_idx", ["school_id", "sale_date"], ["ASC", "DESC"]);
  console.log("\nAdd to .env.local:");
  console.log(`VITE_APPWRITE_PRODUCT_SALES_COL_ID=${COLLECTION_ID}`);
  console.log("\nDone.");
}

main().catch((error) => {
  console.error("Setup failed:", error?.message ?? error);
  process.exit(1);
});
