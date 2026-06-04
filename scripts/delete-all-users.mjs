/**
 * delete-all-users.mjs
 *
 * Deleta TODOS os usuários do Appwrite Auth + seus documentos correlacionados,
 * mantendo apenas o usuário admin definido em VITE_ADMIN_USER_ID.
 *
 * Coleções limpas (somente docs dos usuários removidos):
 *   - profiles
 *   - instructor_students
 *   - instructor_prefs
 *   - tenant_roles
 *
 * Uso:
 *   node scripts/delete-all-users.mjs            → DRY-RUN
 *   node scripts/delete-all-users.mjs --confirm  → Execução real
 */

import { Client, Users, Databases, Query } from "node-appwrite";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── Carrega .env.local ────────────────────────────────────────────────────────
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

// ── Config ────────────────────────────────────────────────────────────────────
const ENDPOINT   = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY    = process.env.APPWRITE_API_KEY;
const DB_ID      = process.env.APPWRITE_DATABASE_ID;
const ADMIN_ID   = process.env.ADMIN_USER_ID; // usuário preservado

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DB_ID || !ADMIN_ID) {
  console.error("❌  Variáveis faltando:");
  if (!ENDPOINT)   console.error("   APPWRITE_ENDPOINT");
  if (!PROJECT_ID) console.error("   APPWRITE_PROJECT_ID");
  if (!API_KEY)    console.error("   APPWRITE_API_KEY");
  if (!DB_ID)      console.error("   APPWRITE_DATABASE_ID");
  if (!ADMIN_ID)   console.error("   VITE_ADMIN_USER_ID");
  process.exit(1);
}

const DRY_RUN = !process.argv.includes("--confirm");

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const usersApi = new Users(client);
const db       = new Databases(client);

