export type CrmStatus =
  | "novo_lead"
  | "aguardando_qualificacao"
  | "aguardando_proposta"
  | "proposta_enviada"
  | "registro_enviado"
  | "registro_preenchido"
  | "aguardando_transferencia"
  | "matricula_enviada"
  | "aguardando_assinatura_pagamento"
  | "ground_agendado"
  | "cadastro_anac"
  | "aluno_pronto"
  | "lead_perdido";

export const CRM_STATUSES: CrmStatus[] = [
  "novo_lead",
  "aguardando_qualificacao",
  "aguardando_proposta",
  "proposta_enviada",
  "registro_enviado",
  "registro_preenchido",
  "aguardando_transferencia",
  "matricula_enviada",
  "aguardando_assinatura_pagamento",
  "ground_agendado",
  "cadastro_anac",
  "aluno_pronto",
  "lead_perdido",
];

export const CRM_STATUS_LABELS: Record<CrmStatus, string> = {
  novo_lead:                       "Novo Lead",
  aguardando_qualificacao:         "Aguardando Qualificação",
  aguardando_proposta:             "Aguardando Proposta",
  proposta_enviada:                "Proposta Enviada",
  registro_enviado:                "Enviar Registro",
  registro_preenchido:             "Registro Preenchido",
  aguardando_transferencia:        "Aguardando Transferência",
  matricula_enviada:               "Enviar Matrícula",
  aguardando_assinatura_pagamento: "Aguardando Assinatura e Pagamento",
  ground_agendado:                 "Ground Agendado",
  cadastro_anac:                   "Cadastro na ANAC",
  aluno_pronto:                    "Em curso",
  lead_perdido:                    "Lead Perdido",
};

// Pill colors for Kanban column headers (Notion-style)
export const CRM_STATUS_PILL: Record<CrmStatus, { bg: string; text: string }> = {
  novo_lead:                       { bg: "bg-slate-700",       text: "text-slate-200" },
  aguardando_qualificacao:         { bg: "bg-sky-800",         text: "text-sky-100" },
  aguardando_proposta:             { bg: "bg-violet-800",      text: "text-violet-100" },
  proposta_enviada:                { bg: "bg-amber-700",       text: "text-amber-100" },
  registro_enviado:                { bg: "bg-orange-700",      text: "text-orange-100" },
  registro_preenchido:             { bg: "bg-teal-700",        text: "text-teal-100" },
  aguardando_transferencia:        { bg: "bg-indigo-700",      text: "text-indigo-100" },
  matricula_enviada:               { bg: "bg-blue-700",        text: "text-blue-100" },
  aguardando_assinatura_pagamento: { bg: "bg-rose-800",        text: "text-rose-100" },
  ground_agendado:                 { bg: "bg-cyan-700",        text: "text-cyan-100" },
  cadastro_anac:                   { bg: "bg-lime-700",        text: "text-lime-100" },
  aluno_pronto:                    { bg: "bg-emerald-700",     text: "text-emerald-100" },
  lead_perdido:                    { bg: "bg-zinc-700",        text: "text-zinc-300" },
};

// Badge colors for cards / detail modals
export const CRM_STATUS_BADGE_COLORS: Record<CrmStatus, string> = {
  novo_lead:                       "bg-slate-700/80 text-slate-300",
  aguardando_qualificacao:         "bg-sky-900 text-sky-300",
  aguardando_proposta:             "bg-violet-900 text-violet-300",
  proposta_enviada:                "bg-amber-900 text-amber-300",
  registro_enviado:                "bg-orange-900 text-orange-300",
  registro_preenchido:             "bg-teal-900 text-teal-300",
  aguardando_transferencia:        "bg-indigo-900 text-indigo-300",
  matricula_enviada:               "bg-blue-900 text-blue-300",
  aguardando_assinatura_pagamento: "bg-rose-900 text-rose-300",
  ground_agendado:                 "bg-cyan-900 text-cyan-300",
  cadastro_anac:                   "bg-lime-900 text-lime-300",
  aluno_pronto:                    "bg-emerald-900 text-emerald-300",
  lead_perdido:                    "bg-zinc-800 text-zinc-400",
};

