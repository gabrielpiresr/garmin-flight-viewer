import { Client, Databases, Permission, Query, Role } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID || !ADMIN_USER_ID) {
  console.error("Missing env vars. Required: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID, ADMIN_USER_ID");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const ADMIN_PERMS = [
  Permission.read(Role.user(ADMIN_USER_ID)),
  Permission.read(Role.label("admin")),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
  Permission.create(Role.user(ADMIN_USER_ID)),
  Permission.update(Role.user(ADMIN_USER_ID)),
  Permission.delete(Role.user(ADMIN_USER_ID)),
];

const AIRCRAFTS_COLLECTION_PERMS = [
  ...ADMIN_PERMS,
  Permission.read(Role.label("instrutor")),
];

const AIRCRAFT_DOCUMENT_PERMS = [
  Permission.read(Role.user(ADMIN_USER_ID)),
  Permission.read(Role.label("admin")),
  Permission.read(Role.label("instrutor")),
  Permission.update(Role.user(ADMIN_USER_ID)),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.user(ADMIN_USER_ID)),
  Permission.delete(Role.label("admin")),
];

const ADMIN_COLLECTIONS = [
  "aircraft_models",
  "aircrafts",
  "aircraft_model_maintenance_rules",
  "aircraft_operational_weeks",
  "aircraft_operational_daily_caps",
  "aircraft_operational_group_caps",
  "aircraft_operational_group_cap_days",
  "aircraft_operational_slots",
];

async function main() {
  console.log(`=== Fix Admin Collection Permissions ===`);
  console.log(`Admin user: ${ADMIN_USER_ID}\n`);

  const list = await db.listCollections(DATABASE_ID);

  for (const colName of ADMIN_COLLECTIONS) {
    const col = list.collections.find((c) => c.name === colName);
    if (!col) {
      console.log(`  ✗ Not found: ${colName}`);
      continue;
    }
    try {
      const permissions = colName === "aircrafts" ? AIRCRAFTS_COLLECTION_PERMS : ADMIN_PERMS;
      await db.updateCollection(DATABASE_ID, col.$id, colName, permissions, true, true);
      console.log(`  ✓ Fixed: ${colName} (${col.$id})`);
      if (colName === "aircrafts") {
        const docs = await db.listDocuments(DATABASE_ID, col.$id, [Query.limit(5000)]);
        for (const doc of docs.documents) {
          await db.updateDocument(DATABASE_ID, col.$id, doc.$id, {}, AIRCRAFT_DOCUMENT_PERMS);
        }
        console.log(`    ✓ Fixed aircraft document permissions: ${docs.documents.length}`);
      }
    } catch (e) {
      console.error(`  ✗ Error on ${colName}:`, e?.message ?? e);
    }
  }

  console.log("\nDone.");
}

main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
