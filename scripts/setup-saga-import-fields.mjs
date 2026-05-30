import fs from "node:fs";
import * as sdk from "node-appwrite";

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return;
  const text = fs.readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(".env.local");

const endpoint = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID;
const profilesId = process.env.APPWRITE_PROFILES_COLLECTION_ID || process.env.VITE_APPWRITE_PROFILES_COLLECTION_ID;
const flightsId = process.env.APPWRITE_FLIGHTS_COLLECTION_ID || process.env.VITE_APPWRITE_COLLECTION_ID;

if (!endpoint || !projectId || !apiKey || !databaseId || !profilesId || !flightsId) {
  throw new Error("Missing Appwrite env vars for SAGA import schema setup.");
}

const client = new sdk.Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const db = new sdk.Databases(client);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function attr(factory, label) {
  try {
    await factory();
    console.log(`created attribute ${label}`);
    await sleep(700);
  } catch (error) {
    const message = String(error?.message || error);
    if (/already exists/i.test(message)) {
      console.log(`attribute ${label} already exists`);
      return;
    }
    throw error;
  }
}

async function index(collectionId, key, attributes) {
  try {
    await db.createIndex(databaseId, collectionId, key, "key", attributes);
    console.log(`created index ${key}`);
    await sleep(700);
  } catch (error) {
    const message = String(error?.message || error);
    if (/already exists/i.test(message)) {
      console.log(`index ${key} already exists`);
      return;
    }
    throw error;
  }
}

console.log("Ensuring SAGA import fields...");
await attr(() => db.createStringAttribute(databaseId, profilesId, "saga_user_id", 64, false), "profiles.saga_user_id");
await attr(() => db.createStringAttribute(databaseId, flightsId, "saga_flight_id", 64, false), "flights.saga_flight_id");
await attr(() => db.createStringAttribute(databaseId, flightsId, "saga_imported_at", 64, false), "flights.saga_imported_at");
await attr(() => db.createStringAttribute(databaseId, flightsId, "saga_legs_json", 65535, false), "flights.saga_legs_json");

await index(profilesId, "profiles_saga_user_idx", ["saga_user_id"]);
await index(flightsId, "flights_saga_flight_idx", ["saga_flight_id"]);

console.log("SAGA import fields ready.");
