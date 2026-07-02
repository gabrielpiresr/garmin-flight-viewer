import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases, Functions, Query } from "node-appwrite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
const env = {};
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    env[line.slice(0, index)] = line.slice(index + 1);
  }
}

const endpoint = process.env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY || env.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID || env.VITE_APPWRITE_DATABASE_ID;
if (!endpoint || !projectId || !apiKey || !databaseId) throw new Error("Appwrite não configurado.");

const ids = [
  "student_automations", "student_automation_states", "student_automation_runs", "student_automation_step_runs",
  "student_automation_jobs", "student_automation_email_templates", "student_crm_statuses", "student_crm_profiles",
];
const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);
const functions = new Functions(client);
let failed = false;
for (const id of ids) {
  try {
    const collection = await databases.getCollection(databaseId, env[`VITE_APPWRITE_${id.toUpperCase()}_COL_ID`] || id);
    const pending = (collection.attributes || []).filter((attribute) => attribute.status !== "available");
    console.log(`OK ${id}: ${collection.attributes.length} atributos, ${collection.indexes.length} índices${pending.length ? `, ${pending.length} pendentes` : ""}`);
    if (pending.some((attribute) => attribute.status === "failed")) failed = true;
  } catch (error) {
    failed = true;
    console.error(`FALHA ${id}: ${error?.message || error}`);
  }
}
const statuses = await databases.listDocuments(databaseId, env.VITE_APPWRITE_STUDENT_CRM_STATUSES_COL_ID || "student_crm_statuses", []);
console.log(`OK status CRM: ${statuses.total || 0} etapa(s) configurada(s).`);
if ((statuses.total || 0) === 0) failed = true;

try {
  const functionId = env.VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID || "admin-users";
  const definition = await functions.get({ functionId });
  const requiredCollectionIds = [
    env.VITE_APPWRITE_COLLECTION_ID,
    env.VITE_APPWRITE_PROFILES_COLLECTION_ID,
    env.VITE_APPWRITE_STUDENT_TRACKS_COL_ID || "student_training_tracks",
    env.VITE_APPWRITE_STUDENT_CREDITS_COL_ID,
    env.VITE_APPWRITE_STUDENT_CRM_PROFILES_COL_ID || "student_crm_profiles",
  ].filter(Boolean);
  const configuredEvents = definition.events || [];
  const missingEventCollections = requiredCollectionIds.filter(
    (collectionId) => !configuredEvents.some((event) => event.includes(`collections.${collectionId}.documents.`)),
  );
  const requiredVariableKeys = [
    "APPWRITE_STUDENT_AUTOMATIONS_COLLECTION_ID",
    "APPWRITE_AUTOMATION_STATES_COLLECTION_ID",
    "APPWRITE_AUTOMATION_RUNS_COLLECTION_ID",
    "APPWRITE_AUTOMATION_STEP_RUNS_COLLECTION_ID",
    "APPWRITE_AUTOMATION_JOBS_COLLECTION_ID",
    "APPWRITE_AUTOMATION_EMAIL_TEMPLATES_COLLECTION_ID",
    "APPWRITE_STUDENT_CRM_STATUSES_COLLECTION_ID",
    "APPWRITE_STUDENT_CRM_PROFILES_COLLECTION_ID",
    "SCHOOL_TIMEZONE",
  ];
  const allVariables = [];
  let variableOffset = 0;
  while (true) {
    const page = await functions.listVariables({
      functionId,
      queries: [Query.limit(100), Query.offset(variableOffset)],
    });
    allVariables.push(...(page.variables || []));
    if (!page.variables || page.variables.length < 100 || allVariables.length >= (page.total || 0)) break;
    variableOffset += 100;
  }
  const variableKeys = new Set(allVariables.map((variable) => variable.key));
  const missingVariables = requiredVariableKeys.filter((key) => !variableKeys.has(key));
  const deploymentReady = Boolean(definition.deploymentId);
  console.log(`OK function ${functionId}: deployment ${definition.deploymentId || "ausente"}, agenda ${definition.schedule || "ausente"}, ${configuredEvents.length} evento(s).`);
  if (!deploymentReady || missingEventCollections.length || missingVariables.length) {
    failed = true;
    if (!deploymentReady) console.error("FALHA function: nenhum deployment ativo.");
    if (missingEventCollections.length) console.error(`FALHA eventos: ${missingEventCollections.join(", ")}`);
    if (missingVariables.length) console.error(`FALHA variáveis: ${missingVariables.join(", ")}`);
  }
} catch (error) {
  failed = true;
  console.error(`FALHA function: ${error?.message || error}`);
}
if (failed) process.exit(1);