// ── Coleções de perfil correlacionadas ────────────────────────────────────────
const PROFILE_COLS = {
  profiles:            process.env.APPWRITE_PROFILES_COLLECTION_ID               || "6a01ebb50034d5067723",
  instructor_students: process.env.APPWRITE_INSTRUCTOR_STUDENTS_COLLECTION_ID    || "6a01ebb60022ea7e329b",
  instructor_prefs:    process.env.APPWRITE_INSTRUCTOR_PREFS_COL_ID              || "6a035e790029550365f7",
  tenant_roles:        process.env.APPWRITE_TENANT_ROLES_COL_ID                  || "6a106ec200312c19cc06",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function listAllUsers() {
  const result = [];
  let cursor = null;
  while (true) {
    const q = [Query.limit(100)];
    if (cursor) q.push(Query.cursorAfter(cursor));
    const res = await usersApi.list(q);
    result.push(...res.users);
    process.stdout.write(`\r  Auth users: ${result.length} encontrados...`);
    if (res.users.length < 100) break;
    cursor = res.users.at(-1).$id;
    await sleep(100);
  }
  process.stdout.write(`\r  Auth users: ${result.length} encontrados      \n`);
  return result;
}

async function deleteUserFromCol(colId, colName, userId) {
  // Tenta encontrar documento com campo userId ou $id igual ao userId
  try {
    const res = await db.listDocuments(DB_ID, colId, [
      Query.equal("userId", userId),
      Query.limit(10),
    ]);
    for (const doc of res.documents) {
      if (!DRY_RUN) await db.deleteDocument(DB_ID, colId, doc.$id);
      else process.stdout.write(`  [DRY-RUN] ${colName}: deletaria doc ${doc.$id}\n`);
    }
    return res.documents.length;
  } catch {
    // Coleção pode não ter campo userId — tenta pelo $id do documento igual ao userId
    try {
      await db.getDocument(DB_ID, colId, userId);
      if (!DRY_RUN) await db.deleteDocument(DB_ID, colId, userId);
      else process.stdout.write(`  [DRY-RUN] ${colName}: deletaria doc ${userId}\n`);
      return 1;
    } catch {
      return 0;
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=".repeat(60));
  console.log("  DELETE ALL USERS (exceto admin)");
  console.log(`  Endpoint  : ${ENDPOINT}`);
  console.log(`  Admin ID  : ${ADMIN_ID}  ← preservado`);
  console.log(`  Modo      : ${DRY_RUN ? "🔍 DRY-RUN (sem deletar)" : "💥 EXECUÇÃO REAL"}`);
  console.log("=".repeat(60));

  if (DRY_RUN) {
    console.log("\n⚠️  DRY-RUN ativo. Adicione --confirm para executar.\n");
  }

  // 1. Lista todos os usuários
  console.log("\n📋  Listando usuários...\n");
  const allUsers = await listAllUsers();
  const toDelete = allUsers.filter((u) => u.$id !== ADMIN_ID);

  console.log(`\n  Total de usuários   : ${allUsers.length}`);
  console.log(`  Admin (preservado)  : 1`);
  console.log(`  A deletar           : ${toDelete.length}\n`);

  if (toDelete.length === 0) {
    console.log("✅  Nenhum usuário a deletar.");
    return;
  }

  if (DRY_RUN) {
    console.log("Usuários que seriam deletados:");
    for (const u of toDelete) {
      console.log(`  ${u.$id}  ${u.email || "(sem email)"}`);
    }
    console.log("\n⛔  DRY-RUN: nenhum dado foi apagado.");
    console.log("    Rode com --confirm para executar.\n");
    return;
  }

  // 2. Deleta perfis correlacionados e depois o usuário Auth
  console.log("🗑️   Deletando usuários e perfis...\n");
  let deletedUsers = 0;
  let errors = 0;

  for (const u of toDelete) {
    const uid = u.$id;

    // Remove documentos de perfil em cada coleção
    for (const [colName, colId] of Object.entries(PROFILE_COLS)) {
      await deleteUserFromCol(colId, colName, uid);
    }

    // Remove o usuário do Auth
    try {
      await usersApi.delete(uid);
      deletedUsers++;
    } catch (e) {
      errors++;
      console.warn(`  ⚠️  Erro deletando Auth user ${uid}: ${e?.message}`);
    }

    if (deletedUsers % 10 === 0 && deletedUsers > 0) {
      process.stdout.write(`\r  Usuários deletados: ${deletedUsers}/${toDelete.length}...`);
      await sleep(200);
    }
  }

  process.stdout.write(`\r  ✓ Usuários deletados: ${deletedUsers}/${toDelete.length}${errors ? `, ${errors} erros` : ""}      \n`);

  // 3. Limpeza total das coleções de perfil (remove órfãos de rodadas anteriores)
  console.log("\n🧹  Limpando perfis órfãos...\n");
  for (const [colName, colId] of Object.entries(PROFILE_COLS)) {
    // Coleta todos os IDs primeiro para não invalidar o cursor ao deletar
    const ids = [];
    let cursor = null;
    while (true) {
      const q = [Query.limit(100), Query.select(["$id"])];
      if (cursor) q.push(Query.cursorAfter(cursor));
      let res;
      try { res = await db.listDocuments(DB_ID, colId, q); }
      catch (e) { if (e?.code === 404) break; throw e; }
      for (const doc of res.documents) {
        if (doc.$id !== ADMIN_ID) ids.push(doc.$id);
      }
      if (res.documents.length < 100) break;
      cursor = res.documents.at(-1).$id;
    }
    let wiped = 0;
    for (const id of ids) {
      try { await db.deleteDocument(DB_ID, colId, id); wiped++; }
      catch { /* ignora */ }
    }
    if (wiped > 0) console.log(`  ✓ ${colName}: ${wiped} órfãos removidos`);
    else console.log(`  ✓ ${colName}: limpo`);
  }

  console.log(`\n✅  Concluído! ${deletedUsers} usuários deletados.`);
  if (ADMIN_ID) console.log(`   Admin ${ADMIN_ID} preservado.`);
}

main().catch((e) => {
  console.error("\n❌  Erro fatal:", e?.message ?? e);
  process.exit(1);
});
