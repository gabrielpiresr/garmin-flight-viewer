/**
 * Deploy the morning birthday digest cron function.
 *
 * Reuses the admin-users package (same source tree) with entrypoint
 * src/birthdayDigestCron.js. Default schedule: 08:00 America/Sao_Paulo (11:00 UTC).
 *
 * Usage:
 *   node scripts/deploy-birthday-digest.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import * as sdk from "node-appwrite";
import { InputFile } from "node-appwrite/file";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env.local");
const archivePath = path.join(root, ".tmp", "admin-users-function.tar.gz");
const sourceFunctionId = process.env.ADMIN_USERS_FUNCTION_ID || "admin-users";
const functionId = process.env.BIRTHDAY_DIGEST_FUNCTION_ID || "birthday-digest";
const schedule = process.env.BIRTHDAY_DIGEST_SCHEDULE || "0 11 * * *";
const timeout = Number(process.env.BIRTHDAY_DIGEST_TIMEOUT || 120);

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

async function listAllVariables(functions, id) {
  const variables = [];
  let offset = 0;
  while (true) {
    const page = await functions.listVariables({
      functionId: id,
      queries: [sdk.Query.limit(100), sdk.Query.offset(offset)],
    });
    variables.push(...(page.variables || []));
    if (!page.variables || page.variables.length < 100 || variables.length >= (page.total || 0)) break;
    offset += 100;
  }
  return variables;
}

async function upsertVariable(functions, key, value, secret = false) {
  const existing = await listAllVariables(functions, functionId);
  const current = existing.find((variable) => variable.key === key);
  if (current) {
    await functions.updateVariable({
      functionId,
      variableId: current.$id,
      key,
      value,
      secret,
    });
    return;
  }
  await functions.createVariable({
    functionId,
    variableId: sdk.ID.unique(),
    key,
    value,
    secret,
  });
}

async function ensureFunction(functions) {
  const params = {
    functionId,
    name: "Birthday Digest",
    runtime: sdk.Runtime.Node22,
    execute: [sdk.Role.any()],
    events: [],
    schedule,
    timeout,
    enabled: true,
    logging: true,
    entrypoint: "src/birthdayDigestCron.js",
    commands: "npm install",
    scopes: [
      sdk.Scopes.UsersRead,
      sdk.Scopes.UsersWrite,
      sdk.Scopes.DatabasesRead,
      sdk.Scopes.DatabasesWrite,
    ],
  };

  try {
    const existing = await functions.get({ functionId });
    await functions.update({
      functionId,
      name: params.name,
      runtime: existing.runtime || params.runtime,
      execute: existing.execute?.length ? existing.execute : params.execute,
      events: [],
      schedule,
      timeout,
      enabled: true,
      logging: true,
      entrypoint: params.entrypoint,
      commands: params.commands,
      scopes: existing.scopes?.length ? existing.scopes : params.scopes,
    });
    console.log(`Function updated: ${functionId} (schedule=${schedule}, timeout=${timeout}s)`);
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
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return functions.getDeployment({ functionId, deploymentId });
}

async function ensureArchive(env) {
  if (fs.existsSync(archivePath) && process.env.BIRTHDAY_DIGEST_REUSE_ARCHIVE === "1") {
    console.log(`Reusing archive: ${archivePath}`);
    return;
  }
  const result = spawnSync(process.execPath, ["scripts/deploy-admin-function.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      APPWRITE_ENDPOINT: env.endpoint,
      APPWRITE_PROJECT_ID: env.projectId,
      APPWRITE_API_KEY: env.apiKey,
      ADMIN_USERS_BUILD_ONLY: "1",
    },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error("Falha ao gerar o pacote (deploy-admin-function.mjs).");
  }
}

async function copyVariablesFromAdminUsers(functions, fileEnv, apiKey) {
  const sourceVars = await listAllVariables(functions, sourceFunctionId);
  if (!sourceVars.length) {
    throw new Error(`Nenhuma variável encontrada em ${sourceFunctionId}. Faça o deploy do admin-users primeiro.`);
  }
  console.log(`Copying variables from ${sourceFunctionId} → ${functionId}`);
  let copied = 0;
  let skipped = 0;
  for (const variable of sourceVars) {
    let value = variable.value;
    if ((value == null || value === "") && variable.key === "APPWRITE_API_KEY") value = apiKey;
    if ((value == null || value === "") && variable.key === "WORKER_SECRET") {
      value = process.env.WORKER_SECRET || fileEnv.WORKER_SECRET || fileEnv.VITE_CF_WORKER_SECRET || "";
    }
    if ((value == null || value === "") && variable.key === "WEB_PUSH_PRIVATE_KEY") {
      value = process.env.WEB_PUSH_PRIVATE_KEY || fileEnv.WEB_PUSH_PRIVATE_KEY || "";
    }
    if (value == null || value === "") {
      skipped += 1;
      console.warn(`  skip empty: ${variable.key}`);
      continue;
    }
    await upsertVariable(functions, variable.key, value, Boolean(variable.secret));
    copied += 1;
  }
  await upsertVariable(functions, "APPWRITE_API_KEY", apiKey, true);
  console.log(`Variables copied=${copied} skipped=${skipped}`);
}

async function main() {
  const fileEnv = parseEnvFile(envPath);
  const endpoint = process.env.APPWRITE_ENDPOINT || fileEnv.VITE_APPWRITE_ENDPOINT;
  const projectId = process.env.APPWRITE_PROJECT_ID || fileEnv.VITE_APPWRITE_PROJECT_ID;
  const apiKey = process.env.APPWRITE_API_KEY || fileEnv.APPWRITE_API_KEY;
  if (!endpoint || !projectId || !apiKey) {
    throw new Error("Missing VITE_APPWRITE_ENDPOINT / VITE_APPWRITE_PROJECT_ID / APPWRITE_API_KEY");
  }

  await ensureArchive({ endpoint, projectId, apiKey });
  if (!fs.existsSync(archivePath)) throw new Error(`Archive missing: ${archivePath}`);

  const client = new sdk.Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  const functions = new sdk.Functions(client);

  await ensureFunction(functions);
  await copyVariablesFromAdminUsers(functions, fileEnv, apiKey);

  const buffer = fs.readFileSync(archivePath);
  const code = InputFile.fromBuffer(buffer, "birthday-digest.tar.gz");
  const deployment = await functions.createDeployment({
    functionId,
    code,
    activate: true,
    entrypoint: "src/birthdayDigestCron.js",
    commands: "npm install",
  });
  console.log(`Deployment created: ${deployment.$id}`);
  const finalDeployment = await waitForDeployment(functions, deployment.$id);
  const finalStatus = finalDeployment.status || finalDeployment.$status || "unknown";
  console.log(`Deployment status: ${finalStatus}`);

  if (finalStatus !== "ready") {
    console.error(`Deployment did not reach ready (got '${finalStatus}').`);
    process.exit(1);
  }

  const activated = await functions.updateFunctionDeployment({
    functionId,
    deploymentId: deployment.$id,
  });
  console.log(`Deployment activated: ${activated.deploymentId || deployment.$id}`);

  const info = await functions.get({ functionId });
  console.log(`OK ${functionId} schedule=${info.schedule || schedule} timeout=${info.timeout || timeout}s`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
