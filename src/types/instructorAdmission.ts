// ============================================================
// Admissão e gestão de instrutores
// ============================================================

import type { AvailabilityValue } from "./availability";

export type InstructorAdmissionFieldType =
  | "text"
  | "email"
  | "phone"
  | "number"
  | "date"
  | "textarea"
  | "select"
  | "multiselect"
  | "availability"
  | "checkbox"
  | "attachment"
  | "hidden";

export const FIELD_TYPE_LABELS: Record<InstructorAdmissionFieldType, string> = {
  text: "Texto curto",
  email: "E-mail",
  phone: "Telefone",
  number: "Número",
  date: "Data",
  textarea: "Texto longo",
  select: "Lista de opções",
  multiselect: "Múltipla seleção",
  availability: "Disponibilidade",
  checkbox: "Sim/Não",
  attachment: "Anexo (arquivo)",
  hidden: "Oculto (não aparece ao candidato)",
};

export type InstructorAdmissionScoreCompareOp = "eq" | "gt" | "lt";
export type InstructorAdmissionScoreMatchMode = "all" | "any";
export type InstructorAdmissionScoreAvailabilityAspect = "days" | "period" | "preset";

export const INSTRUCTOR_ADMISSION_SCORE_COMPARE_LABELS: Record<
  InstructorAdmissionScoreCompareOp,
  string
> = {
  eq: "Igual a",
  gt: "Maior que",
  lt: "Menor que",
};

export const INSTRUCTOR_ADMISSION_SCORE_MATCH_LABELS: Record<
  InstructorAdmissionScoreMatchMode,
  string
> = {
  all: "Tem todas as opções selecionadas",
  any: "Tem pelo menos uma das opções",
};

/** Regra de pontuação baseada nas respostas do formulário. */
export type InstructorAdmissionScoreRule = {
  id: string;
  fieldId: string;
  /** Valor exato, limiar numérico, opções/dias separados por vírgula, período ou preset. */
  answerValue: string;
  /** Comparador para campos numéricos. */
  compareOp?: InstructorAdmissionScoreCompareOp;
  /** Para multiselect / dias de disponibilidade: exige todos ou qualquer um. */
  matchMode?: InstructorAdmissionScoreMatchMode;
  /** Qual aspecto da disponibilidade pontuar. */
  availabilityAspect?: InstructorAdmissionScoreAvailabilityAspect;
  points: number;
};

export type InstructorAdmissionScoreBreakdownItem = {
  ruleId: string;
  fieldId: string;
  answerValue: string;
  label: string;
  points: number;
};

export type InstructorAdmissionScoreResult = {
  total: number;
  breakdown: InstructorAdmissionScoreBreakdownItem[];
};

export type InstructorAdmissionSystemProperty =
  | "fullName"
  | "nickname"
  | "email"
  | "phone"
  | "cpf"
  | "anacCode"
  | "birthDate";

export const INSTRUCTOR_ADMISSION_SYSTEM_PROPERTIES: InstructorAdmissionSystemProperty[] = [
  "fullName",
  "nickname",
  "email",
  "phone",
  "cpf",
  "anacCode",
  "birthDate",
];

export const SYSTEM_PROPERTY_LABELS: Record<InstructorAdmissionSystemProperty, string> = {
  fullName: "Nome completo",
  nickname: "Apelido / nickname",
  email: "E-mail",
  phone: "Telefone",
  cpf: "CPF",
  anacCode: "Código ANAC",
  birthDate: "Data de nascimento",
};

export type InstructorAdmissionFormField = {
  id: string;
  label: string;
  type: InstructorAdmissionFieldType;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: string[];
  order: number;
  systemProperty?: InstructorAdmissionSystemProperty;
  /**
   * Parâmetro de URL para pré-preencher o campo (ex.: ?campanha=instagram).
   * Em campos ocultos, o valor vem só da URL/default — não aparece ao candidato.
   */
  queryKey?: string;
  /** Valor padrão quando não houver query param (útil em campos ocultos). */
  defaultValue?: string;
};

export type InstructorAdmissionForm = {
  id: string;
  title: string;
  description: string;
  fields: InstructorAdmissionFormField[];
  scoreRules: InstructorAdmissionScoreRule[];
  published: boolean;
  updatedAt: string;
};

export type InstructorAdmissionFormInput = {
  title: string;
  description: string;
  fields: InstructorAdmissionFormField[];
  scoreRules: InstructorAdmissionScoreRule[];
  published: boolean;
};

export type InstructorAdmissionStage = {
  id: string;
  name: string;
  color: string;
  description: string;
  order: number;
  isDefault: boolean;
  archived: boolean;
};

export type InstructorAdmissionStageInput = {
  name: string;
  color: string;
  description: string;
  order: number;
  isDefault: boolean;
  archived: boolean;
};

