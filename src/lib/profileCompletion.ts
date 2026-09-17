import type { EnsureProfileUpdates, PilotProfile } from "./rbac";

export type ProfileCompletionFieldKey =
  | "fullName"
  | "nickname"
  | "cpf"
  | "phone"
  | "birthDate"
  | "weightKg"
  | "heightCm"
  | "anacCode"
  | "rg"
  | "rgOrgaoExpedidor"
  | "rgDataEmissao"
  | "nacionalidade"
  | "estadoCivil"
  | "endereco"
  | "cep"
  | "cidade"
  | "uf"
  | "sexo"
  | "naturalidade"
  | "filiacaoPai"
  | "filiacaoMae"
  | "escolaridade"
  | "alergiasMedicamentos"
  | "emergenciaNome"
  | "emergenciaParentesco"
  | "emergenciaEndereco"
  | "emergenciaTelefone";

export type ProfileCompletionSection = {
  title: string;
  description: string;
  fields: ProfileCompletionField[];
};

export type ProfileCompletionField = {
  key: ProfileCompletionFieldKey;
  label: string;
  dbKey: keyof EnsureProfileUpdates;
  type: "text" | "date" | "select" | "number" | "textarea" | "tel" | "cpf" | "cep" | "digits";
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
};

export const BRAZIL_UFS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];

export const ESTADO_CIVIL_OPTIONS = ["Solteiro(a)", "Casado(a)", "Divorciado(a)", "Viúvo(a)", "União Estável"];

export const ESCOLARIDADE_OPTIONS = [
  "Ensino Fundamental incompleto",
  "Ensino Fundamental completo",
  "Ensino Médio incompleto",
  "Ensino Médio completo",
  "Ensino Superior incompleto",
  "Ensino Superior completo",
  "Pós-graduação",
];

