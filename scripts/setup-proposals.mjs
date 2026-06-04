/**
 * Script: setup-proposals.mjs
 * Cria as coleções proposal_config e crm_proposals no Appwrite.
 * Uso: node scripts/setup-proposals.mjs
 */

import { Client, Databases, Permission, Role, DatabasesIndexType as IndexType } from "node-appwrite";
import { readFileSync, writeFileSync } from "fs";

const ENDPOINT   = "https://sfo.cloud.appwrite.io/v1";
const PROJECT_ID = "6a01ac8a0009fbf94f05";
const API_KEY    = "standard_c331b1343cf97b580560d1ea341a2609e4100195659849c17a5dcaab8b73c4d82bb840b4edc0209884a51c958fe3bc275a98230f570a51a9e2debe9a929af6ae069a2fa3268917905550c2bdb4a17fa79de223af4a17d7b0a8ec7a9daf0e4a3dd4d7657d269497813807cd6ae835d3e9ee905d45522c42f38188c41311393f6a";
const DB_ID      = "6a01afae001bc352d1b1";

const PROPOSAL_CONFIG_COL_ID  = "proposal_config";
const CRM_PROPOSALS_COL_ID    = "crm_proposals";

const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const db = new Databases(client);

async function tryCreateAttribute(fn, label) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
  } catch (e) {
    if (e.code === 409) {
      console.log(`  ~ ${label} (já existe)`);
    } else {
      console.error(`  ✗ ${label}: ${e.message}`);
    }
  }
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function tryCreateIndex(colId, key, type, attrs, orders) {
  try {
    await db.createIndex(DB_ID, colId, key, type, attrs, orders);
    console.log(`  ✓ índice ${key}`);
  } catch (e) {
    if (e.code === 409) {
      console.log(`  ~ índice ${key} (já existe)`);
    } else {
      console.error(`  ✗ índice ${key}: ${e.message}`);
    }
  }
}

// ─── 1. proposal_config ───────────────────────────────────────────────────────

console.log("\n▶ Criando coleção proposal_config...");
try {
  await db.createCollection(
    DB_ID,
    PROPOSAL_CONFIG_COL_ID,
    "Proposal Config",
    [
      Permission.read(Role.any()),                    // público — página da proposta
      Permission.create(Role.label("admin")),
      Permission.update(Role.label("admin")),
      Permission.delete(Role.label("admin")),
    ],
    false
  );
  console.log("  ✓ Coleção proposal_config criada");
} catch (e) {
  if (e.code === 409) {
    console.log("  ~ Coleção proposal_config já existe");
  } else {
    console.error("  ✗ Erro ao criar coleção:", e.message);
    process.exit(1);
  }
}

await sleep(1500);

console.log("\n▶ Criando atributos da proposal_config...");
const configAttrs = [
  [() => db.createStringAttribute(DB_ID, PROPOSAL_CONFIG_COL_ID, "school_id", 100, true), "school_id"],
  [() => db.createStringAttribute(DB_ID, PROPOSAL_CONFIG_COL_ID, "differentials_json", 10000, false, "[]"), "differentials_json"],
  [() => db.createStringAttribute(DB_ID, PROPOSAL_CONFIG_COL_ID, "gallery_image_ids_json", 2000, false, "[]"), "gallery_image_ids_json"],
  [() => db.createStringAttribute(DB_ID, PROPOSAL_CONFIG_COL_ID, "payment_methods_rich_json", 50000, false), "payment_methods_rich_json"],
  [() => db.createStringAttribute(DB_ID, PROPOSAL_CONFIG_COL_ID, "additional_info_rich_json", 50000, false), "additional_info_rich_json"],
  [() => db.createStringAttribute(DB_ID, PROPOSAL_CONFIG_COL_ID, "school_name", 255, false, ""), "school_name"],
  [() => db.createStringAttribute(DB_ID, PROPOSAL_CONFIG_COL_ID, "logo_url", 1000, false, ""), "logo_url"],
  [() => db.createStringAttribute(DB_ID, PROPOSAL_CONFIG_COL_ID, "primary_color", 20, false, "#10b981"), "primary_color"],
  [() => db.createStringAttribute(DB_ID, PROPOSAL_CONFIG_COL_ID, "accent_color", 20, false, "#38bdf8"), "accent_color"],
  [() => db.createStringAttribute(DB_ID, PROPOSAL_CONFIG_COL_ID, "font_family", 100, false, ""), "font_family"],
];

for (const [fn, label] of configAttrs) {
  await tryCreateAttribute(fn, label);
  await sleep(300);
}

