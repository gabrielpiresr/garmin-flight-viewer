import fs from "node:fs";
import { Client, Databases, Query } from "node-appwrite";

function loadEnv(filePath = ".env.local") {
  const env = {};
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

async function main() {
  const env = { ...loadEnv(), ...process.env };
  const endpoint = env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
  const projectId = env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
  const apiKey = env.APPWRITE_API_KEY;
  const databaseId = env.APPWRITE_DATABASE_ID || env.VITE_APPWRITE_DATABASE_ID;
  const fuelingsColId = env.APPWRITE_FUELINGS_COL_ID || env.VITE_APPWRITE_FUELINGS_COL_ID || "aircraft_fuelings";
  const schoolId = env.SCHOOL_ID || env.VITE_SCHOOL_ID || "escola_principal";

  const run = process.argv.includes("--run");

  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  const db = new Databases(client);

  const res = await db.listDocuments(databaseId, fuelingsColId, [
    Query.equal("school_id", [schoolId]),
    Query.greaterThanEqual("occurred_at", "2025-01-01T00:00"),
    Query.lessThanEqual("occurred_at", "2025-12-31T23:59"),
    Query.limit(500),
  ]);

  console.log(`Encontrados em 2025: ${res.documents.length}`);
  for (const doc of res.documents) {
    console.log(
      JSON.stringify({
        id: doc.$id,
        occurred_at: doc.occurred_at,
        aircraft_registration: doc.aircraft_registration,
        total_value: doc.total_value,
      }),
    );
  }

  if (!run || res.documents.length === 0) {
    console.log("Dry-run. Use --run para corrigir o ano.");
    return;
  }

  let updated = 0;
  for (const doc of res.documents) {
    const occurredAt = String(doc.occurred_at ?? "");
    if (!occurredAt.startsWith("2025-")) continue;
    const fixed = `2026-${occurredAt.slice(5)}`;
    await db.updateDocument(databaseId, fuelingsColId, doc.$id, { occurred_at: fixed });
    updated += 1;
  }

  console.log(`Corrigidos: ${updated}`);
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
