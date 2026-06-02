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
  creditAircraftBySaga: Record<string, string>;
  flightColumnMap: Record<string, number>;
  creditColumnMap: Record<string, number>;
  sendFlightsToSaga?: boolean;
  updatedAt?: string | null;
};

export type SagaImportCatalogs = {
  aircrafts: Array<{ id: string; registration: string; nickname: string; active: boolean; modelId?: string; modelName?: string }>;
  aircraftModels: Array<{ id: string; name: string; manufacturer: string }>;
  trainingTracks: Array<{ id: string; name: string; active: boolean }>;
};

export type SagaProposedMapping = SagaImportMapping & {
  missingAircrafts: string[];
  missingCourses: string[];
  missingCreditAircrafts: string[];
};

export type SagaImportSummary = {
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
  creditAircraftBySaga: {},
  flightColumnMap: DEFAULT_SAGA_FLIGHT_COLUMN_MAP,
  creditColumnMap: DEFAULT_SAGA_CREDIT_COLUMN_MAP,
  sendFlightsToSaga: false,
  updatedAt: null,
};

function normalizeSagaImportResult(value: Partial<SagaImportResult> | null | undefined): SagaImportResult {
  const mapping = {
    aircraftBySaga: value?.mapping?.aircraftBySaga ?? {},
    aircraftIdByRegistration: value?.mapping?.aircraftIdByRegistration ?? {},
    courseBySaga: value?.mapping?.courseBySaga ?? {},
    creditAircraftBySaga: value?.mapping?.creditAircraftBySaga ?? {},
    flightColumnMap: value?.mapping?.flightColumnMap ?? DEFAULT_SAGA_FLIGHT_COLUMN_MAP,
    creditColumnMap: normalizeSagaCreditColumnMap(value?.mapping?.creditColumnMap),
    sendFlightsToSaga: value?.mapping?.sendFlightsToSaga === true,
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

async function waitForFunctionExecution(functionId: string, executionId: string, timeoutMs = 90000) {
  const { functions: fn } = getAdminFunctionClient();
  const startedAt = Date.now();
  let lastExecution = await fn.getExecution(functionId, executionId);

  while (lastExecution.status === "processing" || lastExecution.status === "waiting") {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("A importacao ainda esta em andamento no Appwrite. Aguarde um pouco e confira as execucoes da Function.");
    }
    await sleep(2000);
    lastExecution = await fn.getExecution(functionId, executionId);
  }

  return lastExecution;
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

export async function fetchSagaUsers(params: { email: string; password: string }): Promise<SagaImportResult> {
  const { functions: fn, functionId } = getAdminFunctionClient();

  const execution = await fn.createExecution(
    functionId,
    JSON.stringify({ action: "sagaFetchUsers", email: params.email, password: params.password }),
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

export async function importSagaData(params: {
  users: SagaUser[];
  flights: SagaFlight[];
  financialEntries?: SagaFinancialEntry[];
  mapping: SagaImportMapping;
  testMode: boolean;
  email: string;
  password: string;
  selectedSagaUserIds?: string[];
  useEmailAlias?: boolean;
}): Promise<SagaImportSummary> {
  const { functions: fn, functionId } = getAdminFunctionClient();

  const createdExecution = await fn.createExecution(
    functionId,
    JSON.stringify({
      action: "sagaImportData",
      users: params.users,
      flights: params.flights,
      financialEntries: params.financialEntries ?? [],
      mapping: params.mapping,
      testMode: params.testMode,
      email: params.email,
      password: params.password,
      selectedSagaUserIds: params.selectedSagaUserIds ?? [],
      useEmailAlias: params.useEmailAlias === true,
    }),
    true,
  );
  const execution = await waitForFunctionExecution(functionId, createdExecution.$id, 280000);
  let response = parseJsonBody<{ ok?: boolean; summary?: SagaImportSummary; message?: string }>(execution.responseBody, {});
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || "Falha ao importar dados do SAGA.");
  }
  if (!response.summary) {
    const fallback = await fetchLastSagaImportSummary();
    if (fallback) response = { ok: true, summary: fallback };
  }
  if (!response.summary) {
    throw new Error(response.message || "Falha ao importar dados do SAGA.");
  }
  return response.summary;
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
