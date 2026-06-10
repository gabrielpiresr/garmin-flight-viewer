import { ADMIN_USERS_FUNCTION_ID, functions } from "./appwrite";

export type SagaUser = {
  id: number | string | null;
  nome: string;
  email: string;
  codigoAnac: string;
  cpf: string;
  nascimento: string;
  cma: string;
  habilitacao: string;
  bases: string;
  perfil: string;
  ultimoAcesso: string;
  status: string;
};

export type SagaFlight = {
  id: string;
  perna: string;
  dataDoVoo: string;
  base: string;
  aeronave: string;
  instrutor: string;
  canacInstrutor: string;
  aluno: string;
  canacAluno: string;
  horimetroInicial: string;
  horimetroFinal: string;
  missaoDoAluno: string;
  origem: string;
  destino: string;
  acionamento: string;
  decolagem: string;
  pouso: string;
  corte: string;
  tempoDeVooHhmm: string;
  tempoDeServicoHhmm: string;
  tempoDeVooHoras: string;
  tempoDeServicoHoras: string;
  numeroPousos: string;
  distancia: string;
  funcaoABordo: string;
  regrasDeVoo: string;
  diurnoOuNoturno: string;
  diarioDeBordo: string;
  grau: string;
  combustivel: string;
  ce: string;
  oleo: string;
  valorDoVoo: string;
  curso: string;
  rawCells?: string[];
};

export type SagaFinancialEntry = {
  selecionar: string;
  id: string;
  data: string;
  cliente: string;
  natureza: string;
  valorTotal: string;
  banco: string;
  status: string;
  acoes: string;
};

export type SagaCredit = {
  sagaUserId: string;
  studentName: string;
  studentEmail: string;
  studentAnac: string;
  model: string;
  hours: string;
  hoursHhmm: string;
  hourlyValue: string;
  totalValue: string;
  purchaseDate: string;
  expiresAt: string;
  notes: string;
  responsible: string;
  rawCells?: string[];
};

export type SagaImportMapping = {
  aircraftBySaga: Record<string, string>;
  aircraftIdByRegistration?: Record<string, string>;
  courseBySaga: Record<string, string>;
  missionBySaga?: Record<string, string>;
  creditAircraftBySaga: Record<string, string>;
  flightColumnMap: Record<string, number>;
  creditColumnMap: Record<string, number>;
  sendFlightsToSaga?: boolean;
  syncScheduleFromSaga?: boolean;
  syncAllUsersFromSaga?: boolean;
  updatedAt?: string | null;
};

export type SagaImportScope = {
  users: boolean;
  pastFlights: boolean;
  schedule: boolean;
  credits: boolean;
};

export type SagaImportCatalogs = {
  aircrafts: Array<{ id: string; registration: string; nickname: string; active: boolean; modelId?: string; modelName?: string }>;
  aircraftModels: Array<{ id: string; name: string; manufacturer: string }>;
  trainingTracks: Array<{ id: string; name: string; active: boolean; stages?: unknown[] }>;
};

export type SagaImportCredentials = {
  email: string;
  password: string;
  updatedAt?: string | null;
};

export type SagaImportSettings = {
  mapping: SagaImportMapping;
  catalogs: SagaImportCatalogs;
  credentials: SagaImportCredentials;
};

export type SagaProposedMapping = SagaImportMapping & {
  missingAircrafts: string[];
  missingCourses: string[];
  missingCreditAircrafts: string[];
};

export type SagaImportSummary = {
  importRunId?: string;
  testMode: boolean;
  useEmailAlias?: boolean;
  selectedSagaUsers?: number;
  requestedUsers: number;
  requestedFlightGroups: number;
  requestedScheduledFlights: number;
  usersCreated: number;
  usersUpdated: number;
  usersSkipped: number;
  flightsCreated: number;
  flightsUpdated: number;
  flightsDeleted?: number;
  flightsSkipped: number;
  duplicateFlights: number;
  scheduledFlightsCreated: number;
  scheduledFlightsUpdated: number;
  scheduledFlightsSkipped: number;
  trainingAssignmentsTouched: number;
  anacSynced: number;
  anacPending: number;
  anacFailed: number;
  creditsCreated: number;
  creditsUpdated: number;
  creditsSkipped: number;
  financialCreditsCreated?: number;
  financialCreditsUpdated?: number;
  financialCreditsSkipped?: number;
  creditHoursImported: number;
  nightHoursReclassified?: number;
  nightCreditRecordsCreated?: number;
  deletedFlights?: Array<{
    flightId: string;
    sagaFlightId?: string;
    reason: string;
    message: string;
  }>;
  staleCleanup?: {
    totalSchoolDocs: number;
    actorLinkedDocs: number;
    candidates: number;
    deleted: number;
    failed: number;
    skippedOutOfRange: number;
    skippedNoSagaKey: number;
    skippedPresentInSaga: number;
    failures: Array<{
      flightId: string;
      sagaFlightId?: string;
      message: string;
    }>;
  };
  skippedFlights: Array<{
    id: string;
    date: string;
    student: string;
    aircraft: string;
    course: string;
    reason: string;
    message: string;
  }>;
  skippedCredits: Array<{
    student: string;
    model: string;
    hours: string;
    reason: string;
    message: string;
  }>;
  missing: {
    aircrafts: string[];
    courses: string[];
    students: string[];
    creditAircrafts: string[];
  };
  logs: string[];
};

