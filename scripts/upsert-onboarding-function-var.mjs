/**
 * Define APPWRITE_ONBOARDING_STEPS_COLLECTION_ID na função admin-users.
 */
import { Client, Functions, ID, Query } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT || "https://sfo.cloud.appwrite.io/v1";
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || "6a01ac8a0009fbf94f05";
const API_KEY = process.env.APPWRITE_API_KEY;
const FUNCTION_ID = process.env.ADMIN_USERS_FUNCTION_ID || "admin-users";
const ONBOARDING_STEPS_COL_ID =
  process.env.APPWRITE_ONBOARDING_STEPS_COLLECTION_ID ||
  process.env.VITE_APPWRITE_ONBOARDING_STEPS_COL_ID ||
  "6a1f23d2001937e83aa9";

if (!API_KEY) {
  console.error("Defina APPWRITE_API_KEY");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const functions = new Functions(client);

async function upsertVariable(key, value) {
  let offset = 0;
  let existing = null;
  while (true) {
    const page = await functions.listVariables({
      functionId: FUNCTION_ID,
      queries: [Query.limit(100), Query.offset(offset)],
    });
    existing = page.variables?.find((v) => v.key === key) ?? existing;
    if (!page.variables?.length || page.variables.length < 100) break;
    offset += 100;
  }
  if (existing) {
    await functions.updateVariable({ functionId: FUNCTION_ID, variableId: existing.$id, key, value, secret: false });
    console.log(`  ✓ Atualizado ${key}`);
  } else {
    await functions.createVariable({ functionId: FUNCTION_ID, variableId: ID.unique(), key, value, secret: false });
    console.log(`  ✓ Criado ${key}`);
  }
}

async function main() {
  console.log(`Função: ${FUNCTION_ID}`);
  await upsertVariable("APPWRITE_ONBOARDING_STEPS_COLLECTION_ID", ONBOARDING_STEPS_COL_ID);
  console.log(`Valor: ${ONBOARDING_STEPS_COL_ID}`);
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