// Subtle tinted backgrounds for kanban column areas (Notion-style)
export const CRM_STATUS_COLUMN_BG: Record<CrmStatus, string> = {
  novo_lead:                       "bg-slate-500/8",
  aguardando_qualificacao:         "bg-sky-500/8",
  aguardando_proposta:             "bg-violet-500/8",
  proposta_enviada:                "bg-amber-500/8",
  registro_enviado:                "bg-orange-500/8",
  registro_preenchido:             "bg-teal-500/8",
  aguardando_transferencia:        "bg-indigo-500/8",
  matricula_enviada:               "bg-blue-500/8",
  aguardando_assinatura_pagamento: "bg-rose-500/8",
  ground_agendado:                 "bg-cyan-500/8",
  cadastro_anac:                   "bg-lime-500/8",
  aluno_pronto:                    "bg-emerald-500/8",
  lead_perdido:                    "bg-zinc-500/8",
};

export type AvailableDay = "seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom";
export type AvailablePeriod = "manha" | "tarde" | "ambos";

export const AVAILABLE_DAY_LABELS: Record<AvailableDay, string> = {
  seg: "Seg", ter: "Ter", qua: "Qua", qui: "Qui", sex: "Sex", sab: "Sáb", dom: "Dom",
};

export type CrmStatusFollowupTemplate = {
  id: string;
  title: string;
  days: number;
};

export type CrmStatusSetting = {
  id: string;
  status: CrmStatus;
  followups: CrmStatusFollowupTemplate[];
  expirationDays: number | null;
};

export type CrmLeadFollowup = {
  id: string;
  status: CrmStatus;
  title: string;
  triggeredAt: string;
  completedAt: string | null;
  /** FUP criado manualmente no lead (preservado ao mudar de status). */
  manual?: boolean;
};

export type CrmLead = {
  id: string;
  userId: string | null;
  referrerUserId: string | null;
  referralSource: string | null;
  name: string;
  email: string;
  phone: string;
  crmStatus: CrmStatus;
  // Qualificação
  desiredCourse: string | null;
  desiredHours: number | null;
  weightKg: number | null;
  heightCm: number | null;
  availableDays: AvailableDay[];
  availablePeriod: AvailablePeriod | null;
  startDate: string | null;
  weeklyHours: number | null;
  notes: string | null;
  // Novos campos do form de qualificação
  anacCode: string | null;          // código ANAC ou "" se não tem
  birthDate: string | null;         // data de nascimento
  cpf: string | null;
  sagaAnacJson: string | null;
  theoreticalExamDone: boolean | null; // PPL: já fez banca teórica?
  theoreticalStudyStatus: string | null;
  transferSchool: string | null;       // escola de origem se for transferência
  // Proposta aceita
  acceptedProposalId: string | null;
  // Controle
  qualToken: string | null;
  qualFilledAt: string | null;
  statusEnteredAt: string | null;
  funnelEnteredAt: string | null;
  followups: CrmLeadFollowup[];
  payInPerson: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CrmLeadInput = {
  userId?: string | null;
  name: string;
  email: string;
  phone: string;
  crmStatus?: CrmStatus;
  statusEnteredAt?: string | null;
  funnelEnteredAt?: string | null;
  followups?: CrmLeadFollowup[];
  payInPerson?: boolean;
};

export type CrmLeadQualInput = {
  referrerUserId?: string | null;
  referralSource?: string | null;
  desiredCourse?: string | null;
  desiredHours?: number | null;
  weightKg?: number | null;
  heightCm?: number | null;
  availableDays?: AvailableDay[];
  availablePeriod?: AvailablePeriod | null;
  startDate?: string | null;
  weeklyHours?: number | null;
  notes?: string | null;
  anacCode?: string | null;
  birthDate?: string | null;
  cpf?: string | null;
  theoreticalExamDone?: boolean | null;
  theoreticalStudyStatus?: string | null;
  transferSchool?: string | null;
};
