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
  courseBySaga: Record<string, string>;
  creditAircraftBySaga: Record<string, string>;
  flightColumnMap: Record<string, number>;
  creditColumnMap: Record<string, number>;
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
  requestedUsers: number;
  requestedFlightGroups: number;
  usersCreated: number;
  usersUpdated: number;
  usersSkipped: number;
  flightsCreated: number;
  flightsUpdated: number;
  flightsSkipped: number;
  duplicateFlights: number;
  trainingAssignmentsTouched: number;
  anacSynced: number;
  anacPending: number;
  anacFailed: number;
  creditsCreated: number;
  creditsUpdated: number;
  creditsSkipped: number;
  creditHoursImported: number;
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
  model: 1,
  hours: 2,
  hoursHhmm: 3,
  hourlyValue: 4,
  totalValue: 5,
  purchaseDate: 6,
  expiresAt: 7,
  notes: 8,
  responsible: 9,
};

const EMPTY_MAPPING: SagaImportMapping = {
  aircraftBySaga: {},
  courseBySaga: {},
  creditAircraftBySaga: {},
  flightColumnMap: DEFAULT_SAGA_FLIGHT_COLUMN_MAP,
  creditColumnMap: DEFAULT_SAGA_CREDIT_COLUMN_MAP,
  updatedAt: null,
};

function normalizeSagaImportResult(value: Partial<SagaImportResult> | null | undefined): SagaImportResult {
  const mapping = {
    aircraftBySaga: value?.mapping?.aircraftBySaga ?? {},
    courseBySaga: value?.mapping?.courseBySaga ?? {},
    creditAircraftBySaga: value?.mapping?.creditAircraftBySaga ?? {},
    flightColumnMap: value?.mapping?.flightColumnMap ?? DEFAULT_SAGA_FLIGHT_COLUMN_MAP,
    creditColumnMap: value?.mapping?.creditColumnMap ?? DEFAULT_SAGA_CREDIT_COLUMN_MAP,
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
      courseBySaga: value?.proposedMapping?.courseBySaga ?? mapping.courseBySaga,
      creditAircraftBySaga: value?.proposedMapping?.creditAircraftBySaga ?? mapping.creditAircraftBySaga,
      flightColumnMap: value?.proposedMapping?.flightColumnMap ?? mapping.flightColumnMap,
      creditColumnMap: value?.proposedMapping?.creditColumnMap ?? mapping.creditColumnMap,
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

export async function importSagaData(params: {
  users: SagaUser[];
  flights: SagaFlight[];
  mapping: SagaImportMapping;
  testMode: boolean;
  email: string;
  password: string;
}): Promise<SagaImportSummary> {
  const { functions: fn, functionId } = getAdminFunctionClient();

  const execution = await fn.createExecution(
    functionId,
    JSON.stringify({
      action: "sagaImportData",
      users: params.users,
      flights: params.flights,
      mapping: params.mapping,
      testMode: params.testMode,
      email: params.email,
      password: params.password,
    }),
    false,
  );
  const response = parseJsonBody<{ ok?: boolean; summary?: SagaImportSummary; message?: string }>(execution.responseBody, {});
  if (execution.status === "failed" || execution.responseStatusCode >= 400 || !response.summary) {
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
