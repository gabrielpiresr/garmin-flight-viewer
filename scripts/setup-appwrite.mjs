import { Client, Databases, ID } from "node-appwrite";

const ENDPOINT   = "https://sfo.cloud.appwrite.io/v1";
const PROJECT_ID = "6a01ac8a0009fbf94f05";
const API_KEY    = "standard_c331b1343cf97b580560d1ea341a2609e4100195659849c17a5dcaab8b73c4d82bb840b4edc0209884a51c958fe3bc275a98230f570a51a9e2debe9a929af6ae069a2fa3268917905550c2bdb4a17fa79de223af4a17d7b0a8ec7a9daf0e4a3dd4d7657d269497813807cd6ae835d3e9ee905d45522c42f38188c41311393f6a";

const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const db = new Databases(client);

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("🚀 Iniciando setup do Appwrite...\n");

  // 1. Criar database
  console.log("📦 Criando database...");
  const database = await db.create(ID.unique(), "flights-db");
  const DB_ID = database.$id;
  console.log(`   ✅ Database criado: ${DB_ID}\n`);

  // 2. Criar collection com document security
  console.log("📁 Criando collection...");
  const collection = await db.createCollection(DB_ID, ID.unique(), "flights", [], true);
  const COL_ID = collection.$id;
  console.log(`   ✅ Collection criada: ${COL_ID}\n`);

  // 3. Criar atributos (aguarda entre cada um pois Appwrite processa async)
  console.log("🏗️  Criando atributos...");

  await db.createStringAttribute(DB_ID, COL_ID, "name", 255, true);
  console.log("   ✅ name");
  await sleep(500);

  await db.createStringAttribute(DB_ID, COL_ID, "source_filename", 255, true);
  console.log("   ✅ source_filename");
  await sleep(500);

  await db.createStringAttribute(DB_ID, COL_ID, "user_id", 36, true);
  console.log("   ✅ user_id");
  await sleep(500);

  await db.createStringAttribute(DB_ID, COL_ID, "csv_text", 10485760, true);
  console.log("   ✅ csv_text");
  await sleep(1500); // csv_text é maior, aguarda mais

  // 4. Criar índice
  console.log("\n🔍 Criando índice...");
  await db.createIndex(DB_ID, COL_ID, "user_created", "key", ["user_id"], ["ASC"]);
  console.log("   ✅ Índice user_id criado\n");

  // 5. Exibir resultado
  console.log("=".repeat(55));
  console.log("✅ Setup concluído! Copie as variáveis abaixo:\n");
  console.log(`VITE_APPWRITE_ENDPOINT=${ENDPOINT}`);
  console.log(`VITE_APPWRITE_PROJECT_ID=${PROJECT_ID}`);
  console.log(`VITE_APPWRITE_DATABASE_ID=${DB_ID}`);
  console.log(`VITE_APPWRITE_COLLECTION_ID=${COL_ID}`);
  console.log("=".repeat(55));
}

main().catch((err) => {
  console.error("❌ Erro:", err.message ?? err);
  process.exit(1);
});
