import { ADMIN_USERS_FUNCTION_ID, databases, functions, isAppwriteConfigured } from "./appwrite";
import type {
  FlightBriefingAiGenerateInput,
  FlightBriefingAiGenerateResult,
  FlightBriefingAiReport,
  FlightBriefingAiTaskStatus,
} from "../types/flightBriefingAi";

type FlightBriefingAiResponse = {
  message?: string;
  reportId?: string;
  report?: FlightBriefingAiReport;
};

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;
const FLIGHT_PLANNING_AI_BRIEFINGS_COL_ID =
  (import.meta.env.VITE_APPWRITE_FLIGHT_PLANNING_AI_BRIEFINGS_COL_ID as string | undefined) ||
  (import.meta.env.VITE_APPWRITE_FLIGHT_PLANNING_AI_BRIEFINGS_COLLECTION_ID as string | undefined) ||
  "flight_planning_ai_briefings";

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function createClientReportId(): string {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `fpai_${time}_${random}`;
}

function parseSavedReport(doc: Record<string, unknown>): FlightBriefingAiReport | null {
  const raw = typeof doc.report_json === "string" ? doc.report_json : "";
  if (!raw) return null;
  try {
    const report = JSON.parse(raw) as FlightBriefingAiReport;
    return { ...report, id: String(doc.$id || report.id || "") };
  } catch {
    return null;
  }
}

async function waitForSavedReport(reportId: string, timeoutMs = 240000): Promise<FlightBriefingAiGenerateResult> {
  if (!isAppwriteConfigured || !databases || !DB_ID || !FLIGHT_PLANNING_AI_BRIEFINGS_COL_ID) {
    throw new Error("Banco Appwrite não configurado para buscar o relatório IA.");
  }

  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const doc = await databases.getDocument({
        databaseId: DB_ID,
        collectionId: FLIGHT_PLANNING_AI_BRIEFINGS_COL_ID,
        documentId: reportId,
      });
      const report = parseSavedReport(doc as unknown as Record<string, unknown>);
      if (report) return { reportId, report };
    } catch (error) {
      lastError = error;
    }
    await sleep(2500);
  }
  throw lastError instanceof Error
    ? new Error(`Relatório IA ainda não apareceu no Appwrite: ${lastError.message}`)
    : new Error("Relatório IA ainda não apareceu no Appwrite.");
}

function parseResponse(responseBody: string | undefined): FlightBriefingAiResponse {
  try {
    return responseBody ? (JSON.parse(responseBody) as FlightBriefingAiResponse) : {};
  } catch {
    return {};
  }
}

function isExecutionNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  const type = String((error as { type?: string }).type || "").toLowerCase();
  const code = Number((error as { code?: number }).code || 0);
  return (
    code === 404 ||
    type === "execution_not_found" ||
    message.includes("execution with the requested id could not be found") ||
    message.includes("execution_not_found") ||
    message.includes("requested id could not be found")
  );
}

async function getExecutionWithRetry(executionId: string, attempts = 8) {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await functions!.getExecution({
        functionId: ADMIN_USERS_FUNCTION_ID!,
        executionId,
      });
    } catch (error) {
      lastError = error;
      if (!isExecutionNotFoundError(error) || attempt >= attempts - 1) throw error;
      await sleep(400 + attempt * 400);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Execução não encontrada.");
}

async function execute(payload: Record<string, unknown>): Promise<FlightBriefingAiResponse> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    throw new Error("Função administrativa não configurada.");
  }
  const execution = await functions.createExecution({
    functionId: ADMIN_USERS_FUNCTION_ID,
    body: JSON.stringify(payload),
    async: false,
  });
  const response = parseResponse(execution.responseBody);
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || "Falha ao executar briefing IA.");
  }
  return response;
}

async function executeAsync(payload: Record<string, unknown>, timeoutMs = 240000): Promise<FlightBriefingAiResponse> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    throw new Error("Função administrativa não configurada.");
  }
  const created = await functions.createExecution({
    functionId: ADMIN_USERS_FUNCTION_ID,
    body: JSON.stringify(payload),
    async: true,
  });
  const executionId = String(created.$id || "").trim();
  if (!executionId) throw new Error("A execução da function não retornou um ID válido.");

  const startedAt = Date.now();
  let execution = await getExecutionWithRetry(executionId);
  while (execution.status === "processing" || execution.status === "waiting") {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("A IA ainda está pesquisando no Appwrite. Aguarde um pouco e gere novamente.");
    }
    await sleep(2500);
    execution = await getExecutionWithRetry(executionId);
  }

  const response = parseResponse(execution.responseBody);
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || "Falha ao gerar checklist IA.");
  }
  return response;
}

export async function generateFlightBriefingAiReport(
  input: FlightBriefingAiGenerateInput,
): Promise<FlightBriefingAiGenerateResult> {
  const clientReportId = input.clientReportId || createClientReportId();
  const response = await executeAsync({
    action: "generateFlightBriefingAiReport",
    ...input,
    clientReportId,
  });
  if (!response.report) {
    return waitForSavedReport(clientReportId);
  }
  return {
    reportId: response.reportId || response.report.id || clientReportId,
    report: { ...response.report, id: response.report.id || response.reportId || clientReportId },
  };
}

export async function getLatestFlightBriefingAiReport(
  input: FlightBriefingAiGenerateInput,
): Promise<FlightBriefingAiGenerateResult | null> {
  const response = await execute({
    action: "getLatestFlightBriefingAiReport",
    ...input,
  });
  if (!response.report) return null;
  return {
    reportId: response.reportId || response.report.id,
    report: response.report,
  };
}

export async function updateFlightBriefingAiTask(input: {
  reportId: string;
  taskId: string;
  status?: FlightBriefingAiTaskStatus;
  pilotNote?: string;
}): Promise<FlightBriefingAiReport> {
  const response = await execute({
    action: "updateFlightBriefingAiTask",
    ...input,
  });
  if (!response.report) throw new Error(response.message || "Relatório IA não retornado.");
  return response.report;
}
