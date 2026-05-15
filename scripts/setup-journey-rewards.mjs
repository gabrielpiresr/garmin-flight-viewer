import { Client, Databases, ID, Permission, Query, Role } from "node-appwrite";
import fs from "node:fs";
import path from "node:path";

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const idx = line.indexOf("=");
        return [line.slice(0, idx), line.slice(idx + 1)];
      }),
  );
}

const env = { ...loadEnv(path.resolve(".env.local")), ...process.env };
const ENDPOINT = env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = env.APPWRITE_API_KEY;
const DATABASE_ID = env.APPWRITE_DATABASE_ID || env.VITE_APPWRITE_DATABASE_ID;
const COLLECTION_ID = env.APPWRITE_JOURNEY_REWARDS_COLLECTION_ID || env.VITE_APPWRITE_JOURNEY_REWARDS_COL_ID || "journey_rewards";
const SCHOOL_ID = env.VITE_SCHOOL_ID || "escola_principal";

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("Missing APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY or APPWRITE_DATABASE_ID.");
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

async function ensureCollection() {
  try {
    return await db.getCollection(DATABASE_ID, COLLECTION_ID);
  } catch {
    return db.createCollection(DATABASE_ID, COLLECTION_ID, "journey_rewards", COLLECTION_PERMS, true, true);
  }
}

async function attr(create, label) {
  try {
    await create();
    console.log(`  + ${label}`);
  } catch (error) {
    if (error?.code === 409 || String(error?.message || "").toLowerCase().includes("already exists")) {
      console.log(`  = ${label}`);
      return;
    }
    throw error;
  }
}

async function idx(name, keys) {
  try {
    await db.createIndex(DATABASE_ID, COLLECTION_ID, name, "key", keys);
    console.log(`  + index ${name}`);
  } catch (error) {
    if (error?.code === 409 || String(error?.message || "").toLowerCase().includes("already exists")) {
      console.log(`  = index ${name}`);
      return;
    }
    throw error;
  }
}

const seedBadges = [
  {
    id: "first-flight",
    title: "Primeira etapa",
    description: "Registrou o primeiro voo com telemetria.",
    iconId: "flight",
    order: 10,
    rules: { mode: "all", conditions: [{ metric: "flight_count", operator: "gte", value: 1 }] },
  },
  {
    id: "steady-weeks",
    title: "Ritmo de treinamento",
    description: "Manteve 4 semanas consecutivas com voos.",
    iconId: "streak",
    order: 20,
    rules: { mode: "all", conditions: [{ metric: "weekly_streak", operator: "gte", value: 4 }] },
  },
  {
    id: "soft-touch",
    title: "Toque de seda",
    description: "Alcançou 70% de pousos suaves com pelo menos 10 pousos.",
    iconId: "landing",
    order: 30,
    rules: {
      mode: "all",
      conditions: [
        { metric: "total_landings", operator: "gte", value: 10 },
        { metric: "smooth_landing_rate", operator: "gte", value: 70 },
      ],
    },
  },
  {
    id: "navigator",
    title: "Navegador",
    description: "Somou 100 NM navegadas.",
    iconId: "compass",
    order: 40,
    rules: { mode: "all", conditions: [{ metric: "total_distance_nm", operator: "gte", value: 100 }] },
  },
  {
    id: "landing-ace",
    title: "Mão calibrada",
    description: "Acumulou 50 pousos registrados.",
    iconId: "star",
    order: 50,
    rules: { mode: "all", conditions: [{ metric: "total_landings", operator: "gte", value: 50 }] },
  },
];

async function seedDefaults() {
  for (const badge of seedBadges) {
    const existing = await db.listDocuments(DATABASE_ID, COLLECTION_ID, [
      Query.equal("school_id", [SCHOOL_ID]),
      Query.equal("kind", ["badge"]),
      Query.equal("title", [badge.title]),
      Query.limit(1),
    ]);
    if (existing.documents.length > 0) {
      console.log(`  = seed ${badge.title}`);
      continue;
    }
    await db.createDocument(DATABASE_ID, COLLECTION_ID, ID.unique(), {
      school_id: SCHOOL_ID,
      kind: "badge",
      track_id: null,
      title: badge.title,
      description: badge.description,
      visual_json: JSON.stringify({ type: "libraryIcon", iconId: badge.iconId, colorMode: "school" }),
      rules_json: JSON.stringify(badge.rules),
      is_active: true,
      order: badge.order,
      updated_at: new Date().toISOString(),
    });
    console.log(`  + seed ${badge.title}`);
  }
}

console.log("=== Appwrite Journey Rewards Setup ===");
await ensureCollection();
await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "school_id", 64, true), "school_id");
await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "kind", 24, true), "kind");
await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "track_id", 64, false), "track_id");
await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "title", 255, true), "title");
await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "description", 2048, false), "description");
await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "visual_json", 4096, false), "visual_json");
await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "rules_json", 8192, true), "rules_json");
await attr(() => db.createBooleanAttribute(DATABASE_ID, COLLECTION_ID, "is_active", true), "is_active");
await attr(() => db.createIntegerAttribute(DATABASE_ID, COLLECTION_ID, "order", true), "order");
await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "updated_at", 64, true), "updated_at");
await idx("journey_rewards_school_kind_idx", ["school_id", "kind"]);
await idx("journey_rewards_track_idx", ["track_id"]);
await seedDefaults();
console.log(`VITE_APPWRITE_JOURNEY_REWARDS_COL_ID=${COLLECTION_ID}`);
