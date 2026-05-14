import { ADMIN_USERS_FUNCTION_ID, functions } from "./appwrite";
import { DEFAULT_SCHOOL_RULES, normalizeSchoolRules, type SchoolRules, type SchoolRulesInput } from "../types/schoolRules";

type SchoolRulesResponse = {
  ok?: boolean;
  message?: string;
  schoolRules?: SchoolRules;
};

function parseResponse(body: string | undefined): SchoolRulesResponse {
  if (!body) return {};
  try {
    return JSON.parse(body) as SchoolRulesResponse;
  } catch {
    return {};
  }
}

async function executeSchoolRules(payload: Record<string, unknown>): Promise<SchoolRulesResponse> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    throw new Error("Função administrativa não configurada. Defina VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID.");
  }

  const execution = await functions.createExecution(ADMIN_USERS_FUNCTION_ID, JSON.stringify(payload), false);
  const response = parseResponse(execution.responseBody);
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || "Falha ao executar função de regras.");
  }
  return response;
}

export async function getSchoolRules(): Promise<SchoolRules> {
  const response = await executeSchoolRules({ action: "getSchoolRules" });
  return normalizeSchoolRules(response.schoolRules ?? DEFAULT_SCHOOL_RULES);
}

export async function saveSchoolRules(rules: SchoolRulesInput): Promise<SchoolRules> {
  const response = await executeSchoolRules({ action: "saveSchoolRules", rules });
  if (!response.schoolRules) throw new Error(response.message || "Regras da escola não retornadas.");
  return normalizeSchoolRules(response.schoolRules);
}

export function applySchoolTheme(rules: Pick<SchoolRules, "theme"> | SchoolRules["theme"]) {
  if (typeof document === "undefined") return;
  const theme = "theme" in rules ? rules.theme : rules;
  const root = document.documentElement;
  root.style.setProperty("--school-primary", theme.primaryColor);
  root.style.setProperty("--school-accent", theme.accentColor);
  root.style.setProperty("--school-bg", theme.backgroundColor);
  root.style.setProperty("--school-surface", theme.surfaceColor);
}

