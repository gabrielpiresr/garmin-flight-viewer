import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases, ID, Permission, Role } from "node-appwrite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env.local");

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

const env = parseEnvFile(envPath);
const ENDPOINT = process.env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY || env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || env.VITE_APPWRITE_DATABASE_ID;
const COLLECTION_ID =
  process.env.APPWRITE_PROFILE_DOCUMENTS_COL_ID || env.VITE_APPWRITE_PROFILE_DOCUMENTS_COL_ID || "profile_documents";

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("Missing env vars. Required: endpoint, project, APPWRITE_API_KEY and database.");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const COLLECTION_PERMISSIONS = [
  Permission.create(Role.users()),
  Permission.read(Role.users()),
  Permission.update(Role.users()),
  Permission.delete(Role.users()),
  Permission.read(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attr(createFn, label) {
  try {
    await createFn();
    await sleep(700);
    console.log(`  + ${label}`);
  } catch (error) {
    const message = error?.message ?? String(error);
    if (/already exists/i.test(message)) {
      console.log(`  - ${label} already exists`);
      return;
    }
    throw error;
  }
}

async function idx(collectionId, name, attributes, orders, type = "key") {
  try {
    await db.createIndex(DATABASE_ID, collectionId, name, type, attributes, orders);
    await sleep(700);
    console.log(`  + index ${name}`);
  } catch (error) {
    const message = error?.message ?? String(error);
    if (/already exists/i.test(message)) {
      console.log(`  - index ${name} already exists`);
      return;
    }
    throw error;
  }
}

async function ensureCollection() {
  const list = await db.listCollections(DATABASE_ID);
  const found = list.collections.find((collection) => collection.$id === COLLECTION_ID || collection.name === COLLECTION_ID);
  if (found) {
    await db.updateCollection(
      DATABASE_ID,
      found.$id,
      found.name,
      COLLECTION_PERMISSIONS,
      true,
      found.enabled,
    );
    return found;
  }
  return db.createCollection(DATABASE_ID, COLLECTION_ID, "profile_documents", COLLECTION_PERMISSIONS, true, true);
}

async function main() {
  console.log("=== Profile Documents Collection Migration ===");
  const collection = await ensureCollection();
  console.log(`Collection: ${collection.$id}`);

  await attr(() => db.createStringAttribute(DATABASE_ID, collection.$id, "school_id", 64, true), "school_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, collection.$id, "user_id", 64, true), "user_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, collection.$id, "document_type", 40, true), "document_type");
  await attr(() => db.createStringAttribute(DATABASE_ID, collection.$id, "file_id", 64, true), "file_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, collection.$id, "file_name", 255, true), "file_name");
  await attr(() => db.createStringAttribute(DATABASE_ID, collection.$id, "mime_type", 128, false), "mime_type");
  await attr(() => db.createIntegerAttribute(DATABASE_ID, collection.$id, "file_size", false), "file_size");
  await attr(() => db.createStringAttribute(DATABASE_ID, collection.$id, "uploaded_at", 64, true), "uploaded_at");

  await idx(collection.$id, "profile_docs_user_idx", ["user_id"]);
  await idx(collection.$id, "profile_docs_type_idx", ["document_type"]);
  await idx(collection.$id, "profile_docs_unique_idx", ["user_id", "document_type"], ["ASC", "ASC"], "unique");

  console.log("=== Migration Complete ===");
  console.log(`VITE_APPWRITE_PROFILE_DOCUMENTS_COL_ID=${collection.$id}`);
}

main().catch((error) => {
  console.error("Migration failed:", error?.message ?? error);
  process.exit(1);
});
