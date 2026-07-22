import { Client, Databases, ID, Permission, Role } from "node-appwrite";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env.local");

function readEnvFile(filePath) {
  const env = {};
  if (!existsSync(filePath)) return env;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    env[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return env;
}

function writeEnvFile(filePath, env) {
  const lines = Object.entries(env)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${value}`);
  writeFileSync(filePath, `${lines.join("\n")}\n`);
}

const fileEnv = readEnvFile(envPath);
for (const [key, value] of Object.entries(fileEnv)) {
  process.env[key] = process.env[key] || value;
  if (key.startsWith("VITE_")) process.env[key.slice(5)] = process.env[key.slice(5)] || value;
}

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("Missing APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY or APPWRITE_DATABASE_ID.");
  process.exit(1);
}

const COLLECTION_NAME = "flight_photos";
const COLLECTION_PERMISSIONS = [
  Permission.read(Role.users()),
  Permission.create(Role.label("admin")),
  Permission.read(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
  Permission.create(Role.label("instrutor")),
  Permission.read(Role.label("instrutor")),
  Permission.update(Role.label("instrutor")),
  Permission.delete(Role.label("instrutor")),
];

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureCollection() {
  const list = await db.listCollections(DATABASE_ID);
  const found = list.collections.find((collection) => collection.name === COLLECTION_NAME);
  if (found) {
    await db.updateCollection(DATABASE_ID, found.$id, found.name, COLLECTION_PERMISSIONS, found.documentSecurity, found.enabled);
    return found;
  }
  return db.createCollection(DATABASE_ID, ID.unique(), COLLECTION_NAME, COLLECTION_PERMISSIONS, true, true);
}

async function attr(createFn, label) {
  try {
    await createFn();
    await sleep(700);
    console.log(`  created ${label}`);
  } catch (error) {
    const message = error?.message ?? String(error);
    if (message.toLowerCase().includes("already exists")) {
      console.log(`  exists ${label}`);
      return;
    }
    throw error;
  }
}

async function idx(collectionId, key, attributes, orders = ["ASC"]) {
  try {
    await db.createIndex(DATABASE_ID, collectionId, key, "key", attributes, orders);
    await sleep(700);
    console.log(`  created index ${key}`);
  } catch (error) {
    const message = error?.message ?? String(error);
    if (message.toLowerCase().includes("already exists")) {
      console.log(`  exists index ${key}`);
      return;
    }
    throw error;
  }
}

const collection = await ensureCollection();
await attr(() => db.createStringAttribute(DATABASE_ID, collection.$id, "flight_id", 64, true), "flight_id");
await attr(() => db.createStringAttribute(DATABASE_ID, collection.$id, "uploaded_by", 64, true), "uploaded_by");
await attr(() => db.createStringAttribute(DATABASE_ID, collection.$id, "r2_key", 512, true), "r2_key");
await attr(() => db.createStringAttribute(DATABASE_ID, collection.$id, "file_name", 255, true), "file_name");
await attr(() => db.createStringAttribute(DATABASE_ID, collection.$id, "mime_type", 128, false), "mime_type");
await attr(() => db.createIntegerAttribute(DATABASE_ID, collection.$id, "file_size", false), "file_size");
await attr(() => db.createStringAttribute(DATABASE_ID, collection.$id, "file_url", 2048, true), "file_url");
await attr(() => db.createStringAttribute(DATABASE_ID, collection.$id, "download_url", 2048, false), "download_url");
await attr(() => db.createStringAttribute(DATABASE_ID, collection.$id, "created_at", 64, true), "created_at");
await idx(collection.$id, "flight_photos_flight_idx", ["flight_id"]);

const nextEnv = { ...fileEnv, VITE_APPWRITE_FLIGHT_PHOTOS_COLLECTION_ID: collection.$id };
writeEnvFile(envPath, nextEnv);
console.log(`VITE_APPWRITE_FLIGHT_PHOTOS_COLLECTION_ID=${collection.$id}`);
