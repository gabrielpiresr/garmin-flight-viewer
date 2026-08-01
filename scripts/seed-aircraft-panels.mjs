/**
 * Seeds the two Montaer panel templates onto the first available aircrafts.
 * Usage (with .env.local loaded): node scripts/seed-aircraft-panels.mjs
 */
import { Client, Databases, ID, Permission, Query, Role } from "node-appwrite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEnvLocal() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const val = line.slice(i + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvLocal();

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID;
const AIRCRAFTS_COL = process.env.VITE_APPWRITE_AIRCRAFTS_COL_ID;
const PANELS_COL = process.env.VITE_APPWRITE_AIRCRAFT_PANELS_COL_ID;
const SCHOOL_ID = process.env.VITE_SCHOOL_ID || "escola_principal";

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID || !AIRCRAFTS_COL || !PANELS_COL) {
  console.error("Missing env for seed.");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const perms = [
  Permission.read(Role.any()),
  Permission.update(Role.label("admin")),
  Permission.delete(Role.label("admin")),
];

const seeds = [
  {
    id: "montaer-glass",
    title: "Painel Glass (G3X + Tablet)",
    panel_image_url: "/panels/montaer-glass-panel.png",
    instruments: [
      { id: "glass-g3x", name: "Garmin G3X Touch", description: "Display principal de voo (PFD) com mapa integrado.", shape: "rect", x: 4, y: 12, w: 38, h: 62, zoom_image_url: "/panels/montaer-glass-g3x.png", sort_order: 1 },
      { id: "glass-autopilot", name: "Autopiloto", description: "Painel de controle do piloto automático.", shape: "rect", x: 43, y: 8, w: 16, h: 12, zoom_image_url: null, sort_order: 2 },
      { id: "glass-g5", name: "Garmin G5 (backup)", description: "Instrumento eletrônico de backup.", shape: "rect", x: 44, y: 22, w: 14, h: 28, zoom_image_url: "/panels/montaer-glass-g5.png", sort_order: 3 },
      { id: "glass-radio", name: "Rádio COM/NAV", description: "Unidade de comunicação e navegação.", shape: "rect", x: 42, y: 52, w: 18, h: 16, zoom_image_url: "/panels/montaer-glass-radio.png", sort_order: 4 },
      { id: "glass-ipad", name: "Tablet de navegação", description: "Tablet com carta aeronáutica.", shape: "rect", x: 64, y: 10, w: 30, h: 55, zoom_image_url: "/panels/montaer-glass-ipad.png", sort_order: 5 },
      { id: "glass-magneto", name: "Magneto / Ignition", description: "Seletor de magnetos e chave de ignição.", shape: "circle", x: 1, y: 55, w: 8, h: 18, zoom_image_url: null, sort_order: 6 },
      { id: "glass-switches", name: "Painel de switches", description: "Fileira inferior de breakers e switches.", shape: "rect", x: 12, y: 78, w: 70, h: 16, zoom_image_url: "/panels/montaer-glass-switches.png", sort_order: 7 },
    ],
  },
  {
    id: "montaer-analog",
    title: "Painel Analógico (ASI + G5 + Motor)",
    panel_image_url: "/panels/montaer-analog-panel.png",
    instruments: [
      { id: "analog-asi", name: "Velocímetro (ASI)", description: "Indicador de velocidade indicada (kt).", shape: "circle", x: 8, y: 18, w: 11, h: 28, zoom_image_url: "/panels/montaer-analog-asi.png", sort_order: 1 },
      { id: "analog-g5", name: "Garmin G5", description: "PFD eletrônico.", shape: "rect", x: 20, y: 16, w: 12, h: 30, zoom_image_url: "/panels/montaer-analog-g5.png", sort_order: 2 },
      { id: "analog-alt", name: "Altímetro", description: "Altímetro analógico.", shape: "circle", x: 33, y: 14, w: 10, h: 26, zoom_image_url: "/panels/montaer-analog-alt.png", sort_order: 3 },
      { id: "analog-vsi", name: "Variômetro (VSI)", description: "Indicador de velocidade vertical.", shape: "circle", x: 33, y: 42, w: 10, h: 24, zoom_image_url: null, sort_order: 4 },
      { id: "analog-map", name: "Display de navegação", description: "Tela central com carta / GPS.", shape: "rect", x: 45, y: 12, w: 22, h: 38, zoom_image_url: "/panels/montaer-analog-map.png", sort_order: 5 },
      { id: "analog-radio", name: "Rádio / Transponder", description: "Stack de rádio e transponder.", shape: "rect", x: 45, y: 52, w: 22, h: 18, zoom_image_url: "/panels/montaer-analog-radio.png", sort_order: 6 },
      { id: "analog-engine", name: "Instrumentos do motor", description: "Cluster de gauges Rotax.", shape: "rect", x: 70, y: 12, w: 26, h: 55, zoom_image_url: "/panels/montaer-analog-engine.png", sort_order: 7 },
      { id: "analog-switches", name: "Switches elétricos", description: "Painel de rockers AVIONICOS etc.", shape: "rect", x: 42, y: 78, w: 40, h: 14, zoom_image_url: "/panels/montaer-analog-switches.png", sort_order: 8 },
      { id: "analog-magnetos", name: "Magnetos", description: "Interruptores de magnetos A/B.", shape: "rect", x: 10, y: 72, w: 14, h: 16, zoom_image_url: null, sort_order: 9 },
    ],
  },
];

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("\n=== Seed aircraft panels ===\n");
  // Wait for attributes to be available
  for (let i = 0; i < 20; i++) {
    try {
      await db.listDocuments(DATABASE_ID, PANELS_COL, [Query.limit(1)]);
      break;
    } catch (e) {
      console.log(`  waiting for collection... (${i + 1})`);
      await sleep(1500);
    }
  }

  const aircraftRes = await db.listDocuments(DATABASE_ID, AIRCRAFTS_COL, [
    Query.equal("school_id", [SCHOOL_ID]),
    Query.equal("active", [true]),
    Query.isNull("deleted_at"),
    Query.limit(20),
    Query.orderAsc("registration"),
  ]);

  const aircrafts = aircraftRes.documents.filter((d) => d.type !== "ground");
  if (aircrafts.length === 0) {
    console.error("Nenhuma aeronave ativa encontrada.");
    process.exit(1);
  }

  const existing = await db.listDocuments(DATABASE_ID, PANELS_COL, [
    Query.equal("school_id", [SCHOOL_ID]),
    Query.limit(100),
  ]);
  const usedAircraft = new Set(existing.documents.map((d) => d.aircraft_id));

  let created = 0;
  for (let i = 0; i < seeds.length; i++) {
    const seed = seeds[i];
    const ac = aircrafts.find((a) => !usedAircraft.has(a.$id)) || aircrafts[i % aircrafts.length];
    if (usedAircraft.has(ac.$id) && existing.documents.some((d) => d.aircraft_id === ac.$id)) {
      console.log(`  • skip ${seed.title} — ${ac.registration} já tem painel`);
      continue;
    }
    const now = new Date().toISOString();
    await db.createDocument(
      DATABASE_ID,
      PANELS_COL,
      ID.unique(),
      {
        school_id: SCHOOL_ID,
        aircraft_id: ac.$id,
        title: `${seed.title} — ${ac.registration}`,
        panel_image_url: seed.panel_image_url,
        panel_image_file_id: null,
        instruments_json: JSON.stringify(seed.instruments),
        published: true,
        updated_at: now,
      },
      perms,
    );
    usedAircraft.add(ac.$id);
    created += 1;
    console.log(`  ✓ ${seed.title} → ${ac.registration}`);
  }

  console.log(`\nFeito. ${created} painel(is) criado(s).\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
