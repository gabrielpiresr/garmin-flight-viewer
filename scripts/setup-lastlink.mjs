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
const WEBHOOK_FUNCTION_ID = "lastlink-webhook";
const PLATFORM_SETTINGS_ID = env.VITE_APPWRITE_PLATFORM_SETTINGS_COL_ID || "6a048f8a0018727e83ff";
if (!PROFILES_ID || !PLATFORM_SETTINGS_ID) {
  throw new Error("Defina VITE_APPWRITE_PROFILES_COLLECTION_ID e VITE_APPWRITE_PLATFORM_SETTINGS_COL_ID.");
}
const ADMIN_PERMS = [
  Permission.read(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

let webhookFunction;
try {
  webhookFunction = await functions.get({ functionId: WEBHOOK_FUNCTION_ID });
  await functions.update({
    functionId: WEBHOOK_FUNCTION_ID,
    name: "LastLink Webhook",
    runtime: "node-22",
    execute: ["any"],
    timeout: 30,
    enabled: true,
    logging: true,
    entrypoint: "src/main.js",
    commands: "npm install",
  });
  console.log("• função lastlink-webhook já existia e foi atualizada");
} catch (error) {
  if (Number(error?.code) !== 404) throw error;
  webhookFunction = await functions.create({
    functionId: WEBHOOK_FUNCTION_ID,
    name: "LastLink Webhook",
    runtime: "node-22",
    execute: ["any"],
    timeout: 30,
    enabled: true,
    logging: true,
    entrypoint: "src/main.js",
    commands: "npm install",
  });
  console.log("✓ função lastlink-webhook criada");
}

const existingVars = await functions.listVariables({ functionId: WEBHOOK_FUNCTION_ID, total: false });
async function upsertVar(key, value, secret = false) {
  if (!value) return;
  const found = existingVars.variables.find((item) => item.key === key);
  if (found) {
    await functions.updateVariable({ functionId: WEBHOOK_FUNCTION_ID, variableId: found.$id, key, value, secret });
  } else {
    await functions.createVariable({
      functionId: WEBHOOK_FUNCTION_ID,
      variableId: ID.unique(),
      key,
      value,
      secret,
    });
    existingVars.variables.push({ key });
  }
}

const settingDocs = await db.listDocuments(DATABASE_ID, PLATFORM_SETTINGS_ID, [
  Query.equal("key", ["lastlink"]),
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
const existingTokenVar = existingVars.variables.find((item) => item.key === "LASTLINK_WEBHOOK_TOKEN");
const currentToken = process.env.LASTLINK_WEBHOOK_TOKEN || savedWebhookToken || existingTokenVar?.value || crypto.randomBytes(24).toString("hex");
await upsertVar("APPWRITE_API_KEY", API_KEY, true);
await upsertVar("APPWRITE_DATABASE_ID", DATABASE_ID);
await upsertVar("APPWRITE_CAKTO_RECEIPTS_COLLECTION_ID", RECEIPTS_ID);
await upsertVar("APPWRITE_CRM_PROPOSALS_COLLECTION_ID", PROPOSALS_ID);
await upsertVar("APPWRITE_STUDENT_CREDITS_COLLECTION_ID", STUDENT_CREDITS_ID);
await upsertVar("APPWRITE_SCHOOL_COSTS_COLLECTION_ID", SCHOOL_COSTS_ID);
await upsertVar("APPWRITE_PROFILES_COLLECTION_ID", PROFILES_ID);
await upsertVar("APPWRITE_PLATFORM_SETTINGS_COLLECTION_ID", PLATFORM_SETTINGS_ID);
await upsertVar("LASTLINK_WEBHOOK_TOKEN", currentToken, true);
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
  key: "lastlink",
  settings_json: JSON.stringify({
    ...currentPublic,
    productSlug: currentPublic.productSlug || "creditosdehoradevoo",
    webhookUrl,
  }),
  secret_json: JSON.stringify(currentSecret),
  updated_at: new Date().toISOString(),
};
if (currentSetting) {
  await db.updateDocument(DATABASE_ID, PLATFORM_SETTINGS_ID, currentSetting.$id, settingData);
} else {
  await db.createDocument(DATABASE_ID, PLATFORM_SETTINGS_ID, ID.unique(), settingData, ADMIN_PERMS);
}

console.log("\nSetup LastLink concluído.");
console.log(`Cole esta URL no webhook da LastLink (produto creditosdehoradevoo):`);
console.log(webhookUrl);
console.log("Evento: Compra Completa (Purchase_Order_Confirmed)");
