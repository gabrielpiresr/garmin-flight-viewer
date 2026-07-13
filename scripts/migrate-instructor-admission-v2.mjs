/**
 * Script: migrate-instructor-admission-v2.mjs
 * Adiciona user_id, reconfigura etapas canônicas e importa instrutores ativos.
 * Uso: node scripts/migrate-instructor-admission-v2.mjs
 */

import { Client, Databases, ID, Permission, Role, Query } from "node-appwrite";
import { readFileSync } from "fs";

const envPath = decodeURIComponent(new URL("../.env.local", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const localEnv = Object.fromEntries(readFileSync(envPath, "utf-8").split(/\r?\n/).flatMap((line) => {
  const index = line.indexOf("=");
  if (index <= 0 || line.trim().startsWith("#")) return [];
  return [[line.slice(0, index).trim(), line.slice(index + 1).trim()]];
}));

const ENDPOINT = process.env.APPWRITE_ENDPOINT || localEnv.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || localEnv.VITE_APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY || localEnv.APPWRITE_API_KEY;
const DB_ID = process.env.APPWRITE_DATABASE_ID || localEnv.VITE_APPWRITE_DATABASE_ID;
const SCHOOL_ID = localEnv.VITE_SCHOOL_ID || "escola_principal";
const PROFILES_COL = localEnv.VITE_APPWRITE_PROFILES_COLLECTION_ID || "6a01ebb50034d5067723";
const FLIGHTS_COL = localEnv.VITE_APPWRITE_COLLECTION_ID || "6a01afb1002232d33950";

const STAGES_COL = "instructor_admission_stages";
const CANDIDATES_COL = "instructor_admission_candidates";

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DB_ID) {
  throw new Error("Defina APPWRITE_API_KEY e as configurações Appwrite.");
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const CANONICAL_STAGES = [
  {
    name: "Triagem",
    color: "#38bdf8",
    description: "Análise inicial do perfil, documentação e fit cultural.",
    order: 10,
    is_default: true,
  },
  {
    name: "Entrevista técnica",
    color: "#a78bfa",
    description: "Entrevista com a equipe pedagógica e avaliação técnica do candidato.",
    order: 20,
    is_default: false,
  },
  {
    name: "Teste prático",
    color: "#f59e0b",
    description: "Avaliação prática em voo e checagem de padrões operacionais.",
    order: 30,
    is_default: false,
  },
  {
    name: "Formação interna",
    color: "#34d399",
    description: "Treinamento interno, alinhamento de processos e preparação para atuação.",
    order: 40,
    is_default: false,
  },
  {
    name: "Nível 1 — Rampagem",
    color: "#60a5fa",
    description:
      "Instrutor liberado para iniciar instrução, mas com carga baixa e acompanhamento próximo. Deve atuar em voos mais simples e com alunos iniciais.\nPrimeiras 60 horas na escola · R$85 por hora de voo",
    order: 50,
    is_default: false,
  },
  {
    name: "Nível 2 — Operacional",
    color: "#2dd4bf",
    description:
      "Instrutor apto para entrar na escala regular, com mais autonomia e possibilidade de acompanhar alunos em diferentes fases.\nApós 60 horas na escola · R$100 por hora de voo",
    order: 60,
    is_default: false,
  },
  {
    name: "Nível 3 — Pleno",
    color: "#22c55e",
    description:
      "Instrutor confiável, consistente e bem alinhado ao padrão da escola. Pode assumir maior carga, alunos em fases mais avançadas e apoiar alunos com dificuldade.\nPelo menos 300 horas de instrução na escola, avaliado pela performance · R$120 por hora de voo",
    order: 70,
    is_default: false,
  },
  {
    name: "Nível 4 — Líder/Padronizador",
    color: "#eab308",
    description:
      "Instrutor referência técnica e operacional. Pode apoiar a formação de novos instrutores, revisar padrões, ajudar em avaliações e atuar junto à coordenação.",
    order: 80,
    is_default: false,
  },
];

async function tryAttr(fn, label) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
  } catch (e) {
    if (e.code === 409) console.log(`  ~ ${label} (já existe)`);
    else console.error(`  ✗ ${label}: ${e.message}`);
  }
}

function parseRoles(doc) {
  const roles = [];
  if (doc.role === "instrutor") roles.push("instrutor");
  if (doc.roles) {
    try {
      const parsed = JSON.parse(doc.roles);
      if (Array.isArray(parsed)) parsed.forEach((r) => roles.push(String(r)));
    } catch { /* ignore */ }
  }
  if (doc.assigned_role_slugs) {
    try {
      const parsed = JSON.parse(doc.assigned_role_slugs);
      if (Array.isArray(parsed)) parsed.forEach((r) => roles.push(String(r)));
    } catch { /* ignore */ }
  }
  return [...new Set(roles)];
}

