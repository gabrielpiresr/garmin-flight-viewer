import { functions, SYNC_ANAC_FUNCTION_ID } from "./appwrite";

export type AnacSyncPayload = {
  cpf: string;
  anacCode: string;
  birthDate: string;
};

type AnacExecutionResponse = {
  pending?: boolean;
  error?: string;
  message?: string;
};

function parseExecutionResponse(responseBody: string | undefined): AnacExecutionResponse {
  if (!responseBody) return {};
  try {
    return JSON.parse(responseBody) as AnacExecutionResponse;
  } catch {
    return {};
  }
}

export async function executeAnacSync(
  payload: AnacSyncPayload,
): Promise<{ pending: boolean; error: Error | null; message: string }> {
  if (!functions || !SYNC_ANAC_FUNCTION_ID) {
    return {
      pending: true,
      error: new Error("Função ANAC não configurada."),
      message: "Função ANAC não configurada.",
    };
  }

  try {
    const execution = await functions.createExecution(
      SYNC_ANAC_FUNCTION_ID,
      JSON.stringify(payload),
      false,
    );
    const response = parseExecutionResponse(execution.responseBody);
    const pending = response.pending !== false;
    return {
      pending,
      error: null,
      message: response.message || (pending ? "Consulta ANAC pendente." : "Consulta ANAC atualizada."),
    };
  } catch (error) {
    return {
      pending: true,
      error: error as Error,
      message: (error as Error)?.message || "Falha ao executar sincronização ANAC.",
    };
  }
}
