/**
 * delete-all-flights.mjs
 *
 * Hard-delete de TODOS os voos da plataforma e todos os registros correlacionados.
 * Ordem:
 *   1. flight_videos
 *   2. flight_telemetry_summaries
 *   3. flight_landings
 *   4. flight_takeoffs
 *   5. flight_signatures
 *   6. flight_telemetry_alerts
 *   7. flight_instructor_payments
 *   8. flight_discrepancies
 *   9. flights  ← por último
 *
 * Uso:
 *   node scripts/delete-all-flights.mjs
 *   node scripts/delete-all-flights.mjs --confirm
 *
 * Sem --confirm o script apenas faz o DRY-RUN (conta documentos, não deleta).
 */

import { Client, Databases, Query } from "node-appwrite";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── Carrega .env.local automaticamente ──────────────────────────────────────
const __dir = dirname(fileURLToPath(import.meta.url));
const envFile = resolve(__dir, "../.env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    // Aceita tanto APPWRITE_* quanto VITE_APPWRITE_*
    process.env[key] = val;
    if (key.startsWith("VITE_")) process.env[key.slice(5)] = val;
  }
}

// ── Env vars ─────────────────────────────────────────────────────────────────
const ENDPOINT   = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY    = process.env.APPWRITE_API_KEY;
const DB_ID      = process.env.APPWRITE_DATABASE_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DB_ID) {
  console.error("❌  Variáveis de ambiente faltando:");
  if (!ENDPOINT)   console.error("   APPWRITE_ENDPOINT (ou VITE_APPWRITE_ENDPOINT)");
  if (!PROJECT_ID) console.error("   APPWRITE_PROJECT_ID (ou VITE_APPWRITE_PROJECT_ID)");
  if (!API_KEY)    console.error("   APPWRITE_API_KEY");
  if (!DB_ID)      console.error("   APPWRITE_DATABASE_ID (ou VITE_APPWRITE_DATABASE_ID)");
  process.exit(1);
}

// ── Collection IDs ────────────────────────────────────────────────────────────
const COLS = {
  flights:               process.env.APPWRITE_COLLECTION_ID                     || "6a01afb1002232d33950",
  flight_videos:         process.env.APPWRITE_VIDEOS_COLLECTION_ID              || "6a0200bf00297bfc2231",
  flight_telemetry_summaries: process.env.APPWRITE_FLIGHT_TELEMETRY_SUMMARIES_COL_ID || "6a0488740032fe62d090",
  flight_landings:       process.env.APPWRITE_FLIGHT_LANDINGS_COL_ID            || "6a04887600079471ce1d",
  flight_takeoffs:       process.env.APPWRITE_FLIGHT_TAKEOFFS_COL_ID            || "6a048877000260a0b24b",
  flight_signatures:     process.env.APPWRITE_FLIGHT_SIGNATURES_COL_ID          || "flight_signatures",
  flight_telemetry_alerts: process.env.APPWRITE_FLIGHT_TELEMETRY_ALERTS_COL_ID  || "flight_telemetry_alerts",
  flight_instructor_payments: process.env.APPWRITE_FLIGHT_INSTRUCTOR_PAYMENTS_COL_ID || "flight_instructor_payments",
  flight_discrepancies:  process.env.APPWRITE_FLIGHT_DISCREPANCIES_COL_ID       || "flight_discrepancies",
};

const DRY_RUN = !process.argv.includes("--confirm");

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

// ── Helpers ───────────────────────────────────────────────────────────────────
async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function listAllIds(colId, label) {
  const ids = [];
  let cursor = null;
  let page = 0;
  while (true) {
    const q = [Query.limit(100), Query.select(["$id"])];
    if (cursor) q.push(Query.cursorAfter(cursor));
    let res;
    try {
      res = await db.listDocuments(DB_ID, colId, q);
    } catch (e) {
      if (e?.code === 404) {
        console.log(`  ⚠️  ${label}: coleção não encontrada (skip)`);
        return [];
      }
      throw e;
    }
    ids.push(...res.documents.map((d) => d.$id));
    process.stdout.write(`\r  ${label}: ${ids.length} encontrados...`);
    if (res.documents.length < 100) break;
    cursor = res.documents.at(-1).$id;
    page++;
    if (page % 5 === 0) await sleep(200); // throttle a cada 500 docs
  }
  process.stdout.write(`\r  ${label}: ${ids.length} encontrados      \n`);
  return ids;
}

async function deleteAll(colId, ids, label) {
  if (ids.length === 0) {
    console.log(`  ✓ ${label}: vazio, nada a deletar`);
    return;
  }
  if (DRY_RUN) {
    console.log(`  [DRY-RUN] ${label}: deletaria ${ids.length} documentos`);
    return;
  }
  let deleted = 0;
  let errors = 0;
  for (const id of ids) {
    try {
      await db.deleteDocument(DB_ID, colId, id);
      deleted++;
    } catch (e) {
      errors++;
      if (errors <= 5) console.warn(`\n  ⚠️  Erro deletando ${label}/${id}: ${e?.message}`);
    }
    if (deleted % 25 === 0 && deleted > 0) {
      process.stdout.write(`\r  ${label}: ${deleted}/${ids.length} deletados...`);
      await sleep(150); // throttle
    }
  }
  process.stdout.write(`\r  ✓ ${label}: ${deleted}/${ids.length} deletados${errors ? `, ${errors} erros` : ""}      \n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=".repeat(60));
  console.log("  DELETE ALL FLIGHTS");
  console.log(`  Endpoint : ${ENDPOINT}`);
  console.log(`  Database : ${DB_ID}`);
  console.log(`  Modo     : ${DRY_RUN ? "🔍 DRY-RUN (sem deletar)" : "💥 EXECUÇÃO REAL"}`);
  console.log("=".repeat(60));

  if (DRY_RUN) {
    console.log("\n⚠️  Rodando em DRY-RUN. Nenhum dado será apagado.");
    console.log("   Para deletar de verdade, adicione --confirm:\n");
    console.log("   node scripts/delete-all-flights.mjs --confirm\n");
  }

  // 1. Conta / coleta IDs de todas as coleções
  console.log("\n📋  Contando documentos em cada coleção...\n");
  const idMap = {};
  // Correlacionadas primeiro, flights por último
  const ORDER = [
    "flight_videos",
    "flight_telemetry_summaries",
    "flight_landings",
    "flight_takeoffs",
    "flight_signatures",
    "flight_telemetry_alerts",
    "flight_instructor_payments",
    "flight_discrepancies",
    "flights",
  ];
  for (const key of ORDER) {
    idMap[key] = await listAllIds(COLS[key], key);
  }

  const total = Object.values(idMap).reduce((s, arr) => s + arr.length, 0);
  console.log(`\n📊  Total de documentos a deletar: ${total}`);
  for (const key of ORDER) {
    if (idMap[key].length > 0) console.log(`     ${key.padEnd(35)} ${idMap[key].length}`);
  }

  if (total === 0) {
    console.log("\n✅  Banco já está limpo. Nada a fazer.");
    return;
  }

  if (DRY_RUN) {
    console.log("\n⛔  DRY-RUN: nenhum dado foi apagado.");
    console.log("    Rode com --confirm para executar.\n");
    return;
  }

  console.log("\n🗑️   Deletando...\n");
  for (const key of ORDER) {
    await deleteAll(COLS[key], idMap[key], key);
  }

  console.log(`\n✅  Concluído! ${total} documentos deletados.`);
}

main().catch((e) => {
  console.error("\n❌  Erro fatal:", e?.message ?? e);
  process.exit(1);
});
