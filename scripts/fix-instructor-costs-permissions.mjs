/**
 * Migração: adiciona Permission.read(Role.user(instructorUserId)) em cada
 * documento existente da coleção instructor_costs.
 *
 * O motivo: a coleção foi criada com leitura restrita a "admin". Quando o
 * instrutor assina um voo (client-side), ele precisa ler seu próprio
 * documento de custos. Sem essa permissão, getInstructorCosts() retorna null
 * silenciosamente e o snapshot de pagamento é salvo com todos os valores = 0.
 *
 * Uso:
 *   node scripts/fix-instructor-costs-permissions.mjs
 *
 * Env vars necessárias: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID,
 *   APPWRITE_API_KEY, APPWRITE_DATABASE_ID,
 *   APPWRITE_INSTRUCTOR_COSTS_COL_ID (ou usa "instructor_costs" como default)
 */
import { Client, Databases, Permission, Query, Role } from "node-appwrite";

const ENDPOINT   = process.env.APPWRITE_ENDPOINT   || process.env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID;
const API_KEY    = process.env.APPWRITE_API_KEY;
const DB_ID      = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID;
const COL_ID     = process.env.APPWRITE_INSTRUCTOR_COSTS_COL_ID || process.env.VITE_APPWRITE_INSTRUCTOR_COSTS_COL_ID || "instructor_costs";

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DB_ID) {
  console.error("Missing required env vars: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID");
  process.exit(1);
}

const client    = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log(`\n=== fix-instructor-costs-permissions ===`);
  console.log(`Collection: ${COL_ID}\n`);

  let cursor = null;
  let total = 0;
  let updated = 0;

  while (true) {
    const queries = [Query.limit(100), Query.orderAsc("$id")];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const page = await databases.listDocuments(DB_ID, COL_ID, queries);
    if (page.documents.length === 0) break;

    for (const doc of page.documents) {
      total++;
      const instructorUserId = doc.instructor_user_id;
      if (!instructorUserId) {
        console.warn(`  [skip] doc ${doc.$id} has no instructor_user_id`);
        continue;
      }

      const permissions = [
        Permission.read(Role.label("admin")),
        Permission.read(Role.user(instructorUserId)),
        Permission.update(Role.label("admin")),
        Permission.delete(Role.label("admin")),
      ];

      try {
        await databases.updateDocument(DB_ID, COL_ID, doc.$id, {}, permissions);
        updated++;
        console.log(`  ✓ ${doc.$id}  instrutor=${instructorUserId}`);
      } catch (e) {
        console.warn(`  ✗ ${doc.$id}: ${e?.message}`);
      }

      // Throttle to avoid rate limiting
      if (updated % 10 === 0) await sleep(100);
    }

    if (page.documents.length < 100) break;
    cursor = page.documents.at(-1).$id;
  }

  console.log(`\n✅ Concluído. ${updated}/${total} documentos atualizados.`);
}

run().catch((e) => { console.error(e); process.exit(1); });
