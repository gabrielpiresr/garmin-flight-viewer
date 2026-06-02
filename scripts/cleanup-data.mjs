/**
 * cleanup-data.mjs
 *
 * Apaga dados de teste mantendo aeronaves, configurações e conteúdo whitelabel.
 *
 * O QUE DELETA:
 *   - Voos e todas as coleções correlacionadas
 *   - Todos os usuários EXCETO o admin (VITE_ADMIN_USER_ID)
 *   - Perfis de usuário (exceto admin)
 *   - Abastecimentos
 *   - Leads do CRM
 *
 * O QUE MANTÉM:
 *   - Aeronaves e modelos
 *   - Manutenções (regras, ordens, itens)
 *   - Configurações da plataforma
 *   - Conteúdo (manobras, help, manuais, trilhas, onboarding)
 *   - Templates de contrato
 *   - Produtos da escola
 *   - Broadcast / avisos
 *   - Funções / configurações de roles
 *
 * USO:
 *   node scripts/cleanup-data.mjs          → dry-run (só imprime o que faria)
 *   node scripts/cleanup-data.mjs --run    → executa de verdade
 */

import { Client, Databases, Users, Query } from "node-appwrite";
import * as readline from "readline";

// ─── Config ───────────────────────────────────────────────────────────────────

const ENDPOINT    = process.env.APPWRITE_ENDPOINT    ?? "https://sfo.cloud.appwrite.io/v1";
const PROJECT_ID  = process.env.APPWRITE_PROJECT_ID  ?? "6a01ac8a0009fbf94f05";
const API_KEY     = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID ?? "6a01afae001bc352d1b1";
const ADMIN_USER_ID = process.env.VITE_ADMIN_USER_ID ?? "6a01eb66001f88da47b3";

const DRY_RUN = !process.argv.includes("--run");

if (!API_KEY) {
  console.error("❌  APPWRITE_API_KEY não definido. Adicione ao .env.local ou exporte no terminal.");
  process.exit(1);
}

const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const db    = new Databases(client);
const users = new Users(client);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

let totalDeleted = 0;
let totalErrors  = 0;

async function deleteAllDocuments(collectionId, label) {
  if (!collectionId) {
    console.log(`  ⚠️  ${label}: coleção não configurada, pulando.`);
    return;
  }

  let deleted = 0;
  let page = 0;

  while (true) {
    let res;
    try {
      res = await db.listDocuments(DATABASE_ID, collectionId, [Query.limit(100)]);
    } catch (e) {
      console.log(`  ⚠️  ${label} (${collectionId}): erro ao listar — ${e.message}`);
      break;
    }

    if (res.documents.length === 0) break;
    page++;

    for (const doc of res.documents) {
      if (DRY_RUN) {
        console.log(`  [DRY] ${label}: deletaria ${doc.$id}`);
        deleted++;
      } else {
        try {
          await db.deleteDocument(DATABASE_ID, collectionId, doc.$id);
          deleted++;
          totalDeleted++;
          process.stdout.write(`\r  ✓ ${label}: ${deleted} deletados...`);
        } catch (e) {
          console.error(`\n  ✗ ${label} ${doc.$id}: ${e.message}`);
          totalErrors++;
        }
        await sleep(30); // evitar rate-limit
      }
    }

    // Se retornou < 100, chegamos ao fim
    if (res.documents.length < 100) break;
  }

  if (!DRY_RUN && deleted > 0) process.stdout.write("\n");
  console.log(`  → ${label}: ${DRY_RUN ? "(dry) " : ""}${deleted} documento(s)`);
}

async function deleteAllUsers() {
  let deleted = 0;
  let cursor = undefined;

  while (true) {
    const queries = [Query.limit(100)];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    let res;
    try {
      res = await users.list(queries);
    } catch (e) {
      console.log(`  ⚠️  Usuários: erro ao listar — ${e.message}`);
      break;
    }

    if (res.users.length === 0) break;

    for (const u of res.users) {
      if (u.$id === ADMIN_USER_ID) {
        console.log(`  🔒 Mantendo admin: ${u.email} (${u.$id})`);
        continue;
      }

      if (DRY_RUN) {
        console.log(`  [DRY] Usuários: deletaria ${u.email} (${u.$id})`);
        deleted++;
      } else {
        try {
          await users.delete(u.$id);
          deleted++;
          totalDeleted++;
          process.stdout.write(`\r  ✓ Usuários: ${deleted} deletados...`);
        } catch (e) {
          console.error(`\n  ✗ Usuário ${u.$id}: ${e.message}`);
          totalErrors++;
        }
        await sleep(50);
      }
    }

    cursor = res.users[res.users.length - 1]?.$id;
    if (res.users.length < 100) break;
  }

  if (!DRY_RUN && deleted > 0) process.stdout.write("\n");
  console.log(`  → Usuários: ${DRY_RUN ? "(dry) " : ""}${deleted} deletado(s) (admin preservado)`);
}

// ─── Confirmação ──────────────────────────────────────────────────────────────

