/**
 * Script de setup da collection tenant_roles no Appwrite.
 * Executa uma única vez para criar a collection e adicionar o atributo
 * custom_role_slug na collection profiles.
 *
 * Uso:
 *   node src/scripts/setup-tenant-roles.mjs
 *
 * Requer: node-appwrite instalado (npm i -D node-appwrite)
 */

import { Client, Databases, ID, Permission, Role } from "node-appwrite";
const IndexType = { Key: "key", Unique: "unique", Fulltext: "fulltext" };

const ENDPOINT = process.env.APPWRITE_ENDPOINT ?? process.env.VITE_APPWRITE_ENDPOINT ?? "https://sfo.cloud.appwrite.io/v1";
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID ?? process.env.VITE_APPWRITE_PROJECT_ID ?? "6a01ac8a0009fbf94f05";
const API_KEY = process.env.APPWRITE_API_KEY;

// Lê o DATABASE_ID do primeiro argumento ou de uma variável de ambiente
const DATABASE_ID = process.argv[2] ?? process.env.VITE_APPWRITE_DATABASE_ID;
const PROFILES_COL_ID = process.argv[3] ?? process.env.VITE_APPWRITE_PROFILES_COLLECTION_ID;

if (!DATABASE_ID) {
  console.error("❌  Passe o DATABASE_ID como primeiro argumento:");
  console.error("    node setup-tenant-roles.mjs <DATABASE_ID> [PROFILES_COL_ID]");
  process.exit(1);
}
if (!API_KEY) {
  console.error("Passe APPWRITE_API_KEY no ambiente para executar este script.");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

// ─── Permissões da collection ──────────────────────────────────────────────
const COLLECTION_PERMISSIONS = [
  Permission.read(Role.label("admin")),
  Permission.read(Role.label("instrutor")),
  Permission.read(Role.label("aluno")),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function createCollection() {
  console.log("📦  Criando collection tenant_roles...");
  const col = await db.createCollection(
    DATABASE_ID,
    ID.unique(),
    "tenant_roles",
    COLLECTION_PERMISSIONS,
    false, // documentSecurity
  );
  console.log(`✅  Collection criada: ${col.$id}`);
  return col.$id;
}

async function createAttributes(collectionId) {
  console.log("📝  Criando atributos...");

  const attrs = [
    () => db.createStringAttribute(DATABASE_ID, collectionId, "school_id", 36, true),
    () => db.createStringAttribute(DATABASE_ID, collectionId, "name", 100, true),
    () => db.createStringAttribute(DATABASE_ID, collectionId, "slug", 50, true),
    () => db.createStringAttribute(DATABASE_ID, collectionId, "portal_type", 20, true),
    () => db.createBooleanAttribute(DATABASE_ID, collectionId, "is_system", true),
    () => db.createStringAttribute(DATABASE_ID, collectionId, "permissions_json", 32768, true),
    () => db.createStringAttribute(DATABASE_ID, collectionId, "created_at", 30, false),
    () => db.createStringAttribute(DATABASE_ID, collectionId, "updated_at", 30, false),
  ];

  for (const createAttr of attrs) {
    await createAttr();
    await sleep(500); // Appwrite processa atributos de forma assíncrona
  }

  console.log("✅  Atributos criados");
}

async function createIndexes(collectionId) {
  console.log("🔍  Criando índices...");

  // Aguardar atributos ficarem ativos
  await sleep(3000);

  await db.createIndex(DATABASE_ID, collectionId, "idx_school_id", IndexType.Key, ["school_id"], ["ASC"]);
  await sleep(1000);

  console.log("✅  Índices criados");
}

async function addCustomRoleSlugToProfiles(profilesColId) {
  if (!profilesColId) {
    console.log("⚠️   PROFILES_COL_ID não fornecido, pulando atributo custom_role_slug.");
    return;
  }

  console.log(`📝  Adicionando custom_role_slug na collection profiles (${profilesColId})...`);
  try {
    await db.createStringAttribute(DATABASE_ID, profilesColId, "custom_role_slug", 50, false);
    console.log("✅  Atributo custom_role_slug adicionado em profiles");
  } catch (err) {
    if (err?.code === 409) {
      console.log("ℹ️   Atributo custom_role_slug já existe em profiles");
    } else {
      throw err;
    }
  }
}

async function main() {
  try {
    const collectionId = await createCollection();
    await createAttributes(collectionId);
    await createIndexes(collectionId);
    await addCustomRoleSlugToProfiles(PROFILES_COL_ID);

    console.log("\n🎉  Setup concluído!");
    console.log(`\n📋  Adicione ao seu .env:\n    VITE_APPWRITE_TENANT_ROLES_COL_ID=${collectionId}`);
  } catch (err) {
    console.error("\n❌  Erro:", err?.message ?? err);
    if (err?.response) console.error("   Detalhes:", JSON.stringify(err.response, null, 2));
    process.exit(1);
  }
}

main();
