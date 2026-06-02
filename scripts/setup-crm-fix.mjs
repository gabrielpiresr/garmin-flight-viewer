/**
 * Script: setup-crm-fix.mjs
 * Corrige crm_status (required sem default) e cria índice + .env.local
 */

import { Client, Databases, DatabasesIndexType as IndexType } from "node-appwrite";
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ENDPOINT   = "https://sfo.cloud.appwrite.io/v1";
const PROJECT_ID = "6a01ac8a0009fbf94f05";
const API_KEY    = "standard_c331b1343cf97b580560d1ea341a2609e4100195659849c17a5dcaab8b73c4d82bb840b4edc0209884a51c958fe3bc275a98230f570a51a9e2debe9a929af6ae069a2fa3268917905550c2bdb4a17fa79de223af4a17d7b0a8ec7a9daf0e4a3dd4d7657d269497813807cd6ae835d3e9ee905d45522c42f38188c41311393f6a";
const DB_ID      = "6a01afae001bc352d1b1";
const CRM_COL_ID = "crm_leads";

const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const db = new Databases(client);

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 1. crm_status — required=false, default="qualificacao"
console.log("\n▶ Criando atributo crm_status (não-required, com default)...");
try {
  await db.createStringAttribute(DB_ID, CRM_COL_ID, "crm_status", 50, false, "qualificacao");
  console.log("  ✓ crm_status criado");
} catch (e) {
  if (e.code === 409) {
    console.log("  ~ crm_status já existe");
  } else {
    console.error("  ✗ crm_status:", e.message);
  }
}

// 2. Aguardar atributos ficarem disponíveis e criar índice
console.log("\n▶ Aguardando atributo ficar disponível (5s)...");
await sleep(5000);

console.log("▶ Criando índice idx_crm_status...");
try {
  await db.createIndex(DB_ID, CRM_COL_ID, "idx_crm_status", IndexType.Key, ["crm_status"], ["ASC"]);
  console.log("  ✓ idx_crm_status criado");
} catch (e) {
  if (e.code === 409) {
    console.log("  ~ idx_crm_status já existe");
  } else {
    console.error("  ✗ idx_crm_status:", e.message);
  }
}

// 3. .env.local — usando path correto
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env.local");

console.log("\n▶ Atualizando .env.local...");
try {
  let envContent = readFileSync(envPath, "utf-8");
  if (!envContent.includes("VITE_APPWRITE_CRM_LEADS_COL_ID")) {
    envContent = envContent.trimEnd() + "\nVITE_APPWRITE_CRM_LEADS_COL_ID=crm_leads\n";
    writeFileSync(envPath, envContent, "utf-8");
    console.log("  ✓ VITE_APPWRITE_CRM_LEADS_COL_ID adicionado");
  } else {
    console.log("  ~ já existe");
  }
} catch (e) {
  console.error("  ✗ Erro ao ler .env.local:", e.message);
}

console.log("\n✅ Fix CRM concluído!\n");
