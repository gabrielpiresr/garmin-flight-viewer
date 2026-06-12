import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases } from "node-appwrite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/).flatMap((line) => {
    const index = line.indexOf("=");
    if (index <= 0 || line.trim().startsWith("#")) return [];
    return [[line.slice(0, index).trim(), line.slice(index + 1).trim()]];
  }),
);
const endpoint = process.env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY || env.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID || env.VITE_APPWRITE_DATABASE_ID;
const collectionId = process.env.APPWRITE_CRM_LEADS_COLLECTION_ID || env.VITE_APPWRITE_CRM_LEADS_COL_ID || "crm_leads";
if (!endpoint || !projectId || !apiKey || !databaseId) throw new Error("Configuracao Appwrite incompleta.");

const databases = new Databases(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey));
try {
  await databases.createStringAttribute({
    databaseId,
    collectionId,
    key: "theoretical_study_status",
    size: 80,
    required: false,
  });
  console.log("theoretical_study_status criado.");
} catch (error) {
  if (error?.code === 409) console.log("theoretical_study_status ja existe.");
  else throw error;
}
