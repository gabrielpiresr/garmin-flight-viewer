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

async function setupPlatformSettings() {
  console.log("\n[1/3] platform_settings...");
  const col = await ensureCollection("platform_settings", ADMIN_PERMS);
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "key", 64, true), "key");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "settings_json", 16384, false), "settings_json");
  await idx(id, "platform_settings_key_idx", ["key"]);
  return id;
}

async function setupPushSubscriptions() {
  console.log("\n[2/3] push_subscriptions...");
  const col = await ensureCollection("push_subscriptions", ADMIN_PERMS);
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "user_id", 64, true), "user_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "endpoint", 768, true), "endpoint");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "endpoint_hash", 64, true), "endpoint_hash");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "keys_json", 4096, true), "keys_json");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "user_agent", 512, false), "user_agent");
  await attr(() => db.createBooleanAttribute(DATABASE_ID, id, "enabled", true), "enabled");
  await attr(() => db.createDatetimeAttribute(DATABASE_ID, id, "last_seen_at", false), "last_seen_at");
  await idx(id, "push_sub_user_idx", ["user_id"]);
  await idx(id, "push_sub_endpoint_hash_idx", ["endpoint_hash"]);
  return id;
}

async function setupNotificationDeliveries() {
  console.log("\n[3/3] notification_deliveries...");
  const col = await ensureCollection("notification_deliveries", ADMIN_PERMS);
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "event_type", 64, true), "event_type");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "channel", 16, true), "channel");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "recipient_user_id", 64, true), "recipient_user_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "dedupe_key", 255, true), "dedupe_key");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "status", 16, true), "status");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "provider_message_id", 255, false), "provider_message_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "error", 2048, false), "error");
  await attr(() => db.createDatetimeAttribute(DATABASE_ID, id, "created_at", true), "created_at");
  await idx(id, "notif_delivery_dedupe_idx", ["dedupe_key", "channel", "recipient_user_id"]);
  await idx(id, "notif_delivery_recipient_idx", ["recipient_user_id"]);
  await idx(id, "notif_delivery_created_idx", ["created_at"], ["DESC"]);
  return id;
}

async function main() {
  console.log("=== Appwrite Notifications Setup ===");
  console.log(`Database: ${DATABASE_ID}\n`);

  const platformSettingsId = await setupPlatformSettings();
  const pushSubscriptionsId = await setupPushSubscriptions();
  const notificationDeliveriesId = await setupNotificationDeliveries();

  console.log("\n=== Setup Complete ===");
  console.log("Add these to your .env.local:\n");
  console.log(`VITE_APPWRITE_PLATFORM_SETTINGS_COL_ID=${platformSettingsId}`);
  console.log(`VITE_APPWRITE_PUSH_SUBSCRIPTIONS_COL_ID=${pushSubscriptionsId}`);
  console.log(`VITE_APPWRITE_NOTIFICATION_DELIVERIES_COL_ID=${notificationDeliveriesId}`);
  console.log("VITE_WEB_PUSH_PUBLIC_KEY=<vapid_public_key>");
}

main().catch((error) => {
  console.error("Setup failed:", error?.message ?? error);
  process.exit(1);
});