function flightHours(doc) {
  if (doc.block_time_minutes) return Number(doc.block_time_minutes) / 60;
  if (doc.total_flight_minutes) return Number(doc.total_flight_minutes) / 60;
  if (doc.duration_sec) return Number(doc.duration_sec) / 3600;
  return 0;
}

function suggestStage(totalHours) {
  if (totalHours >= 300) return "Nível 3 — Pleno";
  if (totalHours >= 60) return "Nível 2 — Operacional";
  return "Nível 1 — Rampagem";
}

console.log("\n▶ Adicionando user_id em candidatos...");
await tryAttr(
  () => db.createStringAttribute(DB_ID, CANDIDATES_COL, "user_id", 36, false, ""),
  "user_id",
);

await new Promise((r) => setTimeout(r, 2000));

console.log("\n▶ Reconfigurando etapas...");
const existingStages = await db.listDocuments(DB_ID, STAGES_COL, [Query.limit(100)]);
const canonicalNames = new Set(CANONICAL_STAGES.map((s) => s.name));

for (const stage of existingStages.documents) {
  if (!canonicalNames.has(stage.name) && !stage.archived) {
    await db.updateDocument(DB_ID, STAGES_COL, stage.$id, { archived: true });
    console.log(`  ~ Arquivada etapa antiga: ${stage.name}`);
  }
}

const stageByName = new Map();
for (const seed of CANONICAL_STAGES) {
  const found = existingStages.documents.find((s) => s.name === seed.name);
  if (found) {
    const updated = await db.updateDocument(DB_ID, STAGES_COL, found.$id, {
      ...seed,
      archived: false,
    });
    stageByName.set(seed.name, updated.$id);
    console.log(`  ✓ Atualizada: ${seed.name}`);
  } else {
    const created = await db.createDocument(DB_ID, STAGES_COL, ID.unique(), {
      ...seed,
      archived: false,
    }, [
      Permission.read(Role.label("admin")),
      Permission.update(Role.label("admin")),
      Permission.delete(Role.label("admin")),
    ]);
    stageByName.set(seed.name, created.$id);
    console.log(`  ✓ Criada: ${seed.name}`);
  }
}

console.log("\n▶ Carregando instrutores e horas...");
const profiles = await db.listDocuments(DB_ID, PROFILES_COL, [
  Query.equal("school_id", [SCHOOL_ID]),
  Query.limit(200),
]);
const instructors = profiles.documents.filter(
  (doc) => doc.is_active !== false && parseRoles(doc).includes("instrutor"),
);

const flights = await db.listDocuments(DB_ID, FLIGHTS_COL, [
  Query.equal("flight_status", ["Realizado"]),
  Query.limit(5000),
]);

const totalHours = {};
for (const flight of flights.documents) {
  const instructorId = flight.instructor_user_id;
  if (!instructorId) continue;
  totalHours[instructorId] = (totalHours[instructorId] || 0) + flightHours(flight);
}

const candidates = await db.listDocuments(DB_ID, CANDIDATES_COL, [Query.limit(500)]);
const byUserId = new Map(candidates.documents.filter((c) => c.user_id).map((c) => [c.user_id, c]));
const byEmail = new Map(candidates.documents.map((c) => [String(c.email || "").toLowerCase(), c]));

let created = 0;
let linked = 0;

console.log("\n▶ Sincronizando instrutores ativos...");
for (const profile of instructors) {
  const userId = profile.user_id;
  const email = String(profile.email || "").toLowerCase();
  const name = String(profile.full_name || profile.nickname || email);
  const phone = String(profile.phone || "");
  const anac = String(profile.anac_code || "");
  const hours = totalHours[userId] || 0;
  const stageName = suggestStage(hours);
  const stageId = stageByName.get(stageName);
  if (!stageId) continue;

  const existing = byUserId.get(userId) || byEmail.get(email);
  if (existing) {
    await db.updateDocument(DB_ID, CANDIDATES_COL, existing.$id, {
      user_id: userId,
      name,
      email,
      phone,
      source: existing.source === "form" ? "form" : "instructor",
      notes: anac ? `Código ANAC: ${anac}` : existing.notes || "",
    });
    if (!existing.user_id) linked += 1;
    continue;
  }

  await db.createDocument(DB_ID, CANDIDATES_COL, ID.unique(), {
    user_id: userId,
    stage_id: stageId,
    name,
    email,
    phone,
    notes: anac ? `Código ANAC: ${anac}` : "",
    responses_json: "{}",
    source: "instructor",
    status_entered_at: new Date().toISOString(),
  }, [
    Permission.read(Role.label("admin")),
    Permission.update(Role.label("admin")),
    Permission.delete(Role.label("admin")),
    Permission.read(Role.any()),
    Permission.update(Role.any()),
  ]);
  created += 1;
  console.log(`  + ${name} → ${stageName} (${hours.toFixed(1)}h)`);
}

console.log(`\n✅ Migração concluída: ${created} criado(s), ${linked} vinculado(s), ${instructors.length} instrutor(es) processado(s).`);
