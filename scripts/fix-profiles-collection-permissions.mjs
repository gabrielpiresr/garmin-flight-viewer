import { Client, Databases } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const PROFILES_COLLECTION_ID = process.env.APPWRITE_PROFILES_COLLECTION_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID || !PROFILES_COLLECTION_ID) {
  console.error(
    "Missing APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID or APPWRITE_PROFILES_COLLECTION_ID.",
  );
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);

async function run() {
  const current = await databases.getCollection({
    databaseId: DATABASE_ID,
    collectionId: PROFILES_COLLECTION_ID,
  });

  const permissions = [
    "read(\"users\")",
    "read(\"label:instrutor\")",
    "read(\"label:admin\")",
    "create(\"users\")",
    "update(\"label:admin\")",
    "delete(\"label:admin\")",
  ];

  await databases.updateCollection({
    databaseId: DATABASE_ID,
    collectionId: PROFILES_COLLECTION_ID,
    name: current.name,
    permissions,
    documentSecurity: current.documentSecurity,
    enabled: current.enabled,
  });

  console.log("Updated profiles collection permissions:");
  for (const permission of permissions) {
    console.log(`- ${permission}`);
  }
}

run().catch((error) => {
  console.error("Failed to update profiles collection permissions:", error?.message ?? error);
  process.exit(1);
});
