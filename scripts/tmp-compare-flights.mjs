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

const ids = ["saga_flight_739", "saga_flight_744", "saga_flight_732"];
for (const docId of ids) {
  const d = await db.getDocument({
    databaseId: env.VITE_APPWRITE_DATABASE_ID,
    collectionId: env.VITE_APPWRITE_COLLECTION_ID,
    documentId: docId,
  });
  console.log(
    JSON.stringify(
      {
        id: d.$id,
        saga: d.saga_flight_id,
        date: d.flight_date,
        status: d.flight_status,
        duration_sec: d.duration_sec,
        block_time_minutes: d.block_time_minutes,
        total_flight_minutes: d.total_flight_minutes,
        landings: d.landings,
        total_miles: d.total_miles,
        hasCsv: Boolean(d.csv_text),
        csvLen: (d.csv_text || "").length,
      },
      null,
      2,
    ),
  );
}
