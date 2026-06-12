import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { Client, Databases, ID, Query } from "node-appwrite";

const DEFAULT_CSV_PATH = ".tmp/combustivel-2026.csv";
const DEFAULT_YEAR = 2026;

function loadEnvFile(filePath) {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) return {};
  const content = fs.readFileSync(absolutePath, "utf8");
  const out = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    out[key] = value;
  }
  return out;
}

function parseArgs(argv) {
  const args = {
    csv: DEFAULT_CSV_PATH,
    year: DEFAULT_YEAR,
    run: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--run") {
      args.run = true;
      continue;
    }
    if (token.startsWith("--csv=")) {
      args.csv = token.slice("--csv=".length);
      continue;
    }
    if (token.startsWith("--year=")) {
      const parsed = Number(token.slice("--year=".length));
      if (Number.isFinite(parsed)) args.year = parsed;
      continue;
    }
  }
  return args;
}

function decodeCsv(buffer) {
  const utf8 = buffer.toString("utf8");
  if (!utf8.includes("�")) return utf8;
  return buffer.toString("latin1");
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeKey(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function parseNumber(value) {
  const raw = normalizeText(value);
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.,-]/g, "");
  if (!cleaned) return null;

  let normalized = cleaned;
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  if (hasComma && hasDot) {
    // Usa o último separador como decimal e remove o restante como milhar.
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    if (lastDot > lastComma) {
      normalized = cleaned.replace(/,/g, "");
    } else {
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    }
  } else if (hasComma) {
    // Se termina com 1-2 casas, considera decimal com vírgula.
    normalized = /,\d{1,2}$/.test(cleaned)
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  } else if (hasDot) {
    // Se termina com 1-2 casas, considera decimal com ponto.
    normalized = /\.\d{1,2}$/.test(cleaned)
      ? cleaned.replace(/,/g, "")
      : cleaned.replace(/\./g, "");
  }

  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function toIsoDate(year, month, day) {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const dt = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (Number.isNaN(dt.getTime())) return null;
  const yyyy = String(dt.getUTCFullYear());
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T12:00`;
}

function parseDatePtBr(rawDate, year) {
  const raw = normalizeText(rawDate);
  if (!raw) return null;

  // Datas como serial do Excel (ex.: 46113).
  const serial = Number(raw);
  if (Number.isFinite(serial) && serial > 30000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const dt = new Date(excelEpoch.getTime() + Math.round(serial) * 24 * 60 * 60 * 1000);
    if (!Number.isNaN(dt.getTime())) {
      return toIsoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    }
  }

  const text = normalizeKey(raw);
  const match = text.match(/^(\d{1,2})-([a-z]{3})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const mon = match[2];
  const map = {
    jan: 1,
    fev: 2,
    mar: 3,
    abr: 4,
    mai: 5,
    jun: 6,
    jul: 7,
    ago: 8,
    set: 9,
    out: 10,
    nov: 11,
    dez: 12,
  };
  const month = map[mon];
  if (!month || !day) return null;
  return toIsoDate(year, month, day);
}

function mapPaymentMethod(value) {
  const key = normalizeKey(value);
  if (key === "pix") return "Pix";
  if (key === "credito" || key === "crédito") return "Crédito";
  if (key === "debito" || key === "débito") return "Débito";
  if (key === "faturado") return "Linha de crédito";
  return "Pix";
}

function mapAerodrome(value) {
  const key = normalizeKey(value);
  if (key.includes("jundiai")) return "SBJD";
  if (key.includes("americana")) return "SDAI";
  if (key.includes("sao joao")) return "SDSC";
  const fallback = normalizeText(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return fallback.slice(0, 8) || "SBJD";
}

function isDataRow(row) {
  const c0 = normalizeText(row[0]);
  const c1 = normalizeText(row[1]);
  const c2 = normalizeText(row[2]);
  if (!c1 || !c2) return false;
  const dateLike = /^\d{1,2}-[a-zç]{3}$/i.test(normalizeKey(c0)) || (Number.isFinite(Number(c0)) && Number(c0) > 30000);
  return dateLike;
}

function buildFingerprint(item) {
  return [
    item.occurred_at.slice(0, 10),
    item.aircraft_registration,
    item.quantity_liters.toFixed(2),
    item.total_value.toFixed(2),
  ].join("|");
}

async function main() {
  const args = parseArgs(process.argv);
  const env = { ...loadEnvFile(".env.local"), ...process.env };

  const endpoint = env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
  const projectId = env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
  const apiKey = env.APPWRITE_API_KEY;
  const databaseId = env.APPWRITE_DATABASE_ID || env.VITE_APPWRITE_DATABASE_ID;
  const fuelingsColId = env.APPWRITE_FUELINGS_COL_ID || env.VITE_APPWRITE_FUELINGS_COL_ID || "aircraft_fuelings";
  const aircraftsColId = env.APPWRITE_AIRCRAFTS_COL_ID || env.VITE_APPWRITE_AIRCRAFTS_COL_ID;
  const profilesColId = env.APPWRITE_PROFILES_COLLECTION_ID || env.VITE_APPWRITE_PROFILES_COLLECTION_ID;
  const schoolId = env.SCHOOL_ID || env.VITE_SCHOOL_ID || "escola_principal";
  const adminUserId = env.ADMIN_USER_ID || env.VITE_ADMIN_USER_ID;

  const required = { endpoint, projectId, apiKey, databaseId, aircraftsColId, profilesColId, schoolId, adminUserId };
  const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    throw new Error(`Variáveis ausentes: ${missing.join(", ")}`);
  }

  const csvPath = path.resolve(args.csv);
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV não encontrado: ${csvPath}`);
  }

  const csvBuffer = fs.readFileSync(csvPath);
  const csvText = decodeCsv(csvBuffer);
  const rows = Papa.parse(csvText, { header: false, skipEmptyLines: false }).data;
  const dataRows = rows.filter((row) => Array.isArray(row) && isDataRow(row));

  const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  const db = new Databases(client);

  const [aircraftRes, profileRes, existingRes] = await Promise.all([
    db.listDocuments(databaseId, aircraftsColId, [Query.equal("school_id", [schoolId]), Query.limit(200)]),
    db.listDocuments(databaseId, profilesColId, [Query.equal("user_id", [adminUserId]), Query.limit(1)]),
    db.listDocuments(databaseId, fuelingsColId, [Query.equal("school_id", [schoolId]), Query.limit(500)]),
  ]);

  const aircraftByReg = new Map(
    aircraftRes.documents.map((doc) => [normalizeKey(doc.registration), { id: doc.$id, registration: doc.registration }]),
  );
  const adminProfile = profileRes.documents[0];
  const responsibleName = normalizeText(adminProfile?.full_name || adminProfile?.email || adminUserId);

  const existingFingerprints = new Set();
  for (const doc of existingRes.documents) {
    const occurred = normalizeText(doc.occurred_at);
    const reg = normalizeText(doc.aircraft_registration).toUpperCase();
    const liters = Number(doc.quantity_liters ?? 0);
    const total = Number(doc.total_value ?? 0);
    if (!occurred || !reg) continue;
    const fp = [
      occurred.slice(0, 10),
      reg,
      liters.toFixed(2),
      total.toFixed(2),
    ].join("|");
    existingFingerprints.add(fp);
  }

  const prepared = [];
  const skipped = [];
  for (const row of dataRows) {
    const dateRaw = row[0];
    const regRaw = normalizeText(row[1]).toUpperCase();
    const liters = parseNumber(row[2]);
    const price = parseNumber(row[3]);
    const total = parseNumber(row[4]);
    const local = row[5];
    const payment = row[6];

    const occurredAt = parseDatePtBr(dateRaw, args.year);
    const aircraft = aircraftByReg.get(normalizeKey(regRaw));

    if (!occurredAt || !aircraft || liters === null || price === null || total === null || liters <= 0 || price <= 0 || total <= 0) {
      skipped.push({
        reason: "dados inválidos ou aeronave não encontrada",
        row: [dateRaw, regRaw, row[2], row[3], row[4], local, payment],
      });
      continue;
    }

    const item = {
      school_id: schoolId,
      occurred_at: occurredAt,
      aerodrome: mapAerodrome(local),
      responsible_user_id: adminUserId,
      responsible_name: responsibleName,
      aircraft_id: aircraft.id,
      aircraft_registration: aircraft.registration,
      quantity_liters: Number(liters.toFixed(2)),
      price_per_liter: Number(price.toFixed(2)),
      total_value: Number(total.toFixed(2)),
      payment_method: mapPaymentMethod(payment),
      fuel_type: "AVGAS",
      student_user_id: null,
      student_name: null,
      flight_id: null,
      created_by: adminUserId,
    };

    const fp = buildFingerprint(item);
    if (existingFingerprints.has(fp)) {
      skipped.push({ reason: "duplicado", row: [dateRaw, regRaw, row[2], row[4]] });
      continue;
    }
    existingFingerprints.add(fp);
    prepared.push(item);
  }

  console.log(`CSV: ${csvPath}`);
  console.log(`Linhas de dados identificadas: ${dataRows.length}`);
  console.log(`Preparadas para importação: ${prepared.length}`);
  console.log(`Ignoradas: ${skipped.length}`);

  if (skipped.length > 0) {
    console.log("\nExemplos de linhas ignoradas:");
    skipped.slice(0, 5).forEach((entry, idx) => {
      console.log(`  ${idx + 1}. ${entry.reason} -> ${JSON.stringify(entry.row)}`);
    });
  }

  if (!args.run) {
    console.log("\nModo dry-run. Use --run para gravar no Appwrite.");
    return;
  }

  let created = 0;
  for (const item of prepared) {
    await db.createDocument(databaseId, fuelingsColId, ID.unique(), item);
    created += 1;
  }

  console.log(`\nImportação concluída. Registros criados: ${created}`);
}

main().catch((error) => {
  console.error("Falha na importação:", error?.message ?? error);
  process.exit(1);
});
