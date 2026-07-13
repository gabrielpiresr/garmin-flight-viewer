// ============================================================
// Admissão e gestão de instrutores
// ============================================================

export type InstructorAdmissionFieldType =
  | "text"
  | "email"
  | "phone"
  | "number"
  | "date"
  | "textarea"
  | "select"
  | "checkbox"
  | "attachment";

export const FIELD_TYPE_LABELS: Record<InstructorAdmissionFieldType, string> = {
  text: "Texto curto",
  email: "E-mail",
  phone: "Telefone",
  number: "Número",
  date: "Data",
  textarea: "Texto longo",
  select: "Lista de opções",
  checkbox: "Sim/Não",
  attachment: "Anexo (arquivo)",
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
};

export type InstructorAdmissionForm = {
  id: string;
  title: string;
  description: string;
  fields: InstructorAdmissionFormField[];
  published: boolean;
  updatedAt: string;
};

export type InstructorAdmissionFormInput = {
  title: string;
  description: string;
  fields: InstructorAdmissionFormField[];
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
  | InstructorAdmissionFileValue;

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
