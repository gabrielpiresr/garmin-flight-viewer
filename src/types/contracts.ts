export type ContractTemplate = {
  id: string;
  schoolId: string;
  name: string;
  contentJson: string;
  customVariables: CustomVariable[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type CustomVariable = {
  name: string;
  label: string;
  description?: string;
};

export type ContractStatus =
  | "pending"
  | "signed_recipient"
  | "signed_admin"
  | "signed_both"
  | "cancelled";

export type Contract = {
  id: string;
  schoolId: string;
  templateId: string;
  templateName: string;
  recipientUserId: string;
  recipientName: string;
  contentResolvedJson: string;
  customVarValues: Record<string, string>;
  status: ContractStatus;
  createdBy: string;
  createdAt: string;
  signedByRecipientAt: string | null;
  signedByAdminAt: string | null;
  emailSentAt: string | null;
};

export type ContractSignature = {
  id: string;
  contractId: string;
  signerUserId: string;
  signerRole: "aluno" | "instrutor" | "admin";
  signedAt: string;
  schoolId: string;
  createdAt: string;
};

export type ContractProfileData = {
  fullName: string;
  cpf: string;
  phone: string;
  birthDate: string;
  email: string;
  rg: string;
  rgOrgaoExpedidor: string;
  endereco: string;
  nacionalidade: string;
  estadoCivil: string;
  anacCode: string;
};

export const SYSTEM_VARIABLES = [
  { key: "{{nome_completo}}", label: "Nome Completo" },
  { key: "{{cpf}}", label: "CPF" },
  { key: "{{rg}}", label: "RG" },
  { key: "{{rg_orgao_expedidor}}", label: "Órgão Expedidor do RG" },
  { key: "{{data_nascimento}}", label: "Data de Nascimento" },
  { key: "{{endereco}}", label: "Endereço" },
  { key: "{{nacionalidade}}", label: "Nacionalidade" },
  { key: "{{estado_civil}}", label: "Estado Civil" },
  { key: "{{email}}", label: "E-mail" },
  { key: "{{telefone}}", label: "Telefone" },
  { key: "{{codigo_anac}}", label: "Código ANAC" },
  { key: "{{data_hoje}}", label: "Data de Hoje" },
  { key: "{{assinatura_aluno}}", label: "Assinatura do Aluno/Instrutor" },
  { key: "{{assinatura_admin}}", label: "Assinatura da Escola" },
] as const;

export type SystemVariableKey = (typeof SYSTEM_VARIABLES)[number]["key"];

export function resolveSystemVars(contentJson: string, profile: ContractProfileData): string {
  const today = new Date().toLocaleDateString("pt-BR");
  const map: Record<string, string> = {
    "{{nome_completo}}": profile.fullName,
    "{{cpf}}": profile.cpf,
    "{{rg}}": profile.rg,
    "{{rg_orgao_expedidor}}": profile.rgOrgaoExpedidor,
    "{{data_nascimento}}": profile.birthDate
      ? new Date(profile.birthDate + "T12:00:00").toLocaleDateString("pt-BR")
      : "",
    "{{endereco}}": profile.endereco,
    "{{nacionalidade}}": profile.nacionalidade,
    "{{estado_civil}}": profile.estadoCivil,
    "{{email}}": profile.email,
    "{{telefone}}": profile.phone,
    "{{codigo_anac}}": profile.anacCode,
    "{{data_hoje}}": today,
  };
  let result = contentJson;
  for (const [key, value] of Object.entries(map)) {
    result = result.replaceAll(key, value || "");
  }
  return result;
}

export function resolveCustomVars(contentJson: string, values: Record<string, string>): string {
  let result = contentJson;
  for (const [name, value] of Object.entries(values)) {
    result = result.replaceAll(`{{${name}}}`, value || "");
  }
  return result;
}

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  pending: "Pendente",
  signed_recipient: "Assinado pelo aluno",
  signed_admin: "Assinado pela escola",
  signed_both: "Assinado por ambos",
  cancelled: "Cancelado",
};

export const CONTRACT_STATUS_COLORS: Record<ContractStatus, string> = {
  pending: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  signed_recipient: "text-sky-400 bg-sky-500/10 border-sky-500/30",
  signed_admin: "text-purple-400 bg-purple-500/10 border-purple-500/30",
  signed_both: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  cancelled: "text-slate-400 bg-slate-700/40 border-slate-600/30",
};