export type SagaReloadFlightResult = {
  ok: boolean;
  message: string;
  flightId?: string;
  sagaFlightId?: string;
  sagaScheduleId?: string | null;
  refreshed?: boolean;
  created?: boolean;
  updated?: boolean;
  skipped?: boolean;
  paused?: boolean;
  reason?: string;
  pendingMission?: SagaImportPendingMission;
  logs?: string[];
};

export type SagaMissionOption = {
  value: string;
  label: string;
};

export type SagaImportPendingMission = {
  lookupKey: string;
  rawMission: string;
  missionCode: string;
  trainingTrackId: string;
  trackName: string;
  sagaFlightId: string;
  studentName: string;
  flightDate: string;
  course: string;
  missionOptions?: SagaMissionOption[];
};

export type SagaImportProgress = {
  runId: string;
  status: "running" | "completed" | "failed" | "awaiting_mission_mapping" | string;
  stage: string;
  message: string;
  current: number;
  total: number;
  updatedAt?: string | null;
  logs: string[];
  pendingMission?: SagaImportPendingMission | null;
};

export type SagaImportResult = {
  ok: boolean;
  users: SagaUser[];
  flights: SagaFlight[];
  flightHeaders: string[];
  flightColumnDefs: Array<{ key: keyof SagaFlight; label: string; defaultIndex: number }>;
  financialEntries: SagaFinancialEntry[];
  financialHeaders: string[];
  credits: SagaCredit[];
  creditHeaders: string[];
  creditColumnDefs: Array<{ key: keyof SagaCredit; label: string; defaultIndex: number }>;
  creditPreviewSampledUserIds: string[];
  usersJson: {
    draw: number | null;
    recordsTotal: number;
    recordsFiltered: number;
  } | null;
  usersHtml: string;
  loginHtmlSnippet: string;
  usersHtmlSnippet: string;
  mapping: SagaImportMapping;
  proposedMapping: SagaProposedMapping;
  catalogs: SagaImportCatalogs;
  statuses: Record<string, number | undefined>;
  locations: Record<string, string | null | undefined>;
  htmlLengths: Record<string, number | undefined>;
  logs: string[];
  message?: string;
};

export type SagaLookupFlightLeg = {
  id: string;
  date: string;
  role: string;
  dep: string;
  arr: string;
  landings: number;
  flightTime: string;
  navTime: string;
  ifrTime: string;
  nightTime: string;
  serviceTime: string;
  distance: string;
  engineStart?: string;
  takeoff?: string;
  landing?: string;
  engineCut?: string;
  mission?: string;
  functionOnBoard?: string;
  rules?: string;
  dayNight?: string;
  logbook?: string;
  grade?: string;
};

export type SagaLookupFlightPdfRecord = {
  ok: boolean;
  url: string;
  message?: string;
  objectiveMd?: string;
  briefingMd?: string;
  commentsMd?: string;
  dangerMd?: string;
  riskMd?: string;
  managementMd?: string;
  result?: string;
  exercises?: Array<{ title: string; grade: "NO" | "1" | "2" | "3" | "4" }>;
  legs?: Array<{
    date?: string;
    dep?: string;
    arr?: string;
    landings?: number;
    flightTime?: string;
    navTime?: string;
    ifrTime?: string;
    nightTime?: string;
    serviceTime?: string;
  }>;
  totalNavigationTime?: string;
  weightBalance?: {
    personsOnBoard?: number | null;
    occupantsWeightKg?: number | null;
    baggageWeightKg?: number | null;
    rampFuel?: { value: number; unit: "kg" | "l" } | null;
    taxiFuel?: { value: number; unit: "kg" | "l" } | null;
    tripFuel?: { value: number; unit: "kg" | "l" } | null;
  };
};

export type SagaLookupFlightResult = {
  ok: boolean;
  flight: null | {
    id: string;
    summary: {
      id: string;
      date: string;
      student: string;
      studentCanac: string;
      instructor: string;
      instructorCanac: string;
      aircraft: string;
      course: string;
      mission: string;
      route: string;
      start: string;
      end: string;
      flightTime: string;
      serviceTime: string;
      landings: number;
    };
    legs: SagaFlight[];
    metaLegs: SagaLookupFlightLeg[];
    pdfRecord?: SagaLookupFlightPdfRecord | null;
    headers: string[];
  };
  statuses: Record<string, number | undefined>;
  locations: Record<string, string | null | undefined>;
  htmlLengths: Record<string, number | undefined>;
  logs: string[];
  message?: string;
};

export const DEFAULT_SAGA_FLIGHT_COLUMN_MAP: Record<string, number> = {
  id: 0,
  perna: 1,
  dataDoVoo: 2,
  base: 3,
  aeronave: 4,
  instrutor: 5,
  canacInstrutor: 6,
  aluno: 7,
  canacAluno: 8,
  horimetroInicial: 9,
  horimetroFinal: 10,
  missaoDoAluno: 11,
  origem: 12,
  destino: 13,
  acionamento: 14,
  decolagem: 15,
  pouso: 16,
  corte: 17,
  tempoDeVooHhmm: 18,
  tempoDeServicoHhmm: 19,
  tempoDeVooHoras: 20,
  tempoDeServicoHoras: 21,
  numeroPousos: 22,
  distancia: 23,
  funcaoABordo: 24,
  regrasDeVoo: 25,
  diurnoOuNoturno: 26,
  diarioDeBordo: 27,
  grau: 28,
  combustivel: 29,
  ce: 30,
  oleo: 31,
  valorDoVoo: 32,
  curso: 33,
};

