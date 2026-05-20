import { Client, Databases } from "node-appwrite";

const ENDPOINT   = process.env.APPWRITE_ENDPOINT   ?? "https://sfo.cloud.appwrite.io/v1";
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID ?? "6a01ac8a0009fbf94f05";
const API_KEY    = process.env.APPWRITE_API_KEY;
const DB_ID      = process.env.APPWRITE_DATABASE_ID ?? "6a01afae001bc352d1b1";

if (!API_KEY) {
  console.error("Defina a variável APPWRITE_API_KEY antes de rodar o script.");
  process.exit(1);
}

const FLIGHTS_COL_ID       = "6a01afb1002232d33950";
const AIRCRAFT_MODELS_COL_ID = "6a02204a00164218a4da";

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attr(createFn, label) {
  try {
    await createFn();
    await sleep(800);
    console.log(`  ✓ ${label}`);
  } catch (error) {
    const msg = error?.message ?? String(error);
    if (msg.toLowerCase().includes("already exists")) {
      console.log(`  • ${label} (já existe)`);
      return;
    }
    throw error;
  }
}

async function run() {
  console.log("\n=== Migração ANAC fields ===\n");

  console.log("flights → flight_seq_number");
  await attr(
    () => db.createIntegerAttribute(DB_ID, FLIGHTS_COL_ID, "flight_seq_number", false),
    "flight_seq_number (Integer, nullable)"
  );

  console.log("\naircraftModels → fuel_consumption_lph");
  await attr(
    () => db.createFloatAttribute(DB_ID, AIRCRAFT_MODELS_COL_ID, "fuel_consumption_lph", false),
    "fuel_consumption_lph (Float, nullable)"
  );

  console.log("\n✅ Migração concluída.\n");
}

run().catch((e) => {
  console.error("Erro na migração:", e?.message ?? e);
  process.exit(1);
});
