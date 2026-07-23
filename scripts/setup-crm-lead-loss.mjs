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
const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || fileEnv.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID || fileEnv.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY || fileEnv.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID || fileEnv.VITE_APPWRITE_DATABASE_ID;
const COL_ID =
  process.env.APPWRITE_CRM_LEAD_LOSS_COL_ID ||
  process.env.VITE_APPWRITE_CRM_LEAD_LOSS_COL_ID ||
  fileEnv.VITE_APPWRITE_CRM_LEAD_LOSS_COL_ID ||
  "crm_lead_loss";

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("Missing Appwrite config.");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const PERMS = [
  Permission.read(Role.label("admin")),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
  Permission.read(Role.label("instrutor")),
];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureCollection() {
  try {
    const col = await db.getCollection(DATABASE_ID, COL_ID);
    await db.updateCollection(DATABASE_ID, COL_ID, col.name, PERMS, false, true);
    console.log(`- Collection ${COL_ID} already exists`);
  } catch (error) {
    const msg = String(error?.message || error).toLowerCase();
    if (!msg.includes("not found") && !msg.includes("could not be found")) throw error;
    await db.createCollection(DATABASE_ID, COL_ID, "CRM Lead Loss Reasons", PERMS, false, true);
    await sleep(1000);
    console.log(`+ Created collection ${COL_ID}`);
  }
}

async function ensureAttr(key, size) {
  try {
    await db.createStringAttribute({
      databaseId: DATABASE_ID,
      collectionId: COL_ID,
      key,
      size,
      required: false,
    });
    await sleep(800);
    console.log(`+ ${key}`);
  } catch (error) {
    if (error?.code === 409) console.log(`- ${key} already exists`);
    else throw error;
  }
}

console.log("=== CRM lead loss setup ===");
await ensureCollection();
await ensureAttr("loss_reason", 120);
await ensureAttr("loss_reason_notes", 2000);

for (let i = 0; i < 20; i++) {
  const col = await db.getCollection(DATABASE_ID, COL_ID);
  const a = col.attributes.find((x) => x.key === "loss_reason");
  const b = col.attributes.find((x) => x.key === "loss_reason_notes");
  console.log(`status t${i}:`, a?.status, b?.status);
  if (a?.status === "available" && b?.status === "available") {
    console.log("OK — atributos disponíveis.");
    process.exit(0);
  }
  if (a?.status === "failed" || b?.status === "failed") {
    console.error("Falha:", a?.error, b?.error);
    process.exit(1);
  }
  await sleep(3000);
}
console.error("Atributos ainda em processing.");
process.exit(2);