export const DEFAULT_SAGA_CREDIT_COLUMN_MAP: Record<string, number> = {
  model: 0,
  hours: 1,
  hoursHhmm: 2,
  hourlyValue: 3,
  totalValue: 4,
  purchaseDate: 5,
  expiresAt: 6,
  notes: 7,
  responsible: 8,
};

export function normalizeSagaCreditColumnMap(value: Record<string, number> | null | undefined): Record<string, number> {
  const out = { ...DEFAULT_SAGA_CREDIT_COLUMN_MAP };
  if (value && typeof value === "object") {
    for (const key of Object.keys(DEFAULT_SAGA_CREDIT_COLUMN_MAP)) {
      const raw = Number(value[key]);
      if (Number.isInteger(raw) && raw >= 0 && raw < 50) out[key] = raw;
    }
  }

  const legacyOffset = Object.entries(DEFAULT_SAGA_CREDIT_COLUMN_MAP).every(([key, index]) => out[key] === index + 1);
  if (legacyOffset) return { ...DEFAULT_SAGA_CREDIT_COLUMN_MAP };
  return out;
}

const EMPTY_MAPPING: SagaImportMapping = {
  aircraftBySaga: {},
  aircraftIdByRegistration: {},
  courseBySaga: {},
  missionBySaga: {},
  creditAircraftBySaga: {},
  flightColumnMap: DEFAULT_SAGA_FLIGHT_COLUMN_MAP,
  creditColumnMap: DEFAULT_SAGA_CREDIT_COLUMN_MAP,
  sendFlightsToSaga: false,
  syncScheduleFromSaga: false,
  syncAllUsersFromSaga: false,
  updatedAt: null,
};

function normalizeSagaImportResult(value: Partial<SagaImportResult> | null | undefined): SagaImportResult {
  const mapping = {
    aircraftBySaga: value?.mapping?.aircraftBySaga ?? {},
    aircraftIdByRegistration: value?.mapping?.aircraftIdByRegistration ?? {},
    courseBySaga: value?.mapping?.courseBySaga ?? {},
    missionBySaga: value?.mapping?.missionBySaga ?? {},
    creditAircraftBySaga: value?.mapping?.creditAircraftBySaga ?? {},
    flightColumnMap: value?.mapping?.flightColumnMap ?? DEFAULT_SAGA_FLIGHT_COLUMN_MAP,
    creditColumnMap: normalizeSagaCreditColumnMap(value?.mapping?.creditColumnMap),
    sendFlightsToSaga: value?.mapping?.sendFlightsToSaga === true,
    syncScheduleFromSaga: value?.mapping?.syncScheduleFromSaga === true,
    syncAllUsersFromSaga: value?.mapping?.syncAllUsersFromSaga === true,
    updatedAt: value?.mapping?.updatedAt ?? null,
  };
  return {
    ok: value?.ok === true,
    users: Array.isArray(value?.users) ? value.users : [],
    flights: Array.isArray(value?.flights) ? value.flights : [],
    flightHeaders: Array.isArray(value?.flightHeaders) ? value.flightHeaders : [],
    flightColumnDefs: Array.isArray(value?.flightColumnDefs) ? value.flightColumnDefs : [],
    financialEntries: Array.isArray(value?.financialEntries) ? value.financialEntries : [],
    financialHeaders: Array.isArray(value?.financialHeaders) ? value.financialHeaders : [],
    credits: Array.isArray(value?.credits) ? value.credits : [],
    creditHeaders: Array.isArray(value?.creditHeaders) ? value.creditHeaders : [],
    creditColumnDefs: Array.isArray(value?.creditColumnDefs) ? value.creditColumnDefs : [],
    creditPreviewSampledUserIds: Array.isArray(value?.creditPreviewSampledUserIds) ? value.creditPreviewSampledUserIds : [],
    usersJson: value?.usersJson ?? null,
    usersHtml: value?.usersHtml ?? "",
    loginHtmlSnippet: value?.loginHtmlSnippet ?? "",
    usersHtmlSnippet: value?.usersHtmlSnippet ?? "",
    mapping,
    proposedMapping: {
      aircraftBySaga: value?.proposedMapping?.aircraftBySaga ?? mapping.aircraftBySaga,
      aircraftIdByRegistration: value?.proposedMapping?.aircraftIdByRegistration ?? mapping.aircraftIdByRegistration,
      courseBySaga: value?.proposedMapping?.courseBySaga ?? mapping.courseBySaga,
      creditAircraftBySaga: value?.proposedMapping?.creditAircraftBySaga ?? mapping.creditAircraftBySaga,
      flightColumnMap: value?.proposedMapping?.flightColumnMap ?? mapping.flightColumnMap,
      creditColumnMap: normalizeSagaCreditColumnMap(value?.proposedMapping?.creditColumnMap ?? mapping.creditColumnMap),
      sendFlightsToSaga: value?.proposedMapping?.sendFlightsToSaga === true || mapping.sendFlightsToSaga === true,
      syncScheduleFromSaga: value?.proposedMapping?.syncScheduleFromSaga === true || mapping.syncScheduleFromSaga === true,
      syncAllUsersFromSaga: value?.proposedMapping?.syncAllUsersFromSaga === true || mapping.syncAllUsersFromSaga === true,
      missingAircrafts: Array.isArray(value?.proposedMapping?.missingAircrafts) ? value.proposedMapping.missingAircrafts : [],
      missingCourses: Array.isArray(value?.proposedMapping?.missingCourses) ? value.proposedMapping.missingCourses : [],
      missingCreditAircrafts: Array.isArray(value?.proposedMapping?.missingCreditAircrafts) ? value.proposedMapping.missingCreditAircrafts : [],
      updatedAt: value?.proposedMapping?.updatedAt ?? null,
    },
    catalogs: {
      aircrafts: Array.isArray(value?.catalogs?.aircrafts) ? value.catalogs.aircrafts : [],
      aircraftModels: Array.isArray(value?.catalogs?.aircraftModels) ? value.catalogs.aircraftModels : [],
      trainingTracks: Array.isArray(value?.catalogs?.trainingTracks) ? value.catalogs.trainingTracks : [],
    },
    statuses: value?.statuses ?? {},
    locations: value?.locations ?? {},
    htmlLengths: value?.htmlLengths ?? {},
    logs: Array.isArray(value?.logs) ? value.logs : [],
    message: value?.message,
  };
}

