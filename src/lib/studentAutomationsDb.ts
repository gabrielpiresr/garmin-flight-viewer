import { ADMIN_USERS_FUNCTION_ID, functions } from "./appwrite";
import type {
  AutomationEmailTemplate,
  AutomationEmailTemplateInput,
  AutomationRun,
  AutomationRunDetail,
  AutomationSimulation,
  StudentAutomation,
  StudentAutomationInput,
  StudentCrmStatus,
  StudentCrmStatusInput,
  StudentCrmProfile,
} from "../types/studentAutomation";

type AutomationResponse = {
  ok?: boolean;
  message?: string;
  automations?: StudentAutomation[];
  automation?: StudentAutomation;
  templates?: AutomationEmailTemplate[];
  template?: AutomationEmailTemplate;
  statuses?: StudentCrmStatus[];
  crmProfiles?: StudentCrmProfile[];
  status?: StudentCrmStatus;
  runs?: AutomationRun[];
  runDetail?: AutomationRunDetail;
  simulation?: AutomationSimulation;
  total?: number;
};

type CacheEntry<T> = { value?: T; promise?: Promise<T>; expiresAt: number };
const responseCache = new Map<string, CacheEntry<unknown>>();
const DEFAULT_CACHE_MS = 2 * 60 * 1000;

async function cached<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs = DEFAULT_CACHE_MS,
): Promise<T> {
  const now = Date.now();
  const current = responseCache.get(key) as CacheEntry<T> | undefined;
  if (current?.value !== undefined && current.expiresAt > now)
    return current.value;
  if (current?.promise) return current.promise;
  const promise = loader()
    .then((value) => {
      responseCache.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .catch((error) => {
      responseCache.delete(key);
      throw error;
    });
  responseCache.set(key, { promise, expiresAt: now + ttlMs });
  return promise;
}

export function invalidateStudentAutomationCache(...prefixes: string[]) {
  if (prefixes.length === 0) {
    responseCache.clear();
    return;
  }
  for (const key of responseCache.keys()) {
    if (prefixes.some((prefix) => key.startsWith(prefix)))
      responseCache.delete(key);
  }
}

async function execute(
  payload: Record<string, unknown>,
): Promise<AutomationResponse> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID)
    throw new Error("Função administrativa não configurada.");
  const execution = await functions.createExecution(
    ADMIN_USERS_FUNCTION_ID,
    JSON.stringify(payload),
    false,
  );
  let response: AutomationResponse = {};
  try {
    response = execution.responseBody
      ? (JSON.parse(execution.responseBody) as AutomationResponse)
      : {};
  } catch {
    response = {};
  }
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(
      response.message || "Falha ao executar a operação de automação.",
    );
  }
  return response;
}

export async function listStudentAutomations(): Promise<StudentAutomation[]> {
  return cached(
    "automations",
    async () =>
      (await execute({ action: "listStudentAutomations" })).automations ?? [],
  );
}

export async function getStudentAutomation(
  id: string,
): Promise<StudentAutomation> {
  const response = await execute({ action: "getStudentAutomation", id });
  if (!response.automation) throw new Error("Automação não encontrada.");
  return response.automation;
}

export async function saveStudentAutomation(
  input: StudentAutomationInput,
  id?: string,
): Promise<StudentAutomation> {
  const response = await execute({
    action: "saveStudentAutomation",
    id,
    automation: input,
  });
  if (!response.automation) throw new Error("Automação não retornada.");
  invalidateStudentAutomationCache("automations", "runs");
  return response.automation;
}

export async function duplicateStudentAutomation(
  id: string,
): Promise<StudentAutomation> {
  const response = await execute({ action: "duplicateStudentAutomation", id });
  if (!response.automation)
    throw new Error("Automação duplicada não retornada.");
  invalidateStudentAutomationCache("automations");
  return response.automation;
}

export async function setStudentAutomationStatus(
  id: string,
  status: "active" | "paused",
): Promise<StudentAutomation> {
  const response = await execute({
    action: "setStudentAutomationStatus",
    id,
    status,
  });
  if (!response.automation) throw new Error("Automação não retornada.");
  invalidateStudentAutomationCache("automations", "runs");
  return response.automation;
}

export async function deleteStudentAutomation(id: string): Promise<void> {
  await execute({ action: "deleteStudentAutomation", id });
  invalidateStudentAutomationCache("automations", "runs");
}

