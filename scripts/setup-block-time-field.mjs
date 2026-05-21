/**
 * Adiciona o campo block_time_minutes à coleção flights.
 *
 * block_time_minutes = diferença entre Horário de partida e Horário de corte
 * dos motores (do cabeçalho do CSV Garmin). É o tempo de bloco, que é a base
 * correta para exibição de duração e cálculo de comissão de instrutor.
 *
 * Uso:
 *   node scripts/setup-block-time-field.mjs
 */
import { Client, Databases } from "node-appwrite";

const ENDPOINT    = process.env.APPWRITE_ENDPOINT    || process.env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID  = process.env.APPWRITE_PROJECT_ID  || process.env.VITE_APPWRITE_PROJECT_ID;
const API_KEY     = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID;
const FLIGHTS_COL = process.env.APPWRITE_COLLECTION_ID || process.env.VITE_APPWRITE_COLLECTION_ID || "6a01afb1002232d33950";

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("Missing env vars. Required: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("=== Adding block_time_minutes to flights collection ===");
  console.log(`Collection: ${FLIGHTS_COL}\n`);

  try {
    await db.createFloatAttribute(DATABASE_ID, FLIGHTS_COL, "block_time_minutes", false);
    await sleep(700);
    console.log("  + block_time_minutes (float, nullable)");
  } catch (e) {
    const msg = e?.message ?? String(e);
    if (msg.toLowerCase().includes("already exists")) {
      console.log("  - block_time_minutes already exists, skipping");
    } else {
      throw e;
    }
  }

  console.log("\nDone. Run backfill script next to populate existing flights.");
}

main().catch((e) => { console.error(e); process.exit(1); });
