import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Client, Databases, ID, Permission, Query, Role } from "node-appwrite";

const DEFAULT_PRIVATE_PATH = "C:\\Users\\User\\Downloads\\AerodromosPrivados (1).xls";
const DEFAULT_PUBLIC_PATH = "C:\\Users\\User\\Downloads\\aerodromospublicos-12.xls";
const COLLECTION_NAME = "aerodromes";
const COLLECTION_ID = process.env.APPWRITE_AERODROMES_COL_ID || process.env.VITE_APPWRITE_AERODROMES_COL_ID || "aerodromes";

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
const ENDPOINT = process.env.APPWRITE_ENDPOINT || localEnv.APPWRITE_ENDPOINT || localEnv.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || localEnv.APPWRITE_PROJECT_ID || localEnv.VITE_APPWRITE_PROJECT_ID;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || localEnv.APPWRITE_DATABASE_ID || localEnv.VITE_APPWRITE_DATABASE_ID;
const API_KEY = process.env.APPWRITE_API_KEY || localEnv.APPWRITE_API_KEY;

if (!ENDPOINT || !PROJECT_ID || !DATABASE_ID || !API_KEY) {
  console.error("Missing env vars. Required: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_DATABASE_ID and APPWRITE_API_KEY.");
  process.exit(1);
}

const privatePath = process.argv[2] || DEFAULT_PRIVATE_PATH;
const publicPath = process.argv[3] || DEFAULT_PUBLIC_PATH;

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
      console.log(`   * ${label} (already exists)`);
      return;
    }
    throw error;
  }
}

async function safeIndex(collectionId, key, attributes, orders = ["ASC"]) {
  try {
    await db.createIndex(DATABASE_ID, collectionId, key, "key", attributes, orders);
    await sleep(700);
    console.log(`   + index ${key}`);
  } catch (error) {
    const message = error?.message ?? String(error);
    if (message.toLowerCase().includes("already exists")) {
      console.log(`   * index ${key} (already exists)`);
      return;
    }
    throw error;
  }
}

async function ensureCollection() {
  const existing = await db.listCollections(DATABASE_ID, [Query.limit(100)]);
  const found = existing.collections.find((collection) => collection.$id === COLLECTION_ID || collection.name === COLLECTION_NAME);
  if (found) {
    if (process.env.RESET_AERODROMES_COLLECTION === "1") {
      await db.deleteCollection(DATABASE_ID, found.$id);
      await sleep(1000);
      const created = await db.createCollection(DATABASE_ID, COLLECTION_ID, COLLECTION_NAME, COLLECTION_PERMISSIONS, false, true);
      console.log(`Recreated collection "${COLLECTION_NAME}" (${created.$id})`);
      return created.$id;
    }
    console.log(`Collection "${found.name}" already exists (${found.$id})`);
    return found.$id;
  }
  const created = await db.createCollection(DATABASE_ID, COLLECTION_ID, COLLECTION_NAME, COLLECTION_PERMISSIONS, false, true);
  console.log(`Created collection "${COLLECTION_NAME}" (${created.$id})`);
  return created.$id;
}

async function configureCollection(collectionId) {
  await safeAttr(() => db.createStringAttribute(DATABASE_ID, collectionId, "source_types", 128, true), "source_types");
  await safeAttr(() => db.createStringAttribute(DATABASE_ID, collectionId, "icao", 8, false), "icao");
  await safeAttr(() => db.createStringAttribute(DATABASE_ID, collectionId, "ciad", 16, true), "ciad");
  await safeAttr(() => db.createStringAttribute(DATABASE_ID, collectionId, "name", 128, true), "name");
  await safeAttr(() => db.createStringAttribute(DATABASE_ID, collectionId, "municipality", 64, false), "municipality");
  await safeAttr(() => db.createStringAttribute(DATABASE_ID, collectionId, "uf", 2, false), "uf");
  await safeAttr(() => db.createStringAttribute(DATABASE_ID, collectionId, "latitude_text", 32, false), "latitude_text");
  await safeAttr(() => db.createStringAttribute(DATABASE_ID, collectionId, "longitude_text", 32, false), "longitude_text");
  await safeAttr(() => db.createFloatAttribute(DATABASE_ID, collectionId, "latitude_geopoint", false), "latitude_geopoint");
  await safeAttr(() => db.createFloatAttribute(DATABASE_ID, collectionId, "longitude_geopoint", false), "longitude_geopoint");
  await safeAttr(() => db.createStringAttribute(DATABASE_ID, collectionId, "altitude_text", 32, false), "altitude_text");
  await safeAttr(() => db.createStringAttribute(DATABASE_ID, collectionId, "operation", 256, false), "operation");
  await safeAttr(() => db.createStringAttribute(DATABASE_ID, collectionId, "source_raw_json", 65535, false), "source_raw_json");
  await safeAttr(() => db.createDatetimeAttribute(DATABASE_ID, collectionId, "imported_at", true), "imported_at");
  await safeIndex(collectionId, "aerodromes_icao_idx", ["icao"]);
  await safeIndex(collectionId, "aerodromes_ciad_idx", ["ciad"]);
  await safeIndex(collectionId, "aerodromes_name_idx", ["name"]);
  await safeIndex(collectionId, "aerodromes_uf_idx", ["uf"]);
}

