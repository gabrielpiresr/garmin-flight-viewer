/**
 * Reparo one-off: artigos de manobras criados sem school_id ficam invisíveis
 * na listagem (que filtra por escola). Este script preenche o school_id.
 *
 * Uso: APPWRITE_API_KEY=<key> node scripts/tmp-fix-article-school-id.mjs
 */
import { Client, Databases, Query } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT || "https://sfo.cloud.appwrite.io/v1";
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || "6a01ac8a0009fbf94f05";
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = "6a01afae001bc352d1b1";
const ARTICLES_COL_ID = "6a0461d0001a1ceefdad";
const SCHOOL_ID = process.env.SCHOOL_ID || "escola_principal";

if (!API_KEY) {
  console.error("APPWRITE_API_KEY não definida.");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const [nulls, empties] = await Promise.all([
  db.listDocuments(DB_ID, ARTICLES_COL_ID, [Query.isNull("school_id"), Query.limit(200)]),
  db.listDocuments(DB_ID, ARTICLES_COL_ID, [Query.equal("school_id", [""]), Query.limit(200)]),
]);
const orphans = { documents: [...nulls.documents, ...empties.documents] };

console.log(`Artigos sem school_id: ${orphans.documents.length}`);
for (const doc of orphans.documents) {
  await db.updateDocument(DB_ID, ARTICLES_COL_ID, doc.$id, { school_id: SCHOOL_ID });
  console.log(`  ✓ ${doc.$id} — "${doc.title}"`);
}
console.log("Concluído.");
