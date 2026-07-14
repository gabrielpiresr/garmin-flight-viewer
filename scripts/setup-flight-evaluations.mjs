/**
 * Script: setup-flight-evaluations.mjs
 * Cria a coleção flight_evaluations (avaliação do voo pelo aluno).
 * Uso: node scripts/setup-flight-evaluations.mjs
 */

import { Client, Databases, Permission, Role } from "node-appwrite";
import { readFileSync } from "fs";

const envPath = decodeURIComponent(new URL("../.env.local", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const localEnv = Object.fromEntries(
  readFileSync(envPath, "utf-8")
    .split(/\r?\n/)
    .flatMap((line) => {
      const index = line.indexOf("=");
      if (index <= 0 || line.trim().startsWith("#")) return [];
      return [[line.slice(0, index).trim(), line.slice(index + 1).trim()]];
    }),
);

const ENDPOINT = process.env.APPWRITE_ENDPOINT || localEnv.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || localEnv.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY || localEnv.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || localEnv.VITE_APPWRITE_DATABASE_ID;
const COL_ID =
  process.env.APPWRITE_FLIGHT_EVALUATIONS_COL_ID ||
  localEnv.VITE_APPWRITE_FLIGHT_EVALUATIONS_COL_ID ||
  "flight_evaluations";

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DB_ID) {
  throw new Error("Defina APPWRITE_API_KEY e as configurações Appwrite.");
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function tryCreateAttribute(fn, label) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
  } catch (e) {
    if (e.code === 409) console.log(`  ~ ${label} (já existe)`);
    else console.error(`  ✗ ${label}: ${e.message}`);
  }
}

async function tryCreateIndex(fn, label) {
  try {
    await fn();
    await sleep(800);
    console.log(`  ✓ index ${label}`);
  } catch (e) {
    if (e.code === 409) console.log(`  ~ index ${label} (já existe)`);
    else console.error(`  ✗ index ${label}: ${e.message}`);
  }
}

const perms = [
  Permission.read(Role.users()),
  Permission.create(Role.label("aluno")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

console.log(`\n▶ Coleção ${COL_ID}...`);
try {
  await db.createCollection(DB_ID, COL_ID, "Avaliações de voo (aluno)", perms, false, true);
  console.log(`  ✓ Coleção criada`);
} catch (e) {
  if (e.code === 409) {
    await db.updateCollection(DB_ID, COL_ID, "Avaliações de voo (aluno)", perms, false, true);
    console.log(`  ~ Coleção já existe (perms atualizadas)`);
  } else {
    throw e;
  }
}
await sleep(1200);

for (const [fn, label] of [
  [() => db.createStringAttribute(DB_ID, COL_ID, "flight_id", 64, true), "flight_id"],
  [() => db.createStringAttribute(DB_ID, COL_ID, "student_user_id", 64, true), "student_user_id"],
  [() => db.createStringAttribute(DB_ID, COL_ID, "instructor_user_id", 64, false), "instructor_user_id"],
  [() => db.createStringAttribute(DB_ID, COL_ID, "school_id", 64, true), "school_id"],
  [() => db.createIntegerAttribute(DB_ID, COL_ID, "score_instruction", true, 1, 5), "score_instruction"],
  [() => db.createIntegerAttribute(DB_ID, COL_ID, "score_safety", true, 1, 5), "score_safety"],
  [() => db.createIntegerAttribute(DB_ID, COL_ID, "score_learning", true, 1, 5), "score_learning"],
  [() => db.createStringAttribute(DB_ID, COL_ID, "comment", 2000, false), "comment"],
  [() => db.createStringAttribute(DB_ID, COL_ID, "criteria_snapshot_json", 8000, false), "criteria_snapshot_json"],
  [() => db.createStringAttribute(DB_ID, COL_ID, "created_at", 64, true), "created_at"],
  [() => db.createStringAttribute(DB_ID, COL_ID, "updated_at", 64, true), "updated_at"],
]) {
  await tryCreateAttribute(fn, label);
  await sleep(400);
}

await sleep(1500);

await tryCreateIndex(
  () => db.createIndex(DB_ID, COL_ID, "fe_flight_idx", "key", ["flight_id"], ["ASC"]),
  "fe_flight_idx",
);
await tryCreateIndex(
  () => db.createIndex(DB_ID, COL_ID, "fe_student_idx", "key", ["student_user_id"], ["ASC"]),
  "fe_student_idx",
);
await tryCreateIndex(
  () => db.createIndex(DB_ID, COL_ID, "fe_flight_unique", "unique", ["flight_id"], ["ASC"]),
  "fe_flight_unique",
);
await tryCreateIndex(
  () => db.createIndex(DB_ID, COL_ID, "fe_school_created_idx", "key", ["school_id", "created_at"], ["ASC", "DESC"]),
  "fe_school_created_idx",
);

console.log(`\nPronto. Collection ID: ${COL_ID}`);
console.log(`Adicione ao .env.local se quiser fixar:`);
console.log(`VITE_APPWRITE_FLIGHT_EVALUATIONS_COL_ID=${COL_ID}`);
