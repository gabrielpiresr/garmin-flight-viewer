import { Client, Databases } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID;
const VIDEOS_COLLECTION_ID = process.env.APPWRITE_VIDEOS_COLLECTION_ID || process.env.VITE_APPWRITE_VIDEOS_COLLECTION_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID || !VIDEOS_COLLECTION_ID) {
  console.error(
    "Missing APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID or APPWRITE_VIDEOS_COLLECTION_ID.",
  );
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attr(label, createFn) {
  try {
    await createFn();
    await sleep(700);
    console.log(`ok ${label}`);
  } catch (error) {
    const message = error?.message ?? String(error);
    if (message.toLowerCase().includes("already exists")) {
      console.log(`skip ${label} already exists`);
      return;
    }
    throw error;
  }
}

console.log("Migrating flight_videos telemetry attributes...");
await attr("telemetry_present", () => db.createBooleanAttribute(DATABASE_ID, VIDEOS_COLLECTION_ID, "telemetry_present", false));
await attr("telemetry_source", () => db.createStringAttribute(DATABASE_ID, VIDEOS_COLLECTION_ID, "telemetry_source", 32, false));
await attr("telemetry_json", () => db.createStringAttribute(DATABASE_ID, VIDEOS_COLLECTION_ID, "telemetry_json", 1048576, false));
await attr("available_widgets", () => db.createStringAttribute(DATABASE_ID, VIDEOS_COLLECTION_ID, "available_widgets", 512, false));
console.log("Done.");
