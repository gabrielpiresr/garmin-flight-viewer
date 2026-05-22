import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases, Permission, Query, Role } from "node-appwrite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env.local");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const entries = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    entries[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return entries;
}

function upsertEnvLine(filePath, key, value) {
  const lines = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8").split(/\r?\n/) : [];
  const nextLine = `${key}=${value}`;
  const index = lines.findIndex((line) => line.startsWith(`${key}=`));
  if (index >= 0) lines[index] = nextLine;
  else {
    if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
    lines.push(nextLine);
  }
  fs.writeFileSync(filePath, lines.join("\n"));
}

const env = parseEnvFile(envPath);
const ENDPOINT = process.env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY || env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || env.VITE_APPWRITE_DATABASE_ID;
const SIGNATURES_COL_ID =
  process.env.APPWRITE_FLIGHT_SIGNATURES_COLLECTION_ID ||
  process.env.APPWRITE_FLIGHT_SIGNATURES_COL_ID ||
  env.VITE_APPWRITE_FLIGHT_SIGNATURES_COL_ID ||
  "flight_signatures";
const AUDIT_EVENTS_COL_ID =
  process.env.APPWRITE_AUDIT_EVENTS_COLLECTION_ID ||
  process.env.APPWRITE_AUDIT_EVENTS_COL_ID ||
  env.VITE_APPWRITE_AUDIT_EVENTS_COL_ID ||
  "audit_events";

const missing = [];
if (!ENDPOINT) missing.push("VITE_APPWRITE_ENDPOINT");
if (!PROJECT_ID) missing.push("VITE_APPWRITE_PROJECT_ID");
if (!API_KEY) missing.push("APPWRITE_API_KEY");
if (!DATABASE_ID) missing.push("VITE_APPWRITE_DATABASE_ID");
if (missing.length) throw new Error(`Missing required values: ${missing.join(", ")}`);

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const AUDIT_PERMS = [
  Permission.read(Role.label("admin")),
  Permission.create(Role.label("admin")),
];

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureCollection(name, preferredId, permissions) {
  try {
    const byId = await db.getCollection(DATABASE_ID, preferredId);
    await db.updateCollection(DATABASE_ID, byId.$id, name, permissions, true, true);
    console.log(`collection ok ${name} (${byId.$id})`);
    return byId.$id;
  } catch (error) {
    if (error?.code !== 404) throw error;
    const collections = await db.listCollections(DATABASE_ID, [Query.limit(100)]);
    const found = collections.collections.find((collection) => collection.name === name);
    if (found) {
      await db.updateCollection(DATABASE_ID, found.$id, name, permissions, true, true);
      console.log(`collection ok ${name} (${found.$id})`);
      return found.$id;
    }
  }
  const created = await db.createCollection(DATABASE_ID, preferredId, name, permissions, true, true);
  console.log(`collection created ${name} (${created.$id})`);
  return created.$id;
}

async function attr(createFn, label) {
  try {
    await createFn();
    await sleep(500);
    console.log(`  + ${label}`);
  } catch (error) {
    const message = error?.message ?? String(error);
    if (error?.code === 409 || /already exists|duplicate/i.test(message)) {
      console.log(`  - ${label} already exists`);
      return;
    }
    throw error;
  }
}

async function idx(collectionId, key, attributes, orders = ["ASC"]) {
  try {
    await db.createIndex(DATABASE_ID, collectionId, key, "key", attributes, orders);
    await sleep(500);
    console.log(`  + index ${key}`);
  } catch (error) {
    const message = error?.message ?? String(error);
    if (error?.code === 409 || /already exists|duplicate/i.test(message)) {
      console.log(`  - index ${key} already exists`);
      return;
    }
    throw error;
  }
}

