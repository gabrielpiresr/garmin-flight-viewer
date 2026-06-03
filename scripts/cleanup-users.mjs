/**
 * cleanup-users.mjs — apaga todos os usuários exceto o admin.
 * Estratégia: lista sem cursor (sempre pega os primeiros 100),
 * deleta, e repete até só restar o admin.
 */

import { Client, Users, Query } from "node-appwrite";

const ENDPOINT      = process.env.APPWRITE_ENDPOINT    ?? "https://sfo.cloud.appwrite.io/v1";
const PROJECT_ID    = process.env.APPWRITE_PROJECT_ID  ?? "6a01ac8a0009fbf94f05";
const API_KEY       = process.env.APPWRITE_API_KEY;
const ADMIN_USER_ID = process.env.VITE_ADMIN_USER_ID   ?? "6a01eb66001f88da47b3";

if (!API_KEY) { console.error("❌ APPWRITE_API_KEY não definido."); process.exit(1); }

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const users  = new Users(client);

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  console.log(`\nAdmin preservado: ${ADMIN_USER_ID}\n`);

  let totalDeleted = 0;
  let round = 0;

  while (true) {
    round++;
    let res;
    try {
      // Sempre busca sem cursor — após deletar, os próximos sobem para o topo
      res = await users.list([Query.limit(100)]);
    } catch (e) {
      console.error(`Erro ao listar usuários: ${e.message}`);
      break;
    }

    const toDelete = res.users.filter((u) => u.$id !== ADMIN_USER_ID);

    if (toDelete.length === 0) {
      console.log(`\n✅ Nenhum usuário restante (exceto admin). Total deletado: ${totalDeleted}`);
      break;
    }

    console.log(`Rodada ${round}: ${toDelete.length} usuário(s) para deletar...`);

    for (const u of toDelete) {
      try {
        await users.delete(u.$id);
        totalDeleted++;
        process.stdout.write(`\r  ✓ ${totalDeleted} deletado(s)...`);
      } catch (e) {
        console.error(`\n  ✗ ${u.$id} (${u.email}): ${e.message}`);
      }
      await sleep(40);
    }
    process.stdout.write("\n");

    // Se retornou menos de 100 e todos eram só o admin, terminamos
    if (res.users.length <= 1) break;
  }

  console.log(`\nAdmin restante: ${ADMIN_USER_ID}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
