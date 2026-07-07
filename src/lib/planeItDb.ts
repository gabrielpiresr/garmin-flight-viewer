import { ADMIN_USERS_FUNCTION_ID, functions } from "./appwrite";

export type PlaneItSettings = {
  email: string;
  password: string;
  updatedAt: string | null;
};

export type PlaneItAircraftTotal = {
  planeItId: string;
  horasVooEtapaDecimalTotal: number | null;
};

export type PlaneItAircraftTotalsResult = {
  totals: Record<string, PlaneItAircraftTotal>;
  updatedAt: string | null;
};

function getAdminFunctionClient() {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    throw new Error("Funcao administrativa nao configurada. Defina VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID.");
  }
  return { functions, functionId: ADMIN_USERS_FUNCTION_ID };
}

function parseJsonBody<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function executePlaneItAction<T>(payload: Record<string, unknown>, fallback: T, errorMessage: string): Promise<T> {
  const { functions: fn, functionId } = getAdminFunctionClient();
  const execution = await fn.createExecution(functionId, JSON.stringify(payload), false);
  const response = parseJsonBody<T & { message?: string }>(execution.responseBody, fallback as T & { message?: string });
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || errorMessage);
  }
  return response;
}

export async function getPlaneItSettings(): Promise<PlaneItSettings> {
  const response = await executePlaneItAction<{ settings?: PlaneItSettings; message?: string }>(
    { action: "planeItGetSettings" },
    {},
    "Falha ao carregar configuracoes do Plane It.",
  );
  return {
    email: response.settings?.email ?? "",
    password: response.settings?.password ?? "",
    updatedAt: response.settings?.updatedAt ?? null,
  };
}

export async function savePlaneItSettings(settings: Pick<PlaneItSettings, "email" | "password">): Promise<PlaneItSettings> {
  const response = await executePlaneItAction<{ settings?: PlaneItSettings; message?: string }>(
    { action: "planeItSaveSettings", settings },
    {},
    "Falha ao salvar configuracoes do Plane It.",
  );
  if (!response.settings) throw new Error("Configuracoes do Plane It nao retornadas.");
  return response.settings;
}

export async function fetchPlaneItAircraftTotals(planeItIds: string[]): Promise<PlaneItAircraftTotalsResult> {
  const ids = Array.from(new Set(planeItIds.map((id) => id.trim()).filter(Boolean)));
  if (!ids.length) return { totals: {}, updatedAt: null };
  const response = await executePlaneItAction<PlaneItAircraftTotalsResult & { message?: string }>(
    { action: "planeItAircraftTotals", planeItIds: ids },
    { totals: {}, updatedAt: null },
    "Falha ao consultar dados no Plane It.",
  );
  return {
    totals: response.totals ?? {},
    updatedAt: response.updatedAt ?? null,
  };
}