function parseJsonBody<T>(body: string | undefined, fallback: T): T {
  if (!body) return fallback;
  try {
    return JSON.parse(body) as T;
  } catch {
    return fallback;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function fetchSagaImportProgress(runId: string): Promise<SagaImportProgress | null> {
  if (!runId) return null;
  const { functions: fn, functionId } = getAdminFunctionClient();
  const execution = await fn.createExecution(
    functionId,
    JSON.stringify({ action: "sagaGetImportProgress", runId }),
    false,
  );
  const response = parseJsonBody<{ progress?: SagaImportProgress | null }>(execution.responseBody, {});
  return response.progress ?? null;
}

async function waitForFunctionExecution(
  functionId: string,
  executionId: string,
  timeoutMs = 90000,
  options: { progressRunId?: string; onProgress?: (progress: SagaImportProgress) => void } = {},
) {
  const { functions: fn } = getAdminFunctionClient();
  const startedAt = Date.now();
  let lastExecution = await fn.getExecution(functionId, executionId);

  while (lastExecution.status === "processing" || lastExecution.status === "waiting") {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("A importacao ainda esta em andamento no Appwrite. Aguarde um pouco e confira as execucoes da Function.");
    }
    await sleep(2000);
    const [nextExecution, progress] = await Promise.all([
      fn.getExecution(functionId, executionId),
      options.progressRunId ? fetchSagaImportProgress(options.progressRunId).catch(() => null) : Promise.resolve(null),
    ]);
    if (progress && options.onProgress) options.onProgress(progress);
    lastExecution = nextExecution;
  }

  if (options.progressRunId && options.onProgress) {
    const progress = await fetchSagaImportProgress(options.progressRunId).catch(() => null);
    if (progress) options.onProgress(progress);
  }
  return lastExecution;
}

function isSagaExecutionTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes("A importacao ainda esta em andamento no Appwrite");
}

function summaryMatchesRunId(summary: SagaImportSummary | null | undefined, runId?: string): boolean {
  if (!summary) return false;
  if (!runId) return true;
  return String(summary.importRunId || "").trim() === String(runId || "").trim();
}

async function waitForSagaRunCompletion(
  importRunId: string,
  options: { onProgress?: (progress: SagaImportProgress) => void; timeoutMs?: number } = {},
): Promise<SagaImportProgress | null> {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? 15 * 60 * 1000;
  let lastProgress: SagaImportProgress | null = null;
  while (Date.now() - startedAt <= timeoutMs) {
    const progress = await fetchSagaImportProgress(importRunId).catch(() => null);
    if (progress) {
      lastProgress = progress;
      if (options.onProgress) options.onProgress(progress);
      const status = String(progress.status || "").toLowerCase();
      if (status === "completed" || status === "failed") return progress;
    }
    await sleep(2500);
  }
  return lastProgress;
}

async function fetchLastSagaImportSummary(): Promise<SagaImportSummary | null> {
  const { functions: fn, functionId } = getAdminFunctionClient();
  const execution = await fn.createExecution(
    functionId,
    JSON.stringify({ action: "sagaGetLastImportSummary" }),
    false,
  );
  const response = parseJsonBody<{ summary?: SagaImportSummary | null }>(execution.responseBody, {});
  return response.summary ?? null;
}

function parseResponse(body: string | undefined): SagaImportResult {
  if (!body) {
    return normalizeSagaImportResult(null);
  }
  try {
    return normalizeSagaImportResult(JSON.parse(body) as Partial<SagaImportResult>);
  } catch {
    return normalizeSagaImportResult({
      logs: ["Resposta da funcao nao estava em JSON."],
      message: body.slice(0, 500),
    });
  }
}

function getAdminFunctionClient() {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    throw new Error("Funcao administrativa nao configurada. Defina VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID.");
  }
  return { functions, functionId: ADMIN_USERS_FUNCTION_ID };
}

export async function fetchSagaUsers(params: { email: string; password: string; sendFlightsToSaga?: boolean }): Promise<SagaImportResult> {
  const { functions: fn, functionId } = getAdminFunctionClient();

  const execution = await fn.createExecution(
    functionId,
    JSON.stringify({ action: "sagaFetchUsers", email: params.email, password: params.password, sendFlightsToSaga: params.sendFlightsToSaga === true }),
    false,
  );
  const response = parseResponse(execution.responseBody);
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    const error = new Error(response.message || "Falha ao buscar usuarios no SAGA.") as Error & {
      sagaResult?: SagaImportResult;
    };
    error.sagaResult = response;
    throw error;
  }
  return response;
}

