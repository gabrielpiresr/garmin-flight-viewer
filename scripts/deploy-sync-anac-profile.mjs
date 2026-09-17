import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable, Writable } from "node:stream";
import { Client, Functions, ID, Query, Role, Runtime } from "node-appwrite";
import { InputFile } from "node-appwrite/file";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const functionDir = path.join(root, "functions", "sync-anac-profile");
const functionId = process.env.SYNC_ANAC_FUNCTION_ID || "sync-anac-profile";
const envPath = path.join(root, ".env.local");

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

function encodeStr(str, len) {
  const buf = Buffer.alloc(len, 0);
  Buffer.from(str, "utf8").copy(buf, 0, 0, Math.min(Buffer.byteLength(str), len - 1));
  return buf;
}

function createTarHeader(name, size) {
  const buf = Buffer.alloc(512, 0);
  encodeStr(name, 100).copy(buf, 0);
  encodeStr("0000644", 8).copy(buf, 100);
  encodeStr("0000000", 8).copy(buf, 108);
  encodeStr("0000000", 8).copy(buf, 116);
  encodeStr(size.toString(8).padStart(11, "0"), 12).copy(buf, 124);
  encodeStr(Math.floor(Date.now() / 1000).toString(8).padStart(11, "0"), 12).copy(buf, 136);
  Buffer.from("        ", "ascii").copy(buf, 148);
  buf[156] = "0".charCodeAt(0);
  encodeStr("ustar  ", 8).copy(buf, 257);
  let sum = 0;
  for (let i = 0; i < 512; i += 1) sum += buf[i];
  encodeStr(`${sum.toString(8).padStart(6, "0")}\0 `, 8).copy(buf, 148);
  return buf;
}

function collectFiles(dir, rel = "") {
  const entries = [];
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const abs = path.join(dir, name);
    const relPath = rel ? `${rel}/${name}` : name;
    const st = fs.statSync(abs);
    if (st.isDirectory()) entries.push(...collectFiles(abs, relPath));
    else entries.push({ abs, relPath, size: st.size });
  }
  return entries;
}

async function gzip(buf) {
  const chunks = [];
  await pipeline(
    Readable.from(buf),
    createGzip(),
    new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk);
        cb();
      },
    }),
  );
  return Buffer.concat(chunks);
}

async function buildArchive() {
  const chunks = [];
  for (const file of collectFiles(functionDir)) {
    chunks.push(createTarHeader(file.relPath, file.size));
    chunks.push(fs.readFileSync(file.abs));
    const pad = 512 - (file.size % 512);
    if (pad !== 512) chunks.push(Buffer.alloc(pad, 0));
  }
  chunks.push(Buffer.alloc(1024, 0));
  return gzip(Buffer.concat(chunks));
}

async function listAllVariables(functions) {
  const variables = [];
  let offset = 0;
  while (true) {
    const page = await functions.listVariables({
      functionId,
      queries: [Query.limit(100), Query.offset(offset)],
    });
    variables.push(...(page.variables || []));
    if (!page.variables || page.variables.length < 100 || variables.length >= (page.total || 0)) break;
    offset += 100;
  }
  return variables;
}

async function upsertVariable(functions, variables, key, value, secret = false) {
  if (!value) return;
  const current = variables.find((variable) => variable.key === key);
  if (current) {
    await functions.updateVariable({ functionId, variableId: current.$id, key, value, secret });
  } else {
    await functions.createVariable({ functionId, variableId: ID.unique(), key, value, secret });
  }
}

async function waitForDeployment(functions, deploymentId) {
  for (let i = 0; i < 90; i += 1) {
    const deployment = await functions.getDeployment({ functionId, deploymentId });
    const status = String(deployment.status || "").toLowerCase();
    if (status === "ready" || status === "failed") return deployment;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return functions.getDeployment({ functionId, deploymentId });
}

const env = parseEnvFile(envPath);
const endpoint = process.env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY || env.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID || env.VITE_APPWRITE_DATABASE_ID;
const profilesCollectionId = process.env.APPWRITE_PROFILES_COLLECTION_ID || env.VITE_APPWRITE_PROFILES_COLLECTION_ID;
const bucketId = process.env.APPWRITE_BUCKET_ID || env.VITE_APPWRITE_BUCKET_ID;

const missing = [];
if (!endpoint) missing.push("VITE_APPWRITE_ENDPOINT");
if (!projectId) missing.push("VITE_APPWRITE_PROJECT_ID");
if (!apiKey) missing.push("APPWRITE_API_KEY");
if (!databaseId) missing.push("VITE_APPWRITE_DATABASE_ID");
if (!profilesCollectionId) missing.push("VITE_APPWRITE_PROFILES_COLLECTION_ID");
if (!bucketId) missing.push("VITE_APPWRITE_BUCKET_ID");
if (missing.length) throw new Error(`Missing required values: ${missing.join(", ")}`);

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const functions = new Functions(client);

try {
  await functions.get({ functionId });
  console.log(`Function exists: ${functionId}`);
} catch (error) {
  if (error?.code !== 404) throw error;
  await functions.create({
    functionId,
    name: "Sync Anac Profile",
    runtime: Runtime.Node22,
    execute: [Role.any()],
    events: [],
    schedule: "",
    timeout: 120,
    enabled: true,
    logging: true,
    entrypoint: "src/main.js",
    commands: "npm install",
    scopes: [],
  });
  console.log(`Function created: ${functionId}`);
}

const variables = await listAllVariables(functions);
await upsertVariable(functions, variables, "APPWRITE_API_KEY", apiKey, true);
await upsertVariable(functions, variables, "APPWRITE_DATABASE_ID", databaseId);
await upsertVariable(functions, variables, "APPWRITE_PROFILES_COLLECTION_ID", profilesCollectionId);
await upsertVariable(functions, variables, "APPWRITE_BUCKET_ID", bucketId);

const archive = await buildArchive();
console.log(`Archive ready: ${(archive.length / 1024).toFixed(1)} KB`);
const deployment = await functions.createDeployment({
  functionId,
  code: InputFile.fromBuffer(archive, "sync-anac-profile.tar.gz"),
  activate: true,
  entrypoint: "src/main.js",
  commands: "npm install",
});
console.log(`Deployment created: ${deployment.$id}`);

const finalDeployment = await waitForDeployment(functions, deployment.$id);
const status = String(finalDeployment.status || "").toLowerCase();
console.log(`Deployment status: ${status}`);
if (status !== "ready") process.exit(1);

const activated = await functions.updateFunctionDeployment({ functionId, deploymentId: deployment.$id });
console.log(`Deployment activated: ${activated.deploymentId || deployment.$id}`);
