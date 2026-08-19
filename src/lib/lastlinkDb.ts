import { ADMIN_USERS_FUNCTION_ID, functions } from "./appwrite";
import type { CreditPaymentProvider, CreditPaymentSettings, LastLinkSettings, LastLinkSettingsInput } from "../types/lastlink";

type LastLinkResponse = {
  message?: string;
  provider?: CreditPaymentProvider;
  settings?: LastLinkSettings;
  lastlink?: LastLinkSettings;
};

async function execute(payload: Record<string, unknown>): Promise<LastLinkResponse> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    throw new Error("Função administrativa não configurada.");
  }
  const execution = await functions.createExecution(ADMIN_USERS_FUNCTION_ID, JSON.stringify(payload), false);
  let response: LastLinkResponse = {};
  try {
    response = execution.responseBody ? JSON.parse(execution.responseBody) as LastLinkResponse : {};
  } catch {
    response = {};
  }
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || "Falha na integração com a LastLink.");
  }
  return response;
}

export async function getCreditPaymentSettings(): Promise<CreditPaymentSettings> {
  const response = await execute({ action: "getCreditPaymentSettings" });
  if (!response.provider || !response.lastlink) {
    throw new Error(response.message || "Configuração de pagamento não retornada.");
  }
  return { provider: response.provider, lastlink: response.lastlink };
}

export async function saveCreditPaymentProvider(provider: CreditPaymentProvider): Promise<CreditPaymentProvider> {
  const response = await execute({ action: "saveCreditPaymentProvider", provider });
  if (!response.provider) throw new Error(response.message || "Provedor de pagamento não retornado.");
  return response.provider;
}

export async function saveLastLinkSettings(input: LastLinkSettingsInput): Promise<LastLinkSettings> {
  const response = await execute({ action: "saveLastLinkSettings", settings: input });
  if (!response.settings) throw new Error(response.message || "Configuração LastLink não retornada.");
  return response.settings;
}

export async function testLastLinkConnection(): Promise<LastLinkSettings> {
  const response = await execute({ action: "testLastLinkConnection" });
  if (!response.settings) throw new Error(response.message || "Teste LastLink não retornou a sessão.");
  return response.settings;
}
