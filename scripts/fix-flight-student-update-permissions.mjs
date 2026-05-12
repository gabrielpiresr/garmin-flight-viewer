import { Client, Databases, Permission, Query, Role } from "node-appwrite";
import fs from "node:fs";

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return;
  const lines = fs.readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

const ENDPOINT = process.env.APPWRITE_ENDPOINT ?? process.env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID ?? process.env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID ?? process.env.VITE_APPWRITE_DATABASE_ID;
const FLIGHTS_COLLECTION_ID =
  process.env.APPWRITE_FLIGHTS_COLLECTION_ID ?? process.env.VITE_APPWRITE_COLLECTION_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID || !FLIGHTS_COLLECTION_ID) {
  console.error(
    "Missing env vars. Run with APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, " +
      "APPWRITE_DATABASE_ID and APPWRITE_FLIGHTS_COLLECTION_ID.",
  );
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);

function withStudentUpdatePermission(doc) {
  const studentUserId = (doc.student_user_id ?? doc.user_id ?? "").trim();
  if (!studentUserId) return null;

  const next = new Set(doc.$permissions ?? []);
  next.add(Permission.read(Role.user(studentUserId)));
  next.add(Permission.update(Role.user(studentUserId)));
  return Array.from(next);
}

async function run() {
  let offset = 0;
  const limit = 100;
  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  while (true) {
    const page = await databases.listDocuments(DATABASE_ID, FLIGHTS_COLLECTION_ID, [
      Query.limit(limit),
      Query.offset(offset),
      Query.orderAsc("$id"),
    ]);

    if (page.documents.length === 0) break;

    for (const doc of page.documents) {
      scanned += 1;
      const permissions = withStudentUpdatePermission(doc);
      if (!permissions) {
        skipped += 1;
        continue;
      }

      const before = new Set(doc.$permissions ?? []);
      const changed = permissions.some((permission) => !before.has(permission));
      if (!changed) continue;

      await databases.updateDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, doc.$id, {}, permissions);
      updated += 1;
    }

    offset += page.documents.length;
  }

  console.log(`Scanned: ${scanned}`);
  console.log(`Updated permissions: ${updated}`);
  console.log(`Skipped without student: ${skipped}`);
}

run().catch((error) => {
  console.error("Permission migration failed:", error?.message ?? error);
  process.exit(1);
});
