import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as sdk from "node-appwrite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env.local");
const functionDir = path.join(root, "functions", "sign-flight");
const archivePath = path.join(root, ".tmp", "sign-flight-function.tar.gz");
const functionId = process.env.SIGN_FLIGHT_FUNCTION_ID || "sign-flight";

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const entries = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    entries[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return entries;
}

function upsertEnvLine(filePath, key, value) {
  const lines = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8").split(/\r?\n/) : [];
  const nextLine = `${key}=${value}`;
  const index = lines.findIndex((line) => line.startsWith(`${key}=`));
  if (index >= 0) lines[index] = nextLine;
  else {
    if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
    lines.push(nextLine);
  }
  fs.writeFileSync(filePath, lines.join("\n"));
}

async function ignoreConflict(task, label) {
  try {
    await task();
    console.log(`ok ${label}`);
  } catch (error) {
    const message = error?.message ?? String(error);
    if (error?.code === 409 || /already exists|duplicate/i.test(message)) {
      console.log(`skip ${label}`);
      return;
    }
    throw error;
  }
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function upsertVariable(functions, key, value, secret = false) {
  const variables = [];
  let offset = 0;
  while (true) {
    const page = await functions.listVariables({
      functionId,
      queries: [sdk.Query.limit(100), sdk.Query.offset(offset)],
    });
    variables.push(...(page.variables || []));
    if (!page.variables || page.variables.length < 100 || variables.length >= (page.total || 0)) break;
    offset += 100;
  }
  const current = variables.find((variable) => variable.key === key);
  if (current) {
    await functions.updateVariable({ functionId, variableId: current.$id, key, value, secret });
  } else {
    await functions.createVariable({ functionId, variableId: sdk.ID.unique(), key, value, secret });
  }
}

async function ensureFunction(functions) {
  const params = {
    functionId,
    name: "Sign Flight",
    runtime: sdk.Runtime.Node22,
    execute: [sdk.Role.users()],
    events: [],
    schedule: "",
    timeout: 60,
    enabled: true,
    logging: true,
    entrypoint: "src/main.js",
    commands: "npm install",
    scopes: [
      sdk.Scopes.UsersRead,
      sdk.Scopes.DatabasesRead,
      sdk.Scopes.DatabasesWrite,
      sdk.Scopes.FilesRead,
    ],
  };

  try {
    await functions.get({ functionId });
    await functions.update(params);
    console.log(`Function updated: ${functionId}`);
  } catch (error) {
    if (error?.code !== 404) throw error;
    await functions.create(params);
    console.log(`Function created: ${functionId}`);
  }
}

async function waitForDeployment(functions, deploymentId) {
  for (let i = 0; i < 60; i += 1) {
    const deployment = await functions.getDeployment({ functionId, deploymentId });
    const status = deployment.status || deployment.$status;
    if (status === "ready" || status === "failed") return deployment;
    await wait(2000);
  }
  return functions.getDeployment({ functionId, deploymentId });
}

function packageFunction() {
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  if (fs.existsSync(archivePath)) fs.rmSync(archivePath);
  execFileSync("tar", ["-czf", archivePath, "-C", functionDir, "."], { stdio: "inherit" });
}

async function main() {
  const env = parseEnvFile(envPath);
  const endpoint = process.env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
  const projectId = process.env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
  const apiKey = process.env.APPWRITE_API_KEY || env.APPWRITE_API_KEY;
  const databaseId = process.env.APPWRITE_DATABASE_ID || env.VITE_APPWRITE_DATABASE_ID;
  const flightsCollectionId = process.env.APPWRITE_FLIGHTS_COLLECTION_ID || env.VITE_APPWRITE_COLLECTION_ID;
  const signaturesCollectionId =
    process.env.APPWRITE_FLIGHT_SIGNATURES_COLLECTION_ID ||
    env.VITE_APPWRITE_FLIGHT_SIGNATURES_COL_ID ||
    "flight_signatures";
  const auditEventsCollectionId =
    process.env.APPWRITE_AUDIT_EVENTS_COLLECTION_ID ||
    env.VITE_APPWRITE_AUDIT_EVENTS_COL_ID ||
    "audit_events";
  const profilesCollectionId = process.env.APPWRITE_PROFILES_COLLECTION_ID || env.VITE_APPWRITE_PROFILES_COLLECTION_ID;
  const bucketId = process.env.APPWRITE_BUCKET_ID || env.VITE_APPWRITE_BUCKET_ID || env.VITE_APPWRITE_FLIGHTS_BUCKET_ID || "";
  const schoolId = process.env.SCHOOL_ID || env.VITE_SCHOOL_ID || "escola_principal";

  const missing = [];
  if (!endpoint) missing.push("VITE_APPWRITE_ENDPOINT");
  if (!projectId) missing.push("VITE_APPWRITE_PROJECT_ID");
  if (!apiKey) missing.push("APPWRITE_API_KEY");
  if (!databaseId) missing.push("VITE_APPWRITE_DATABASE_ID");
  if (!flightsCollectionId) missing.push("VITE_APPWRITE_COLLECTION_ID");
  if (!profilesCollectionId) missing.push("VITE_APPWRITE_PROFILES_COLLECTION_ID");
  if (missing.length) throw new Error(`Missing required values: ${missing.join(", ")}`);

  const client = new sdk.Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  const databases = new sdk.Databases(client);
  const functions = new sdk.Functions(client);

  console.log("Updating flight_signatures attributes...");
  const attrs = [
    ["payload_version", 64],
    ["payload_hash_alg", 32],
    ["payload_snapshot_json", 65535],
    ["reauthenticated_at", 32],
    ["auth_method", 32],
  ];
  for (const [key, size] of attrs) {
    await ignoreConflict(
      () => databases.createStringAttribute(databaseId, signaturesCollectionId, key, size, false),
      `${key} attribute`,
    );
    await wait(500);
  }

  await wait(2000);
  await ignoreConflict(
    () =>
      databases.createIndex(
        databaseId,
        signaturesCollectionId,
        "idx_flight_role",
        "key",
        ["flight_id", "signer_role"],
        ["ASC", "ASC"],
      ),
    "flight_id + signer_role index",
  );

  console.log("Updating flight_signatures permissions...");
  await databases.updateCollection(
    databaseId,
    signaturesCollectionId,
    "Flight Signatures",
    [
      sdk.Permission.read(sdk.Role.users()),
      sdk.Permission.create(sdk.Role.label("admin")),
      sdk.Permission.update(sdk.Role.label("admin")),
      sdk.Permission.delete(sdk.Role.label("admin")),
    ],
    true,
  );

  await ensureFunction(functions);
  await upsertVariable(functions, "APPWRITE_API_KEY", apiKey, true);
  await upsertVariable(functions, "APPWRITE_DATABASE_ID", databaseId);
  await upsertVariable(functions, "APPWRITE_FLIGHTS_COLLECTION_ID", flightsCollectionId);
  await upsertVariable(functions, "APPWRITE_FLIGHT_SIGNATURES_COLLECTION_ID", signaturesCollectionId);
  await upsertVariable(functions, "APPWRITE_AUDIT_EVENTS_COLLECTION_ID", auditEventsCollectionId);
  await upsertVariable(functions, "APPWRITE_PROFILES_COLLECTION_ID", profilesCollectionId);
  if (bucketId) await upsertVariable(functions, "APPWRITE_BUCKET_ID", bucketId);
  await upsertVariable(functions, "SCHOOL_ID", schoolId);

  packageFunction();
  const buffer = fs.readFileSync(archivePath);
  const code = new File([buffer], "sign-flight-function.tar.gz", { type: "application/gzip" });
  const deployment = await functions.createDeployment({
    functionId,
    code,
    activate: true,
    entrypoint: "src/main.js",
    commands: "npm install",
  });
  console.log(`Deployment created: ${deployment.$id}`);
  const finalDeployment = await waitForDeployment(functions, deployment.$id);
  console.log(`Deployment status: ${finalDeployment.status || finalDeployment.$status || "unknown"}`);

  upsertEnvLine(envPath, "VITE_APPWRITE_SIGN_FLIGHT_FUNCTION_ID", functionId);
  console.log("Updated .env.local with VITE_APPWRITE_SIGN_FLIGHT_FUNCTION_ID.");
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
