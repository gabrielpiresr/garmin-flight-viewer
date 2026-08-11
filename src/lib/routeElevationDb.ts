import { ADMIN_USERS_FUNCTION_ID, functions } from "./appwrite";

export type RouteElevationPoint = {
  distanceFraction: number;
  elevFt: number | null;
  elevM?: number | null;
  lat: number | null;
  lng: number | null;
};

export type RouteElevationResult = {
  points: RouteElevationPoint[];
  dataset: string;
  samples: number;
  fetchedAt: string;
};

type RouteElevationResponse = RouteElevationResult & {
  message?: string;
};

async function execute(payload: Record<string, unknown>): Promise<RouteElevationResponse> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    throw new Error("Função administrativa não configurada.");
  }
  const execution = await functions.createExecution(
    ADMIN_USERS_FUNCTION_ID,
    JSON.stringify(payload),
    false,
  );
  let response: RouteElevationResponse = { points: [], dataset: "", samples: 0, fetchedAt: "" };
  try {
    response = execution.responseBody
      ? (JSON.parse(execution.responseBody) as RouteElevationResponse)
      : response;
  } catch {
    response = { points: [], dataset: "", samples: 0, fetchedAt: "" };
  }
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || "Falha ao obter elevação do terreno.");
  }
  return response;
}

export async function getRouteElevation(
  waypoints: Array<{ lat: number; lng: number }>,
  options?: { samples?: number },
): Promise<RouteElevationResult> {
  const response = await execute({
    action: "getRouteElevation",
    waypoints,
    samples: options?.samples,
  });
  return {
    points: Array.isArray(response.points) ? response.points : [],
    dataset: response.dataset || "srtm30m",
    samples: Number(response.samples) || (response.points?.length ?? 0),
    fetchedAt: response.fetchedAt || new Date().toISOString(),
  };
}

/** Stable hash of route geometry (ignores altitude / labels). */
export function routeGeometryKey(waypoints: Array<{ lat: number; lng: number }>): string {
  return waypoints
    .map((wp) => `${Number(wp.lat).toFixed(5)},${Number(wp.lng).toFixed(5)}`)
    .join("|");
}
