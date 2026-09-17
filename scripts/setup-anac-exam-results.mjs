/**
 * Adds profile attributes used by the ANAC theoretical exam results sync.
 * This script only creates schema fields; it does not backfill or alter existing students.
 *
 * The profiles collection is close to Appwrite's attribute limit, so sync status
 * is compacted into anac_exam_sync_status as YYYY-MM-DD:status.
 */
import { Client, Databases } from "node-appwrite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
const PROFILES_COL = env.VITE_APPWRITE_PROFILES_COLLECTION_ID || "profiles";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attr(fn, label) {
  try {
    await fn();
    await sleep(600);
    console.log(`  ✓ ${label}`);
  } catch (error) {
    if (error?.code === 409 || String(error?.message || "").toLowerCase().includes("already exists")) {
      console.log(`  • ${label} (ja existe)`);
      return;
    }
    throw error;
  }
}

console.log("\n=== ANAC exam results profile attributes ===\n");

await attr(
  () => db.createStringAttribute(DATABASE_ID, PROFILES_COL, "anac_exam_results_json", 65535, false),
  "profiles.anac_exam_results_json",
);
await attr(
  () => db.createStringAttribute(DATABASE_ID, PROFILES_COL, "anac_exam_sync_status", 32, false),
  "profiles.anac_exam_sync_status",
);

console.log("\nConcluido. Nenhum aluno existente foi alterado.\n");