await sleep(2000);
console.log("\n▶ Criando índices da proposal_config...");
await tryCreateIndex(PROPOSAL_CONFIG_COL_ID, "idx_school_id", IndexType.Key, ["school_id"], ["ASC"]);

// ─── 2. crm_proposals ─────────────────────────────────────────────────────────

await sleep(1000);
console.log("\n▶ Criando coleção crm_proposals...");
try {
  await db.createCollection(
    DB_ID,
    CRM_PROPOSALS_COL_ID,
    "CRM Proposals",
    [
      Permission.read(Role.any()),                    // público — página da proposta
      Permission.create(Role.label("admin")),
      Permission.update(Role.label("admin")),
      Permission.delete(Role.label("admin")),
    ],
    false
  );
  console.log("  ✓ Coleção crm_proposals criada");
} catch (e) {
  if (e.code === 409) {
    console.log("  ~ Coleção crm_proposals já existe");
  } else {
    console.error("  ✗ Erro ao criar coleção:", e.message);
    process.exit(1);
  }
}

await sleep(1500);

console.log("\n▶ Criando atributos da crm_proposals...");
const proposalAttrs = [
  [() => db.createStringAttribute(DB_ID, CRM_PROPOSALS_COL_ID, "school_id", 100, true), "school_id"],
  [() => db.createStringAttribute(DB_ID, CRM_PROPOSALS_COL_ID, "lead_id", 36, true), "lead_id"],
  [() => db.createStringAttribute(DB_ID, CRM_PROPOSALS_COL_ID, "lead_name", 255, false, ""), "lead_name"],
  [() => db.createStringAttribute(DB_ID, CRM_PROPOSALS_COL_ID, "lead_email", 255, false, ""), "lead_email"],
  [() => db.createFloatAttribute(DB_ID, CRM_PROPOSALS_COL_ID, "hours", false), "hours"],
  [() => db.createFloatAttribute(DB_ID, CRM_PROPOSALS_COL_ID, "hour_price", false), "hour_price"],
  [() => db.createFloatAttribute(DB_ID, CRM_PROPOSALS_COL_ID, "total_value", false), "total_value"],
  [() => db.createStringAttribute(DB_ID, CRM_PROPOSALS_COL_ID, "products_json", 10000, false, "[]"), "products_json"],
  [() => db.createStringAttribute(DB_ID, CRM_PROPOSALS_COL_ID, "public_token", 64, true), "public_token"],
  [() => db.createStringAttribute(DB_ID, CRM_PROPOSALS_COL_ID, "status", 20, false, "draft"), "status"],
];

for (const [fn, label] of proposalAttrs) {
  await tryCreateAttribute(fn, label);
  await sleep(300);
}

await sleep(2000);
console.log("\n▶ Criando índices da crm_proposals...");
await tryCreateIndex(CRM_PROPOSALS_COL_ID, "idx_lead_id",      IndexType.Key,    ["lead_id"],      ["ASC"]);
await sleep(300);
await tryCreateIndex(CRM_PROPOSALS_COL_ID, "idx_school_id",    IndexType.Key,    ["school_id"],    ["ASC"]);
await sleep(300);
await tryCreateIndex(CRM_PROPOSALS_COL_ID, "idx_public_token", IndexType.Unique, ["public_token"], ["ASC"]);

// ─── 3. .env.local ────────────────────────────────────────────────────────────

const envPath = decodeURIComponent(new URL("../.env.local", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
let envContent = readFileSync(envPath, "utf-8");

let changed = false;

if (!envContent.includes("VITE_APPWRITE_PROPOSAL_CONFIG_COL_ID")) {
  envContent = envContent.trimEnd() + "\nVITE_APPWRITE_PROPOSAL_CONFIG_COL_ID=proposal_config\n";
  changed = true;
  console.log("\n✓ VITE_APPWRITE_PROPOSAL_CONFIG_COL_ID adicionado ao .env.local");
} else {
  console.log("\n~ VITE_APPWRITE_PROPOSAL_CONFIG_COL_ID já existe no .env.local");
}

if (!envContent.includes("VITE_APPWRITE_CRM_PROPOSALS_COL_ID")) {
  envContent = envContent.trimEnd() + "\nVITE_APPWRITE_CRM_PROPOSALS_COL_ID=crm_proposals\n";
  changed = true;
  console.log("✓ VITE_APPWRITE_CRM_PROPOSALS_COL_ID adicionado ao .env.local");
} else {
  console.log("~ VITE_APPWRITE_CRM_PROPOSALS_COL_ID já existe no .env.local");
}

if (changed) {
  writeFileSync(envPath, envContent, "utf-8");
}

console.log("\n✅ Setup Propostas concluído!\n");
