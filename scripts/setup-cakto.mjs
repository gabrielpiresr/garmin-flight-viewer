import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  Client,
  Databases,
  Functions,
  ID,
  Permission,
  Query,
  Role,
} from "node-appwrite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");

function readEnv() {
  if (!fs.existsSync(envPath)) return {};
  return Object.fromEntries(fs.readFileSync(envPath, "utf8").split(/\r?\n/).flatMap((line) => {
    const index = line.indexOf("=");
    if (index <= 0 || line.trim().startsWith("#")) return [];
    return [[line.slice(0, index).trim(), line.slice(index + 1).trim()]];
  }));
}

const env = readEnv();
const ENDPOINT = process.env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY || env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || env.VITE_APPWRITE_DATABASE_ID;
if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  throw new Error("Defina APPWRITE_API_KEY e as configurações Appwrite.");
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);
const functions = new Functions(client);
const RECEIPTS_ID = "cakto_receipts";
const PROPOSALS_ID = "crm_proposals";
const STUDENT_CREDITS_ID = env.VITE_APPWRITE_STUDENT_CREDITS_COL_ID || "student_credits";
const SCHOOL_COSTS_ID = env.VITE_APPWRITE_SCHOOL_COSTS_COL_ID || "school_costs";
const PROFILES_ID = env.VITE_APPWRITE_PROFILES_COLLECTION_ID || "";
const WEBHOOK_FUNCTION_ID = "cakto-webhook";
const PLATFORM_SETTINGS_ID = env.VITE_APPWRITE_PLATFORM_SETTINGS_COL_ID || "6a048f8a0018727e83ff";
if (!PROFILES_ID || !PLATFORM_SETTINGS_ID) {
  throw new Error("Defina VITE_APPWRITE_PROFILES_COLLECTION_ID e VITE_APPWRITE_PLATFORM_SETTINGS_COL_ID.");
}
const ADMIN_PERMS = [
  Permission.read(Role.label("admin")),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function ignoreConflict(label, operation) {
  try {
    await operation();
    console.log(`✓ ${label}`);
    await wait(500);
  } catch (error) {
    if (Number(error?.code) === 409 || /already exists/i.test(error?.message || "")) {
      console.log(`• ${label} já existe`);
      return;
    }
    throw error;
  }
}

await ignoreConflict("coleção cakto_receipts", () =>
  db.createCollection(DATABASE_ID, RECEIPTS_ID, "Cakto Receipts", ADMIN_PERMS, true, true));

const stringAttrs = [
  ["school_id", 100, true],
  ["dedupe_key", 64, true],
  ["event_id", 255, false],
  ["event_type", 64, true],
  ["order_id", 255, false],
  ["offer_id", 255, false],
  ["product_id", 255, false],
  ["proposal_id", 36, false],
  ["customer_name", 255, false],
  ["customer_email", 255, false],
  ["currency", 8, false],
  ["payment_method", 64, false],
  ["status", 64, false],
  ["payload_json", 65535, true],
  ["fulfillment_status", 32, false],
  ["fulfillment_error", 2048, false],
  ["credit_id", 36, false],
  ["saga_status", 32, false],
  ["saga_error", 2048, false],
  ["saga_credit_marker", 255, false],
];
for (const [key, size, required] of stringAttrs) {
  await ignoreConflict(`atributo ${key}`, () => db.createStringAttribute(DATABASE_ID, RECEIPTS_ID, key, size, required));
}
await ignoreConflict("atributo amount", () => db.createFloatAttribute(DATABASE_ID, RECEIPTS_ID, "amount", false, 0));
await ignoreConflict("atributo event_at", () => db.createDatetimeAttribute(DATABASE_ID, RECEIPTS_ID, "event_at", false));
await ignoreConflict("atributo received_at", () => db.createDatetimeAttribute(DATABASE_ID, RECEIPTS_ID, "received_at", true));
await ignoreConflict("atributo fulfillment_updated_at", () => db.createDatetimeAttribute(DATABASE_ID, RECEIPTS_ID, "fulfillment_updated_at", false));
await ignoreConflict("atributo saga_updated_at", () => db.createDatetimeAttribute(DATABASE_ID, RECEIPTS_ID, "saga_updated_at", false));

for (const [key, attributes, orders] of [
  ["cakto_dedupe_unique", ["dedupe_key"], ["ASC"]],
  ["cakto_received_idx", ["received_at"], ["DESC"]],
  ["cakto_event_idx", ["event_type"], ["ASC"]],
  ["cakto_offer_idx", ["offer_id"], ["ASC"]],
  ["cakto_payment_idx", ["payment_method"], ["ASC"]],
]) {
  await ignoreConflict(`índice ${key}`, () => db.createIndex(DATABASE_ID, RECEIPTS_ID, key, key.includes("unique") ? "unique" : "key", attributes, orders));
}

await ignoreConflict("índice crm_proposals.cakto_offer", () => db.createIndex(DATABASE_ID, PROPOSALS_ID, "idx_cakto_offer_id", "key", ["cakto_offer_id"], ["ASC"]));

let webhookFunction;
try {
  webhookFunction = await functions.get({ functionId: WEBHOOK_FUNCTION_ID });
  await functions.update({
    functionId: WEBHOOK_FUNCTION_ID,
    name: "Cakto Webhook",
    runtime: "node-22",
    execute: ["any"],
    timeout: 30,
    enabled: true,
    logging: true,
    entrypoint: "src/main.js",
    commands: "npm install",
  });
} catch (error) {
  if (Number(error?.code) !== 404) throw error;
  webhookFunction = await functions.create({
    functionId: WEBHOOK_FUNCTION_ID,
    name: "Cakto Webhook",
    runtime: "node-22",
    execute: ["any"],
    timeout: 30,
    enabled: true,
    logging: true,
    entrypoint: "src/main.js",
    commands: "npm install",
  });
  console.log("✓ função cakto-webhook criada");
}

const existingVars = await functions.listVariables({ functionId: WEBHOOK_FUNCTION_ID, total: false });
async function upsertVar(key, value, secret = false) {
  const found = existingVars.variables.find((item) => item.key === key);
  if (found) {
    await functions.updateVariable({ functionId: WEBHOOK_FUNCTION_ID, variableId: found.$id, key, value, secret });
  } else {
    await functions.createVariable({ functionId: WEBHOOK_FUNCTION_ID, variableId: key.toLowerCase().replace(/_/g, "-").slice(0, 36), key, value, secret });
  }
}
const settingDocs = await db.listDocuments(DATABASE_ID, PLATFORM_SETTINGS_ID, [
  Query.equal("key", ["cakto"]),
  Query.limit(1),
]);
const currentSetting = settingDocs.documents[0];
const currentPublic = currentSetting?.settings_json ? JSON.parse(currentSetting.settings_json) : {};
const currentSecret = currentSetting?.secret_json ? JSON.parse(currentSetting.secret_json) : {};
let savedWebhookToken = "";
try {
  savedWebhookToken = new URL(currentPublic.webhookUrl || "").searchParams.get("token") || "";
} catch {
  savedWebhookToken = "";
}
const currentToken = process.env.CAKTO_WEBHOOK_TOKEN || savedWebhookToken || crypto.randomBytes(24).toString("hex");
await upsertVar("APPWRITE_API_KEY", API_KEY, true);
await upsertVar("APPWRITE_DATABASE_ID", DATABASE_ID);
await upsertVar("APPWRITE_CAKTO_RECEIPTS_COLLECTION_ID", RECEIPTS_ID);
await upsertVar("APPWRITE_CRM_PROPOSALS_COLLECTION_ID", PROPOSALS_ID);
await upsertVar("APPWRITE_STUDENT_CREDITS_COLLECTION_ID", STUDENT_CREDITS_ID);
await upsertVar("APPWRITE_SCHOOL_COSTS_COLLECTION_ID", SCHOOL_COSTS_ID);
await upsertVar("APPWRITE_PROFILES_COLLECTION_ID", PROFILES_ID);
await upsertVar("APPWRITE_PLATFORM_SETTINGS_COLLECTION_ID", PLATFORM_SETTINGS_ID);
await upsertVar("CAKTO_WEBHOOK_TOKEN", currentToken, true);
await upsertVar("SCHOOL_ID", env.VITE_SCHOOL_ID || "escola_principal");
await upsertVar("ADMIN_USERS_FUNCTION_ID", env.VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID || "admin-users");
await upsertVar("SAGA_BASE_URL", "https://epeac.saga.aero");
await upsertVar("SAGA_CREDIT_BANK_ID", "6");
await upsertVar("SAGA_CREDIT_TYPE", "GENERIC");
await upsertVar("SAGA_CREDIT_AIRCRAFT_ICAO", "MC01");

const proxyHeaders = {
  "X-Appwrite-Project": PROJECT_ID,
  "X-Appwrite-Key": API_KEY,
  "Content-Type": "application/json",
};
const rulesResponse = await fetch(`${ENDPOINT}/proxy/rules`, { headers: proxyHeaders });
const rulesBody = await rulesResponse.json();
let webhookDomain = rulesBody.rules?.find((rule) =>
  rule.deploymentResourceType === "function" && rule.deploymentResourceId === WEBHOOK_FUNCTION_ID)?.domain;
if (!webhookDomain) {
  const region = new URL(ENDPOINT).hostname.split(".")[0] || "sfo";
  webhookDomain = `${crypto.randomBytes(10).toString("hex")}.${region}.appwrite.run`;
  const createRule = await fetch(`${ENDPOINT}/proxy/rules/function`, {
    method: "POST",
    headers: proxyHeaders,
    body: JSON.stringify({ domain: webhookDomain, functionId: WEBHOOK_FUNCTION_ID, branch: "" }),
  });
  if (!createRule.ok) throw new Error(`Falha ao criar domínio: ${await createRule.text()}`);
  console.log(`✓ domínio ${webhookDomain} criado`);
}

const webhookUrl = `https://${webhookDomain}/?token=${encodeURIComponent(currentToken)}`;
const settingData = {
  key: "cakto",
  settings_json: JSON.stringify({ ...currentPublic, webhookUrl }),
  secret_json: JSON.stringify(currentSecret),
  updated_at: new Date().toISOString(),
};
if (currentSetting) {
  await db.updateDocument(DATABASE_ID, PLATFORM_SETTINGS_ID, currentSetting.$id, settingData);
} else {
  await db.createDocument(DATABASE_ID, PLATFORM_SETTINGS_ID, ID.unique(), settingData, ADMIN_PERMS);
}

console.log("\nSetup concluído.");
console.log(`Webhook: ${webhookUrl}`);
