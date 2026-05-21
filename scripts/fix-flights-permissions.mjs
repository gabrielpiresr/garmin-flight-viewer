/**
 * Fix critical security issue: remove DELETE permission for Role.users()
 * and Role.label("instrutor") from the flights collection.
 * Only admins should be able to delete flight documents.
 */
import { Client, Databases, Permission, Role } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID;
const FLIGHTS_COL_ID = process.env.APPWRITE_FLIGHTS_COL_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DB_ID || !FLIGHTS_COL_ID) {
  console.error("Missing env vars. Required: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID, APPWRITE_FLIGHTS_COL_ID");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const CORRECT_PERMISSIONS = [
  // Users (authenticated) — can create, read, update; NOT delete
  Permission.create(Role.users()),
  Permission.read(Role.users()),
  Permission.update(Role.users()),
  // Admin — full access including delete
  Permission.create(Role.label("admin")),
  Permission.read(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
  // Instrutor — create, read, update; NOT delete
  Permission.create(Role.label("instrutor")),
  Permission.read(Role.label("instrutor")),
  Permission.update(Role.label("instrutor")),
];

async function main() {
  try {
    const col = await db.getCollection(DB_ID, FLIGHTS_COL_ID);
    console.log(`Collection: ${col.name} (${col.$id})`);
    console.log(`Current permissions: ${JSON.stringify(col.$permissions, null, 2)}`);

    const updated = await db.updateCollection(
      DB_ID,
      FLIGHTS_COL_ID,
      col.name,
      CORRECT_PERMISSIONS,
      col.documentSecurity,
      col.enabled,
    );

    console.log("\nUpdated permissions:");
    console.log(JSON.stringify(updated.$permissions, null, 2));
    console.log("\n✅ Flights collection permissions fixed: DELETE removed for Role.users() and Role.label(\"instrutor\")");
  } catch (err) {
    console.error("Failed:", err?.message ?? err);
    process.exit(1);
  }
}

main();
