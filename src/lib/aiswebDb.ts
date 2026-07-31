import { ADMIN_USERS_FUNCTION_ID, functions } from "./appwrite";
import type {
  AiswebAirportBundle,
  AiswebDashboard,
  AiswebPlatformSettings,
  AiswebPlatformSettingsInput,
  AiswebWatchlist,
} from "../types/aisweb";

type AiswebResponse = {
  message?: string;
  settings?: AiswebPlatformSettings;
  watchlist?: AiswebWatchlist;
  dashboard?: AiswebDashboard;
  bootstrap?: {
    settings: AiswebPlatformSettings;
    watchlist: AiswebWatchlist;
  };
  airport?: AiswebAirportBundle;
  chart?: {
    contentType: string;
    filename: string;
    base64: string;
    byteLength: number;
  };
};

async function execute(payload: Record<string, unknown>): Promise<AiswebResponse> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    throw new Error("Função administrativa não configurada.");
  }
  const execution = await functions.createExecution(
    ADMIN_USERS_FUNCTION_ID,
    JSON.stringify(payload),
    false,
  );
  let response: AiswebResponse = {};
  try {
    response = execution.responseBody
      ? (JSON.parse(execution.responseBody) as AiswebResponse)
      : {};
  } catch {
    response = {};
  }
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || "Falha na integração AISWEB.");
  }
  return response;
}

function normalizeWatchlist(watchlist?: AiswebWatchlist | null): AiswebWatchlist {
  return {
    icaoCodes: watchlist?.icaoCodes || [],
    notamAlerts: watchlist?.notamAlerts || {},
    updatedAt: watchlist?.updatedAt || null,
  };
}

export async function getAiswebBootstrap(): Promise<{
  settings: AiswebPlatformSettings;
  watchlist: AiswebWatchlist;
}> {
  const response = await execute({ action: "getAiswebBootstrap" });
  if (!response.bootstrap?.settings || !response.bootstrap?.watchlist) {
    throw new Error("Bootstrap AISWEB não retornado.");
  }
  return {
    settings: response.bootstrap.settings,
    watchlist: normalizeWatchlist(response.bootstrap.watchlist),
  };
}

export async function getAiswebDashboard(): Promise<AiswebDashboard> {
  const response = await execute({ action: "getAiswebDashboard" });
  if (!response.dashboard) throw new Error("Dashboard AISWEB não retornado.");
  return {
    ...response.dashboard,
    watchlist: normalizeWatchlist(response.dashboard.watchlist),
  };
}

export async function lookupAiswebIcao(icaoCode: string): Promise<AiswebAirportBundle> {
  const response = await execute({
    action: "lookupAiswebIcao",
    icaoCode,
  });
  if (!response.airport) throw new Error("Dados do aeródromo não retornados.");
  return response.airport;
}

export async function saveAiswebWatchlist(
  icaoCodes: string[],
  notamAlerts?: Record<string, boolean>,
): Promise<AiswebWatchlist> {
  const response = await execute({
    action: "saveAiswebWatchlist",
    icaoCodes,
    ...(notamAlerts ? { notamAlerts } : {}),
  });
  if (!response.watchlist) throw new Error("Watchlist AISWEB não retornada.");
  return {
    icaoCodes: response.watchlist.icaoCodes || [],
    notamAlerts: response.watchlist.notamAlerts || {},
    updatedAt: response.watchlist.updatedAt || null,
  };
}

export async function getAiswebSettings(): Promise<AiswebPlatformSettings> {
  const response = await execute({ action: "getAiswebSettings" });
  if (!response.settings) throw new Error("Configuração AISWEB não retornada.");
  return response.settings;
}

export async function saveAiswebSettings(
  input: AiswebPlatformSettingsInput,
): Promise<AiswebPlatformSettings> {
  const response = await execute({
    action: "saveAiswebSettings",
    settings: input,
  });
  if (!response.settings) throw new Error("Configuração AISWEB não retornada.");
  return response.settings;
}

export async function previewAiswebChart(link: string): Promise<{
  contentType: string;
  filename: string;
  base64: string;
  byteLength: number;
}> {
  const response = await execute({
    action: "previewAiswebChart",
    link,
  });
  if (!response.chart?.base64) throw new Error("Preview da carta não retornado.");
  return response.chart;
}

type ChartBlobCacheEntry = {
  blob: Blob;
  contentType: string;
  filename: string;
  byteLength: number;
};

const chartBlobCache = new Map<string, ChartBlobCacheEntry>();
const chartBlobInflight = new Map<string, Promise<ChartBlobCacheEntry>>();

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  const chunk = 0x8000;
  for (let offset = 0; offset < len; offset += chunk) {
    const end = Math.min(offset + chunk, len);
    for (let i = offset; i < end; i++) bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Cached blob fetch — revisiting a chart is instant; concurrent calls share one request. */
export async function previewAiswebChartBlob(link: string): Promise<ChartBlobCacheEntry> {
  const key = String(link || "").trim();
  if (!key) throw new Error("Link da carta inválido.");
  const cached = chartBlobCache.get(key);
  if (cached) return cached;

  const pending = chartBlobInflight.get(key);
  if (pending) return pending;

  const request = (async () => {
    const chart = await previewAiswebChart(key);
    const contentType = chart.contentType || "application/pdf";
    const entry: ChartBlobCacheEntry = {
      blob: new Blob([base64ToUint8Array(chart.base64)], { type: contentType }),
      contentType,
      filename: chart.filename || "carta.pdf",
      byteLength: chart.byteLength || 0,
    };
    chartBlobCache.set(key, entry);
    return entry;
  })().finally(() => {
    chartBlobInflight.delete(key);
  });

  chartBlobInflight.set(key, request);
  return request;
}

/** Warm the cache for upcoming chart links (best-effort, capped). */
export function prefetchAiswebChartBlobs(links: string[], limit = 3): void {
  const unique = [...new Set(links.map((l) => String(l || "").trim()).filter(Boolean))];
  for (const link of unique.slice(0, Math.max(0, limit))) {
    if (chartBlobCache.has(link) || chartBlobInflight.has(link)) continue;
    void previewAiswebChartBlob(link).catch(() => {
      /* ignore prefetch errors */
    });
  }
}
