import { ADMIN_USERS_FUNCTION_ID, functions } from "./appwrite";
import type { FlightVideo } from "./flightVideosDb";
import type { GoproMediaLink, GoproPublicLinksResult, GoproSettings, GoproSettingsInput } from "../types/gopro";

type GoproResponse = {
  message?: string;
  settings?: GoproSettings;
  playback?: GoproPlayback;
  videos?: FlightVideo[];
  skipped?: Array<{ mediaId: string; reason: string }>;
  missing?: string[];
} & Partial<GoproPublicLinksResult>;

export type GoproPlayback = {
  ok: boolean;
  type: "hls";
  url: string;
  publicUrl: string;
  width: number | null;
  height: number | null;
  expiresAt: string;
};

export type GoproVideoMetadata = {
  provider?: string;
  mediaId?: string;
  mediaToken?: string;
  publicUrl?: string;
  collectionId?: string;
  filename?: string;
  title?: string;
  cameraModel?: string;
  cameraName?: string;
  cameraIdentifier?: string;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
};

const GOPRO_PLAYBACK_CACHE_MARGIN_MS = 5 * 60 * 1000;
const goproPlaybackCache = new Map<string, GoproPlayback>();

function parseJsonBody<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function execute(payload: Record<string, unknown>): Promise<GoproResponse> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    throw new Error("Funcao administrativa nao configurada. Defina VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID.");
  }
  const execution = await functions.createExecution(ADMIN_USERS_FUNCTION_ID, JSON.stringify(payload), false);
  const response = parseJsonBody<GoproResponse>(execution.responseBody, {});
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || "Falha na integracao com a GoPro.");
  }
  return response;
}

export async function getGoproSettings(): Promise<GoproSettings> {
  const response = await execute({ action: "goproGetSettings" });
  if (!response.settings) throw new Error("Configuracao da GoPro nao retornada.");
  return response.settings;
}

export async function saveGoproSettings(settings: GoproSettingsInput): Promise<GoproSettings> {
  const response = await execute({ action: "goproSaveSettings", settings });
  if (!response.settings) throw new Error("Configuracao da GoPro nao retornada.");
  return response.settings;
}

export async function listGoproPublicLinks(ensurePublic = false): Promise<GoproPublicLinksResult> {
  const response = await execute({
    action: "goproListPublicLinks",
    ensurePublic,
    perPage: 30,
    maxPages: 200,
  });
  return {
    media: response.media ?? [],
    links: response.links ?? [],
    missing: response.missing ?? [],
    errors: response.errors ?? [],
    totalItems: response.totalItems ?? 0,
    totalPages: response.totalPages ?? 0,
    updatedAt: response.updatedAt ?? new Date().toISOString(),
  };
}

export async function listGoproPublicLinksForFlight(): Promise<GoproPublicLinksResult> {
  const response = await execute({
    action: "goproListPublicLinksForFlight",
    ensurePublic: true,
    perPage: 100,
    maxPages: 200,
  });
  return {
    media: response.media ?? [],
    links: response.links ?? [],
    missing: response.missing ?? [],
    errors: response.errors ?? [],
    totalItems: response.totalItems ?? 0,
    totalPages: response.totalPages ?? 0,
    updatedAt: response.updatedAt ?? new Date().toISOString(),
  };
}

export async function attachGoproMediaToFlight(flightId: string, mediaIds: string[]): Promise<{
  videos: FlightVideo[];
  skipped: Array<{ mediaId: string; reason: string }>;
  missing: string[];
}> {
  const response = await execute({
    action: "goproAttachMediaToFlight",
    flightId,
    mediaIds,
  });
  return {
    videos: response.videos ?? [],
    skipped: response.skipped ?? [],
    missing: response.missing ?? [],
  };
}

export function parseGoproVideoMetadata(value: string | null | undefined): GoproVideoMetadata | null {
  if (!value?.trim()) return null;
  try {
    const parsed = JSON.parse(value) as GoproVideoMetadata;
    return parsed?.provider === "gopro" ? parsed : null;
  } catch {
    return null;
  }
}

export function isGoproFlightVideo(video: Pick<FlightVideo, "file_url" | "telemetry_source" | "telemetry_json" | "video_key">): boolean {
  return (
    video.telemetry_source === "gopro" ||
    video.video_key.startsWith("gopro:") ||
    /^https:\/\/gopro\.com\/v\/[0-9a-f-]{36}$/i.test(video.file_url)
  );
}

export async function resolveGoproVideoPlayback(video: FlightVideo): Promise<GoproPlayback> {
  const metadata = parseGoproVideoMetadata(video.telemetry_json);
  const mediaToken = metadata?.mediaToken;
  const publicUrl = metadata?.publicUrl || video.file_url;
  if (!mediaToken) throw new Error("Token da midia GoPro nao encontrado neste video.");
  return resolveGoproMediaPlayback({ token: mediaToken, publicUrl });
}

export async function resolveGoproMediaPlayback(media: Pick<GoproMediaLink, "token" | "publicUrl">): Promise<GoproPlayback> {
  const mediaToken = media.token;
  const publicUrl = media.publicUrl;
  if (!mediaToken) throw new Error("Token da midia GoPro nao encontrado neste video.");
  const cacheKey = `${mediaToken}|${publicUrl}`;
  const cached = goproPlaybackCache.get(cacheKey);
  const cachedExpiresAt = cached?.expiresAt ? Date.parse(cached.expiresAt) : 0;
  if (cached?.url && cachedExpiresAt - GOPRO_PLAYBACK_CACHE_MARGIN_MS > Date.now()) {
    return cached;
  }
  const response = await execute({
    action: "goproResolveVideoPlayback",
    mediaToken,
    publicUrl,
  });
  if (!response.playback?.url) throw new Error(response.message || "Playback GoPro nao retornado.");
  goproPlaybackCache.set(cacheKey, response.playback);
  return response.playback;
}
