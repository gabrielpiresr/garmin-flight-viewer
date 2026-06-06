/**
 * Script: setup-crm-fix.mjs
 * Corrige crm_status (required sem default) e cria índice + .env.local
 */

import { Client, Databases, DatabasesIndexType as IndexType } from "node-appwrite";
import { readFileSync, writeFileSync } from "fs";

const envPath = decodeURIComponent(new URL("../.env.local", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const localEnv = Object.fromEntries(readFileSync(envPath, "utf-8").split(/\r?\n/).flatMap((line) => {
  const index = line.indexOf("=");
  if (index <= 0 || line.trim().startsWith("#")) return [];
  return [[line.slice(0, index).trim(), line.slice(index + 1).trim()]];
}));
const ENDPOINT = process.env.APPWRITE_ENDPOINT || localEnv.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || localEnv.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY || localEnv.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || localEnv.VITE_APPWRITE_DATABASE_ID;
if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DB_ID) {
  throw new Error("Defina APPWRITE_API_KEY e as configurações Appwrite.");
}
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
