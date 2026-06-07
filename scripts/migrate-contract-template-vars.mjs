/**
 * migrate-contract-template-vars.mjs
 *
 * Busca todos os templates de contrato do Appwrite, detecta variáveis no
 * estilo SAGA ([NOME COMPLETO], [CPF], etc.) e as converte para o formato
 * do sistema ({{nome_completo}}, {{cpf}}, etc.).
 *
 * Variáveis que não têm mapeamento para o sistema viram custom_variables
 * automaticamente.
 *
 * Uso:
 *   node scripts/migrate-contract-template-vars.mjs          → dry-run (mostra o plano)
 *   node scripts/migrate-contract-template-vars.mjs --apply  → aplica as alterações
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases, Query } from "node-appwrite";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
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
const TEMPLATES_COL_ID = env.VITE_APPWRITE_CONTRACT_TEMPLATES_COL_ID || "contract_templates";
const SCHOOL_ID = env.VITE_SCHOOL_ID || "escola_principal";
const DRY_RUN = !process.argv.includes("--apply");

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("Variáveis de ambiente faltando.");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

// ---------------------------------------------------------------------------
// Mapeamento SAGA → sistema
// Adicione aqui qualquer variação extra que encontrar nos contratos.
// ---------------------------------------------------------------------------
const SAGA_TO_SYSTEM = [
  // Nome
  { saga: /\[NOME COMPLETO\]/gi, system: "{{nome_completo}}" },
  { saga: /\[NOME\]/gi, system: "{{nome_completo}}" },
  // CPF
  { saga: /\[CPF\]/gi, system: "{{cpf}}" },
  // RG
  { saga: /\[RG\]/gi, system: "{{rg}}" },
  { saga: /\[NÚMERO DO RG\]/gi, system: "{{rg}}" },
  { saga: /\[NUMERO DO RG\]/gi, system: "{{rg}}" },
  // Órgão expedidor
  { saga: /\[ÓRG[ÃA]O EXPEDIDOR\]/gi, system: "{{rg_orgao_expedidor}}" },
  { saga: /\[ORGAO EXPEDIDOR\]/gi, system: "{{rg_orgao_expedidor}}" },
  { saga: /\[ÓRGÃO EXPEDIDOR\]/gi, system: "{{rg_orgao_expedidor}}" },
  { saga: /\[ORGÃO EXPEDIDOR\]/gi, system: "{{rg_orgao_expedidor}}" },
  // Data de nascimento
  { saga: /\[DATA DE NASCIMENTO\]/gi, system: "{{data_nascimento}}" },
  { saga: /\[DATA NASCIMENTO\]/gi, system: "{{data_nascimento}}" },
  { saga: /\[NASCIMENTO\]/gi, system: "{{data_nascimento}}" },
  // Endereço
  { saga: /\[ENDERE[CÇ]O\]/gi, system: "{{endereco}}" },
  { saga: /\[ENDERECO\]/gi, system: "{{endereco}}" },
  // Nacionalidade
  { saga: /\[NACIONALIDADE\]/gi, system: "{{nacionalidade}}" },
  // Estado civil
  { saga: /\[ESTADO CIVIL\]/gi, system: "{{estado_civil}}" },
  // E-mail
  { saga: /\[E-MAIL\]/gi, system: "{{email}}" },
  { saga: /\[EMAIL\]/gi, system: "{{email}}" },
  // Telefone
  { saga: /\[TELEFONE\]/gi, system: "{{telefone}}" },
  { saga: /\[FONE\]/gi, system: "{{telefone}}" },
  { saga: /\[CELULAR\]/gi, system: "{{telefone}}" },
  // Código ANAC
  { saga: /\[C[ÓO]DIGO ANAC\]/gi, system: "{{codigo_anac}}" },
  { saga: /\[CODIGO ANAC\]/gi, system: "{{codigo_anac}}" },
  // Data de hoje
  { saga: /\[DATA ATUAL\]/gi, system: "{{data_hoje}}" },
  { saga: /\[DATA DE HOJE\]/gi, system: "{{data_hoje}}" },
  { saga: /\[DATA ASSINATURA\]/gi, system: "{{data_hoje}}" },
  { saga: /\[LOCAL E DATA\]/gi, system: "{{data_hoje}}" },
  { saga: /\[LOCAL\/DATA\]/gi, system: "{{data_hoje}}" },
  // Órgão expedidor do RG (variação SAGA "EXPEDITOR")
  { saga: /\[RG EXPEDITOR\]/gi, system: "{{rg_orgao_expedidor}}" },
  // Assinaturas
  { saga: /\[ASSINATURA DO ALUNO\]/gi, system: "{{assinatura_aluno}}" },
  { saga: /\[ASSINATURA ALUNO\]/gi, system: "{{assinatura_aluno}}" },
  { saga: /\[ASSINATURA DO INSTRUTOR\]/gi, system: "{{assinatura_aluno}}" },
  { saga: /\[ASSINATURA INSTRUTOR\]/gi, system: "{{assinatura_aluno}}" },
  { saga: /\[ASSINATURA DO CONTRATANTE\]/gi, system: "{{assinatura_aluno}}" },
  { saga: /\[ASSINATURA CONTRATANTE\]/gi, system: "{{assinatura_aluno}}" },
  // [ASSINATURA] sem qualificador = assinatura do aluno/contratante
  { saga: /\[ASSINATURA\]/gi, system: "{{assinatura_aluno}}" },
  { saga: /\[ASSINATURA DA ESCOLA\]/gi, system: "{{assinatura_admin}}" },
  { saga: /\[ASSINATURA ESCOLA\]/gi, system: "{{assinatura_admin}}" },
  { saga: /\[ASSINATURA DA CONTRATADA\]/gi, system: "{{assinatura_admin}}" },
  { saga: /\[ASSINATURA CONTRATADA\]/gi, system: "{{assinatura_admin}}" },
  { saga: /\[REPRESENTANTE LEGAL\]/gi, system: "{{assinatura_admin}}" },
  // [{CURSO}] — variante SAGA com chave misturada, trata como custom var "curso"
  // (mapeado manualmente em newCustomVars abaixo via regex especial)
];

// ---------------------------------------------------------------------------
// Utilitários Tiptap JSON
// ---------------------------------------------------------------------------

/** Extrai todo o texto bruto de um doc Tiptap */
function extractAllText(node) {
  let result = "";
  if (node.type === "text" && typeof node.text === "string") result += node.text;
  if (Array.isArray(node.content)) {
    for (const child of node.content) result += extractAllText(child);
  }
  return result;
}

