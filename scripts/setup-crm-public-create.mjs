/**
 * Permite que o formulário público de qualificação crie leads (visitante / usuário logado).
 * Uso: node scripts/setup-crm-public-create.mjs
 */
import { Client, Databases, Permission, Role } from "node-appwrite";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const path = join(__dirname, "..", ".env.local");
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* ignore */
  }
}

loadEnv();

const ENDPOINT = process.env.VITE_APPWRITE_ENDPOINT || "https://sfo.cloud.appwrite.io/v1";
const PROJECT_ID = process.env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID;
const CRM_COL_ID =
  process.env.VITE_APPWRITE_CRM_LEADS_COL_ID ||
  process.env.APPWRITE_CRM_LEADS_COLLECTION_ID ||
  "crm_leads";

if (!PROJECT_ID || !API_KEY || !DB_ID) {
  console.error("Defina VITE_APPWRITE_PROJECT_ID, APPWRITE_API_KEY e VITE_APPWRITE_DATABASE_ID em .env.local");
  process.exit(1);
}

const db = new Databases(new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY));

const REQUIRED = [
  Permission.read(Role.label("admin")),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
  Permission.read(Role.label("instrutor")),
  Permission.read(Role.any()),
  Permission.create(Role.any()),
  Permission.update(Role.any()),
];

async function main() {
  const col = await db.getCollection(DB_ID, CRM_COL_ID);
  const current = new Set(col.$permissions || []);
  const merged = [...current];
  let added = 0;
  for (const perm of REQUIRED) {
    if (!current.has(perm)) {
      merged.push(perm);
      added++;
    }
  }
  if (added === 0) {
    console.log("Coleção crm_leads já possui create(Role.any()) e demais permissões.");
    return;
  }
  await db.updateCollection(DB_ID, CRM_COL_ID, col.name, merged, col.documentSecurity, col.enabled);
  console.log(`Atualizado crm_leads: +${added} permissão(ões) (inclui create para visitantes).`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
