import { ADMIN_USERS_FUNCTION_ID, BUCKET_ID, ID, Permission, Role, functions, storage } from "./appwrite";
import type {
  SoloFlightDecision,
  SoloFlightEndorsement,
  SoloFlightEvaluation,
  SoloFlightEvaluationInput,
  SoloFlightRequest,
} from "../types/soloFlight";

type SoloFlightResponse = {
  endorsement?: SoloFlightEndorsement;
  endorsements?: SoloFlightEndorsement[];
  evaluation?: SoloFlightEvaluation;
  request?: SoloFlightRequest;
  requests?: SoloFlightRequest[];
  decision?: SoloFlightDecision;
  templates?: unknown[];
  message?: string;
};

async function executeSoloFlight(payload: Record<string, unknown>): Promise<SoloFlightResponse> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    throw new Error("Função administrativa não configurada.");
  }
  const execution = await functions.createExecution(ADMIN_USERS_FUNCTION_ID, JSON.stringify(payload), false);
  let response: SoloFlightResponse = {};
  try {
    response = execution.responseBody ? (JSON.parse(execution.responseBody) as SoloFlightResponse) : {};
  } catch {
    response = {};
  }
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || "Falha no fluxo de voo solo.");
  }
  return response;
}

function endorsementFilePermissions(studentUserId: string): string[] {
  return [
    Permission.read(Role.user(studentUserId)),
    Permission.read(Role.label("admin")),
    Permission.read(Role.label("instrutor")),
    Permission.update(Role.user(studentUserId)),
    Permission.delete(Role.user(studentUserId)),
    Permission.delete(Role.label("admin")),
  ];
}

export function getSoloFlightEndorsementUrl(fileId: string): string {
  if (!storage || !BUCKET_ID || !fileId) return "";
  return storage.getFileView(BUCKET_ID, fileId).toString();
}

export async function listSoloFlightEndorsements(studentUserId?: string): Promise<SoloFlightEndorsement[]> {
  const response = await executeSoloFlight({ action: "listSoloFlightEndorsements", studentUserId });
  return response.endorsements ?? [];
}

export async function uploadSoloFlightEndorsement(params: {
  studentUserId: string;
  file: File;
  notes?: string;
}): Promise<SoloFlightEndorsement> {
  if (!storage || !BUCKET_ID) throw new Error("Storage Appwrite não configurado.");
  const type = params.file.type || "application/octet-stream";
  if (!type.startsWith("image/") && type !== "application/pdf") {
    throw new Error("Envie um PDF ou imagem.");
  }
  const uploaded = await storage.createFile(
    BUCKET_ID,
    ID.unique(),
    params.file,
    endorsementFilePermissions(params.studentUserId),
  );
  try {
    const response = await executeSoloFlight({
      action: "createSoloFlightEndorsement",
      studentUserId: params.studentUserId,
      fileId: uploaded.$id,
      fileName: params.file.name,
      mimeType: type,
      fileSize: params.file.size,
      notes: params.notes || "",
    });
    if (!response.endorsement) throw new Error("Endosso não retornado.");
    return response.endorsement;
  } catch (error) {
    await storage.deleteFile(BUCKET_ID, uploaded.$id).catch(() => null);
    throw error;
  }
}

export async function deleteSoloFlightEndorsement(endorsementId: string): Promise<void> {
  await executeSoloFlight({ action: "deleteSoloFlightEndorsement", endorsementId });
}

export async function evaluateSoloFlight(input: SoloFlightEvaluationInput): Promise<SoloFlightEvaluation> {
  const response = await executeSoloFlight({ action: "evaluateSoloFlight", request: input });
  if (!response.evaluation) throw new Error("Avaliação não retornada.");
  return response.evaluation;
}

export async function createSoloFlightRequest(input: SoloFlightEvaluationInput): Promise<SoloFlightRequest> {
  const response = await executeSoloFlight({ action: "createSoloFlightRequest", request: input });
  if (!response.request) throw new Error("Solicitação não retornada.");
  return response.request;
}

export async function listSoloFlightRequests(params: {
  status?: string;
  studentUserId?: string;
  instructorUserId?: string;
  limit?: number;
} = {}): Promise<SoloFlightRequest[]> {
  const response = await executeSoloFlight({ action: "listSoloFlightRequests", ...params });
  return response.requests ?? [];
}

export async function decideSoloFlightRequest(params: {
  requestId: string;
  decision: "approved" | "rejected";
  reason?: string;
}): Promise<SoloFlightRequest> {
  const response = await executeSoloFlight({ action: "decideSoloFlightRequest", ...params });
  if (!response.request) throw new Error("Solicitação não retornada.");
  return response.request;
}

export async function ensureSoloFlightWppTemplates(): Promise<unknown[]> {
  const response = await executeSoloFlight({ action: "ensureSoloFlightWppTemplates" });
  return response.templates ?? [];
}
