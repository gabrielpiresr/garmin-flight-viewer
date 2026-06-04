/**
 * Adiciona campos de seções e FRC à coleção proposal_config.
 * Uso: node scripts/migrate-proposal-sections.mjs
 */
import { Client, Databases, DatabasesIndexType as IndexType } from "node-appwrite";
import { readFileSync, writeFileSync } from "fs";

const ENDPOINT   = "https://sfo.cloud.appwrite.io/v1";
const PROJECT_ID = "6a01ac8a0009fbf94f05";
const API_KEY    = "standard_c331b1343cf97b580560d1ea341a2609e4100195659849c17a5dcaab8b73c4d82bb840b4edc0209884a51c958fe3bc275a98230f570a51a9e2debe9a929af6ae069a2fa3268917905550c2bdb4a17fa79de223af4a17d7b0a8ec7a9daf0e4a3dd4d7657d269497813807cd6ae835d3e9ee905d45522c42f38188c41311393f6a";
const DB_ID      = "6a01afae001bc352d1b1";
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
