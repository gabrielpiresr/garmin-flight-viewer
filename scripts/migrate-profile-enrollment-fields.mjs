import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases } from "node-appwrite";

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
const PROFILES_COL_ID = env.VITE_APPWRITE_PROFILES_COLLECTION_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID || !PROFILES_COL_ID) {
  console.error("Missing env vars (endpoint, project, api key, database, profiles collection).");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const FIELDS = [
  ["sexo", 16],
  ["cep", 12],
  ["cidade", 120],
  ["uf", 2],
  ["naturalidade", 120],
  ["filiacao_pai", 255],
  ["filiacao_mae", 255],
  ["rg_data_emissao", 32],
  ["escolaridade", 80],
  ["escolaridade_periodo", 80],
  ["escolaridade_curso", 120],
  ["alergias_medicamentos", 512],
  ["emergencia_nome", 120],
  ["emergencia_parentesco", 80],
  ["emergencia_endereco", 512],
  ["emergencia_telefone", 20],
];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attr(key, size) {
  try {
    await db.createStringAttribute(DATABASE_ID, PROFILES_COL_ID, key, size, false);
    await sleep(700);
    console.log(`  ✓ ${key}`);
  } catch (error) {
    const msg = error?.message ?? String(error);
    if (msg.toLowerCase().includes("already exists")) {
      console.log(`  • ${key} (already exists)`);
      return;
    }
    throw error;
  }
}

async function main() {
  console.log("=== Profile enrollment fields migration ===\n");
  for (const [key, size] of FIELDS) {
    await attr(key, size);
  }
  console.log("\nDone.");
}

main().catch((error) => {
  console.error("Migration failed:", error?.message ?? error);
  process.exit(1);
});
