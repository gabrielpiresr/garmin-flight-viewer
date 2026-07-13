/**
 * Seed Flight Review maneuver templates + steps for MC01 training maneuvers.
 * Skips templates that already exist by exact name (does not update existing ones).
 *
 * Usage: node scripts/seed-flight-review-maneuvers.mjs
 */
import { Client, Databases, ID, Query } from "node-appwrite";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const ENDPOINT = env.VITE_APPWRITE_ENDPOINT;
const PROJECT_ID = env.VITE_APPWRITE_PROJECT_ID;
const API_KEY = env.APPWRITE_API_KEY;
const DATABASE_ID = env.VITE_APPWRITE_DATABASE_ID;
const TEMPLATES_COL = env.VITE_APPWRITE_MANEUVER_TEMPLATES_COL_ID;
const STEPS_COL = env.VITE_APPWRITE_MANEUVER_TEMPLATE_STEPS_COL_ID;
const MODELS_COL = env.VITE_APPWRITE_AIRCRAFT_MODELS_COL_ID;

if (!ENDPOINT || !PROJECT_ID || !API_KEY || !DATABASE_ID || !TEMPLATES_COL || !STEPS_COL) {
  console.error("Missing required env vars in .env.local");
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const db = new Databases(client);

const AIRCRAFT_MODEL_ID = "6a0224cc002a56f74a5c"; // MC01
const BEST_GLIDE_KT = 72;

// ---------- Parameter helpers (EPEAC tolerances + MC01 references) ----------

function headingParam(maxDeg = 5, severity = "high") {
  return {
    parameter: "heading",
    label: "Proa (°)",
    max_start: maxDeg,
    max: maxDeg,
    severity,
    alert_message_max: `Proa variou mais de ±${maxDeg}°`,
  };
}

function altitudeVariation(severity = "high") {
  return {
    parameter: "altitude",
    label: "Altitude (ft)",
    value_mode: "variation",
    variation_reference: "step_start",
    min_start: -100,
    max_start: 100,
    severity,
    alert_message_min: "Perdeu mais de 100 ft em relação ao início da etapa",
    alert_message_max: "Ganhou mais de 100 ft em relação ao início da etapa",
  };
}

function agl1000(severity = "high") {
  return {
    parameter: "agl",
    label: "AGL (ft)",
    min_start: 900,
    max_start: 1100,
    severity,
    alert_message_min: "Abaixo de 900 ft AGL",
    alert_message_max: "Acima de 1100 ft AGL",
  };
}

function iasRange(min, max, severity = "high", messages = {}) {
  return {
    parameter: "ias",
    label: "IAS (kt)",
    min_start: min,
    max_start: max,
    severity,
    ...(messages.min ? { alert_message_min: messages.min } : {}),
    ...(messages.max ? { alert_message_max: messages.max } : {}),
  };
}

function bankRange(min, max, severity = "high") {
  return {
    parameter: "bank",
    label: "Rolagem (°)",
    min_start: min,
    max_start: max,
    severity,
    alert_message_min: `Inclinação abaixo de ${min}°`,
    alert_message_max: `Inclinação acima de ${max}°`,
  };
}

function rpmRange(min, max, severity = "medium") {
  return { parameter: "rpm", label: "RPM", min_start: min, max_start: max, severity };
}

function vsRange(min, max, severity = "high") {
  return {
    parameter: "vertical_speed",
    label: "Vel. Vertical (fpm)",
    min_start: min,
    max_start: max,
    severity,
  };
}

function marked(name, order, opts = {}) {
  return {
    name,
    order_index: order,
    description: opts.description ?? null,
    expected_execution_text: opts.exec ?? null,
    end_condition: { type: "instructor_marked" },
    parameters: opts.params ?? [],
  };
}

function paramEnd(name, order, cond, opts = {}) {
  return {
    name,
    order_index: order,
    description: opts.description ?? null,
    expected_execution_text: opts.exec ?? null,
    end_condition: cond,
    parameters: opts.params ?? [],
  };
}

// ---------- Maneuver definitions ----------

const MANEUVERS = [
  {
    name: "Mudanças de Atitude - Voo Ascendente",
    category: "climb",
    description:
      "Transição coordenada do voo nivelado para ascendente e estabilização. Sequência: atitude, potência (~5200 RPM) e compensador.",
    steps: [
      marked("Checagem de área", 0, {
        exec: "Verbalizar checagem de área em voz alta antes de iniciar a mudança de atitude.",
      }),
      paramEnd(
        "Nivelado → Ascendente",
        1,
        { type: "parameter", parameter: "vertical_speed", operator: ">=", value: 200 },
        {
          exec: "Cabrar suavemente, aplicar potência de subida (~5200 RPM) e compensar. Manter asas niveladas.",
          params: [
            rpmRange(4800, 5400, "high"),
            iasRange(58, 75, "medium"),
            vsRange(0, 800, "low"),
          ],
        },
      ),
      marked("Voo ascendente estabilizado", 2, {
        exec: "Manter proa, velocidade de subida e asas niveladas. Velocidade controlada pela atitude; potência no regime de subida.",
        params: [
          headingParam(5),
          iasRange(60, 70, "high", {
            min: "Velocidade de subida abaixo do esperado",
            max: "Velocidade de subida acima do esperado (-0/+5 kt)",
          }),
          vsRange(200, 900, "high"),
          rpmRange(5000, 5300, "medium"),
          altitudeVariation(),
        ],
      }),
      marked("Ascendente → Nivelado", 3, {
        exec: "Picar suavemente para atitude de cruzeiro, manter potência até acelerar, ajustar RPM de cruzeiro (~4900-5000) e compensar.",
        params: [
          headingParam(5),
          vsRange(-200, 200, "high"),
          rpmRange(3900, 5200, "medium"),
          altitudeVariation("medium"),
        ],
      }),
    ],
  },

  {
    name: "Mudanças de Atitude - Voo Descendente",
    category: "other",
    description:
      "Transição coordenada do voo nivelado para descendente com razão de descida controlada (300-500 fpm). Potência reduzida antes da atitude.",
    steps: [
      marked("Checagem de área", 0, {
        exec: "Verbalizar checagem de área em voz alta.",
      }),
      paramEnd(
        "Nivelado → Descendente",
        1,
        { type: "parameter", parameter: "vertical_speed", operator: "<=", value: -150 },
        {
          exec: "Reduzir potência gradualmente (~3900 RPM), picar suavemente, manter asas niveladas e compensar.",
          params: [
            rpmRange(3500, 4500, "high"),
            iasRange(55, 85, "medium"),
            vsRange(-800, 100, "low"),
          ],
        },
      ),
      marked("Descida estabilizada", 2, {
        exec: "Manter razão de descida entre 300 e 500 fpm, proa constante e asas niveladas.",
        params: [
          headingParam(5),
          iasRange(60, 80, "high", { max: "Variação de velocidade acima de ±10 kt" }),
          vsRange(-550, -250, "high"),
          rpmRange(3600, 4200, "medium"),
          altitudeVariation(),
        ],
      }),
      marked("Descendente → Nivelado", 3, {
        exec: "Cabrar para zerar a razão de descida, ajustar potência de cruzeiro e compensar.",
        params: [
          headingParam(5),
          vsRange(-200, 200, "high"),
          rpmRange(3900, 5100, "medium"),
          altitudeVariation("medium"),
        ],
      }),
    ],
  },

  {
    name: "Curvas - 15°",
    category: "turn",
    description: "Curva de pequena inclinação (~15°). Manter altitude, coordenação e referência visual no solo.",
    steps: [
      marked("Checagem de área", 0, {
        exec: "Verbalizar checagem de área em voz alta.",
      }),
      marked("Entrada na curva", 1, {
        exec: "Escolher referência no solo, iniciar com aileron e pedal coordenados. Antecipar a saída.",
        params: [bankRange(5, 18, "medium"), headingParam(8, "medium")],
      }),
      marked("Curva estabilizada (15°)", 2, {
        exec: "Manter inclinação de ~15°, monitorar nariz no horizonte, velocidade, altitude e coordenação.",
        params: [
          bankRange(10, 20, "high"),
          headingParam(5),
          altitudeVariation(),
          iasRange(55, 85, "high", { max: "Variação de velocidade acima de ±10 kt" }),
        ],
      }),
      marked("Saída da curva", 3, {
        exec: "Nivelar asas suavemente, manter proa e retomar voo reto e nivelado.",
        params: [
          bankRange(0, 12, "medium"),
          headingParam(5, "high"),
          altitudeVariation("medium"),
        ],
      }),
    ],
  },

  {
    name: "Curvas - 30°",
    category: "turn",
    description: "Curva de média inclinação (~30°). Ajustar potência se necessário para manter altitude.",
    steps: [
      marked("Checagem de área", 0, {
        exec: "Verbalizar checagem de área em voz alta.",
      }),
      marked("Entrada na curva", 1, {
        exec: "Iniciar curva coordenada com referência no solo. Monitorar nariz, velocidade e altitude.",
        params: [bankRange(10, 35, "medium"), headingParam(10, "medium")],
      }),
      marked("Curva estabilizada (30°)", 2, {
        exec: "Manter ~30° de inclinação. Ajustar potência levemente se necessário para manter altitude.",
        params: [
          bankRange(25, 35, "high"),
          headingParam(5),
          altitudeVariation(),
          iasRange(55, 85, "high"),
          rpmRange(4800, 5400, "low"),
        ],
      }),
      marked("Saída da curva", 3, {
        exec: "Antecipar saída, nivelar asas e retomar voo reto e nivelado.",
        params: [
          bankRange(0, 15, "medium"),
          headingParam(5, "high"),
          altitudeVariation("medium"),
        ],
      }),
    ],
  },

  {
    name: "Curvas - 45°",
    category: "turn",
    description: "Curva de grande inclinação (~45°). Exige ajuste de potência (+~100 RPM) para manter altitude.",
    steps: [
      marked("Checagem de área", 0, {
        exec: "Verbalizar checagem de área em voz alta.",
      }),
      marked("Entrada na curva", 1, {
        exec: "Iniciar curva coordenada com referência no solo. Aplicar potência adicional conforme necessário.",
        params: [bankRange(15, 48, "medium"), headingParam(12, "medium")],
      }),
      marked("Curva estabilizada (45°)", 2, {
        exec: "Manter ~45° de inclinação. Adicionar cerca de 100 RPM em relação ao cruzeiro para manter altitude.",
        params: [
          bankRange(40, 50, "high"),
          headingParam(5),
          altitudeVariation(),
          iasRange(55, 90, "high"),
          rpmRange(5000, 5400, "medium"),
        ],
      }),
      marked("Saída da curva", 3, {
        exec: "Antecipar saída, reduzir potência gradualmente, nivelar asas e retomar voo reto.",
        params: [
          bankRange(0, 18, "medium"),
          headingParam(5, "high"),
          altitudeVariation("medium"),
        ],
      }),
    ],
  },

  {
    name: "Voo Planado",
    category: "other",
    description:
      "Descida sem potência buscando máxima distância horizontal. Velocidade de melhor planeio do fabricante (MC01: 72 kt).",
    steps: [
      marked("Checagem de área", 0, {
        exec: "Verbalizar checagem de área em voz alta.",
      }),
      paramEnd(
        "Configuração voo planado",
        1,
        { type: "parameter", parameter: "rpm", operator: "<=", value: 2200 },
        {
          exec: "Reduzir potência suavemente, ajustar atitude para velocidade de melhor planeio e compensar.",
          params: [iasRange(65, 90, "medium"), vsRange(-1200, 0, "low")],
        },
      ),
      marked("Planeio estabilizado", 2, {
        exec: `Manter ${BEST_GLIDE_KT} kt (±10 kt), proa constante e voo coordenado. Observar efeito de flap se aplicável.`,
        params: [
          iasRange(BEST_GLIDE_KT - 10, BEST_GLIDE_KT + 10, "high", {
            min: `Abaixo de ${BEST_GLIDE_KT - 10} kt — risco de perda de sustentação`,
            max: `Acima de ${BEST_GLIDE_KT + 10} kt — não está em melhor planeio`,
          }),
          headingParam(5),
          rpmRange(1800, 2200, "medium"),
          vsRange(-1200, -200, "medium"),
        ],
      }),
      marked("Arremetida / Recuperação", 3, {
        exec: "Aplicar potência progressivamente, nivelar atitude e retomar voo nivelado. Recolher flaps de forma gradual se estiverem estendidos.",
        params: [
          rpmRange(2000, 5400, "medium"),
          vsRange(-500, 500, "high"),
          iasRange(55, 85, "medium"),
        ],
      }),
    ],
  },

  {
    name: "Voo em Retângulo",
    category: "navigation",
    description:
      "Treino de circuito de tráfego em referência retangular no solo. Pernas paralelas, curvas de 90° e correção de deriva.",
    steps: [
      marked("Checagem de área e briefing", 0, {
        exec: "Checar área, escolher referência retangular (preferencialmente pista) e identificar direção do vento.",
      }),
      marked("Perna 1 — paralela à referência", 1, {
        exec: "Voo reto e nivelado paralelo à referência, corrigindo deriva conforme o vento.",
        params: [
          headingParam(5),
          altitudeVariation(),
          iasRange(60, 80, "medium"),
          agl1000("medium"),
        ],
      }),
      marked("Curva coordenada 90°", 2, {
        exec: "Curva coordenada de 90° ao final da perna, mantendo altitude.",
        params: [
          bankRange(10, 35, "high"),
          altitudeVariation(),
          headingParam(8),
        ],
      }),
      marked("Perna 2 — perpendicular", 3, {
        exec: "Manter voo reto e nivelado, corrigindo deriva. Identificar a perna conforme o vento.",
        params: [headingParam(5), altitudeVariation(), iasRange(60, 80, "medium")],
      }),
      marked("Curva coordenada 90°", 4, {
        exec: "Segunda curva de 90° para fechar o retângulo.",
        params: [bankRange(10, 35, "high"), altitudeVariation(), headingParam(8)],
      }),
      marked("Perna 3 — paralela oposta", 5, {
        exec: "Manter paralelismo com a referência e altitude constante.",
        params: [headingParam(5), altitudeVariation(), iasRange(60, 80, "medium")],
      }),
      marked("Curva coordenada 90° e fechamento", 6, {
        exec: "Última curva de 90° para completar o retângulo, nivelando asas sobre a referência.",
        params: [
          bankRange(10, 35, "high"),
          altitudeVariation(),
          headingParam(5, "high"),
        ],
      }),
    ],
  },

  {
    name: "S Sobre Estradas",
    category: "navigation",
    description:
      "Curvas alternadas de 180° sobre linha reta no solo (estrada/rodovia). Manter 1000 ft AGL e cruzar perpendicularmente.",
    steps: [
      marked("Checagem de área", 0, {
        exec: "Checar área antes de cada curva. Escolher trecho reto de estrada, rodovia ou ferrovia.",
      }),
      marked("Configuração e aproximação", 1, {
        exec: "Manter 1000 ft AGL, aproximar perpendicular à referência com asas niveladas.",
        params: [
          agl1000(),
          headingParam(5),
          iasRange(60, 80, "medium"),
        ],
      }),
      marked("Primeira curva 180°", 2, {
        exec: "Após cruzar a referência pela cauda, iniciar curva coordenada de 180°. Ajustar inclinação conforme o vento.",
        params: [
          bankRange(20, 45, "high"),
          altitudeVariation(),
          iasRange(58, 82, "medium"),
        ],
      }),
      marked("Cruzamento perpendicular", 3, {
        exec: "Cruzar a estrada novamente com asas niveladas, perpendicular à referência.",
        params: [
          bankRange(0, 10, "medium"),
          headingParam(5, "high"),
          altitudeVariation(),
        ],
      }),
      marked("Segunda curva 180° (lado oposto)", 4, {
        exec: "Repetir curva coordenada de 180° para o lado oposto, mantendo simetria do traçado em S.",
        params: [
          bankRange(20, 45, "high"),
          altitudeVariation(),
          iasRange(58, 82, "medium"),
          rpmRange(4800, 5400, "low"),
        ],
      }),
    ],
  },

  {
    name: "8 ao Redor de Marcos",
    category: "navigation",
    description:
      "Curvas coordenadas em torno de dois marcos (~1500 m), 1000 ft AGL, compensando vento e mantendo raio constante.",
    steps: [
      marked("Checagem de área", 0, {
        exec: "Checar área. Escolher dois marcos visíveis separados por aproximadamente 1500 metros.",
      }),
      marked("Posicionamento no ponto médio", 1, {
        exec: "Posicionar no ponto médio entre os marcos, 1000 ft AGL, pronto para iniciar a curva.",
        params: [agl1000(), headingParam(8, "medium"), iasRange(60, 80, "medium")],
      }),
      marked("Curva ao redor do marco 1", 2, {
        exec: "Curvar ao redor do primeiro marco ajustando inclinação pelo vento. Usar pontos auxiliares para raio constante.",
        params: [
          bankRange(15, 45, "high"),
          altitudeVariation(),
          headingParam(5),
          iasRange(58, 82, "medium"),
          rpmRange(4900, 5400, "low"),
        ],
      }),
      marked("Transição entre marcos", 3, {
        exec: "Transicionar para o segundo marco mantendo altitude e planejando o raio da próxima curva.",
        params: [
          headingParam(8),
          altitudeVariation(),
          iasRange(60, 80, "medium"),
        ],
      }),
      marked("Curva ao redor do marco 2", 4, {
        exec: "Curvar ao redor do segundo marco. Adicionar ~100 RPM nas curvas de maior inclinação se necessário.",
        params: [
          bankRange(15, 45, "high"),
          altitudeVariation(),
          headingParam(5),
          iasRange(58, 82, "medium"),
          rpmRange(5000, 5400, "medium"),
        ],
      }),
      marked("Fechamento do 8", 5, {
        exec: "Completar o traçado cruzando o eixo com asas niveladas, retomando voo reto.",
        params: [
          bankRange(0, 12, "medium"),
          headingParam(5, "high"),
          altitudeVariation("medium"),
        ],
      }),
    ],
  },

  {
    name: "VMC e CAP",
    category: "stall",
    description:
      "Coordenação potência/atitude/velocidade (CAP) seguida de Velocidade Mínima de Controle (VMC). Desenvolve controle próximo aos limites aerodinâmicos.",
    steps: [
      marked("Checagem de área", 0, {
        exec: "Verbalizar checagem de área em voz alta antes de iniciar as coordenações.",
      }),
      marked("CAP — Coordenação potência/atitude/velocidade", 1, {
        exec: "Alternar potência, atitude e velocidade de forma coordenada, mantendo referência no horizonte sem ganhar ou perder altitude.",
        params: [
          headingParam(5),
          altitudeVariation(),
          iasRange(55, 85, "high", { max: "Variação de velocidade acima de ±10 kt" }),
          vsRange(-300, 300, "medium"),
          rpmRange(3600, 5200, "low"),
        ],
      }),
      marked("Checagem de área (pré-VMC)", 2, {
        exec: "Nova checagem de área antes de entrar em VMC.",
      }),
      paramEnd(
        "Entrada em VMC",
        3,
        { type: "parameter", parameter: "ias", operator: "<=", value: 58 },
        {
          exec: "Reduzir potência gradualmente, aumentar atitude para manter altitude, aproximando-se da velocidade mínima de controle sem entrar em estol.",
          params: [
            rpmRange(2000, 4000, "medium"),
            iasRange(50, 75, "high"),
            altitudeVariation("medium"),
          ],
        },
      ),
      marked("VMC estabilizado", 4, {
        exec: `Manter voo em baixa velocidade e alto ângulo de ataque (${BEST_GLIDE_KT} ±10 kt). Identificar área de pouso e verbalizar checklists de reacionamento e corte.`,
        params: [
          iasRange(BEST_GLIDE_KT - 10, BEST_GLIDE_KT + 10, "critical", {
            min: "Velocidade muito baixa — risco de estol",
            max: "Velocidade acima do limite de VMC",
          }),
          headingParam(5),
          altitudeVariation(),
          rpmRange(1800, 3500, "medium"),
        ],
      }),
      marked("Recuperação VMC", 5, {
        exec: "Reduzir ângulo de ataque, aplicar potência suavemente, nivelar asas e estabelecer subida.",
        params: [
          vsRange(-500, 600, "high"),
          rpmRange(2000, 5400, "medium"),
          iasRange(50, 80, "medium"),
          bankRange(0, 15, "medium"),
        ],
      }),
    ],
  },

  {
    name: "Glissadas",
    category: "other",
    description:
      "Aumento de razão de descida sem incremento significativo de velocidade. Glissada frontal e lateral em voo planado.",
    steps: [
      marked("Checagem de área", 0, {
        exec: "Verbalizar checagem de área em voz alta.",
      }),
      paramEnd(
        "Configuração voo planado",
        1,
        { type: "parameter", parameter: "rpm", operator: "<=", value: 2200 },
        {
          exec: "Reduzir potência, estabelecer velocidade de melhor planeio e compensar antes da glissada.",
          params: [
            iasRange(BEST_GLIDE_KT - 5, BEST_GLIDE_KT + 10, "medium"),
            rpmRange(1800, 2200, "medium"),
          ],
        },
      ),
      marked("Glissada", 2, {
        exec: "Aplicar comandos cruzados (aileron + leme) para aumentar razão de descida. Manter velocidade e proa. Coordenar aileron e pedal.",
        params: [
          iasRange(BEST_GLIDE_KT - 5, BEST_GLIDE_KT + 10, "high", {
            min: "Velocidade caindo demais na glissada",
            max: "Velocidade aumentando na glissada",
          }),
          headingParam(5, "high"),
          bankRange(5, 25, "medium"),
          vsRange(-1500, -400, "high"),
        ],
      }),
      marked("Recuperação", 3, {
        exec: "Neutralizar comandos cruzados de forma suave, aplicar potência e retomar voo coordenado.",
        params: [
          bankRange(0, 12, "medium"),
          vsRange(-400, 400, "high"),
          rpmRange(2000, 5400, "medium"),
          iasRange(55, 85, "medium"),
        ],
      }),
    ],
  },
];

// ---------- DB operations ----------

async function findTemplateByName(name) {
  const res = await db.listDocuments(DATABASE_ID, TEMPLATES_COL, [
    Query.equal("name", [name]),
    Query.limit(1),
  ]);
  return res.documents[0] ?? null;
}

async function createTemplate(maneuver) {
  const now = new Date().toISOString();
  return db.createDocument(DATABASE_ID, TEMPLATES_COL, ID.unique(), {
    name: maneuver.name,
    category: maneuver.category,
    aircraft_model_id: AIRCRAFT_MODEL_ID,
    description: maneuver.description,
    is_active: true,
    created_at: now,
    updated_at: now,
  });
}

async function createStep(templateId, step) {
  const now = new Date().toISOString();
  return db.createDocument(DATABASE_ID, STEPS_COL, ID.unique(), {
    template_id: templateId,
    order_index: step.order_index,
    name: step.name,
    description: step.description,
    expected_execution_text: step.expected_execution_text,
    end_condition_json: step.end_condition ? JSON.stringify(step.end_condition) : null,
    parameters_json: step.parameters?.length ? JSON.stringify(step.parameters) : null,
    created_at: now,
    updated_at: now,
  });
}

async function main() {
  console.log("=== Seed Flight Review Maneuvers (MC01) ===\n");

  let created = 0;
  let skipped = 0;

  for (const maneuver of MANEUVERS) {
    const existing = await findTemplateByName(maneuver.name);
    if (existing) {
      console.log(`• SKIP (já existe): ${maneuver.name}`);
      skipped += 1;
      continue;
    }

    const template = await createTemplate(maneuver);
    console.log(`✓ Criada: ${maneuver.name} (${maneuver.steps.length} etapas)`);

    for (const step of maneuver.steps) {
      await createStep(template.$id, step);
      console.log(`    · etapa ${step.order_index}: ${step.name}`);
    }
    created += 1;
  }

  console.log(`\nConcluído. Criadas: ${created}. Ignoradas (já existiam): ${skipped}.`);
  console.log("Manobras existentes não foram alteradas.");
}

main().catch((err) => {
  console.error("Seed failed:", err?.message ?? err);
  process.exit(1);
});
