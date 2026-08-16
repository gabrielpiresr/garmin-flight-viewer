import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases, Permission, Role } from "node-appwrite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");

function readEnv() {
  if (!fs.existsSync(envPath)) return {};
  return Object.fromEntries(
    fs.readFileSync(envPath, "utf8").split(/\r?\n/).flatMap((line) => {
      const index = line.indexOf("=");
      if (index <= 0 || line.trim().startsWith("#")) return [];
      return [[line.slice(0, index).trim(), line.slice(index + 1).trim()]];
    }),
  );
}

function upsertEnvLocal(entries) {
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const lines = existing ? existing.split(/\r?\n/) : [];
  const map = new Map(Object.entries(entries));
  const next = lines.map((line) => {
    const index = line.indexOf("=");
    if (index <= 0 || line.trim().startsWith("#")) return line;
    const key = line.slice(0, index).trim();
    if (!map.has(key)) return line;
    const value = map.get(key);
    map.delete(key);
    return `${key}=${value}`;
  });
  for (const [key, value] of map.entries()) next.push(`${key}=${value}`);
  fs.writeFileSync(envPath, `${next.join("\n").replace(/\n*$/, "\n")}`, "utf8");
}

const env = readEnv();
const ENDPOINT = process.env.APPWRITE_ENDPOINT || env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY || env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || env.APPWRITE_DATABASE_ID || env.VITE_APPWRITE_DATABASE_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("Missing env vars. Required: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const ADMIN_CUD = [
  Permission.read(Role.label("admin")),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

const FUNCTION_ONLY = [
  Permission.read(Role.label("admin")),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

const COLLECTIONS = [
  {
    id: "provas",
    name: "provas",
    perms: ADMIN_CUD,
    documentSecurity: false,
    attributes: async (cid) => {
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "school_id", 64, true), "school_id");
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "title", 255, true), "title");
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "description", 4096, false), "description");
      await attr(cid, () => db.createIntegerAttribute(DATABASE_ID, cid, "passing_percent", true, 0, 100), "passing_percent");
      await attr(cid, () => db.createIntegerAttribute(DATABASE_ID, cid, "time_limit_hours", true, 1, 720), "time_limit_hours");
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "status", 24, true), "status");
      await idx(cid, "provas_school_idx", ["school_id"]);
      await idx(cid, "provas_school_status_idx", ["school_id", "status"], ["ASC", "ASC"]);
    },
  },
  {
    id: "prova_categories",
    name: "prova_categories",
    perms: ADMIN_CUD,
    documentSecurity: false,
    attributes: async (cid) => {
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "school_id", 64, true), "school_id");
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "prova_id", 36, true), "prova_id");
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "name", 160, true), "name");
      await attr(cid, () => db.createIntegerAttribute(DATABASE_ID, cid, "order", true), "order");
      await attr(cid, () => db.createIntegerAttribute(DATABASE_ID, cid, "draw_count", true, 0, 200), "draw_count");
      await idx(cid, "prova_categories_prova_idx", ["prova_id"]);
      await idx(cid, "prova_categories_prova_order_idx", ["prova_id", "order"], ["ASC", "ASC"]);
    },
  },
  {
    id: "prova_questions",
    name: "prova_questions",
    perms: ADMIN_CUD,
    documentSecurity: false,
    attributes: async (cid) => {
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "school_id", 64, true), "school_id");
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "prova_id", 36, true), "prova_id");
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "category_id", 36, true), "category_id");
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "type", 16, true), "type");
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "title", 255, true), "title");
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "description", 4096, false), "description");
      await attr(cid, () => db.createIntegerAttribute(DATABASE_ID, cid, "order", true), "order");
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "payload_json", 16384, true), "payload_json");
      await idx(cid, "prova_questions_category_idx", ["category_id"]);
      await idx(cid, "prova_questions_prova_idx", ["prova_id"]);
      await idx(cid, "prova_questions_cat_order_idx", ["category_id", "order"], ["ASC", "ASC"]);
    },
  },
  {
    id: "prova_assignments",
    name: "prova_assignments",
    perms: FUNCTION_ONLY,
    documentSecurity: true,
    attributes: async (cid) => {
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "school_id", 64, true), "school_id");
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "prova_id", 36, true), "prova_id");
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "prova_title", 255, true), "prova_title");
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "prova_description", 4096, false), "prova_description");
      await attr(cid, () => db.createIntegerAttribute(DATABASE_ID, cid, "passing_percent", true, 0, 100), "passing_percent");
      await attr(cid, () => db.createIntegerAttribute(DATABASE_ID, cid, "time_limit_hours", true, 1, 720), "time_limit_hours");
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "student_user_id", 36, true), "student_user_id");
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "student_name", 255, false), "student_name");
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "released_at", 40, true), "released_at");
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "expires_at", 40, true), "expires_at");
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "status", 24, true), "status");
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "attempt_id", 36, false), "attempt_id");
      await attr(cid, () => db.createFloatAttribute(DATABASE_ID, cid, "score_percent", false, 0, 100), "score_percent");
      await attr(cid, () => db.createBooleanAttribute(DATABASE_ID, cid, "passed", false), "passed");
      await idx(cid, "prova_assign_student_idx", ["student_user_id"]);
      await idx(cid, "prova_assign_school_idx", ["school_id"]);
      await idx(cid, "prova_assign_prova_idx", ["prova_id"]);
      await idx(cid, "prova_assign_status_idx", ["school_id", "status"], ["ASC", "ASC"]);
    },
  },
  {
    id: "prova_attempts",
    name: "prova_attempts",
    perms: FUNCTION_ONLY,
    documentSecurity: true,
    attributes: async (cid) => {
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "school_id", 64, true), "school_id");
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "assignment_id", 36, true), "assignment_id");
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "prova_id", 36, true), "prova_id");
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "student_user_id", 36, true), "student_user_id");
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "status", 24, true), "status");
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "started_at", 40, true), "started_at");
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "submitted_at", 40, false), "submitted_at");
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "expires_at", 40, true), "expires_at");
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "questions_json", 16384, true), "questions_json");
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "answers_json", 16384, false), "answers_json");
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "results_json", 16384, false), "results_json");
      await attr(cid, () => db.createStringAttribute(DATABASE_ID, cid, "scoring_json", 16384, false), "scoring_json");
      await attr(cid, () => db.createFloatAttribute(DATABASE_ID, cid, "score_percent", false, 0, 100), "score_percent");
      await attr(cid, () => db.createBooleanAttribute(DATABASE_ID, cid, "passed", false), "passed");
      await idx(cid, "prova_attempts_assign_idx", ["assignment_id"]);
      await idx(cid, "prova_attempts_student_idx", ["student_user_id"]);
    },
  },
];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureCollection(id, name, perms, documentSecurity) {
  try {
    const collection = await db.getCollection(DATABASE_ID, id);
    await db.updateCollection(DATABASE_ID, id, name, perms, documentSecurity, true);
    console.log(`  • Collection already exists (${collection.$id})`);
    return collection;
  } catch (error) {
    const message = error?.message ?? String(error);
    const normalized = message.toLowerCase();
    if (!normalized.includes("not found") && !normalized.includes("could not be found")) throw error;
  }

  const collection = await db.createCollection(DATABASE_ID, id, name, perms, documentSecurity, true);
  console.log(`  ✓ Created collection (${collection.$id})`);
  return collection;
}

