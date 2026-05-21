import { functions, ADMIN_USERS_FUNCTION_ID } from "./appwrite";
import type { FinancialDreParams, FinancialDreResponse } from "../types/financialDre";

type FinancialDreFunctionResponse = {
  dre?: FinancialDreResponse;
  message?: string;
};

function parseResponse(body: string | undefined): FinancialDreFunctionResponse {
  if (!body) return {};
  try {
    return JSON.parse(body) as FinancialDreFunctionResponse;
  } catch {
    return {};
  }
}

export async function saveFinancialDreManualValue(month: string, lineId: string, amount: number): Promise<FinancialDreResponse> {
  const response = await executeFinancialDre({ action: "saveFinancialDreManualValue", month, lineId, amount });
  if (!response.dre) throw new Error(response.message || "DRE nao retornada apos salvar lancamento manual.");
  return response.dre;
}

async function executeFinancialDre(payload: Record<string, unknown>): Promise<FinancialDreFunctionResponse> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    throw new Error("Função administrativa não configurada. Defina VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID.");
  }

  const execution = await functions.createExecution(ADMIN_USERS_FUNCTION_ID, JSON.stringify(payload), false);
  const response = parseResponse(execution.responseBody);
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || "Falha ao executar a função financeira.");
  }
  return response;
}

export async function getFinancialDre(params: FinancialDreParams): Promise<FinancialDreResponse> {
  const response = await executeFinancialDre({ action: "getFinancialDre", ...params });
  if (!response.dre) throw new Error(response.message || "DRE não retornada pela função.");
  return response.dre;
}

export async function closeFinancialMonth(month: string, notes?: string): Promise<FinancialDreResponse> {
  const response = await executeFinancialDre({ action: "closeFinancialMonth", month, notes: notes ?? "" });
  if (!response.dre) throw new Error(response.message || "DRE não retornada após fechamento.");
  return response.dre;
}

export async function reopenFinancialMonth(month: string): Promise<FinancialDreResponse> {
  const response = await executeFinancialDre({ action: "reopenFinancialMonth", month });
  if (!response.dre) throw new Error(response.message || "DRE não retornada após reabertura.");
  return response.dre;
}
