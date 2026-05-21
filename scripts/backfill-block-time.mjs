/**
 * Backfill: lê o csv_text de cada voo existente, extrai o tempo de bloco
 * (departureTimeUtc → engineCutoffTimeUtc do meta JSON) e grava em block_time_minutes.
 *
 * O csv_text começa com "#GFV_META_V1:" seguido de JSON base64.
 * O meta.header contém departureTimeUtc e engineCutoffTimeUtc (formato "HH:MM").
 *
 * Uso:
 *   node scripts/backfill-block-time.mjs
 */
import { Client, Databases, Query } from "node-appwrite";

const ENDPOINT    = process.env.APPWRITE_ENDPOINT    || process.env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID  = process.env.APPWRITE_PROJECT_ID  || process.env.VITE_APPWRITE_PROJECT_ID;
const API_KEY     = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID;
const FLIGHTS_COL = process.env.APPWRITE_COLLECTION_ID || process.env.VITE_APPWRITE_COLLECTION_ID || "6a01afb1002232d33950";

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("Missing env vars.");
  process.exit(1);
}

const client    = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);

const META_PREFIX = "#GFV_META_V1:";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Parses "HH:MM" into total minutes, returns null if invalid. */
function parseClockMinutes(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!isFinite(hours) || !isFinite(minutes) || hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Decodes the GFV meta from csv_text and returns block time in minutes, or null. */
function extractBlockMinutes(csvText) {
  if (!csvText) return null;

  const normalized = csvText.replace(/^﻿/, "");
  const firstLine = normalized.split(/\r?\n/, 1)[0]?.trim() ?? "";
  if (!firstLine.startsWith(META_PREFIX)) return null;

  let meta;
  try {
    const encoded = firstLine.slice(META_PREFIX.length).trim();
    const raw = Buffer.from(encoded, "base64").toString("utf8");
    meta = JSON.parse(raw);
  } catch {
    return null;
  }

  const dep = parseClockMinutes(meta?.header?.departureTimeUtc);
  const cut = parseClockMinutes(meta?.header?.engineCutoffTimeUtc);
  if (dep === null || cut === null) return null;

  // Handle midnight crossover
  const diff = cut >= dep ? cut - dep : cut + 24 * 60 - dep;
  return diff > 0 ? diff : null;
}

async function main() {
  console.log("=== backfill-block-time ===\n");

  let cursor = null;
  let total = 0;
  let updated = 0;
  let noData = 0;

  while (true) {
    const queries = [
      Query.limit(50),
      Query.select(["$id", "csv_text"]),
      Query.orderAsc("$id"),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    let page;
    try {
      page = await databases.listDocuments(DATABASE_ID, FLIGHTS_COL, queries);
    } catch (e) {
      console.error("Failed to list flights:", e?.message);
      break;
    }

    if (page.documents.length === 0) break;

    for (const doc of page.documents) {
      total++;
      const blockMinutes = extractBlockMinutes(doc.csv_text);

      if (blockMinutes === null) {
        noData++;
        continue;
      }

      try {
        await databases.updateDocument(DATABASE_ID, FLIGHTS_COL, doc.$id, {
          block_time_minutes: blockMinutes,
        });
        updated++;
        console.log(`  ✓ ${doc.$id}  block=${blockMinutes} min (${(blockMinutes / 60).toFixed(2)}h)`);
        await sleep(60);
      } catch (e) {
        console.warn(`  ✗ ${doc.$id}: ${e?.message}`);
      }
    }

    if (page.documents.length < 50) break;
    cursor = page.documents.at(-1).$id;
  }

  console.log(`\n✅ Concluído.`);
  console.log(`   Total processados       : ${total}`);
  console.log(`   block_time_minutes salvo: ${updated}`);
  console.log(`   Sem timestamps no meta  : ${noData}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
