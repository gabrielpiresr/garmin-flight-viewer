import { ADMIN_USERS_FUNCTION_ID, functions } from "./appwrite";
import type { FlightCreditCheckout, FlightCreditSalesConfig } from "../types/flightCreditSales";

export type StaffCreditPurchaseStudent = {
  userId: string;
  name: string;
  email: string;
};

type StaffCreditPurchaseResponse = {
  message?: string;
  students?: StaffCreditPurchaseStudent[];
  config?: FlightCreditSalesConfig;
  checkout?: FlightCreditCheckout;
};

async function execute(payload: Record<string, unknown>): Promise<StaffCreditPurchaseResponse> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    throw new Error("Funcao administrativa nao configurada.");
  }
  const execution = await functions.createExecution(ADMIN_USERS_FUNCTION_ID, JSON.stringify(payload), false);
  let response: StaffCreditPurchaseResponse = {};
  try {
    response = execution.responseBody ? (JSON.parse(execution.responseBody) as StaffCreditPurchaseResponse) : {};
  } catch {
    response = {};
  }
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || "Falha ao processar compra de creditos.");
  }
  return response;
}

export async function searchStaffCreditPurchaseStudents(search: string): Promise<StaffCreditPurchaseStudent[]> {
  const response = await execute({ action: "listStaffCreditPurchaseStudents", search });
  return response.students ?? [];
}

export async function getStaffFlightCreditPackagesForStudent(targetUserId: string): Promise<FlightCreditSalesConfig> {
  const response = await execute({ action: "getStaffFlightCreditPackagesForStudent", targetUserId });
  if (!response.config) throw new Error(response.message || "Pacotes de horas nao retornados.");
  return response.config;
}

export async function staffCreateFlightCreditCheckout(
  targetUserId: string,
  packageId: string,
  customHours?: number,
  weekdayOnly?: boolean,
): Promise<FlightCreditCheckout> {
  const response = await execute({
    action: "staffCreateFlightCreditCheckout",
    targetUserId,
    packageId,
    ...(Number.isFinite(customHours) ? { customHours } : {}),
    ...(weekdayOnly === true ? { weekdayOnly: true } : {}),
  });
  if (!response.checkout) throw new Error(response.message || "Checkout nao retornado.");
  return response.checkout;
}