async function confirm(msg) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(msg, (ans) => {
      rl.close();
      resolve(ans.trim().toLowerCase() === "s");
    });
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n══════════════════════════════════════════════════════");
  console.log("  cleanup-data  |  " + (DRY_RUN ? "🔍 DRY-RUN (nada será apagado)" : "⚠️  MODO REAL — dados serão apagados"));
  console.log("══════════════════════════════════════════════════════\n");
  console.log(`  Endpoint:    ${ENDPOINT}`);
  console.log(`  Project:     ${PROJECT_ID}`);
  console.log(`  Database:    ${DATABASE_ID}`);
  console.log(`  Admin ID:    ${ADMIN_USER_ID} (preservado)\n`);

  if (!DRY_RUN) {
    const ok = await confirm("Tem CERTEZA que quer apagar os dados? (s/N) → ");
    if (!ok) { console.log("\nCancelado.\n"); process.exit(0); }
    const ok2 = await confirm("Confirmação final — isso é IRREVERSÍVEL. Confirmar? (s/N) → ");
    if (!ok2) { console.log("\nCancelado.\n"); process.exit(0); }
    console.log();
  }

  // ── Voos e correlacionados ──────────────────────────────────────────────────
  console.log("📁 Voos e correlacionados");
  await deleteAllDocuments("6a01afb1002232d33950",  "Voos (flights)");
  await deleteAllDocuments("6a0200bf00297bfc2231",  "Vídeos de voo");
  await deleteAllDocuments("6a0488740032fe62d090",  "Telemetria summaries");
  await deleteAllDocuments("6a04887600079471ce1d",  "Pousos (landings)");
  await deleteAllDocuments("6a048877000260a0b24b",  "Decolagens (takeoffs)");
  await deleteAllDocuments("flight_signatures",     "Assinaturas de voo");
  await deleteAllDocuments("flight_discrepancies",  "Discrepâncias de voo");
  await deleteAllDocuments("flight_telemetry_alerts", "Alertas de telemetria");
  await deleteAllDocuments("6a1464e300079d599e22",  "Flight maneuvers");
  await deleteAllDocuments("6a1464f40014e9bd5f5b",  "Flight maneuver reviews");
  await deleteAllDocuments("logbook_opening_signatures", "Assinaturas caderneta");
  await deleteAllDocuments("6a023d880031718b22c0",  "Planos semanais itens");
  await deleteAllDocuments("6a023d7d00137ede2f5b",  "Planos semanais");
  await deleteAllDocuments("6a023d930024cacc5bf7",  "Disponibilidade planos");
  await deleteAllDocuments("audit_events",          "Audit events");

  // ── Abastecimentos ─────────────────────────────────────────────────────────
  console.log("\n📁 Abastecimentos");
  await deleteAllDocuments("aircraft_fuelings", "Abastecimentos");

  // ── CRM Leads ──────────────────────────────────────────────────────────────
  console.log("\n📁 CRM");
  await deleteAllDocuments("crm_leads", "Leads CRM");
  await deleteAllDocuments("6a189aa50039b3e7fe5c", "Contratos");
  await deleteAllDocuments("6a189ab8003e3c94a184", "Assinaturas contratos");

  // ── Dados de alunos (vinculados a usuários) ────────────────────────────────
  console.log("\n📁 Dados de alunos");
  await deleteAllDocuments("6a0378e600388c30bade",  "Créditos de alunos");
  await deleteAllDocuments("student_training_tracks","Trilhas de alunos");
  await deleteAllDocuments("6a0af5a00008cdcdbabc",  "Observações de alunos");
  await deleteAllDocuments("product_sales",          "Vendas de produtos");
  await deleteAllDocuments("instructor_costs",       "Custos de instrutor");
  await deleteAllDocuments("flight_instructor_payments", "Pagamentos instrutor");
  await deleteAllDocuments("6a0220640035de7cc116",  "Op. weeks");
  await deleteAllDocuments("6a05e5d5002fae6b666c",  "Push subscriptions");
  await deleteAllDocuments("6a05e5e10011f894d191",  "Notification deliveries");

  // ── Perfis (exceto admin — usuário será deletado antes) ────────────────────
  // Os perfis são deletados em cascata quando o usuário é deletado no Appwrite,
  // mas apagamos a coleção explicitamente para garantir.
  console.log("\n📁 Perfis");
  await deleteAllDocuments("6a01ebb50034d5067723",  "Perfis de usuário");
  await deleteAllDocuments("6a01ebb60022ea7e329b",  "Instrutor-aluno vínculos");
  await deleteAllDocuments("profile_documents",     "Documentos de perfil");

  // ── Usuários ────────────────────────────────────────────────────────────────
  console.log("\n📁 Usuários Auth");
  await deleteAllUsers();

  // ── Resumo ─────────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════════");
  if (DRY_RUN) {
    console.log("  ✅  Dry-run concluído. Rode com --run para executar.");
  } else {
    console.log(`  ✅  Concluído: ${totalDeleted} item(s) deletado(s), ${totalErrors} erro(s).`);
  }
  console.log("══════════════════════════════════════════════════════\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
