/**
 * Adiciona referral_source aos candidatos de admissão de instrutores
 * e aumenta o limite de fields_json (score rules + campos).
 * Uso: node scripts/setup-instructor-admission-referral-score.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases } from "node-appwrite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
const localEnv = Object.fromEntries(
  fs.readFileSync(envPath, "utf8").split(/\r?\n/).flatMap((line) => {
    const index = line.indexOf("=");
    if (index <= 0 || line.trim().startsWith("#")) return [];
    return [[line.slice(0, index).trim(), line.slice(index + 1).trim()]];
  }),
);

const endpoint = process.env.APPWRITE_ENDPOINT || localEnv.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID || localEnv.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY || localEnv.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID || localEnv.VITE_APPWRITE_DATABASE_ID;
const candidatesCol =
  process.env.APPWRITE_INSTRUCTOR_ADMISSION_CANDIDATES_COL_ID ||
  localEnv.VITE_APPWRITE_INSTRUCTOR_ADMISSION_CANDIDATES_COL_ID ||
  "instructor_admission_candidates";
const formCol =
  process.env.APPWRITE_INSTRUCTOR_ADMISSION_FORM_COL_ID ||
  localEnv.VITE_APPWRITE_INSTRUCTOR_ADMISSION_FORM_COL_ID ||
  "instructor_admission_form";

if (!endpoint || !projectId || !apiKey || !databaseId) {
  throw new Error("Configuração do Appwrite incompleta.");
}

const databases = new Databases(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey));

try {
  await databases.createStringAttribute({
    databaseId,
    collectionId: candidatesCol,
    key: "referral_source",
    size: 255,
    required: false,
    default: "",
  });
  console.log("referral_source criado em instructor_admission_candidates.");
} catch (error) {
  if (error?.code === 409) {
    console.log("referral_source já existe em instructor_admission_candidates.");
  } else {
    throw error;
  }
}

try {
  await databases.updateStringAttribute({
    databaseId,
    collectionId: formCol,
    key: "fields_json",
    size: 65535,
    required: false,
    default: "[]",
  });
  console.log("fields_json ampliado para 65535 em instructor_admission_form.");
} catch (error) {
  if (error?.code === 409) {
    console.log("fields_json já está no tamanho desejado (ou não alterável agora).");
  } else {
    console.warn(`Aviso ao ampliar fields_json: ${error?.message || error}`);
  }
}

console.log("\n✅ Setup referral/score de admissão de instrutores concluído.");
