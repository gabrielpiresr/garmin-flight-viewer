import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases, Query } from "node-appwrite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env.local");
const META_PREFIX = "#GFV_META_V1:";

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const entries = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    entries[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return entries;
}

const fileEnv = parseEnvFile(envPath);
const env = (key, fallbackKey) => process.env[key] || fileEnv[key] || (fallbackKey ? fileEnv[fallbackKey] : undefined);

const ENDPOINT = env("APPWRITE_ENDPOINT", "VITE_APPWRITE_ENDPOINT");
const PROJECT_ID = env("APPWRITE_PROJECT_ID", "VITE_APPWRITE_PROJECT_ID");
const API_KEY = process.env.APPWRITE_API_KEY || fileEnv.APPWRITE_API_KEY;
const DATABASE_ID = env("APPWRITE_DATABASE_ID", "VITE_APPWRITE_DATABASE_ID");
const SCHOOL_ID = process.env.SCHOOL_ID || fileEnv.VITE_SCHOOL_ID || "escola_principal";

const COLLECTIONS = {
  flights: env("APPWRITE_FLIGHTS_COLLECTION_ID", "VITE_APPWRITE_COLLECTION_ID"),
  profiles: env("APPWRITE_PROFILES_COLLECTION_ID", "VITE_APPWRITE_PROFILES_COLLECTION_ID"),
  instructorPrefs: env("APPWRITE_INSTRUCTOR_PREFS_COLLECTION_ID", "VITE_APPWRITE_INSTRUCTOR_PREFS_COL_ID"),
  weeklyPlans: env("APPWRITE_WEEKLY_PLANS_COLLECTION_ID", "VITE_APPWRITE_WEEKLY_PLANS_COL_ID"),
  operationalWeeks: env("APPWRITE_OP_WEEKS_COLLECTION_ID", "VITE_APPWRITE_OP_WEEKS_COL_ID"),
  flightVideos: env("APPWRITE_VIDEOS_COLLECTION_ID", "VITE_APPWRITE_VIDEOS_COLLECTION_ID"),
  maneuverSections: env("APPWRITE_MANEUVERS_SECTIONS_COLLECTION_ID", "VITE_APPWRITE_MANEUVERS_SECTIONS_COL_ID"),
  maneuverSubsections: env("APPWRITE_MANEUVERS_SUBSECTIONS_COLLECTION_ID", "VITE_APPWRITE_MANEUVERS_SUBSECTIONS_COL_ID"),
  maneuverArticles: env("APPWRITE_MANEUVERS_ARTICLES_COLLECTION_ID", "VITE_APPWRITE_MANEUVERS_ARTICLES_COL_ID"),
  helpSections: env("APPWRITE_HELP_SECTIONS_COLLECTION_ID", "VITE_APPWRITE_HELP_SECTIONS_COL_ID"),
  helpSubsections: env("APPWRITE_HELP_SUBSECTIONS_COLLECTION_ID", "VITE_APPWRITE_HELP_SUBSECTIONS_COL_ID"),
  helpArticles: env("APPWRITE_HELP_ARTICLES_COLLECTION_ID", "VITE_APPWRITE_HELP_ARTICLES_COL_ID"),
};

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID || !COLLECTIONS.flights) {
  console.error("Missing required env: Appwrite endpoint/project/database/flights collection and APPWRITE_API_KEY.");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNotFound(err) {
  const message = String(err?.message || "").toLowerCase();
  return err?.code === 404 || message.includes("could not be found") || message.includes("not found");
}

function isAlreadyExists(err) {
  const message = String(err?.message || "").toLowerCase();
  return err?.code === 409 || message.includes("already exists") || message.includes("already in use");
}

async function waitForAttribute(collectionId, key, label, maxWaitMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const attr = await db.getAttribute(DATABASE_ID, collectionId, key);
    if (attr.status === "available") return attr;
    if (attr.status === "failed") throw new Error(`${label}.${key} failed`);
    await sleep(2500);
  }
  throw new Error(`${label}.${key} did not become available`);
}

async function ensureStringAttribute(collectionId, label, key, size) {
  if (!collectionId) return false;
  try {
    const attr = await db.getAttribute(DATABASE_ID, collectionId, key);
    if (attr.status !== "available") await waitForAttribute(collectionId, key, label);
    console.log(`[attr] ${label}.${key} available`);
    return false;
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }

  try {
    await db.createStringAttribute(DATABASE_ID, collectionId, key, size, false);
    await waitForAttribute(collectionId, key, label);
    console.log(`[attr] ${label}.${key} created`);
    return true;
  } catch (err) {
    if (!isAlreadyExists(err)) throw err;
    await waitForAttribute(collectionId, key, label);
    console.log(`[attr] ${label}.${key} available`);
    return false;
  }
}

async function waitForIndex(collectionId, key, label, maxWaitMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const index = await db.getIndex(DATABASE_ID, collectionId, key);
    if (index.status === "available") return index;
    if (index.status === "failed") throw new Error(`${label}.${key} failed`);
    await sleep(3000);
  }
  throw new Error(`${label}.${key} did not become available`);
}

