import { Client, Databases, Query } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID ?? process.env.VITE_APPWRITE_DATABASE_ID;
const FLIGHTS_COLLECTION_ID =
  process.env.APPWRITE_FLIGHTS_COLLECTION_ID ?? process.env.VITE_APPWRITE_COLLECTION_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID || !FLIGHTS_COLLECTION_ID) {
  console.error(
    "Missing APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID or APPWRITE_FLIGHTS_COLLECTION_ID.",
  );
  process.exit(1);
}

const META_PREFIX = "#GFV_META_V1:";

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);

function decodeMeta(csvText) {
  const lines = String(csvText ?? "").replace(/^\uFEFF/, "").split(/\r?\n/);
  const first = (lines[0] ?? "").trim();
  if (!first.startsWith(META_PREFIX)) return { meta: null, telemetryCsv: lines.join("\n") };
  try {
    const raw = Buffer.from(first.slice(META_PREFIX.length).trim(), "base64").toString("utf8");
    return { meta: JSON.parse(raw), telemetryCsv: lines.slice(1).join("\n") };
  } catch {
    return { meta: null, telemetryCsv: lines.slice(1).join("\n") };
  }
}

function parseDurationToMinutes(value) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const hhmm = raw.match(/^(\d{1,2}):(\d{1,2})$/);
  if (hhmm) return Number(hhmm[1] || "0") * 60 + Number(hhmm[2] || "0");
  const asDecimal = Number(raw.replace(",", "."));
  return Number.isFinite(asDecimal) && asDecimal > 0 ? Math.round(asDecimal * 60) : 0;
}

function parseMiles(value) {
  const normalized = String(value || "").replace(/[^\d.,-]/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function weightBalanceComplete(weightBalance) {
  return Boolean(
    weightBalance &&
      weightBalance.inputs?.occupantsWeightKg !== null &&
      weightBalance.inputs?.baggageWeightKg !== null &&
      weightBalance.inputs?.rampFuel?.value !== null &&
      weightBalance.inputs?.taxiFuel?.value !== null &&
      weightBalance.inputs?.tripFuel?.value !== null &&
      weightBalance.results?.isComplete,
  );
}

function materializedFields(doc) {
  const { meta, telemetryCsv } = decodeMeta(doc.csv_text ?? "");
  const missionIds = Array.from(
    new Set([
      ...(Array.isArray(meta?.training?.missionIds) ? meta.training.missionIds : []),
      meta?.training?.missionId ?? "",
      doc.training_mission_id ?? "",
    ].filter(Boolean)),
  );

  if (!meta) {
    return {
      from_to: null,
      landings: null,
      total_flight_minutes: null,
      total_miles: null,
      telemetry_present: String(telemetryCsv || "").trim().length > 0,
      instructor_suggestion_md: null,
      student_suggestion_md: null,
      instructor_suggestion_present: false,
      student_suggestion_present: false,
      weight_balance_complete: false,
      is_night: false,
      training_mission_ids_json: missionIds.length > 0 ? JSON.stringify(missionIds) : null,
    };
  }

  const airports = [];
  for (const leg of meta.legs ?? []) {
    const dep = String(leg.dep ?? "").trim().toUpperCase();
    const arr = String(leg.arr ?? "").trim().toUpperCase();
    if (dep && airports[airports.length - 1] !== dep) airports.push(dep);
    if (arr && airports[airports.length - 1] !== arr) airports.push(arr);
  }
  const instructorSuggestion = String(meta.preFlight?.instructorSuggestionMd ?? "").trim();
  const studentSuggestion = String(meta.preFlight?.studentSuggestionMd ?? "").trim();
  const totalMiles = (meta.legs ?? []).reduce((acc, leg) => acc + parseMiles(leg.distance), 0);

  return {
    from_to: airports.length > 0 ? airports.join(" -> ") : null,
    landings: (meta.legs ?? []).reduce((acc, leg) => acc + Math.max(0, Math.round(leg.landings || 0)), 0),
    total_flight_minutes: (meta.legs ?? []).reduce((acc, leg) => acc + parseDurationToMinutes(leg.flightTime), 0),
    total_miles: Number(totalMiles.toFixed(1)),
    telemetry_present: String(telemetryCsv || "").trim().length > 0,
    instructor_suggestion_md: instructorSuggestion || null,
    student_suggestion_md: studentSuggestion || null,
    instructor_suggestion_present: instructorSuggestion.length > 0,
    student_suggestion_present: studentSuggestion.length > 0,
    weight_balance_complete: weightBalanceComplete(meta.weightBalance),
    is_night: meta.header?.isNight ?? false,
    training_mission_ids_json: missionIds.length > 0 ? JSON.stringify(missionIds) : null,
  };
}

function changed(doc, next) {
  return Object.entries(next).some(([key, value]) => doc[key] !== value);
}

async function run() {
  let offset = 0;
  const limit = 100;
  let scanned = 0;
  let migrated = 0;

  while (true) {
    const page = await databases.listDocuments(DATABASE_ID, FLIGHTS_COLLECTION_ID, [
      Query.limit(limit),
      Query.offset(offset),
      Query.orderAsc("$id"),
    ]);
    if (page.documents.length === 0) break;

    for (const doc of page.documents) {
      scanned += 1;
      const next = materializedFields(doc);
      if (!changed(doc, next)) continue;
      await databases.updateDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, doc.$id, next);
      migrated += 1;
    }

    offset += page.documents.length;
  }

  console.log(`Scanned: ${scanned}`);
  console.log(`Updated: ${migrated}`);
}

run().catch((error) => {
  console.error("Migration failed:", error?.message ?? error);
  process.exit(1);
});
