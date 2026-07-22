import { ADMIN_USERS_FUNCTION_ID, functions } from "./appwrite";
import type { FlightPhoto } from "./flightPhotosDb";
import type { FlightVideo } from "./flightVideosDb";
import type { SavedFlightFull } from "./flightsDb";
import type { FlightManeuver, FlightManeuverReview, ManeuverTemplate } from "../types/flightReview";
import type { EmailBrandSettings } from "../types/notification";

export type PublicFlightReviewShare = {
  flight: SavedFlightFull;
  missionName: string;
  videos: FlightVideo[];
  photos: FlightPhoto[];
  maneuvers: FlightManeuver[];
  maneuverReviews: FlightManeuverReview[];
  maneuverTemplates: ManeuverTemplate[];
  brandSettings: EmailBrandSettings | null;
};

export type PublicFlightReviewIntro = {
  flightId: string;
  missionName: string;
  studentName: string;
  studentNickname: string;
  flightDate: string;
  startTime: string;
  aircraftIdent: string;
  brandSettings: EmailBrandSettings | null;
};

type FunctionResponse = {
  share?: PublicFlightReviewShare & { publicUrl?: string; token?: string };
  intro?: PublicFlightReviewIntro;
  message?: string;
};

function parseResponse(body: string | undefined): FunctionResponse {
  if (!body) return {};
  try {
    return JSON.parse(body) as FunctionResponse;
  } catch {
    return {};
  }
}

async function executeShareAction(payload: Record<string, unknown>): Promise<FunctionResponse> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    throw new Error("Função administrativa não configurada.");
  }
  const execution = await functions.createExecution(ADMIN_USERS_FUNCTION_ID, JSON.stringify(payload), false);
  const response = parseResponse(execution.responseBody);
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || "Falha ao executar função administrativa.");
  }
  return response;
}

export async function createFlightPublicShare(flightId: string): Promise<string> {
  const origin = window.location.origin;
  const response = await executeShareAction({ action: "createFlightPublicShare", flightId, origin });
  const publicUrl = response.share?.publicUrl;
  if (!publicUrl) throw new Error(response.message || "Link público não retornado.");
  return publicUrl;
}

export async function getPublicFlightReviewShare(token: string): Promise<PublicFlightReviewShare> {
  const response = await executeShareAction({ action: "getPublicFlightReviewShare", token });
  if (!response.share?.flight) throw new Error(response.message || "Flight Review público não encontrado.");
  return response.share;
}

export async function getPublicFlightReviewIntro(token: string): Promise<PublicFlightReviewIntro> {
  const response = await executeShareAction({ action: "getPublicFlightReviewShare", token, summaryOnly: true });
  if (!response.intro?.flightId) throw new Error(response.message || "Flight Review público não encontrado.");
  return response.intro;
}
