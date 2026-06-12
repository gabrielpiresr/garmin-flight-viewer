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
const collectionId = process.env.APPWRITE_CRM_LEADS_COLLECTION_ID || localEnv.VITE_APPWRITE_CRM_LEADS_COL_ID || "crm_leads";

if (!endpoint || !projectId || !apiKey || !databaseId) {
  throw new Error("Configuracao do Appwrite incompleta.");
}

const databases = new Databases(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey));

try {
  await databases.createStringAttribute({
    databaseId,
    collectionId,
    key: "referral_source",
    size: 255,
    required: false,
  });
  console.log("referral_source criado em crm_leads.");
} catch (error) {
  if (error?.code === 409) {
    console.log("referral_source ja existe em crm_leads.");
  } else {
    throw error;
  }
}
