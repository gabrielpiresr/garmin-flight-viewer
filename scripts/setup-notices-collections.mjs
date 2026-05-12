import { Client, Databases, ID, Permission, Role } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("Missing env vars. Required: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const NOTICE_PERMS = [
  Permission.read(Role.users()),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
  Permission.create(Role.label("instrutor")),
  Permission.update(Role.label("instrutor")),
  Permission.delete(Role.label("instrutor")),
];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureCollection(name, perms) {
  const list = await db.listCollections(DATABASE_ID);
  const found = list.collections.find((c) => c.name === name);
  if (found) {
    console.log(`  • Collection "${name}" already exists (${found.$id})`);
    return found;
  }
  const col = await db.createCollection(DATABASE_ID, ID.unique(), name, perms, true, true);
  console.log(`  ✓ Created collection "${name}" (${col.$id})`);
  return col;
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

async function setupNotices() {
  console.log("\n[1/1] notices...");
  const col = await ensureCollection("notices", NOTICE_PERMS);
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "title", 255, true), "title");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "content_md", 65535, true), "content_md");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "banner_file_id", 64, false), "banner_file_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "cta_label", 120, false), "cta_label");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "cta_url", 2048, false), "cta_url");
  await attr(() => db.createDatetimeAttribute(DATABASE_ID, id, "published_at", true), "published_at");
  await attr(() => db.createBooleanAttribute(DATABASE_ID, id, "is_published", true), "is_published");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "created_by", 64, false), "created_by");
  await idx(id, "notices_published_idx", ["is_published"]);
  await idx(id, "notices_published_at_idx", ["published_at"], ["DESC"]);
  await idx(id, "notices_status_date_idx", ["is_published", "published_at"], ["ASC", "DESC"]);
  return id;
}

async function main() {
  console.log("=== Appwrite Notices Setup ===");
  console.log(`Database: ${DATABASE_ID}\n`);
  const noticesId = await setupNotices();
  console.log("\n=== Setup Complete ===");
  console.log("Add these to your .env.local:\n");
  console.log(`VITE_APPWRITE_NOTICES_COL_ID=${noticesId}`);
  console.log("VITE_APPWRITE_NOTICES_BUCKET_ID=<opcional_bucket_de_banners_ou_reutilize_VITE_APPWRITE_BUCKET_ID>");
}

main().catch((error) => {
  console.error("Setup failed:", error?.message ?? error);
  process.exit(1);
});
