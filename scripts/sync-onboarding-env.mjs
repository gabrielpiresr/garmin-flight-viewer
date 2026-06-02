/**
 * Descobre IDs de onboarding no Appwrite e grava em .env.local
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases, Query, Storage } from "node-appwrite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env.local");

const ENDPOINT = process.env.APPWRITE_ENDPOINT || "https://sfo.cloud.appwrite.io/v1";
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || "6a01ac8a0009fbf94f05";
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || "6a01afae001bc352d1b1";

if (!API_KEY) {
  console.error("Defina APPWRITE_API_KEY");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);
const storage = new Storage(client);

function upsertEnvLine(lines, key, value) {
  const nextLine = `${key}=${value}`;
  const index = lines.findIndex((line) => line.startsWith(`${key}=`));
  if (index >= 0) lines[index] = nextLine;
  else lines.push(nextLine);
  return lines;
}

async function listAllCollections() {
  const all = [];
  let offset = 0;
  while (true) {
    const page = await db.listCollections(DATABASE_ID, [Query.limit(100), Query.offset(offset)]);
    all.push(...(page.collections || []));
    if (!page.collections?.length || page.collections.length < 100) break;
    offset += 100;
  }
  return all;
}

async function main() {
  const cols = await listAllCollections();
  const stepsCols = cols.filter((c) => c.name === "onboarding_steps");
  const stepsCol = stepsCols.sort((a, b) => (b.$createdAt || "").localeCompare(a.$createdAt || ""))[0];
  const platformCol = cols.find((c) => c.name === "platform_settings");

  const buckets = await storage.listBuckets();
  const onboardingBucket = buckets.buckets.find((b) => b.name === "onboarding-media");

  if (!stepsCol) {
    console.error("Coleção onboarding_steps não encontrada. Rode: npm run appwrite:setup-onboarding");
    process.exit(1);
  }

  const lines = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8").split(/\r?\n/) : [];
  upsertEnvLine(lines, "VITE_APPWRITE_ENDPOINT", ENDPOINT);
  upsertEnvLine(lines, "VITE_APPWRITE_PROJECT_ID", PROJECT_ID);
  upsertEnvLine(lines, "VITE_APPWRITE_DATABASE_ID", DATABASE_ID);
  upsertEnvLine(lines, "VITE_APPWRITE_PROFILES_COLLECTION_ID", process.env.VITE_APPWRITE_PROFILES_COLLECTION_ID || "6a01ebb50034d5067723");
  upsertEnvLine(lines, "VITE_APPWRITE_ONBOARDING_STEPS_COL_ID", stepsCol.$id);
  if (onboardingBucket) upsertEnvLine(lines, "VITE_APPWRITE_ONBOARDING_MEDIA_BUCKET_ID", onboardingBucket.$id);
  if (platformCol) upsertEnvLine(lines, "VITE_APPWRITE_PLATFORM_SETTINGS_COL_ID", platformCol.$id);
  upsertEnvLine(lines, "VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID", process.env.VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID || "admin-users");

  fs.writeFileSync(envPath, lines.filter((l, i, a) => l !== "" || i < a.length - 1).join("\n") + "\n");

  console.log("Atualizado .env.local:");
  console.log(`  VITE_APPWRITE_ONBOARDING_STEPS_COL_ID=${stepsCol.$id}`);
  if (onboardingBucket) console.log(`  VITE_APPWRITE_ONBOARDING_MEDIA_BUCKET_ID=${onboardingBucket.$id}`);
  if (platformCol) console.log(`  VITE_APPWRITE_PLATFORM_SETTINGS_COL_ID=${platformCol.$id}`);
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
