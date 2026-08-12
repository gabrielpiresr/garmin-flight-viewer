import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases, Permission, Role } from "node-appwrite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

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

const env = parseEnvFile(path.join(root, ".env.local"));
const ENDPOINT = process.env.APPWRITE_ENDPOINT || env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY || env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || env.APPWRITE_DATABASE_ID || env.VITE_APPWRITE_DATABASE_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("Missing env vars. Required: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const PERMS = [
  Permission.create(Role.users()),
  Permission.read(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
  Permission.read(Role.label("instrutor")),
];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureCollection(name) {
  const list = await db.listCollections(DATABASE_ID);
  const found = list.collections.find((c) => c.name === name);
  if (found) {
    console.log(`  - Collection "${name}" already exists (${found.$id})`);
    return found;
  }
  const collectionId = process.env.APPWRITE_FLIGHT_PLANNING_AI_BRIEFINGS_COLLECTION_ID ||
    process.env.APPWRITE_FLIGHT_PLANNING_AI_BRIEFINGS_COL_ID ||
    "flight_planning_ai_briefings";
  const col = await db.createCollection(DATABASE_ID, collectionId, name, PERMS, true, true);
  console.log(`  + Created collection "${name}" (${col.$id})`);
  return col;
}

async function attr(createFn, label) {
  try {
    await createFn();
    await sleep(700);
    console.log(`     + ${label}`);
  } catch (error) {
    const msg = error?.message ?? String(error);
    if (msg.toLowerCase().includes("already exists")) {
      console.log(`     - ${label} (already exists)`);
      return;
    }
    throw error;
  }
}

async function idx(colId, key, attributes, orders = ["ASC"]) {
  try {
    await db.createIndex(DATABASE_ID, colId, key, "key", attributes, orders);
    await sleep(700);
    console.log(`     + index ${key}`);
  } catch (error) {
    const msg = error?.message ?? String(error);
    if (msg.toLowerCase().includes("already exists")) {
      console.log(`     - index ${key} (already exists)`);
      return;
    }
    throw error;
  }
}

async function main() {
  console.log("=== Flight Planning AI Briefings Setup ===");
  const col = await ensureCollection("flight_planning_ai_briefings");
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "user_id", 64, true), "user_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "origin_icao", 8, true), "origin_icao");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "destination_icao", 8, true), "destination_icao");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "alternate_icaos_json", 1024, false, "[]"), "alternate_icaos_json");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "route_hash", 80, true), "route_hash");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "status", 16, true), "status");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "report_json", 50000, true), "report_json");
  await attr(() => db.createDatetimeAttribute(DATABASE_ID, id, "created_at", true), "created_at");
  await attr(() => db.createDatetimeAttribute(DATABASE_ID, id, "updated_at", true), "updated_at");
  await idx(id, "fpai_user_idx", ["user_id"]);
  await idx(id, "fpai_route_idx", ["user_id", "route_hash"]);
  await idx(id, "fpai_updated_idx", ["updated_at"], ["DESC"]);

  console.log("\n=== Setup Complete ===");
  console.log("Add this to your Appwrite Function env and .env.local if needed:\n");
  console.log(`APPWRITE_FLIGHT_PLANNING_AI_BRIEFINGS_COL_ID=${id}`);
}

main().catch((error) => {
  console.error("Setup failed:", error?.message ?? error);
  process.exit(1);
});
