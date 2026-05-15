import { Client, Databases, Permission, Role, Storage } from "node-appwrite";
import fs from "node:fs";

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return;
  const lines = fs.readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

const ENDPOINT = process.env.APPWRITE_ENDPOINT ?? process.env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID ?? process.env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID ?? process.env.VITE_APPWRITE_DATABASE_ID;
const BUCKET_ID = process.env.APPWRITE_BUCKET_ID ?? process.env.VITE_APPWRITE_BUCKET_ID;

const COLLECTION_NAMES = [
  "flights",
  "flight_telemetry_summaries",
  "flight_landings",
  "flight_takeoffs",
  "flight_telemetry_alerts",
];

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("Missing env vars. Required: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID.");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);
const storage = new Storage(client);

const REQUIRED_PERMISSIONS = [
  Permission.create(Role.any()),
  Permission.read(Role.any()),
  Permission.update(Role.any()),
  Permission.delete(Role.any()),
  Permission.create(Role.users()),
  Permission.read(Role.users()),
  Permission.update(Role.users()),
  Permission.delete(Role.users()),
  Permission.create(Role.label("admin")),
  Permission.read(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
  Permission.create(Role.label("instrutor")),
  Permission.read(Role.label("instrutor")),
  Permission.update(Role.label("instrutor")),
  Permission.delete(Role.label("instrutor")),
];

function mergePermissions(current, required) {
  return Array.from(new Set([...(current ?? []), ...required]));
}

async function updateCollection(collectionId) {
  const collection = await databases.getCollection(DATABASE_ID, collectionId);
  const permissions = mergePermissions(collection.$permissions, REQUIRED_PERMISSIONS);
  await databases.updateCollection(
    DATABASE_ID,
    collection.$id,
    collection.name,
    permissions,
    collection.documentSecurity,
    collection.enabled,
  );
  console.log(`Updated collection ${collection.name} (${collection.$id})`);
}

async function updateBucket(bucketId) {
  const bucket = await storage.getBucket(bucketId);
  const permissions = mergePermissions(bucket.$permissions, REQUIRED_PERMISSIONS);
  await storage.updateBucket(
    bucket.$id,
    bucket.name,
    permissions,
    bucket.fileSecurity,
    bucket.enabled,
    bucket.maximumFileSize,
    bucket.allowedFileExtensions,
    bucket.compression,
    bucket.encryption,
    bucket.antivirus,
  );
  console.log(`Updated bucket ${bucket.name} (${bucket.$id})`);
}

const collectionsList = await databases.listCollections(DATABASE_ID);
const collectionsToUpdate = collectionsList.collections.filter((col) => COLLECTION_NAMES.includes(col.name));

for (const col of collectionsToUpdate) {
  await updateCollection(col.$id);
}

const bucketId = BUCKET_ID ?? "flights-csv";
await updateBucket(bucketId);

console.log("Flight schedule permissions are ready.");
