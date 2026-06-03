import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases, ID, Query } from "node-appwrite";
import {
  PILOTO_PRIVADO_STAGES,
  PILOTO_PRIVADO_TRACK_NAME,
  summarizePilotoPrivadoStages,
} from "./data/piloto-privado-stages.mjs";

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
const SCHOOL_ID = process.env.SCHOOL_ID || env.VITE_SCHOOL_ID || "escola_principal";
const TRACKS_COLLECTION_ID =
  process.env.APPWRITE_TRAINING_TRACKS_COLLECTION_ID || env.VITE_APPWRITE_TRAINING_TRACKS_COL_ID || "training_tracks";

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("Missing Appwrite env (endpoint, project, API key, database).");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

async function main() {
  const { missionCount, totalMinutes } = summarizePilotoPrivadoStages();
  const data = {
    school_id: SCHOOL_ID,
    name: PILOTO_PRIVADO_TRACK_NAME,
    is_default: false,
    is_active: true,
    stages_json: JSON.stringify(PILOTO_PRIVADO_STAGES),
    mission_count: missionCount,
    total_minutes: totalMinutes,
    updated_at: new Date().toISOString(),
  };

  const existing = await db.listDocuments(DATABASE_ID, TRACKS_COLLECTION_ID, [
    Query.equal("school_id", [SCHOOL_ID]),
    Query.equal("name", [PILOTO_PRIVADO_TRACK_NAME]),
    Query.limit(1),
  ]);

  if (existing.documents[0]) {
    const doc = await db.updateDocument(
      DATABASE_ID,
      TRACKS_COLLECTION_ID,
      existing.documents[0].$id,
      data,
    );
    console.log(`Updated track "${PILOTO_PRIVADO_TRACK_NAME}" (${doc.$id})`);
    console.log(`  missions: ${missionCount}, total minutes: ${totalMinutes}`);
    return;
  }

  const created = await db.createDocument(DATABASE_ID, TRACKS_COLLECTION_ID, ID.unique(), data);
  console.log(`Created track "${PILOTO_PRIVADO_TRACK_NAME}" (${created.$id})`);
  console.log(`  missions: ${missionCount}, total minutes: ${totalMinutes}`);
}

main().catch((error) => {
  console.error("Seed failed:", error?.message || error);
  process.exit(1);
});
