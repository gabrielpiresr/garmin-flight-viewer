/**
 * Adiciona campos de seções e FRC à coleção proposal_config.
 * Uso: node scripts/migrate-proposal-sections.mjs
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
const COL_ID     = "proposal_config";

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

async function tryAdd(fn, label) {
  try { await fn(); console.log(`  ✓ ${label}`); }
  catch (e) {
    if (e.code === 409) console.log(`  ~ ${label} (já existe)`);
    else console.error(`  ✗ ${label}: ${e.message}`);
  }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

console.log("\n▶ Adicionando campos de seções e FRC...");

const attrs = [
  [() => db.createStringAttribute(DB_ID, COL_ID, "sections_json", 20000, false, "[]"), "sections_json"],
  [() => db.createStringAttribute(DB_ID, COL_ID, "frc_title", 255, false, "Flight Review Club"), "frc_title"],
  [() => db.createStringAttribute(DB_ID, COL_ID, "frc_description", 3000, false, ""), "frc_description"],
  [() => db.createStringAttribute(DB_ID, COL_ID, "frc_benefits_json", 5000, false, "[]"), "frc_benefits_json"],
];

for (const [fn, label] of attrs) {
  await tryAdd(fn, label);
  await sleep(350);
}

console.log("\n✅ Migração concluída!\n");
