import { Client, Databases, Permission, Query, Role } from "node-appwrite";

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
  let updated = 0;
  let offset = 0;
  const limit = 100;

  while (true) {
    const page = await databases.listDocuments(DATABASE_ID, PROFILES_COLLECTION_ID, [
      Query.limit(limit),
      Query.offset(offset),
      Query.orderAsc("$id"),
    ]);

    if (page.documents.length === 0) break;

    for (const doc of page.documents) {
      const userId = doc.user_id ?? "";
      if (!userId) continue;

      const permissions = [
        Permission.read(Role.users()),
        Permission.read(Role.user(userId)),
        Permission.read(Role.label("instrutor")),
        Permission.read(Role.label("admin")),
        Permission.update(Role.user(userId)),
        Permission.delete(Role.user(userId)),
        Permission.update(Role.label("admin")),
        Permission.delete(Role.label("admin")),
      ];

      await databases.updateDocument(
        DATABASE_ID,
        PROFILES_COLLECTION_ID,
        doc.$id,
        {
          email: doc.email,
          role: doc.role,
          user_id: userId,
        },
        permissions,
      );
      updated += 1;
    }

    offset += page.documents.length;
  }

  console.log(`Updated profile permissions: ${updated}`);
}

run().catch((error) => {
  console.error("Failed to update profile permissions:", error?.message ?? error);
  process.exit(1);
});
