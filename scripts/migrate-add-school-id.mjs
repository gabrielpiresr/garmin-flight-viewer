/**
 * Migração: adiciona atributo `school_id` às coleções que ainda não têm,
 * cria índice e faz backfill dos documentos existentes com "escola_principal".
 *
 * Uso:
 *   node scripts/migrate-add-school-id.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases, Query } from "node-appwrite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env.local");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const entries = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    entries[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return entries;
}

const fileEnv = parseEnvFile(envPath);
const env = (key, fallbackKey) => process.env[key] || fileEnv[key] || (fallbackKey ? fileEnv[fallbackKey] : undefined);

const ENDPOINT = env("APPWRITE_ENDPOINT", "VITE_APPWRITE_ENDPOINT");
const PROJECT_ID = env("APPWRITE_PROJECT_ID", "VITE_APPWRITE_PROJECT_ID");
const API_KEY = process.env.APPWRITE_API_KEY || fileEnv.APPWRITE_API_KEY;
const DATABASE_ID = env("APPWRITE_DATABASE_ID", "VITE_APPWRITE_DATABASE_ID");
const DEFAULT_SCHOOL_ID = process.env.SCHOOL_ID || fileEnv.VITE_SCHOOL_ID || "escola_principal";

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("Missing Appwrite env. Required: endpoint, project, database and APPWRITE_API_KEY.");
  process.exit(1);
}

// Coleções que precisam receber school_id.
// journey_rewards, training_tracks e student_training_tracks já têm school_id.
// aircrafts já tem school_id.
const COLLECTIONS = [
  { id: env("APPWRITE_PROFILES_COLLECTION_ID", "VITE_APPWRITE_PROFILES_COLLECTION_ID"), name: "profiles" },
  { id: env("APPWRITE_FLIGHTS_COLLECTION_ID", "VITE_APPWRITE_COLLECTION_ID"), name: "flights" },
  { id: env("APPWRITE_STUDENT_CREDITS_COLLECTION_ID", "VITE_APPWRITE_STUDENT_CREDITS_COL_ID"), name: "student_credits" },
  { id: env("APPWRITE_WEEKLY_PLANS_COLLECTION_ID", "VITE_APPWRITE_WEEKLY_PLANS_COL_ID"), name: "weekly_plans" },
  { id: env("APPWRITE_INSTRUCTOR_PREFS_COLLECTION_ID", "VITE_APPWRITE_INSTRUCTOR_PREFS_COL_ID"), name: "instructor_prefs" },
  { id: env("APPWRITE_MANEUVERS_SECTIONS_COLLECTION_ID", "VITE_APPWRITE_MANEUVERS_SECTIONS_COL_ID"), name: "maneuvers_sections" },
  { id: env("APPWRITE_MANEUVERS_SUBSECTIONS_COLLECTION_ID", "VITE_APPWRITE_MANEUVERS_SUBSECTIONS_COL_ID"), name: "maneuvers_subsections" },
  { id: env("APPWRITE_MANEUVERS_ARTICLES_COLLECTION_ID", "VITE_APPWRITE_MANEUVERS_ARTICLES_COL_ID"), name: "maneuvers_articles" },
  { id: env("APPWRITE_NOTICES_COLLECTION_ID", "VITE_APPWRITE_NOTICES_COL_ID"), name: "notices" },
].filter((collection) => collection.id);

const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const databases = new Databases(client);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Aguarda o atributo ficar com status "available" (poll). */
async function waitForAttribute(collectionId, key, maxWaitMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const attr = await databases.getAttribute(DATABASE_ID, collectionId, key);
      if (attr.status === "available") return;
      if (attr.status === "failed") throw new Error(`Atributo ${key} com status 'failed'.`);
    } catch (err) {
      if (err.message?.includes("Attribute with the requested key could not be found")) {
        // ainda não criado, aguarda
      } else if (err.message?.includes("failed")) {
        throw err;
      }
    }
    await sleep(2500);
  }
  throw new Error(`Atributo ${key} não ficou ativo após ${maxWaitMs / 1000}s.`);
}

/** Adiciona school_id como string opcional (não obrigatória, default ""). */
async function addSchoolIdAttribute(collectionId, name) {
  try {
    await databases.createStringAttribute(
      DATABASE_ID,
      collectionId,
      "school_id",
      128,   // tamanho máximo
      false, // não obrigatório
      "",    // valor padrão vazio — backfill vai preencher
    );
    console.log(`  [${name}] Atributo criado. Aguardando ativação...`);
    await waitForAttribute(collectionId, "school_id");
    console.log(`  [${name}] Atributo ativo ✓`);
  } catch (err) {
    if (
      err.message?.toLowerCase().includes("already exists") ||
      err.message?.toLowerCase().includes("attribute with the requested key")
    ) {
      console.log(`  [${name}] school_id já existe, pulando.`);
    } else {
      throw err;
    }
  }
}

/** Cria índice key em school_id para viabilizar queries filtradas. */
async function createSchoolIdIndex(collectionId, name) {
  try {
    await databases.createIndex(
      DATABASE_ID,
      collectionId,
      "idx_school_id",
      "key",
      ["school_id"],
      ["ASC"],
    );
    console.log(`  [${name}] Índice criado ✓`);
  } catch (err) {
    if (
      err.message?.toLowerCase().includes("already exists") ||
      err.message?.toLowerCase().includes("index with the requested key")
    ) {
      console.log(`  [${name}] Índice já existe, pulando.`);
    } else {
      console.warn(`  [${name}] Aviso ao criar índice: ${err.message}`);
    }
  }
}

/** Atualiza todos os documentos da coleção que não têm school_id preenchido. */
async function backfillCollection(collectionId, name) {
  let offset = 0;
  const limit = 100;
  let updated = 0;
  let skipped = 0;

  while (true) {
    const res = await databases.listDocuments(DATABASE_ID, collectionId, [
      Query.limit(limit),
      Query.offset(offset),
    ]);

    if (res.documents.length === 0) break;

    for (const doc of res.documents) {
      const current = doc.school_id;
      if (!current || current === "") {
        try {
          await databases.updateDocument(DATABASE_ID, collectionId, doc.$id, {
            school_id: DEFAULT_SCHOOL_ID,
          });
          updated++;
        } catch (err) {
          console.warn(`  [${name}] Falha ao atualizar doc ${doc.$id}: ${err.message}`);
        }
      } else {
        skipped++;
      }
    }

    offset += res.documents.length;
    if (res.documents.length < limit) break;

    // pequena pausa para não sobrecarregar a API
    await sleep(300);
  }

  console.log(`  [${name}] Backfill: ${updated} atualizados, ${skipped} já tinham school_id ✓`);
}

async function main() {
  console.log("=======================================================");
  console.log("  Migração: adicionando school_id às coleções");
  console.log("=======================================================\n");

  for (const col of COLLECTIONS) {
    console.log(`\n▶ ${col.name} (${col.id})`);
    try {
      await addSchoolIdAttribute(col.id, col.name);
      await sleep(500);
      await createSchoolIdIndex(col.id, col.name);
      await sleep(500);
      await backfillCollection(col.id, col.name);
    } catch (err) {
      console.error(`  [${col.name}] ERRO: ${err.message}`);
    }
  }

  console.log("\n=======================================================");
  console.log("  Migração concluída!");
  console.log("=======================================================");
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
