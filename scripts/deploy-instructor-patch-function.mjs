/**
 * Deploy the instructor-patch-flight Appwrite function.
 *
 * Usage:
 *   APPWRITE_API_KEY=<your-api-key> node scripts/deploy-instructor-patch-function.mjs
 *
 * The API key must have scope: functions.write (or be an admin key).
 */

import { Client, Functions } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { createGzip } from "node:zlib";
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable, Writable } from "node:stream";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const FUNCTION_DIR = join(ROOT, "functions", "instructor-patch-flight");

const ENDPOINT = process.env.APPWRITE_ENDPOINT || "https://sfo.cloud.appwrite.io/v1";
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || "6a01ac8a0009fbf94f05";
const API_KEY = process.env.APPWRITE_API_KEY;
const FUNCTION_ID = "instructor-patch-flight";
const FUNCTION_TIMEOUT_SECONDS = Number(process.env.INSTRUCTOR_PATCH_FUNCTION_TIMEOUT || 60);

if (!API_KEY) {
  console.error("APPWRITE_API_KEY is required.");
  process.exit(1);
}

function encodeStr(str, len) {
  const buf = Buffer.alloc(len, 0);
  Buffer.from(str, "utf8").copy(buf, 0, 0, Math.min(str.length, len - 1));
  return buf;
}

function createTarHeader(name, size, isDir) {
  const buf = Buffer.alloc(512, 0);
  const type = isDir ? "5" : "0";
  const mode = isDir ? "0000755" : "0000644";
  const mtime = Math.floor(Date.now() / 1000).toString(8).padStart(11, "0");

  encodeStr(name, 100).copy(buf, 0);
  encodeStr(mode, 8).copy(buf, 100);
  encodeStr("0000000", 8).copy(buf, 108);
  encodeStr("0000000", 8).copy(buf, 116);
  encodeStr(size.toString(8).padStart(11, "0"), 12).copy(buf, 124);
  encodeStr(mtime, 12).copy(buf, 136);
  Buffer.from("        ", "ascii").copy(buf, 148);
  buf[156] = type.charCodeAt(0);
  encodeStr("ustar  ", 8).copy(buf, 257);

  let sum = 0;
  for (let i = 0; i < 512; i += 1) sum += buf[i];
  encodeStr(sum.toString(8).padStart(6, "0") + "\0 ", 8).copy(buf, 148);
  return buf;
}

function collectFiles(dir, rel = "") {
  const entries = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const abs = join(dir, name);
    const relPath = rel ? `${rel}/${name}` : name;
    const st = statSync(abs);
    if (st.isDirectory()) {
      entries.push(...collectFiles(abs, relPath));
    } else {
      entries.push({ abs, relPath, size: st.size });
    }
  }
  return entries;
}

function buildTarBuffer(files) {
  const chunks = [];
  for (const { abs, relPath, size } of files) {
    chunks.push(createTarHeader(relPath, size, false));
    const content = readFileSync(abs);
    chunks.push(content);
    const pad = 512 - (size % 512);
    if (pad !== 512) chunks.push(Buffer.alloc(pad, 0));
  }
  chunks.push(Buffer.alloc(1024, 0));
  return Buffer.concat(chunks);
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

console.log("Building archive...");
const files = collectFiles(FUNCTION_DIR);
const tarBuf = buildTarBuffer(files);
const gzBuf = await gzip(tarBuf);

const archivePath = join(ROOT, ".tmp", "instructor-patch-function.tar.gz");
mkdirSync(join(ROOT, ".tmp"), { recursive: true });
writeFileSync(archivePath, gzBuf);
console.log(`Archive ready: ${archivePath}`);

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const functions = new Functions(client);

const deployment = await functions.createDeployment({
  functionId: FUNCTION_ID,
  code: InputFile.fromBuffer(gzBuf, "instructor-patch-flight.tar.gz"),
  activate: true,
  entrypoint: "src/main.js",
  commands: "npm install",
});

async function waitForDeploymentReady(functionId, deploymentId, maxAttempts = 90, delayMs = 2000) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const current = await functions.getDeployment({ functionId, deploymentId });
    const status = String(current?.status || "").toLowerCase();
    if (status === "ready" || status === "failed") return current;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return functions.getDeployment({ functionId, deploymentId });
}

const deployed = await waitForDeploymentReady(FUNCTION_ID, deployment.$id);
if (String(deployed?.status || "").toLowerCase() !== "ready") {
  console.error(`Deployment failed: ${deployed?.status || "unknown"}`);
  process.exit(1);
}

const functionInfo = await functions.get({ functionId: FUNCTION_ID });
const updated = await functions.update({
  functionId: FUNCTION_ID,
  name: functionInfo.name || "Instructor Patch Flight",
  runtime: functionInfo.runtime || "node-22",
  execute: Array.isArray(functionInfo.execute) && functionInfo.execute.length ? functionInfo.execute : ["users"],
  events: Array.isArray(functionInfo.events) ? functionInfo.events : [],
  schedule: typeof functionInfo.schedule === "string" ? functionInfo.schedule : "",
  timeout: FUNCTION_TIMEOUT_SECONDS,
  enabled: functionInfo.enabled !== false,
  logging: functionInfo.logging !== false,
  entrypoint: functionInfo.entrypoint || "src/main.js",
  commands: functionInfo.commands || "npm install",
  scopes: Array.isArray(functionInfo.scopes) ? functionInfo.scopes : [],
  deployment: deployment.$id,
});

console.log(`Deployment created: ${deployment.$id}`);
console.log(`Active deployment: ${updated.deploymentId || deployment.$id}`);
