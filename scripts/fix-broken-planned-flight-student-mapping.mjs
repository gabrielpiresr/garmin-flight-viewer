import { Client, Databases, Query } from "node-appwrite";
import { readFileSync } from "node:fs";

function readEnvLocal() {
  const out = {};
  const raw = readFileSync(".env.local", "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    out[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return out;
}

const env = readEnvLocal();
const apiKey = process.env.APPWRITE_API_KEY || env.APPWRITE_API_KEY;
if (!apiKey) {
  console.error("APPWRITE_API_KEY ausente.");
  process.exit(1);
}

const ENDPOINT = "https://sfo.cloud.appwrite.io/v1";
const PROJECT_ID = "6a01ac8a0009fbf94f05";
const DB_ID = "6a01afae001bc352d1b1";
const FLIGHTS_COL_ID = "6a01afb1002232d33950";

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(apiKey);
const databases = new Databases(client);

let cursor = null;
let scanned = 0;
let fixed = 0;
let skippedNoRealUser = 0;
let pages = 0;

for (;;) {
  const queries = [Query.equal("flight_status", ["Previsto"]), Query.limit(100), Query.orderAsc("$id")];
  if (cursor) queries.push(Query.cursorAfter(cursor));
  const page = await databases.listDocuments({
    databaseId: DB_ID,
    collectionId: FLIGHTS_COL_ID,
    queries,
  });
  pages += 1;
  if (page.documents.length === 0) break;

  for (const doc of page.documents) {
    scanned += 1;
    const studentId = String(doc.student_user_id ?? "");
    const userId = String(doc.user_id ?? "");
    const broken =
      !studentId ||
      !userId ||
      studentId.startsWith("saga_alias_") ||
      userId.startsWith("saga_alias_");
    if (!broken) continue;

    const permissions = Array.isArray(doc.$permissions) ? doc.$permissions : [];
    const pickFromPerm = permissions
      .map((p) => String(p))
      .find((p) => /^update\("user:[^"]+"\)$/.test(p) || /^read\("user:[^"]+"\)$/.test(p));
    const realUserId = pickFromPerm?.match(/user:([^"]+)/)?.[1] ?? "";
    if (!realUserId || realUserId.startsWith("saga_alias_")) {
      skippedNoRealUser += 1;
      continue;
    }

    await databases.updateDocument({
      databaseId: DB_ID,
      collectionId: FLIGHTS_COL_ID,
      documentId: doc.$id,
      data: {
        user_id: realUserId,
        student_user_id: realUserId,
      },
    });
    fixed += 1;
  }

  if (page.documents.length < 100) break;
  cursor = page.documents[page.documents.length - 1].$id;
}

console.log(JSON.stringify({ pages, scanned, fixed, skippedNoRealUser }, null, 2));
