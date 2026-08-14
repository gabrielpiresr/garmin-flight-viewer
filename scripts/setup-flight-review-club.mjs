import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases } from "node-appwrite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env.local");

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

const env = parseEnvFile(envPath);
const ENDPOINT = process.env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY || env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || env.VITE_APPWRITE_DATABASE_ID;
const STUDENT_TRACKS_COL_ID =
  process.env.APPWRITE_STUDENT_TRACKS_COLLECTION_ID || env.VITE_APPWRITE_STUDENT_TRACKS_COL_ID;
const MEMBERSHIPS_COL_ID =
  process.env.APPWRITE_FLIGHT_REVIEW_CLUB_MEMBERSHIPS_COLLECTION_ID ||
  env.VITE_APPWRITE_FLIGHT_REVIEW_CLUB_MEMBERSHIPS_COL_ID ||
  "flight_review_club_memberships";
const TASKS_COL_ID =
  process.env.APPWRITE_FLIGHT_REVIEW_CLUB_TASKS_COLLECTION_ID ||
  env.VITE_APPWRITE_FLIGHT_REVIEW_CLUB_TASKS_COL_ID ||
  "flight_review_club_tasks";

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID || !STUDENT_TRACKS_COL_ID || !MEMBERSHIPS_COL_ID) {
  console.error(
    "Missing env vars. Required: endpoint, project, APPWRITE_API_KEY, database, VITE_APPWRITE_STUDENT_TRACKS_COL_ID",
  );
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attr(label, createFn) {
  try {
    await createFn();
    await sleep(700);
    console.log(`  ✓ ${label}`);
  } catch (error) {
    const msg = error?.message ?? String(error);
    if (msg.toLowerCase().includes("already exists")) {
      console.log(`  • ${label} (already exists)`);
      return;
    }
    if (msg.toLowerCase().includes("maximum number or size of attributes")) {
      console.log(`  ! ${label} (skipped: collection attribute limit reached)`);
      return;
    }
    throw error;
  }
}

async function collection(id, name) {
  try {
    await db.createCollection(DATABASE_ID, id, name, [
      "read(\"label:admin\")",
      "update(\"label:admin\")",
      "delete(\"label:admin\")",
    ], true, true);
    await sleep(700);
    console.log(`  âœ“ collection ${id}`);
  } catch (error) {
    const msg = error?.message ?? String(error);
    if (msg.toLowerCase().includes("already exists")) {
      console.log(`  â€¢ collection ${id} (already exists)`);
      return;
    }
    throw error;
  }
}

async function idx(label, createFn) {
  try {
    await createFn();
    await sleep(700);
    console.log(`  âœ“ ${label}`);
  } catch (error) {
    const msg = error?.message ?? String(error);
    if (msg.toLowerCase().includes("already exists")) {
      console.log(`  â€¢ ${label} (already exists)`);
      return;
    }
    if (msg.toLowerCase().includes("maximum number or size of attributes")) {
      console.log(`  ! ${label} (skipped: collection attribute limit reached)`);
      return;
    }
    throw error;
  }
}

async function main() {
  console.log("Setting up Flight Review Club field on student_training_tracks...");
  console.log(`  Collection: ${STUDENT_TRACKS_COL_ID}`);

  await attr("is_flight_review_club_member (boolean)", () =>
    db.createBooleanAttribute(DATABASE_ID, STUDENT_TRACKS_COL_ID, "is_flight_review_club_member", false),
  );

  console.log("\nSetting up Flight Review Club memberships...");
  console.log(`  Collection: ${MEMBERSHIPS_COL_ID}`);
  await collection(MEMBERSHIPS_COL_ID, "Flight Review Club Memberships");

  const stringAttrs = [
    ["school_id", 64, true],
    ["student_user_id", 64, true],
    ["source", 32, true],
    ["status", 32, true],
    ["plan_id", 64, false],
    ["plan_name", 120, false],
    ["recurrence_key", 32, false],
    ["cakto_offer_id", 255, false],
    ["cakto_subscription_id", 255, false],
    ["proposal_id", 64, false],
    ["next_payment_date", 64, false],
    ["access_until", 64, false],
    ["canceled_at", 64, false],
    ["ended_at", 64, false],
    ["last_payment_at", 64, false],
    ["last_event_at", 64, false],
    ["created_at", 64, true],
    ["updated_at", 64, true],
    ["metadata_json", 8192, false],
  ];
  for (const [key, size, required] of stringAttrs) {
    await attr(`${key} (string ${size})`, () => db.createStringAttribute(DATABASE_ID, MEMBERSHIPS_COL_ID, key, size, required));
  }
  await attr("recurrence_period_days (integer)", () =>
    db.createIntegerAttribute(DATABASE_ID, MEMBERSHIPS_COL_ID, "recurrence_period_days", false, 0),
  );
  await attr("current_period (integer)", () =>
    db.createIntegerAttribute(DATABASE_ID, MEMBERSHIPS_COL_ID, "current_period", false, 0),
  );
  await attr("paid_payments_quantity (integer)", () =>
    db.createIntegerAttribute(DATABASE_ID, MEMBERSHIPS_COL_ID, "paid_payments_quantity", false, 0),
  );
  await attr("amount (float)", () =>
    db.createFloatAttribute(DATABASE_ID, MEMBERSHIPS_COL_ID, "amount", false, 0),
  );
  await attr("cancel_at_period_end (boolean)", () =>
    db.createBooleanAttribute(DATABASE_ID, MEMBERSHIPS_COL_ID, "cancel_at_period_end", false, false),
  );

  await idx("frc_memberships_student_idx", () =>
    db.createIndex(DATABASE_ID, MEMBERSHIPS_COL_ID, "frc_memberships_student_idx", "key", ["school_id", "student_user_id"], ["ASC", "ASC"]),
  );
  await idx("frc_memberships_subscription_idx", () =>
    db.createIndex(DATABASE_ID, MEMBERSHIPS_COL_ID, "frc_memberships_subscription_idx", "key", ["cakto_subscription_id"], ["ASC"]),
  );
  await idx("frc_memberships_offer_idx", () =>
    db.createIndex(DATABASE_ID, MEMBERSHIPS_COL_ID, "frc_memberships_offer_idx", "key", ["cakto_offer_id"], ["ASC"]),
  );
  await idx("frc_memberships_status_idx", () =>
    db.createIndex(DATABASE_ID, MEMBERSHIPS_COL_ID, "frc_memberships_status_idx", "key", ["status"], ["ASC"]),
  );

  console.log("\nSetting up Flight Review Club manual tasks...");
  console.log(`  Collection: ${TASKS_COL_ID}`);
  await collection(TASKS_COL_ID, "Flight Review Club Tasks");

  const taskStringAttrs = [
    ["school_id", 64, true],
    ["membership_id", 64, true],
    ["student_user_id", 64, true],
    ["template_item_id", 64, true],
    ["title", 140, true],
    ["description", 500, false],
    ["status", 32, true],
    ["assigned_to_user_id", 64, false],
    ["due_at", 64, false],
    ["completed_at", 64, false],
    ["notes", 2048, false],
    ["history_json", 8192, false],
    ["created_at", 64, true],
    ["updated_at", 64, true],
  ];
  for (const [key, size, required] of taskStringAttrs) {
    await attr(`task.${key} (string ${size})`, () => db.createStringAttribute(DATABASE_ID, TASKS_COL_ID, key, size, required));
  }
  await attr("task.sort_order (integer)", () =>
    db.createIntegerAttribute(DATABASE_ID, TASKS_COL_ID, "sort_order", false, 0),
  );
  await idx("frc_tasks_membership_idx", () =>
    db.createIndex(DATABASE_ID, TASKS_COL_ID, "frc_tasks_membership_idx", "key", ["school_id", "membership_id"], ["ASC", "ASC"]),
  );
  await idx("frc_tasks_student_idx", () =>
    db.createIndex(DATABASE_ID, TASKS_COL_ID, "frc_tasks_student_idx", "key", ["student_user_id"], ["ASC"]),
  );
  await idx("frc_tasks_status_idx", () =>
    db.createIndex(DATABASE_ID, TASKS_COL_ID, "frc_tasks_status_idx", "key", ["status"], ["ASC"]),
  );

  console.log("\nDone.");
}

main().catch((e) => {
  console.error("Error:", e?.message ?? e);
  process.exit(1);
});