export async function getSagaImportSettings(): Promise<SagaImportSettings> {
  const { functions: fn, functionId } = getAdminFunctionClient();

  const execution = await fn.createExecution(
    functionId,
    JSON.stringify({ action: "sagaGetImportSettings" }),
    false,
  );
  const response = parseJsonBody<{ ok?: boolean; mapping?: SagaImportMapping; catalogs?: SagaImportCatalogs; credentials?: SagaImportCredentials; message?: string }>(
    execution.responseBody,
    {},
  );
  if (execution.status === "failed" || execution.responseStatusCode >= 400 || !response.mapping) {
    throw new Error(response.message || "Falha ao carregar configuracoes do import SAGA.");
  }
  return {
    mapping: {
      aircraftBySaga: response.mapping.aircraftBySaga ?? {},
      aircraftIdByRegistration: response.mapping.aircraftIdByRegistration ?? {},
      courseBySaga: response.mapping.courseBySaga ?? {},
      missionBySaga: response.mapping.missionBySaga ?? {},
      creditAircraftBySaga: response.mapping.creditAircraftBySaga ?? {},
      flightColumnMap: response.mapping.flightColumnMap ?? DEFAULT_SAGA_FLIGHT_COLUMN_MAP,
      creditColumnMap: normalizeSagaCreditColumnMap(response.mapping.creditColumnMap),
      sendFlightsToSaga: response.mapping.sendFlightsToSaga === true,
      syncScheduleFromSaga: response.mapping.syncScheduleFromSaga === true,
      syncAllUsersFromSaga: response.mapping.syncAllUsersFromSaga === true,
      updatedAt: response.mapping.updatedAt ?? null,
    },
    catalogs: {
      aircrafts: Array.isArray(response.catalogs?.aircrafts) ? response.catalogs.aircrafts : [],
      aircraftModels: Array.isArray(response.catalogs?.aircraftModels) ? response.catalogs.aircraftModels : [],
      trainingTracks: Array.isArray(response.catalogs?.trainingTracks) ? response.catalogs.trainingTracks : [],
    },
    credentials: {
      email: response.credentials?.email ?? "",
      password: response.credentials?.password ?? "",
      updatedAt: response.credentials?.updatedAt ?? null,
    },
  };
}

export async function saveSagaImportMapping(mapping: SagaImportMapping): Promise<SagaImportMapping> {
  const { functions: fn, functionId } = getAdminFunctionClient();

  const execution = await fn.createExecution(
    functionId,
    JSON.stringify({ action: "sagaSaveImportMapping", mapping }),
    false,
  );
  const response = parseJsonBody<{ ok?: boolean; mapping?: SagaImportMapping; message?: string }>(execution.responseBody, {
    mapping: EMPTY_MAPPING,
  });
  if (execution.status === "failed" || execution.responseStatusCode >= 400 || !response.mapping) {
    throw new Error(response.message || "Falha ao salvar de-para do SAGA.");
  }
  return response.mapping;
}

export type SagaScheduleSyncMode = "upsert" | "cancel";

export type SagaScheduleSyncResult = {
  ok: boolean;
  skipped?: boolean;
  mode: SagaScheduleSyncMode;
  status: "synced" | "cancelled" | "failed" | "skipped";
  message: string;
  flightId: string;
  sagaScheduleId?: string | null;
  httpStatus?: number | null;
  endpoint?: string | null;
  requestPayload?: Record<string, unknown> | null;
  response?: unknown;
  logs: string[];
};

export async function syncSagaScheduleEvent(
  flightId: string,
  mode: SagaScheduleSyncMode,
  options: { allowCreate?: boolean; sagaScheduleId?: string | null } = {},
): Promise<SagaScheduleSyncResult> {
  const { functions: fn, functionId } = getAdminFunctionClient();

  const execution = await fn.createExecution({
    functionId,
    body: JSON.stringify({
      action: "syncSagaScheduleEvent",
      flightId,
      mode,
      allowCreate: options.allowCreate === true,
      sagaScheduleId: options.sagaScheduleId ?? null,
    }),
    async: false,
  });
  const response = parseJsonBody<SagaScheduleSyncResult>(execution.responseBody, {
    ok: false,
    mode,
    status: "failed",
    message: "Resposta da funcao de sincronizacao SAGA nao estava em JSON valido.",
    flightId,
    logs: [],
  });
  if (execution.status === "failed" || execution.responseStatusCode >= 500) {
    return {
      ...response,
      ok: false,
      status: "failed",
      message: response.message || "Falha ao sincronizar agenda SAGA.",
      httpStatus: response.httpStatus ?? execution.responseStatusCode,
    };
  }
  return response;
}

export type SagaScheduleJobResult = {
  ok: boolean;
  skipped?: boolean;
  forced?: boolean;
  message?: string;
  imported?: number;
  updated?: number;
  importedUsers?: {
    students?: number;
    instructors?: number;
  };
  logs?: string[];
};

export type SagaAllUsersSyncJobResult = {
  ok: boolean;
  skipped?: boolean;
  forced?: boolean;
  message?: string;
  flightsCreated?: number;
  flightsUpdated?: number;
  flightsDeleted?: number;
  flightsSkipped?: number;
  creditsCreated?: number;
  creditsUpdated?: number;
  creditsSkipped?: number;
  logs?: string[];
};

export async function runSagaScheduleSyncNow(force = false): Promise<SagaScheduleJobResult> {
  const { functions: fn, functionId } = getAdminFunctionClient();
  const createdExecution = await fn.createExecution(
    functionId,
    JSON.stringify({ action: "sagaSyncScheduleJob", force }),
    true,
  );
  const execution = await waitForFunctionExecution(functionId, createdExecution.$id, 280000);
  const response = parseJsonBody<SagaScheduleJobResult>(execution.responseBody, {
    ok: false,
    message: "Resposta da sincronizacao de escala nao estava em JSON valido.",
    logs: [],
  });
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || "Falha ao executar sincronizacao manual da escala SAGA.");
  }
  return response;
}

