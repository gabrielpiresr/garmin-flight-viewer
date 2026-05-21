/**
 * Migration: Add soft-delete support to aircraft_models, aircrafts, school_products, product_sales.
 *
 * For each collection:
 *   1. Creates a nullable datetime attribute `deleted_at` (default null).
 *   2. Creates an index on `deleted_at` so Query.isNull("deleted_at") stays fast.
 *
 * Safe to run multiple times — skips attributes/indexes that already exist.
 *
 * Run: node scripts/add-soft-delete.mjs
 */

import { Client, Databases } from "node-appwrite";

// ── credentials ────────────────────────────────────────────────────────────
const ENDPOINT   = "https://sfo.cloud.appwrite.io/v1";
const PROJECT_ID = "6a01ac8a0009fbf94f05";
const API_KEY    = process.env.APPWRITE_API_KEY;
const DATABASE_ID = "6a01afae001bc352d1b1";

if (!API_KEY) {
  console.error("❌  Set APPWRITE_API_KEY env var first.");
  process.exit(1);
}

const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const db = new Databases(client);

// ── collections to migrate ─────────────────────────────────────────────────
// Format: [collectionId, friendlyName]
const COLLECTIONS = [
  ["6a02204a00164218a4da", "aircraft_models"],
  ["6a0220510006e84fdaa9", "aircrafts"],
  ["school_products",      "school_products"],
  ["product_sales",        "product_sales"],
];

// ── helpers ────────────────────────────────────────────────────────────────

async function listExistingAttributes(collectionId) {
  try {
    const res = await db.listAttributes(DATABASE_ID, collectionId);
    return res.attributes.map((a) => a.key);
  } catch {
    return [];
  }
}

async function listExistingIndexes(collectionId) {
  try {
    const res = await db.listIndexes(DATABASE_ID, collectionId);
    return res.indexes.map((i) => i.key);
  } catch {
    return [];
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForAttribute(collectionId, key, maxWaitMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await db.listAttributes(DATABASE_ID, collectionId);
      const attr = res.attributes.find((a) => a.key === key);
      if (attr && attr.status === "available") return true;
      if (attr && attr.status === "failed") return false;
    } catch { /* ignore */ }
    await sleep(1500);
  }
  return false;
}

// ── main ───────────────────────────────────────────────────────────────────

for (const [colId, colName] of COLLECTIONS) {
  console.log(`\n── ${colName} (${colId}) ─────────────────────────`);

  // 1. Add attribute
  const existingAttrs = await listExistingAttributes(colId);
  if (existingAttrs.includes("deleted_at")) {
    console.log("  • deleted_at attribute already exists — skipping");
  } else {
    try {
      await db.createDatetimeAttribute(DATABASE_ID, colId, "deleted_at", false, null, false);
      console.log("  ✓ created datetime attribute deleted_at");

      console.log("  … waiting for attribute to become available");
      const ok = await waitForAttribute(colId, "deleted_at");
      if (!ok) {
        console.warn("  ⚠  attribute not ready after 30s — skipping index creation for this collection");
        continue;
      }
      console.log("  ✓ attribute is available");
    } catch (err) {
      if (String(err).includes("already exists")) {
        console.log("  • deleted_at already exists (race) — continuing");
      } else {
        console.error("  ❌  failed to create attribute:", err.message ?? err);
        continue;
      }
    }
  }

  // 2. Add index
  const existingIndexes = await listExistingIndexes(colId);
  const indexKey = "idx_deleted_at";
  if (existingIndexes.includes(indexKey)) {
    console.log("  • idx_deleted_at index already exists — skipping");
  } else {
    try {
      await db.createIndex(DATABASE_ID, colId, indexKey, "key", ["deleted_at"], ["ASC"]);
      console.log("  ✓ created index idx_deleted_at");
    } catch (err) {
      if (String(err).includes("already exists")) {
        console.log("  • index already exists (race) — ok");
      } else {
        console.error("  ❌  failed to create index:", err.message ?? err);
      }
    }
  }
}

console.log("\n✅  Migration complete.");
