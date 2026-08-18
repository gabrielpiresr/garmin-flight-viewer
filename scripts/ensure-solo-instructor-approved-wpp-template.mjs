import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as sdk from "node-appwrite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env.local");

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

function bodyText(template) {
  const components = Array.isArray(template?.components) ? template.components : [];
  const body = components.find((component) => String(component?.type || "").toUpperCase() === "BODY");
  return String(body?.text || "");
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

function approvedPayload() {
  return {
    name: "voo_solo_aprovado_instrutor_v2",
    language: "pt_BR",
    category: "UTILITY",
    components: [
      { type: "HEADER", format: "TEXT", text: "Voo solo aprovado" },
      {
        type: "BODY",
        text:
          "O checklist de voo solo do aluno {{1}} foi aprovado.\n\n" +
          "Data: {{2}}\n" +
          "Rota/aeródromos: {{3}}\n" +
          "Status: {{4}}\n" +
          "Código: {{5}}\n\n" +
          "Você já pode seguir com a operação.",
        example: {
          body_text: [[
            "Maria Souza",
            "18/08/2026",
            "SBJD - SDCO",
            "aprovado",
            "chk_solo_789",
          ]],
        },
      },
      { type: "FOOTER", text: "Mensagem automática" },
    ],
  };
}

function rejectedPayload() {
  return {
    name: "voo_solo_rejeitado_instrutor",
    language: "pt_BR",
    category: "UTILITY",
    components: [
      { type: "HEADER", format: "TEXT", text: "Voo solo rejeitado" },
      {
        type: "BODY",
        text:
          "O checklist de voo solo do aluno {{1}} foi rejeitado.\n\n" +
          "Data: {{2}}\n" +
          "Rota/aeródromos: {{3}}\n" +
          "Motivo: {{4}}\n" +
          "Código: {{5}}\n\n" +
          "Revise o checklist e envie uma nova solicitação, se necessário.",
        example: {
          body_text: [[
            "Maria Souza",
            "18/08/2026",
            "SBJD - SDCO",
            "METAR abaixo do mínimo para aluno solo",
            "chk_solo_790",
          ]],
        },
      },
      { type: "FOOTER", text: "Mensagem automática" },
    ],
  };
}

async function ensureTemplate(settings, payload, { requireBodyIncludes = "" } = {}) {
  const name = payload.name;
  const existing = (await listTemplates(settings)).filter((item) => item.name === name);
  const usable = existing.find((item) => String(item.status || "").toUpperCase() !== "REJECTED");
  const hasCorrectBody = !requireBodyIncludes || bodyText(usable).includes(requireBodyIncludes);
  if (usable && hasCorrectBody) {
    console.log(`Template ok: ${usable.name} · ${usable.language} · ${usable.status} · ${usable.category}`);
    return usable;
  }
  if (existing.length) {
    console.log(`Recriando ${name} (${usable ? "texto desatualizado" : "REJECTED"}).`);
    await graphRequest(
      settings,
      `${settings.wabaId}/message_templates?name=${encodeURIComponent(name)}`,
      { method: "DELETE" },
    ).catch(() => null);
  }
  let created = null;
  let lastError = null;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      created = await graphRequest(settings, `${settings.wabaId}/message_templates`, {
        method: "POST",
        body: payload,
      });
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      const waitingDelete = String(error?.details?.error_subcode || "") === "2388023"
        || /está sendo excluído|being deleted/i.test(String(error?.message || ""));
      if (!waitingDelete || attempt === 8) throw error;
      const waitMs = 15000;
      console.log(`Meta ainda está excluindo ${name}; nova tentativa em ${waitMs / 1000}s (${attempt}/8).`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  if (!created) throw lastError || new Error(`Falha ao criar ${name}.`);
  console.log("Template criado na Meta:", {
    id: created.id || null,
    name,
    category: payload.category,
    language: payload.language,
    status: created.status || "PENDING",
  });
  return created;
}

async function main() {
  const env = parseEnvFile(envPath);
  const endpoint = process.env.APPWRITE_ENDPOINT || env.VITE_APPWRITE_ENDPOINT;
  const projectId = process.env.APPWRITE_PROJECT_ID || env.VITE_APPWRITE_PROJECT_ID;
  const apiKey = process.env.APPWRITE_API_KEY || env.APPWRITE_API_KEY;
  const databaseId = env.VITE_APPWRITE_DATABASE_ID;
  const platformCol = env.VITE_APPWRITE_PLATFORM_SETTINGS_COL_ID;

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

  console.log("WABA conectada. Atualizando templates de voo solo para o instrutor.");
  await ensureTemplate(settings, approvedPayload(), {
    requireBodyIncludes: "Você já pode seguir com a operação",
  });
  await ensureTemplate(settings, rejectedPayload());
}

main().catch((error) => {
  console.error(error.message || error);
  if (error.details) console.error(JSON.stringify(error.details, null, 2));
  process.exit(1);
});
