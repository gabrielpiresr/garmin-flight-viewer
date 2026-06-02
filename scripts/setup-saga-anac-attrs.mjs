/**
 * Adds CRM/profile attributes for SAGA ANAC lookup storage.
 */
import { Client, Databases } from "node-appwrite";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf-8")
    .split("\n")
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const idx = line.indexOf("=");
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
    }),
);

const client = new Client()
  .setEndpoint(env.VITE_APPWRITE_ENDPOINT || "https://sfo.cloud.appwrite.io/v1")
  .setProject(env.VITE_APPWRITE_PROJECT_ID)
  .setKey(env.APPWRITE_API_KEY);

const db = new Databases(client);
const DATABASE_ID = env.VITE_APPWRITE_DATABASE_ID;
const CRM_COL = env.VITE_APPWRITE_CRM_LEADS_COL_ID || "crm_leads";
const PROFILES_COL = env.VITE_APPWRITE_PROFILES_COLLECTION_ID || "profiles";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function tryAttr(fn, label) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
  } catch (e) {
    if (e.code === 409) console.log(`  ~ ${label} (already exists)`);
    else console.error(`  ✗ ${label}: ${e.message}`);
  }
}

console.log("\n▶ CRM leads attributes...");
await tryAttr(
  () => db.createStringAttribute(DATABASE_ID, CRM_COL, "cpf", 14, false),
  "crm_leads.cpf",
);
await sleep(400);
await tryAttr(
  () => db.createStringAttribute(DATABASE_ID, CRM_COL, "saga_anac_json", 16384, false),
  "crm_leads.saga_anac_json",
);

console.log("\n▶ Profiles attributes...");
await sleep(400);
await tryAttr(
  () => db.createStringAttribute(DATABASE_ID, PROFILES_COL, "saga_anac_json", 16384, false),
  "profiles.saga_anac_json",
);

console.log("\n✅ Done.\n");
