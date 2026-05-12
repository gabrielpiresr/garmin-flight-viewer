import { Client, Databases, ID, Permission, Role } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("Missing APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY or APPWRITE_DATABASE_ID.");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);
const COLLECTION_NAME = "instructor_preferences";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attr(createFn, label) {
  try {
    await createFn();
    await sleep(700);
    console.log(`attr ${label}`);
  } catch (error) {
    if (String(error?.message ?? error).toLowerCase().includes("already exists")) {
      console.log(`attr ${label} exists`);
      return;
    }
    throw error;
  }
}

async function idx(collectionId, key, attrs) {
  try {
    await db.createIndex(DATABASE_ID, collectionId, key, "key", attrs, ["ASC"]);
    await sleep(700);
    console.log(`index ${key}`);
  } catch (error) {
    if (String(error?.message ?? error).toLowerCase().includes("already exists")) {
      console.log(`index ${key} exists`);
      return;
    }
    throw error;
  }
}

async function main() {
  const collections = await db.listCollections(DATABASE_ID);
  let collection = collections.collections.find((row) => row.name === COLLECTION_NAME);
  if (!collection) {
    collection = await db.createCollection(
      DATABASE_ID,
      ID.unique(),
      COLLECTION_NAME,
      [
        Permission.read(Role.users()),
        Permission.create(Role.label("admin")),
        Permission.update(Role.label("admin")),
        Permission.delete(Role.label("admin")),
      ],
      true,
      true,
    );
    await sleep(1000);
    console.log(`created ${collection.$id}`);
  } else {
    console.log(`exists ${collection.$id}`);
  }

  await attr(() => db.createStringAttribute(DATABASE_ID, collection.$id, "user_id", 64, true), "user_id");
  await attr(
    () => db.createStringAttribute(DATABASE_ID, collection.$id, "preference_level", 16, true),
    "preference_level",
  );
  await attr(
    () => db.createStringAttribute(DATABASE_ID, collection.$id, "availability_json", 8192, false),
    "availability_json",
  );
  await idx(collection.$id, "instructor_prefs_user_idx", ["user_id"]);

  console.log(`VITE_APPWRITE_INSTRUCTOR_PREFS_COL_ID=${collection.$id}`);
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
