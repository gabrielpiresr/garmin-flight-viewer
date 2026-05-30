import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases } from "node-appwrite";

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
const PROFILES_COL_ID = env.VITE_APPWRITE_PROFILES_COLLECTION_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("Missing env vars. Required: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID");
  process.exit(1);
}

if (!PROFILES_COL_ID) {
  console.error("Missing VITE_APPWRITE_PROFILES_COLLECTION_ID in .env.local");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attr(createFn, label) {
  try {
    await createFn();
    await sleep(700);
    console.log(`  ✓ ${label}`);
  } catch (error) {
    const msg = error?.message ?? String(error);
    if (msg.toLowerCase().includes("already exists")) {
      console.log(`  • ${label} (already exists)`);
      return;
    }
    throw error;
  }
}

async function main() {
  console.log("=== Profile Extra Fields Migration ===");
  console.log(`Profiles collection: ${PROFILES_COL_ID}\n`);

  await attr(() => db.createStringAttribute(DATABASE_ID, PROFILES_COL_ID, "rg", 20, false), "rg");
  await attr(() => db.createStringAttribute(DATABASE_ID, PROFILES_COL_ID, "rg_orgao_expedidor", 50, false), "rg_orgao_expedidor");
  await attr(() => db.createStringAttribute(DATABASE_ID, PROFILES_COL_ID, "endereco", 512, false), "endereco");
  await attr(() => db.createStringAttribute(DATABASE_ID, PROFILES_COL_ID, "nacionalidade", 100, false), "nacionalidade");
  await attr(() => db.createStringAttribute(DATABASE_ID, PROFILES_COL_ID, "estado_civil", 30, false), "estado_civil");

  console.log("\n=== Migration Complete ===");
  console.log("Fields added to profiles collection:");
  console.log("  rg, rg_orgao_expedidor, endereco, nacionalidade, estado_civil");
}

main().catch((error) => {
  console.error("Migration failed:", error?.message ?? error);
  process.exit(1);
});
