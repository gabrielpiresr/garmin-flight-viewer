/**
 * Voos criados pelo admin costumam não ter update/read para label:instrutor no documento.
 * Este script adiciona essas permissões em todos os voos com instructor_user_id.
 *
 * Uso: APPWRITE_API_KEY=... node scripts/add-instructor-flight-document-permissions.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases, Permission, Query, Role } from "node-appwrite";

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
const endpoint = process.env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY || env.APPWRITE_API_KEY;
const databaseId = env.VITE_APPWRITE_DATABASE_ID;
const flightsCol = env.VITE_APPWRITE_COLLECTION_ID;

const INSTRUCTOR_LABEL_READ = Permission.read(Role.label("instrutor"));
const INSTRUCTOR_LABEL_UPDATE = Permission.update(Role.label("instrutor"));
const STUDENT_LABEL_READ = Permission.read(Role.label("aluno"));

function instructorUserUpdate(userId) {
  return Permission.update(Role.user(userId));
}
function instructorUserRead(userId) {
  return Permission.read(Role.user(userId));
}

function needsPatch(permissions, instructorUserId) {
  const list = permissions ?? [];
  if (!list.includes(INSTRUCTOR_LABEL_UPDATE) || !list.includes(INSTRUCTOR_LABEL_READ)) return true;
  if (instructorUserId && !list.includes(instructorUserUpdate(instructorUserId))) return true;
  return false;
}

async function main() {
  if (!apiKey || !databaseId || !flightsCol) {
    console.error("Missing APPWRITE_API_KEY, VITE_APPWRITE_DATABASE_ID or VITE_APPWRITE_COLLECTION_ID");
    process.exit(1);
  }

  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  const db = new Databases(client);

  let cursor;
  let patched = 0;
  let scanned = 0;

  while (true) {
    const queries = [Query.limit(100), Query.select(["$id", "$permissions", "instructor_user_id"])];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const page = await db.listDocuments(databaseId, flightsCol, queries);
    for (const doc of page.documents) {
      scanned += 1;
      const instructorId = String(doc.instructor_user_id || "").trim();
      if (!instructorId || !needsPatch(doc.$permissions, instructorId)) continue;
      const next = Array.from(
        new Set([
          ...(doc.$permissions ?? []),
          INSTRUCTOR_LABEL_READ,
          INSTRUCTOR_LABEL_UPDATE,
          STUDENT_LABEL_READ,
          instructorUserRead(instructorId),
          instructorUserUpdate(instructorId),
        ]),
      );
      await db.updateDocument(databaseId, flightsCol, doc.$id, {}, next);
      patched += 1;
      console.log(`  patched ${doc.$id}`);
    }

    if (page.documents.length < 100) break;
    cursor = page.documents[page.documents.length - 1]?.$id;
    if (!cursor) break;
  }

  console.log(`\nDone. Scanned ${scanned}, patched ${patched}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
