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
const PROFILES_COL_ID =
  process.env.APPWRITE_PROFILES_COLLECTION_ID || env.VITE_APPWRITE_PROFILES_COLLECTION_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error(
    "Missing env vars. Required: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID",
  );
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

async function attr(createFn, label) {
  try {
    await createFn();
    console.log(`  ✓ ${label}`);
  } catch (error) {
    if (error?.code === 409) console.log(`  · ${label} (already exists)`);
    else throw error;
  }
}

async function main() {
  if (!PROFILES_COL_ID) {
    console.warn("  ⚠ VITE_APPWRITE_PROFILES_COLLECTION_ID not set — skip profiles field");
    return;
  }
  console.log("profiles.schedule_onboarding_completed_at...");
  await attr(
    () => db.createStringAttribute(DATABASE_ID, PROFILES_COL_ID, "schedule_onboarding_completed_at", 64, false),
    "schedule_onboarding_completed_at",
  );
  console.log("\nDone.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
