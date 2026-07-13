/**
 * Script: setup-instructor-admission.mjs
 * Cria coleções para o módulo de admissão de instrutores.
 * Uso: node scripts/setup-instructor-admission.mjs
 */

import { Client, Databases, Permission, Role } from "node-appwrite";
import { readFileSync } from "fs";

const envPath = decodeURIComponent(new URL("../.env.local", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const localEnv = Object.fromEntries(readFileSync(envPath, "utf-8").split(/\r?\n/).flatMap((line) => {
  const index = line.indexOf("=");
  if (index <= 0 || line.trim().startsWith("#")) return [];
  return [[line.slice(0, index).trim(), line.slice(index + 1).trim()]];
}));
const ENDPOINT = process.env.APPWRITE_ENDPOINT || localEnv.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || localEnv.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY || localEnv.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || localEnv.VITE_APPWRITE_DATABASE_ID;
if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DB_ID) {
  throw new Error("Defina APPWRITE_API_KEY e as configurações Appwrite.");
}

const STAGES_COL = "instructor_admission_stages";
const FORM_COL = "instructor_admission_form";
const CANDIDATES_COL = "instructor_admission_candidates";
const COMMENTS_COL = "instructor_admission_comments";

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

async function tryCreateAttribute(fn, label) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
  } catch (e) {
    if (e.code === 409) console.log(`  ~ ${label} (já existe)`);
    else console.error(`  ✗ ${label}: ${e.message}`);
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function createCollection(id, name, permissions) {
  console.log(`\n▶ Criando coleção ${id}...`);
  try {
    await db.createCollection(DB_ID, id, name, permissions, false);
    console.log(`  ✓ Coleção ${id} criada`);
  } catch (e) {
    if (e.code === 409) console.log(`  ~ Coleção ${id} já existe`);
    else throw e;
  }
  await sleep(1200);
}

const adminPerms = [
  Permission.read(Role.label("admin")),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
  Permission.read(Role.label("instrutor")),
  Permission.update(Role.label("instrutor")),
];

await createCollection(STAGES_COL, "Admissão Instrutores - Etapas", adminPerms);
for (const [fn, label] of [
  [() => db.createStringAttribute(DB_ID, STAGES_COL, "name", 255, true), "name"],
  [() => db.createStringAttribute(DB_ID, STAGES_COL, "color", 20, false, "#64748b"), "color"],
  [() => db.createStringAttribute(DB_ID, STAGES_COL, "description", 2000, false, ""), "description"],
  [() => db.createIntegerAttribute(DB_ID, STAGES_COL, "order", false, 0), "order"],
  [() => db.createBooleanAttribute(DB_ID, STAGES_COL, "is_default", false, false), "is_default"],
  [() => db.createBooleanAttribute(DB_ID, STAGES_COL, "archived", false, false), "archived"],
]) {
  await tryCreateAttribute(fn, label);
}

await createCollection(FORM_COL, "Admissão Instrutores - Formulário", [
  ...adminPerms,
  Permission.read(Role.any()),
]);
for (const [fn, label] of [
  [() => db.createStringAttribute(DB_ID, FORM_COL, "title", 255, false, "Candidatura de Instrutor"), "title"],
  [() => db.createStringAttribute(DB_ID, FORM_COL, "description", 2000, false, ""), "description"],
  [() => db.createStringAttribute(DB_ID, FORM_COL, "fields_json", 8192, false, "[]"), "fields_json"],
  [() => db.createBooleanAttribute(DB_ID, FORM_COL, "published", false, false), "published"],
]) {
  await tryCreateAttribute(fn, label);
}

await createCollection(CANDIDATES_COL, "Admissão Instrutores - Candidatos", [
  ...adminPerms,
  Permission.create(Role.any()),
  Permission.read(Role.any()),
  Permission.update(Role.any()),
]);
for (const [fn, label] of [
  [() => db.createStringAttribute(DB_ID, CANDIDATES_COL, "stage_id", 36, true), "stage_id"],
  [() => db.createStringAttribute(DB_ID, CANDIDATES_COL, "user_id", 36, false, ""), "user_id"],
  [() => db.createStringAttribute(DB_ID, CANDIDATES_COL, "nickname", 120, false, ""), "nickname"],
  [() => db.createStringAttribute(DB_ID, CANDIDATES_COL, "name", 255, true), "name"],
  [() => db.createStringAttribute(DB_ID, CANDIDATES_COL, "email", 255, true), "email"],
  [() => db.createStringAttribute(DB_ID, CANDIDATES_COL, "phone", 50, false, ""), "phone"],
  [() => db.createStringAttribute(DB_ID, CANDIDATES_COL, "notes", 4000, false, ""), "notes"],
  [() => db.createStringAttribute(DB_ID, CANDIDATES_COL, "responses_json", 32000, false, "{}"), "responses_json"],
  [() => db.createStringAttribute(DB_ID, CANDIDATES_COL, "source", 20, false, "manual"), "source"],
  [() => db.createStringAttribute(DB_ID, CANDIDATES_COL, "status_entered_at", 64, false), "status_entered_at"],
  [() => db.createStringAttribute(DB_ID, CANDIDATES_COL, "registration_token", 64, false, ""), "registration_token"],
  [() => db.createStringAttribute(DB_ID, CANDIDATES_COL, "form_filled_at", 64, false, ""), "form_filled_at"],
]) {
  await tryCreateAttribute(fn, label);
}

await createCollection(COMMENTS_COL, "Admissão Instrutores - Comentários", [
  Permission.read(Role.label("admin")),
  Permission.create(Role.label("admin")),
  Permission.delete(Role.label("admin")),
  Permission.read(Role.label("instrutor")),
  Permission.create(Role.label("instrutor")),
]);
for (const [fn, label] of [
  [() => db.createStringAttribute(DB_ID, COMMENTS_COL, "candidate_id", 36, true), "candidate_id"],
  [() => db.createStringAttribute(DB_ID, COMMENTS_COL, "author_name", 255, false, "Admin"), "author_name"],
  [() => db.createStringAttribute(DB_ID, COMMENTS_COL, "text", 4000, true), "text"],
]) {
  await tryCreateAttribute(fn, label);
}

console.log("\n✅ Setup de admissão de instrutores concluído.");
