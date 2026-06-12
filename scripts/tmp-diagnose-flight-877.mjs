import fs from "node:fs";
import * as sdk from "node-appwrite";

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
  const idx = trimmed.indexOf("=");
  env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
}

const endpoint = env.VITE_APPWRITE_ENDPOINT;
const projectId = env.VITE_APPWRITE_PROJECT_ID;
const apiKey = env.APPWRITE_API_KEY;
const databaseId = env.VITE_APPWRITE_DATABASE_ID;
const collectionId = env.VITE_APPWRITE_COLLECTION_ID;

if (!endpoint || !projectId || !apiKey || !databaseId || !collectionId) {
  throw new Error("Missing required Appwrite envs in .env.local");
}

const client = new sdk.Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const db = new sdk.Databases(client);

const limit = 100;
let offset = 0;
const matches = [];

for (let page = 0; page < 1000; page += 1) {
  const res = await db.listDocuments({
    databaseId,
    collectionId,
    queries: [sdk.Query.limit(limit), sdk.Query.offset(offset)],
  });
  const docs = res.documents || [];
  for (const doc of docs) {
    const sagaFlightId = String(doc.saga_flight_id || "");
    const localId = String(doc.$id || "");
    const source = String(doc.source_filename || "");
    if (sagaFlightId.includes("877") || localId.includes("877") || source.includes("877")) {
      matches.push({
        id: localId,
        saga_flight_id: sagaFlightId,
        saga_imported_at: doc.saga_imported_at || null,
        flight_date: doc.flight_date || null,
        student_user_id: doc.student_user_id || null,
        user_id: doc.user_id || null,
        instructor_user_id: doc.instructor_user_id || null,
        source_filename: source || null,
        instructor_signed: Boolean(doc.instructor_signed),
      });
    }
  }
  if (docs.length < limit) break;
  offset += limit;
}

console.log(JSON.stringify({ totalMatches: matches.length, matches }, null, 2));
