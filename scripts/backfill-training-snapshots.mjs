/**
 * Backfill: voos com mais de uma missão (training_mission_ids_json) gravavam só o
 * snapshot da missão primária em training_snapshot_json — a coluna "Missão" das
 * listagens exibia uma missão só. Este script decodifica o meta do registro
 * (meta.training.snapshots) e regrava o training_snapshot_json no formato novo
 * ({ ...primário, snapshots: [...] }).
 *
 * Uso:
 *   node scripts/backfill-training-snapshots.mjs          (dry-run)
 *   node scripts/backfill-training-snapshots.mjs --apply  (grava)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases, Storage, Query } from "node-appwrite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");
const env = {};
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const idx = line.indexOf("=");
    if (idx > 0 && !line.trim().startsWith("#")) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
}

const ENDPOINT = process.env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY || env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || env.VITE_APPWRITE_DATABASE_ID;
const FLIGHTS_COL = process.env.APPWRITE_COLLECTION_ID || env.VITE_APPWRITE_COLLECTION_ID;
const BUCKET_ID = process.env.APPWRITE_BUCKET_ID || env.VITE_APPWRITE_BUCKET_ID;
const APPLY = process.argv.includes("--apply");

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID || !FLIGHTS_COL) {
  console.error("Variáveis de ambiente ausentes (endpoint/projeto/chave/db/coleção).");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);
const storage = new Storage(client);

const META_PREFIX = "#GFV_META_V1:";

function decodeMeta(csvText) {
  const firstLine = String(csvText || "").replace(/^﻿/, "").split(/\r?\n/, 1)[0]?.trim() ?? "";
  if (!firstLine.startsWith(META_PREFIX)) return null;
  try {
    return JSON.parse(Buffer.from(firstLine.slice(META_PREFIX.length).trim(), "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function parseJsonSafe(raw) {
  try {
    const parsed = JSON.parse(raw || "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function dedupeSnapshots(candidates) {
  const byMission = new Map();
  for (const snapshot of candidates) {
    const missionId = String(snapshot?.missionId ?? "").trim();
    if (!missionId || byMission.has(missionId)) continue;
    byMission.set(missionId, snapshot);
  }
  return [...byMission.values()];
}

async function loadCsvText(doc) {
  if (doc.csv_text && doc.csv_text.trim()) return doc.csv_text;
  if (doc.csv_file_id && BUCKET_ID) {
    try {
      const buffer = await storage.getFileDownload(BUCKET_ID, doc.csv_file_id);
      return Buffer.from(buffer).toString("utf8");
    } catch (err) {
      console.warn(`  [${doc.$id}] falha ao baixar csv (${err.message})`);
      return "";
    }
  }
  return "";
}

async function main() {
  let cursor = null;
  let scanned = 0;
  let multiMission = 0;
  let updated = 0;
  let skippedOk = 0;
  let noSnapshots = 0;

  while (true) {
    const queries = [
      Query.select(["$id", "training_mission_ids_json", "training_snapshot_json", "csv_text", "csv_file_id"]),
      Query.isNotNull("training_mission_ids_json"),
      Query.orderAsc("$id"),
      Query.limit(100),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const page = await databases.listDocuments(DATABASE_ID, FLIGHTS_COL, queries);
    if (!page.documents.length) break;

    for (const doc of page.documents) {
      scanned += 1;
      const missionIds = (() => {
        try {
          const parsed = JSON.parse(doc.training_mission_ids_json || "[]");
          return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        } catch {
          return [];
        }
      })();
      if (missionIds.length <= 1) continue;
      multiMission += 1;

      const currentSnapshot = parseJsonSafe(doc.training_snapshot_json);
      const currentEmbedded = Array.isArray(currentSnapshot?.snapshots) ? currentSnapshot.snapshots : [];
      if (currentEmbedded.length > 1) {
        skippedOk += 1;
        continue;
      }

      const csvText = await loadCsvText(doc);
      const meta = decodeMeta(csvText);
      const metaSnapshots = dedupeSnapshots([
        ...(Array.isArray(meta?.training?.snapshots) ? meta.training.snapshots : []),
        ...(meta?.training?.snapshot ? [meta.training.snapshot] : []),
        ...(currentSnapshot ? [currentSnapshot] : []),
      ]);
      if (metaSnapshots.length <= 1) {
        noSnapshots += 1;
        console.log(`  [${doc.$id}] ${missionIds.length} missões mas só ${metaSnapshots.length} snapshot(s) no meta — mantido.`);
        continue;
      }

      const root = currentSnapshot && String(currentSnapshot.missionId ?? "").trim()
        ? metaSnapshots.find((s) => s.missionId === currentSnapshot.missionId) ?? metaSnapshots[0]
        : metaSnapshots[0];
      const ordered = [root, ...metaSnapshots.filter((s) => s.missionId !== root.missionId)];
      const nextJson = JSON.stringify({ ...root, snapshots: ordered });

      if (nextJson === doc.training_snapshot_json) {
        skippedOk += 1;
        continue;
      }
      const names = ordered.map((s) => s.missionName).join(", ");
      console.log(`  [${doc.$id}] ${APPLY ? "atualizando" : "atualizaria"} → ${names}`);
      if (APPLY) {
        await databases.updateDocument(DATABASE_ID, FLIGHTS_COL, doc.$id, { training_snapshot_json: nextJson });
        updated += 1;
      }
    }

    cursor = page.documents[page.documents.length - 1].$id;
    if (page.documents.length < 100) break;
  }

  console.log(`\nVoos com training_mission_ids_json: ${scanned}`);
  console.log(`Voos multi-missão: ${multiMission}`);
  console.log(`Já no formato novo / sem mudança: ${skippedOk}`);
  console.log(`Sem snapshots suficientes no meta: ${noSnapshots}`);
  console.log(APPLY ? `Atualizados: ${updated}` : "Dry-run (use --apply para gravar).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
