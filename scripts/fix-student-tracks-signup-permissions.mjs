/**
 * Permite que alunos autenticados criem o vínculo da trilha padrão no cadastro.
 *
 * Uso: APPWRITE_API_KEY=... node scripts/fix-student-tracks-signup-permissions.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases, Permission, Role } from "node-appwrite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
const endpoint = process.env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY || env.APPWRITE_API_KEY;
const databaseId = env.VITE_APPWRITE_DATABASE_ID;
const collectionId =
  process.env.APPWRITE_STUDENT_TRACKS_COLLECTION_ID ||
  env.VITE_APPWRITE_STUDENT_TRACKS_COL_ID ||
  "student_training_tracks";

const PERMS = [
  Permission.read(Role.users()),
  Permission.create(Role.users()),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

if (!apiKey || !endpoint || !projectId || !databaseId) {
  console.error("Missing APPWRITE_API_KEY, endpoint, project or VITE_APPWRITE_DATABASE_ID");
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const db = new Databases(client);

const collection = await db.getCollection(databaseId, collectionId);
await db.updateCollection(databaseId, collectionId, collection.name, PERMS, false, true);
console.log(`Updated ${collectionId} permissions: read/create users, admin update/delete`);
