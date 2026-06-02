import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases, ID, Permission, Query, Role } from "node-appwrite";

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

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("Missing env vars. Required: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const ADMIN_ONLY_PERMS = [
  Permission.read(Role.label("admin")),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

const CONTRACTS_PERMS = [
  Permission.read(Role.users()),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

const SIGNATURES_PERMS = [
  Permission.read(Role.users()),
  Permission.create(Role.users()),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function listAllCollections() {
  const out = [];
  let offset = 0;
  while (true) {
    const page = await db.listCollections(DATABASE_ID, [Query.limit(100), Query.offset(offset)]);
    out.push(...(page.collections || []));
    if (!page.collections || page.collections.length < 100 || out.length >= (page.total || 0)) break;
    offset += 100;
  }
  return out;
}

function envCollectionIdForName(name) {
  if (name === "contract_templates") return env.VITE_APPWRITE_CONTRACT_TEMPLATES_COL_ID || process.env.APPWRITE_CONTRACT_TEMPLATES_COL_ID;
  if (name === "contracts") return env.VITE_APPWRITE_CONTRACTS_COL_ID || process.env.APPWRITE_CONTRACTS_COL_ID;
  if (name === "contract_signatures") return env.VITE_APPWRITE_CONTRACT_SIGNATURES_COL_ID || process.env.APPWRITE_CONTRACT_SIGNATURES_COL_ID;
  return "";
}

async function ensureCollection(name, perms) {
  const collections = await listAllCollections();
  const envId = envCollectionIdForName(name);
  const found = collections.find((c) => c.$id === envId) || collections.find((c) => c.name === name);
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

async function idx(colId, key, attributes, orders = ["ASC"], type = "key") {
  try {
    await db.createIndex(DATABASE_ID, colId, key, type, attributes, orders);
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

async function setupContractTemplates() {
  console.log("\n[1/3] contract_templates...");
  const col = await ensureCollection("contract_templates", ADMIN_ONLY_PERMS);
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "school_id", 36, true), "school_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "name", 255, true), "name");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "standard_type", 20, false, ""), "standard_type");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "content_json", 65535, true), "content_json");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "custom_variables_json", 4096, false), "custom_variables_json");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "created_by", 36, false), "created_by");
  await attr(() => db.createDatetimeAttribute(DATABASE_ID, id, "created_at", false), "created_at");
  await attr(() => db.createDatetimeAttribute(DATABASE_ID, id, "updated_at", false), "updated_at");
  await sleep(3000);
  await idx(id, "tmpl_school_idx", ["school_id", "created_at"], ["ASC", "DESC"]);
  await idx(id, "tmpl_standard_idx", ["school_id", "standard_type"], ["ASC", "ASC"]);
  return id;
}

async function setupContracts() {
  console.log("\n[2/3] contracts...");
  const col = await ensureCollection("contracts", CONTRACTS_PERMS);
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "school_id", 36, true), "school_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "template_id", 36, true), "template_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "template_name", 255, false), "template_name");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "lead_id", 36, false), "lead_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "standard_type", 20, false, ""), "standard_type");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "contract_kind", 40, false, "standard_contract"), "contract_kind");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "recipient_user_id", 36, true), "recipient_user_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "recipient_name", 255, false), "recipient_name");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "content_resolved_json", 65535, false), "content_resolved_json");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "custom_var_values_json", 4096, false), "custom_var_values_json");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "status", 30, false, "pending"), "status");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "created_by", 36, false), "created_by");
  await attr(() => db.createDatetimeAttribute(DATABASE_ID, id, "created_at", false), "created_at");
  await attr(() => db.createDatetimeAttribute(DATABASE_ID, id, "signed_by_recipient_at", false), "signed_by_recipient_at");
  await attr(() => db.createDatetimeAttribute(DATABASE_ID, id, "signed_by_admin_at", false), "signed_by_admin_at");
  await attr(() => db.createDatetimeAttribute(DATABASE_ID, id, "email_sent_at", false), "email_sent_at");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "enrollment_pdf_file_id", 64, false), "enrollment_pdf_file_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "signed_pdf_file_id", 64, false), "signed_pdf_file_id");
  await sleep(3000);
  await idx(id, "contract_recipient_idx", ["school_id", "recipient_user_id"], ["ASC", "ASC"]);
  await idx(id, "contract_status_idx", ["school_id", "status", "created_at"], ["ASC", "ASC", "DESC"]);
  await idx(id, "contract_lead_idx", ["lead_id"], ["ASC"]);
  return id;
}

async function setupContractSignatures() {
  console.log("\n[3/3] contract_signatures...");
  const col = await ensureCollection("contract_signatures", SIGNATURES_PERMS);
  const id = col.$id;
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "contract_id", 36, true), "contract_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "signer_user_id", 36, true), "signer_user_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "signer_role", 20, false), "signer_role");
  await attr(() => db.createDatetimeAttribute(DATABASE_ID, id, "signed_at", true), "signed_at");
  await attr(() => db.createStringAttribute(DATABASE_ID, id, "school_id", 36, false), "school_id");
  await attr(() => db.createDatetimeAttribute(DATABASE_ID, id, "created_at", false), "created_at");
  await sleep(3000);
  await idx(id, "csig_contract_idx", ["contract_id"], ["ASC"]);
  return id;
}

async function main() {
  console.log("=== Appwrite Contract Collections Setup ===");
  console.log(`Database: ${DATABASE_ID}\n`);

  const templatesId = await setupContractTemplates();
  const contractsId = await setupContracts();
  const signaturesId = await setupContractSignatures();

  console.log("\n=== Setup Complete ===");
  console.log("Add these to your .env.local:\n");
  console.log(`VITE_APPWRITE_CONTRACT_TEMPLATES_COL_ID=${templatesId}`);
  console.log(`VITE_APPWRITE_CONTRACTS_COL_ID=${contractsId}`);
  console.log(`VITE_APPWRITE_CONTRACT_SIGNATURES_COL_ID=${signaturesId}`);
}

main().catch((error) => {
  console.error("Setup failed:", error?.message ?? error);
  process.exit(1);
});