async function patchExistingSignatureStatuses() {
  let cursor = null;
  let updated = 0;
  while (true) {
    const queries = [Query.limit(100)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const page = await db.listDocuments(DATABASE_ID, SIGNATURES_COL_ID, queries);
    for (const doc of page.documents) {
      if (!doc.status) {
        await db.updateDocument(DATABASE_ID, SIGNATURES_COL_ID, doc.$id, { status: "active" });
        updated += 1;
      }
    }
    if (page.documents.length < 100) break;
    cursor = page.documents[page.documents.length - 1].$id;
  }
  console.log(`signature status backfill updated ${updated}`);
}

console.log("=== EDB audit setup ===");
const auditCol = await ensureCollection("audit_events", AUDIT_EVENTS_COL_ID, AUDIT_PERMS);
await attr(() => db.createStringAttribute(DATABASE_ID, auditCol, "event_type", 64, true), "audit.event_type");
await attr(() => db.createStringAttribute(DATABASE_ID, auditCol, "entity_type", 64, true), "audit.entity_type");
await attr(() => db.createStringAttribute(DATABASE_ID, auditCol, "entity_id", 128, true), "audit.entity_id");
await attr(() => db.createStringAttribute(DATABASE_ID, auditCol, "actor_user_id", 64, true), "audit.actor_user_id");
await attr(() => db.createStringAttribute(DATABASE_ID, auditCol, "actor_role", 32, false), "audit.actor_role");
await attr(() => db.createStringAttribute(DATABASE_ID, auditCol, "school_id", 64, true), "audit.school_id");
await attr(() => db.createStringAttribute(DATABASE_ID, auditCol, "occurred_at", 32, true), "audit.occurred_at");
await attr(() => db.createStringAttribute(DATABASE_ID, auditCol, "ip", 128, false), "audit.ip");
await attr(() => db.createStringAttribute(DATABASE_ID, auditCol, "user_agent", 512, false), "audit.user_agent");
await attr(() => db.createStringAttribute(DATABASE_ID, auditCol, "reason", 2048, false), "audit.reason");
await attr(() => db.createStringAttribute(DATABASE_ID, auditCol, "before_snapshot_json", 65535, false), "audit.before_snapshot_json");
await attr(() => db.createStringAttribute(DATABASE_ID, auditCol, "after_snapshot_json", 65535, false), "audit.after_snapshot_json");
await attr(() => db.createStringAttribute(DATABASE_ID, auditCol, "before_hash", 64, false), "audit.before_hash");
await attr(() => db.createStringAttribute(DATABASE_ID, auditCol, "after_hash", 64, false), "audit.after_hash");
await attr(() => db.createStringAttribute(DATABASE_ID, auditCol, "event_hash", 64, true), "audit.event_hash");
await idx(auditCol, "audit_entity_idx", ["entity_type", "entity_id"]);
await idx(auditCol, "audit_event_type_idx", ["event_type"]);
await idx(auditCol, "audit_occurred_idx", ["occurred_at"], ["DESC"]);

console.log("Updating flight_signatures...");
await attr(() => db.createStringAttribute(DATABASE_ID, SIGNATURES_COL_ID, "invalidated_at", 32, false), "signature.invalidated_at");
await attr(() => db.createStringAttribute(DATABASE_ID, SIGNATURES_COL_ID, "invalidated_by", 64, false), "signature.invalidated_by");
await attr(() => db.createStringAttribute(DATABASE_ID, SIGNATURES_COL_ID, "invalidation_reason", 2048, false), "signature.invalidation_reason");
await attr(() => db.createStringAttribute(DATABASE_ID, SIGNATURES_COL_ID, "invalidated_by_event_id", 64, false), "signature.invalidated_by_event_id");
await attr(() => db.createStringAttribute(DATABASE_ID, SIGNATURES_COL_ID, "status", 16, false), "signature.status");
await idx(SIGNATURES_COL_ID, "idx_flight_role_status", ["flight_id", "signer_role", "status"], ["ASC", "ASC", "ASC"]);
await patchExistingSignatureStatuses();

upsertEnvLine(envPath, "VITE_APPWRITE_AUDIT_EVENTS_COL_ID", auditCol);
console.log("Done. VITE_APPWRITE_AUDIT_EVENTS_COL_ID updated.");
