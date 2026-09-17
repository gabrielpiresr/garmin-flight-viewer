import fs from "node:fs";
import { Client, Databases, Functions, Query } from "node-appwrite";

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

function normalizeDigits(value) {
  return String(value || "").replace(/\D+/g, "");
}

function parseResponse(body) {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

async function listAllProfiles(databases, databaseId, profilesCollectionId) {
  const profiles = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const page = await databases.listDocuments(databaseId, profilesCollectionId, [
      Query.limit(limit),
      Query.offset(offset),
      Query.orderAsc("$id"),
    ]);
    profiles.push(...page.documents);
    if (page.documents.length < limit) break;
    offset += page.documents.length;
  }
  return profiles;
}

async function runLimited(items, limit, worker) {
  let index = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await worker(current);
    }
  });
  await Promise.all(workers);
}

const env = {
  ...parseEnvFile(".env.local"),
  ...process.env,
};

const endpoint = env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
const projectId = env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
const apiKey = env.APPWRITE_API_KEY;
const databaseId = env.APPWRITE_DATABASE_ID || env.VITE_APPWRITE_DATABASE_ID;
const profilesCollectionId = env.APPWRITE_PROFILES_COLLECTION_ID || env.VITE_APPWRITE_PROFILES_COLLECTION_ID;
const functionId = env.APPWRITE_SYNC_ANAC_FUNCTION_ID || env.VITE_APPWRITE_SYNC_ANAC_FUNCTION_ID || "sync-anac-profile";
const concurrency = Math.max(1, Math.min(5, Number(env.ANAC_EXAM_BACKFILL_CONCURRENCY || 2)));

const missing = [];
if (!endpoint) missing.push("APPWRITE_ENDPOINT/VITE_APPWRITE_ENDPOINT");
if (!projectId) missing.push("APPWRITE_PROJECT_ID/VITE_APPWRITE_PROJECT_ID");
if (!apiKey) missing.push("APPWRITE_API_KEY");
if (!databaseId) missing.push("APPWRITE_DATABASE_ID/VITE_APPWRITE_DATABASE_ID");
if (!profilesCollectionId) missing.push("APPWRITE_PROFILES_COLLECTION_ID/VITE_APPWRITE_PROFILES_COLLECTION_ID");
if (missing.length) {
  throw new Error(`Missing env vars: ${missing.join(", ")}`);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);
const functions = new Functions(client);

console.log("Listando perfis...");
const profiles = await listAllProfiles(databases, databaseId, profilesCollectionId);
const candidates = profiles
  .map((profile) => ({
    profileId: profile.$id,
    userId: String(profile.user_id || "").trim(),
    cpf: normalizeDigits(profile.cpf).slice(0, 11),
  }))
  .filter((profile) => profile.userId && profile.cpf.length === 11);

const skipped = profiles.length - candidates.length;
const summary = {
  totalProfiles: profiles.length,
  candidates: candidates.length,
  skipped,
  updatedWithResults: 0,
  updatedEmpty: 0,
  pending: 0,
  failed: 0,
};

console.log(`Perfis encontrados: ${profiles.length}`);
console.log(`Candidatos com CPF: ${candidates.length}`);
console.log(`Ignorados sem CPF/user_id: ${skipped}`);
console.log(`Concorrencia: ${concurrency}`);

await runLimited(candidates, concurrency, async (profile) => {
  try {
    const execution = await functions.createExecution({
      functionId,
      body: JSON.stringify({
        userId: profile.userId,
        cpf: profile.cpf,
        examOnly: true,
      }),
      async: false,
    });
    const response = parseResponse(execution.responseBody);
    if (execution.status !== "completed" || response.pending === true || response.examPending === true) {
      summary.pending += 1;
      console.log(`[pendente] ${profile.userId} :: ${response.message || execution.status}`);
      return;
    }
    if (Number(response.examResults || 0) > 0) {
      summary.updatedWithResults += 1;
      console.log(`[ok] ${profile.userId} :: ${response.examResults} resultado(s)`);
      return;
    }
    summary.updatedEmpty += 1;
    console.log(`[vazio] ${profile.userId}`);
  } catch (error) {
    summary.failed += 1;
    console.log(`[erro] ${profile.userId} :: ${error?.message || error}`);
  }
});

console.log("Resumo:");
console.log(JSON.stringify(summary, null, 2));