export const PROFILE_COMPLETION_SECTIONS: ProfileCompletionSection[] = [
  {
    title: "Perfil",
    description: "Identificação básica usada no portal e na operação.",
    fields: [
      { key: "fullName", label: "Nome completo", dbKey: "full_name", type: "text", placeholder: "Nome e sobrenome" },
      { key: "nickname", label: "Nickname", dbKey: "nickname", type: "text", placeholder: "Como você prefere aparecer" },
      { key: "cpf", label: "CPF", dbKey: "cpf", type: "cpf", placeholder: "000.000.000-00" },
      { key: "phone", label: "Telefone / WhatsApp", dbKey: "phone", type: "tel", placeholder: "(11) 99999-9999" },
      { key: "birthDate", label: "Data de nascimento", dbKey: "birth_date", type: "date" },
      { key: "weightKg", label: "Peso (kg)", dbKey: "weight_kg", type: "number", placeholder: "75.5" },
      { key: "heightCm", label: "Altura (cm)", dbKey: "height_cm", type: "number", placeholder: "178" },
      { key: "anacCode", label: "Código ANAC", dbKey: "anac_code", type: "digits", placeholder: "Ex.: 264933" },
    ],
  },
  {
    title: "Ficha de matrícula",
    description: "Dados cadastrais da ficha, sem validar anexos.",
    fields: [
      { key: "rg", label: "RG", dbKey: "rg", type: "text", placeholder: "00.000.000-0" },
      { key: "rgOrgaoExpedidor", label: "Órgão expedidor do RG", dbKey: "rg_orgao_expedidor", type: "text", placeholder: "Ex.: SSP/SP" },
      { key: "rgDataEmissao", label: "Data de emissão do RG", dbKey: "rg_data_emissao", type: "date" },
      { key: "nacionalidade", label: "Nacionalidade", dbKey: "nacionalidade", type: "text", placeholder: "Brasileiro(a)" },
      {
        key: "estadoCivil",
        label: "Estado civil",
        dbKey: "estado_civil",
        type: "select",
        options: ESTADO_CIVIL_OPTIONS.map((value) => ({ value, label: value })),
      },
      { key: "endereco", label: "Endereço residencial", dbKey: "endereco", type: "text", placeholder: "Rua, número, complemento, bairro" },
      { key: "cep", label: "CEP", dbKey: "cep", type: "cep", placeholder: "00000-000" },
      {
        key: "uf",
        label: "UF",
        dbKey: "uf",
        type: "select",
        options: BRAZIL_UFS.map((value) => ({ value, label: value })),
      },
      { key: "cidade", label: "Cidade", dbKey: "cidade", type: "text", placeholder: "São Paulo" },
    ],
  },
  {
    title: "Complemento",
    description: "Informações pessoais e contato de emergência.",
    fields: [
      {
        key: "sexo",
        label: "Sexo",
        dbKey: "sexo",
        type: "select",
        options: [
          { value: "M", label: "Masculino" },
          { value: "F", label: "Feminino" },
        ],
      },
      { key: "naturalidade", label: "Naturalidade", dbKey: "naturalidade", type: "text", placeholder: "Cidade onde nasceu" },
      { key: "filiacaoPai", label: "Filiação - pai", dbKey: "filiacao_pai", type: "text", placeholder: "Nome completo do pai" },
      { key: "filiacaoMae", label: "Filiação - mãe", dbKey: "filiacao_mae", type: "text", placeholder: "Nome completo da mãe" },
      {
        key: "escolaridade",
        label: "Escolaridade",
        dbKey: "escolaridade",
        type: "select",
        options: ESCOLARIDADE_OPTIONS.map((value) => ({ value, label: value })),
      },
      { key: "alergiasMedicamentos", label: "Alergias a medicamentos", dbKey: "alergias_medicamentos", type: "textarea", placeholder: "Descreva ou informe Nenhuma" },
      { key: "emergenciaNome", label: "Contato de emergência", dbKey: "emergencia_nome", type: "text" },
      { key: "emergenciaParentesco", label: "Grau de parentesco", dbKey: "emergencia_parentesco", type: "text", placeholder: "Ex.: Pai, Mãe, Cônjuge" },
      { key: "emergenciaEndereco", label: "Endereço do contato", dbKey: "emergencia_endereco", type: "text" },
      { key: "emergenciaTelefone", label: "Telefone(s) de emergência", dbKey: "emergencia_telefone", type: "tel", placeholder: "(11) 99999-9999" },
    ],
  },
];

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function formatCpf(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function formatCep(value: string): string {
  const digits = onlyDigits(value).slice(0, 8);
  return digits.replace(/(\d{5})(\d{1,3})$/, "$1-$2");
}

export function formatPhone(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}

export function profileFieldValue(profile: PilotProfile, key: ProfileCompletionFieldKey): string {
  if (key === "weightKg") return profile.weightKg != null ? String(profile.weightKg) : "";
  if (key === "heightCm") return profile.heightCm != null ? String(profile.heightCm) : "";
  const value = profile[key];
  return typeof value === "string" ? value : "";
}

export function isProfileCompletionFieldFilled(profile: PilotProfile, key: ProfileCompletionFieldKey): boolean {
  if (key === "weightKg") return typeof profile.weightKg === "number" && Number.isFinite(profile.weightKg) && profile.weightKg > 0;
  if (key === "heightCm") return typeof profile.heightCm === "number" && Number.isFinite(profile.heightCm) && profile.heightCm > 0;
  if (key === "cpf") return onlyDigits(profile.cpf).length === 11;
  if (key === "cep") return onlyDigits(profile.cep).length === 8;
  if (key === "phone") return onlyDigits(profile.phone).length >= 10;
  if (key === "emergenciaTelefone") return onlyDigits(profile.emergenciaTelefone).length >= 10;
  if (key === "anacCode") return onlyDigits(profile.anacCode).length > 0;
  return profileFieldValue(profile, key).trim().length > 0;
}

export function getMissingProfileCompletionFields(profile: PilotProfile): ProfileCompletionField[] {
  return PROFILE_COMPLETION_SECTIONS.flatMap((section) => section.fields).filter(
    (field) => !isProfileCompletionFieldFilled(profile, field.key),
  );
}

export function isProfileComplete(profile: PilotProfile): boolean {
  return getMissingProfileCompletionFields(profile).length === 0;
}

export function buildProfileCompletionInitialValues(profile: PilotProfile): Record<ProfileCompletionFieldKey, string> {
  const values = {} as Record<ProfileCompletionFieldKey, string>;
  for (const field of PROFILE_COMPLETION_SECTIONS.flatMap((section) => section.fields)) {
    const raw = profileFieldValue(profile, field.key);
    if (field.type === "cpf") values[field.key] = formatCpf(raw);
    else if (field.type === "cep") values[field.key] = formatCep(raw);
    else if (field.type === "tel") values[field.key] = formatPhone(raw);
    else values[field.key] = raw;
  }
  return values;
}

export function normalizeProfileCompletionValue(field: ProfileCompletionField, value: string): string | number {
  if (field.type === "number") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (field.type === "cpf" || field.type === "cep" || field.type === "tel" || field.type === "digits") {
    return onlyDigits(value);
  }
  return value.trim();
}

export function getProfileCompletionInputValue(field: ProfileCompletionField, value: string): string {
  if (field.type === "cpf") return formatCpf(value);
  if (field.type === "cep") return formatCep(value);
  if (field.type === "tel") return formatPhone(value);
  if (field.type === "digits") return onlyDigits(value);
  return value;
}
