import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases, Functions, Query } from "node-appwrite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const entries = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    entries[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return entries;
}

const env = parseEnvFile(envPath);
const endpoint = process.env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY || env.APPWRITE_API_KEY;

if (!apiKey || !endpoint || !projectId) {
  console.error("Set APPWRITE_API_KEY (and endpoint/project) to run diagnostics.");
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const db = new Databases(client);
const functions = new Functions(client);
const DB = env.VITE_APPWRITE_DATABASE_ID;
const TC = env.VITE_APPWRITE_TRAINING_TRACKS_COL_ID || "training_tracks";
const SC = env.VITE_APPWRITE_STUDENT_TRACKS_COL_ID || "student_training_tracks";
const SCHOOL = env.VITE_SCHOOL_ID || "escola_principal";
const FN = env.VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID || "admin-users";

const tracks = await db.listDocuments(DB, TC, [Query.equal("school_id", [SCHOOL]), Query.limit(10)]);
console.log("training_tracks:", tracks.total);
for (const doc of tracks.documents) {
  console.log(`  - ${doc.$id} | ${doc.name} | default=${doc.is_default} active=${doc.is_active}`);
}

const defs = await db.listDocuments(DB, TC, [
  Query.equal("school_id", [SCHOOL]),
  Query.equal("is_default", [true]),
  Query.limit(3),
]);
console.log("is_default count:", defs.total);

const execution = await functions.createExecution(
  FN,
  JSON.stringify({ action: "ensureDefaultStudentTrack", userId: "nonexistent-user-id" }),
  false,
);
console.log("function status:", execution.status, "http:", execution.responseStatusCode);
console.log("function body:", execution.responseBody);
