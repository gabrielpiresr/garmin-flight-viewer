import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as sdk from "node-appwrite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env.local");
const TEMPLATE_NAME = "resumo_escala_admin_amanha";
const SPECIAL_TEMPLATE_NAME = "resumo_escala_coord_led_amanha";
const SPECIAL_GREETING = "Oi ledzinho do meu coração";

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
  const fields = "id,name,status,category,language,components,rejected_reason";
  let nextUrl = `${settings.wabaId}/message_templates?limit=100&fields=${encodeURIComponent(fields)}`;
  const templates = [];
  for (let page = 0; nextUrl && page < 10; page += 1) {
    const response = await graphRequest(settings, nextUrl);
    templates.push(...(Array.isArray(response?.data) ? response.data : []));
    nextUrl = String(response?.paging?.next || "").trim();
  }
  return templates;
}

function templatePayload({ name = TEMPLATE_NAME, greeting = "" } = {}) {
  return {
    name,
    language: "pt_BR",
    category: "UTILITY",
    components: [
      { type: "HEADER", format: "TEXT", text: "Resumo da escala" },
      {
        type: "BODY",
        text:
          `${greeting ? `${greeting}\n\n` : ""}` +
          "Resumo da escala de {{1}}.\n\n" +
          "{{2}}\n\n" +
          "{{3}}\n\n" +
          "Para receber o print da escala, toque no botão abaixo.",
        example: {
          body_text: [[
            "05/09/2026",
            "12 evento(s) ativo(s), 1 bloqueio(s), 8h30 planejadas.",
            "- 08:00 PR-ABC | Maria | João | 1h00 | Confirmado",
          ]],
        },
      },
      { type: "FOOTER", text: "Mensagem automática" },
      {
        type: "BUTTONS",
        buttons: [{ type: "QUICK_REPLY", text: "Solicitar imagem" }],
      },
    ],
  };
}

function templateBody(template) {
  return String((Array.isArray(template?.components) ? template.components : []).find((item) => item?.type === "BODY")?.text || "");
}

function hasImageButton(template) {
  const buttons = (Array.isArray(template?.components) ? template.components : [])
    .find((item) => item?.type === "BUTTONS")?.buttons || [];
  return buttons.some((button) => String(button?.type || "").toUpperCase() === "QUICK_REPLY" && String(button?.text || "") === "Solicitar imagem");
}

async function ensureTemplate(settings, allTemplates, spec) {
  const existing = allTemplates.filter((item) => item.name === spec.name);
  const usable = existing.find((item) => String(item.status || "").toUpperCase() !== "REJECTED");
  const payload = templatePayload(spec);
  if (usable) {
    const body = templateBody(usable);
    if (
      usable.id &&
      (!body.includes(spec.greeting || "Resumo da escala de {{1}}") ||
        !body.includes("Resumo da escala de {{1}}") ||
        !body.includes("print da escala") ||
        !hasImageButton(usable))
    ) {
      const updated = await graphRequest(settings, usable.id, {
        method: "POST",
        body: { category: payload.category, components: payload.components },
      });
      console.log(`Template atualizado: ${usable.name} · ${usable.language} · ${updated.status || "PENDING"} · ${payload.category}`);
      return;
    }
    console.log(`Template ja existe: ${usable.name} · ${usable.language} · ${usable.status} · ${usable.category}`);
    return;
  }
  if (existing.length) {
    console.log(`Template REJECTED encontrado; recriando ${spec.name}.`);
    await graphRequest(settings, `${settings.wabaId}/message_templates?name=${encodeURIComponent(spec.name)}`, { method: "DELETE" }).catch(() => null);
  }
  const created = await graphRequest(settings, `${settings.wabaId}/message_templates`, {
    method: "POST",
    body: payload,
  });
  console.log("Template criado na Meta:", {
    id: created.id || null,
    name: spec.name,
    category: "UTILITY",
    language: "pt_BR",
    status: created.status || "PENDING",
  });
}

async function main() {
  const env = parseEnvFile(envPath);
  const endpoint = process.env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
  const projectId = process.env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
  const apiKey = process.env.APPWRITE_API_KEY || env.APPWRITE_API_KEY;
  const databaseId = env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID;
  const platformCol = env.VITE_APPWRITE_PLATFORM_SETTINGS_COL_ID || process.env.APPWRITE_PLATFORM_SETTINGS_COLLECTION_ID;

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
  if (!settings.wabaId || !settings.apiKey) throw new Error("WhatsApp nao configurado (WABA ID ou token ausente).");

  console.log(`WABA conectada. Categoria: UTILITY. Nome: ${TEMPLATE_NAME}.`);
  const templates = await listTemplates(settings);
  await ensureTemplate(settings, templates, { name: TEMPLATE_NAME });
  await ensureTemplate(settings, templates, { name: SPECIAL_TEMPLATE_NAME, greeting: SPECIAL_GREETING });
}

main().catch((error) => {
  console.error(error.message);
  if (error.details) console.error(JSON.stringify(error.details, null, 2));
  process.exit(1);
});
