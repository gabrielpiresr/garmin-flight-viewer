/**
 * cleanup-flights-keep-with-media.mjs
 *
 * Remove da plataforma todos os voos que NÃO possuem vídeo NEM telemetria,
 * e limpa todas as escalas geradas (op_weeks, op_slots, weekly_plans, etc.).
 *
 * Voos preservados = aqueles com telemetry_present=true OU com registro em flight_videos.
 * Docs correlacionados ao voo deletado também são removidos.
 *
 * Uso:
 *   node scripts/cleanup-flights-keep-with-media.mjs           ← DRY-RUN
 *   node scripts/cleanup-flights-keep-with-media.mjs --confirm ← EXECUÇÃO REAL
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
  flights:                         process.env.APPWRITE_COLLECTION_ID                            || "6a01afb1002232d33950",
  flight_videos:                   process.env.APPWRITE_VIDEOS_COLLECTION_ID                     || "6a0200bf00297bfc2231",
  flight_telemetry_summaries:      process.env.APPWRITE_FLIGHT_TELEMETRY_SUMMARIES_COL_ID        || "6a0488740032fe62d090",
  flight_landings:                 process.env.APPWRITE_FLIGHT_LANDINGS_COL_ID                   || "6a04887600079471ce1d",
  flight_takeoffs:                 process.env.APPWRITE_FLIGHT_TAKEOFFS_COL_ID                   || "6a048877000260a0b24b",
  flight_signatures:               process.env.APPWRITE_FLIGHT_SIGNATURES_COL_ID                 || "flight_signatures",
  flight_telemetry_alerts:         process.env.APPWRITE_FLIGHT_TELEMETRY_ALERTS_COL_ID           || "flight_telemetry_alerts",
  flight_instructor_payments:      process.env.APPWRITE_FLIGHT_INSTRUCTOR_PAYMENTS_COL_ID        || "flight_instructor_payments",
  flight_discrepancies:            process.env.APPWRITE_FLIGHT_DISCREPANCIES_COL_ID              || "flight_discrepancies",
  flight_maneuver_reviews:         process.env.APPWRITE_FLIGHT_MANEUVER_REVIEWS_COL_ID           || "6a1464f40014e9bd5f5b",
  flight_maneuvers:                process.env.APPWRITE_FLIGHT_MANEUVERS_COL_ID                  || "6a1464e300079d599e22",
  // Escalas / planejamento
  weekly_plan_avail:               process.env.APPWRITE_WEEKLY_PLAN_AVAIL_COL_ID                 || "6a023d930024cacc5bf7",
  weekly_plan_items:               process.env.APPWRITE_WEEKLY_PLAN_ITEMS_COL_ID                 || "6a023d880031718b22c0",
  weekly_plans:                    process.env.APPWRITE_WEEKLY_PLANS_COL_ID                      || "6a023d7d00137ede2f5b",
  op_slots:                        process.env.APPWRITE_OP_SLOTS_COL_ID                          || "6a0220b9000fef1c3c16",
  group_cap_days:                  process.env.APPWRITE_GROUP_CAP_DAYS_COL_ID                    || "6a0220b40029acc2d073",
  group_caps:                      process.env.APPWRITE_GROUP_CAPS_COL_ID                        || "6a0220af0029b9ea3c55",
  daily_caps:                      process.env.APPWRITE_DAILY_CAPS_COL_ID                        || "6a02206c001d1e2223cb",
  op_weeks:                        process.env.APPWRITE_OP_WEEKS_COL_ID                          || "6a0220640035de7cc116",
};

const DRY_RUN = !process.argv.includes("--confirm");

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

// ── Helpers ───────────────────────────────────────────────────────────────────
async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function listAllDocs(colId, label, selectFields = ["$id"]) {
  const docs = [];
  let cursor = null;
  let page = 0;
  while (true) {
    const q = [Query.limit(100), Query.select(selectFields)];
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
    docs.push(...res.documents);
    process.stdout.write(`\r  ${label}: ${docs.length} encontrados...`);
    if (res.documents.length < 100) break;
    cursor = res.documents.at(-1).$id;
    page++;
    if (page % 5 === 0) await sleep(200);
  }
  process.stdout.write(`\r  ${label}: ${docs.length} encontrados      \n`);
  return docs;
}

async function deleteIds(colId, ids, label) {
  if (ids.length === 0) {
    console.log(`  ✓ ${label}: nada a deletar`);
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
      await sleep(150);
    }
  }
  process.stdout.write(`\r  ✓ ${label}: ${deleted}/${ids.length} deletados${errors ? `, ${errors} erros` : ""}      \n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=".repeat(65));
  console.log("  CLEANUP: manter voos com vídeo ou telemetria + limpar escalas");
  console.log(`  Endpoint : ${ENDPOINT}`);
  console.log(`  Database : ${DB_ID}`);
  console.log(`  Modo     : ${DRY_RUN ? "🔍 DRY-RUN (sem deletar)" : "💥 EXECUÇÃO REAL"}`);
  console.log("=".repeat(65));

  if (DRY_RUN) {
    console.log("\n⚠️  Rodando em DRY-RUN. Nenhum dado será apagado.");
    console.log("   Para deletar de verdade, adicione --confirm:\n");
    console.log("   node scripts/cleanup-flights-keep-with-media.mjs --confirm\n");
  }

  // ── 1. Identificar voos protegidos (têm vídeo ou telemetria) ─────────────
  console.log("\n📋  Identificando voos com vídeo ou telemetria...\n");

  // 1a. Voos com telemetria = true no próprio documento
  const flightDocs = await listAllDocs(
    COLS.flights,
    "flights",
    ["$id", "telemetry_present"],
  );

  const flightsWithTelemetry = new Set(
    flightDocs.filter((d) => d.telemetry_present === true).map((d) => d.$id),
  );
  console.log(`  → ${flightsWithTelemetry.size} voos com telemetria_present=true`);

  // 1b. Voos referenciados em flight_videos
  const videoDocs = await listAllDocs(COLS.flight_videos, "flight_videos", ["$id", "flight_id"]);
  const flightsWithVideo = new Set(videoDocs.map((d) => d.flight_id).filter(Boolean));
  console.log(`  → ${flightsWithVideo.size} voos distintos com vídeo`);

  // 1c. União
  const keepFlightIds = new Set([...flightsWithTelemetry, ...flightsWithVideo]);
  console.log(`  → ${keepFlightIds.size} voos PRESERVADOS no total\n`);

  // ── 2. Calcular quais voos serão deletados ────────────────────────────────
  const allFlightIds = flightDocs.map((d) => d.$id);
  const deleteFlightIds = allFlightIds.filter((id) => !keepFlightIds.has(id));

  console.log(`  Total de voos: ${allFlightIds.length}`);
  console.log(`  Voos a DELETAR: ${deleteFlightIds.length}`);
  console.log(`  Voos a MANTER : ${keepFlightIds.size}\n`);

  // ── 3. Coleções correlacionadas — filtra pelo flight_id ───────────────────
  const CHILD_COLS = [
    { key: "flight_maneuver_reviews", field: "flight_id" },
    { key: "flight_maneuvers",        field: "flight_id" },
    { key: "flight_telemetry_summaries", field: "flight_id" },
    { key: "flight_landings",         field: "flight_id" },
    { key: "flight_takeoffs",         field: "flight_id" },
    { key: "flight_signatures",       field: "flight_id" },
    { key: "flight_telemetry_alerts", field: "flight_id" },
    { key: "flight_instructor_payments", field: "flight_id" },
    { key: "flight_discrepancies",    field: "flight_id" },
  ];

  // flight_videos: os sem flight_id em keepFlightIds
  const deleteVideoIds = videoDocs
    .filter((d) => !keepFlightIds.has(d.flight_id))
    .map((d) => d.$id);

  const deleteChildIds = {};
  for (const { key, field } of CHILD_COLS) {
    const docs = await listAllDocs(COLS[key], key, ["$id", field]);
    deleteChildIds[key] = docs
      .filter((d) => d[field] && !keepFlightIds.has(d[field]))
      .map((d) => d.$id);
  }

  // ── 4. Escalas (deletar tudo) ─────────────────────────────────────────────
  console.log("\n📋  Contando escalas geradas...\n");
  const SCALE_COLS = [
    "weekly_plan_avail",
    "weekly_plan_items",
    "weekly_plans",
    "op_slots",
    "group_cap_days",
    "group_caps",
    "daily_caps",
    "op_weeks",
  ];
  const scaleIds = {};
  for (const key of SCALE_COLS) {
    const docs = await listAllDocs(COLS[key], key, ["$id"]);
    scaleIds[key] = docs.map((d) => d.$id);
  }

  // ── 5. Resumo ──────────────────────────────────────────────────────────────
  console.log("\n📊  Resumo do que será deletado:\n");
  console.log(`  ${"flight_videos".padEnd(35)} ${deleteVideoIds.length} (vinculados a voos sem mídia)`);
  for (const { key } of CHILD_COLS) {
    const n = deleteChildIds[key].length;
    if (n > 0) console.log(`  ${key.padEnd(35)} ${n}`);
  }
  console.log(`  ${"flights (sem vídeo/telemetria)".padEnd(35)} ${deleteFlightIds.length}`);
  console.log("  ---");
  for (const key of SCALE_COLS) {
    const n = scaleIds[key].length;
    if (n > 0) console.log(`  ${key.padEnd(35)} ${n}`);
  }

  if (DRY_RUN) {
    console.log("\n⛔  DRY-RUN: nenhum dado foi apagado.");
    console.log("    Rode com --confirm para executar.\n");
    return;
  }

  // ── 6. Executar deleções ───────────────────────────────────────────────────
  console.log("\n🗑️   Deletando docs correlacionados a voos sem mídia...\n");
  await deleteIds(COLS.flight_videos, deleteVideoIds, "flight_videos");
  for (const { key } of CHILD_COLS) {
    await deleteIds(COLS[key], deleteChildIds[key], key);
  }
  console.log("\n🗑️   Deletando voos sem vídeo/telemetria...\n");
  await deleteIds(COLS.flights, deleteFlightIds, "flights");

  console.log("\n🗑️   Limpando escalas geradas...\n");
  for (const key of SCALE_COLS) {
    await deleteIds(COLS[key], scaleIds[key], key);
  }

  const total =
    deleteVideoIds.length +
    Object.values(deleteChildIds).reduce((s, arr) => s + arr.length, 0) +
    deleteFlightIds.length +
    Object.values(scaleIds).reduce((s, arr) => s + arr.length, 0);

  console.log(`\n✅  Concluído! ${total} documentos deletados.`);
  console.log(`    Voos preservados: ${keepFlightIds.size} (com vídeo ou telemetria)\n`);
}

main().catch((e) => {
  console.error("\n❌  Erro fatal:", e?.message ?? e);
  process.exit(1);
});
