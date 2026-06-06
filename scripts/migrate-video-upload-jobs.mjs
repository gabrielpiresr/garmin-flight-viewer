import fs from "node:fs";
import path from "node:path";
import { Client, Databases } from "node-appwrite";

const envPath = path.resolve(".env.local");
const fileEnv = {};
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const value = line.trim();
    if (!value || value.startsWith("#") || !value.includes("=")) continue;
    const index = value.indexOf("=");
    fileEnv[value.slice(0, index)] = value.slice(index + 1);
  }
}

const endpoint = process.env.APPWRITE_ENDPOINT || fileEnv.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID || fileEnv.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY || fileEnv.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID || fileEnv.VITE_APPWRITE_DATABASE_ID || "6a01afae001bc352d1b1";
const collectionId =
  process.env.APPWRITE_VIDEOS_COLLECTION_ID ||
  fileEnv.VITE_APPWRITE_VIDEOS_COLLECTION_ID ||
  "6a0200bf00297bfc2231";

if (!endpoint || !projectId || !apiKey) {
  throw new Error("Appwrite endpoint, project e APPWRITE_API_KEY sao obrigatorios.");
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);

const attributes = [
  ["apply_logo", () => databases.createBooleanAttribute(databaseId, collectionId, "apply_logo", false, false)],
  ["processing_stage", () => databases.createStringAttribute(databaseId, collectionId, "processing_stage", 32, false)],
  ["processing_percent", () => databases.createIntegerAttribute(databaseId, collectionId, "processing_percent", false, 0, 100)],
  ["processing_error", () => databases.createStringAttribute(databaseId, collectionId, "processing_error", 2048, false)],
  ["video_key", () => databases.createStringAttribute(databaseId, collectionId, "video_key", 255, false)],
  ["processing_updated_at", () => databases.createStringAttribute(databaseId, collectionId, "processing_updated_at", 64, false)],
];

async function waitForAttributes(keys) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const result = await databases.listAttributes(databaseId, collectionId);
    const selected = result.attributes.filter((attribute) => keys.includes(attribute.key));
    if (selected.some((attribute) => attribute.status === "failed")) {
      throw new Error("Um atributo de video falhou durante a criacao.");
    }
    if (selected.length === keys.length && selected.every((attribute) => attribute.status === "available")) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Timeout aguardando atributos de video.");
}

const existing = await databases.listAttributes(databaseId, collectionId);
const existingKeys = new Set(existing.attributes.map((attribute) => attribute.key));
for (const [key, create] of attributes) {
  if (existingKeys.has(key)) {
    console.log(`attribute ${key}: exists`);
    continue;
  }
  await create();
  console.log(`attribute ${key}: created`);
}

await waitForAttributes(attributes.map(([key]) => key));

const indexKey = "flight_videos_status_updated_idx";
const indexes = await databases.listIndexes(databaseId, collectionId);
if (!indexes.indexes.some((index) => index.key === indexKey)) {
  await databases.createIndex(
    databaseId,
    collectionId,
    indexKey,
    "key",
    ["processing_status", "processing_updated_at"],
    ["ASC", "DESC"],
  );
  console.log(`index ${indexKey}: created`);
} else {
  console.log(`index ${indexKey}: exists`);
}

for (let attempt = 0; attempt < 90; attempt += 1) {
  const current = await databases.listIndexes(databaseId, collectionId);
  const index = current.indexes.find((item) => item.key === indexKey);
  if (index?.status === "available") {
    console.log("video upload schema ready");
    process.exit(0);
  }
  if (index?.status === "failed") throw new Error(`Index ${indexKey} falhou.`);
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

throw new Error(`Timeout aguardando index ${indexKey}.`);
