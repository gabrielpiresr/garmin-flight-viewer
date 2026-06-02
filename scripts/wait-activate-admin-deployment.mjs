import * as sdk from "node-appwrite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env.local");
const deploymentId = process.argv[2];
if (!deploymentId) {
  console.error("Usage: node scripts/wait-activate-admin-deployment.mjs <deploymentId>");
  process.exit(1);
}

function parseEnvFile(filePath) {
  const entries = {};
  if (!fs.existsSync(filePath)) return entries;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    entries[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return entries;
}

const env = parseEnvFile(envPath);
const endpoint = process.env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY || env.APPWRITE_API_KEY;
const functionId = "admin-users";

const client = new sdk.Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const functions = new sdk.Functions(client);

let finalStatus = "unknown";
for (let i = 0; i < 60; i += 1) {
  const deployment = await functions.getDeployment({ functionId, deploymentId });
  finalStatus = deployment.status || deployment.$status || "unknown";
  console.log(`Deployment ${deploymentId}: ${finalStatus}`);
  if (finalStatus === "ready" || finalStatus === "failed") break;
  await new Promise((resolve) => setTimeout(resolve, 3000));
}

if (finalStatus !== "ready") {
  const deployment = await functions.getDeployment({ functionId, deploymentId });
  console.error("Build logs (tail):", String(deployment.buildLogs || "").slice(-2000));
  process.exit(1);
}

const apiBase = endpoint.replace(/\/+$/, "");
const activateRes = await fetch(`${apiBase}/functions/${functionId}`, {
  method: "PUT",
  headers: {
    "x-appwrite-key": apiKey,
    "x-appwrite-project": projectId,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    name: "Admin Users",
    runtime: "node-22",
    entrypoint: "src/main.js",
    execute: ["users"],
    events: [],
    schedule: "*/15 * * * *",
    timeout: 300,
    enabled: true,
    logging: true,
    commands: "npm install",
    scopes: [],
    deployment: deploymentId,
  }),
});
const activateJson = await activateRes.json();
console.log("Active deployment:", activateJson.deploymentId || activateJson.deployment || "(unknown)");
