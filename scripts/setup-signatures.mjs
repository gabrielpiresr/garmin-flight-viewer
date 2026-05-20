/**
 * Setup script for flight_signatures collection and new fields on flights collection.
 * Run: node scripts/setup-signatures.mjs
 */
import { Client, Databases, ID } from "node-appwrite";

const ENDPOINT = "https://sfo.cloud.appwrite.io/v1";
const PROJECT_ID = "6a01ac8a0009fbf94f05";
const API_KEY =
  "standard_c331b1343cf97b580560d1ea341a2609e4100195659849c17a5dcaab8b73c4d82bb840b4edc0209884a51c958fe3bc275a98230f570a51a9e2debe9a929af6ae069a2fa3268917905550c2bdb4a17fa79de223af4a17d7b0a8ec7a9daf0e4a3dd4d7657d269497813807cd6ae835d3e9ee905d45522c42f38188c41311393f6a";

const DB_ID = "6a01afae001bc352d1b1";
const FLIGHTS_COL_ID = "6a01afb1002232d33950";
const SIGNATURES_COL_ID = "flight_signatures";

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
