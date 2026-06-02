/**
 * Script: setup-crm.mjs
 * Cria a coleção crm_leads e adiciona approval_status ao profiles.
 * Uso: node scripts/setup-crm.mjs
 */

import { Client, Databases, Permission, Role, DatabasesIndexType as IndexType } from "node-appwrite";

const ENDPOINT   = "https://sfo.cloud.appwrite.io/v1";
const PROJECT_ID = "6a01ac8a0009fbf94f05";
const API_KEY    = "standard_c331b1343cf97b580560d1ea341a2609e4100195659849c17a5dcaab8b73c4d82bb840b4edc0209884a51c958fe3bc275a98230f570a51a9e2debe9a929af6ae069a2fa3268917905550c2bdb4a17fa79de223af4a17d7b0a8ec7a9daf0e4a3dd4d7657d269497813807cd6ae835d3e9ee905d45522c42f38188c41311393f6a";
const DB_ID      = "6a01afae001bc352d1b1";
const PROFILES_COL_ID = "6a01ebb50034d5067723";
const CRM_COL_ID      = "crm_leads";

const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const db = new Databases(client);

// ─── helpers ──────────────────────────────────────────────────────────────────

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

// ─── 1. approval_status na coleção profiles ───────────────────────────────────

console.log("\n▶ Adicionando approval_status ao profiles...");
await tryCreateAttribute(
  () => db.createStringAttribute(DB_ID, PROFILES_COL_ID, "approval_status", 20, false, "pending"),
  "approval_status (string, default=pending)"
);

// ─── 2. Criar coleção crm_leads ───────────────────────────────────────────────

console.log("\n▶ Criando coleção crm_leads...");
try {
  await db.createCollection(
    DB_ID,
    CRM_COL_ID,
    "CRM Leads",
    [
      Permission.read(Role.label("admin")),
      Permission.create(Role.label("admin")),
      Permission.update(Role.label("admin")),
      Permission.delete(Role.label("admin")),
      Permission.read(Role.label("instrutor")),
      // Formulário público de qualificação (visitante ou usuário logado)
      Permission.read(Role.any()),
      Permission.create(Role.any()),
      Permission.update(Role.any()),
    ],
    false // documentSecurity = false (usamos permissões da coleção)
  );
  console.log("  ✓ Coleção crm_leads criada");
} catch (e) {
  if (e.code === 409) {
    console.log("  ~ Coleção crm_leads já existe");
  } else {
    console.error("  ✗ Erro ao criar coleção:", e.message);
    process.exit(1);
  }
}

// Aguardar um pouco antes de criar atributos
await sleep(1500);

// ─── 3. Atributos da coleção crm_leads ────────────────────────────────────────

console.log("\n▶ Criando atributos da crm_leads...");

const attrs = [
  () => db.createStringAttribute(DB_ID, CRM_COL_ID, "user_id",          36,   false),
  () => db.createStringAttribute(DB_ID, CRM_COL_ID, "name",             255,  true),
  () => db.createStringAttribute(DB_ID, CRM_COL_ID, "email",            255,  true),
  () => db.createStringAttribute(DB_ID, CRM_COL_ID, "phone",            50,   false, ""),
  () => db.createStringAttribute(DB_ID, CRM_COL_ID, "crm_status",       50,   true,  "qualificacao"),
  () => db.createStringAttribute(DB_ID, CRM_COL_ID, "desired_course",   255,  false),
  () => db.createFloatAttribute( DB_ID, CRM_COL_ID, "desired_hours",          false),
  () => db.createFloatAttribute( DB_ID, CRM_COL_ID, "weight_kg",              false),
  () => db.createFloatAttribute( DB_ID, CRM_COL_ID, "height_cm",              false),
  () => db.createStringAttribute(DB_ID, CRM_COL_ID, "available_days_json", 512, false, "[]"),
  () => db.createStringAttribute(DB_ID, CRM_COL_ID, "available_period", 20,   false),
  () => db.createStringAttribute(DB_ID, CRM_COL_ID, "start_date",       20,   false),
  () => db.createFloatAttribute( DB_ID, CRM_COL_ID, "weekly_hours",           false),
  () => db.createStringAttribute(DB_ID, CRM_COL_ID, "notes",            2000, false),
  () => db.createStringAttribute(DB_ID, CRM_COL_ID, "qual_token",       64,   false),
  () => db.createStringAttribute(DB_ID, CRM_COL_ID, "qual_filled_at",   64,   false),
];

const labels = [
  "user_id",
  "name",
  "email",
  "phone",
  "crm_status",
  "desired_course",
  "desired_hours",
  "weight_kg",
  "height_cm",
  "available_days_json",
  "available_period",
  "start_date",
  "weekly_hours",
  "notes",
  "qual_token",
  "qual_filled_at",
];

for (let i = 0; i < attrs.length; i++) {
  await tryCreateAttribute(attrs[i], labels[i]);
  await sleep(300); // rate limit
}

// ─── 4. Índices ───────────────────────────────────────────────────────────────

await sleep(2000); // esperar atributos ficarem prontos

console.log("\n▶ Criando índices...");

async function tryCreateIndex(key, type, attrs, orders) {
  try {
    await db.createIndex(DB_ID, CRM_COL_ID, key, type, attrs, orders);
    console.log(`  ✓ índice ${key}`);
  } catch (e) {
    if (e.code === 409) {
      console.log(`  ~ índice ${key} (já existe)`);
    } else {
      console.error(`  ✗ índice ${key}: ${e.message}`);
    }
  }
}

await tryCreateIndex("idx_crm_status",    IndexType.Key, ["crm_status"],  ["ASC"]);
await sleep(300);
await tryCreateIndex("idx_user_id",       IndexType.Key, ["user_id"],     ["ASC"]);
await sleep(300);
await tryCreateIndex("idx_qual_token",    IndexType.Key, ["qual_token"],  ["ASC"]);
await sleep(300);
await tryCreateIndex("idx_email",         IndexType.Key, ["email"],       ["ASC"]);

// ─── 5. .env.local ────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync } from "fs";

const envPath = new URL("../.env.local", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
let envContent = readFileSync(envPath, "utf-8");

if (!envContent.includes("VITE_APPWRITE_CRM_LEADS_COL_ID")) {
  envContent = envContent.trimEnd() + "\nVITE_APPWRITE_CRM_LEADS_COL_ID=crm_leads\n";
  writeFileSync(envPath, envContent, "utf-8");
  console.log("\n✓ VITE_APPWRITE_CRM_LEADS_COL_ID adicionado ao .env.local");
} else {
  console.log("\n~ VITE_APPWRITE_CRM_LEADS_COL_ID já existe no .env.local");
}

console.log("\n✅ Setup CRM concluído!\n");
