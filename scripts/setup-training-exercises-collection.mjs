import { Client, Databases, ID, Permission, Query, Role } from "node-appwrite";

const ENDPOINT = process.env.APPWRITE_ENDPOINT;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const SCHOOL_ID = process.env.VITE_SCHOOL_ID || process.env.SCHOOL_ID || "escola_principal";

const COLLECTION_ID = "training_exercises";
const COLLECTION_NAME = "training_exercises";

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID) {
  console.error("Missing env vars. Required: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID");
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

const EXERCISES = [
  { order: 1, title: "Documentos / Equipamentos de Voo", acceptableProficiency: "Verificar e consultar todos os documentos e equipamentos obrigatórios para a realização do voo pretendido" },
  { order: 2, title: "Inspeções", acceptableProficiency: "Realizar todos os procedimentos de checklist e/ou lista de procedimentos específico da aeronave" },
  { order: 3, title: "Partida do motor", acceptableProficiency: "Realizar a partida do motor de acordo com o check-list da aeronave" },
  { order: 4, title: "Cheques", acceptableProficiency: "Seguir os procedimentos praticados pela EPEAC Aviação" },
  { order: 5, title: "Fraseologia", acceptableProficiency: "Seguir os procedimentos da MCA 100-16" },
  { order: 6, title: "Táxi", acceptableProficiency: "±2 metros para cada lado da centerline e velocidade máx de 10kts (ground speed) - Verificar freios e parâmetros" },
  { order: 7, title: "Decolagem normal", acceptableProficiency: "± 5° de proa; -0/+5 nós de velocidade de subida e ± 100 pés da altitude de nivelamento; ± 5 metros do eixo da pista; check-lists corretos" },
  { order: 8, title: "Saída do tráfego", acceptableProficiency: "± 100 pés da altitude de tráfego; Curvas de PEQ ou MÉD inclinação;" },
  { order: 9, title: "Subida para área de instrução", acceptableProficiency: "± 5° de proa, -0/+5 nós de velocidade de subida e ± 100 pés da altitude de nivelamento" },
  { order: 10, title: "Nivelamento", acceptableProficiency: "± 100 pés da altitude de nivelamento pretendida/solicitada." },
  { order: 11, title: "Identificação da área de instrução", acceptableProficiency: "Identificação dos limites da área de instrução" },
  { order: 12, title: "Uso de comandos de voo", acceptableProficiency: "Aplicação correta dos comandos de voo" },
  { order: 13, title: "Uso do motor", acceptableProficiency: "RPM MAXÍMAS: DECOLAGEM: 5500; SUBIDA: 5200; CRUZEIRO 4.900 a 5000; DESCIDA 3900 - Parâmetros nas faixas verde" },
  { order: 14, title: "Uso do compensador", acceptableProficiency: "Aplicação correta do compensador" },
  { order: 15, title: "Voo em Linha Reta Horizontal (VLRH)", acceptableProficiency: "±5° de proa, ± 100 pés e ± 10 nós de velocidade" },
  { order: 16, title: "Voo ascendente", acceptableProficiency: "± 5° de proa, -0/+5 nós de velocidade de subida e ± 100 pés da altitude de nivelamento" },
  { order: 17, title: "Voo descendente", acceptableProficiency: "± 5° de proa, ± 10 nós de velocidade de descida e ± 100 pés da altitude de nivelamento" },
  { order: 18, title: "Curvas (PQ/MD/GD) (90º/180º/270º/360º)", acceptableProficiency: "± 100 pés de altitude, ± 10 nós de velocidade, ângulo de rolamento de ± 5° e proa final de ± 5°" },
  { order: 19, title: "Curvas Ascendentes / Descendentes", acceptableProficiency: "± 100 pés de altitude, ± 10 nós de velocidade, ângulo de rolamento de ± 5° e proa final de ± 5°" },
  { order: 20, title: "Voo Planado", acceptableProficiency: "± 10 nós de velocidade de planeio publicada pelo fabricante da aeronave" },
  { order: 21, title: "Voo em Retângulo", acceptableProficiency: "± 100ft de variação de altitude; e ± meia aeronave de distância da referência ao nivelar as asas." },
  { order: 22, title: "\"S\" sobre estrada", acceptableProficiency: "± 100ft de variação de altitude; ± 5 nós de variação de velocidade; ± 5° de variação de proa em relação a referência; e ± meia aeronave de distância da referência ao nivelar as asas." },
  { order: 23, title: "8 ao redor de marcos", acceptableProficiency: "± 100 pés de variação de altitude; ± 5 nós de variação de velocidade; e ± 5° de variação de proa em relação ao início do exercício" },
  { order: 24, title: "Coordenação 2º Tipo", acceptableProficiency: "± 5° de proa, ± 100 pés de variação de altitude, ± 5° de ângulo de rolamento" },
  { order: 25, title: "Coordenação 1º Tipo", acceptableProficiency: "± 100 pés de variação de altitude e ± 5° de variação de proa" },
  { order: 26, title: "Estol sem motor", acceptableProficiency: "Motor em 2000 RPM - Reconhecimento e recuperação imediata do estol - Perda máxima de 500ft" },
  { order: 27, title: "Estol com motor", acceptableProficiency: "Motor em 3500 RPM - Reconhecimento e recuperação imediata do estol - Perda máxima de 500ft" },
  { order: 28, title: "Coordenação potência/atitude/velocidade (CAP)", acceptableProficiency: "± 5° de proa, ± 100 pés de variação de altitude e ± 10 nós de velocidade" },
  { order: 29, title: "Velocidade Mínima de Controle (VMC)", acceptableProficiency: "± 10 nós de velocidade de planeio publicada; identificação de área de pouso; Check List de reacionamento e Check List de corte (memory itens)" },
  { order: 30, title: "Pane Simulada", acceptableProficiency: "± 10 nós de velocidade de planeio publicada; identificação de área de pouso; Check List de reacionamento e Check List de corte (memory itens)" },
  { order: 31, title: "Pane simulada a baixa altura", acceptableProficiency: "± 10 nós de velocidade de planeio publicada; identificação de área de pouso; e Check List de corte (memory itens)" },
  { order: 32, title: "Glissadas", acceptableProficiency: "-5/+10 de variação de velocidade e ± 5° de proa" },
  { order: 33, title: "Curva 180º bússola e Turn bank", acceptableProficiency: "± 100 pés de altitude, ± 10 nós de velocidade, ângulo de rolamento de ± 5° e proa final de ± 5°" },
  { order: 34, title: "Reconhecimento do Parafuso", acceptableProficiency: "Entrar e sair da manobra de forma correta, ou seja, comandar a entrada no momento correto, comandar pedal oposto para cessar o giro e neutralizar os comandos" },
  { order: 35, title: "Descida para tráfego", acceptableProficiency: "± 5° de proa, ± 10 nós de velocidade de descida e ± 100 pés da altitude de nivelamento" },
  { order: 36, title: "Circuito de tráfego", acceptableProficiency: "± 100 pés de altitude, ± 10 nós de velocidade, ângulo de rolamento de ± 5°" },
  { order: 37, title: "Enquadramento da pista", acceptableProficiency: "± 100 pés de altitude da perna final, +10/-0 nós de velocidade; centerline da pista" },
  { order: 38, title: "Aproximação final", acceptableProficiency: "Aproximação estabilizada - Vref +10/-0 nós; Aeronave configurada para pouso; checklists realizados" },
  { order: 39, title: "Pouso Normal", acceptableProficiency: "Razão de descida ≤ 300 pés/minuto; ± 2m centerline; toque no primeiro terço da pista" },
  { order: 40, title: "Arremetida no ar", acceptableProficiency: "± 5° de proa; -0/+5 nós de velocidade de subida e ± 100 pés da altitude de nivelamento; ± 5 metros do eixo da pista; check-lists corretos" },
  { order: 41, title: "Arremetida no solo", acceptableProficiency: "± 5° de proa; -0/+5 nós de velocidade de subida e ± 100 pés da altitude de nivelamento; ± 5 metros do eixo da pista; check-lists corretos" },
  { order: 42, title: "Pouso curto", acceptableProficiency: "Razão de descida ≤ 300 pés/minuto; ± 2m centerline; toque nos primeiros 100 metros da pista" },
  { order: 43, title: "Pouso de precisão", acceptableProficiency: "Razão de descida ≤ 300 pés/minuto; ± 2m centerline; toque na marca de visada da pista (marca de mil)" },
  { order: 44, title: "Aproximação de 90˚", acceptableProficiency: "± 10 nós de velocidade de planeio publicada pelo fabricante da aeronave; Garantir o pouso no primeiro terço da pista escolhida para o pouso" },
  { order: 45, title: "Aproximação de 180˚", acceptableProficiency: "± 10 nós de velocidade de planeio publicada pelo fabricante da aeronave; Garantir o pouso no primeiro terço da pista escolhida para o pouso" },
  { order: 46, title: "Aproximação de 360˚", acceptableProficiency: "± 10 nós de velocidade de planeio publicada pelo fabricante da aeronave; Garantir o pouso no primeiro terço da pista escolhida para o pouso" },
  { order: 47, title: "Procedimento após pouso", acceptableProficiency: "Desaceleração / frenagem; itens de check-list realizados; fonia" },
  { order: 48, title: "Corte do motor", acceptableProficiency: "Corte de motor de acordo com o Check List da aeronave" },
  { order: 49, title: "Cheque de abandono", acceptableProficiency: "Cheque de abandono de acordo com o check list da aeronave" },
  { order: 50, title: "Emergência na decolagem", acceptableProficiency: "± 10 nós de velocidade de planeio publicada; identificação de área de pouso; e Check List de corte (memory itens);" },
  { order: 51, title: "Decolagem abortada", acceptableProficiency: "Ações imediatas dos memory itens; comunicação clara;" },
  { order: 52, title: "Desorientação Espacial", acceptableProficiency: "Demonstração e reconhecimento; recuperação com referências visuais;" },
  { order: 53, title: "Abnormal Procedures (Fire; Rough Engine; unreliable instruments; control lock; comm fail)", acceptableProficiency: "Execução simulada dos procedimentos previstos em manual;" },
  { order: 54, title: "Tomada de Decisão e CRM", acceptableProficiency: "Avaliação dos elementos não técnicos." },
];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureCollection() {
  try {
    const collection = await db.getCollection(DATABASE_ID, COLLECTION_ID);
    await db.updateCollection(DATABASE_ID, COLLECTION_ID, COLLECTION_NAME, COLLECTION_PERMS, false, true);
    console.log(`  • Collection already exists (${collection.$id})`);
    return collection;
  } catch (error) {
    const message = error?.message ?? String(error);
    const normalized = message.toLowerCase();
    if (!normalized.includes("not found") && !normalized.includes("could not be found")) throw error;
  }

  const collection = await db.createCollection(DATABASE_ID, COLLECTION_ID, COLLECTION_NAME, COLLECTION_PERMS, false, true);
  console.log(`  ✓ Created collection (${collection.$id})`);
  return collection;
}

async function attr(createFn, label) {
  try {
    await createFn();
    await sleep(700);
    console.log(`     ✓ ${label}`);
  } catch (error) {
    const message = error?.message ?? String(error);
    if (message.toLowerCase().includes("already exists")) {
      console.log(`     • ${label} (already exists)`);
      return;
    }
    throw error;
  }
}

async function idx(key, attributes, orders = ["ASC"]) {
  try {
    await db.createIndex(DATABASE_ID, COLLECTION_ID, key, "key", attributes, orders);
    await sleep(700);
    console.log(`     ✓ index ${key}`);
  } catch (error) {
    const message = error?.message ?? String(error);
    if (message.toLowerCase().includes("already exists")) {
      console.log(`     • index ${key} (already exists)`);
      return;
    }
    throw error;
  }
}

async function configureAttributes() {
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "school_id", 64, true), "school_id");
  await attr(() => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "title", 255, true), "title");
  await attr(
    () => db.createStringAttribute(DATABASE_ID, COLLECTION_ID, "acceptable_proficiency", 2048, true),
    "acceptable_proficiency",
  );
  await attr(() => db.createIntegerAttribute(DATABASE_ID, COLLECTION_ID, "order", true), "order");
  await attr(() => db.createBooleanAttribute(DATABASE_ID, COLLECTION_ID, "is_active", true), "is_active");
  await idx("training_exercises_school_idx", ["school_id"]);
  await idx("training_exercises_school_order_idx", ["school_id", "order"], ["ASC", "ASC"]);
  await idx("training_exercises_active_order_idx", ["school_id", "is_active", "order"], ["ASC", "ASC", "ASC"]);
}

