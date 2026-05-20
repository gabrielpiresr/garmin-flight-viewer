import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases, ID, Permission, Role } from "node-appwrite";

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

const env = parseEnvFile(envPath);
const ENDPOINT = process.env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY || env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || env.VITE_APPWRITE_DATABASE_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("Missing env vars. Required: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const ADMIN_PERMS = [
  Permission.read(Role.label("admin")),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureCollection(name, perms) {
  const list = await db.listCollections(DATABASE_ID);
  const found = list.collections.find((collection) => collection.name === name);
  if (found) {
    console.log(`  • Collection "${name}" already exists (${found.$id})`);
    return found;
  }
  const col = await db.createCollection(DATABASE_ID, ID.unique(), name, perms, true, true);
  console.log(`  ✓ Created collection "${name}" (${col.$id})`);
  return col;
}

async function attr(createFn, label) {
  try {
    await createFn();
    await sleep(700);
    console.log(`     ✓ ${label}`);
  } catch (error) {
    const msg = error?.message ?? String(error);
    if (msg.toLowerCase().includes("already exists")) {
      console.log(`     • ${label} (already exists)`);
      return;
    }
    throw error;
  }
}

async function idx(colId, key, attributes, orders = ["ASC"], type = "key") {
  try {
    await db.createIndex(DATABASE_ID, colId, key, type, attributes, orders);
    await sleep(700);
    console.log(`     ✓ index ${key}`);
  } catch (error) {
    const msg = error?.message ?? String(error);
    if (msg.toLowerCase().includes("already exists")) {
      console.log(`     • index ${key} (already exists)`);
      return;
    }
    throw error;
  }
}

async function setupBroadcastSegments() {
  console.log("\n[1/2] broadcast_segments...");
  const col = await ensureCollection("broadcast_segments", ADMIN_PERMS);
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "name", 128, true), "name");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "description", 512, false), "description");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "resend_audience_id", 64, false), "resend_audience_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "recipient_filter_json", 2048, false), "recipient_filter_json");
  await attr(() => db.createIntegerAttribute(DATABASE_ID, id, "member_count", false), "member_count");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "created_by", 36, false), "created_by");
  await idx(id, "broadcast_seg_created_idx", ["$createdAt"], ["DESC"]);
  return id;
}

async function setupBroadcastMessages() {
  console.log("\n[2/2] broadcast_messages...");
  const col = await ensureCollection("broadcast_messages", ADMIN_PERMS);
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "segment_id", 36, false), "segment_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "segment_name", 128, false), "segment_name");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "resend_broadcast_id", 64, false), "resend_broadcast_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "subject", 255, true), "subject");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "body_html", 65535, true), "body_html");
  await attr(() => db.createDatetimeAttribute(DATABASE_ID, id, "sent_at", false), "sent_at");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "sent_by", 36, false), "sent_by");
  await attr(() => db.createIntegerAttribute(DATABASE_ID, id, "recipient_count", false), "recipient_count");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "status", 16, false), "status");
  await idx(id, "broadcast_msg_sent_idx", ["sent_at"], ["DESC"]);
  await idx(id, "broadcast_msg_seg_idx", ["segment_id"]);
  return id;
}

async function main() {
  console.log("=== Appwrite Broadcast Collections Setup ===");
  console.log(`Database: ${DATABASE_ID}\n`);

  const segmentsId = await setupBroadcastSegments();
  const messagesId = await setupBroadcastMessages();

  console.log("\n=== Setup Complete ===");
  console.log("Add these to your .env.local:\n");
  console.log(`VITE_APPWRITE_BROADCAST_SEGMENTS_COL_ID=${segmentsId}`);
  console.log(`VITE_APPWRITE_BROADCAST_MESSAGES_COL_ID=${messagesId}`);
  console.log("\nAdd these to the Appwrite Function environment (admin-users):\n");
  console.log(`APPWRITE_BROADCAST_SEGMENTS_COLLECTION_ID=${segmentsId}`);
  console.log(`APPWRITE_BROADCAST_MESSAGES_COLLECTION_ID=${messagesId}`);
}

main().catch((error) => {
  console.error("Setup failed:", error?.message ?? error);
  process.exit(1);
});
