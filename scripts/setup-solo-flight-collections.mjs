/**
 * Script: setup-solo-flight-collections.mjs
 * Cria colecoes para fluxo de aprovacao de voo solo.
 * Uso: node scripts/setup-solo-flight-collections.mjs
 */

import { Client, Databases, Permission, Role } from "node-appwrite";
import { existsSync, readFileSync } from "node:fs";

const envPath = decodeURIComponent(new URL("../.env.local", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const localEnv = existsSync(envPath)
  ? Object.fromEntries(
      readFileSync(envPath, "utf-8")
        .split(/\r?\n/)
        .flatMap((line) => {
          const index = line.indexOf("=");
          if (index <= 0 || line.trim().startsWith("#")) return [];
          return [[line.slice(0, index).trim(), line.slice(index + 1).trim()]];
        }),
    )
  : {};

const ENDPOINT = process.env.APPWRITE_ENDPOINT || localEnv.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || localEnv.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY || localEnv.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || localEnv.VITE_APPWRITE_DATABASE_ID;
const ENDORSEMENTS_COL_ID =
  process.env.APPWRITE_SOLO_FLIGHT_ENDORSEMENTS_COL_ID ||
  localEnv.VITE_APPWRITE_SOLO_FLIGHT_ENDORSEMENTS_COL_ID ||
  "solo_flight_endorsements";
const REQUESTS_COL_ID =
  process.env.APPWRITE_SOLO_FLIGHT_REQUESTS_COL_ID ||
  localEnv.VITE_APPWRITE_SOLO_FLIGHT_REQUESTS_COL_ID ||
  "solo_flight_requests";
const DECISIONS_COL_ID =
  process.env.APPWRITE_SOLO_FLIGHT_DECISIONS_COL_ID ||
  localEnv.VITE_APPWRITE_SOLO_FLIGHT_DECISIONS_COL_ID ||
  "solo_flight_decisions";

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DB_ID) {
  throw new Error("Defina APPWRITE_API_KEY e as configuracoes Appwrite.");
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);
const reset = process.argv.includes("--reset");

const perms = [
  Permission.read(Role.users()),
  Permission.create(Role.users()),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
  Permission.read(Role.label("admin")),
  Permission.read(Role.label("instrutor")),
];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureCollection(id, name) {
  try {
    await db.createCollection(DB_ID, id, name, perms, false, true);
    console.log(`  ok collection ${id}`);
  } catch (error) {
    if (error.code !== 409) throw error;
    await db.updateCollection(DB_ID, id, name, perms, false, true);
    console.log(`  exists collection ${id}`);
  }
  await sleep(900);
}

async function resetCollection(id) {
  try {
    await db.deleteCollection(DB_ID, id);
    console.log(`  reset collection ${id}`);
    await sleep(1200);
  } catch (error) {
    if (error.code !== 404) throw error;
  }
}

async function attr(label, fn) {
  try {
    await fn();
    console.log(`    ok ${label}`);
  } catch (error) {
    if (error.code === 409 || String(error.message || "").toLowerCase().includes("already exists")) {
      console.log(`    exists ${label}`);
      return;
    }
    throw error;
  }
  await sleep(350);
}

async function index(label, collectionId, key, type, attributes, orders) {
  try {
    await db.createIndex(DB_ID, collectionId, key, type, attributes, orders);
    console.log(`    ok index ${label}`);
  } catch (error) {
    if (error.code === 409 || String(error.message || "").toLowerCase().includes("already exists")) {
      console.log(`    exists index ${label}`);
      return;
    }
    throw error;
  }
  await sleep(700);
}

console.log(`\nSolo flight endorsements: ${ENDORSEMENTS_COL_ID}`);
if (reset) await resetCollection(ENDORSEMENTS_COL_ID);
await ensureCollection(ENDORSEMENTS_COL_ID, "Endossos de voo solo");
for (const [label, fn] of [
  ["school_id", () => db.createStringAttribute(DB_ID, ENDORSEMENTS_COL_ID, "school_id", 64, true)],
  ["student_user_id", () => db.createStringAttribute(DB_ID, ENDORSEMENTS_COL_ID, "student_user_id", 64, true)],
  ["file_id", () => db.createStringAttribute(DB_ID, ENDORSEMENTS_COL_ID, "file_id", 64, true)],
  ["file_name", () => db.createStringAttribute(DB_ID, ENDORSEMENTS_COL_ID, "file_name", 255, true)],
  ["mime_type", () => db.createStringAttribute(DB_ID, ENDORSEMENTS_COL_ID, "mime_type", 128, false)],
  ["file_size", () => db.createIntegerAttribute(DB_ID, ENDORSEMENTS_COL_ID, "file_size", false)],
  ["version", () => db.createIntegerAttribute(DB_ID, ENDORSEMENTS_COL_ID, "version", true, 1)],
  ["active", () => db.createBooleanAttribute(DB_ID, ENDORSEMENTS_COL_ID, "active", true)],
  ["notes", () => db.createStringAttribute(DB_ID, ENDORSEMENTS_COL_ID, "notes", 1024, false)],
  ["uploaded_by", () => db.createStringAttribute(DB_ID, ENDORSEMENTS_COL_ID, "uploaded_by", 64, false)],
  ["uploaded_at", () => db.createStringAttribute(DB_ID, ENDORSEMENTS_COL_ID, "uploaded_at", 64, true)],
  ["created_at", () => db.createStringAttribute(DB_ID, ENDORSEMENTS_COL_ID, "created_at", 64, true)],
  ["updated_at", () => db.createStringAttribute(DB_ID, ENDORSEMENTS_COL_ID, "updated_at", 64, true)],
]) await attr(label, fn);
await index("sfe_student_active", ENDORSEMENTS_COL_ID, "sfe_student_active", "key", ["student_user_id", "active"], ["ASC", "ASC"]);
await index("sfe_student_uploaded", ENDORSEMENTS_COL_ID, "sfe_student_uploaded", "key", ["student_user_id", "uploaded_at"], ["ASC", "DESC"]);

console.log(`\nSolo flight requests: ${REQUESTS_COL_ID}`);
if (reset) await resetCollection(REQUESTS_COL_ID);
await ensureCollection(REQUESTS_COL_ID, "Solicitacoes de voo solo");
for (const [label, fn] of [
  ["school_id", () => db.createStringAttribute(DB_ID, REQUESTS_COL_ID, "school_id", 64, true)],
  ["student_user_id", () => db.createStringAttribute(DB_ID, REQUESTS_COL_ID, "student_user_id", 64, true)],
  ["instructor_user_id", () => db.createStringAttribute(DB_ID, REQUESTS_COL_ID, "instructor_user_id", 64, true)],
  ["source_flight_id", () => db.createStringAttribute(DB_ID, REQUESTS_COL_ID, "source_flight_id", 64, false)],
  ["request_type", () => db.createStringAttribute(DB_ID, REQUESTS_COL_ID, "request_type", 32, true)],
  ["flight_date", () => db.createStringAttribute(DB_ID, REQUESTS_COL_ID, "flight_date", 10, true)],
  ["start_time", () => db.createStringAttribute(DB_ID, REQUESTS_COL_ID, "start_time", 8, false)],
  ["cutoff_time", () => db.createStringAttribute(DB_ID, REQUESTS_COL_ID, "cutoff_time", 8, false)],
  ["origin_icao", () => db.createStringAttribute(DB_ID, REQUESTS_COL_ID, "origin_icao", 4, false)],
  ["destination_icaos_json", () => db.createStringAttribute(DB_ID, REQUESTS_COL_ID, "destination_icaos_json", 255, true)],
  ["alternate_icaos_json", () => db.createStringAttribute(DB_ID, REQUESTS_COL_ID, "alternate_icaos_json", 255, false)],
  ["manual_checks_json", () => db.createStringAttribute(DB_ID, REQUESTS_COL_ID, "manual_checks_json", 1024, false)],
  ["automatic_checks_json", () => db.createStringAttribute(DB_ID, REQUESTS_COL_ID, "automatic_checks_json", 2048, false)],
  ["metar_checks_json", () => db.createStringAttribute(DB_ID, REQUESTS_COL_ID, "metar_checks_json", 2048, false)],
  ["flags_json", () => db.createStringAttribute(DB_ID, REQUESTS_COL_ID, "flags_json", 2048, false)],
  ["request_snapshot_json", () => db.createStringAttribute(DB_ID, REQUESTS_COL_ID, "request_snapshot_json", 1024, false)],
  ["status", () => db.createStringAttribute(DB_ID, REQUESTS_COL_ID, "status", 32, true)],
  ["final_decision", () => db.createStringAttribute(DB_ID, REQUESTS_COL_ID, "final_decision", 16, false)],
  ["decided_by_role", () => db.createStringAttribute(DB_ID, REQUESTS_COL_ID, "decided_by_role", 32, false)],
  ["decided_by_phone", () => db.createStringAttribute(DB_ID, REQUESTS_COL_ID, "decided_by_phone", 32, false)],
  ["decided_by_user_id", () => db.createStringAttribute(DB_ID, REQUESTS_COL_ID, "decided_by_user_id", 64, false)],
  ["decided_at", () => db.createStringAttribute(DB_ID, REQUESTS_COL_ID, "decided_at", 64, false)],
  ["decision_reason", () => db.createStringAttribute(DB_ID, REQUESTS_COL_ID, "decision_reason", 1024, false)],
  ["student_name", () => db.createStringAttribute(DB_ID, REQUESTS_COL_ID, "student_name", 255, false)],
  ["instructor_name", () => db.createStringAttribute(DB_ID, REQUESTS_COL_ID, "instructor_name", 255, false)],
  ["route", () => db.createStringAttribute(DB_ID, REQUESTS_COL_ID, "route", 255, false)],
  ["wpp_messages_json", () => db.createStringAttribute(DB_ID, REQUESTS_COL_ID, "wpp_messages_json", 1024, false)],
  ["created_by", () => db.createStringAttribute(DB_ID, REQUESTS_COL_ID, "created_by", 64, true)],
  ["created_at", () => db.createStringAttribute(DB_ID, REQUESTS_COL_ID, "created_at", 64, true)],
  ["updated_at", () => db.createStringAttribute(DB_ID, REQUESTS_COL_ID, "updated_at", 64, true)],
]) await attr(label, fn);
await index("sfr_status_date", REQUESTS_COL_ID, "sfr_status_date", "key", ["status", "flight_date"], ["ASC", "DESC"]);
await index("sfr_student_date", REQUESTS_COL_ID, "sfr_student_date", "key", ["student_user_id", "flight_date"], ["ASC", "DESC"]);
await index("sfr_instructor_date", REQUESTS_COL_ID, "sfr_instructor_date", "key", ["instructor_user_id", "flight_date"], ["ASC", "DESC"]);

console.log(`\nSolo flight decisions: ${DECISIONS_COL_ID}`);
if (reset) await resetCollection(DECISIONS_COL_ID);
await ensureCollection(DECISIONS_COL_ID, "Decisoes de voo solo");
for (const [label, fn] of [
  ["school_id", () => db.createStringAttribute(DB_ID, DECISIONS_COL_ID, "school_id", 64, true)],
  ["request_id", () => db.createStringAttribute(DB_ID, DECISIONS_COL_ID, "request_id", 64, true)],
  ["decision", () => db.createStringAttribute(DB_ID, DECISIONS_COL_ID, "decision", 16, true)],
  ["source", () => db.createStringAttribute(DB_ID, DECISIONS_COL_ID, "source", 24, true)],
  ["actor_user_id", () => db.createStringAttribute(DB_ID, DECISIONS_COL_ID, "actor_user_id", 64, false)],
  ["actor_role", () => db.createStringAttribute(DB_ID, DECISIONS_COL_ID, "actor_role", 32, false)],
  ["actor_phone", () => db.createStringAttribute(DB_ID, DECISIONS_COL_ID, "actor_phone", 32, false)],
  ["reason", () => db.createStringAttribute(DB_ID, DECISIONS_COL_ID, "reason", 1024, false)],
  ["created_at", () => db.createStringAttribute(DB_ID, DECISIONS_COL_ID, "created_at", 64, true)],
]) await attr(label, fn);
await index("sfd_request", DECISIONS_COL_ID, "sfd_request", "key", ["request_id", "created_at"], ["ASC", "DESC"]);

console.log("\nPronto.");
console.log(`VITE_APPWRITE_SOLO_FLIGHT_ENDORSEMENTS_COL_ID=${ENDORSEMENTS_COL_ID}`);
console.log(`VITE_APPWRITE_SOLO_FLIGHT_REQUESTS_COL_ID=${REQUESTS_COL_ID}`);
console.log(`VITE_APPWRITE_SOLO_FLIGHT_DECISIONS_COL_ID=${DECISIONS_COL_ID}`);
