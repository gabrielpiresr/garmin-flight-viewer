/**
 * EXECUTE: Deleta todos os voos de maio/2026 e registros correlacionados.
 */
import { Client, Databases, Query } from "node-appwrite";

const ENDPOINT   = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY    = process.env.APPWRITE_API_KEY;
const DB_ID      = process.env.APPWRITE_DATABASE_ID;

const FLIGHTS_COL           = process.env.APPWRITE_COLLECTION_ID                        || "6a01afb1002232d33950";
const SIGNATURES_COL        = process.env.APPWRITE_FLIGHT_SIGNATURES_COL_ID             || "flight_signatures";
const INSTRUCTOR_PAY_COL    = process.env.APPWRITE_FLIGHT_INSTRUCTOR_PAYMENTS_COL_ID    || "flight_instructor_payments";
const TELEMETRY_SUM_COL     = process.env.APPWRITE_FLIGHT_TELEMETRY_SUMMARIES_COL_ID    || "6a0488740032fe62d090";
const LANDINGS_COL          = process.env.APPWRITE_FLIGHT_LANDINGS_COL_ID               || "6a04887600079471ce1d";
const TAKEOFFS_COL          = process.env.APPWRITE_FLIGHT_TAKEOFFS_COL_ID               || "6a048877000260a0b24b";
const ALERTS_COL            = process.env.APPWRITE_FLIGHT_TELEMETRY_ALERTS_COL_ID       || "flight_telemetry_alerts";

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DB_ID) {
  console.error("Missing required env vars.");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function listAll(collectionId, queries) {
  const results = [];
  let cursor = null;
  while (true) {
    const q = [...queries, Query.limit(100), Query.select(["$id"])];
    if (cursor) q.push(Query.cursorAfter(cursor));
    let res;
    try {
      res = await db.listDocuments(DB_ID, collectionId, q);
    } catch (e) {
      console.warn(`  Warn [${collectionId}]: ${e?.message}`);
      break;
    }
    results.push(...res.documents);
    if (res.documents.length < 100) break;
    cursor = res.documents.at(-1).$id;
  }
  return results;
}

async function deleteDocuments(collectionId, ids, label) {
  if (ids.length === 0) {
    console.log(`  ${label}: nada a deletar`);
    return;
  }
  let deleted = 0;
  for (const id of ids) {
    try {
      await db.deleteDocument(DB_ID, collectionId, id);
      deleted++;
      if (deleted % 10 === 0) await sleep(100); // throttle
    } catch (e) {
      console.warn(`  Warn deletando ${label}/${id}: ${e?.message}`);
    }
  }
  console.log(`  ✓ ${label}: ${deleted}/${ids.length} deletados`);
}

async function collectRelatedIds(collectionId, flightIds) {
  if (flightIds.length === 0) return [];
  const ids = [];
  const CHUNK = 25;
  for (let i = 0; i < flightIds.length; i += CHUNK) {
    const chunk = flightIds.slice(i, i + CHUNK);
    try {
      const docs = await listAll(collectionId, [Query.equal("flight_id", chunk)]);
      ids.push(...docs.map((d) => d.$id));
    } catch {
      // skip
    }
  }
  return ids;
}

async function main() {
  console.log("=== DELETANDO voos de maio/2026 ===\n");

  // 1. Collect flight IDs
  console.log("Buscando voos de maio/2026...");
  const flights = await listAll(FLIGHTS_COL, [
    Query.greaterThanEqual("flight_date", "2026-05-01"),
    Query.lessThanEqual("flight_date", "2026-05-31"),
  ]);
  const flightIds = flights.map((f) => f.$id);
  console.log(`  Encontrados: ${flightIds.length} voos\n`);

  if (flightIds.length === 0) {
    console.log("Nenhum voo encontrado. Nada a fazer.");
    return;
  }

  // 2. Collect related IDs
  console.log("Coletando IDs dos registros correlacionados...");
  const [sigIds, payIds, sumIds, landIds, takeIds, alertIds] = await Promise.all([
    collectRelatedIds(SIGNATURES_COL, flightIds),
    collectRelatedIds(INSTRUCTOR_PAY_COL, flightIds),
    collectRelatedIds(TELEMETRY_SUM_COL, flightIds),
    collectRelatedIds(LANDINGS_COL, flightIds),
    collectRelatedIds(TAKEOFFS_COL, flightIds),
    collectRelatedIds(ALERTS_COL, flightIds),
  ]);
  console.log(`  signatures: ${sigIds.length}, payments: ${payIds.length}, summaries: ${sumIds.length}, landings: ${landIds.length}, takeoffs: ${takeIds.length}, alerts: ${alertIds.length}\n`);

  // 3. Delete correlations first
  console.log("Deletando registros correlacionados...");
  await deleteDocuments(SIGNATURES_COL,     sigIds,   "flight_signatures");
  await deleteDocuments(INSTRUCTOR_PAY_COL, payIds,   "flight_instructor_payments");
  await deleteDocuments(TELEMETRY_SUM_COL,  sumIds,   "flight_telemetry_summaries");
  await deleteDocuments(LANDINGS_COL,       landIds,  "flight_landings");
  await deleteDocuments(TAKEOFFS_COL,       takeIds,  "flight_takeoffs");
  await deleteDocuments(ALERTS_COL,         alertIds, "flight_telemetry_alerts");

  // 4. Delete flights themselves
  console.log("\nDeletando voos...");
  await deleteDocuments(FLIGHTS_COL, flightIds, "flights");

  const total = flightIds.length + sigIds.length + payIds.length + sumIds.length + landIds.length + takeIds.length + alertIds.length;
  console.log(`\n✅ Concluído. ${total} documentos deletados.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