/** Aplica replace recursivamente em nós "text" do Tiptap */
function replaceInNode(node, replaceFn) {
  if (node.type === "text" && typeof node.text === "string") {
    return { ...node, text: replaceFn(node.text) };
  }
  if (Array.isArray(node.content)) {
    return { ...node, content: node.content.map((c) => replaceInNode(c, replaceFn)) };
  }
  return node;
}

/** Encontra padrões [QUALQUER COISA] e [{QUALQUER COISA}] ainda não mapeados */
function findUnknownSagaVars(text) {
  // Captura [TEXTO] e [{TEXTO}]
  const matches = text.match(/\[\{?[^\]]{2,60}\}?\]/g) || [];
  return [...new Set(matches)].filter((m) => {
    // Ignora se já vai ser mapeado por SAGA_TO_SYSTEM
    return !SAGA_TO_SYSTEM.some(({ saga }) => { saga.lastIndex = 0; return saga.test(m) || (saga.lastIndex = 0, false); });
  });
}

/** Converte "[MEU CAMPO AQUI]" ou "[{MEU CAMPO}]" → "meu_campo" (snake_case) */
function toSnakeCase(sagaVar) {
  return sagaVar
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/^\{/, "")
    .replace(/\}$/, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// ---------------------------------------------------------------------------
// Lógica principal
// ---------------------------------------------------------------------------

async function fetchAllTemplates() {
  const docs = [];
  let cursor = null;
  while (true) {
    const queries = [
      Query.equal("school_id", SCHOOL_ID),
      Query.limit(100),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const page = await db.listDocuments(DATABASE_ID, TEMPLATES_COL_ID, queries);
    docs.push(...page.documents);
    if (page.documents.length < 100) break;
    cursor = page.documents[page.documents.length - 1].$id;
  }
  return docs;
}

function parseCustomVars(doc) {
  try {
    if (typeof doc.custom_variables_json === "string" && doc.custom_variables_json) {
      return JSON.parse(doc.custom_variables_json);
    }
  } catch {}
  return [];
}

async function main() {
  console.log("=== Migração de variáveis SAGA → sistema ===");
  console.log(`Modo: ${DRY_RUN ? "DRY RUN (simulação)" : "APLICAR"}`);
  console.log(`School: ${SCHOOL_ID} | Collection: ${TEMPLATES_COL_ID}\n`);

  const templates = await fetchAllTemplates();
  console.log(`Templates encontrados: ${templates.length}\n`);

  if (templates.length === 0) {
    console.log("Nenhum template encontrado. Verifique school_id e collection ID.");
    return;
  }

  for (const doc of templates) {
    console.log(`\n${"─".repeat(70)}`);
    console.log(`📄 Template: "${doc.name}" (${doc.$id})`);
    console.log(`   standard_type: "${doc.standard_type || "(nenhum)"}"`);

    let contentJson = doc.content_json || "";
    let tiptapDoc;
    try {
      tiptapDoc = JSON.parse(contentJson);
    } catch {
      console.log("   ⚠️  content_json inválido, pulando.");
      continue;
    }

    const rawText = extractAllText(tiptapDoc);
    const existingCustomVars = parseCustomVars(doc);

    // Detecta variáveis SAGA desconhecidas
    const unknownVars = findUnknownSagaVars(rawText);

    // Coleta mapeamentos que serão aplicados
    const appliedMappings = [];
    SAGA_TO_SYSTEM.forEach(({ saga, system }) => {
      // Reset regex state
      saga.lastIndex = 0;
      if (saga.test(rawText)) {
        saga.lastIndex = 0;
        const matches = [...rawText.matchAll(new RegExp(saga.source, saga.flags))];
        matches.forEach((m) => {
          if (!appliedMappings.some((a) => a.from === m[0])) {
            appliedMappings.push({ from: m[0], to: system });
          }
        });
        saga.lastIndex = 0;
      }
    });

    // Mostra mapeamentos de sistema
    if (appliedMappings.length > 0) {
      console.log("\n   Variáveis do sistema detectadas:");
      appliedMappings.forEach(({ from, to }) => console.log(`     ${from}  →  ${to}`));
    } else {
      console.log("\n   Nenhuma variável SAGA do sistema detectada.");
    }

    // Variáveis desconhecidas → custom_variables
    const newCustomVars = [];
    if (unknownVars.length > 0) {
      console.log("\n   Variáveis desconhecidas → criarão custom_variables:");
      for (const v of unknownVars) {
        const name = toSnakeCase(v);
        const label = v.replace(/^\[/, "").replace(/\]$/, "").replace(/^\{/, "").replace(/\}$/, "").trim();
        const alreadyExists =
          existingCustomVars.some((c) => c.name === name) ||
          newCustomVars.some((c) => c.name === name);
        if (!alreadyExists) {
          newCustomVars.push({ name, label });
          console.log(`     ${v}  →  {{${name}}}  (label: "${label}")`);
        } else {
          console.log(`     ${v}  →  {{${name}}}  (já existe)`);
        }
      }
    }

    if (appliedMappings.length === 0 && unknownVars.length === 0) {
      console.log("   ✅ Nenhuma variável SAGA encontrada, template OK.");
      continue;
    }

    // Aplica substituições no Tiptap JSON
    const allCustomVars = [...existingCustomVars];
    for (const nv of newCustomVars) {
      if (!allCustomVars.some((c) => c.name === nv.name)) {
        allCustomVars.push(nv);
      }
    }

    const replaceFn = (text) => {
      // Substitui variáveis do sistema
      for (const { saga, system } of SAGA_TO_SYSTEM) {
        saga.lastIndex = 0;
        text = text.replace(new RegExp(saga.source, saga.flags), system);
      }
      // Substitui custom vars desconhecidas (suporta [LABEL] e [{LABEL}])
      for (const cv of newCustomVars) {
        // Reconstrói o padrão original a partir do raw label (pode ter braces)
        const rawLabel = cv.label;
        const escapedLabel = rawLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // Tenta match de [LABEL] e [{LABEL}]
        text = text.replace(new RegExp(`\\[\\{?${escapedLabel}\\}?\\]`, "gi"), `{{${cv.name}}}`);
      }
      return text;
    };

    const newTiptapDoc = replaceInNode(tiptapDoc, replaceFn);
    const newContentJson = JSON.stringify(newTiptapDoc);
    const newCustomVarsJson = JSON.stringify(allCustomVars);

    if (DRY_RUN) {
      console.log("\n   [DRY RUN] Nenhuma alteração feita. Use --apply para aplicar.");
    } else {
      await db.updateDocument(DATABASE_ID, TEMPLATES_COL_ID, doc.$id, {
        content_json: newContentJson,
        custom_variables_json: newCustomVarsJson,
        updated_at: new Date().toISOString(),
      });
      console.log("\n   ✅ Template atualizado no Appwrite.");
    }
  }

  console.log(`\n${"═".repeat(70)}`);
  if (DRY_RUN) {
    console.log("DRY RUN concluído. Execute com --apply para aplicar as alterações.");
  } else {
    console.log("Migração concluída com sucesso!");
  }
}

main().catch((err) => {
  console.error("Erro:", err?.message ?? err);
  process.exit(1);
});
