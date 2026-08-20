import { ADMIN_USERS_FUNCTION_ID, functions } from "./appwrite";
import type {
  AiswebAerodromeMatch,
  AiswebAirportBundle,
  AiswebDashboard,
  AiswebNotam,
  AiswebPlatformSettings,
  AiswebPlatformSettingsInput,
  AiswebWeatherAlert,
  AiswebWeatherAlertHistoryItem,
  AiswebWebcamsResult,
  AiswebWatchlist,
} from "../types/aisweb";
import type { FlightPlanAirspaceHit } from "../types/flightPlanning";

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
  query?: string;
  matches?: AiswebAerodromeMatch[];
  chart?: {
    contentType: string;
    filename: string;
    base64: string;
    byteLength: number;
  };
  airspaces?: FlightPlanAirspaceHit[];
  image?: {
    contentType: string;
    base64: string;
    byteLength: number;
  };
  geometries?: Array<{
    type: string;
    geometry: {
      type: string;
      coordinates?: unknown;
    } | null;
  }>;
  mets?: AiswebAirportBundle["met"][];
  notams?: AiswebNotam[];
  webcams?: AiswebWebcamsResult;
  alerts?: AiswebWeatherAlert[];
  alert?: AiswebWeatherAlert;
  history?: AiswebWeatherAlertHistoryItem[];
  result?: unknown;
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
    supplementAlerts: watchlist?.supplementAlerts || {},
    adWarningAlerts: watchlist?.adWarningAlerts || {},
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

export async function fetchAiswebNotams(icaoCode: string): Promise<AiswebNotam[]> {
  try {
    const response = await execute({
      action: "fetchAiswebNotams",
      icaoCode,
    });
    if (Array.isArray(response.notams)) return response.notams;
  } catch {
    /* fallback abaixo — function antiga sem a action */
  }
  const airport = await lookupAiswebIcao(icaoCode);
  return airport.notams || [];
}

export async function searchAiswebAerodromes(
  query: string,
  limit = 5,
): Promise<{ query: string; matches: AiswebAerodromeMatch[] }> {
  const response = await execute({
    action: "searchAiswebAerodromes",
    query,
    limit,
  });
  return {
    query: response.query || String(query || "").trim(),
    matches: Array.isArray(response.matches) ? response.matches : [],
  };
}

export async function saveAiswebWatchlist(
  icaoCodes: string[],
  alerts?: {
    notamAlerts?: Record<string, boolean>;
    supplementAlerts?: Record<string, boolean>;
    adWarningAlerts?: Record<string, boolean>;
  } | Record<string, boolean>,
): Promise<AiswebWatchlist> {
  // Compat: segundo arg antigo era só notamAlerts Record
  const isLegacy =
    alerts &&
    !("notamAlerts" in alerts) &&
    !("supplementAlerts" in alerts) &&
    !("adWarningAlerts" in alerts);
  const notamAlerts = isLegacy
    ? (alerts as Record<string, boolean>)
    : (alerts as { notamAlerts?: Record<string, boolean> } | undefined)?.notamAlerts;
  const supplementAlerts = !isLegacy
    ? (alerts as { supplementAlerts?: Record<string, boolean> } | undefined)?.supplementAlerts
    : undefined;
  const adWarningAlerts = !isLegacy
    ? (alerts as { adWarningAlerts?: Record<string, boolean> } | undefined)?.adWarningAlerts
    : undefined;
  const response = await execute({
    action: "saveAiswebWatchlist",
    icaoCodes,
    ...(notamAlerts ? { notamAlerts } : {}),
    ...(supplementAlerts ? { supplementAlerts } : {}),
    ...(adWarningAlerts ? { adWarningAlerts } : {}),
  });
  if (!response.watchlist) throw new Error("Watchlist AISWEB não retornada.");
  return normalizeWatchlist(response.watchlist);
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

export async function listAiswebWeatherAlerts(): Promise<{
  alerts: AiswebWeatherAlert[];
  history: AiswebWeatherAlertHistoryItem[];
}> {
  const response = await execute({ action: "listAiswebWeatherAlerts" });
  return {
    alerts: Array.isArray(response.alerts) ? response.alerts : [],
    history: Array.isArray(response.history) ? response.history : [],
  };
}

export async function saveAiswebWeatherAlert(
  alert: Partial<AiswebWeatherAlert>,
): Promise<AiswebWeatherAlert> {
  const response = await execute({
    action: "saveAiswebWeatherAlert",
    alert,
  });
  if (!response.alert) throw new Error("Alerta meteorológico não retornado.");
  return response.alert;
}

export async function deleteAiswebWeatherAlert(alertId: string): Promise<void> {
  await execute({
    action: "deleteAiswebWeatherAlert",
    alertId,
  });
}

export async function runAiswebWeatherAlertScanNow(): Promise<unknown> {
  const response = await execute({ action: "runAiswebWeatherAlertScan" });
  return response.result || response;
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

/** Detect CTA/TMA/CTR/ATZ polygons intersected by a route (server-side WFS). */
export async function queryAirspaceAlongRoute(
  points: Array<{ lat: number; lng: number }>,
): Promise<FlightPlanAirspaceHit[]> {
  const response = await execute({
    action: "queryAirspaceAlongRoute",
    points: points.map((p) => ({ lat: p.lat, lng: p.lng })),
  });
  return Array.isArray(response.airspaces) ? response.airspaces : [];
}

/** Airspace polygons for map rasterization (server WFS; used when browser CORS blocks GeoAISWEB). */
export async function queryAirspaceGeometries(
  points: Array<{ lat: number; lng: number }>,
): Promise<Array<{ type: string; geometry: { type: string; coordinates?: unknown } | null }>> {
  const response = await execute({
    action: "queryAirspaceGeometries",
    points: points.map((p) => ({ lat: p.lat, lng: p.lng })),
  });
  return Array.isArray(response.geometries) ? response.geometries : [];
}

/** Public METAR/TAF batch refresh (offline briefing). */
export async function fetchAiswebMetBatch(
  icaoCodes: string[],
): Promise<AiswebAirportBundle["met"][]> {
  const response = await execute({
    action: "fetchAiswebMetBatch",
    icaoCodes,
  });
  return Array.isArray(response.mets) ? response.mets : [];
}

export async function searchWindyWebcamsForAirport(
  airport: AiswebAirportBundle,
  options?: { radiusKm?: number; limit?: number },
): Promise<AiswebWebcamsResult> {
  const response = await execute({
    action: "searchWindyWebcams",
    icaoCode: airport.icao,
    lat: airport.rotaer?.lat ?? null,
    lng: airport.rotaer?.lng ?? null,
    name: airport.rotaer?.name ?? null,
    city: airport.rotaer?.city ?? null,
    uf: airport.rotaer?.uf ?? null,
    radiusKm: options?.radiusKm ?? 60,
    limit: options?.limit ?? 8,
  });
  if (!response.webcams) throw new Error("Webcams do Windy não retornadas.");
  return response.webcams;
}

/** Proxy allowed map tile/export URLs (Esri / GeoAISWEB) as data URL. */
export async function proxyMapImageDataUrl(url: string): Promise<string | null> {
  const response = await execute({
    action: "proxyMapImage",
    url,
  });
  if (!response.image?.base64) return null;
  const type = response.image.contentType || "image/png";
  return `data:${type};base64,${response.image.base64}`;
}