export async function simulateStudentAutomation(
  id: string,
  studentUserId: string,
): Promise<AutomationSimulation> {
  const response = await execute({
    action: "simulateStudentAutomation",
    id,
    studentUserId,
  });
  if (!response.simulation) throw new Error("Simulação não retornada.");
  return response.simulation;
}

export async function testStudentAutomation(
  id: string,
  studentUserId: string,
): Promise<void> {
  await execute({ action: "testStudentAutomation", id, studentUserId });
}

export async function listAutomationEmailTemplates(): Promise<
  AutomationEmailTemplate[]
> {
  return cached(
    "email-templates",
    async () =>
      (await execute({ action: "listAutomationEmailTemplates" })).templates ??
      [],
  );
}

export async function saveAutomationEmailTemplate(
  input: AutomationEmailTemplateInput,
  id?: string,
): Promise<AutomationEmailTemplate> {
  const response = await execute({
    action: "saveAutomationEmailTemplate",
    id,
    template: input,
  });
  if (!response.template) throw new Error("Template não retornado.");
  invalidateStudentAutomationCache("email-templates", "automations");
  return response.template;
}

export async function duplicateAutomationEmailTemplate(
  id: string,
): Promise<AutomationEmailTemplate> {
  const response = await execute({
    action: "duplicateAutomationEmailTemplate",
    id,
  });
  if (!response.template) throw new Error("Template não retornado.");
  invalidateStudentAutomationCache("email-templates");
  return response.template;
}

export async function deleteAutomationEmailTemplate(id: string): Promise<void> {
  await execute({ action: "deleteAutomationEmailTemplate", id });
  invalidateStudentAutomationCache("email-templates", "automations");
}

export async function sendAutomationEmailTemplateTest(
  id: string,
  email: string,
): Promise<void> {
  await execute({ action: "sendAutomationEmailTemplateTest", id, email });
}

export async function listStudentCrmStatuses(): Promise<StudentCrmStatus[]> {
  return cached(
    "crm-statuses",
    async () =>
      (await execute({ action: "listStudentCrmStatuses" })).statuses ?? [],
  );
}

export async function saveStudentCrmStatus(
  input: StudentCrmStatusInput,
  id?: string,
): Promise<StudentCrmStatus> {
  const response = await execute({
    action: "saveStudentCrmStatus",
    id,
    crmStatus: input,
  });
  if (!response.status) throw new Error("Status não retornado.");
  invalidateStudentAutomationCache(
    "crm-statuses",
    "crm-profiles",
    "automations",
  );
  return response.status;
}

export async function archiveStudentCrmStatus(id: string): Promise<void> {
  await execute({ action: "archiveStudentCrmStatus", id });
  invalidateStudentAutomationCache(
    "crm-statuses",
    "crm-profiles",
    "automations",
  );
}

export async function listStudentCrmProfiles(): Promise<StudentCrmProfile[]> {
  return cached(
    "crm-profiles",
    async () =>
      (await execute({ action: "listStudentCrmProfiles" })).crmProfiles ?? [],
  );
}

export async function setStudentCrmProfileStatus(
  studentUserId: string,
  statusId: string,
): Promise<void> {
  await execute({
    action: "setStudentCrmProfileStatus",
    studentUserId,
    statusId,
  });
  invalidateStudentAutomationCache("crm-profiles", "runs");
}

export async function listAutomationRuns(
  filters: {
    automationId?: string;
    studentUserId?: string;
    status?: string;
    channel?: string;
    limit?: number;
  } = {},
): Promise<{ runs: AutomationRun[]; total: number }> {
  const key = `runs:${JSON.stringify(filters)}`;
  return cached(
    key,
    async () => {
      const response = await execute({
        action: "listAutomationRuns",
        ...filters,
      });
      return {
        runs: response.runs ?? [],
        total: response.total ?? response.runs?.length ?? 0,
      };
    },
    30_000,
  );
}

export async function getAutomationRunDetail(
  id: string,
): Promise<AutomationRunDetail> {
  return cached(
    `run-detail:${id}`,
    async () => {
      const response = await execute({ action: "getAutomationRunDetail", id });
      if (!response.runDetail) throw new Error("Execução não encontrada.");
      return response.runDetail;
    },
    30_000,
  );
}
