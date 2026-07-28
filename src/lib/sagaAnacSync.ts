import { ADMIN_USERS_FUNCTION_ID, functions } from "./appwrite";

export type SagaAnacPerson = {
  name?: string;
  cma?: {
    val?: string;
    class?: string;
    issued_by?: string;
    remarks?: string;
  };
  licenses?: string[];
  types?: string[][];
  languages?: string[];
};

export type SagaAnacPostField = {
  key: string;
  value: string;
};

/**
 * Campos mínimos para matrícula no SAGA após consulta ANAC.
 * Alunos novos costumam vir sem CMA/licenças/habilitações/idiomas — arrays vazios e
 * remarks null são válidos; o que importa é ter consultado (nome presente).
 */
export function sagaAnacMissingEnrollmentFields(data: SagaAnacPerson | null | undefined): string[] {
  if (!data || !clean(data.name)) return ["name"];
  const missing: string[] = [];
  if (data.licenses != null && !Array.isArray(data.licenses)) missing.push("licenses");
  if (data.types != null && !Array.isArray(data.types)) missing.push("types");
  if (data.languages != null && !Array.isArray(data.languages)) missing.push("languages");
  return missing;
}

function clean(value: string | undefined | null): string {
  return String(value ?? "").trim();
}

export function buildSagaAnacPostFields(data: SagaAnacPerson): SagaAnacPostField[] {
  const cma = data.cma || {};
  const fields: SagaAnacPostField[] = [
    { key: "medical_certificate[class]", value: clean(cma.class) },
    { key: "medical_certificate[val]", value: clean(cma.val) },
    { key: "medical_certificate[issued_by]", value: clean(cma.issued_by) },
    { key: "medical_certificate[remarks]", value: typeof cma.remarks === "string" ? cma.remarks : "" },
    { key: "licenses", value: JSON.stringify(Array.isArray(data.licenses) ? data.licenses : []) },
    { key: "types", value: JSON.stringify(Array.isArray(data.types) ? data.types : []) },
    { key: "languages", value: JSON.stringify(Array.isArray(data.languages) ? data.languages : []) },
    { key: "name", value: clean(data.name) },
  ];
  return fields;
}

export function parseSagaAnacPerson(raw: string | null | undefined): SagaAnacPerson | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SagaAnacPerson;
    return parsed?.name ? parsed : null;
  } catch {
    return null;
  }
}

export function hasSagaAnacPerson(raw: string | null | undefined): boolean {
  const parsed = parseSagaAnacPerson(raw);
  return sagaAnacMissingEnrollmentFields(parsed).length === 0;
}

type SagaAnacLookupResponse = {
  ok?: boolean;
  message?: string;
  data?: SagaAnacPerson;
};

function parseResponse(body: string | undefined): SagaAnacLookupResponse {
  if (!body) return {};
  try {
    return JSON.parse(body) as SagaAnacLookupResponse;
  } catch {
    return {};
  }
}

export async function executeSagaAnacLookup(payload: {
  anacCode: string;
  cpf: string;
  birthDate: string;
  email?: string;
}): Promise<{ ok: boolean; data: SagaAnacPerson | null; message: string }> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    return { ok: false, data: null, message: "Função admin-users não configurada." };
  }

  try {
    const execution = await functions.createExecution(
      ADMIN_USERS_FUNCTION_ID,
      JSON.stringify({ action: "lookupSagaAnacPerson", ...payload }),
      false,
    );
    const response = parseResponse(execution.responseBody);
    const ok = response.ok === true && Boolean(response.data?.name);
    return {
      ok,
      data: ok ? (response.data ?? null) : null,
      message: response.message || (ok ? "Dados ANAC obtidos no SAGA." : "Consulta ANAC no SAGA não retornou dados."),
    };
  } catch (error) {
    return {
      ok: false,
      data: null,
      message: (error as Error)?.message || "Falha ao consultar ANAC no SAGA.",
    };
  }
}
