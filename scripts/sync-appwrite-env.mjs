import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases, Query, Storage } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("Missing APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY or APPWRITE_DATABASE_ID.");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");

const collectionEnvByName = {
  flights: "VITE_APPWRITE_COLLECTION_ID",
  profiles: "VITE_APPWRITE_PROFILES_COLLECTION_ID",
  aircraft_models: "VITE_APPWRITE_AIRCRAFT_MODELS_COL_ID",
  aircrafts: "VITE_APPWRITE_AIRCRAFTS_COL_ID",
  aircraft_model_maintenance_rules: "VITE_APPWRITE_MAINTENANCE_RULES_COL_ID",
  maintenance_program_items: "VITE_APPWRITE_MAINTENANCE_PROGRAM_ITEMS_COL_ID",
  maintenance_work_orders: "VITE_APPWRITE_MAINTENANCE_WORK_ORDERS_COL_ID",
  maintenance_attachments: "VITE_APPWRITE_MAINTENANCE_ATTACHMENTS_COL_ID",
  aircraft_operational_weeks: "VITE_APPWRITE_OP_WEEKS_COL_ID",
  aircraft_operational_daily_caps: "VITE_APPWRITE_DAILY_CAPS_COL_ID",
  aircraft_operational_group_caps: "VITE_APPWRITE_GROUP_CAPS_COL_ID",
  aircraft_operational_group_cap_days: "VITE_APPWRITE_GROUP_CAP_DAYS_COL_ID",
  aircraft_operational_slots: "VITE_APPWRITE_OP_SLOTS_COL_ID",
  weekly_flight_plans: "VITE_APPWRITE_WEEKLY_PLANS_COL_ID",
  weekly_flight_plan_items: "VITE_APPWRITE_WEEKLY_PLAN_ITEMS_COL_ID",
  weekly_flight_plan_availability: "VITE_APPWRITE_WEEKLY_PLAN_AVAIL_COL_ID",
  instructor_preferences: "VITE_APPWRITE_INSTRUCTOR_PREFS_COL_ID",
  student_credits: "VITE_APPWRITE_STUDENT_CREDITS_COL_ID",
  flight_telemetry_summaries: "VITE_APPWRITE_FLIGHT_TELEMETRY_SUMMARIES_COL_ID",
  flight_landings: "VITE_APPWRITE_FLIGHT_LANDINGS_COL_ID",
  flight_takeoffs: "VITE_APPWRITE_FLIGHT_TAKEOFFS_COL_ID",
  telemetry_alert_rules: "VITE_APPWRITE_TELEMETRY_ALERT_RULES_COL_ID",
  flight_telemetry_alerts: "VITE_APPWRITE_FLIGHT_TELEMETRY_ALERTS_COL_ID",
  maneuver_sections: "VITE_APPWRITE_MANEUVERS_SECTIONS_COL_ID",
  maneuver_subsections: "VITE_APPWRITE_MANEUVERS_SUBSECTIONS_COL_ID",
  maneuver_articles: "VITE_APPWRITE_MANEUVERS_ARTICLES_COL_ID",
  help_sections: "VITE_APPWRITE_HELP_SECTIONS_COL_ID",
  help_subsections: "VITE_APPWRITE_HELP_SUBSECTIONS_COL_ID",
  help_articles: "VITE_APPWRITE_HELP_ARTICLES_COL_ID",
  platform_settings: "VITE_APPWRITE_PLATFORM_SETTINGS_COL_ID",
  push_subscriptions: "VITE_APPWRITE_PUSH_SUBSCRIPTIONS_COL_ID",
  notification_deliveries: "VITE_APPWRITE_NOTIFICATION_DELIVERIES_COL_ID",
  notices: "VITE_APPWRITE_NOTICES_COL_ID",
  training_exercises: "VITE_APPWRITE_TRAINING_EXERCISES_COL_ID",
};

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

function writeEnv(filePath, entries) {
  const lines = Object.entries(entries)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${value}`);
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

async function listAllCollections(databases) {
  const collections = [];
  let offset = 0;
  while (true) {
    const page = await databases.listCollections(DATABASE_ID, [Query.limit(100), Query.offset(offset)]);
    collections.push(...(page.collections || []));
    if (!page.collections || page.collections.length < 100 || collections.length >= (page.total || 0)) break;
    offset += 100;
  }
  return collections;
}

async function findBucketId(storage, name) {
  try {
    const buckets = await storage.listBuckets();
    return buckets.buckets.find((bucket) => bucket.name === name || bucket.$id === name)?.$id || "";
  } catch {
    return "";
  }
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);
const storage = new Storage(client);

const env = {
  ...parseEnvFile(envPath),
  VITE_APPWRITE_ENDPOINT: ENDPOINT,
  VITE_APPWRITE_PROJECT_ID: PROJECT_ID,
  VITE_APPWRITE_DATABASE_ID: DATABASE_ID,
  VITE_SCHOOL_ID: process.env.VITE_SCHOOL_ID || process.env.SCHOOL_ID || "escola_principal",
};

const collections = await listAllCollections(databases);
for (const collection of collections) {
  const key = collectionEnvByName[collection.name] || collectionEnvByName[collection.$id];
  if (key) env[key] = collection.$id;
}

const maneuversBucketId = await findBucketId(storage, "maneuver-media");
if (maneuversBucketId) env.VITE_APPWRITE_MANEUVERS_MEDIA_BUCKET_ID = maneuversBucketId;
const helpBucketId = await findBucketId(storage, "help-media");
if (helpBucketId) env.VITE_APPWRITE_HELP_MEDIA_BUCKET_ID = helpBucketId;

writeEnv(envPath, env);
console.log(`Synced ${collections.length} collections to .env.local.`);
