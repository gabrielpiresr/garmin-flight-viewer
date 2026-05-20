import { Client, Databases, Query } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID;
const FLIGHTS_COL_ID = process.env.APPWRITE_FLIGHTS_COLLECTION_ID || process.env.APPWRITE_COLLECTION_ID || process.env.VITE_APPWRITE_COLLECTION_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DB_ID || !FLIGHTS_COL_ID) {
  console.error("Missing endpoint, project, key, database or flights collection env vars.");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function safeCreate(label, createFn) {
  try {
    await createFn();
    await sleep(800);
    console.log(`+ ${label}`);
  } catch (error) {
    const message = String(error?.message || error).toLowerCase();
    if (message.includes("already exists")) {
      console.log(`= ${label} already exists`);
      return;
    }
    throw error;
  }
}

function inferStatus(doc) {
  if (doc.instructor_signed) return "Realizado";
  if (typeof doc.flight_status === "string" && ["Previsto", "Cancelado", "Realizado"].includes(doc.flight_status)) {
    return doc.flight_status;
  }
  return "Previsto";
}

async function backfill() {
  let cursor = null;
  let updated = 0;
  for (;;) {
    const queries = [
      Query.limit(100),
      Query.select(["$id", "flight_status", "instructor_signed"]),
      Query.orderAsc("$id"),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const res = await db.listDocuments(DB_ID, FLIGHTS_COL_ID, queries);
    for (const doc of res.documents) {
      const status = inferStatus(doc);
      if (doc.flight_status !== status) {
        await db.updateDocument(DB_ID, FLIGHTS_COL_ID, doc.$id, { flight_status: status });
        updated += 1;
      }
    }
    if (res.documents.length < 100) break;
    cursor = res.documents.at(-1)?.$id;
    if (!cursor) break;
  }
  console.log(`Backfill complete: ${updated} flights updated.`);
}

console.log("Setting up flight_status on flights...");
await safeCreate("flight_status attribute", () => db.createStringAttribute(DB_ID, FLIGHTS_COL_ID, "flight_status", 16, false));
await safeCreate("flight_status index", () => db.createIndex(DB_ID, FLIGHTS_COL_ID, "idx_flight_status", "key", ["flight_status"], ["ASC"]));
await backfill();
