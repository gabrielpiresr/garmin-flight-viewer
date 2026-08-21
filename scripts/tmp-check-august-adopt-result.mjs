import fs from "node:fs";
import * as sdk from "node-appwrite";

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  env[t.slice(0, i)] = t.slice(i + 1);
}

const db = new sdk.Databases(
  new sdk.Client().setEndpoint(env.VITE_APPWRITE_ENDPOINT).setProject(env.VITE_APPWRITE_PROJECT_ID).setKey(env.APPWRITE_API_KEY),
);

for (const key of ["sagaImportLastSummary", "sagaImportProgress"]) {
  const res = await db.listDocuments({
    databaseId: env.VITE_APPWRITE_DATABASE_ID,
    collectionId: env.VITE_APPWRITE_PLATFORM_SETTINGS_COL_ID,
    queries: [sdk.Query.equal("key", [key]), sdk.Query.limit(1)],
  });
  const doc = res.documents[0];
  if (!doc) {
    console.log(key, "MISSING");
    continue;
  }
  const parsed = JSON.parse(doc.settings_json || "{}");
  console.log("====", key, "updated", doc.$updatedAt);
  console.log(JSON.stringify(parsed, null, 2).slice(0, 8000));
}

const ids = ["saga_flight_1273", "saga_flight_1287", "saga_flight_1281", "saga_flight_1288", "saga_flight_1291", "saga_flight_1316", "saga_flight_1318", "saga_flight_1320", "saga_flight_1321", "saga_flight_1324", "saga_flight_1325"];
console.log("==== local DZB pairs");
for (const id of ids) {
  try {
    const d = await db.getDocument({
      databaseId: env.VITE_APPWRITE_DATABASE_ID,
      collectionId: env.VITE_APPWRITE_COLLECTION_ID,
      documentId: id,
    });
    console.log(JSON.stringify({
      id: d.$id,
      saga: d.saga_flight_id,
      status: d.flight_status,
      hours: Number((Number(d.block_time_minutes || 0) / 60).toFixed(1)),
      name: d.name,
      source: d.source_filename,
      telemetry: Boolean(d.telemetry_present || d.csv_file_id),
    }));
  } catch {
    console.log(JSON.stringify({ id, missing: true }));
  }
}
