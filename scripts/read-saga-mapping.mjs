import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as sdk from "node-appwrite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = {};
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const i = t.indexOf("=");
  env[t.slice(0, i)] = t.slice(i + 1);
}

const databases = new sdk.Databases(
  new sdk.Client().setEndpoint(env.VITE_APPWRITE_ENDPOINT).setProject(env.VITE_APPWRITE_PROJECT_ID).setKey(env.APPWRITE_API_KEY),
);
const col = env.VITE_APPWRITE_PLATFORM_SETTINGS_COL_ID;
const db = env.VITE_APPWRITE_DATABASE_ID;

const res = await databases.listDocuments({
  databaseId: db,
  collectionId: col,
  queries: [sdk.Query.equal("key", ["sagaImportMapping"]), sdk.Query.limit(1)],
});
const doc = res.documents[0];
if (!doc) {
  console.log("No saga_import_mapping found");
  process.exit(0);
}
const mapping = JSON.parse(doc.settings_json || "{}");
console.log(JSON.stringify({
  creditAircraftBySaga: mapping.creditAircraftBySaga,
  creditColumnMap: mapping.creditColumnMap,
  missingCreditKeys: Object.keys(mapping.creditAircraftBySaga || {}).length,
}, null, 2));
