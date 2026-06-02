/**
 * Script: setup-refer-and-earn.mjs
 * Adiciona referrer_user_id em crm_leads e profiles + índices.
 * Uso:
 *   APPWRITE_ENDPOINT=... APPWRITE_PROJECT_ID=... APPWRITE_API_KEY=... node scripts/setup-refer-and-earn.mjs
 */

import { Client, Databases, DatabasesIndexType as IndexType } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT || "https://sfo.cloud.appwrite.io/v1";
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || "6a01ac8a0009fbf94f05";
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || "6a01afae001bc352d1b1";
const PROFILES_COL_ID = process.env.APPWRITE_PROFILES_COLLECTION_ID || "6a01ebb50034d5067723";
const CRM_COL_ID = process.env.APPWRITE_CRM_LEADS_COLLECTION_ID || "crm_leads";

if (!API_KEY) {
  console.error("Defina APPWRITE_API_KEY.");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

async function tryCreateAttribute(fn, label) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
  } catch (e) {
    if (e.code === 409) console.log(`  ~ ${label} (já existe)`);
    else console.error(`  ✗ ${label}: ${e.message}`);
  }
}

async function tryCreateIndex(collectionId, key, attrs) {
  try {
    await db.createIndex(DB_ID, collectionId, key, IndexType.Key, attrs, ["ASC"]);
    console.log(`  ✓ índice ${collectionId}.${key}`);
  } catch (e) {
    if (e.code === 409) console.log(`  ~ índice ${collectionId}.${key} (já existe)`);
    else console.error(`  ✗ índice ${collectionId}.${key}: ${e.message}`);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

console.log("\n▶ Adicionando referrer_user_id ao crm_leads...");
await tryCreateAttribute(
  () => db.createStringAttribute(DB_ID, CRM_COL_ID, "referrer_user_id", 36, false),
  "crm_leads.referrer_user_id",
);
await sleep(400);

console.log("\n▶ Adicionando referrer_user_id ao profiles...");
await tryCreateAttribute(
  () => db.createStringAttribute(DB_ID, PROFILES_COL_ID, "referrer_user_id", 36, false),
  "profiles.referrer_user_id",
);
await sleep(2000);

console.log("\n▶ Criando índices...");
await tryCreateIndex(CRM_COL_ID, "idx_referrer_user_id", ["referrer_user_id"]);
await sleep(300);
await tryCreateIndex(PROFILES_COL_ID, "idx_referrer_user_id", ["referrer_user_id"]);

console.log("\n✅ Setup Indique e Ganhe concluído!\n");