async function findExercise(title) {
  const res = await db.listDocuments(DATABASE_ID, COLLECTION_ID, [
    Query.equal("school_id", [SCHOOL_ID]),
    Query.equal("title", [title]),
    Query.limit(1),
  ]);
  return res.documents[0] ?? null;
}

async function seedExercises() {
  console.log(`\nSeeding ${EXERCISES.length} exercises for school "${SCHOOL_ID}"...`);
  let created = 0;
  let updated = 0;
  for (const exercise of EXERCISES) {
    const data = {
      school_id: SCHOOL_ID,
      title: exercise.title,
      acceptable_proficiency: exercise.acceptableProficiency,
      order: exercise.order,
      is_active: true,
    };
    const existing = await findExercise(exercise.title);
    if (existing) {
      await db.updateDocument(DATABASE_ID, COLLECTION_ID, existing.$id, data);
      updated += 1;
    } else {
      await db.createDocument(DATABASE_ID, COLLECTION_ID, ID.unique(), data);
      created += 1;
    }
  }
  console.log(`  ✓ Seed complete. Created: ${created}. Updated: ${updated}.`);
}

async function main() {
  console.log("=== Appwrite Training Exercises Setup ===");
  console.log(`Database: ${DATABASE_ID}`);
  await ensureCollection();
  await configureAttributes();
  await seedExercises();
  console.log("\nAdd this to your .env.local:");
  console.log(`VITE_APPWRITE_TRAINING_EXERCISES_COL_ID=${COLLECTION_ID}`);
}

main().catch((error) => {
  console.error("Setup failed:", error?.message ?? error);
  process.exit(1);
});
