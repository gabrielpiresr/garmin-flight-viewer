import { functions, SCHEDULE_BOOKING_FUNCTION_ID } from "./appwrite";
import type { FlightScheduleRules } from "../types/schoolRules";
import type { FlightStatus } from "./flightsDb";

export type PublicScheduleAircraft = {
  id: string;
  registration: string;
  modelId: string;
  imageUrl: string | null;
};

export type PublicScheduleFlight = {
  id: string;
  aircraftIdent: string;
  aircraftModelId: string | null;
  flightDate: string;
  presentationTime: string;
  startTime: string;
  cutoffTime: string | null;
  endTime: string | null;
  durationMinutes: number;
  status: FlightStatus;
  isOwn: boolean;
  studentUserId: string | null;
  instructorUserId: string | null;
  /** Preenchidos apenas no modo "escala somente no SAGA" (para o próprio aluno ou perfis privilegiados). */
  studentName?: string | null;
  instructorName?: string | null;
  /** Notas do agendamento (SAGA) — visível para o próprio aluno e perfis privilegiados. */
  notes?: string | null;
  canCancel: boolean;
};

export type PublicCreditByModel = {
  modelId: string;
  modelLabel: string;
  diurnoHours: number;
  noturnoHours: number;
};

export type PublicBlockedSlot = {
  aircraftRegistration: string;
  dayOfWeek: number;
  startHour: number;
  endHour: number;
};

type FunctionResponse = {
  ok?: boolean;
  message?: string;
  mode?: FlightScheduleRules["mode"];
  rules?: FlightScheduleRules;
  aircrafts?: PublicScheduleAircraft[];
  flights?: PublicScheduleFlight[];
  flight?: PublicScheduleFlight;
  penaltyPct?: number;
  penaltyHours?: number;
  available?: boolean;
  creditAvailableHours?: number;
  creditFreeHours?: number;
  creditSufficient?: boolean;
  zeroCreditExceptionAvailable?: boolean;
  presentationTime?: string;
  startTime?: string;
  cutoffTime?: string;
  endTime?: string;
  creditsByModel?: PublicCreditByModel[];
  blockedSlots?: PublicBlockedSlot[];
};

async function execute(payload: Record<string, unknown>): Promise<FunctionResponse> {
  if (!functions) throw new Error("Função de escala não configurada.");
  const execution = await functions.createExecution(
    SCHEDULE_BOOKING_FUNCTION_ID,
    JSON.stringify(payload),
    false,
  );
  let response: FunctionResponse = {};
  try {
    response = JSON.parse(execution.responseBody || "{}") as FunctionResponse;
  } catch {
    throw new Error("Resposta inválida da função de escala.");
  }
  if (execution.status === "failed" || execution.responseStatusCode >= 400 || !response.ok) {
    throw new Error(response.message || "Falha ao processar a escala.");
  }
  return response;
}

export async function getPublicSchedule(dateFrom: string, dateTo: string) {
  const response = await execute({ action: "getCalendar", dateFrom, dateTo });
  if (!response.rules || !response.mode) throw new Error("Configuração da escala não retornada.");
  return {
    mode: response.mode,
    rules: response.rules,
    aircrafts: response.aircrafts ?? [],
    flights: response.flights ?? [],
    creditsByModel: response.creditsByModel ?? [],
    blockedSlots: response.blockedSlots ?? [],
  };
}

export async function requestScheduleFlight(input: {
  aircraftIdent: string;
  flightDate: string;
  startTime: string;
  durationMinutes: number;
  flexibilityMinutes?: number;
  notes?: string;
  studentUserId?: string;
}) {
  const response = await execute({ action: "requestFlight", ...input });
  if (!response.flight) throw new Error("Voo solicitado sem retorno.");
  return response.flight;
}

export async function checkScheduleAvailability(input: {
  aircraftIdent: string;
  flightDate: string;
  startTime: string;
  durationMinutes: number;
  studentUserId?: string;
}) {
  const response = await execute({ action: "checkAvailability", ...input });
  return {
    available: response.available === true,
    creditAvailableHours: response.creditAvailableHours ?? 0,
    creditFreeHours: response.creditFreeHours,
    creditSufficient: response.creditSufficient === true,
    zeroCreditExceptionAvailable: response.zeroCreditExceptionAvailable === true,
    presentationTime: response.presentationTime ?? "",
    startTime: response.startTime ?? "",
    cutoffTime: response.cutoffTime ?? "",
    endTime: response.endTime ?? "",
  };
}

/** Alteração de voo no modo SAGA — mesmas regras de prazo do cancelamento + validações de agendamento. */
export async function rescheduleScheduleFlight(input: {
  flightId: string;
  aircraftIdent: string;
  flightDate: string;
  startTime: string;
  durationMinutes: number;
}) {
  const response = await execute({ action: "rescheduleFlight", ...input });
  if (!response.flight) throw new Error("Alteração sem retorno.");
  return response.flight;
}

export async function confirmScheduleFlight(flightId: string) {
  const response = await execute({ action: "confirmFlight", flightId });
  if (!response.flight) throw new Error("Voo confirmado sem retorno.");
  return response.flight;
}

export async function previewScheduleCancellation(flightId: string) {
  const response = await execute({ action: "previewCancellation", flightId });
  return { penaltyPct: response.penaltyPct ?? 0, penaltyHours: response.penaltyHours ?? 0 };
}

export async function cancelScheduleFlight(flightId: string, options?: { waivePenalty?: boolean; reason?: string }) {
  const response = await execute({ action: "cancelFlight", flightId, ...options });
  if (!response.flight) throw new Error("Cancelamento sem retorno.");
  return {
    flight: response.flight,
    penaltyPct: response.penaltyPct ?? 0,
    penaltyHours: response.penaltyHours ?? 0,
  };
}
