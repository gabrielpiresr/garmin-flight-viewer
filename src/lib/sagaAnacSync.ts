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

export function sagaAnacMissingEnrollmentFields(data: SagaAnacPerson | null | undefined): string[] {
  if (!data) return ["name"];
  const missing: string[] = [];
  if (!clean(data.name)) missing.push("name");
  const cma = data.cma || {};
  if (!clean(cma.class)) missing.push("medical_certificate[class]");
  if (!clean(cma.val)) missing.push("medical_certificate[val]");
  if (!clean(cma.issued_by)) missing.push("medical_certificate[issued_by]");
  if (typeof cma.remarks !== "string") missing.push("medical_certificate[remarks]");
  if (!Array.isArray(data.licenses) || data.licenses.length === 0) missing.push("licenses");
  if (!Array.isArray(data.types) || data.types.length === 0) missing.push("types");
  if (!Array.isArray(data.languages) || data.languages.length === 0) missing.push("languages");
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
