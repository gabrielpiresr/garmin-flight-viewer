/**
 * fix-flight-student-permissions.mjs
 *
 * Adds read("label:aluno") (and read("label:instrutor")) to all flight documents
 * that have a student_user_id / instructor_user_id but are missing those label
 * read permissions.  Also patches the associated CSV storage file when present.
 *
 * Root cause: the client SDK strips Permission.read(Role.user(otherUserId)) for
 * any user that is not the current session owner, so flights created by an
 * instructor/admin for a student were never readable by that student.
 * label:aluno / label:instrutor are role-labels and ARE settable from the client.
 *
 * Usage:
 *   node scripts/fix-flight-student-permissions.mjs            # dry-run
 *   node scripts/fix-flight-student-permissions.mjs --confirm  # execute
 */

import { Client, Databases, Storage, Query } from "node-appwrite";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── Load .env.local ──────────────────────────────────────────────────────────
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
const COL_ID     = process.env.APPWRITE_COLLECTION_ID    || "6a01afb1002232d33950";
const BUCKET_ID  = process.env.APPWRITE_BUCKET_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DB_ID) {
  console.error("❌  Variáveis de ambiente faltando.");
  if (!ENDPOINT)   console.error("   APPWRITE_ENDPOINT");
  if (!PROJECT_ID) console.error("   APPWRITE_PROJECT_ID");
  if (!API_KEY)    console.error("   APPWRITE_API_KEY");
  if (!DB_ID)      console.error("   APPWRITE_DATABASE_ID");
  process.exit(1);
}

const DRY_RUN = !process.argv.includes("--confirm");

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db      = new Databases(client);
const storage = new Storage(client);

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Fetch all flights (paginated) ─────────────────────────────────────────────
async function fetchAllFlights() {
  const flights = [];
  let cursor = null;
  while (true) {
    const q = [
      Query.limit(100),
      Query.select(["$id", "$permissions", "student_user_id", "instructor_user_id", "csv_file_id"]),
    ];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await db.listDocuments(DB_ID, COL_ID, q);
    flights.push(...res.documents);
    process.stdout.write(`\r  Carregando: ${flights.length} voos...`);
    if (res.documents.length < 100) break;
    cursor = res.documents.at(-1).$id;
    await sleep(100);
  }
  process.stdout.write(`\r  Total: ${flights.length} voos         \n`);
  return flights;
}

// ── Check which flights need fixing ──────────────────────────────────────────
function flightNeedsFix(flight) {
  const perms = flight.$permissions ?? [];
  const hasStudent    = Boolean(flight.student_user_id);
  const hasInstructor = Boolean(flight.instructor_user_id);
  const missingAluno  = hasStudent    && !perms.includes('read("label:aluno")');
  const missingInstr  = hasInstructor && !perms.includes('read("label:instrutor")');
  return missingAluno || missingInstr;
}

function buildNewPermissions(flight) {
  const current = new Set(flight.$permissions ?? []);
  if (flight.student_user_id) {
    current.add(`read("user:${flight.student_user_id}")`);
    current.add('read("label:aluno")');
  }
  if (flight.instructor_user_id) {
    current.add(`read("user:${flight.instructor_user_id}")`);
    current.add('read("label:instrutor")');
    current.add('update("label:instrutor")');
  }
  return Array.from(current);
}

// ── Fix storage file permissions ──────────────────────────────────────────────
async function fixStorageFile(csvFileId, newPerms) {
  if (!BUCKET_ID) return;
  try {
    await storage.updateFile(BUCKET_ID, csvFileId, undefined, newPerms);
  } catch (e) {
    console.warn(`\n  ⚠️  Erro ao atualizar storage ${csvFileId}: ${e?.message}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=".repeat(60));
  console.log("  FIX FLIGHT STUDENT PERMISSIONS");
  console.log(`  Endpoint : ${ENDPOINT}`);
  console.log(`  Database : ${DB_ID}`);
  console.log(`  Mode     : ${DRY_RUN ? "🔍 DRY-RUN" : "💥 EXECUTANDO"}`);
  console.log("=".repeat(60));

  if (DRY_RUN) {
    console.log("\n⚠️  Modo DRY-RUN. Nada será alterado.");
    console.log("   Adicione --confirm para executar.\n");
  }

  console.log("\n📋  Buscando voos...\n");
  const all = await fetchAllFlights();

  const needsFix = all.filter(flightNeedsFix);
  console.log(`\n📊  ${needsFix.length} de ${all.length} voos precisam de correção\n`);

  if (needsFix.length === 0) {
    console.log("✅  Todas as permissões já estão corretas.");
    return;
  }

  // Preview in dry-run
  if (DRY_RUN) {
    const preview = needsFix.slice(0, 15);
    for (const f of preview) {
      console.log(`  ${f.$id}`);
      console.log(`    aluno:      ${f.student_user_id ?? "(none)"}`);
      console.log(`    instrutor:  ${f.instructor_user_id ?? "(none)"}`);
      console.log(`    perms:      ${JSON.stringify(f.$permissions)}`);
      console.log(`    → fixadas:  ${JSON.stringify(buildNewPermissions(f))}`);
      console.log();
    }
    if (needsFix.length > 15) console.log(`  ... e mais ${needsFix.length - 15} voos\n`);
    console.log("⛔  DRY-RUN concluído. Rode com --confirm para aplicar.\n");
    return;
  }

  // Execute fixes
  console.log("🔧  Corrigindo permissões...\n");
  let fixed = 0;
  let errors = 0;

  for (const flight of needsFix) {
    try {
      const newPerms = buildNewPermissions(flight);

      // Update document permissions (empty data payload)
      await db.updateDocument(DB_ID, COL_ID, flight.$id, {}, newPerms);

      // Also update the storage CSV file if present
      if (flight.csv_file_id) {
        await fixStorageFile(flight.csv_file_id, newPerms);
      }

      fixed++;
      if (fixed % 5 === 0) {
        process.stdout.write(`\r  Corrigidos: ${fixed}/${needsFix.length}...`);
        await sleep(100);
      }
    } catch (e) {
      errors++;
      if (errors <= 5) console.warn(`\n  ⚠️  Erro em ${flight.$id}: ${e?.message}`);
    }
  }

  process.stdout.write(`\r  ✓ ${fixed}/${needsFix.length} corrigidos${errors ? `, ${errors} erros` : ""}      \n`);
  console.log(`\n✅  Concluído.`);
}

main().catch((e) => {
  console.error("\n❌  Erro fatal:", e?.message ?? e);
  process.exit(1);
});
