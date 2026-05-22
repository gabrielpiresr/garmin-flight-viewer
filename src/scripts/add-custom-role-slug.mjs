/**
 * Garante que o atributo custom_role_slug existe na collection profiles.
 * Execute este script caso o atributo não tenha sido criado pelo setup-tenant-roles.mjs.
 *
 * Uso:
 *   node src/scripts/add-custom-role-slug.mjs
 */

import { Client, Databases } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT ?? process.env.VITE_APPWRITE_ENDPOINT ?? "https://sfo.cloud.appwrite.io/v1";
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID ?? process.env.VITE_APPWRITE_PROJECT_ID ?? "6a01ac8a0009fbf94f05";
const API_KEY = process.env.APPWRITE_API_KEY;

const DATABASE_ID = process.env.APPWRITE_DATABASE_ID ?? process.env.VITE_APPWRITE_DATABASE_ID;
const PROFILES_COL_ID = process.env.APPWRITE_PROFILES_COLLECTION_ID ?? process.env.VITE_APPWRITE_PROFILES_COLLECTION_ID;

if (!API_KEY || !DATABASE_ID || !PROFILES_COL_ID) {
  console.error("Defina APPWRITE_API_KEY, APPWRITE_DATABASE_ID e APPWRITE_PROFILES_COLLECTION_ID no ambiente.");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

async function main() {
  console.log("🔍  Verificando atributo custom_role_slug em profiles...");
  try {
    await db.createStringAttribute(DATABASE_ID, PROFILES_COL_ID, "custom_role_slug", 50, false);
    console.log("✅  Atributo custom_role_slug criado com sucesso em profiles.");
    console.log("⏳  Aguardando Appwrite processar o atributo (pode levar alguns segundos)...");
    await new Promise((r) => setTimeout(r, 3000));
    console.log("🎉  Pronto! Agora faça o deploy do fn-admin-users e teste novamente.");
  } catch (err) {
    if (err?.code === 409) {
      console.log("ℹ️   Atributo custom_role_slug já existe em profiles. Nenhuma ação necessária.");
    } else {
      console.error("❌  Erro ao criar atributo:", err?.message ?? err);
      if (err?.response) console.error("   Detalhes:", JSON.stringify(err.response, null, 2));
      process.exit(1);
    }
  }
}

main();
