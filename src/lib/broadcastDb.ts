import { functions, ADMIN_USERS_FUNCTION_ID } from "./appwrite";
import type {
  BroadcastMessage,
  BroadcastRecipientPreview,
  BroadcastSegment,
  RecipientFilter,
  ResendAccountInfo,
} from "../types/broadcast";

type BroadcastResponse = {
  segments?: BroadcastSegment[];
  segment?: BroadcastSegment;
  messages?: BroadcastMessage[];
  broadcastMessage?: BroadcastMessage;
  total?: number;
  recipients?: BroadcastRecipientPreview[];
  accountInfo?: ResendAccountInfo;
  ok?: boolean;
  message?: string;
};

function parseResponse(body: string | undefined): BroadcastResponse {
  if (!body) return {};
  try {
    return JSON.parse(body) as BroadcastResponse;
  } catch {
    return {};
  }
}

async function executeAdminUsers(payload: Record<string, unknown>): Promise<BroadcastResponse> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    throw new Error("Função de usuários não configurada. Defina VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID.");
  }
  const execution = await functions.createExecution(ADMIN_USERS_FUNCTION_ID, JSON.stringify(payload), false);
  const response = parseResponse(execution.responseBody);
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || "Falha ao executar função de usuários.");
  }
  return response;
}

export async function getResendAccountInfo(): Promise<ResendAccountInfo> {
  const response = await executeAdminUsers({ action: "getResendAccountInfo" });
  return response.accountInfo ?? null;
}

export async function previewBroadcastRecipients(
  filter: RecipientFilter,
): Promise<{ recipients: BroadcastRecipientPreview[]; total: number }> {
  const response = await executeAdminUsers({ action: "previewBroadcastRecipients", filter });
  return {
    recipients: response.recipients ?? [],
    total: response.total ?? response.recipients?.length ?? 0,
  };
}

export async function listBroadcastSegments(): Promise<BroadcastSegment[]> {
  const response = await executeAdminUsers({ action: "listBroadcastSegments" });
  return response.segments ?? [];
}

export async function createBroadcastSegment(params: {
  name: string;
  description?: string;
  filter: RecipientFilter;
}): Promise<BroadcastSegment> {
  const response = await executeAdminUsers({ action: "createBroadcastSegment", ...params });
  if (!response.segment) throw new Error(response.message || "Segmento não retornado pela função.");
  return response.segment;
}

export async function deleteBroadcastSegment(segmentId: string): Promise<void> {
  await executeAdminUsers({ action: "deleteBroadcastSegment", segmentId });
}

export async function listBroadcastMessages(params?: {
  limit?: number;
  offset?: number;
}): Promise<{ messages: BroadcastMessage[]; total: number }> {
  const response = await executeAdminUsers({ action: "listBroadcastMessages", ...params });
  return {
    messages: response.messages ?? [],
    total: response.total ?? response.messages?.length ?? 0,
  };
}

export async function createAndSendBroadcast(params: {
  segmentId: string;
  subject: string;
  bodyHtml: string;
  testEmail?: string | null;
  confirmSend: boolean;
}): Promise<BroadcastMessage | null> {
  const response = await executeAdminUsers({ action: "createAndSendBroadcast", ...params });
  if (params.confirmSend && !response.broadcastMessage) throw new Error(response.message || "Disparo não retornado pela função.");
  return response.broadcastMessage ?? null;
}
