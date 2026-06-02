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
const student = "saga_alias_115";

const narrowSelect = [
  "$id",
  "source_filename",
  "flight_date",
  "duration_sec",
  "block_time_minutes",
  "total_flight_minutes",
  "landings",
];
const wideSelect = [...narrowSelect, "flight_status", "saga_schedule_id"];

async function list(select) {
  const res = await db.listDocuments({
    databaseId: env.VITE_APPWRITE_DATABASE_ID,
    collectionId: env.VITE_APPWRITE_COLLECTION_ID,
    queries: [
      sdk.Query.select(select),
      sdk.Query.equal("student_user_id", [student]),
      sdk.Query.limit(20),
    ],
  });
  return res.documents.map((d) => ({
    id: d.$id,
    source: d.source_filename,
    statusRaw: d.flight_status ?? null,
    durationSec: d.duration_sec ?? null,
    block: d.block_time_minutes ?? null,
  }));
}

const narrow = await list(narrowSelect);
const wide = await list(wideSelect);

console.log(
  JSON.stringify(
    {
      narrowMissingStatus: narrow.filter((r) => r.statusRaw == null).length,
      wideRealizado: wide.filter((r) => r.statusRaw === "Realizado").length,
      widePrevisto: wide.filter((r) => r.statusRaw === "Previsto").length,
      sampleWide: wide.slice(0, 5),
    },
    null,
    2,
  ),
);
