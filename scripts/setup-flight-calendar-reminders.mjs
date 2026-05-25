import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases, Query } from "node-appwrite";

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
const ENDPOINT = process.env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT || "https://sfo.cloud.appwrite.io/v1";
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID || "6a01ac8a0009fbf94f05";
const API_KEY = process.env.APPWRITE_API_KEY || env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || env.VITE_APPWRITE_DATABASE_ID;
const FLIGHTS_COLLECTION_ID = process.env.APPWRITE_FLIGHTS_COLLECTION_ID || env.VITE_APPWRITE_COLLECTION_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID || !FLIGHTS_COLLECTION_ID) {
  console.error("Missing Appwrite config. Required: endpoint, project, API key, database id and flights collection id.");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);
const existingAttributes = new Set();
const existingIndexes = new Set();

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attr(createFn, label) {
  if (existingAttributes.has(label)) {
    console.log(`  exists  ${label}`);
    return;
  }
  try {
    await createFn();
    await sleep(700);
    console.log(`  created ${label}`);
  } catch (error) {
    const message = error?.message ?? String(error);
    if (message.toLowerCase().includes("already exists")) {
      console.log(`  exists  ${label}`);
      return;
    }
    throw error;
  }
}

async function idx(key, attributes, orders = ["ASC"]) {
  if (existingIndexes.has(key)) {
    console.log(`  exists  index ${key}`);
    return;
  }
  try {
    await db.createIndex(DATABASE_ID, FLIGHTS_COLLECTION_ID, key, "key", attributes, orders);
    await sleep(700);
    console.log(`  created index ${key}`);
  } catch (error) {
    const message = error?.message ?? String(error);
    if (message.toLowerCase().includes("already exists")) {
      console.log(`  exists  index ${key}`);
      return;
    }
    throw error;
  }
}

console.log("Configuring flight Google Calendar/reminder fields...");
const attributes = await db.listAttributes(DATABASE_ID, FLIGHTS_COLLECTION_ID, [Query.limit(100)]);
for (const attribute of attributes.attributes || []) existingAttributes.add(attribute.key);

const indexes = await db.listIndexes(DATABASE_ID, FLIGHTS_COLLECTION_ID, [Query.limit(100)]);
for (const index of indexes.indexes || []) existingIndexes.add(index.key);

await attr(
  () => db.createStringAttribute(DATABASE_ID, FLIGHTS_COLLECTION_ID, "google_calendar_event_id", 255, false),
  "google_calendar_event_id",
);
await attr(
  () => db.createStringAttribute(DATABASE_ID, FLIGHTS_COLLECTION_ID, "google_calendar_synced_at", 64, false),
  "google_calendar_synced_at",
);
await attr(
  () => db.createStringAttribute(DATABASE_ID, FLIGHTS_COLLECTION_ID, "google_calendar_sync_status", 16, false),
  "google_calendar_sync_status",
);
await attr(
  () => db.createStringAttribute(DATABASE_ID, FLIGHTS_COLLECTION_ID, "google_calendar_error", 1024, false),
  "google_calendar_error",
);
await attr(
  () => db.createStringAttribute(DATABASE_ID, FLIGHTS_COLLECTION_ID, "reminder_24h_sent_at", 64, false),
  "reminder_24h_sent_at",
);
await idx("flights_calendar_status_idx", ["google_calendar_sync_status"]);
await idx("flights_reminder_24h_idx", ["flight_status", "flight_date", "reminder_24h_sent_at"], ["ASC", "ASC", "ASC"]);
console.log("Flight Calendar/reminder fields are ready.");