export async function runSagaAllUsersSyncNow(force = false): Promise<SagaAllUsersSyncJobResult> {
  const { functions: fn, functionId } = getAdminFunctionClient();
  const createdExecution = await fn.createExecution(
    functionId,
    JSON.stringify({ action: "sagaSyncAllUsersFromSagaJob", force }),
    true,
  );
  const execution = await waitForFunctionExecution(functionId, createdExecution.$id, 280000);
  const response = parseJsonBody<SagaAllUsersSyncJobResult>(execution.responseBody, {
    ok: false,
    message: "Resposta da sincronizacao geral SAGA nao estava em JSON valido.",
    logs: [],
  });
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || "Falha ao executar sincronizacao geral do SAGA.");
  }
  return response;
}

export type SagaScheduleItem = {
  id: string;
  startAt: string;
  endAt: string;
  startAtRaw: string;
  endAtRaw: string;
  createdAt: string;
  studentSagaId: string;
  instructorSagaId: string;
  aircraftSagaId: string;
  aircraft: string;
  aircraftModel: string;
  studentName: string;
  instructorName: string;
  notes: string;
  status: string;
  active: boolean;
  raw: Record<string, unknown>;
};

export async function fetchSagaSchedules(): Promise<{ ok: boolean; schedules: SagaScheduleItem[]; logs: string[] }> {
  const { functions: fn, functionId } = getAdminFunctionClient();
  const execution = await fn.createExecution(
    functionId,
    JSON.stringify({ action: "sagaFetchSchedules" }),
    false,
  );
  const response = parseJsonBody<{ ok: boolean; schedules: SagaScheduleItem[]; logs: string[]; message?: string }>(
    execution.responseBody,
    { ok: false, schedules: [], logs: [] },
  );
  if (execution.status === "failed" || execution.responseStatusCode >= 400 || !response.ok) {
    throw new Error(response.message || "Falha ao buscar agendamentos do SAGA.");
  }
  return response;
}

type SagaImportExecutionResult = {
  ok?: boolean;
  paused?: boolean;
  summary?: SagaImportSummary;
  pendingMission?: SagaImportPendingMission;
  resumeFlightIndex?: number;
  message?: string;
};

async function resolvePausedImportResponse(
  response: SagaImportExecutionResult,
  importRunId?: string,
): Promise<SagaImportExecutionResult> {
  if (response.paused && response.pendingMission?.lookupKey) return response;
  if (!importRunId) return response;
  const progress = await fetchSagaImportProgress(importRunId).catch(() => null);
  if (progress?.status === "awaiting_mission_mapping" && progress.pendingMission?.lookupKey) {
    return {
      ok: true,
      paused: true,
      pendingMission: progress.pendingMission,
      summary: response.summary,
      resumeFlightIndex: response.resumeFlightIndex,
    };
  }
  return response;
}

async function enrichSagaImportExecutionResult(
  response: SagaImportExecutionResult,
  execution: { status?: string; responseStatusCode?: number; responseBody?: string },
  importRunId?: string,
): Promise<SagaImportExecutionResult> {
  let enriched = { ...response };
  if (enriched.summary || enriched.paused) return enriched;

  const progress = importRunId ? await fetchSagaImportProgress(importRunId).catch(() => null) : null;
  if (progress?.status === "awaiting_mission_mapping" && progress.pendingMission?.lookupKey) {
    return {
      ok: true,
      paused: true,
      pendingMission: progress.pendingMission,
      summary: enriched.summary,
      resumeFlightIndex: enriched.resumeFlightIndex,
      message: progress.message,
    };
  }

  const lastSummary = await fetchLastSagaImportSummary().catch(() => null);
  if (lastSummary) {
    enriched = { ...enriched, ok: true, summary: lastSummary };
  }

  const detail =
    enriched.message ||
    progress?.message ||
    (execution.responseBody && execution.responseBody.length < 800
      ? execution.responseBody
      : "") ||
    (execution.status === "failed"
      ? `A function admin-users encerrou com status "${execution.status}" (HTTP ${execution.responseStatusCode ?? "?"}). Verifique Execucoes no Appwrite.`
      : "");
  if (detail) enriched.message = detail;

  return enriched;
}

function sagaImportErrorMessage(response: SagaImportExecutionResult, execution: { status?: string; responseStatusCode?: number }) {
  if (response.message) return response.message;
  if (execution.status === "failed") {
    return `Import SAGA interrompido na function (HTTP ${execution.responseStatusCode ?? "?"}). Confira Execucoes > admin-users.`;
  }
  return "Falha ao importar dados do SAGA.";
}

