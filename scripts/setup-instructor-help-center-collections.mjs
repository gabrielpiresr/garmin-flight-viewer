import { Client, Databases, ID, Permission, Role } from "node-appwrite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

function upsertEnvLine(filePath, key, value) {
  const lines = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8").split(/\r?\n/) : [];
  const nextLine = `${key}=${value}`;
  const index = lines.findIndex((line) => line.startsWith(`${key}=`));
  if (index >= 0) lines[index] = nextLine;
  else {
    if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
    lines.push(nextLine);
  }
  fs.writeFileSync(filePath, lines.join("\n"));
}

const fileEnv = parseEnvFile(envPath);
const env = (key, fallbackKey) => process.env[key] || fileEnv[key] || (fallbackKey ? fileEnv[fallbackKey] : undefined);

const ENDPOINT = env("APPWRITE_ENDPOINT", "VITE_APPWRITE_ENDPOINT");
const PROJECT_ID = env("APPWRITE_PROJECT_ID", "VITE_APPWRITE_PROJECT_ID");
const API_KEY = process.env.APPWRITE_API_KEY || fileEnv.APPWRITE_API_KEY;
const DATABASE_ID = env("APPWRITE_DATABASE_ID", "VITE_APPWRITE_DATABASE_ID");

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("Missing env vars. Required: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const CONTENT_PERMS = [
  Permission.read(Role.users()),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

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
  console.log("\n[1/2] instructor_help_sections...");
  const col = await ensureCollection("instructor_help_sections");
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "school_id", 64, true), "school_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "title", 255, true), "title");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "description", 2048, false), "description");
  await attr(() => db.createIntegerAttribute(DATABASE_ID, id, "order", true), "order");
  await attr(() => db.createBooleanAttribute(DATABASE_ID, id, "is_published", true), "is_published");
  await idx(id, "inst_help_sec_school_idx", ["school_id"]);
  await idx(id, "inst_help_sec_order_idx", ["order"]);
  await idx(id, "inst_help_sec_pub_order_idx", ["is_published", "order"], ["ASC", "ASC"]);
  return id;
}

async function setupArticles() {
  console.log("\n[2/2] instructor_help_articles...");
  const col = await ensureCollection("instructor_help_articles");
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
  await idx(id, "inst_help_art_school_idx", ["school_id"]);
  await idx(id, "inst_help_art_section_idx", ["section_id"]);
  await idx(id, "inst_help_art_pub_order_idx", ["is_published", "order"], ["ASC", "ASC"]);
  return id;
}

async function main() {
  console.log("=== Appwrite Instructor Help Center Setup ===");
  console.log(`Database: ${DATABASE_ID}\n`);
  const sectionsId = await setupSections();
  const articlesId = await setupArticles();

  console.log("\n=== Setup Complete ===");
  console.log("Add these to your .env.local:\n");
  console.log(`VITE_APPWRITE_INSTRUCTOR_HELP_SECTIONS_COL_ID=${sectionsId}`);
  console.log(`VITE_APPWRITE_INSTRUCTOR_HELP_ARTICLES_COL_ID=${articlesId}`);
  console.log("\nAlso set on admin-users function:");
  console.log(`APPWRITE_INSTRUCTOR_HELP_SECTIONS_COLLECTION_ID=${sectionsId}`);
  console.log(`APPWRITE_INSTRUCTOR_HELP_ARTICLES_COLLECTION_ID=${articlesId}`);

  upsertEnvLine(envPath, "VITE_APPWRITE_INSTRUCTOR_HELP_SECTIONS_COL_ID", sectionsId);
  upsertEnvLine(envPath, "VITE_APPWRITE_INSTRUCTOR_HELP_ARTICLES_COL_ID", articlesId);
  upsertEnvLine(envPath, "APPWRITE_INSTRUCTOR_HELP_SECTIONS_COLLECTION_ID", sectionsId);
  upsertEnvLine(envPath, "APPWRITE_INSTRUCTOR_HELP_ARTICLES_COLLECTION_ID", articlesId);
  console.log("\nUpdated .env.local with instructor help collection IDs.");
}

main().catch((error) => {
  console.error("Setup failed:", error?.message ?? error);
  process.exit(1);
});
