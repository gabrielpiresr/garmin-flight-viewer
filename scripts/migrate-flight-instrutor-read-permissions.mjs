import fs from "node:fs";
import * as sdk from "node-appwrite";

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return;
  const text = fs.readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const endpoint = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID;
const flightsCollectionId =
  process.env.APPWRITE_FLIGHTS_COLLECTION_ID ||
  process.env.VITE_APPWRITE_COLLECTION_ID;

if (!endpoint || !projectId || !apiKey || !databaseId || !flightsCollectionId) {
  throw new Error("Missing env vars for migration.");
}

const client = new sdk.Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const db = new sdk.Databases(client);

const REQUIRED_PERMS = [
  sdk.Permission.read(sdk.Role.users()),
  sdk.Permission.read(sdk.Role.label("instrutor")),
  sdk.Permission.update(sdk.Role.label("instrutor")),
];

function mergePermissions(current) {
  return Array.from(new Set([...(current ?? []), ...REQUIRED_PERMS]));
}

async function listAllFlights() {
  const docs = [];
  let cursor = null;
  while (true) {
    const queries = [sdk.Query.limit(100), sdk.Query.equal("school_id", ["escola_principal"])];
    if (cursor) queries.push(sdk.Query.cursorAfter(cursor));
    const page = await db.listDocuments(databaseId, flightsCollectionId, queries);
    docs.push(...page.documents);
    if (page.documents.length < 100) break;
    cursor = page.documents[page.documents.length - 1].$id;
  }
  return docs;
}

function isSagaImportedFlight(doc) {
  const source = String(doc.source_filename ?? "");
  if (source.startsWith("saga-flight") || source.startsWith("saga-schedule") || source.startsWith("saga-test-")) {
    return true;
  }
  return Boolean(doc.saga_imported_at || doc.saga_flight_id);
}

function hasInstrutorRead(permissions) {
  return (permissions ?? []).some((perm) => String(perm).includes("instrutor") && String(perm).startsWith("read"));
}

async function main() {
  const docs = await listAllFlights();
  let updated = 0;
  let sagaMissingBefore = 0;
  let sagaUpdated = 0;
  for (const doc of docs) {
    const saga = isSagaImportedFlight(doc);
    if (saga && !hasInstrutorRead(doc.$permissions)) sagaMissingBefore += 1;
    const nextPermissions = mergePermissions(doc.$permissions);
    const prevSig = JSON.stringify((doc.$permissions ?? []).slice().sort());
    const nextSig = JSON.stringify(nextPermissions.slice().sort());
    if (prevSig === nextSig) continue;
    await db.updateDocument(databaseId, flightsCollectionId, doc.$id, {}, nextPermissions);
    updated += 1;
    if (saga) sagaUpdated += 1;
  }
  console.log(`Done. Updated ${updated} of ${docs.length} flight documents.`);
  console.log(`SAGA flights missing instrutor read before migration: ${sagaMissingBefore}`);
  console.log(`SAGA flights updated: ${sagaUpdated}`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
