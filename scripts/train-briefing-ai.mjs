import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const aisweb = require("../functions/admin-users/src/aisweb.js");
const prompts = require("../functions/admin-users/src/briefingAiPrompts.js");
const { decodeNotamSchedule, decodeNotamValidity } = require("../functions/admin-users/src/notamScheduleDecode.js");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const entries = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    entries[trimmed.slice(0, index)] = trimmed.slice(index + 1).replace(/^['"]|['"]$/g, "");
  }
  return entries;
}

function loadEnv() {
  const merged = {
    ...parseEnvFile(path.join(root, ".env")),
    ...parseEnvFile(path.join(root, ".env.local")),
  };
  for (const [key, value] of Object.entries(merged)) {
    if (!process.env[key]) process.env[key] = value;
  }
}

function compact(value, max = 900) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

const IMPORTANT_NOTAM_RE =
  /\b(?:RWY|TWY|CLSD|CLOSED|U\/S|UNSERVICEABLE|WIP|ILS|PAPI|ALS|LIGHT(?:ING)?|LUZ(?:ES)?|BIRD|AD\s*CLSD|AERODROME\s*CLOSED|FUEL|COMBUST|RESTRICT|PROHIBIT|LIMIT|INOP|FECHAD|OUT\s*OF\s*SERVICE|RVR|SNOWTAM)\b/i;
const OBSTACLE_ONLY_NOTAM_RE = /\b(?:OBST|GRUA|CRANE|MASTRO)\b/i;
const NAVAID_ONLY_NOTAM_RE = /\b(?:VOR|DVOR|DME|NDB|GPS|NAV\s*AID)\b/i;
const AIRFIELD_NOTAM_RE =
  /\b(?:RWY|TWY|AD\s*CLSD|AERODROME\s*CLOSED|CLSD|CLOSED|FUEL|COMBUST|PAPI|ALS|PORTO(?:E|Õ)S?|BIRD|WIP)\b/i;
const OPERATIONAL_NOTAM_RE =
  /\b(?:RWY|TWY|AD\s*CLSD|AERODROME\s*CLOSED|CLSD|CLOSED|FUEL|COMBUST|ILS|PAPI|U\/S|UNSERVICEABLE|INOP|FECHAD|PORTO(?:E|Õ)S?)\b/i;

function isImportantNotam(notam) {
  const number = String(notam.number || "");
  const text = String(notam.text || "");
  if (!text.trim()) return false;
  if (OBSTACLE_ONLY_NOTAM_RE.test(text) && !OPERATIONAL_NOTAM_RE.test(text)) return false;
  if (NAVAID_ONLY_NOTAM_RE.test(text) && !AIRFIELD_NOTAM_RE.test(text)) return false;
  return IMPORTANT_NOTAM_RE.test(text) || IMPORTANT_NOTAM_RE.test(number);
}

function extractOpenAiResponseText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) return response.output_text;
  const chunks = [];
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") chunks.push(content.text);
      if (typeof content?.value === "string") chunks.push(content.value);
    }
  }
  return chunks.join("\n").trim();
}

