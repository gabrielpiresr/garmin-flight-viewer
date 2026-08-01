/**
 * Updates existing aircraft_panels docs to use hi-res PNG asset paths.
 */
import { Client, Databases, Query } from "node-appwrite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEnvLocal() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const val = line.slice(i + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvLocal();

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID;
const PANELS_COL = process.env.VITE_APPWRITE_AIRCRAFT_PANELS_COL_ID;
const SCHOOL_ID = process.env.VITE_SCHOOL_ID || "escola_principal";

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

function toPngUrl(url) {
  if (typeof url !== "string") return url;
  return url.replace(/\.jpe?g(\?.*)?$/i, ".png$1");
}

async function main() {
  const res = await db.listDocuments(DATABASE_ID, PANELS_COL, [
    Query.equal("school_id", [SCHOOL_ID]),
    Query.limit(100),
  ]);

  for (const doc of res.documents) {
    let instruments = [];
    try {
      instruments = JSON.parse(doc.instruments_json || "[]");
    } catch {
      instruments = [];
    }
    const nextInstruments = instruments.map((inst) => ({
      ...inst,
      zoom_image_url: inst.zoom_image_url ? toPngUrl(inst.zoom_image_url) : null,
    }));
    const panelUrl = toPngUrl(doc.panel_image_url);
    await db.updateDocument(DATABASE_ID, PANELS_COL, doc.$id, {
      panel_image_url: panelUrl,
      instruments_json: JSON.stringify(nextInstruments),
      updated_at: new Date().toISOString(),
    });
    console.log(`  ✓ ${doc.title} → ${panelUrl}`);
  }
  console.log(`\nUpdated ${res.documents.length} panel(s).\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
