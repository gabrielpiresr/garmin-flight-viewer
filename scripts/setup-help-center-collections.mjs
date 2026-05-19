import { Client, Databases, ID, Permission, Role, Storage } from "node-appwrite";

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
const storage = new Storage(client);

const CONTENT_PERMS = [
  Permission.read(Role.users()),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

const MEDIA_PERMS = [
  Permission.read(Role.any()),
  Permission.create(Role.users()),
  Permission.update(Role.users()),
  Permission.delete(Role.users()),
];

const MEDIA_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "mp4", "webm", "mov", "pdf"];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureCollection(name) {
  const list = await db.listCollections(DATABASE_ID);
  const found = list.collections.find((c) => c.name === name);
  if (found) {
    await db.updateCollection(DATABASE_ID, found.$id, name, CONTENT_PERMS, false, true);
    console.log(`  - Collection "${name}" already exists (${found.$id})`);
    return found;
  }
  const col = await db.createCollection(DATABASE_ID, ID.unique(), name, CONTENT_PERMS, false, true);
  console.log(`  Created collection "${name}" (${col.$id})`);
  return col;
}

async function ensureBucket(name) {
  const list = await storage.listBuckets();
  const found = list.buckets.find((bucket) => bucket.name === name);
  if (found) {
    await storage.updateBucket(found.$id, name, MEDIA_PERMS, true, true, 50 * 1000 * 1000, MEDIA_EXTENSIONS, "gzip", true);
    console.log(`  - Bucket "${name}" already exists (${found.$id})`);
    return found;
  }
  try {
    const bucket = await storage.createBucket(
      ID.unique(),
      name,
      MEDIA_PERMS,
      true,
      true,
      50 * 1000 * 1000,
      MEDIA_EXTENSIONS,
      "gzip",
      true,
    );
    console.log(`  Created bucket "${name}" (${bucket.$id})`);
    return bucket;
  } catch (error) {
    const msg = error?.message ?? String(error);
    const fallbackId = process.env.VITE_APPWRITE_BUCKET_ID || process.env.APPWRITE_BUCKET_ID || "flights-csv";
    if (!msg.toLowerCase().includes("maximum number of buckets")) throw error;
    const fallback = await storage.getBucket(fallbackId);
    const mergedExtensions = Array.from(new Set([...(fallback.allowedFileExtensions ?? []), ...MEDIA_EXTENSIONS]));
    await storage.updateBucket(
      fallback.$id,
      fallback.name,
      fallback.$permissions,
      fallback.fileSecurity,
      fallback.enabled,
      fallback.maximumFileSize,
      mergedExtensions,
      fallback.compression,
      fallback.encryption,
    );
    console.log(`  - Bucket limit reached. Reusing "${fallback.name}" (${fallback.$id})`);
    return fallback;
  }
}

async function attr(createFn, label) {
  try {
    await createFn();
    await sleep(700);
    console.log(`     ${label}`);
  } catch (error) {
    const msg = error?.message ?? String(error);
    if (msg.toLowerCase().includes("already exists")) {
      console.log(`     ${label} (already exists)`);
      return;
    }
    throw error;
  }
}

async function idx(colId, key, attributes, orders = ["ASC"]) {
  try {
    await db.createIndex(DATABASE_ID, colId, key, "key", attributes, orders);
    await sleep(700);
    console.log(`     index ${key}`);
  } catch (error) {
    const msg = error?.message ?? String(error);
    if (msg.toLowerCase().includes("already exists")) {
      console.log(`     index ${key} (already exists)`);
      return;
    }
    throw error;
  }
}

async function setupSections() {
  console.log("\n[1/4] help_sections...");
  const col = await ensureCollection("help_sections");
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "school_id", 64, true), "school_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "title", 255, true), "title");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "description", 2048, false), "description");
  await attr(() => db.createIntegerAttribute(DATABASE_ID, id, "order", true), "order");
  await attr(() => db.createBooleanAttribute(DATABASE_ID, id, "is_published", true), "is_published");
  await idx(id, "help_sec_school_idx", ["school_id"]);
  await idx(id, "help_sec_order_idx", ["order"]);
  await idx(id, "help_sec_pub_order_idx", ["is_published", "order"], ["ASC", "ASC"]);
  return id;
}

async function setupSubsections() {
  console.log("\n[2/4] help_subsections...");
  const col = await ensureCollection("help_subsections");
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "school_id", 64, true), "school_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "section_id", 64, true), "section_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "title", 255, true), "title");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "description", 2048, false), "description");
  await attr(() => db.createIntegerAttribute(DATABASE_ID, id, "order", true), "order");
  await attr(() => db.createBooleanAttribute(DATABASE_ID, id, "is_published", true), "is_published");
  await idx(id, "help_sub_school_idx", ["school_id"]);
  await idx(id, "help_sub_section_idx", ["section_id"]);
  await idx(id, "help_sub_sec_order_idx", ["section_id", "order"], ["ASC", "ASC"]);
  return id;
}

async function setupArticles() {
  console.log("\n[3/4] help_articles...");
  const col = await ensureCollection("help_articles");
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "school_id", 64, true), "school_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "section_id", 64, true), "section_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "subsection_id", 64, false), "subsection_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "title", 255, true), "title");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "summary", 2048, false), "summary");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "content_json", 65535, true), "content_json");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "content_html", 65535, false), "content_html");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "plain_text", 65535, false), "plain_text");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "tags_json", 4096, false), "tags_json");
  await attr(() => db.createIntegerAttribute(DATABASE_ID, id, "order", true), "order");
  await attr(() => db.createBooleanAttribute(DATABASE_ID, id, "is_published", true), "is_published");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "created_by", 64, false), "created_by");
  await idx(id, "help_art_school_idx", ["school_id"]);
  await idx(id, "help_art_section_idx", ["section_id"]);
  await idx(id, "help_art_subsection_idx", ["subsection_id"]);
  await idx(id, "help_art_pub_order_idx", ["is_published", "order"], ["ASC", "ASC"]);
  return id;
}

async function main() {
  console.log("=== Appwrite Help Center Setup ===");
  console.log(`Database: ${DATABASE_ID}\n`);
  const sectionsId = await setupSections();
  const subsectionsId = await setupSubsections();
  const articlesId = await setupArticles();
  console.log("\n[4/4] help-media bucket...");
  const bucket = await ensureBucket("help-media");

  console.log("\n=== Setup Complete ===");
  console.log("Add these to your .env.local:\n");
  console.log(`VITE_APPWRITE_HELP_SECTIONS_COL_ID=${sectionsId}`);
  console.log(`VITE_APPWRITE_HELP_SUBSECTIONS_COL_ID=${subsectionsId}`);
  console.log(`VITE_APPWRITE_HELP_ARTICLES_COL_ID=${articlesId}`);
  console.log(`VITE_APPWRITE_HELP_MEDIA_BUCKET_ID=${bucket.$id}`);
}

main().catch((error) => {
  console.error("Setup failed:", error?.message ?? error);
  process.exit(1);
});