async function attr(collectionId, createFn, label) {
  try {
    await createFn();
    await sleep(700);
    console.log(`     ✓ ${collectionId}.${label}`);
  } catch (error) {
    const message = error?.message ?? String(error);
    if (message.toLowerCase().includes("already exists")) {
      console.log(`     • ${collectionId}.${label} (already exists)`);
      return;
    }
    throw error;
  }
}

async function idx(collectionId, key, attributes, orders = ["ASC"]) {
  try {
    await db.createIndex(DATABASE_ID, collectionId, key, "key", attributes, orders);
    await sleep(700);
    console.log(`     ✓ index ${key}`);
  } catch (error) {
    const message = error?.message ?? String(error);
    if (message.toLowerCase().includes("already exists")) {
      console.log(`     • index ${key} (already exists)`);
      return;
    }
    throw error;
  }
}

async function main() {
  console.log("=== Appwrite Provas Setup ===");
  console.log(`Database: ${DATABASE_ID}`);
  for (const collection of COLLECTIONS) {
    console.log(`\n${collection.id}`);
    await ensureCollection(collection.id, collection.name, collection.perms, collection.documentSecurity);
    await collection.attributes(collection.id);
  }
  upsertEnvLocal({
    VITE_APPWRITE_PROVAS_COL_ID: "provas",
    VITE_APPWRITE_PROVA_CATEGORIES_COL_ID: "prova_categories",
    VITE_APPWRITE_PROVA_QUESTIONS_COL_ID: "prova_questions",
    VITE_APPWRITE_PROVA_ASSIGNMENTS_COL_ID: "prova_assignments",
    VITE_APPWRITE_PROVA_ATTEMPTS_COL_ID: "prova_attempts",
    APPWRITE_PROVAS_COL_ID: "provas",
    APPWRITE_PROVA_CATEGORIES_COL_ID: "prova_categories",
    APPWRITE_PROVA_QUESTIONS_COL_ID: "prova_questions",
    APPWRITE_PROVA_ASSIGNMENTS_COL_ID: "prova_assignments",
    APPWRITE_PROVA_ATTEMPTS_COL_ID: "prova_attempts",
  });
  console.log("\nUpdated .env.local with provas collection IDs.");
}

main().catch((error) => {
  console.error("Setup failed:", error?.message ?? error);
  process.exit(1);
});