function parseDelimitedLine(line, delimiter = ";") {
  const values = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === delimiter && !quoted) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current);
  return values;
}

function normalizeKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function uniqueRawKey(header, index, group = "") {
  const groupKey = normalizeKey(group);
  const headerKey = normalizeKey(header) || `col_${index + 1}`;
  return groupKey ? `${groupKey}_${headerKey}_${index + 1}` : `${headerKey}_${index + 1}`;
}

function blankToNull(value) {
  const text = String(value ?? "").trim();
  return text && text !== "-" ? text : null;
}

function numberFromDecimalText(value) {
  const text = String(value ?? "").trim().replace(/\./g, "").replace(",", ".");
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePrivateAerodromes(filePath) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const sourceUpdatedAt = lines[0]?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
  const headers = parseDelimitedLine(lines[1] ?? "");
  return lines.slice(2).map((line) => {
    const values = parseDelimitedLine(line);
    const raw = Object.fromEntries(headers.map((header, index) => [uniqueRawKey(header, index), values[index] ?? ""]));
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    const runways = [
      {
        designation: blankToNull(row["DESIGNAÇÃO 1"]),
        length: blankToNull(row["COMPRIMENTO 1"]),
        width: blankToNull(row["LARGURA 1"]),
        strength: blankToNull(row["RESISTÊNCIA 1"]),
        surface: blankToNull(row["SUPERFÍCIE 1"]),
      },
      {
        designation: blankToNull(row["DESIGNAÇÃO 2"]),
        length: blankToNull(row["COMPRIMENTO2"]),
        width: blankToNull(row["LARGURA 2"]),
        strength: blankToNull(row["RESISTÊNCIA 2"]),
        surface: blankToNull(row["SUPERFÍCIE 2"]),
      },
    ].filter((runway) => runway.designation || runway.length || runway.width || runway.strength || runway.surface);
    return {
      source: "private",
      ciad: String(row["CIAD"] ?? "").trim().toUpperCase(),
      payload: {
        source_types: JSON.stringify(["private"]),
        icao: blankToNull(String(row["CÓDIGO OACI"] ?? "").trim().toUpperCase()),
        ciad: String(row["CIAD"] ?? "").trim().toUpperCase(),
        name: String(row["NOME"] ?? "").trim(),
        municipality: blankToNull(row["MUNICÍPIO"]),
        uf: blankToNull(String(row["UF"] ?? "").trim().toUpperCase()),
        latitude_text: blankToNull(row["LATITUDE"]),
        longitude_text: blankToNull(row["LONGITUDE"]),
        latitude_geopoint: numberFromDecimalText(row["LATGEOPOINT"]),
        longitude_geopoint: numberFromDecimalText(row["LONGEOPOINT"]),
        altitude_text: blankToNull(row["ALTITUDE"]),
        operation: [row["OPERAÇÃO DIURNA"], row["OPERAÇÃO NOTURNA"]].map(blankToNull).filter(Boolean).join(" / ") || null,
        source_raw_json: JSON.stringify({ private: { sourceUpdatedAt, raw, runways } }),
      },
    };
  }).filter((item) => item.ciad);
}

function readPublicWorkbook(filePath) {
  const ps = `
$ErrorActionPreference = 'Stop'
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
  $wb = $excel.Workbooks.Open('${filePath.replace(/'/g, "''")}', 0, $true)
  $ws = $wb.Worksheets.Item(1)
  $data = $ws.UsedRange.Value2
  $rows = $data.GetLength(0)
  $cols = $data.GetLength(1)
  $out = @()
  for ($r = 1; $r -le $rows; $r++) {
    $row = @()
    for ($c = 1; $c -le $cols; $c++) {
      $row += [string]$data[$r,$c]
    }
    $out += [pscustomobject]@{ cells = $row }
  }
  $wb.Close($false)
  $out | ConvertTo-Json -Depth 4 -Compress
} finally {
  try { if ($wb) { $wb.Close($false) } } catch {}
  $excel.Quit()
  foreach ($o in @($ws,$wb,$excel)) { if ($o) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($o) | Out-Null } }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
`;
  const result = spawnSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "Failed to read public XLS via Excel COM.");
  const parsed = JSON.parse(result.stdout);
  return parsed.map((row) => row.cells);
}

