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

const ADMIN_PERMS = [
  Permission.read(Role.label("admin")),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

const READ_ALL_PERMS = [
  ...ADMIN_PERMS,
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

async function ensureBucket(name) {
  try {
    const list = await storage.listBuckets();
    const found = list.buckets.find((b) => b.name === name);
    if (found) {
      console.log(`  • Bucket "${name}" already exists (${found.$id})`);
      return found;
    }
  } catch {
    // listBuckets may fail on older SDK; continue to create
  }
  const bucket = await storage.createBucket(
    ID.unique(),
    name,
    [
      Permission.read(Role.label("admin")),
      Permission.create(Role.label("admin")),
      Permission.update(Role.label("admin")),
      Permission.delete(Role.label("admin")),
      Permission.read(Role.label("instrutor")),
      Permission.read(Role.label("aluno")),
      Permission.read(Role.users()),
    ],
    false,
    true,
    50 * 1024 * 1024, // 50MB max
    ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "png", "jpg", "jpeg", "zip"],
  );
  console.log(`  ✓ Created bucket "${name}" (${bucket.$id})`);
  return bucket;
}

async function main() {
  console.log("\n=== Setup: Manuais ===\n");

  // Reuse existing bucket (plan limit reached)
  const existingBucketId = process.env.APPWRITE_BUCKET_ID ?? "flights-csv";
  console.log(`[1/2] Usando bucket existente: ${existingBucketId}`);
  const bucket = { $id: existingBucketId };

  console.log("\n[2/2] Criando coleção de manuais...");
  const col = await ensureCollection("manuals");
  const id = col.$id;

  await attr(() => db.createStringAttribute(DATABASE_ID, id, "school_id", 128, true), "school_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "name", 256, true), "name");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "category", 128, true), "category");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "file_id", 64, true), "file_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "original_name", 256, true), "original_name");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "mime_type", 128, false), "mime_type");
  await attr(() => db.createIntegerAttribute(DATABASE_ID, id, "file_size", false), "file_size");
  await attr(() => db.createIntegerAttribute(DATABASE_ID, id, "sort_order", false, 0), "sort_order");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "created_by", 64, false), "created_by");

  await idx(id, "school_category", ["school_id", "category"]);
  await idx(id, "school_sort", ["school_id", "sort_order"]);

  console.log(`
=== Concluído! ===

Adicione ao seu .env.local:
  VITE_APPWRITE_MANUALS_BUCKET_ID=${bucket.$id}
  VITE_APPWRITE_MANUALS_COL_ID=${id}
`);
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
