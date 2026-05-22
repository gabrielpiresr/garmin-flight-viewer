/**
 * Setup script for flight_signatures collection and new fields on flights collection.
 * Run: node scripts/setup-signatures.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases, ID } from "node-appwrite";

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
const DB_ID = process.env.APPWRITE_DATABASE_ID || env.VITE_APPWRITE_DATABASE_ID;
const FLIGHTS_COL_ID = process.env.APPWRITE_FLIGHTS_COLLECTION_ID || env.VITE_APPWRITE_COLLECTION_ID;
const SIGNATURES_COL_ID = process.env.APPWRITE_FLIGHT_SIGNATURES_COLLECTION_ID || env.VITE_APPWRITE_FLIGHT_SIGNATURES_COL_ID || "flight_signatures";

const missing = [];
if (!ENDPOINT) missing.push("VITE_APPWRITE_ENDPOINT");
if (!PROJECT_ID) missing.push("VITE_APPWRITE_PROJECT_ID");
if (!API_KEY) missing.push("APPWRITE_API_KEY");
if (!DB_ID) missing.push("VITE_APPWRITE_DATABASE_ID");
if (!FLIGHTS_COL_ID) missing.push("VITE_APPWRITE_COLLECTION_ID");
if (missing.length) {
  console.error(`Missing env vars. Required: ${missing.join(", ")}`);
  process.exit(1);
}

const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const db = new Databases(client);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tryCreate(fn, label) {
  try {
    const result = await fn();
    console.log(`  ✓ ${label}`);
    return result;
  } catch (e) {
    if (e?.code === 409 || e?.message?.includes("already exists") || e?.message?.includes("duplicate")) {
      console.log(`  ↷ ${label} (já existe, ignorando)`);
      return null;
    }
    console.error(`  ✗ ${label}: ${e?.message ?? String(e)}`);
    throw e;
  }
}

async function main() {
  console.log("\n=== 1. Criar coleção flight_signatures ===");

  await tryCreate(
    () =>
      db.createCollection(DB_ID, SIGNATURES_COL_ID, "Flight Signatures", [
        `read("users")`,
        `create("users")`,
        `update("users")`,
        `delete("label:admin")`,
      ], true),
    "coleção flight_signatures",
  );

  await sleep(800);

  console.log("\n=== 2. Atributos de flight_signatures ===");

  const sigAttrs = [
    () => db.createStringAttribute(DB_ID, SIGNATURES_COL_ID, "flight_id", 36, true),
    () => db.createStringAttribute(DB_ID, SIGNATURES_COL_ID, "signer_user_id", 36, true),
    () => db.createStringAttribute(DB_ID, SIGNATURES_COL_ID, "signer_role", 32, true),
    () => db.createStringAttribute(DB_ID, SIGNATURES_COL_ID, "signed_at", 32, true),
    () => db.createStringAttribute(DB_ID, SIGNATURES_COL_ID, "user_agent", 512, false),
    () => db.createStringAttribute(DB_ID, SIGNATURES_COL_ID, "content_hash", 64, false),
    () => db.createStringAttribute(DB_ID, SIGNATURES_COL_ID, "school_id", 64, true),
    () => db.createStringAttribute(DB_ID, SIGNATURES_COL_ID, "status", 16, true),
  ];

  const attrLabels = [
    "flight_id (string)",
    "signer_user_id (string)",
    "signer_role (string)",
    "signed_at (string)",
    "user_agent (string, optional)",
    "content_hash (string, optional)",
    "school_id (string)",
    "status (string)",
  ];

  for (let i = 0; i < sigAttrs.length; i++) {
    await tryCreate(sigAttrs[i], attrLabels[i]);
    await sleep(400);
  }

  console.log("\n=== 3. Aguardando atributos ficarem ativos ===");
  await sleep(3000);

  console.log("\n=== 4. Índices de flight_signatures ===");

  await tryCreate(
    () => db.createIndex(DB_ID, SIGNATURES_COL_ID, "idx_flight_id", "key", ["flight_id"], ["ASC"]),
    "índice flight_id",
  );
  await sleep(500);
  await tryCreate(
    () => db.createIndex(DB_ID, SIGNATURES_COL_ID, "idx_signer_user_id", "key", ["signer_user_id"], ["ASC"]),
    "índice signer_user_id",
  );
  await sleep(500);
  await tryCreate(
    () => db.createIndex(DB_ID, SIGNATURES_COL_ID, "idx_flight_role", "key", ["flight_id", "signer_role"], ["ASC", "ASC"]),
    "índice composto flight_id+signer_role",
  );

  console.log("\n=== 5. Novos campos na coleção flights ===");

  await sleep(1000);

  await tryCreate(
    () => db.createBooleanAttribute(DB_ID, FLIGHTS_COL_ID, "instructor_signed", false, false),
    "instructor_signed (boolean)",
  );
  await sleep(500);
  await tryCreate(
    () => db.createBooleanAttribute(DB_ID, FLIGHTS_COL_ID, "student_signed", false, false),
    "student_signed (boolean)",
  );
  await sleep(500);
  await tryCreate(
    () => db.createBooleanAttribute(DB_ID, FLIGHTS_COL_ID, "admin_operator_signed", false, false),
    "admin_operator_signed (boolean)",
  );
  await sleep(500);
  await tryCreate(
    () => db.createStringAttribute(DB_ID, FLIGHTS_COL_ID, "instructor_signed_at", 32, false),
    "instructor_signed_at (string)",
  );
  await sleep(500);
  await tryCreate(
    () => db.createStringAttribute(DB_ID, FLIGHTS_COL_ID, "flight_status", 16, false),
    "flight_status (string)",
  );

  console.log("\n=== 6. Índice instructor_signed na coleção flights ===");
  await sleep(2000);
  await tryCreate(
    () =>
      db.createIndex(DB_ID, FLIGHTS_COL_ID, "idx_admin_pending_signatures", "key", [
        "admin_operator_signed",
        "instructor_signed",
      ], ["ASC", "ASC"]),
    "índice admin_pending_signatures",
  );

  console.log("\n✅ Setup de assinaturas concluído!\n");
  console.log(`Collection ID para o .env: VITE_APPWRITE_FLIGHT_SIGNATURES_COL_ID=flight_signatures\n`);
}

main().catch((e) => {
  console.error("Erro fatal:", e);
  process.exit(1);
});
