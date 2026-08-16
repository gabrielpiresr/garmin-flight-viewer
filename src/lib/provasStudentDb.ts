import { ADMIN_USERS_FUNCTION_ID, functions } from "./appwrite";
import type {
  ProvaAssignment,
  ProvaAttempt,
  ProvaQuestionResult,
  ProvaSanitizedQuestion,
  ProvaStudentAnswer,
} from "../types/provas";

type ProvasFnResponse = {
  message?: string;
  assignments?: ProvaAssignment[];
  assignment?: ProvaAssignment;
  attempt?: ProvaAttempt;
  released?: number;
  expired?: number;
};

function parseBody(raw: string | undefined): ProvasFnResponse {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as ProvasFnResponse;
  } catch {
    return { message: raw };
  }
}

async function executeProvas(payload: Record<string, unknown>): Promise<ProvasFnResponse> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    throw new Error("Função admin-users não configurada.");
  }
  const execution = await functions.createExecution({
    functionId: ADMIN_USERS_FUNCTION_ID,
    body: JSON.stringify(payload),
    async: false,
  });
  const response = parseBody(execution.responseBody);
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || "Falha ao executar ação de provas.");
  }
  return response;
}

export async function listMyProvas(): Promise<ProvaAssignment[]> {
  const response = await executeProvas({ action: "listMyProvas" });
  return response.assignments ?? [];
}

export async function startProvaAttempt(assignmentId: string): Promise<ProvaAttempt> {
  const response = await executeProvas({ action: "startProvaAttempt", assignmentId });
  if (!response.attempt) throw new Error("Não foi possível iniciar a prova.");
  return response.attempt;
}

export async function saveProvaProgress(
  attemptId: string,
  answers: Record<string, ProvaStudentAnswer>,
): Promise<ProvaAttempt> {
  const response = await executeProvas({ action: "saveProvaProgress", attemptId, answers });
  if (!response.attempt) throw new Error("Não foi possível salvar o progresso.");
  return response.attempt;
}

export async function submitProvaAttempt(
  attemptId: string,
  answers: Record<string, ProvaStudentAnswer>,
): Promise<ProvaAttempt> {
  const response = await executeProvas({ action: "submitProvaAttempt", attemptId, answers });
  if (!response.attempt) throw new Error("Não foi possível enviar a prova.");
  return response.attempt;
}

export async function getProvaAttempt(attemptId: string): Promise<ProvaAttempt> {
  const response = await executeProvas({ action: "getProvaAttempt", attemptId });
  if (!response.attempt) throw new Error("Tentativa não encontrada.");
  return response.attempt;
}

export async function releaseProva(provaId: string, studentUserIds: string[]): Promise<number> {
  const response = await executeProvas({ action: "releaseProva", provaId, studentUserIds });
  return response.released ?? 0;
}

export async function listProvaAssignments(params?: {
  provaId?: string;
  search?: string;
}): Promise<ProvaAssignment[]> {
  const response = await executeProvas({ action: "listProvaAssignments", ...params });
  return response.assignments ?? [];
}

export async function getAdminProvaAttempt(attemptId: string): Promise<ProvaAttempt> {
  const response = await executeProvas({ action: "getAdminProvaAttempt", attemptId });
  if (!response.attempt) throw new Error("Tentativa não encontrada.");
  return response.attempt;
}

export type { ProvaSanitizedQuestion, ProvaQuestionResult };
