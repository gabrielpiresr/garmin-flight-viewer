import { Client, Databases, ID, Permission, Role } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error(
    "Missing env vars. Required: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID",
  );
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const READ_ALL_PERMS = [
  Permission.read(Role.label("admin")),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
  Permission.read(Role.label("instrutor")),
  Permission.read(Role.label("aluno")),
  Permission.read(Role.users()),
];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attr(createFn, label) {
  try {
    await createFn();
    await sleep(700);
    console.log(`     ✓ ${label}`);
  } catch (error) {
    const msg = error?.message ?? String(error);
    if (msg.toLowerCase().includes("already exists")) {
      console.log(`     • ${label} (already exists)`);
      return;
    }
    throw error;
  }
}

async function idx(colId, key, attributes, orders = ["ASC"]) {
  try {
    await db.createIndex(DATABASE_ID, colId, key, "key", attributes, orders);
    await sleep(700);
    console.log(`     ✓ index ${key}`);
  } catch (error) {
    const msg = error?.message ?? String(error);
    if (msg.toLowerCase().includes("already exists")) {
      console.log(`     • index ${key} (already exists)`);
      return;
    }
    throw error;
  }
}

async function ensureCollection(name) {
  const list = await db.listCollections(DATABASE_ID);
  const found = list.collections.find((c) => c.name === name);
  if (found) {
    console.log(`  • Collection "${name}" already exists (${found.$id})`);
    return found;
  }
  const col = await db.createCollection(DATABASE_ID, ID.unique(), name, READ_ALL_PERMS, true, true);
  console.log(`  ✓ Created collection "${name}" (${col.$id})`);
  return col;
}

async function main() {
  console.log("\n=== Setup: Aircraft Panels ===\n");

  const col = await ensureCollection("aircraft_panels");
  const id = col.$id;

  console.log("\nCriando atributos...");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "school_id", 64, true), "school_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "aircraft_id", 64, true), "aircraft_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "title", 255, true), "title");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "panel_image_url", 2048, true), "panel_image_url");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "panel_image_file_id", 64, false), "panel_image_file_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "instruments_json", 100000, true), "instruments_json");
  await attr(() => db.createBooleanAttribute(DATABASE_ID, id, "published", true), "published");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "updated_at", 64, false), "updated_at");

  console.log("\nCriando índices...");
  await idx(id, "school_id_idx", ["school_id"]);
  await idx(id, "aircraft_id_idx", ["aircraft_id"]);
  await idx(id, "published_idx", ["published"]);

  console.log(`\nPronto. Adicione ao .env.local:\nVITE_APPWRITE_AIRCRAFT_PANELS_COL_ID=${id}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
