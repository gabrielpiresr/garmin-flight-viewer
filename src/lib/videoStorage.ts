import { ADMIN_USERS_FUNCTION_ID, functions } from "./appwrite";

type VideoWorkerMode =
  | { mode: "upload"; flightId: string; key: string }
  | { mode: "list"; flightId: string; prefix: string };

type VideoWorkerConfigResponse = {
  workerUrl?: string;
  uploadToken?: string;
  message?: string;
};

function parseResponse(body: string | undefined): VideoWorkerConfigResponse {
  if (!body) return {};
  try {
    return JSON.parse(body) as VideoWorkerConfigResponse;
  } catch {
    return {};
  }
}

export function isVideoStorageConfigured(): boolean {
  return Boolean(functions && ADMIN_USERS_FUNCTION_ID);
}

export async function getWorkerConfig(params: VideoWorkerMode): Promise<{ url: string; token: string } | null> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) return null;

  const execution = await functions.createExecution(
    ADMIN_USERS_FUNCTION_ID,
    JSON.stringify({ action: "getVideoWorkerConfig", ...params }),
    false,
  );
  const response = parseResponse(execution.responseBody);
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || "Falha ao obter autorização de upload.");
  }
  if (!response.workerUrl || !response.uploadToken) return null;
  return { url: response.workerUrl, token: response.uploadToken };
}
