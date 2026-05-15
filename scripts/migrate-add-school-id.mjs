/**
 * Migração: adiciona atributo `school_id` às coleções que ainda não têm,
 * cria índice e faz backfill dos documentos existentes com "escola_principal".
 *
 * Uso:
 *   node scripts/migrate-add-school-id.mjs
 */
import { Client, Databases, Query } from "node-appwrite";

const ENDPOINT   = "https://sfo.cloud.appwrite.io/v1";
const PROJECT_ID = "6a01ac8a0009fbf94f05";
const API_KEY    = "standard_c331b1343cf97b580560d1ea341a2609e4100195659849c17a5dcaab8b73c4d82bb840b4edc0209884a51c958fe3bc275a98230f570a51a9e2debe9a929af6ae069a2fa3268917905550c2bdb4a17fa79de223af4a17d7b0a8ec7a9daf0e4a3dd4d7657d269497813807cd6ae835d3e9ee905d45522c42f38188c41311393f6a";
const DATABASE_ID = "6a01afae001bc352d1b1";
const DEFAULT_SCHOOL_ID = "escola_principal";

// Coleções que precisam receber school_id.
// journey_rewards, training_tracks e student_training_tracks já têm school_id.
// aircrafts já tem school_id.
const COLLECTIONS = [
  { id: "6a01ebb50034d5067723", name: "profiles" },
  { id: "6a01afb1002232d33950", name: "flights" },
  { id: "6a0378e600388c30bade", name: "student_credits" },
  { id: "6a023d7d00137ede2f5b", name: "weekly_plans" },
  { id: "6a035e790029550365f7", name: "instructor_prefs" },
  { id: "6a0461a3001603e99577", name: "maneuvers_sections" },
  { id: "6a0461c5002ac4794ec4", name: "maneuvers_subsections" },
  { id: "6a0461d0001a1ceefdad", name: "maneuvers_articles" },
  { id: "6a02403b003260123bab", name: "notices" },
];

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
