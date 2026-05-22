import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases, ID, Permission, Query, Role } from "node-appwrite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env.local");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const entries = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    entries[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return entries;
}

const env = parseEnvFile(envPath);
const ENDPOINT = process.env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY || env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || env.VITE_APPWRITE_DATABASE_ID;
const SCHOOL_ID = process.env.SCHOOL_ID || env.VITE_SCHOOL_ID || "escola_principal";
const PROFILES_COLLECTION_ID = process.env.APPWRITE_PROFILES_COLLECTION_ID || env.VITE_APPWRITE_PROFILES_COLLECTION_ID;
const FLIGHTS_COLLECTION_ID = process.env.APPWRITE_FLIGHTS_COLLECTION_ID || env.VITE_APPWRITE_COLLECTION_ID;
const TRACKS_COLLECTION_ID = process.env.APPWRITE_TRAINING_TRACKS_COLLECTION_ID || env.VITE_APPWRITE_TRAINING_TRACKS_COL_ID || "training_tracks";
const STUDENT_TRACKS_COLLECTION_ID =
  process.env.APPWRITE_STUDENT_TRACKS_COLLECTION_ID || env.VITE_APPWRITE_STUDENT_TRACKS_COL_ID || "student_training_tracks";

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID || !PROFILES_COLLECTION_ID || !FLIGHTS_COLLECTION_ID) {
  console.error("Missing env vars. Required: endpoint, project, APPWRITE_API_KEY, database, profiles and flights collections.");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const COLLECTION_PERMS = [
  Permission.read(Role.users()),
  Permission.create(Role.label("admin")),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

/** Aluno pode criar o próprio vínculo no cadastro; admin mantém gestão completa. */
const STUDENT_TRACKS_PERMS = [
  Permission.read(Role.users()),
  Permission.create(Role.users()),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

const DEFAULT_TRACK_NAME = "Programa PP - Cronograma PDF";
const DEFAULT_STAGES = [
  { id: "pre-solo", name: "FASE PRE SOLO", order: 1, missions: [
    ["ps1", "PS1", 60, "DC", ["Familiarizacao com a Aeronave", "Demonstracao basica dos comandos"]],
    ["ps2", "PS2", 60, "DC", ["Voo ascendente", "Voo descendente", "Voo linha reta horizontal (VLRH)", "Mudanca de atitude"]],
    ["ps3", "PS3", 60, "DC", ["Curvas (90, 180, 270, 360 graus)", "Curvas ascendentes e descendentes"]],
    ["ps4", "PS4", 60, "DC", ["Voo planado", "Voo planado com curvas"]],
    ["ps5", "PS5", 60, "DC", ["Coordenacao de 1 tipo", "Coordenacao de 2 tipo"]],
    ["ps6", "PS6", 60, "DC", ["Voo em retangulo", "S sobre estradas"]],
    ["ps7", "PS7", 60, "DC", ["Oito ao redor de Marcos"]],
    ["ps8", "PS8", 60, "DC", ["Estol com motor e sem motor", "Coordenacao atitude x potencia x velocidade (CAP)", "Velocidade minima de controle (VMC)"]],
    ["ps9", "PS9", 60, "DC", ["Emergencia simulada fora do circuito", "Decolagem curta", "Glissada (frontal e lateral)"]],
    ["ps10", "PS10", 60, "DC", ["Decolagem curta", "Emergencia simulada fora do circuito de trafego"]],
    ["ps11", "PS11", 60, "DC", ["TGL - (A) APRESENTACAO"]],
    ["ps12", "PS12", 60, "DC", ["TGL - (C) COMPREENSAO"]],
    ["ps13", "PS13", 60, "DC", ["TGL - (C) COMPREENSAO"]],
    ["ps14", "PS14", 60, "DC", ["TGL - (C) COMPREENSAO"]],
    ["ps15", "PS15", 60, "DC", ["TGL - (E) EXECUCAO"]],
    ["ps16", "PS16", 60, "DC", ["TGL AD ALTERNATIVO - SNDD - A / C / E"]],
    ["ps17", "PS17", 60, "DC", ["TGL AD ALTERNATIVO - SDTB - A / C / E"]],
    ["ps18", "PS18", 60, "DC", ["Emergencia no circuito (90, 180, 360 graus) - APRESENTACAO"]],
    ["ps19", "PS19", 60, "DC", ["Emergencia no circuito (90, 180, 360 graus) - COMPREENSAO", "Emergencia na decolagem / decolagem abortada"]],
    ["ps20", "PS20", 60, "DC", ["Emergencia no circuito (90, 180, 360 graus) - EXECUCAO"]],
    ["psx", "PSX", 60, "SL", ["CIRCUITO SOLO + ENDOSSO"]],
  ] },
  { id: "aperfeicoamento", name: "APERFEICOAMENTO", order: 2, missions: [
    ["ap01", "AP01", 60, "DC", ["Preparacao Voo solo - Sobrevoo ITU / RONDON / CERQ"]],
    ["ap02", "AP02", 60, "SL", ["Voo solo - sobrevoo ITU / RONDON / CERQUILHO"]],
    ["ap03", "AP03", 60, "DC", ["Preparacao voo solo - Sobrevoo SBR459", "Curva 180 (Turn & Bank)", "Desorientacao espacial"]],
    ["ap04", "AP04", 60, "SL", ["Voo solo - sobrevoo SBR459"]],
    ["ap05", "AP05", 60, "DC", ["TGL SBJD ou SDTB - Emergencias - Rejeicao decolagem"]],
    ["ap06", "AP06", 60, "SL", ["Voo solo - Sobrevoo Itu ou SBR459"]],
    ["ap07", "AP07", 60, "SL", ["Voo solo - Sobrevoo Itu ou SBR459"]],
  ] },
  { id: "navegacao", name: "NAVEGACAO", order: 3, missions: [
    ["nv01", "NV01", 120, "DC", ["Navegacao SBJD -> SDCO -> SDPW -> SBJD"]],
    ["nv02", "NV02", 120, "SL", ["Navegacao SBJD -> SDCO -> SDPW -> SBJD"]],
    ["nv03", "NV03", 180, "DC", ["Navegacao SBJD -> SDCO -> SDRK -> SBJD (150 NM); ou", "Navegacao SBJD -> SDJV -> SDAI -> SBJD (150 NM)", "Introducao ao uso do GPS + Piloto Automatico"]],
    ["nv04", "NV04", 120, "SL", ["Navegacao SBJD -> SDAI ou SDRK"]],
    ["nv05", "NV05", 60, "SL", ["Navegacao SBJD -> SDCO"]],
  ] },
  { id: "not", name: "NOT", order: 4, missions: [
    ["nt01", "NT01", 90, "DC", ["Voo Noturno (5 pousos)"]],
    ["nt02", "NT02", 90, "DC", ["Voo Noturno (5 pousos)"]],
  ] },
  { id: "av", name: "AV", order: 5, missions: [
    ["av01", "AV01", 60, "DC", ["AVALIACAO FINAL - LIBERACAO PARA CHEQUE"]],
  ] },
].map((stage) => ({
  ...stage,
  missions: stage.missions.map(([id, name, durationMinutes, type, maneuvers], index) => ({
    id,
    name,
    durationMinutes,
    type,
    maneuvers,
    order: index + 1,
  })),
}));

function summary(stages) {
  return stages.reduce(
    (acc, stage) => {
      acc.missionCount += stage.missions.length;
      acc.totalMinutes += stage.missions.reduce((sum, mission) => sum + mission.durationMinutes, 0);
      return acc;
    },
    { missionCount: 0, totalMinutes: 0 },
  );
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureCollection(collectionId, name) {
  try {
    const collection = await db.getCollection(DATABASE_ID, collectionId);
    await db.updateCollection(DATABASE_ID, collectionId, name, COLLECTION_PERMS, false, true);
    console.log(`  - ${name} exists (${collection.$id})`);
    return collection;
  } catch (error) {
    const message = String(error?.message || error).toLowerCase();
    if (!message.includes("not found") && !message.includes("could not be found")) throw error;
  }
  const collection = await db.createCollection(DATABASE_ID, collectionId, name, COLLECTION_PERMS, false, true);
  console.log(`  + Created ${name} (${collection.$id})`);
  return collection;
}

async function attr(collectionId, key, createFn, label) {
  const collection = await db.getCollection(DATABASE_ID, collectionId);
  if ((collection.attributes || []).some((attribute) => attribute.key === key)) {
    console.log(`    - ${label} exists`);
    return;
  }
  try {
    await createFn();
    await sleep(650);
    console.log(`    + ${label}`);
  } catch (error) {
    if (String(error?.message || error).toLowerCase().includes("already exists")) {
      console.log(`    - ${label} exists`);
      return;
    }
    throw error;
  }
}

async function idx(collectionId, key, attributes, orders = ["ASC"]) {
  try {
    await db.createIndex(DATABASE_ID, collectionId, key, "key", attributes, orders);
    await sleep(650);
    console.log(`    + index ${key}`);
  } catch (error) {
    if (String(error?.message || error).toLowerCase().includes("already exists")) {
      console.log(`    - index ${key} exists`);
      return;
    }
    throw error;
  }
}

async function configureTracks() {
  await ensureCollection(TRACKS_COLLECTION_ID, "training_tracks");
  await attr(TRACKS_COLLECTION_ID, "school_id", () => db.createStringAttribute(DATABASE_ID, TRACKS_COLLECTION_ID, "school_id", 64, true), "school_id");
  await attr(TRACKS_COLLECTION_ID, "name", () => db.createStringAttribute(DATABASE_ID, TRACKS_COLLECTION_ID, "name", 255, true), "name");
  await attr(TRACKS_COLLECTION_ID, "is_default", () => db.createBooleanAttribute(DATABASE_ID, TRACKS_COLLECTION_ID, "is_default", true), "is_default");
  await attr(TRACKS_COLLECTION_ID, "is_active", () => db.createBooleanAttribute(DATABASE_ID, TRACKS_COLLECTION_ID, "is_active", true), "is_active");
  await attr(TRACKS_COLLECTION_ID, "stages_json", () => db.createStringAttribute(DATABASE_ID, TRACKS_COLLECTION_ID, "stages_json", 65535, true), "stages_json");
  await attr(TRACKS_COLLECTION_ID, "mission_count", () => db.createIntegerAttribute(DATABASE_ID, TRACKS_COLLECTION_ID, "mission_count", true), "mission_count");
  await attr(TRACKS_COLLECTION_ID, "total_minutes", () => db.createIntegerAttribute(DATABASE_ID, TRACKS_COLLECTION_ID, "total_minutes", true), "total_minutes");
  await attr(TRACKS_COLLECTION_ID, "updated_at", () => db.createStringAttribute(DATABASE_ID, TRACKS_COLLECTION_ID, "updated_at", 64, true), "updated_at");
  await idx(TRACKS_COLLECTION_ID, "training_tracks_school_idx", ["school_id"]);
  await idx(TRACKS_COLLECTION_ID, "training_tracks_default_idx", ["school_id", "is_default"], ["ASC", "ASC"]);
}

async function ensureStudentTracksCollection(collectionId, name) {
  try {
    const collection = await db.getCollection(DATABASE_ID, collectionId);
    await db.updateCollection(DATABASE_ID, collectionId, name, STUDENT_TRACKS_PERMS, false, true);
    console.log(`  - ${name} exists (${collection.$id})`);
    return collection;
  } catch (error) {
    const message = String(error?.message || error).toLowerCase();
    if (!message.includes("not found") && !message.includes("could not be found")) throw error;
  }
  const collection = await db.createCollection(DATABASE_ID, collectionId, name, STUDENT_TRACKS_PERMS, false, true);
  console.log(`  + Created ${name} (${collection.$id})`);
  return collection;
}

async function configureStudentTracks() {
  await ensureStudentTracksCollection(STUDENT_TRACKS_COLLECTION_ID, "student_training_tracks");
  await attr(STUDENT_TRACKS_COLLECTION_ID, "school_id", () => db.createStringAttribute(DATABASE_ID, STUDENT_TRACKS_COLLECTION_ID, "school_id", 64, true), "school_id");
  await attr(STUDENT_TRACKS_COLLECTION_ID, "student_user_id", () => db.createStringAttribute(DATABASE_ID, STUDENT_TRACKS_COLLECTION_ID, "student_user_id", 64, true), "student_user_id");
  await attr(STUDENT_TRACKS_COLLECTION_ID, "track_id", () => db.createStringAttribute(DATABASE_ID, STUDENT_TRACKS_COLLECTION_ID, "track_id", 64, true), "track_id");
  await attr(STUDENT_TRACKS_COLLECTION_ID, "status", () => db.createStringAttribute(DATABASE_ID, STUDENT_TRACKS_COLLECTION_ID, "status", 16, true), "status");
  await attr(STUDENT_TRACKS_COLLECTION_ID, "is_primary", () => db.createBooleanAttribute(DATABASE_ID, STUDENT_TRACKS_COLLECTION_ID, "is_primary", true), "is_primary");
  await attr(STUDENT_TRACKS_COLLECTION_ID, "assigned_at", () => db.createStringAttribute(DATABASE_ID, STUDENT_TRACKS_COLLECTION_ID, "assigned_at", 64, true), "assigned_at");
  await attr(STUDENT_TRACKS_COLLECTION_ID, "updated_at", () => db.createStringAttribute(DATABASE_ID, STUDENT_TRACKS_COLLECTION_ID, "updated_at", 64, true), "updated_at");
  await idx(STUDENT_TRACKS_COLLECTION_ID, "student_tracks_student_idx", ["student_user_id"]);
  await idx(STUDENT_TRACKS_COLLECTION_ID, "student_tracks_track_idx", ["track_id"]);
  await idx(STUDENT_TRACKS_COLLECTION_ID, "student_tracks_unique_idx", ["school_id", "student_user_id", "track_id"], ["ASC", "ASC", "ASC"]);
}

async function configureFlights() {
  await attr(FLIGHTS_COLLECTION_ID, "training_track_id", () => db.createStringAttribute(DATABASE_ID, FLIGHTS_COLLECTION_ID, "training_track_id", 64, false), "flight.training_track_id");
  await attr(FLIGHTS_COLLECTION_ID, "training_stage_id", () => db.createStringAttribute(DATABASE_ID, FLIGHTS_COLLECTION_ID, "training_stage_id", 64, false), "flight.training_stage_id");
  await attr(FLIGHTS_COLLECTION_ID, "training_mission_id", () => db.createStringAttribute(DATABASE_ID, FLIGHTS_COLLECTION_ID, "training_mission_id", 64, false), "flight.training_mission_id");
  await attr(FLIGHTS_COLLECTION_ID, "training_snapshot_json", () => db.createStringAttribute(DATABASE_ID, FLIGHTS_COLLECTION_ID, "training_snapshot_json", 8192, false), "flight.training_snapshot_json");
  await idx(FLIGHTS_COLLECTION_ID, "flights_training_track_idx", ["training_track_id"]);
  await idx(FLIGHTS_COLLECTION_ID, "flights_training_mission_idx", ["training_mission_id"]);
}

async function listAll(collectionId, queries = []) {
  const out = [];
  let offset = 0;
  while (true) {
    const res = await db.listDocuments(DATABASE_ID, collectionId, [...queries, Query.limit(100), Query.offset(offset)]);
    out.push(...res.documents);
    if (res.documents.length < 100) break;
    offset += 100;
  }
  return out;
}

async function seedDefaultTrack() {
  const existing = await db.listDocuments(DATABASE_ID, TRACKS_COLLECTION_ID, [
    Query.equal("school_id", [SCHOOL_ID]),
    Query.equal("name", [DEFAULT_TRACK_NAME]),
    Query.limit(1),
  ]);
  const { missionCount, totalMinutes } = summary(DEFAULT_STAGES);
  const data = {
    school_id: SCHOOL_ID,
    name: DEFAULT_TRACK_NAME,
    is_default: true,
    is_active: true,
    stages_json: JSON.stringify(DEFAULT_STAGES),
    mission_count: missionCount,
    total_minutes: totalMinutes,
    updated_at: new Date().toISOString(),
  };
  const otherDefaults = await listAll(TRACKS_COLLECTION_ID, [
    Query.equal("school_id", [SCHOOL_ID]),
    Query.equal("is_default", [true]),
  ]);
  for (const doc of otherDefaults) {
    if (doc.$id !== existing.documents[0]?.$id) await db.updateDocument(DATABASE_ID, TRACKS_COLLECTION_ID, doc.$id, { is_default: false });
  }
  if (existing.documents[0]) {
    await db.updateDocument(DATABASE_ID, TRACKS_COLLECTION_ID, existing.documents[0].$id, data);
    console.log(`  - Updated default track (${existing.documents[0].$id})`);
    return existing.documents[0].$id;
  }
  const created = await db.createDocument(DATABASE_ID, TRACKS_COLLECTION_ID, ID.unique(), data);
  console.log(`  + Created default track (${created.$id})`);
  return created.$id;
}

async function migrateStudents(trackId) {
  const profiles = await listAll(PROFILES_COLLECTION_ID);
  const students = profiles.filter((doc) => (doc.role || "aluno") === "aluno" && doc.user_id);
  let created = 0;
  for (const profile of students) {
    const existing = await db.listDocuments(DATABASE_ID, STUDENT_TRACKS_COLLECTION_ID, [
      Query.equal("school_id", [SCHOOL_ID]),
      Query.equal("student_user_id", [profile.user_id]),
      Query.equal("track_id", [trackId]),
      Query.limit(1),
    ]);
    if (existing.documents[0]) continue;
    const now = new Date().toISOString();
    await db.createDocument(DATABASE_ID, STUDENT_TRACKS_COLLECTION_ID, ID.unique(), {
      school_id: SCHOOL_ID,
      student_user_id: profile.user_id,
      track_id: trackId,
      status: "active",
      is_primary: true,
      assigned_at: now,
      updated_at: now,
    });
    created += 1;
  }
  console.log(`  + Student track assignments created: ${created}`);
}

async function migrateFlights(trackId) {
  const flights = await listAll(FLIGHTS_COLLECTION_ID);
  let updated = 0;
  for (const flight of flights) {
    if (flight.training_track_id) continue;
    await db.updateDocument(DATABASE_ID, FLIGHTS_COLLECTION_ID, flight.$id, {
      training_track_id: trackId,
      training_stage_id: null,
      training_mission_id: null,
      training_snapshot_json: null,
    });
    updated += 1;
  }
  console.log(`  + Flights linked to default track: ${updated}`);
}

async function main() {
  console.log("=== Appwrite Training Tracks Setup ===");
  await configureTracks();
  await configureStudentTracks();
  await configureFlights();
  const trackId = await seedDefaultTrack();
  await migrateStudents(trackId);
  await migrateFlights(trackId);
  console.log("\nAdd these to .env.local if missing:");
  console.log(`VITE_APPWRITE_TRAINING_TRACKS_COL_ID=${TRACKS_COLLECTION_ID}`);
  console.log(`VITE_APPWRITE_STUDENT_TRACKS_COL_ID=${STUDENT_TRACKS_COLLECTION_ID}`);
}

main().catch((error) => {
  console.error("Setup failed:", error?.message || error);
  process.exit(1);
});
