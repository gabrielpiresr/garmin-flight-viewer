import { functions, INSTRUCTOR_PATCH_FLIGHT_FUNCTION_ID } from "./appwrite";
import type { FlightStatus } from "./flightsDb";
import type { FlightWeightBalanceMeta } from "./weightBalance";
import { serializeTrainingSnapshotJson } from "./trainingTracksDb";
import type { TrainingSelectionSnapshot } from "../types/trainingTrack";

export type InstructorPatchFlightPayload = {
  flightId: string;
  instructorUserId: string;
  csvText?: string;
  flightStatus?: FlightStatus;
  trainingTrackId?: string | null;
  trainingStageId?: string | null;
  trainingMissionId?: string | null;
  trainingSnapshot?: TrainingSelectionSnapshot | null;
  trainingSnapshots?: TrainingSelectionSnapshot[] | null;
  allowSignedMissionEdit?: boolean;
};

export async function instructorPatchFlight(
  payload: InstructorPatchFlightPayload,
): Promise<{ error: Error | null }> {
  if (!functions || !INSTRUCTOR_PATCH_FLIGHT_FUNCTION_ID) {
    return { error: new Error("Funcao de atualizacao nao configurada.") };
  }

  try {
    // Campos undefined são omitidos do body: a função trata ausência como "não alterar".
    // Enviar null explícito limpa o campo no voo.
    const body = {
      action: "patchFlightAsInstructor",
      flightId: payload.flightId,
      instructorUserId: payload.instructorUserId,
      csvText: payload.csvText,
      flightStatus: payload.flightStatus,
      ...(payload.trainingTrackId !== undefined ? { trainingTrackId: payload.trainingTrackId } : {}),
      ...(payload.trainingStageId !== undefined ? { trainingStageId: payload.trainingStageId } : {}),
      ...(payload.trainingMissionId !== undefined ? { trainingMissionId: payload.trainingMissionId } : {}),
      ...(payload.trainingSnapshot !== undefined
        ? { trainingSnapshotJson: serializeTrainingSnapshotJson(payload.trainingSnapshot, payload.trainingSnapshots) }
        : {}),
      allowSignedMissionEdit: payload.allowSignedMissionEdit === true,
    };

    const execution = await functions.createExecution(
      INSTRUCTOR_PATCH_FLIGHT_FUNCTION_ID,
      JSON.stringify(body),
      false,
    );

    const response = (() => {
      try {
        return JSON.parse(execution.responseBody || "{}") as { ok?: boolean; message?: string };
      } catch {
        return { ok: false, message: "Resposta invalida da funcao." };
      }
    })();

    if (execution.status === "failed" || execution.responseStatusCode >= 400 || !response.ok) {
      return { error: new Error(response.message || "Falha ao atualizar ficha.") };
    }

    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}

export async function studentPatchFlightWeightBalance(payload: {
  flightId: string;
  studentUserId: string;
  csvText?: string;
  weightBalance: FlightWeightBalanceMeta;
}): Promise<{ error: Error | null }> {
  if (!functions || !INSTRUCTOR_PATCH_FLIGHT_FUNCTION_ID) {
    return { error: new Error("Função de atualização não configurada.") };
  }

  try {
    const execution = await functions.createExecution(
      INSTRUCTOR_PATCH_FLIGHT_FUNCTION_ID,
      JSON.stringify({
        action: "patchWeightBalanceAsStudent",
        flightId: payload.flightId,
        studentUserId: payload.studentUserId,
        csvText: payload.csvText,
        weightBalance: payload.weightBalance,
      }),
      false,
    );

    const response = (() => {
      try {
        return JSON.parse(execution.responseBody || "{}") as { ok?: boolean; message?: string };
      } catch {
        return { ok: false, message: "Resposta inválida da função." };
      }
    })();

    if (execution.status === "failed" || execution.responseStatusCode >= 400 || !response.ok) {
      return { error: new Error(response.message || "Falha ao salvar peso e balanceamento.") };
    }

    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}

export async function studentPatchFlightSuggestion(payload: {
  flightId: string;
  studentUserId: string;
  suggestionMd: string;
  csvText?: string;
}): Promise<{ error: Error | null }> {
  if (!functions || !INSTRUCTOR_PATCH_FLIGHT_FUNCTION_ID) {
    return { error: new Error("Função de atualização não configurada.") };
  }

  try {
    const execution = await functions.createExecution(
      INSTRUCTOR_PATCH_FLIGHT_FUNCTION_ID,
      JSON.stringify({
        action: "patchStudentSuggestionAsStudent",
        flightId: payload.flightId,
        studentUserId: payload.studentUserId,
        suggestionMd: payload.suggestionMd,
        csvText: payload.csvText,
      }),
      false,
    );

    const response = (() => {
      try {
        return JSON.parse(execution.responseBody || "{}") as { ok?: boolean; message?: string };
      } catch {
        return { ok: false, message: "Resposta inválida da função." };
      }
    })();

    if (execution.status === "failed" || execution.responseStatusCode >= 400 || !response.ok) {
      return { error: new Error(response.message || "Falha ao salvar sugestão do aluno.") };
    }

    return { error: null };
  } catch (e) {
    return { error: e as Error };
  }
}
