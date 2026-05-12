import { Client, Databases, Query } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const FLIGHTS_COLLECTION_ID = process.env.APPWRITE_FLIGHTS_COLLECTION_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID || !FLIGHTS_COLLECTION_ID) {
  console.error(
    "Missing APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID or APPWRITE_FLIGHTS_COLLECTION_ID.",
  );
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);

async function run() {
  let offset = 0;
  const limit = 100;
  let migrated = 0;
  let scanned = 0;

  while (true) {
    const page = await databases.listDocuments(DATABASE_ID, FLIGHTS_COLLECTION_ID, [
      Query.limit(limit),
      Query.offset(offset),
      Query.orderAsc("$id"),
    ]);

    if (page.documents.length === 0) break;

    for (const doc of page.documents) {
      scanned += 1;
      const legacyOwner = (doc.user_id ?? "") || "";
      const studentUserId = (doc.student_user_id ?? "") || legacyOwner;
      const instructorUserId = (doc.instructor_user_id ?? "") || legacyOwner;
      const createdByRole = (doc.created_by_role ?? "") || "aluno";

      const needsUpdate =
        doc.student_user_id !== studentUserId ||
        doc.instructor_user_id !== instructorUserId ||
        doc.created_by_role !== createdByRole;

      if (!needsUpdate) continue;

      await databases.updateDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, doc.$id, {
        student_user_id: studentUserId,
        instructor_user_id: instructorUserId,
        created_by_role: createdByRole,
      });
      migrated += 1;
    }

    offset += page.documents.length;
  }

  console.log(`Scanned: ${scanned}`);
  console.log(`Migrated: ${migrated}`);
}

run().catch((error) => {
  console.error("Migration failed:", error?.message ?? error);
  process.exit(1);
});
