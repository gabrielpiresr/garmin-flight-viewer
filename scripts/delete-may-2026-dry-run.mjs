/**
 * DRY-RUN: Lista todos os voos de maio/2026 e conta registros correlacionados.
 * NÃO deleta nada.
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

async function listAll(collectionId, queries, select = ["$id"]) {
  const results = [];
  let cursor = null;
  while (true) {
    const q = [...queries, Query.limit(100), Query.select(select)];
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

async function countByFlightIds(collectionId, flightIds) {
  if (flightIds.length === 0) return 0;
  let total = 0;
  const CHUNK = 25;
  for (let i = 0; i < flightIds.length; i += CHUNK) {
    const chunk = flightIds.slice(i, i + CHUNK);
    try {
      const res = await db.listDocuments(DB_ID, collectionId, [
        Query.equal("flight_id", chunk),
        Query.limit(1),
      ]);
      total += res.total;
    } catch {
      // collection may not have index — skip
    }
  }
  return total;
}

async function main() {
  console.log("=== DRY-RUN: Voos de maio/2026 ===\n");

  // 1. List all May-2026 flights
  const flights = await listAll(
    FLIGHTS_COL,
    [
      Query.greaterThanEqual("flight_date", "2026-05-01"),
      Query.lessThanEqual("flight_date", "2026-05-31"),
    ],
    ["$id", "flight_date", "aircraft_ident", "student_user_id"],
  );

  console.log(`Voos encontrados (maio/2026): ${flights.length}`);
  if (flights.length > 0) {
    console.log("\nLista de voos:");
    for (const f of flights) {
      console.log(`  ${f.$id}  date=${f.flight_date ?? "(sem data)"}  aircraft=${f.aircraft_ident ?? "-"}  student=${f.student_user_id ?? "-"}`);
    }
  }

  const flightIds = flights.map((f) => f.$id);

  console.log("\nContando registros correlacionados...");
  const [sigCount, payCount, sumCount, landCount, takeCount, alertCount] = await Promise.all([
    countByFlightIds(SIGNATURES_COL, flightIds),
    countByFlightIds(INSTRUCTOR_PAY_COL, flightIds),
    countByFlightIds(TELEMETRY_SUM_COL, flightIds),
    countByFlightIds(LANDINGS_COL, flightIds),
    countByFlightIds(TAKEOFFS_COL, flightIds),
    countByFlightIds(ALERTS_COL, flightIds),
  ]);

  console.log("\n── Resumo do que SERIA deletado ───────────────────────────");
  console.log(`  flights                     : ${flights.length}`);
  console.log(`  flight_signatures           : ${sigCount}`);
  console.log(`  flight_instructor_payments  : ${payCount}`);
  console.log(`  flight_telemetry_summaries  : ${sumCount}`);
  console.log(`  flight_landings             : ${landCount}`);
  console.log(`  flight_takeoffs             : ${takeCount}`);
  console.log(`  flight_telemetry_alerts     : ${alertCount}`);
  const grandTotal = flights.length + sigCount + payCount + sumCount + landCount + takeCount + alertCount;
  console.log(`  ─────────────────────────────────────`);
  console.log(`  TOTAL                       : ${grandTotal} documentos`);
  console.log("\n⚠  Nenhum dado foi alterado. Este foi apenas um dry-run.");
}

main().catch((e) => { console.error(e); process.exit(1); });
