/**
 * Cria a coleção "runways" no Appwrite e importa os dados do CSV
 * runways_brasil_com_cabeceiras.csv.
 *
 * Uso:
 *   node scripts/import-runways.mjs [caminho-para-csv]
 *
 * O script lê APPWRITE_API_KEY de .env.local (ou variável de ambiente).
 * As demais variáveis (endpoint, project, database) são lidas de .env.local.
 */

import fs from "node:fs";
import path from "node:path";
import { Client, Databases, ID, Permission, Query, Role } from "node-appwrite";

const DEFAULT_CSV_PATH = "C:\\Users\\User\\Downloads\\runways_brasil_com_cabeceiras.csv";
const COLLECTION_NAME = "runways";

// ─── env ─────────────────────────────────────────────────────────────────────

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return env;
}

const localEnv = loadEnvFile(path.resolve(".env.local"));

const ENDPOINT    = process.env.APPWRITE_ENDPOINT    || localEnv.APPWRITE_ENDPOINT    || localEnv.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID  = process.env.APPWRITE_PROJECT_ID  || localEnv.APPWRITE_PROJECT_ID  || localEnv.VITE_APPWRITE_PROJECT_ID;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || localEnv.APPWRITE_DATABASE_ID || localEnv.VITE_APPWRITE_DATABASE_ID;
const API_KEY     = process.env.APPWRITE_API_KEY     || localEnv.APPWRITE_API_KEY;
const COLLECTION_ID =
  process.env.APPWRITE_RUNWAYS_COL_ID ||
  localEnv.APPWRITE_RUNWAYS_COL_ID ||
  localEnv.VITE_APPWRITE_RUNWAYS_COL_ID ||
  COLLECTION_NAME;

if (!ENDPOINT || !PROJECT_ID || !DATABASE_ID || !API_KEY) {
  console.error("Variáveis ausentes. Necessário: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_DATABASE_ID e APPWRITE_API_KEY.");
  process.exit(1);
}

const csvPath = process.argv[2] || DEFAULT_CSV_PATH;

// ─── Appwrite client ──────────────────────────────────────────────────────────

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const COLLECTION_PERMISSIONS = [
  Permission.read(Role.users()),
  Permission.read(Role.label("admin")),
  Permission.read(Role.label("instrutor")),
  Permission.read(Role.label("aluno")),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

// ─── helpers ─────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeAttr(createFn, label) {
  try {
    await createFn();
    await sleep(700);
    console.log(`   + ${label}`);
  } catch (error) {
    const message = error?.message ?? String(error);
    if (message.toLowerCase().includes("already exists")) {
      console.log(`   * ${label} (já existe)`);
      return;
    }
    throw error;
  }
}

async function safeIndex(collectionId, key, attributes, orders = ["ASC"]) {
  try {
    await db.createIndex(DATABASE_ID, collectionId, key, "key", attributes, orders);
    await sleep(700);
    console.log(`   + índice ${key}`);
  } catch (error) {
    const message = error?.message ?? String(error);
    if (message.toLowerCase().includes("already exists")) {
      console.log(`   * índice ${key} (já existe)`);
      return;
    }
    throw error;
  }
}

// ─── collection setup ─────────────────────────────────────────────────────────

async function ensureCollection() {
  const existing = await db.listCollections(DATABASE_ID, [Query.limit(100)]);
  const found = existing.collections.find(
    (c) => c.$id === COLLECTION_ID || c.name === COLLECTION_NAME,
  );

  if (found) {
    if (process.env.RESET_RUNWAYS_COLLECTION === "1") {
      await db.deleteCollection(DATABASE_ID, found.$id);
      await sleep(1000);
      const created = await db.createCollection(
        DATABASE_ID, COLLECTION_ID, COLLECTION_NAME, COLLECTION_PERMISSIONS, false, true,
      );
      console.log(`Coleção "${COLLECTION_NAME}" recriada (${created.$id})`);
      return created.$id;
    }
    console.log(`Coleção "${found.name}" já existe (${found.$id})`);
    return found.$id;
  }

  const created = await db.createCollection(
    DATABASE_ID, COLLECTION_ID, COLLECTION_NAME, COLLECTION_PERMISSIONS, false, true,
  );
  console.log(`Coleção "${COLLECTION_NAME}" criada (${created.$id})`);
  return created.$id;
}

