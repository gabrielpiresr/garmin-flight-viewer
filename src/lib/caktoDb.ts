import { ADMIN_USERS_FUNCTION_ID, functions } from "./appwrite";
import type {
  CaktoReceiptPage,
  CaktoReceiptFilters,
  CaktoSettings,
  CaktoSettingsInput,
} from "../types/cakto";
import type { CrmProposal, CrmProposalInput } from "../types/proposal";

type CaktoResponse = {
  message?: string;
  settings?: CaktoSettings;
  proposal?: CrmProposal;
  receipts?: CaktoReceiptPage["receipts"];
  total?: number;
  limit?: number;
  offset?: number;
  summary?: CaktoReceiptPage["summary"];
};

async function execute(payload: Record<string, unknown>): Promise<CaktoResponse> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    throw new Error("Função administrativa não configurada.");
  }
  const execution = await functions.createExecution(ADMIN_USERS_FUNCTION_ID, JSON.stringify(payload), false);
  let response: CaktoResponse = {};
  try {
    response = execution.responseBody ? JSON.parse(execution.responseBody) as CaktoResponse : {};
  } catch {
    response = {};
  }
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || "Falha na integração com a Cakto.");
  }
  return response;
}

export async function getCaktoSettings(): Promise<CaktoSettings> {
  const response = await execute({ action: "getCaktoSettings" });
  if (!response.settings) throw new Error(response.message || "Configuração Cakto não retornada.");
  return response.settings;
}

export async function saveCaktoSettings(input: CaktoSettingsInput): Promise<CaktoSettings> {
  const response = await execute({ action: "saveCaktoSettings", settings: input });
  if (!response.settings) throw new Error(response.message || "Configuração Cakto não retornada.");
  return response.settings;
}

export async function testCaktoConnection(): Promise<void> {
  await execute({ action: "testCaktoConnection" });
}

export async function createProposalWithPayment(input: CrmProposalInput): Promise<CrmProposal> {
  const response = await execute({ action: "createCaktoProposal", proposal: input });
  if (!response.proposal) throw new Error(response.message || "Orçamento não retornado.");
  return response.proposal;
}

export async function retryProposalPayment(proposalId: string): Promise<CrmProposal> {
  const response = await execute({ action: "retryCaktoProposal", proposalId });
  if (!response.proposal) throw new Error(response.message || "Orçamento não retornado.");
  return response.proposal;
}

export async function listCaktoReceipts(filters: CaktoReceiptFilters): Promise<CaktoReceiptPage> {
  const response = await execute({ action: "listCaktoReceipts", ...filters });
  return {
    receipts: response.receipts ?? [],
    total: response.total ?? 0,
    limit: response.limit ?? filters.limit ?? 25,
    offset: response.offset ?? filters.offset ?? 0,
    summary: response.summary ?? { approved: 0, refunded: 0, pending: 0 },
  };
}
