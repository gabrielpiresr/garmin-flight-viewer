/**
 * Inspeciona o meta de um voo para ver quais campos existem.
 * Uso: node scripts/inspect-flight-meta.mjs
 */
import { Client, Databases, Query } from "node-appwrite";

const ENDPOINT    = process.env.APPWRITE_ENDPOINT    || process.env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID  = process.env.APPWRITE_PROJECT_ID  || process.env.VITE_APPWRITE_PROJECT_ID;
const API_KEY     = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID;
const FLIGHTS_COL = process.env.APPWRITE_COLLECTION_ID || process.env.VITE_APPWRITE_COLLECTION_ID || "6a01afb1002232d33950";

const client    = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);

const META_PREFIX = "#GFV_META_V1:";

async function main() {
  const page = await databases.listDocuments(DATABASE_ID, FLIGHTS_COL, [
    Query.limit(3),
    Query.select(["$id", "csv_text", "total_flight_minutes", "block_time_minutes"]),
  ]);

  for (const doc of page.documents) {
    console.log(`\n=== Flight ${doc.$id} ===`);
    console.log(`  total_flight_minutes: ${doc.total_flight_minutes}`);
    console.log(`  block_time_minutes:   ${doc.block_time_minutes}`);

    const csvText = doc.csv_text || "";
    const normalized = csvText.replace(/^﻿/, "");
    const firstLine = normalized.split(/\r?\n/, 1)[0]?.trim() ?? "";

    if (!firstLine.startsWith(META_PREFIX)) {
      console.log(`  [NO META PREFIX]`);
      console.log(`  First line: ${firstLine.slice(0, 100)}`);
      continue;
    }

    try {
      const encoded = firstLine.slice(META_PREFIX.length).trim();
      const raw = Buffer.from(encoded, "base64").toString("utf8");
      const meta = JSON.parse(raw);
      console.log(`  meta.header:`, JSON.stringify(meta.header, null, 4));
    } catch (e) {
      console.log(`  [DECODE ERROR]: ${e.message}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