async function configureCollection(colId) {
  console.log("Configurando atributos…");
  // strings obrigatórias
  await safeAttr(() => db.createStringAttribute(DATABASE_ID, colId, "airport_ident", 12, true),  "airport_ident");
  await safeAttr(() => db.createStringAttribute(DATABASE_ID, colId, "le_ident",      8,  true),  "le_ident");
  await safeAttr(() => db.createStringAttribute(DATABASE_ID, colId, "he_ident",      8,  true),  "he_ident");
  // floats opcionais
  await safeAttr(() => db.createFloatAttribute(DATABASE_ID,  colId, "le_lat",             false), "le_lat");
  await safeAttr(() => db.createFloatAttribute(DATABASE_ID,  colId, "le_lon",             false), "le_lon");
  await safeAttr(() => db.createFloatAttribute(DATABASE_ID,  colId, "he_lat",             false), "he_lat");
  await safeAttr(() => db.createFloatAttribute(DATABASE_ID,  colId, "he_lon",             false), "he_lon");
  await safeAttr(() => db.createFloatAttribute(DATABASE_ID,  colId, "le_heading_true",    false), "le_heading_true");
  await safeAttr(() => db.createFloatAttribute(DATABASE_ID,  colId, "he_heading_true",    false), "he_heading_true");
  await safeAttr(() => db.createFloatAttribute(DATABASE_ID,  colId, "le_elevation_ft",    false), "le_elevation_ft");
  await safeAttr(() => db.createFloatAttribute(DATABASE_ID,  colId, "he_elevation_ft",    false), "he_elevation_ft");
  // integer opcional
  await safeAttr(() => db.createIntegerAttribute(DATABASE_ID, colId, "length_ft",         false), "length_ft");
  // string opcional
  await safeAttr(() => db.createStringAttribute(DATABASE_ID, colId,  "surface",    16,   false), "surface");
  // boolean opcional
  await safeAttr(() => db.createBooleanAttribute(DATABASE_ID, colId, "closed",            false), "closed");

  // índice por aeródromo
  await safeIndex(colId, "runways_airport_idx", ["airport_ident"]);
  console.log("Atributos e índices configurados.");
}

// ─── CSV parsing ──────────────────────────────────────────────────────────────

function parseCSV(csvText) {
  const lines = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line.split(",");
    const row = {};
    headers.forEach((h, idx) => { row[h] = (values[idx] ?? "").trim(); });
    rows.push(row);
  }
  return rows;
}

function toFloat(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function toInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function toBool(v) {
  return v === "1" || v === "true";
}

function rowToDocument(row) {
  const airportIdent = (row.airport_ident ?? "").trim().toUpperCase();
  if (!airportIdent) return null;

  return {
    airport_ident:   airportIdent,
    le_ident:        (row.le_ident ?? "").trim() || "?",
    he_ident:        (row.he_ident ?? "").trim() || "?",
    le_lat:          toFloat(row.le_latitude_deg),
    le_lon:          toFloat(row.le_longitude_deg),
    he_lat:          toFloat(row.he_latitude_deg),
    he_lon:          toFloat(row.he_longitude_deg),
    le_heading_true: toFloat(row.le_heading_degT),
    he_heading_true: toFloat(row.he_heading_degT),
    le_elevation_ft: toFloat(row.le_elevation_ft),
    he_elevation_ft: toFloat(row.he_elevation_ft),
    length_ft:       toInt(row.length_ft),
    surface:         (row.surface ?? "").trim().toUpperCase().slice(0, 16) || null,
    closed:          toBool(row.closed),
  };
}

// ─── importação ──────────────────────────────────────────────────────────────

// Permissões a nível de documento (create não é permitido em documentos)
const DOC_PERMISSIONS = [
  Permission.read(Role.users()),
  Permission.read(Role.label("admin")),
  Permission.read(Role.label("instrutor")),
  Permission.read(Role.label("aluno")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

async function importRows(colId, rows) {
  let created = 0;
  let skipped = 0;
  let errors  = 0;

  for (const row of rows) {
    const doc = rowToDocument(row);
    if (!doc) { skipped++; continue; }

    const docId = String(row.id ?? "").trim() || ID.unique();

    try {
      await db.createDocument(DATABASE_ID, colId, docId, doc, DOC_PERMISSIONS);
      created++;
      if (created % 20 === 0) process.stdout.write(`   ${created}/${rows.length}…\r`);
    } catch (error) {
      const message = error?.message ?? String(error);
      if (message.toLowerCase().includes("already exists") || message.includes("Document with the requested ID already exists")) {
        // Atualiza documento existente
        try {
          await db.updateDocument(DATABASE_ID, colId, docId, doc);
          created++;
        } catch {
          skipped++;
        }
      } else {
        errors++;
        console.error(`   ✗ doc ${docId}: ${message}`);
      }
    }
    // Pequena pausa para evitar throttling (≈ 5 docs/s)
    await sleep(200);
  }

  return { created, skipped, errors };
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== Import Runways → Appwrite ===`);
  console.log(`Endpoint   : ${ENDPOINT}`);
  console.log(`Database   : ${DATABASE_ID}`);
  console.log(`Collection : ${COLLECTION_ID}`);
  console.log(`CSV        : ${csvPath}`);
  console.log("");

  if (!fs.existsSync(csvPath)) {
    console.error(`Arquivo CSV não encontrado: ${csvPath}`);
    process.exit(1);
  }

  const csvText = fs.readFileSync(csvPath, "utf8");
  const rows = parseCSV(csvText);
  console.log(`Linhas no CSV: ${rows.length}`);

  const colId = await ensureCollection();
  await configureCollection(colId);

  console.log(`\nImportando ${rows.length} pistas…`);
  const { created, skipped, errors } = await importRows(colId, rows);

  console.log(`\n✓ Importação concluída.`);
  console.log(`  Criados/atualizados : ${created}`);
  console.log(`  Ignorados           : ${skipped}`);
  console.log(`  Erros               : ${errors}`);
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
