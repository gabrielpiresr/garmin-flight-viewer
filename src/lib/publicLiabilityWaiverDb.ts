import { ADMIN_USERS_FUNCTION_ID, functions } from "./appwrite";

export type PublicLiabilityWaiverForm = {
  fullName: string;
  cpf: string;
  email: string;
  phone: string;
  birthDate: string;
  weightKg: string;
  city: string;
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelation: string;
  acceptedTerms: boolean;
};

type PublicWaiverResponse = {
  ok?: boolean;
  contractId?: string;
  createdAt?: string;
  status?: string;
  message?: string;
};

export async function createPublicLiabilityWaiverContract(form: PublicLiabilityWaiverForm): Promise<{
  contractId: string;
  createdAt: string;
}> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    throw new Error("Formulário indisponível no momento.");
  }
  const execution = await functions.createExecution(
    ADMIN_USERS_FUNCTION_ID,
    JSON.stringify({ action: "createPublicLiabilityWaiverContract", form }),
    false,
  );
  let response: PublicWaiverResponse = {};
  try {
    response = JSON.parse(execution.responseBody || "{}") as PublicWaiverResponse;
  } catch {
    throw new Error("Resposta inválida do servidor.");
  }
  if (execution.status === "failed" || execution.responseStatusCode >= 400 || !response.ok) {
    throw new Error(response.message || "Não foi possível gerar o termo.");
  }
  if (!response.contractId) throw new Error("Contrato não retornado.");
  return {
    contractId: response.contractId,
    createdAt: response.createdAt || new Date().toISOString(),
  };
}
