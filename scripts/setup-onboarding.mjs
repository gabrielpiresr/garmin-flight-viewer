import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases, ID, Permission, Query, Role, Storage } from "node-appwrite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env.local");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const entries = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    entries[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return entries;
}

const env = parseEnvFile(envPath);
const ENDPOINT = process.env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY || env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || env.VITE_APPWRITE_DATABASE_ID;
const PROFILES_COL_ID =
  process.env.APPWRITE_PROFILES_COLLECTION_ID || env.VITE_APPWRITE_PROFILES_COLLECTION_ID;
const PLATFORM_SETTINGS_COL_ID =
  process.env.APPWRITE_PLATFORM_SETTINGS_COLLECTION_ID || env.VITE_APPWRITE_PLATFORM_SETTINGS_COL_ID;
const SCHOOL_ID = process.env.SCHOOL_ID || env.VITE_SCHOOL_ID || "escola_principal";
const ONBOARDING_SETTINGS_KEY = "onboarding";

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error(
    "Missing env vars. Required: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID",
  );
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);
const storage = new Storage(client);

const ADMIN_PERMS = [
  Permission.read(Role.label("admin")),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

/** Document-level perms for platform_settings (create not allowed on documents). */
const PLATFORM_SETTINGS_DOC_PERMS = [
  Permission.read(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

const STEPS_PERMS = [
  Permission.read(Role.users()),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

const MEDIA_PERMS = [
  Permission.read(Role.users()),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

const MEDIA_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];

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
    if (msg.toLowerCase().includes("already exists") || error?.code === 409) {
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
    if (msg.toLowerCase().includes("already exists") || error?.code === 409) {
      console.log(`     • index ${key} (already exists)`);
      return;
    }
    throw error;
  }
}

async function ensureCollection(name, perms) {
  let offset = 0;
  let found = null;
  while (true) {
    const list = await db.listCollections(DATABASE_ID, [Query.limit(100), Query.offset(offset)]);
    found = list.collections.find((collection) => collection.name === name) ?? found;
    if (found || !list.collections.length || list.collections.length < 100) break;
    offset += 100;
  }
  if (found) {
    await db.updateCollection(DATABASE_ID, found.$id, name, perms, false, true);
    console.log(`  • Collection "${name}" already exists (${found.$id})`);
    return found;
  }
  const col = await db.createCollection(DATABASE_ID, ID.unique(), name, perms, false, true);
  console.log(`  ✓ Created collection "${name}" (${col.$id})`);
  return col;
}

async function ensureBucket(name) {
  const list = await storage.listBuckets();
  const found = list.buckets.find((bucket) => bucket.name === name);
  if (found) {
    await storage.updateBucket(
      found.$id,
      name,
      MEDIA_PERMS,
      true,
      true,
      10 * 1000 * 1000,
      MEDIA_EXTENSIONS,
      "gzip",
      true,
    );
    console.log(`  • Bucket "${name}" already exists (${found.$id})`);
    return found;
  }
  try {
    const bucket = await storage.createBucket(
      ID.unique(),
      name,
      MEDIA_PERMS,
      true,
      true,
      10 * 1000 * 1000,
      MEDIA_EXTENSIONS,
      "gzip",
      true,
    );
    console.log(`  ✓ Created bucket "${name}" (${bucket.$id})`);
    return bucket;
  } catch (error) {
    const msg = error?.message ?? String(error);
    const fallbackId = env.VITE_APPWRITE_HELP_MEDIA_BUCKET_ID || env.VITE_APPWRITE_BUCKET_ID;
    if (!msg.toLowerCase().includes("maximum number of buckets") || !fallbackId) throw error;
    const fallback = await storage.getBucket(fallbackId);
    const mergedExtensions = Array.from(new Set([...(fallback.allowedFileExtensions ?? []), ...MEDIA_EXTENSIONS]));
    await storage.updateBucket(
      fallback.$id,
      fallback.name,
      MEDIA_PERMS,
      true,
      true,
      fallback.maximumFileSize,
      mergedExtensions,
      fallback.compression,
      fallback.encryption,
    );
    console.log(`  • Bucket limit reached. Reusing "${fallback.name}" (${fallback.$id})`);
    return fallback;
  }
}

async function setupProfilesField() {
  if (!PROFILES_COL_ID) {
    console.warn("  ⚠ VITE_APPWRITE_PROFILES_COLLECTION_ID not set — skip profiles field");
    return;
  }
  console.log("\n[1/4] profiles.onboarding_completed_at...");
  await attr(
    () => db.createStringAttribute(DATABASE_ID, PROFILES_COL_ID, "onboarding_completed_at", 64, false),
    "onboarding_completed_at",
  );
}

async function setupOnboardingSteps() {
  console.log("\n[2/4] onboarding_steps...");
  const col = await ensureCollection("onboarding_steps", STEPS_PERMS);
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "school_id", 64, true), "school_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "title", 255, true), "title");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "description", 4096, true), "description");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "description_json", 65535, false), "description_json");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "description_html", 65535, false), "description_html");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "image_file_id", 64, false), "image_file_id");
  await attr(() => db.createIntegerAttribute(DATABASE_ID, id, "sort_order", true), "sort_order");
  await idx(id, "onboarding_steps_school_order_idx", ["school_id", "sort_order"]);
  return id;
}

async function setupOnboardingMediaBucket() {
  console.log("\n[3/4] onboarding-media bucket...");
  const bucket = await ensureBucket("onboarding-media");
  return bucket.$id;
}

async function resolvePlatformSettingsColId() {
  if (PLATFORM_SETTINGS_COL_ID) return PLATFORM_SETTINGS_COL_ID;
  const list = await db.listCollections(DATABASE_ID);
  const found = list.collections.find((c) => c.name === "platform_settings");
  return found?.$id || null;
}

async function ensureOnboardingSettingsDoc() {
  const platformColId = await resolvePlatformSettingsColId();
  if (!platformColId) {
    console.warn("  ⚠ platform_settings collection not found — skip onboarding settings doc");
    return;
  }
  console.log("\n[4/4] platform_settings (onboarding key)...");
  const res = await db.listDocuments(DATABASE_ID, platformColId, []);
  const existing = res.documents.find((doc) => doc.key === ONBOARDING_SETTINGS_KEY);
  if (existing) {
    console.log(`  • Document key="${ONBOARDING_SETTINGS_KEY}" already exists (${existing.$id})`);
    return;
  }
  const doc = await db.createDocument(
    DATABASE_ID,
    platformColId,
    ID.unique(),
    {
      key: ONBOARDING_SETTINGS_KEY,
      settings_json: JSON.stringify({ enabled: false }),
    },
    PLATFORM_SETTINGS_DOC_PERMS,
  );
  console.log(`  ✓ Created onboarding settings doc (${doc.$id})`);
}

async function main() {
  console.log("=== Appwrite Onboarding Setup ===");
  console.log(`Database: ${DATABASE_ID}`);
  console.log(`School: ${SCHOOL_ID}\n`);

  await setupProfilesField();
  const stepsColId = await setupOnboardingSteps();
  const bucketId = await setupOnboardingMediaBucket();
  await ensureOnboardingSettingsDoc();

  console.log("\n=== Setup Complete ===");
  console.log("Add these to your .env.local:\n");
  console.log(`VITE_APPWRITE_ONBOARDING_STEPS_COL_ID=${stepsColId}`);
  console.log(`VITE_APPWRITE_ONBOARDING_MEDIA_BUCKET_ID=${bucketId}`);
}

main().catch((error) => {
  console.error("Setup failed:", error?.message ?? error);
  process.exit(1);
});
