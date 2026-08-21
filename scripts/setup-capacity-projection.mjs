import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases, Permission, Role } from "node-appwrite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");

function parseEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, "utf8").split(/\r?\n/).filter((line) => line && !line.trim().startsWith("#") && line.includes("=")).map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1)];
  }));
}

function upsertEnv(file, key, value) {
  const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/) : [];
  const next = `${key}=${value}`;
  const index = lines.findIndex((line) => line.startsWith(`${key}=`));
  if (index >= 0) lines[index] = next;
  else lines.push(next);
  fs.writeFileSync(file, lines.join("\n"));
}

const env = parseEnv(envPath);
const endpoint = process.env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY || env.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID || env.VITE_APPWRITE_DATABASE_ID;
if (!endpoint || !projectId || !apiKey || !databaseId) {
  throw new Error("Configure endpoint, project, API key e database do Appwrite.");
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);
const perms = [
  Permission.read(Role.label("admin")),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const COLLECTION_ID = "capacity_student_profiles";

async function ensureCollection() {
  try {
    return await databases.getCollection(databaseId, COLLECTION_ID);
  } catch (error) {
    if (error?.code !== 404) throw error;
    return databases.createCollection(databaseId, COLLECTION_ID, "Capacity Student Profiles", perms, true, true);
  }
}

async function ensureAttr(createFn, label) {
  try {
    await createFn();
    await sleep(400);
    console.log(`  ✓ ${label}`);
  } catch (error) {
    if (String(error?.message || error).toLowerCase().includes("already exists")) {
      console.log(`  • ${label} (already exists)`);
      return;
    }
    throw error;
  }
}

const collection = await ensureCollection();
console.log(`Coleção ${collection.name} (${collection.$id})`);
await ensureAttr(() => databases.createStringAttribute(databaseId, collection.$id, "school_id", 64, true), "school_id");
await ensureAttr(() => databases.createStringAttribute(databaseId, collection.$id, "student_user_id", 64, true), "student_user_id");
await ensureAttr(() => databases.createStringAttribute(databaseId, collection.$id, "calendar_mode", 16, false), "calendar_mode");
await ensureAttr(() => databases.createStringAttribute(databaseId, collection.$id, "intensity", 16, false), "intensity");
await ensureAttr(() => databases.createStringAttribute(databaseId, collection.$id, "course_code", 8, false), "course_code");
await ensureAttr(() => databases.createBooleanAttribute(databaseId, collection.$id, "excluded", false, false), "excluded");
await ensureAttr(() => databases.createStringAttribute(databaseId, collection.$id, "paused_until", 10, false), "paused_until");
await ensureAttr(() => databases.createStringAttribute(databaseId, collection.$id, "notes", 500, false), "notes");
await ensureAttr(() => databases.createFloatAttribute(databaseId, collection.$id, "hours_adjustment", false), "hours_adjustment");
try {
  await databases.createIndex(databaseId, collection.$id, "capacity_student_unique_idx", "unique", ["student_user_id"], ["ASC"]);
  await sleep(400);
  console.log("  ✓ index student_user_id");
} catch (error) {
  if (!String(error?.message || error).toLowerCase().includes("already exists")) throw error;
  console.log("  • index student_user_id (already exists)");
}
try {
  await databases.createIndex(databaseId, collection.$id, "capacity_student_school_idx", "key", ["school_id"], ["ASC"]);
  await sleep(400);
  console.log("  ✓ index school_id");
} catch (error) {
  if (!String(error?.message || error).toLowerCase().includes("already exists")) throw error;
  console.log("  • index school_id (already exists)");
}
upsertEnv(envPath, "VITE_APPWRITE_CAPACITY_STUDENT_PROFILES_COL_ID", collection.$id);
console.log("Setup concluído. ID gravado em .env.local.");
