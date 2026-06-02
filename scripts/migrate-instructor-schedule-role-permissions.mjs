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

const endpoint = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const configuredDatabaseId = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID;
const configuredRolesCollectionId =
  process.env.APPWRITE_TENANT_ROLES_COLLECTION_ID ||
  process.env.VITE_APPWRITE_TENANT_ROLES_COL_ID ||
  process.env.TENANT_ROLES_COL_ID;

if (!endpoint || !projectId || !apiKey) {
  throw new Error(
    "Missing env vars. Required: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID and APPWRITE_API_KEY.",
  );
}

const client = new sdk.Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const db = new sdk.Databases(client);

function parsePermissions(json) {
  if (!json) return { tabs: {}, actions: {} };
  try {
    const parsed = JSON.parse(json);
    return {
      tabs: parsed?.tabs && typeof parsed.tabs === "object" ? parsed.tabs : {},
      actions: parsed?.actions && typeof parsed.actions === "object" ? parsed.actions : {},
    };
  } catch {
    return { tabs: {}, actions: {} };
  }
}

function nextInstructorPermissions(current) {
  const tabs = { ...current.tabs };
  const actions = { ...current.actions };

  const scheduleEnabled = tabs.schedule !== false;
  if (tabs["schedule.voos"] === undefined) tabs["schedule.voos"] = scheduleEnabled;
  if (tabs["schedule.disponibilidades"] === undefined) tabs["schedule.disponibilidades"] = false;
  if (tabs["schedule.gerador"] === undefined) tabs["schedule.gerador"] = false;

  if (actions["flight.create"] === undefined) actions["flight.create"] = false;
  if (actions["flight.edit"] === undefined) actions["flight.edit"] = false;
  if (actions["flight.delete"] === undefined) actions["flight.delete"] = false;

  return { tabs, actions };
}

async function listAllRoleDocs() {
  let databaseId = configuredDatabaseId;
  if (!databaseId) {
    const dbList = await db.list();
    databaseId =
      dbList.databases.find((row) => row.name === "flights-db")?.$id ??
      dbList.databases[0]?.$id;
  }
  if (!databaseId) throw new Error("Could not resolve Appwrite database id.");

  let rolesCollectionId = configuredRolesCollectionId;
  if (!rolesCollectionId) {
    const collections = await db.listCollections(databaseId);
    rolesCollectionId =
      collections.collections.find((row) => row.name === "tenant_roles")?.$id ??
      collections.collections.find((row) => /role/i.test(row.name))?.$id;
  }
  if (!rolesCollectionId) throw new Error("Could not resolve tenant roles collection id.");

  const docs = [];
  let cursor = null;
  while (true) {
    const queries = [sdk.Query.limit(100)];
    if (cursor) queries.push(sdk.Query.cursorAfter(cursor));
    const page = await db.listDocuments(databaseId, rolesCollectionId, queries);
    docs.push(...page.documents);
    if (page.documents.length < 100) break;
    cursor = page.documents[page.documents.length - 1].$id;
  }
  return { docs, databaseId, rolesCollectionId };
}

async function main() {
  const { docs, databaseId, rolesCollectionId } = await listAllRoleDocs();
  const instrutorDocs = docs.filter((doc) => doc.portal_type === "instrutor");
  let updated = 0;

  for (const doc of instrutorDocs) {
    const current = parsePermissions(doc.permissions_json);
    const next = nextInstructorPermissions(current);
    const before = JSON.stringify(current);
    const after = JSON.stringify(next);
    if (before === after) continue;

    await db.updateDocument(databaseId, rolesCollectionId, doc.$id, {
      permissions_json: after,
      updated_at: new Date().toISOString(),
    });
    updated += 1;
    console.log(`updated role ${doc.slug || doc.$id}`);
  }

  console.log(`Done. Updated ${updated} of ${instrutorDocs.length} instrutor roles.`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
