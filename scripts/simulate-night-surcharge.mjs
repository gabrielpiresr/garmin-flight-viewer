import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import * as sdk from "node-appwrite";

const require = createRequire(import.meta.url);
const { nightMinutesFromFlightRecordText } = require("../functions/admin-users/src/nightSurcharge.js");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    out[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return out;
}

const fileEnv = parseEnvFile(path.resolve(process.cwd(), ".env.local"));
const env = { ...fileEnv, ...process.env };

const endpoint = env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
const projectId = env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
const apiKey = env.APPWRITE_API_KEY;
const databaseId = env.APPWRITE_DATABASE_ID || env.VITE_APPWRITE_DATABASE_ID;
const flightsId = env.APPWRITE_FLIGHTS_COLLECTION_ID || env.VITE_APPWRITE_COLLECTION_ID || env.VITE_APPWRITE_FLIGHTS_COL_ID;
const bucketId = env.APPWRITE_BUCKET_ID || env.APPWRITE_FLIGHTS_BUCKET_ID || env.VITE_APPWRITE_BUCKET_ID;

if (!endpoint || !projectId || !apiKey || !databaseId || !flightsId) {
  throw new Error("Faltam endpoint/project/api key/database/flights collection no ambiente.");
}

const client = new sdk.Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new sdk.Databases(client);
const storage = new sdk.Storage(client);

const cases = [
  { sagaId: "1342", expectedMinutes: 30 },
  { sagaId: "1337", expectedMinutes: 60 },
  { sagaId: "1347", expectedMinutes: 0 },
];

async function getFlight(sagaId) {
  const directId = `saga_flight_${sagaId}`;
  const direct = await databases.getDocument(databaseId, flightsId, directId).catch(() => null);
  if (direct) return direct;
  const result = await databases.listDocuments(databaseId, flightsId, [
    sdk.Query.equal("saga_flight_id", [sagaId]),
    sdk.Query.limit(1),
  ]);
  return result.documents[0] || null;
}

async function csvText(doc) {
  const inline = String(doc?.csv_text || "");
  const fileId = String(doc?.csv_file_id || "");
  if (!fileId || !bucketId) return inline;
  try {
    const file = await storage.getFileDownload(bucketId, fileId);
    if (Buffer.isBuffer(file)) return file.toString("utf8");
    if (file instanceof ArrayBuffer) return Buffer.from(file).toString("utf8");
    if (file && typeof file.arrayBuffer === "function") return Buffer.from(await file.arrayBuffer()).toString("utf8");
  } catch {
    return inline;
  }
  return inline;
}

const rows = [];
let failed = false;
for (const item of cases) {
  const doc = await getFlight(item.sagaId);
  if (!doc) {
    rows.push({ sagaId: item.sagaId, expectedMinutes: item.expectedMinutes, actualMinutes: null, ok: false, reason: "not_found" });
    failed = true;
    continue;
  }
  const actualMinutes = nightMinutesFromFlightRecordText(await csvText(doc));
  const ok = actualMinutes === item.expectedMinutes;
  rows.push({ sagaId: item.sagaId, documentId: doc.$id, expectedMinutes: item.expectedMinutes, actualMinutes, ok });
  if (!ok) failed = true;
}

console.table(rows);
if (failed) {
  process.exitCode = 1;
}
