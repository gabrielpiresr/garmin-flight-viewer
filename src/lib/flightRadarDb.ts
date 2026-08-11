import { ADMIN_USERS_FUNCTION_ID, functions } from "./appwrite";
import type {
  FlightRadarLiveResponse,
  FlightRadarSettings,
  FlightRadarSettingsInput,
  FlightRadarSummary,
  FlightRadarTrack,
} from "../types/flightRadar";

type FlightRadarResponse = {
  message?: string;
  query?: string;
  settings?: FlightRadarSettings;
  positions?: FlightRadarLiveResponse["positions"];
  trackedRegistrations?: string[];
  fetchedAt?: string;
  track?: FlightRadarTrack;
  summaries?: FlightRadarSummary[];
};

async function execute(payload: Record<string, unknown>): Promise<FlightRadarResponse> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    throw new Error("Função administrativa não configurada.");
  }
  const execution = await functions.createExecution(
    ADMIN_USERS_FUNCTION_ID,
    JSON.stringify(payload),
    false,
  );
  let response: FlightRadarResponse = {};
  try {
    response = execution.responseBody
      ? (JSON.parse(execution.responseBody) as FlightRadarResponse)
      : {};
  } catch {
    response = {};
  }
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || "Falha na integração Flightradar24.");
  }
  return response;
}

export async function getFlightRadarSettings(): Promise<FlightRadarSettings> {
  const response = await execute({ action: "getFlightRadarSettings" });
  if (!response.settings) throw new Error("Configuração do Radar não retornada.");
  return response.settings;
}

export async function saveFlightRadarSettings(
  input: FlightRadarSettingsInput,
): Promise<FlightRadarSettings> {
  const response = await execute({ action: "saveFlightRadarSettings", settings: input });
  if (!response.settings) throw new Error("Configuração do Radar não salva.");
  return response.settings;
}

export async function getFlightRadarLivePositions(
  registrations?: string[],
): Promise<FlightRadarLiveResponse> {
  const response = await execute({
    action: "getFlightRadarLivePositions",
    registrations: registrations ?? [],
  });
  return {
    positions: response.positions ?? [],
    trackedRegistrations: response.trackedRegistrations ?? registrations ?? [],
    fetchedAt: response.fetchedAt ?? new Date().toISOString(),
    message: response.message,
  };
}

export async function getFlightRadarFlightTrack(flightId: string): Promise<FlightRadarTrack> {
  const response = await execute({
    action: "getFlightRadarFlightTrack",
    flightId,
  });
  if (!response.track) throw new Error("Trilha do voo não retornada.");
  return response.track;
}

export async function getFlightRadarFlightSummary(
  registrations?: string[],
  range?: { datetimeFrom?: string; datetimeTo?: string },
): Promise<{ summaries: FlightRadarSummary[]; fetchedAt: string; message?: string }> {
  const response = await execute({
    action: "getFlightRadarFlightSummary",
    registrations: registrations ?? [],
    datetimeFrom: range?.datetimeFrom,
    datetimeTo: range?.datetimeTo,
  });
  return {
    summaries: response.summaries ?? [],
    fetchedAt: response.fetchedAt ?? new Date().toISOString(),
    message: response.message,
  };
}

export async function searchFlightRadar(
  query: string,
): Promise<{ query: string; positions: FlightRadarLiveResponse["positions"]; fetchedAt: string; message?: string }> {
  const response = await execute({
    action: "searchFlightRadar",
    query,
  });
  return {
    query: String((response as { query?: string }).query || query),
    positions: response.positions ?? [],
    fetchedAt: response.fetchedAt ?? new Date().toISOString(),
    message: response.message,
  };
}

export function normalizeAircraftRegistration(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9-]/g, "");
}
