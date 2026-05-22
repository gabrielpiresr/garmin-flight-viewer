/**
 * Deploy the admin-users Appwrite function.
 *
 * Usage:
 *   APPWRITE_API_KEY=<your-api-key> node scripts/deploy-admin-function.mjs
 *
 * The API key must have scope: functions.write (or be an admin key).
 */

import { Client, Functions } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { createGzip } from "node:zlib";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable, Writable } from "node:stream";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const FUNCTION_DIR = join(ROOT, "functions", "admin-users");

const ENDPOINT = process.env.APPWRITE_ENDPOINT || "https://sfo.cloud.appwrite.io/v1";
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || "6a01ac8a0009fbf94f05";
const API_KEY = process.env.APPWRITE_API_KEY;
const FUNCTION_ID = "admin-users";

if (!API_KEY) {
  console.error("❌  APPWRITE_API_KEY is required.");
  process.exit(1);
}

// ── Minimal tar.gz builder (pure Node.js, no dependencies) ──────────────────

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

  encodeStr(name, 100).copy(buf, 0);           // name
  encodeStr(mode, 8).copy(buf, 100);            // mode
  encodeStr("0000000", 8).copy(buf, 108);       // uid
  encodeStr("0000000", 8).copy(buf, 116);       // gid
  encodeStr(size.toString(8).padStart(11, "0"), 12).copy(buf, 124); // size
  encodeStr(mtime, 12).copy(buf, 136);          // mtime
  Buffer.from("        ", "ascii").copy(buf, 148); // checksum placeholder
  buf[156] = type.charCodeAt(0);                // typeflag
  encodeStr("ustar  ", 8).copy(buf, 257);       // magic

  // Compute checksum
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += buf[i];
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
    // Padding to 512-byte boundary
    const pad = 512 - (size % 512);
    if (pad !== 512) chunks.push(Buffer.alloc(pad, 0));
  }
  // Two 512-byte zero blocks as end-of-archive marker
  chunks.push(Buffer.alloc(1024, 0));
  return Buffer.concat(chunks);
}

async function gzip(buf) {
  const chunks = [];
  await pipeline(
    Readable.from(buf),
    createGzip(),
    new Writable({
      write(chunk, _enc, cb) { chunks.push(chunk); cb(); }
    })
  );
  return Buffer.concat(chunks);
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log("📦  Building archive …");
const files = collectFiles(FUNCTION_DIR);
console.log(`    ${files.length} files:`, files.map(f => f.relPath).join(", "));
const tarBuf = buildTarBuffer(files);
const gzBuf = await gzip(tarBuf);
console.log(`✅  Archive ready — ${(gzBuf.length / 1024).toFixed(1)} KB`);

// Upload to Appwrite
const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const functions = new Functions(client);

console.log(`🚀  Uploading deployment to function "${FUNCTION_ID}" …`);
const deployment = await functions.createDeployment({
  functionId: FUNCTION_ID,
  code: InputFile.fromBuffer(gzBuf, "admin-users.tar.gz"),
  activate: true,
  entrypoint: "src/main.js",
  commands: "npm install",
});

console.log(`✅  Deployment created!`);
console.log(`    ID:     ${deployment.$id}`);
console.log(`    Status: ${deployment.status}`);
console.log(`    Build running on Appwrite — watch progress in the console.`);
