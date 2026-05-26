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
    const idx = trimmed.indexOf("=");
    entries[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return entries;
}

const env = parseEnvFile(envPath);
const ENDPOINT = process.env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY || env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || env.VITE_APPWRITE_DATABASE_ID;
const STUDENT_TRACKS_COL_ID =
  process.env.APPWRITE_STUDENT_TRACKS_COLLECTION_ID || env.VITE_APPWRITE_STUDENT_TRACKS_COL_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID || !STUDENT_TRACKS_COL_ID) {
  console.error(
    "Missing env vars. Required: endpoint, project, APPWRITE_API_KEY, database, VITE_APPWRITE_STUDENT_TRACKS_COL_ID",
  );
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attr(label, createFn) {
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
  console.log("Setting up Flight Review Club field on student_training_tracks...");
  console.log(`  Collection: ${STUDENT_TRACKS_COL_ID}`);

  await attr("is_flight_review_club_member (boolean)", () =>
    db.createBooleanAttribute(DATABASE_ID, STUDENT_TRACKS_COL_ID, "is_flight_review_club_member", false),
  );

  console.log("\nDone.");
}

main().catch((e) => {
  console.error("Error:", e?.message ?? e);
  process.exit(1);
});