function parsePublicAerodromes(filePath) {
  const rows = readPublicWorkbook(filePath);
  const groups = rows[1] ?? [];
  const headers = rows[2] ?? [];
  return rows.slice(3).map((values) => {
    const raw = Object.fromEntries(headers.map((header, index) => [uniqueRawKey(header, index, groups[index]), values[index] ?? ""]));
    const runways = [
      { designation: values[11], length: values[12], width: values[13], strength: values[14], surface: values[15] },
      { designation: values[16], length: values[17], width: values[18], strength: values[19], surface: values[20] },
      { designation: values[21], length: values[22], width: values[23], strength: values[24], surface: values[25] },
    ].map((runway) => ({
      designation: blankToNull(runway.designation),
      length: blankToNull(runway.length),
      width: blankToNull(runway.width),
      strength: blankToNull(runway.strength),
      surface: blankToNull(runway.surface),
    })).filter((runway) => runway.designation || runway.length || runway.width || runway.strength || runway.surface);
    const helipad = {
      approachRamps: blankToNull(values[26]),
      landingAreaShape: blankToNull(values[27]),
      dimensions: blankToNull(values[28]),
      strength: blankToNull(values[29]),
      surface: blankToNull(values[30]),
    };
    const ciad = String(values[1] ?? "").trim().toUpperCase();
    return {
      source: "public",
      ciad,
      payload: {
        source_types: JSON.stringify(["public"]),
        icao: blankToNull(String(values[0] ?? "").trim().toUpperCase()),
        ciad,
        name: String(values[2] ?? "").trim(),
        municipality: blankToNull(values[3]),
        uf: blankToNull(String(values[4] ?? "").trim().toUpperCase()),
        latitude_text: blankToNull(values[5]),
        longitude_text: blankToNull(values[6]),
        latitude_geopoint: null,
        longitude_geopoint: null,
        altitude_text: blankToNull(values[7]),
        operation: blankToNull(values[8]),
        source_raw_json: JSON.stringify({ public: { raw, runways, helipad } }),
      },
    };
  }).filter((item) => item.ciad);
}

function mergePayload(existing, incoming) {
  const sourceTypes = new Set([
    ...JSON.parse(existing.source_types || "[]"),
    ...JSON.parse(incoming.source_types || "[]"),
  ]);
  return {
    ...existing,
    ...incoming,
    source_types: JSON.stringify(Array.from(sourceTypes).sort()),
    source_raw_json: JSON.stringify({
      ...JSON.parse(existing.source_raw_json || "{}"),
      ...JSON.parse(incoming.source_raw_json || "{}"),
    }),
    imported_at: new Date().toISOString(),
  };
}

async function withRetry(label, fn, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error?.message ?? String(error);
      if (message.toLowerCase().includes("already exists")) throw error;
      if (attempt === attempts) break;
      console.log(`   retry ${attempt}/${attempts - 1}: ${label} (${message})`);
      await sleep(1000 * attempt);
    }
  }
  throw lastError;
}

async function upsertAerodromes(collectionId, entries) {
  let created = 0;
  let updated = 0;
  let completed = 0;
  const concurrency = Math.max(1, Math.min(20, Number(process.env.AERODROME_IMPORT_CONCURRENCY) || 8));

  async function upsertOne(entry) {
    const id = ID.custom(entry.ciad);
    const payload = { ...entry.payload, imported_at: new Date().toISOString() };
    try {
      await withRetry(`create ${id}`, () => db.createDocument(DATABASE_ID, collectionId, id, payload));
      return "created";
    } catch (error) {
      const message = error?.message ?? "";
      const lower = message.toLowerCase();
      if (!lower.includes("already exists")) throw error;
      await withRetry(`update ${id}`, () => db.updateDocument(DATABASE_ID, collectionId, id, payload));
      return "updated";
    }
  }

  let nextIndex = 0;
  async function worker() {
    while (nextIndex < entries.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const result = await upsertOne(entries[currentIndex]);
      if (result === "created") created += 1;
      if (result === "updated") updated += 1;
      completed += 1;
      if (completed % 100 === 0 || completed === entries.length) {
        console.log(`   imported ${completed}/${entries.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { created, updated };
}

async function main() {
  console.log("Reading source files...");
  const privateRows = parsePrivateAerodromes(privatePath);
  const publicRows = parsePublicAerodromes(publicPath);
  const byCiad = new Map();
  for (const item of privateRows) byCiad.set(item.ciad, item.payload);
  for (const item of publicRows) {
    const existing = byCiad.get(item.ciad);
    byCiad.set(item.ciad, existing ? mergePayload(existing, item.payload) : item.payload);
  }
  const entries = Array.from(byCiad.entries()).map(([ciad, payload]) => ({ ciad, payload }));
  console.log(`Private rows: ${privateRows.length}`);
  console.log(`Public rows: ${publicRows.length}`);
  console.log(`Unique CIADs: ${entries.length}`);

  const collectionId = await ensureCollection();
  await configureCollection(collectionId);
  const result = await upsertAerodromes(collectionId, entries);

  const overlap = entries.find((entry) => entry.ciad === "PI0011");
  console.log(`Created: ${result.created}`);
  console.log(`Updated: ${result.updated}`);
  console.log(`Overlap PI0011 source_types: ${overlap?.payload.source_types ?? "not found"}`);
  console.log(`VITE_APPWRITE_AERODROMES_COL_ID=${collectionId}`);
}

main().catch((error) => {
  console.error("Import failed:", error?.message ?? error);
  process.exit(1);
});