async function executeSagaImportAction(
  action: "sagaImportData" | "sagaResumeImportData",
  body: Record<string, unknown>,
  options: { importRunId?: string; onProgress?: (progress: SagaImportProgress) => void } = {},
): Promise<SagaImportExecutionResult> {
  const { functions: fn, functionId } = getAdminFunctionClient();
  const createdExecution = await fn.createExecution(functionId, JSON.stringify({ action, ...body }), true);
  const execution = await waitForFunctionExecution(functionId, createdExecution.$id, 280000, {
    progressRunId: options.importRunId,
    onProgress: options.onProgress,
  });
  let response = parseJsonBody<SagaImportExecutionResult>(execution.responseBody, {});
  response = await resolvePausedImportResponse(response, options.importRunId);
  if (execution.status === "failed" || (execution.responseStatusCode ?? 0) >= 400) {
    response = await enrichSagaImportExecutionResult(response, execution, options.importRunId);
    response = await resolvePausedImportResponse(response, options.importRunId);
    if (!response.paused) {
      throw new Error(sagaImportErrorMessage(response, execution));
    }
  }
  if (!response.summary) {
    response = await enrichSagaImportExecutionResult(response, execution, options.importRunId);
    response = await resolvePausedImportResponse(response, options.importRunId);
  }
  if (!response.summary && !response.paused) {
    throw new Error(sagaImportErrorMessage(response, execution));
  }
  return response;
}

export async function resumeSagaImportMissionMapping(params: {
  runId: string;
  lookupKey: string;
  missionId: string;
  resumeFlightIndex?: number;
  users: SagaUser[];
  flights: SagaFlight[];
  financialEntries?: SagaFinancialEntry[];
  mapping: SagaImportMapping;
  scope?: SagaImportScope;
  testMode: boolean;
  email: string;
  password: string;
  selectedSagaUserIds?: string[];
  useEmailAlias?: boolean;
  onProgress?: (progress: SagaImportProgress) => void;
}): Promise<SagaImportExecutionResult> {
  return executeSagaImportAction(
    "sagaResumeImportData",
    {
      runId: params.runId,
      lookupKey: params.lookupKey,
      missionId: params.missionId,
      resumeFlightIndex: params.resumeFlightIndex,
      users: params.users,
      flights: params.flights,
      financialEntries: params.financialEntries ?? [],
      mapping: params.mapping,
      scope: params.scope ?? undefined,
      testMode: params.testMode,
      email: params.email,
      password: params.password,
      selectedSagaUserIds: params.selectedSagaUserIds ?? [],
      useEmailAlias: params.useEmailAlias === true,
      importRunId: params.runId,
    },
    { importRunId: params.runId, onProgress: params.onProgress },
  );
}

export async function importSagaData(params: {
  users: SagaUser[];
  flights: SagaFlight[];
  financialEntries?: SagaFinancialEntry[];
  mapping: SagaImportMapping;
  scope?: SagaImportScope;
  testMode: boolean;
  email: string;
  password: string;
  selectedSagaUserIds?: string[];
  useEmailAlias?: boolean;
  importRunId?: string;
  onProgress?: (progress: SagaImportProgress) => void;
  onAwaitingMissionMapping?: (pending: SagaImportPendingMission) => Promise<string>;
}): Promise<SagaImportSummary> {
  let mapping = params.mapping;
  let response = await resolvePausedImportResponse(
    await executeSagaImportAction(
      "sagaImportData",
      {
        users: params.users,
        flights: params.flights,
        financialEntries: params.financialEntries ?? [],
        mapping,
        scope: params.scope ?? undefined,
        testMode: params.testMode,
        email: params.email,
        password: params.password,
        selectedSagaUserIds: params.selectedSagaUserIds ?? [],
        useEmailAlias: params.useEmailAlias === true,
        importRunId: params.importRunId,
      },
      { importRunId: params.importRunId, onProgress: params.onProgress },
    ),
    params.importRunId,
  );

  while (true) {
    if (!response.paused) {
      if (!response.summary && params.importRunId) {
        const progress = await fetchSagaImportProgress(params.importRunId).catch(() => null);
        if (progress?.status === "awaiting_mission_mapping" && progress.pendingMission?.lookupKey) {
          response = {
            ok: true,
            paused: true,
            pendingMission: progress.pendingMission,
            summary: response.summary,
            resumeFlightIndex: response.resumeFlightIndex,
          };
          continue;
        }
      }
      break;
    }

    const pending =
      response.pendingMission ||
      (params.importRunId ? (await fetchSagaImportProgress(params.importRunId))?.pendingMission : null) ||
      null;
    if (!pending?.lookupKey) {
      throw new Error("Import pausado aguardando de-para de missao, mas os dados da ficha nao foram retornados.");
    }
    if (!params.onAwaitingMissionMapping) {
      throw new Error(`Missao SAGA sem correspondencia: ${pending.rawMission || pending.lookupKey}. Configure o de-para e tente novamente.`);
    }
    const missionId = await params.onAwaitingMissionMapping(pending);
    if (!missionId) throw new Error("Selecione uma missao local para continuar o import.");
    mapping = {
      ...mapping,
      missionBySaga: { ...(mapping.missionBySaga ?? {}), [pending.lookupKey]: missionId },
    };
    await saveSagaImportMapping(mapping).catch(() => null);
    response = await resolvePausedImportResponse(
      await resumeSagaImportMissionMapping({
        runId: params.importRunId || response.summary?.importRunId || "",
        lookupKey: pending.lookupKey,
        missionId,
        resumeFlightIndex: response.resumeFlightIndex,
        users: params.users,
        flights: params.flights,
        financialEntries: params.financialEntries,
        mapping,
        scope: params.scope,
        testMode: params.testMode,
        email: params.email,
        password: params.password,
        selectedSagaUserIds: params.selectedSagaUserIds,
        useEmailAlias: params.useEmailAlias,
        onProgress: params.onProgress,
      }),
      params.importRunId,
    );
  }

  if (!response.summary) {
    const progress = params.importRunId ? await fetchSagaImportProgress(params.importRunId).catch(() => null) : null;
    const lastSummary = await fetchLastSagaImportSummary().catch(() => null);
    const detail = response.message || progress?.message;
    if (lastSummary && (lastSummary.flightsCreated > 0 || lastSummary.flightsUpdated > 0 || lastSummary.creditsCreated > 0)) {
      return lastSummary;
    }
    throw new Error(detail || "Falha ao importar dados do SAGA.");
  }
  return response.summary;
}

