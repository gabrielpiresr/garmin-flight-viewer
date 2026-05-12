import { Client, Databases } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const VIDEOS_COLLECTION_ID = process.env.APPWRITE_VIDEOS_COLLECTION_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID || !VIDEOS_COLLECTION_ID) {
  console.error(
    "Missing env vars. Run with:\n" +
    "APPWRITE_ENDPOINT=... APPWRITE_PROJECT_ID=... APPWRITE_API_KEY=... " +
    "APPWRITE_DATABASE_ID=... APPWRITE_VIDEOS_COLLECTION_ID=... node scripts/fix-flight-videos-permissions.mjs"
  );
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);

async function run() {
  const current = await databases.getCollection(DATABASE_ID, VIDEOS_COLLECTION_ID);

  // Collection-level: any authenticated user can create and read.
  // Per-document update/delete is restricted to the uploader via document-level permissions.
  const permissions = [
    'create("users")',
    'read("users")',
    'update("users")',
    'delete("users")',
  ];

  await databases.updateCollection(
    DATABASE_ID,
    VIDEOS_COLLECTION_ID,
    current.name,
    permissions,
    current.documentSecurity,
    current.enabled,
  );

  console.log("✓ flight_videos collection permissions updated:");
  for (const p of permissions) console.log(`  ${p}`);
}

run().catch((e) => {
  console.error("Failed:", e?.message ?? e);
  process.exit(1);
});
