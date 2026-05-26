import { Client, Databases } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || "https://sfo.cloud.appwrite.io/v1";
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID || "6a01ac8a0009fbf94f05";
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID || "6a01afae001bc352d1b1";
const FLIGHTS_COLLECTION_ID =
  process.env.APPWRITE_FLIGHTS_COLLECTION_ID || process.env.APPWRITE_COLLECTION_ID || process.env.VITE_APPWRITE_COLLECTION_ID || "6a01afb1002232d33950";

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID || !FLIGHTS_COLLECTION_ID) {
  console.error("Missing Appwrite env. Required: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID, APPWRITE_COLLECTION_ID.");
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
    await sleep(800);
    console.log(`✓ ${label}`);
  } catch (error) {
    const message = error?.message ?? String(error);
    if (message.toLowerCase().includes("already exists")) {
      console.log(`• ${label} already exists`);
      return;
    }
    throw error;
  }
}

async function idx(label, createFn) {
  try {
    await createFn();
    await sleep(800);
    console.log(`✓ index ${label}`);
  } catch (error) {
    const message = error?.message ?? String(error);
    if (message.toLowerCase().includes("already exists")) {
      console.log(`• index ${label} already exists`);
      return;
    }
    throw error;
  }
}

console.log("Configuring public flight review share fields...");
console.log(`Project: ${PROJECT_ID}`);
console.log(`Database: ${DATABASE_ID}`);
console.log(`Flights collection: ${FLIGHTS_COLLECTION_ID}`);

await attr("public_share_token_hash", () =>
  db.createStringAttribute(DATABASE_ID, FLIGHTS_COLLECTION_ID, "public_share_token_hash", 128, false),
);
await attr("public_share_enabled", () =>
  db.createBooleanAttribute(DATABASE_ID, FLIGHTS_COLLECTION_ID, "public_share_enabled", false),
);
await attr("public_share_created_at", () =>
  db.createStringAttribute(DATABASE_ID, FLIGHTS_COLLECTION_ID, "public_share_created_at", 64, false),
);
await attr("public_share_last_generated_at", () =>
  db.createStringAttribute(DATABASE_ID, FLIGHTS_COLLECTION_ID, "public_share_last_generated_at", 64, false),
);
await idx("flights_public_share_token_hash_idx", () =>
  db.createIndex(DATABASE_ID, FLIGHTS_COLLECTION_ID, "flights_public_share_token_hash_idx", "key", ["public_share_token_hash"]),
);

console.log("Public flight review share setup complete.");
