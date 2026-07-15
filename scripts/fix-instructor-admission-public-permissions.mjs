/**
 * Libera leitura/criação pública do fluxo de admissão de instrutores
 * (formulário de triagem sem login).
 * Uso: node scripts/fix-instructor-admission-public-permissions.mjs
 */
import { Client, Databases, Permission, Role, Storage } from "node-appwrite";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const path = join(__dirname, "..", ".env.local");
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* ignore */
  }
}

loadEnv();

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID;
const BUCKET_ID = process.env.VITE_APPWRITE_BUCKET_ID || process.env.APPWRITE_BUCKET_ID;

const STAGES_COL =
  process.env.VITE_APPWRITE_INSTRUCTOR_ADMISSION_STAGES_COL_ID || "instructor_admission_stages";
const FORM_COL =
  process.env.VITE_APPWRITE_INSTRUCTOR_ADMISSION_FORM_COL_ID || "instructor_admission_form";
const CANDIDATES_COL =
  process.env.VITE_APPWRITE_INSTRUCTOR_ADMISSION_CANDIDATES_COL_ID || "instructor_admission_candidates";

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DB_ID) {
  throw new Error("Defina APPWRITE_API_KEY e as configs Appwrite em .env.local");
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);
const storage = new Storage(client);

const ADMIN_CRUD = [
  Permission.read(Role.label("admin")),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
  Permission.read(Role.label("instrutor")),
  Permission.update(Role.label("instrutor")),
];

const COLLECTIONS = {
  [STAGES_COL]: [
    ...ADMIN_CRUD,
    // Visitante precisa listar etapas para achar a inicial (Triagem).
    Permission.read(Role.any()),
  ],
  [FORM_COL]: [
    ...ADMIN_CRUD,
    Permission.read(Role.any()),
  ],
  [CANDIDATES_COL]: [
    ...ADMIN_CRUD,
    Permission.create(Role.any()),
    Permission.read(Role.any()),
    Permission.update(Role.any()),
  ],
};

async function ensureCollectionPerms(collectionId, required) {
  const col = await db.getCollection(DB_ID, collectionId);
  const current = new Set(col.$permissions || []);
  const merged = [...current];
  let added = 0;
  for (const perm of required) {
    if (!current.has(perm)) {
      merged.push(perm);
      added += 1;
    }
  }
  if (added === 0) {
    console.log(`  ~ ${collectionId}: já ok`);
    return;
  }
  await db.updateCollection(DB_ID, collectionId, col.name, merged, col.documentSecurity, col.enabled);
  console.log(`  ✓ ${collectionId}: +${added} permissão(ões)`);
}

async function ensureBucketCreateAny() {
  if (!BUCKET_ID) {
    console.log("  ~ bucket: VITE_APPWRITE_BUCKET_ID ausente, pulando");
    return;
  }
  const bucket = await storage.getBucket(BUCKET_ID);
  const required = [
    Permission.read(Role.any()),
    Permission.create(Role.any()),
    Permission.read(Role.label("admin")),
    Permission.create(Role.label("admin")),
    Permission.update(Role.label("admin")),
    Permission.delete(Role.label("admin")),
  ];
  const current = new Set(bucket.$permissions || []);
  const merged = [...current];
  let added = 0;
  for (const perm of required) {
    if (!current.has(perm)) {
      merged.push(perm);
      added += 1;
    }
  }
  if (added === 0) {
    console.log(`  ~ bucket ${BUCKET_ID}: já ok`);
    return;
  }
  await storage.updateBucket(
    BUCKET_ID,
    bucket.name,
    merged,
    bucket.fileSecurity,
    bucket.enabled,
    bucket.maximumFileSize,
    bucket.allowedFileExtensions,
    bucket.compression,
    bucket.encryption,
    bucket.antivirus,
  );
  console.log(`  ✓ bucket ${BUCKET_ID}: +${added} permissão(ões) (create para visitantes)`);
}

console.log("\n▶ Corrigindo permissões públicas da admissão de instrutores...");
for (const [id, perms] of Object.entries(COLLECTIONS)) {
  try {
    await ensureCollectionPerms(id, perms);
  } catch (error) {
    console.error(`  ✗ ${id}: ${error?.message || error}`);
  }
}
try {
  await ensureBucketCreateAny();
} catch (error) {
  console.warn(`  ! bucket: ${error?.message || error}`);
}

console.log("\n✅ Permissões públicas da admissão de instrutores atualizadas.");
