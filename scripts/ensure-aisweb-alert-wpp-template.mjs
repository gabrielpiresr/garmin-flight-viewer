import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as sdk from "node-appwrite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env.local");
const TEMPLATE_NAME = "alerta_aisweb";

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const entries = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    entries[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return entries;
}

function graphVersion(value) {
  const version = String(value || "").trim().toLowerCase();
  return /^v\d{1,2}\.\d{1,2}$/.test(version) ? version : "v23.0";
}

async function graphRequest(settings, pathOrUrl, options = {}) {
  const base = `https://graph.facebook.com/${graphVersion(settings.graphApiVersion)}`;
  const url = String(pathOrUrl || "").startsWith("https://")
    ? pathOrUrl
    : `${base}/${String(pathOrUrl || "").replace(/^\//, "")}`;
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.error_user_msg || data?.error?.message || data?.message || `HTTP ${response.status}`;
    const error = new Error(message);
    error.details = data?.error || data;
    throw error;
  }
  return data;
}

async function listTemplates(settings) {
  const fields = "id,name,status,category,language,rejected_reason";
  let nextUrl = `${settings.wabaId}/message_templates?limit=100&fields=${encodeURIComponent(fields)}`;
  const templates = [];
  for (let page = 0; nextUrl && page < 10; page += 1) {
    const response = await graphRequest(settings, nextUrl);
    templates.push(...(Array.isArray(response?.data) ? response.data : []));
    nextUrl = String(response?.paging?.next || "").trim();
  }
  return templates;
}

function templatePayload(origin) {
  return {
    name: TEMPLATE_NAME,
    language: "pt_BR",
    category: "UTILITY",
    components: [
      { type: "HEADER", format: "TEXT", text: "Alerta AISWEB" },
      {
        type: "BODY",
        text:
          "Alerta operacional AISWEB (NOTAM, suplemento AIP ou aviso de aerodromo).\n\n" +
          "Tipo do alerta: {{1}}\n" +
          "Aerodromo (ICAO): {{2}}\n" +
          "Identificador: {{3}}\n\n" +
          "Conteudo:\n{{4}}\n\n" +
          "Periodo de validade: {{5}}\n\n" +
          "Abra o aplicativo para ver o detalhe completo do aerodromo.",
        example: {
          body_text: [[
            "NOTAM",
            "SBSP",
            "A1234/26",
            "RWY 17L/35R CLSD DUE TO WORK IN PROGRESS.",
            "14/08 12:00 - 21/08 23:59",
          ]],
        },
      },
      { type: "FOOTER", text: "Mensagem automatica" },
      {
        type: "BUTTONS",
        buttons: [
          {
            type: "URL",
            text: "Abrir no app",
            url: `${origin}/{{1}}`,
            example: ["aluno/aisweb"],
          },
        ],
      },
    ],
  };
}

async function main() {
  const env = parseEnvFile(envPath);
  const endpoint = process.env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
  const projectId = process.env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
  const apiKey = process.env.APPWRITE_API_KEY || env.APPWRITE_API_KEY;
  const databaseId = env.VITE_APPWRITE_DATABASE_ID;
  const platformCol = env.VITE_APPWRITE_PLATFORM_SETTINGS_COL_ID;
  const origin = String(env.VITE_APP_URL || process.env.APP_URL || "https://app.epeac.com.br").replace(/\/+$/, "");

  if (!endpoint || !projectId || !apiKey || !databaseId || !platformCol) {
    throw new Error("Faltam APPWRITE_API_KEY / endpoint / project / database / platform_settings no .env.local.");
  }

  const client = new sdk.Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
  const db = new sdk.Databases(client);
  const res = await db.listDocuments(databaseId, platformCol, [
    sdk.Query.equal("key", ["wpp"]),
    sdk.Query.limit(1),
  ]);
  const doc = res.documents[0];
  if (!doc) throw new Error("Documento platform_settings key=wpp nao encontrado.");
  const settings = JSON.parse(doc.settings_json || "{}");
  if (!settings.wabaId || !settings.apiKey) {
    throw new Error("WhatsApp nao configurado (WABA ID ou token ausente).");
  }

  console.log(`WABA conectada. Categoria: UTILITY. Nome: ${TEMPLATE_NAME}.`);
  const existing = (await listTemplates(settings)).filter((item) => item.name === TEMPLATE_NAME);
  const usable = existing.find((item) => String(item.status || "").toUpperCase() !== "REJECTED");
  if (usable) {
    console.log(`Template ja existe: ${usable.name} · ${usable.language} · ${usable.status} · ${usable.category}`);
    return;
  }
  if (existing.length) {
    console.log("Template REJECTED encontrado; recriando.");
    await graphRequest(
      settings,
      `${settings.wabaId}/message_templates?name=${encodeURIComponent(TEMPLATE_NAME)}`,
      { method: "DELETE" },
    ).catch(() => null);
  }

  const created = await graphRequest(settings, `${settings.wabaId}/message_templates`, {
    method: "POST",
    body: templatePayload(origin),
  });
  console.log("Template criado na Meta:", {
    id: created.id || null,
    name: TEMPLATE_NAME,
    category: "UTILITY",
    language: "pt_BR",
    status: created.status || "PENDING",
  });
}

main().catch((error) => {
  console.error(error.message);
  if (error.details) console.error(JSON.stringify(error.details, null, 2));
  process.exit(1);
});