async function callAuthPass(bundle, icao, role) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY nao configurada no .env.local");
  const model = String(process.env.OPENAI_BRIEFING_MODEL || "gpt-5.6-terra").trim();
  const rotaer = bundle.rotaer || {};
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      airports: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            icao: { type: "string" },
            needsAuth: { type: "boolean" },
            nightOnly: { type: "boolean" },
            title: { type: "string" },
            description: { type: "string" },
            url: { type: "string" },
          },
          required: ["icao", "needsAuth", "nightOnly", "title", "description", "url"],
        },
      },
    },
    required: ["airports"],
  };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: prompts.AUTH_SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            taskPolicy: prompts.AUTH_TASK_POLICY,
            airports: [
              {
                role,
                icao,
                name: rotaer.name || null,
                typeOpr: rotaer.typeOpr || null,
                typeUtil: rotaer.typeUtil || null,
                fuel: rotaer.fuel || null,
                workingHours: rotaer.workingHours || null,
                sun: bundle.sun || null,
                remarks: (rotaer.remarks || []).slice(0, 12),
                complements: (rotaer.complements || []).slice(0, 12),
              },
            ],
          }),
        },
      ],
      reasoning: { effort: String(process.env.OPENAI_BRIEFING_REASONING || "low") },
      text: {
        format: {
          type: "json_schema",
          name: "flight_briefing_auth_pass",
          strict: true,
          schema,
        },
      },
    }),
  });
  const bodyText = await response.text();
  const body = JSON.parse(bodyText);
  if (!response.ok) {
    throw new Error(body?.error?.message || `OpenAI HTTP ${response.status}`);
  }
  const text = extractOpenAiResponseText(body);
  if (!text) throw new Error("OpenAI nao retornou JSON da etapa de autorizacao.");
  return JSON.parse(text);
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  loadEnv();
  const icao = String(process.argv[2] || "SBMT").toUpperCase();
  const role = String(process.argv[3] || "destino").toLowerCase();
  console.log(`Treinando briefing IA — ${icao} (${role})`);
  const bundle = await aisweb.fetchAirportBundle(icao);
  const rotaer = bundle.rotaer || {};

  printSection("AISWEB / ROTAER");
  console.log(`Nome: ${rotaer.name || "-"}`);
  console.log(`Tipo: ${rotaer.typeOpr || "-"} | Uso: ${rotaer.typeUtil || "-"}`);
  console.log(`Horario: ${rotaer.workingHours?.text || "-"}`);
  console.log(`Sol: ${bundle.sun?.sunriseUtc || "-"}Z / ${bundle.sun?.sunsetUtc || "-"}Z`);
  console.log(`Combustivel: ${compact(rotaer.fuel?.text || rotaer.fuel?.types?.join(" | ") || "-", 500)}`);

  printSection("COMPL");
  const complements = rotaer.complements || [];
  if (!complements.length) console.log("(vazio)");
  for (const item of complements.slice(0, 12)) {
    console.log(`- ${compact(item.text, 700)}`);
  }

  printSection("RMK");
  const remarks = rotaer.remarks || [];
  if (!remarks.length) console.log("(vazio)");
  for (const item of remarks.slice(0, 12)) {
    console.log(`- ${compact(item.text, 700)}`);
  }

  printSection("Tasks default (sem IA)");
  console.log(`1. Verificar NOTAM - ${icao}`);
  console.log(`2. Verificar abastecimento - ${icao}`);
  if (role === "destino" || role === "alternativo") {
    console.log(`3. Verificar hangaragem - ${icao}`);
  }

  printSection("Leia primeiro (NOTAMs importantes, texto integral AISWEB)");
  const important = (bundle.notams || []).filter(isImportantNotam);
  if (!important.length) console.log("(nenhum NOTAM critico obvio)");
  for (const notam of important.slice(0, 8)) {
    console.log(`\nTitulo: ${icao} · ${notam.number || "NOTAM"}`);
    const validity = decodeNotamValidity(notam.validFrom, notam.validTo);
    const periods = decodeNotamSchedule(notam.schedule, notam.validFrom);
    if (validity) console.log(`Validade: ${validity}`);
    if (periods) console.log(`Períodos: ${periods}`);
    console.log(String(notam.text || "").trim());
  }

  printSection("IA — autorizacao (so AISWEB)");
  try {
    const auth = await callAuthPass(bundle, icao, role);
    const decision = (auth.airports || []).find((item) => String(item.icao || "").toUpperCase() === icao) || auth.airports?.[0];
    if (!decision) {
      console.log("A IA nao devolveu decisao para este ICAO.");
    } else {
      console.log(`needsAuth: ${decision.needsAuth}`);
      console.log(`nightOnly: ${decision.nightOnly}`);
      console.log(`titulo: ${decision.title || "(vazio)"}`);
      console.log(`como proceder: ${decision.description || "(vazio)"}`);
      console.log(`url: ${decision.url || "(nenhuma)"}`);
    }
  } catch (err) {
    console.log(`Falha na etapa de autorizacao: ${err instanceof Error ? err.message : String(err)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