export type InstructorAdmissionFileValue = {
  fileId: string;
  fileName: string;
  bucketId: string;
};

export type InstructorAdmissionFieldValue =
  | string
  | number
  | boolean
  | string[]
  | InstructorAdmissionFileValue
  | AvailabilityValue;

export type InstructorAdmissionCandidateSource = "manual" | "form" | "instructor";

export type InstructorAdmissionCandidate = {
  id: string;
  stageId: string;
  userId?: string;
  nickname?: string;
  name: string;
  email: string;
  phone?: string;
  notes?: string;
  /** Origem de campanha/atribuição (ex.: ?referral=instagram). Não aparece no formulário. */
  referralSource?: string | null;
  responses: Record<string, InstructorAdmissionFieldValue>;
  source: InstructorAdmissionCandidateSource;
  registrationToken?: string;
  formFilledAt?: string;
  statusEnteredAt: string;
  createdAt: string;
  updatedAt: string;
};

export type InstructorAdmissionCandidateInput = {
  stageId: string;
  userId?: string;
  nickname?: string;
  name: string;
  email: string;
  phone?: string;
  notes?: string;
  referralSource?: string | null;
  responses?: Record<string, InstructorAdmissionFieldValue>;
  source?: InstructorAdmissionCandidateSource;
  registrationToken?: string;
  formFilledAt?: string;
};

export type InstructorAdmissionComment = {
  id: string;
  candidateId: string;
  authorName: string;
  text: string;
  createdAt: string;
};

export type InstructorHoursMetrics = {
  totalHours: number;
  monthHours: number;
};

export const CANONICAL_STAGE_NAMES = [
  "Triagem",
  "Entrevista técnica",
  "Teste prático",
  "Formação interna",
  "Nível 1 — Rampagem",
  "Nível 2 — Operacional",
  "Nível 3 — Pleno",
  "Nível 4 — Líder/Padronizador",
] as const;

export const DEFAULT_STAGES: InstructorAdmissionStageInput[] = [
  {
    name: "Triagem",
    color: "#38bdf8",
    description: "Análise inicial do perfil, documentação e fit cultural.",
    order: 10,
    isDefault: true,
    archived: false,
  },
  {
    name: "Entrevista técnica",
    color: "#a78bfa",
    description: "Entrevista com a equipe pedagógica e avaliação técnica do candidato.",
    order: 20,
    isDefault: false,
    archived: false,
  },
  {
    name: "Teste prático",
    color: "#f59e0b",
    description: "Avaliação prática em voo e checagem de padrões operacionais.",
    order: 30,
    isDefault: false,
    archived: false,
  },
  {
    name: "Formação interna",
    color: "#34d399",
    description: "Treinamento interno, alinhamento de processos e preparação para atuação.",
    order: 40,
    isDefault: false,
    archived: false,
  },
  {
    name: "Nível 1 — Rampagem",
    color: "#60a5fa",
    description:
      "Instrutor liberado para iniciar instrução, mas com carga baixa e acompanhamento próximo. Deve atuar em voos mais simples e com alunos iniciais.\nPrimeiras 60 horas na escola · R$85 por hora de voo",
    order: 50,
    isDefault: false,
    archived: false,
  },
  {
    name: "Nível 2 — Operacional",
    color: "#2dd4bf",
    description:
      "Instrutor apto para entrar na escala regular, com mais autonomia e possibilidade de acompanhar alunos em diferentes fases.\nApós 60 horas na escola · R$100 por hora de voo",
    order: 60,
    isDefault: false,
    archived: false,
  },
  {
    name: "Nível 3 — Pleno",
    color: "#22c55e",
    description:
      "Instrutor confiável, consistente e bem alinhado ao padrão da escola. Pode assumir maior carga, alunos em fases mais avançadas e apoiar alunos com dificuldade.\nPelo menos 300 horas de instrução na escola, avaliado pela performance · R$120 por hora de voo",
    order: 70,
    isDefault: false,
    archived: false,
  },
  {
    name: "Nível 4 — Líder/Padronizador",
    color: "#eab308",
    description:
      "Instrutor referência técnica e operacional. Pode apoiar a formação de novos instrutores, revisar padrões, ajudar em avaliações e atuar junto à coordenação.",
    order: 80,
    isDefault: false,
    archived: false,
  },
];

export function stagePillStyle(color: string): { bg: string; text: string } {
  return {
    bg: `${color}22`,
    text: color,
  };
}

export function stageColumnBg(color: string): string {
  return `${color}0d`;
}

export function candidateDisplayName(candidate: InstructorAdmissionCandidate): string {
  return candidate.nickname?.trim() || candidate.name;
}

export function suggestStageNameForInstructionHours(totalHours: number): string {
  if (totalHours >= 300) return "Nível 3 — Pleno";
  if (totalHours >= 60) return "Nível 2 — Operacional";
  return "Nível 1 — Rampagem";
}
