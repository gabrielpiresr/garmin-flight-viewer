import { Client, Functions } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { createGzip } from "node:zlib";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable, Writable } from "node:stream";

const root = fileURLToPath(new URL("..", import.meta.url));
const directory = join(root, "functions", "cakto-webhook");
const endpoint = process.env.APPWRITE_ENDPOINT || "https://sfo.cloud.appwrite.io/v1";
const projectId = process.env.APPWRITE_PROJECT_ID || "6a01ac8a0009fbf94f05";
const apiKey = process.env.APPWRITE_API_KEY;
if (!apiKey) throw new Error("APPWRITE_API_KEY é obrigatória.");

function header(name, size) {
  const buffer = Buffer.alloc(512);
  buffer.write(name, 0, 100);
  buffer.write("0000644\0", 100);
  buffer.write("0000000\0", 108);
  buffer.write("0000000\0", 116);
  buffer.write(`${size.toString(8).padStart(11, "0")}\0`, 124);
  buffer.write(`${Math.floor(Date.now() / 1000).toString(8).padStart(11, "0")}\0`, 136);
  buffer.fill(32, 148, 156);
  buffer.write("0", 156);
  buffer.write("ustar  ", 257);
  let sum = 0;
  for (const value of buffer) sum += value;
  buffer.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
  return buffer;
}
function files(dir, prefix = "") {
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules" || name.startsWith(".")) return [];
    const absolute = join(dir, name);
    const relative = prefix ? `${prefix}/${name}` : name;
    return statSync(absolute).isDirectory() ? files(absolute, relative) : [{ absolute, relative }];
  });
}
const chunks = [];
for (const file of files(directory)) {
  const content = readFileSync(file.absolute);
  chunks.push(header(file.relative, content.length), content);
  const padding = (512 - content.length % 512) % 512;
  if (padding) chunks.push(Buffer.alloc(padding));
}
chunks.push(Buffer.alloc(1024));
const compressed = [];
await pipeline(Readable.from(Buffer.concat(chunks)), createGzip(), new Writable({
  write(chunk, _encoding, callback) { compressed.push(chunk); callback(); },
}));
const archive = Buffer.concat(compressed);
const functions = new Functions(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey));
const deployment = await functions.createDeployment({
  functionId: "cakto-webhook",
  code: InputFile.fromBuffer(archive, "cakto-webhook.tar.gz"),
  activate: true,
  entrypoint: "src/main.js",
  commands: "npm install",
});
console.log(`Deployment criado: ${deployment.$id}`);
for (let attempt = 0; attempt < 90; attempt += 1) {
  const current = await functions.getDeployment({ functionId: "cakto-webhook", deploymentId: deployment.$id });
  if (current.status === "ready") {
    console.log("Deployment pronto e ativo.");
    break;
  }
  if (current.status === "failed") throw new Error(current.buildLogs || "Build da função falhou.");
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