async function ensureIndex(collectionId, label, key, attributes, orders = attributes.map(() => "ASC")) {
  if (!collectionId) return { key, status: "skipped" };
  try {
    const index = await db.getIndex(DATABASE_ID, collectionId, key);
    if (index.status !== "available") await waitForIndex(collectionId, key, label);
    console.log(`[idx] ${label}.${key} available`);
    return { key, status: "available" };
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }

  try {
    await db.createIndex(DATABASE_ID, collectionId, key, "key", attributes, orders);
    await waitForIndex(collectionId, key, label);
    console.log(`[idx] ${label}.${key} created`);
    return { key, status: "created" };
  } catch (err) {
    if (isAlreadyExists(err)) {
      await waitForIndex(collectionId, key, label);
      console.log(`[idx] ${label}.${key} available`);
      return { key, status: "available" };
    }
    console.warn(`[idx] ${label}.${key} skipped: ${err.message}`);
    return { key, status: "skipped", reason: err.message };
  }
}

function decodeFlightMeta(csvText) {
  const firstLine = String(csvText || "").replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0]?.trim() || "";
  if (!firstLine.startsWith(META_PREFIX)) return null;
  try {
    return JSON.parse(Buffer.from(firstLine.slice(META_PREFIX.length).trim(), "base64").toString("utf8"));
  } catch {
    return null;
  }
}

async function backfillFlightScheduleFields() {
  const collectionId = COLLECTIONS.flights;
  let offset = 0;
  const limit = 25;
  let updated = 0;
  let skipped = 0;

  while (true) {
    const page = await db.listDocuments(DATABASE_ID, collectionId, [
      Query.select(["$id", "csv_text", "schedule_week_start", "schedule_demand_id"]),
      Query.equal("school_id", [SCHOOL_ID]),
      Query.limit(limit),
      Query.offset(offset),
    ]);
    if (!page.documents.length) break;

    for (const doc of page.documents) {
      if (doc.schedule_week_start && doc.schedule_demand_id) {
        skipped++;
        continue;
      }
      const meta = decodeFlightMeta(doc.csv_text);
      const demandId = meta?.schedule?.demandId || null;
      if (!demandId) {
        skipped++;
        continue;
      }
      await db.updateDocument(DATABASE_ID, collectionId, doc.$id, {
        schedule_week_start: meta.schedule?.weekStart || null,
        schedule_demand_id: demandId,
      });
      updated++;
    }

    offset += page.documents.length;
    if (page.documents.length < limit) break;
    await sleep(250);
  }

  console.log(`[backfill] flights schedule fields: ${updated} updated, ${skipped} skipped`);
}

async function main() {
  console.log(`Setting up performance indexes for project ${PROJECT_ID}`);

  await ensureStringAttribute(COLLECTIONS.flights, "flights", "schedule_week_start", 16);
  await ensureStringAttribute(COLLECTIONS.flights, "flights", "schedule_demand_id", 64);

  const indexTasks = [
    [COLLECTIONS.flights, "flights", "flights_source_filename_idx", ["source_filename"]],
    [COLLECTIONS.flights, "flights", "flights_school_student_date_time_idx", ["school_id", "student_user_id", "flight_date", "start_time"], ["ASC", "ASC", "DESC", "DESC"]],
    [COLLECTIONS.flights, "flights", "flights_school_inva_date_time_idx", ["school_id", "instructor_user_id", "flight_date", "start_time"], ["ASC", "ASC", "DESC", "DESC"]],
    [COLLECTIONS.flights, "flights", "flights_school_date_time_idx", ["school_id", "flight_date", "start_time"], ["ASC", "DESC", "DESC"]],
    [COLLECTIONS.flights, "flights", "flights_schedule_week_idx", ["school_id", "schedule_week_start"]],
    [COLLECTIONS.profiles, "profiles", "profiles_school_role_idx", ["school_id", "role"]],
    [COLLECTIONS.instructorPrefs, "instructor_prefs", "instructor_prefs_school_user_idx", ["school_id", "user_id"]],
    [COLLECTIONS.weeklyPlans, "weekly_plans", "weekly_student_status_week_idx", ["school_id", "student_id", "status", "week_start"], ["ASC", "ASC", "ASC", "DESC"]],
    [COLLECTIONS.operationalWeeks, "operational_weeks", "opweek_open_week_idx", ["is_open_for_requests", "week_start"], ["ASC", "DESC"]],
    [COLLECTIONS.flightVideos, "flight_videos", "flight_videos_flight_created_idx", ["flight_id", "created_at"], ["ASC", "DESC"]],
    [COLLECTIONS.maneuverSections, "maneuver_sections", "maneuver_sections_pub_order_idx", ["school_id", "is_published", "order"]],
    [COLLECTIONS.maneuverSubsections, "maneuver_subsections", "man_subsections_pub_order_idx", ["school_id", "is_published", "order"]],
    [COLLECTIONS.maneuverArticles, "maneuver_articles", "maneuver_articles_pub_order_idx", ["school_id", "is_published", "order"]],
    [COLLECTIONS.helpSections, "help_sections", "help_sections_pub_order_idx", ["school_id", "is_published", "order"]],
    [COLLECTIONS.helpSubsections, "help_subsections", "help_subsections_pub_order_idx", ["school_id", "is_published", "order"]],
    [COLLECTIONS.helpArticles, "help_articles", "help_articles_pub_order_idx", ["school_id", "is_published", "order"]],
  ];

  const results = [];
  for (const [collectionId, label, key, attributes, orders] of indexTasks) {
    results.push(await ensureIndex(collectionId, label, key, attributes, orders));
    await sleep(500);
  }

  await backfillFlightScheduleFields();

  const available = results.filter((item) => item.status === "available" || item.status === "created").length;
  const skipped = results.filter((item) => item.status === "skipped").length;
  console.log(`Done. ${available} indexes available, ${skipped} skipped.`);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
