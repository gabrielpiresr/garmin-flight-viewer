import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { Client, Databases, Permission, Role } from "node-appwrite";

function readEnvFile() {
  const env = {};
  const path = fileURLToPath(new URL("../.env.local", import.meta.url));
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, "utf-8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return env;
}

const fileEnv = readEnvFile();
const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || fileEnv.VITE_APPWRITE_ENDPOINT || "https://sfo.cloud.appwrite.io/v1";
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID || fileEnv.VITE_APPWRITE_PROJECT_ID || "6a01ac8a0009fbf94f05";
const API_KEY = process.env.APPWRITE_API_KEY || fileEnv.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID || fileEnv.VITE_APPWRITE_DATABASE_ID || "6a01afae001bc352d1b1";
const CRM_AUTOMATION_SETTINGS_COL_ID =
  process.env.APPWRITE_CRM_AUTOMATION_SETTINGS_COL_ID ||
  process.env.VITE_APPWRITE_CRM_AUTOMATION_SETTINGS_COL_ID ||
  fileEnv.VITE_APPWRITE_CRM_AUTOMATION_SETTINGS_COL_ID ||
  "crm_automation_settings";

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("Missing Appwrite config. Required endpoint, project, api key and database id.");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const SETTINGS_PERMISSIONS = [
  Permission.read(Role.label("admin")),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
  Permission.read(Role.label("instrutor")),
];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attr(createFn, label) {
  try {
    await createFn();
    await sleep(650);
    console.log(`  + ${label}`);
  } catch (error) {
    const msg = String(error?.message || error).toLowerCase();
    if (error?.code === 409 || msg.includes("already exists")) {
      console.log(`  - ${label} already exists`);
      return;
    }
    throw error;
  }
}

async function ensureCollection() {
  try {
    const col = await db.getCollection(DATABASE_ID, CRM_AUTOMATION_SETTINGS_COL_ID);
    await db.updateCollection(DATABASE_ID, CRM_AUTOMATION_SETTINGS_COL_ID, col.name, SETTINGS_PERMISSIONS, false, true);
    console.log(`  - Collection ${CRM_AUTOMATION_SETTINGS_COL_ID} already exists`);
    return;
  } catch (error) {
    const msg = String(error?.message || error).toLowerCase();
    if (!msg.includes("not found") && !msg.includes("could not be found")) throw error;
  }
  await db.createCollection(DATABASE_ID, CRM_AUTOMATION_SETTINGS_COL_ID, "CRM Automation Settings", SETTINGS_PERMISSIONS, false, true);
  await sleep(1000);
  console.log(`  + Created collection ${CRM_AUTOMATION_SETTINGS_COL_ID}`);
}

console.log("=== CRM automation settings setup ===");
await ensureCollection();
await attr(
  () => db.createStringAttribute(DATABASE_ID, CRM_AUTOMATION_SETTINGS_COL_ID, "settings_json", 100000, false, "{}"),
  "settings_json",
);

console.log("\nDone. Document id 'default' will be created on first save from the admin UI.");