export async function importSelfFlightsFromSaga(
  options: { onProgress?: (progress: SagaImportProgress) => void } = {},
): Promise<SagaImportSummary> {
  const { functions: fn, functionId } = getAdminFunctionClient();
  const importRunId = crypto.randomUUID();
  const createdExecution = await fn.createExecution(
    functionId,
    JSON.stringify({ action: "sagaImportSelfFlights", importRunId }),
    true,
  );
  let execution: Awaited<ReturnType<typeof waitForFunctionExecution>> | null = null;
  let timedOut = false;
  try {
    execution = await waitForFunctionExecution(functionId, createdExecution.$id, 280000, {
      progressRunId: importRunId,
      onProgress: options.onProgress,
    });
  } catch (error) {
    if (!isSagaExecutionTimeoutError(error)) throw error;
    timedOut = true;
  }

  const shouldWaitForTerminalProgress =
    timedOut ||
    !execution ||
    execution.status === "processing" ||
    execution.status === "waiting";
  const terminalProgress = shouldWaitForTerminalProgress
    ? await waitForSagaRunCompletion(importRunId, {
        onProgress: options.onProgress,
        timeoutMs: 3 * 60 * 1000,
      }).catch(() => null)
    : null;
  if (terminalProgress && String(terminalProgress.status || "").toLowerCase() === "failed") {
    throw new Error(terminalProgress.message || "Falha ao sincronizar voos do SAGA.");
  }

  const response = execution
    ? parseJsonBody<{ ok?: boolean; summary?: SagaImportSummary; message?: string }>(execution.responseBody, {})
    : {};
  if (execution && (execution.status === "failed" || (execution.responseStatusCode ?? 0) >= 400)) {
    if (!terminalProgress || String(terminalProgress.status || "").toLowerCase() !== "completed") {
      throw new Error(response.message || terminalProgress?.message || "Falha ao sincronizar voos do SAGA.");
    }
  }
  // responseBody is often empty for async executions in Appwrite Cloud — fall back to saved summary by runId
  const lastSummary = await fetchLastSagaImportSummary().catch(() => null);
  const summary = summaryMatchesRunId(response.summary ?? null, importRunId)
    ? (response.summary ?? null)
    : summaryMatchesRunId(lastSummary, importRunId)
      ? lastSummary
      : response.summary ?? lastSummary;
  if (!summary) throw new Error(response.message || terminalProgress?.message || "Falha ao sincronizar voos do SAGA: tente novamente.");
  return summary;
}

export async function reloadSagaFlightFromSource(params: {
  flightId: string;
  sagaFlightId?: string;
  missionLookupKey?: string;
  missionId?: string;
  skipMissionMapping?: boolean;
}): Promise<SagaReloadFlightResult> {
  const { functions: fn, functionId } = getAdminFunctionClient();
  const execution = await fn.createExecution(
    functionId,
    JSON.stringify({
      action: "sagaReloadSingleFlight",
      flightId: params.flightId,
      sagaFlightId: params.sagaFlightId ?? null,
      missionLookupKey: params.missionLookupKey ?? null,
      missionId: params.missionId ?? null,
      skipMissionMapping: params.skipMissionMapping === true,
    }),
    false,
  );
  const response = parseJsonBody<SagaReloadFlightResult>(execution.responseBody, {
    ok: false,
    message: "Resposta inválida ao recarregar voo do SAGA.",
  });
  if (execution.status === "failed" || (execution.responseStatusCode ?? 0) >= 400 || !response.ok) {
    throw new Error(response.message || "Falha ao recarregar dados do voo no SAGA.");
  }
  return response;
}

export async function importSelfCreditsFromSaga(): Promise<SagaImportSummary> {
  const { functions: fn, functionId } = getAdminFunctionClient();
  const createdExecution = await fn.createExecution(
    functionId,
    JSON.stringify({ action: "sagaImportSelfCredits" }),
    true,
  );
  const execution = await waitForFunctionExecution(functionId, createdExecution.$id, 280000);
  const response = parseJsonBody<{ ok?: boolean; summary?: SagaImportSummary; message?: string }>(execution.responseBody, {});
  if (execution.status === "failed" || (execution.responseStatusCode ?? 0) >= 400) {
    throw new Error(response.message || "Falha ao sincronizar creditos do SAGA.");
  }
  const summary = response.summary ?? await fetchLastSagaImportSummary().catch(() => null);
  if (!summary) throw new Error(response.message || "Falha ao sincronizar creditos do SAGA: tente novamente.");
  return summary;
}

export async function lookupSagaFlight(sagaFlightId: string): Promise<SagaLookupFlightResult> {
  const { functions: fn, functionId } = getAdminFunctionClient();

  const execution = await fn.createExecution(
    functionId,
    JSON.stringify({ action: "sagaLookupFlight", sagaFlightId }),
    false,
  );
  const response = parseJsonBody<SagaLookupFlightResult>(
    execution.responseBody,
    { ok: false, flight: null, statuses: {}, locations: {}, htmlLengths: {}, logs: [] },
  );
  if (execution.status === "failed" || execution.responseStatusCode >= 400 || !response.ok) {
    throw new Error(response.message || "Falha ao buscar voo no SAGA.");
  }
  return response;
}
