import fs from "node:fs";
import path from "node:path";
import { Client, Databases, ID, Permission, Role } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID;
const DB_NAME = "flights-db";
const COLLECTION_NAME = "student_credits";

if (!ENDPOINT || !PROJECT_ID || !API_KEY) {
  console.error("Missing APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID or APPWRITE_API_KEY.");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const ADMIN_PERMS = [
  Permission.read(Role.label("admin")),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

const COLLECTION_PERMS = [
  ...ADMIN_PERMS,
  Permission.read(Role.label("instrutor")),
];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const entries = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    entries[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return entries;
}

function upsertEnvLine(filePath, key, value) {
  const lines = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8").split(/\r?\n/) : [];
  const nextLine = `${key}=${value}`;
  const index = lines.findIndex((line) => line.startsWith(`${key}=`));
  if (index >= 0) {
    lines[index] = nextLine;
  } else {
    if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
    lines.push(nextLine);
  }
  fs.writeFileSync(filePath, lines.join("\n"));
}

async function ensureDatabase() {
  if (DATABASE_ID) return db.get(DATABASE_ID);
  const existing = await db.list();
  const found = existing.databases.find((database) => database.name === DB_NAME);
  if (found) return found;
  return db.create(ID.unique(), DB_NAME);
}

async function ensureCollection(databaseId) {
  const list = await db.listCollections(databaseId);
  const found = list.collections.find((collection) => collection.name === COLLECTION_NAME);
  if (found) {
    await db.updateCollection(databaseId, found.$id, COLLECTION_NAME, COLLECTION_PERMS, true, true);
    return found;
  }
  return db.createCollection(databaseId, ID.unique(), COLLECTION_NAME, COLLECTION_PERMS, true, true);
}

async function attr(createFn, label) {
  try {
    await createFn();
    await sleep(700);
    console.log(`   OK ${label}`);
  } catch (error) {
    const msg = error?.message ?? String(error);
    if (msg.toLowerCase().includes("already exists")) {
      console.log(`   - ${label} (already exists)`);
      return;
    }
    throw error;
  }
}

async function idx(databaseId, collectionId, key, attributes, orders = ["ASC"]) {
  try {
    await db.createIndex(databaseId, collectionId, key, "key", attributes, orders);
    await sleep(700);
    console.log(`   OK index ${key}`);
  } catch (error) {
    const msg = error?.message ?? String(error);
    if (msg.toLowerCase().includes("already exists")) {
      console.log(`   - index ${key} (already exists)`);
      return;
    }
    throw error;
  }
}

async function configureCredits(databaseId, collectionId) {
  await attr(() => db.createStringAttribute(databaseId, collectionId, "user_id", 64, true), "user_id");
  await attr(() => db.createStringAttribute(databaseId, collectionId, "aircraft_model_id", 64, true), "aircraft_model_id");
  await attr(() => db.createStringAttribute(databaseId, collectionId, "aircraft_model_name", 128, true), "aircraft_model_name");
  await attr(() => db.createStringAttribute(databaseId, collectionId, "purchase_date", 10, true), "purchase_date");
  await attr(() => db.createStringAttribute(databaseId, collectionId, "expires_at", 10, true), "expires_at");
  await attr(() => db.createFloatAttribute(databaseId, collectionId, "amount_paid", true), "amount_paid");
  await attr(() => db.createStringAttribute(databaseId, collectionId, "payment_method", 64, true), "payment_method");
  await attr(() => db.createIntegerAttribute(databaseId, collectionId, "payment_installments", false), "payment_installments");
  await attr(() => db.createIntegerAttribute(databaseId, collectionId, "validity_days", true), "validity_days");
  await attr(() => db.createFloatAttribute(databaseId, collectionId, "hours", true), "hours");
  await attr(() => db.createStringAttribute(databaseId, collectionId, "notes", 1024, false), "notes");
  await attr(() => db.createStringAttribute(databaseId, collectionId, "created_by", 64, false), "created_by");
  await attr(() => db.createStringAttribute(databaseId, collectionId, "updated_by", 64, false), "updated_by");

  await idx(databaseId, collectionId, "credits_user_idx", ["user_id"]);
  await idx(databaseId, collectionId, "credits_model_idx", ["aircraft_model_id"]);
  await idx(databaseId, collectionId, "credits_purchase_idx", ["purchase_date"]);
  await idx(databaseId, collectionId, "credits_expires_idx", ["expires_at"]);
  await idx(databaseId, collectionId, "credits_user_model_idx", ["user_id", "aircraft_model_id"]);
}

async function main() {
  console.log("Configuring student_credits collection...");
  const database = await ensureDatabase();
  const collection = await ensureCollection(database.$id);
  await configureCredits(database.$id, collection.$id);

  const envPath = path.resolve(process.cwd(), ".env.local");
  const env = parseEnvFile(envPath);
  upsertEnvLine(envPath, "VITE_APPWRITE_ENDPOINT", env.VITE_APPWRITE_ENDPOINT || ENDPOINT);
  upsertEnvLine(envPath, "VITE_APPWRITE_PROJECT_ID", env.VITE_APPWRITE_PROJECT_ID || PROJECT_ID);
  upsertEnvLine(envPath, "VITE_APPWRITE_DATABASE_ID", env.VITE_APPWRITE_DATABASE_ID || database.$id);
  upsertEnvLine(envPath, "VITE_APPWRITE_STUDENT_CREDITS_COL_ID", collection.$id);

  console.log("\nSetup complete. Add/use these frontend variables:");
  console.log(`VITE_APPWRITE_DATABASE_ID=${database.$id}`);
  console.log(`VITE_APPWRITE_STUDENT_CREDITS_COL_ID=${collection.$id}`);
}

main().catch((error) => {
  console.error("Setup failed:", error?.message ?? error);
  process.exit(1);
});
