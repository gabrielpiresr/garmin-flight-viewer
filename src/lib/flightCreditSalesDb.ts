import { ADMIN_USERS_FUNCTION_ID, functions } from "./appwrite";
import type {
  FlightCreditCheckout,
  FlightCreditSalesConfig,
  FlightCreditSalesConfigInput,
} from "../types/flightCreditSales";

type FlightCreditSalesResponse = {
  message?: string;
  config?: FlightCreditSalesConfig;
  checkout?: FlightCreditCheckout;
};

async function execute(payload: Record<string, unknown>): Promise<FlightCreditSalesResponse> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    throw new Error("Funcao administrativa nao configurada.");
  }
  const execution = await functions.createExecution(ADMIN_USERS_FUNCTION_ID, JSON.stringify(payload), false);
  let response: FlightCreditSalesResponse = {};
  try {
    response = execution.responseBody ? JSON.parse(execution.responseBody) as FlightCreditSalesResponse : {};
  } catch {
    response = {};
  }
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || "Falha ao processar pacotes de horas.");
  }
  return response;
}

export async function getFlightCreditSalesConfig(): Promise<FlightCreditSalesConfig> {
  const response = await execute({ action: "getFlightCreditSalesConfig" });
  if (!response.config) throw new Error(response.message || "Configuracao de pacotes nao retornada.");
  return response.config;
}

export async function saveFlightCreditSalesConfig(
  config: FlightCreditSalesConfigInput,
): Promise<FlightCreditSalesConfig> {
  const response = await execute({ action: "saveFlightCreditSalesConfig", config });
  if (!response.config) throw new Error(response.message || "Configuracao de pacotes nao retornada.");
  return response.config;
}

export async function getAvailableFlightCreditPackages(): Promise<FlightCreditSalesConfig> {
  const response = await execute({ action: "getAvailableFlightCreditPackages" });
  if (!response.config) throw new Error(response.message || "Pacotes de horas nao retornados.");
  return response.config;
}

export async function createFlightCreditCheckout(packageId: string, customHours?: number): Promise<FlightCreditCheckout> {
  const response = await execute({
    action: "createFlightCreditCheckout",
    packageId,
    ...(Number.isFinite(customHours) ? { customHours } : {}),
  });
  if (!response.checkout) throw new Error(response.message || "Checkout nao retornado.");
  return response.checkout;
}

export async function adminCreateFlightCreditCheckout(
  targetUserId: string,
  packageId: string,
  customHours?: number,
  customHourPrice?: number,
): Promise<FlightCreditCheckout> {
  const response = await execute({
    action: "adminCreateFlightCreditCheckout",
    targetUserId,
    packageId,
    ...(Number.isFinite(customHours) ? { customHours } : {}),
    ...(Number.isFinite(customHourPrice) ? { customHourPrice } : {}),
  });
  if (!response.checkout) throw new Error(response.message || "Checkout nao retornado.");
  return response.checkout;
}
