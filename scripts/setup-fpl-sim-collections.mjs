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

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error(
    "Missing env vars. Required: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID",
  );
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attr(cid, createFn, label) {
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

async function idx(cid, key, attributes, orders = ["ASC"]) {
  try {
    await db.createIndex(DATABASE_ID, cid, key, "key", attributes, orders);
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

async function ensureCollection(id, name, permissions, documentSecurity) {
  try {
    const col = await db.getCollection(DATABASE_ID, id);
    await db.updateCollection(DATABASE_ID, id, col.name, permissions, documentSecurity, true);
    console.log(`  - Collection already exists (${id}); permissions updated`);
    return col;
  } catch (error) {
    const msg = error?.message ?? String(error);
    const normalized = msg.toLowerCase();
    if (!normalized.includes("not found") && !normalized.includes("could not be found")) throw error;
  }
  const col = await db.createCollection(DATABASE_ID, id, name, permissions, documentSecurity, true);
  console.log(`  + Created collection ${name} (${col.$id})`);
  return col;
}

function upsertEnvLine(envPath, key, value) {
  let content = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(content)) content = content.replace(re, line);
  else content = `${content.trimEnd()}\n${line}\n`;
  writeFileSync(envPath, content, "utf8");
}

async function setupPlans() {
  const id = "fpl_sim_plans";
  await ensureCollection(
    id,
    "fpl_sim_plans",
    [Permission.create(Role.users()), Permission.read(Role.label("admin"))],
    true,
  );
  await attr(id, () => db.createStringAttribute(DATABASE_ID, id, "user_id", 64, true), "user_id");
  await attr(id, () => db.createStringAttribute(DATABASE_ID, id, "school_id", 64, true), "school_id");
  await attr(id, () => db.createStringAttribute(DATABASE_ID, id, "kind", 8, true), "kind");
  await attr(id, () => db.createStringAttribute(DATABASE_ID, id, "status", 16, true), "status");
  await attr(id, () => db.createStringAttribute(DATABASE_ID, id, "dep_ad", 8, false), "dep_ad");
  await attr(id, () => db.createStringAttribute(DATABASE_ID, id, "dest_ad", 8, false), "dest_ad");
  await attr(id, () => db.createStringAttribute(DATABASE_ID, id, "eobt", 8, false), "eobt");
  await attr(id, () => db.createStringAttribute(DATABASE_ID, id, "form_json", 32768, true), "form_json");
  await attr(id, () => db.createStringAttribute(DATABASE_ID, id, "last_errors_json", 8192, false), "last_errors_json");
  await attr(id, () => db.createStringAttribute(DATABASE_ID, id, "created_at", 40, false), "created_at");
  await attr(id, () => db.createStringAttribute(DATABASE_ID, id, "updated_at", 40, false), "updated_at");
  await idx(id, "fpl_sim_plans_user_idx", ["user_id"]);
}

async function setupTips() {
  const id = "fpl_sim_tips";
  await ensureCollection(
    id,
    "fpl_sim_tips",
    [
      Permission.read(Role.users()),
      Permission.create(Role.label("admin")),
      Permission.update(Role.label("admin")),
      Permission.delete(Role.label("admin")),
    ],
    false,
  );
  await attr(id, () => db.createStringAttribute(DATABASE_ID, id, "school_id", 64, true), "school_id");
  await attr(id, () => db.createStringAttribute(DATABASE_ID, id, "tips_json", 32768, true), "tips_json");
  await idx(id, "fpl_sim_tips_school_idx", ["school_id"]);
}

const envLocal = resolve(process.cwd(), ".env.local");
await setupPlans();
await setupTips();
upsertEnvLine(envLocal, "VITE_APPWRITE_FPL_SIM_PLANS_COL_ID", "fpl_sim_plans");
upsertEnvLine(envLocal, "VITE_APPWRITE_FPL_SIM_TIPS_COL_ID", "fpl_sim_tips");
console.log("FPL simulator collections ready.");
