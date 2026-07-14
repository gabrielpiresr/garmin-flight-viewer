export type FlightEvaluationCriterionKey = "instruction" | "safety" | "learning";

export type FlightEvaluationFieldConfig = {
  title: string;
  description: string;
};

export type FlightEvaluationRules = {
  enabled: boolean;
  criteria: Record<FlightEvaluationCriterionKey, FlightEvaluationFieldConfig>;
  comment: FlightEvaluationFieldConfig;
  /** Texto opcional de aviso/disclaimer exibido no modal do aluno. */
  disclaimer: string;
};

export type FlightEvaluationScores = Record<FlightEvaluationCriterionKey, number>;

export type FlightEvaluation = {
  id: string;
  flightId: string;
  studentUserId: string;
  instructorUserId: string | null;
  schoolId: string;
  scores: FlightEvaluationScores;
  average: number;
  comment: string;
  criteriaSnapshotJson: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FlightEvaluationDismissal = {
  id: string;
  flightId: string;
  studentUserId: string;
  instructorUserId: string | null;
  schoolId: string;
  dismissedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type FlightEvaluationInput = {
  flightId: string;
  instructorUserId?: string | null;
  scores: FlightEvaluationScores;
  comment?: string;
};

export const FLIGHT_EVALUATION_CRITERION_KEYS: FlightEvaluationCriterionKey[] = [
  "instruction",
  "safety",
  "learning",
];

export const DEFAULT_FLIGHT_EVALUATION_RULES: FlightEvaluationRules = {
  enabled: false,
  criteria: {
    instruction: {
      title: "Qualidade da instrução",
      description: "O instrutor explicou, demonstrou e corrigiu de forma clara?",
    },
    safety: {
      title: "Segurança e confiança",
      description: "Você se sentiu seguro, respeitado e confortável durante o voo?",
    },
    learning: {
      title: "Aproveitamento do voo",
      description: "O voo contribuiu para seu aprendizado e evolução?",
    },
  },
  comment: {
    title: "Sua experiência",
    description: "Conte como foi sua experiência ou deixe alguma sugestão para os próximos voos.",
  },
  disclaimer: "",
};

export function clampFlightEvaluationScore(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 5) return null;
  return rounded;
}

export function averageFlightEvaluationScores(scores: FlightEvaluationScores): number {
  const values = FLIGHT_EVALUATION_CRITERION_KEYS.map((key) => scores[key]);
  const total = values.reduce((acc, value) => acc + value, 0);
  return Math.round((total / values.length) * 10) / 10;
}

export function normalizeFlightEvaluationRules(input: unknown): FlightEvaluationRules {
  const raw = input && typeof input === "object" ? (input as Partial<FlightEvaluationRules>) : {};
  const criteriaRaw =
    raw.criteria && typeof raw.criteria === "object"
      ? (raw.criteria as Partial<Record<FlightEvaluationCriterionKey, Partial<FlightEvaluationFieldConfig>>>)
      : {};
  const commentRaw =
    raw.comment && typeof raw.comment === "object"
      ? (raw.comment as Partial<FlightEvaluationFieldConfig>)
      : {};

  return {
    enabled: Boolean(raw.enabled),
    criteria: {
      instruction: {
        title: String(criteriaRaw.instruction?.title ?? DEFAULT_FLIGHT_EVALUATION_RULES.criteria.instruction.title).slice(0, 120),
        description: String(
          criteriaRaw.instruction?.description ?? DEFAULT_FLIGHT_EVALUATION_RULES.criteria.instruction.description,
        ).slice(0, 500),
      },
      safety: {
        title: String(criteriaRaw.safety?.title ?? DEFAULT_FLIGHT_EVALUATION_RULES.criteria.safety.title).slice(0, 120),
        description: String(
          criteriaRaw.safety?.description ?? DEFAULT_FLIGHT_EVALUATION_RULES.criteria.safety.description,
        ).slice(0, 500),
      },
      learning: {
        title: String(criteriaRaw.learning?.title ?? DEFAULT_FLIGHT_EVALUATION_RULES.criteria.learning.title).slice(0, 120),
        description: String(
          criteriaRaw.learning?.description ?? DEFAULT_FLIGHT_EVALUATION_RULES.criteria.learning.description,
        ).slice(0, 500),
      },
    },
    comment: {
      title: String(commentRaw.title ?? DEFAULT_FLIGHT_EVALUATION_RULES.comment.title).slice(0, 120),
      description: String(commentRaw.description ?? DEFAULT_FLIGHT_EVALUATION_RULES.comment.description).slice(0, 500),
    },
    disclaimer: String(raw.disclaimer ?? DEFAULT_FLIGHT_EVALUATION_RULES.disclaimer).slice(0, 2000),
  };
}
