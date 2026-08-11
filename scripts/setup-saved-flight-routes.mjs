import { Client, Databases, Permission, Role } from "node-appwrite";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID;
const COLLECTION_ID =
  process.env.APPWRITE_SAVED_FLIGHT_ROUTES_COL_ID ||
  process.env.VITE_APPWRITE_SAVED_FLIGHT_ROUTES_COL_ID ||
  "saved_flight_routes";

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error(
    "Missing env vars. Required: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID",
  );
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

/** Collection-level: any logged-in user can create; document ACL restricts access. */
const PERMISSIONS = [
  Permission.create(Role.users()),
  Permission.read(Role.label("admin")),
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
  const col = await db.createCollection(
    DATABASE_ID,
    COLLECTION_ID,
    "saved_flight_routes",
    PERMISSIONS,
    true,
    true,
  );
  console.log(`  + Created collection saved_flight_routes (${col.$id})`);
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

function upsertEnvLine(envPath, key, value) {
  let content = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(content)) {
    content = content.replace(re, line);
  } else {
    content = `${content.trimEnd()}\n${line}\n`;
  }
  writeFileSync(envPath, content, "utf8");
}

async function main() {
  console.log("=== Appwrite Saved Flight Routes Collection Setup ===");
  await ensureCollection();
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "user_id", 64, true), "user_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "name", 200, true), "name");
  await attr(
    () => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "waypoints_json", 100000, true),
    "waypoints_json",
  );
  await attr(() => db.createFloatAttribute(DATABASE_ID, COLLECTION_ID, "cruise_speed_kt", false), "cruise_speed_kt");
  await attr(
    () => db.createFloatAttribute(DATABASE_ID, COLLECTION_ID, "fuel_burn_per_hour", false),
    "fuel_burn_per_hour",
  );
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "fuel_unit", 16, false, "L"), "fuel_unit");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "created_at", 32, true), "created_at");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "updated_at", 32, true), "updated_at");
  await idx("saved_routes_user_updated_idx", ["user_id", "updated_at"], ["ASC", "DESC"]);

  const envPath = resolve(process.cwd(), ".env.local");
  upsertEnvLine(envPath, "VITE_APPWRITE_SAVED_FLIGHT_ROUTES_COL_ID", COLLECTION_ID);
  console.log(`\n✓ VITE_APPWRITE_SAVED_FLIGHT_ROUTES_COL_ID=${COLLECTION_ID} written to .env.local`);
}

main().catch((error) => {
  console.error("Setup failed:", error?.message ?? error);
  process.exit(1);
});
