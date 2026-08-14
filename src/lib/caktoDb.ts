import { ADMIN_USERS_FUNCTION_ID, functions } from "./appwrite";
import type {
  CaktoReceiptPage,
  CaktoReceiptFilters,
  CaktoSettings,
  CaktoSettingsInput,
  FlightReviewClubCheckout,
  FlightReviewClubAdminOverview,
  FlightReviewClubMemberRow,
  FlightReviewClubStatus,
  FlightReviewClubTask,
  FlightReviewClubTaskStatus,
  FlightReviewClubQuote,
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
  checkout?: FlightReviewClubCheckout;
  quote?: FlightReviewClubQuote;
  frcStatus?: FlightReviewClubStatus;
  frcOverview?: FlightReviewClubAdminOverview;
  members?: FlightReviewClubMemberRow[];
  task?: FlightReviewClubTask;
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

export async function createFlightReviewClubCheckout(planId?: string, mode?: string): Promise<FlightReviewClubCheckout> {
  const response = await execute({ action: "createFlightReviewClubCheckout", planId, mode });
  if (!response.checkout) throw new Error(response.message || "Checkout do Flight Review Club nao retornado.");
  return response.checkout;
}

export async function quoteFlightReviewClubCheckout(planId?: string, mode?: string): Promise<FlightReviewClubQuote> {
  const response = await execute({ action: "quoteFlightReviewClubCheckout", planId, mode });
  if (!response.quote) throw new Error(response.message || "Preco do Flight Review Club nao retornado.");
  return response.quote;
}

export async function getFlightReviewClubStatus(userId?: string): Promise<FlightReviewClubStatus> {
  const response = await execute({ action: "getFlightReviewClubStatus", userId });
  if (!response.frcStatus) throw new Error(response.message || "Status do Flight Review Club nao retornado.");
  return response.frcStatus;
}

export async function cancelFlightReviewClubSubscription(): Promise<FlightReviewClubStatus> {
  const response = await execute({ action: "cancelFlightReviewClubSubscription" });
  if (!response.frcStatus) throw new Error(response.message || "Status do Flight Review Club nao retornado.");
  return response.frcStatus;
}

export async function getAdminFlightReviewClubOverview(): Promise<FlightReviewClubAdminOverview> {
  const response = await execute({ action: "getAdminFlightReviewClubOverview" });
  if (!response.frcOverview) throw new Error(response.message || "Resumo do Flight Review Club nao retornado.");
  return response.frcOverview;
}

export async function listAdminFlightReviewClubMembers(search = ""): Promise<FlightReviewClubMemberRow[]> {
  const response = await execute({ action: "listAdminFlightReviewClubMembers", search });
  return response.members ?? [];
}

export async function updateFlightReviewClubTask(input: {
  taskId: string;
  status?: FlightReviewClubTaskStatus;
  assignedToUserId?: string;
  dueAt?: string | null;
  completedAt?: string | null;
  notes?: string;
}): Promise<FlightReviewClubTask> {
  const response = await execute({ action: "updateFlightReviewClubTask", task: input });
  if (!response.task) throw new Error(response.message || "Tarefa FRC nao retornada.");
  return response.task;
}

export async function ensureFlightReviewClubMemberTasks(membershipId: string): Promise<FlightReviewClubTask[]> {
  const response = await execute({ action: "ensureFlightReviewClubMemberTasks", membershipId });
  const members = response.members ?? [];
  return members.find((member) => member.membership.id === membershipId)?.tasks ?? [];
}

export async function forceFlightReviewClubAccess(input: {
  studentUserId: string;
  mode: "grant" | "revoke";
  accessUntil?: string | null;
}): Promise<FlightReviewClubMemberRow[]> {
  const response = await execute({ action: "forceFlightReviewClubAccess", ...input });
  return response.members ?? [];
}
