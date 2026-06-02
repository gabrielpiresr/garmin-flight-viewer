import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as sdk from "node-appwrite";

const executionId = process.argv[2];
if (!executionId) {
  console.error("Usage: node scripts/inspect-execution.mjs <executionId>");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
  const i = trimmed.indexOf("=");
  env[trimmed.slice(0, i)] = trimmed.slice(i + 1);
}

const functions = new sdk.Functions(
  new sdk.Client()
    .setEndpoint(env.VITE_APPWRITE_ENDPOINT)
    .setProject(env.VITE_APPWRITE_PROJECT_ID)
    .setKey(env.APPWRITE_API_KEY),
);

const ex = await functions.getExecution({ functionId: env.VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID || "admin-users", executionId });
console.log(JSON.stringify({
  id: ex.$id,
  status: ex.status,
  responseStatusCode: ex.responseStatusCode,
  duration: ex.duration,
  responseBodyLength: (ex.responseBody || "").length,
  stderrLength: (ex.stderr || "").length,
  logsLength: (ex.logs || "").length,
}, null, 2));

if (ex.logs) console.log("\n--- logs ---\n", ex.logs.slice(-8000));
if (ex.stderr) console.log("\n--- stderr ---\n", ex.stderr.slice(-4000));
if (ex.responseBody) {
  console.log("\n--- responseBody ---\n");
  try {
    console.log(JSON.stringify(JSON.parse(ex.responseBody), null, 2).slice(0, 12000));
  } catch {
    console.log(ex.responseBody.slice(0, 4000));
  }
}
