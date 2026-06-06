import fs from "node:fs";
import path from "node:path";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable, Writable } from "node:stream";
import { Client, Databases, Functions, ID } from "node-appwrite";
import { InputFile } from "node-appwrite/file";

for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index <= 0 || line.trim().startsWith("#")) continue;
    const key = line.slice(0, index).trim();
    if (!process.env[key]) process.env[key] = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
  }
}

const endpoint = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID;
if (!endpoint || !projectId || !apiKey || !databaseId) throw new Error("Configuração Appwrite incompleta.");

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const functions = new Functions(client);
const databases = new Databases(client);
const functionId = "schedule-booking";
const directory = path.resolve("functions", functionId);

function tarHeader(name, size) {
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
  return fs.readdirSync(dir).flatMap((name) => {
    if (name === "node_modules" || name.startsWith(".")) return [];
    const absolute = path.join(dir, name);
    const relative = prefix ? `${prefix}/${name}` : name;
    return fs.statSync(absolute).isDirectory() ? files(absolute, relative) : [{ absolute, relative }];
  });
}

const chunks = [];
for (const file of files(directory)) {
  const content = fs.readFileSync(file.absolute);
  chunks.push(tarHeader(file.relative, content.length), content);
  const padding = (512 - content.length % 512) % 512;
  if (padding) chunks.push(Buffer.alloc(padding));
}
chunks.push(Buffer.alloc(1024));
const compressed = [];
await pipeline(Readable.from(Buffer.concat(chunks)), createGzip(), new Writable({
  write(chunk, _encoding, callback) { compressed.push(chunk); callback(); },
}));
const archive = Buffer.concat(compressed);

const collections = await databases.listCollections(databaseId);
const byName = new Map(collections.collections.map((item) => [item.name, item.$id]));
const env = {
  APPWRITE_DATABASE_ID: databaseId,
  APPWRITE_FLIGHTS_COLLECTION_ID: process.env.VITE_APPWRITE_COLLECTION_ID,
  APPWRITE_PROFILES_COLLECTION_ID: process.env.VITE_APPWRITE_PROFILES_COLLECTION_ID,
  APPWRITE_AIRCRAFTS_COLLECTION_ID: process.env.VITE_APPWRITE_AIRCRAFTS_COL_ID,
  APPWRITE_STUDENT_CREDITS_COLLECTION_ID: process.env.VITE_APPWRITE_STUDENT_CREDITS_COL_ID,
  APPWRITE_CREDIT_ADJUSTMENTS_COLLECTION_ID: "credit_adjustments",
  APPWRITE_SCHEDULE_AUDIT_COLLECTION_ID: "schedule_audit_events",
  APPWRITE_SCHEDULE_SLOT_LOCKS_COLLECTION_ID: "schedule_slot_locks",
  APPWRITE_PLATFORM_SETTINGS_COLLECTION_ID: process.env.VITE_APPWRITE_PLATFORM_SETTINGS_COL_ID,
  APPWRITE_OPERATIONAL_WEEKS_COLLECTION_ID: process.env.VITE_APPWRITE_OP_WEEKS_COL_ID || byName.get("aircraft_operational_weeks"),
  SCHOOL_ID: process.env.VITE_SCHOOL_ID || "escola_principal",
};

const variables = await functions.listVariables({ functionId });
for (const [key, value] of Object.entries(env)) {
  if (!value) throw new Error(`Variável ausente: ${key}`);
  const current = variables.variables.find((item) => item.key === key);
  if (current) await functions.updateVariable({ functionId, variableId: current.$id, key, value, secret: false });
  else await functions.createVariable({ functionId, variableId: ID.unique(), key, value, secret: false });
}

const deployment = await functions.createDeployment({
  functionId,
  code: InputFile.fromBuffer(archive, "schedule-booking.tar.gz"),
  activate: true,
  entrypoint: "src/main.js",
  commands: "npm install",
});
for (let attempt = 0; attempt < 90; attempt += 1) {
  const current = await functions.getDeployment({ functionId, deploymentId: deployment.$id });
  if (current.status === "ready") {
    console.log(`Deployment pronto: ${deployment.$id}`);
    break;
  }
  if (current.status === "failed") throw new Error(current.buildLogs || "Build da função falhou.");
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

const envPath = ".env.local";
const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
const publicValues = {
  VITE_APPWRITE_SCHEDULE_BOOKING_FUNCTION_ID: functionId,
  VITE_APPWRITE_CREDIT_ADJUSTMENTS_COL_ID: "credit_adjustments",
};
for (const [key, value] of Object.entries(publicValues)) {
  const line = `${key}=${value}`;
  const index = lines.findIndex((item) => item.startsWith(`${key}=`));
  if (index >= 0) lines[index] = line;
  else lines.push(line);
}
fs.writeFileSync(envPath, lines.join("\n"));
console.log("Variáveis públicas atualizadas.");
