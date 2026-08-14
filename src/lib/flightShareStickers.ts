import { buildFlightDisplayInfo, type FlightDisplayInfo } from "./flightDisplay";
import { decodeFlightRecord, type FlightRecordMeta } from "./flightRecordCodec";
import { getSavedFlight, type SavedFlightFull } from "./flightsDb";
import {
  chartDurationSec,
  formatAltFt,
  formatDuration,
  formatSpeedKt,
  summarizeFlight,
} from "./flightStats";
import { getEmailBrandSettings } from "./notificationsDb";
import { parseGarminCsv, type ParseResult } from "./parseGarminCsv";
import type { ChartRow } from "./telemetryCharts";
import type { FlightPoint, FlightSummary } from "../types/flight";
import type { EmailBrandSettings } from "../types/notification";

export type FlightShareStickerId = "summary" | "route" | "map" | "mapStats" | "legs" | "altitude" | "speed" | "custom";

export type CustomStickerOptions = {
  title: string;
  showBackground: boolean;
  routeMode: "map" | "clean" | "legs" | "hidden";
  showDistance: boolean;
  showTime: boolean;
  showAltitude: boolean;
  showSpeed: boolean;
  showAltitudeChart: boolean;
  showSpeedChart: boolean;
  showAircraft: boolean;
  showDate: boolean;
  showStudent: boolean;
};

export type FlightShareBrand = {
  schoolName: string;
  logoUrl: string;
  logoDataUrl: string | null;
  primaryColor: string;
  accentColor: string;
};

export type FlightShareMapTile = {
  href: string;
  x: number;
  y: number;
};

export type FlightShareRouteMap = {
  width: number;
  height: number;
  /** Tamanho do tile no espaço do mapa (256 * overzoom). */
  tileSize: number;
  tiles: FlightShareMapTile[];
  routePoints: Array<{ x: number; y: number }>;
};

export type FlightShareTelemetryKind = "garmin" | "fr24" | "none";

export type FlightShareData = {
  flightId: string;
  sourceFileName: string;
  telemetryKind: FlightShareTelemetryKind;
  meta: FlightRecordMeta | null;
  displayInfo: FlightDisplayInfo;
  parsed: ParseResult | null;
  points: FlightPoint[];
  chartData: ChartRow[];
  hasChartTime: boolean;
  chartTimeBaseMs: number | null;
  summary: FlightSummary;
  durationDisplay: string;
  brand: FlightShareBrand;
  routeMap: FlightShareRouteMap | null;
};

export type FlightShareSticker = {
  id: string;
  title: string;
  description: string;
  fileName: string;
  width: number;
  height: number;
  svg: string;
};

const STICKER_WIDTH = 1080;
const STICKER_HEIGHT = 1920;
const DEFAULT_BRAND: FlightShareBrand = {
  schoolName: "",
  logoUrl: "",
  logoDataUrl: null,
  primaryColor: "#38bdf8",
  accentColor: "#a78bfa",
};

export const DEFAULT_CUSTOM_STICKER_OPTIONS: CustomStickerOptions = {
  title: "",
  showBackground: true,
  routeMode: "map",
  showDistance: true,
  showTime: true,
  showAltitude: true,
  showSpeed: true,
  showAltitudeChart: false,
  showSpeedChart: false,
  showAircraft: true,
  showDate: true,
  showStudent: false,
};

type Box = { x: number; y: number; w: number; h: number };
type Sample = { x: number; y: number };
type StickerBuildOptions = { showBackground?: boolean };
const BRAND_CACHE_KEY = "gfv:emailBrandSettings";
const BRAND_LOG_PREFIX = "[gfv:brand]";

function summarizeSettings(settings: EmailBrandSettings | null | undefined) {
  if (!settings) return null;
  return {
    schoolName: settings.schoolName || "",
    hasLogoUrl: Boolean(settings.logoUrl?.trim()),
    logoUrl: settings.logoUrl || "",
    hasLogoDataUrl: Boolean(settings.logoDataUrl?.startsWith("data:image/")),
    logoDataUrlLength: settings.logoDataUrl?.length ?? 0,
    updatedAt: settings.updatedAt ?? null,
  };
}

function summarizeBrand(brand: FlightShareBrand) {
  return {
    schoolName: brand.schoolName,
    hasLogoUrl: Boolean(brand.logoUrl.trim()),
    logoUrl: brand.logoUrl,
    hasLogoDataUrl: Boolean(brand.logoDataUrl?.startsWith("data:image/")),
    logoDataUrlLength: brand.logoDataUrl?.length ?? 0,
  };
}

function logBrandDebug(message: string, details?: Record<string, unknown>) {
  console.info(BRAND_LOG_PREFIX, message, details ?? {});
}

function warnBrandDebug(message: string, details?: Record<string, unknown>) {
  console.warn(BRAND_LOG_PREFIX, message, details ?? {});
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fitText(value: string, x: number, y: number, options: {
  color?: string;
  fontSize: number;
  fontWeight?: number | string;
  maxWidth: number;
  anchor?: "start" | "middle" | "end";
  letterSpacing?: number | string;
  opacity?: number;
}): string {
  const safe = escapeXml(value);
  // Reduz o font-size para caber em maxWidth em vez de usar textLength/lengthAdjust,
  // que deforma os glifos (estica texto curto quando a estimativa de largura erra).
  const estimatedWidth = value.length * options.fontSize * 0.56;
  const fontSize = estimatedWidth > options.maxWidth
    ? Math.max(10, Math.floor(options.fontSize * (options.maxWidth / estimatedWidth)))
    : options.fontSize;
  const anchor = options.anchor ? ` text-anchor="${options.anchor}"` : "";
  const weight = options.fontWeight ? ` font-weight="${options.fontWeight}"` : "";
  const letterSpacing = options.letterSpacing !== undefined ? ` letter-spacing="${options.letterSpacing}"` : "";
  const opacity = options.opacity !== undefined ? ` opacity="${options.opacity}"` : "";
  return `<text x="${x}" y="${y}" fill="${options.color ?? "#f8fafc"}" font-size="${fontSize}"${weight}${anchor}${letterSpacing}${opacity}>${safe}</text>`;
}

function safeColor(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed : fallback;
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "voo";
}

function clampText(value: string | null | undefined, fallback = "-"): string {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function detectFlightShareTelemetryKind(fileName: string, csv: string): FlightShareTelemetryKind {
  if (!csv.trim()) return "none";
  const name = fileName.toLowerCase();
  if (
    name.startsWith("fr24-") ||
    csv.includes("Flightradar24 track export") ||
    csv.includes("ADS-B only")
  ) {
    return "fr24";
  }
  return "garmin";
}

function formatDatePt(iso: string | null): string {
  if (!iso) return "-";
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDistanceNmKm(meters: number, fallbackNm?: string): string {
  if (meters > 0) {
    const nm = meters / 1852;
    const km = meters / 1000;
    return `${nm.toFixed(1)} NM · ${km.toFixed(1)} km`;
  }
  const parsedFallback = Number((fallbackNm ?? "").replace(",", "."));
  if (Number.isFinite(parsedFallback) && parsedFallback > 0) return `${parsedFallback.toFixed(1)} NM`;
  return "-";
}

function formatDistanceShort(meters: number, fallbackNm?: string): string {
  if (meters > 0) return `${(meters / 1852).toFixed(1)} NM`;
  const parsedFallback = Number((fallbackNm ?? "").replace(",", "."));
  if (Number.isFinite(parsedFallback) && parsedFallback > 0) return `${parsedFallback.toFixed(1)} NM`;
  return "-";
}

function formatKt(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)} kt` : "-";
}

function formatFt(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value).toLocaleString("pt-BR")} ft`
    : "-";
}

function formatMetricAlt(summary: FlightSummary, chartData: ChartRow[]): string {
  if (summary.altMaxM !== null) return formatAltFt(summary.altMaxM);
  const maxAlt = maxSeriesValue(chartData, ["gpsAltFt", "baroAltFt", "pressAltFt"]);
  return formatFt(maxAlt);
}

function formatMetricSpeed(summary: FlightSummary, chartData: ChartRow[]): string {
  if (summary.speedMaxMs !== null) return formatSpeedKt(summary.speedMaxMs);
  return formatKt(maxSeriesValue(chartData, ["iasKt", "gsKt", "tasKt"]));
}

async function urlToDataUrl(url: string): Promise<string | null> {
  if (!url.trim()) return null;
  if (url.startsWith("data:")) return url;
  try {
    logBrandDebug("trying browser logo fetch fallback", { url });
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) {
      warnBrandDebug("browser logo fetch fallback returned non-ok", { url, status: response.status });
      return null;
    }
    const blob = await response.blob();
    const dataUrl = await new Promise<string | null>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    logBrandDebug("browser logo fetch fallback finished", {
      url,
      contentType: blob.type,
      dataUrlLength: dataUrl?.length ?? 0,
    });
    return dataUrl;
  } catch (error) {
    warnBrandDebug("browser logo fetch fallback failed", {
      url,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function loadFlightShareBrand(): Promise<FlightShareBrand> {
  try {
    logBrandDebug("loading brand settings for stickers");
    const settings = await getEmailBrandSettings();
    const cached = readCachedBrandSettings();
    const effectiveSettings = !settings.logoUrl?.trim() && cached?.logoUrl ? cached : settings;
    cacheBrandSettings(effectiveSettings);
    const brand = normalizeBrand(
      effectiveSettings,
      effectiveSettings.logoDataUrl ?? await urlToDataUrl(effectiveSettings.logoUrl),
    );
    logBrandDebug("brand settings loaded for stickers", {
      settings: summarizeSettings(settings),
      cached: summarizeSettings(cached),
      effectiveSettings: summarizeSettings(effectiveSettings),
      brand: summarizeBrand(brand),
    });
    return brand;
  } catch (error) {
    warnBrandDebug("brand settings failed, trying local cache", {
      message: error instanceof Error ? error.message : String(error),
    });
    const cached = readCachedBrandSettings();
    if (cached) {
      const brand = normalizeBrand(cached, cached.logoDataUrl ?? await urlToDataUrl(cached.logoUrl));
      logBrandDebug("brand settings loaded from local cache", {
        cached: summarizeSettings(cached),
        brand: summarizeBrand(brand),
      });
      return brand;
    }
    warnBrandDebug("brand settings unavailable, using default brand");
    return DEFAULT_BRAND;
  }
}

function normalizeBrand(settings: EmailBrandSettings, logoDataUrl: string | null): FlightShareBrand {
  return {
    schoolName: settings.schoolName?.trim() ?? "",
    logoUrl: settings.logoUrl ?? "",
    logoDataUrl,
    primaryColor: safeColor(settings.primaryColor, DEFAULT_BRAND.primaryColor),
    accentColor: safeColor(settings.accentColor, DEFAULT_BRAND.accentColor),
  };
}

async function brandFromSettings(settings: EmailBrandSettings | null | undefined): Promise<FlightShareBrand> {
  if (!settings) return DEFAULT_BRAND;
  return normalizeBrand(settings, settings.logoDataUrl ?? await urlToDataUrl(settings.logoUrl));
}

function cacheBrandSettings(settings: EmailBrandSettings) {
  try {
    window.localStorage.setItem(BRAND_CACHE_KEY, JSON.stringify(settings));
  } catch {
    // Cache is best-effort only.
  }
}

function readCachedBrandSettings(): EmailBrandSettings | null {
  try {
    const raw = window.localStorage.getItem(BRAND_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EmailBrandSettings>;
    if (!parsed.logoUrl && !parsed.schoolName) return null;
    return {
      schoolName: parsed.schoolName || "",
      logoUrl: parsed.logoUrl || "",
      logoDataUrl: parsed.logoDataUrl ?? null,
      logoFileId: parsed.logoFileId ?? null,
      primaryColor: parsed.primaryColor || DEFAULT_BRAND.primaryColor,
      accentColor: parsed.accentColor || DEFAULT_BRAND.accentColor,
      appUrl: parsed.appUrl || "",
      supportEmail: parsed.supportEmail || "",
      footerText: parsed.footerText || "",
      updatedAt: parsed.updatedAt ?? null,
    };
  } catch {
    return null;
  }
}

function logoHref(data: FlightShareData): string | null {
  const href = data.brand.logoDataUrl || null;
  if (!href) {
    warnBrandDebug("sticker has no embedded logo data URL", {
      flightId: data.flightId,
      brand: summarizeBrand(data.brand),
    });
  }
  return href;
}

const flightShareDataCache = new Map<string, FlightShareData>();
const flightShareDataInflight = new Map<string, Promise<FlightShareData>>();

export function getCachedFlightShareData(flightId: string): FlightShareData | null {
  return flightShareDataCache.get(flightId) ?? null;
}

export async function loadFlightShareData(flightId: string): Promise<FlightShareData> {
  const cached = flightShareDataCache.get(flightId);
  if (cached) return cached;
  const inflight = flightShareDataInflight.get(flightId);
  if (inflight) return inflight;

  const promise = loadFlightShareDataUncached(flightId)
    .then((data) => {
      flightShareDataCache.set(flightId, data);
      return data;
    })
    .finally(() => {
      flightShareDataInflight.delete(flightId);
    });
  flightShareDataInflight.set(flightId, promise);
  return promise;
}

async function loadFlightShareDataUncached(flightId: string): Promise<FlightShareData> {
  logBrandDebug("loading flight share data", { flightId });
  const [flight, brand] = await Promise.all([getSavedFlight(flightId), loadFlightShareBrand()]);
  if (flight.error || !flight.data) {
    throw flight.error ?? new Error("Voo não encontrado.");
  }

  const decoded = decodeFlightRecord(flight.data.csv_text);
  const telemetryCsv = decoded.meta ? decoded.telemetryCsv : flight.data.csv_text;
  const parsed = telemetryCsv.trim() ? parseGarminCsv(telemetryCsv) : null;
  const points = parsed?.points ?? [];
  const chartData = parsed?.chartData ?? [];
  const summary = summarizeFlight(points);
  const displayInfo = buildFlightDisplayInfo(flight.data, flight.data.csv_text);
  const routeMap = await buildRouteMap(points);
  const telemetryKind = detectFlightShareTelemetryKind(flight.data.source_filename, telemetryCsv);
  const durationSec =
    chartDurationSec(chartData, parsed?.hasChartTime ?? false) ??
    summary.durationSec ??
    flight.data.duration_sec ??
    (displayInfo.totalFlightMinutes > 0 ? displayInfo.totalFlightMinutes * 60 : null);

  logBrandDebug("flight share data ready", {
    flightId,
    sourceFileName: flight.data.source_filename,
    telemetryKind,
    points: points.length,
    chartRows: chartData.length,
    hasRouteMap: Boolean(routeMap),
    brand: summarizeBrand(brand),
  });

  return {
    flightId,
    sourceFileName: flight.data.source_filename,
    telemetryKind,
    meta: decoded.meta,
    displayInfo,
    parsed,
    points,
    chartData,
    hasChartTime: parsed?.hasChartTime ?? false,
    chartTimeBaseMs: parsed?.chartTimeBaseMs ?? null,
    summary,
    durationDisplay: durationSec !== null ? formatDuration(durationSec) : displayInfo.totalFlight || "-",
    brand,
    routeMap,
  };
}

export async function buildFlightShareDataFromFlight(
  flight: SavedFlightFull,
  brandSettings?: EmailBrandSettings | null,
): Promise<FlightShareData> {
  const brand = await brandFromSettings(brandSettings);
  const decoded = decodeFlightRecord(flight.csv_text);
  const telemetryCsv = decoded.meta ? decoded.telemetryCsv : flight.csv_text;
  const parsed = telemetryCsv.trim() ? parseGarminCsv(telemetryCsv) : null;
  const points = parsed?.points ?? [];
  const chartData = parsed?.chartData ?? [];
  const summary = summarizeFlight(points);
  const displayInfo = buildFlightDisplayInfo(flight, flight.csv_text);
  const routeMap = await buildRouteMap(points);
  const telemetryKind = detectFlightShareTelemetryKind(flight.source_filename, telemetryCsv);
  const durationSec =
    chartDurationSec(chartData, parsed?.hasChartTime ?? false) ??
    summary.durationSec ??
    flight.duration_sec ??
    (displayInfo.totalFlightMinutes > 0 ? displayInfo.totalFlightMinutes * 60 : null);

  const data: FlightShareData = {
    flightId: flight.id,
    sourceFileName: flight.source_filename,
    telemetryKind,
    meta: decoded.meta,
    displayInfo,
    parsed,
    points,
    chartData,
    hasChartTime: parsed?.hasChartTime ?? false,
    chartTimeBaseMs: parsed?.chartTimeBaseMs ?? null,
    summary,
    durationDisplay: durationSec !== null ? formatDuration(durationSec) : displayInfo.totalFlight || "-",
    brand,
    routeMap,
  };
  flightShareDataCache.set(flight.id, data);
  return data;
}

function baseDefs(data: FlightShareData): string {
  const primary = escapeXml(data.brand.primaryColor);
  const accent = escapeXml(data.brand.accentColor);
  return `
    <defs>
      <linearGradient id="gfvAccent" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stop-color="${primary}" />
        <stop offset="100%" stop-color="${accent}" />
      </linearGradient>
      <linearGradient id="gfvSoft" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stop-color="${primary}" stop-opacity="0.32" />
        <stop offset="100%" stop-color="${accent}" stop-opacity="0.18" />
      </linearGradient>
      <filter id="gfvShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="26" stdDeviation="22" flood-color="#020617" flood-opacity="0.48" />
      </filter>
      <filter id="gfvGlow" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="0" stdDeviation="16" flood-color="${primary}" flood-opacity="0.65" />
      </filter>
      <clipPath id="gfvStickerSafe">
        <rect x="86" y="120" width="908" height="1680" rx="41.6" />
      </clipPath>
      <style>
        text { font-family: "Segoe UI", Arial, sans-serif; }
      </style>
    </defs>
  `;
}

function svgShell(data: FlightShareData, body: string, width = STICKER_WIDTH, height = STICKER_HEIGHT): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${baseDefs(data)}
    ${body}
  </svg>`;
}

function fullBleedBg(showBackground: boolean, width: number, height: number, color = "#020617"): string {
  if (!showBackground) return "";
  return `<rect x="0" y="0" width="${width}" height="${height}" fill="${color}" />`;
}

function smallBrand(data: FlightShareData, x: number, y: number): string {
  const href = logoHref(data);
  if (href) {
    return `<image href="${escapeXml(href)}" x="${x}" y="${y}" width="260" height="82" preserveAspectRatio="xMinYMid meet" />`;
  }
  return "";
}

function metricBlock(label: string, value: string, x: number, y: number, width = 395, height = 120): string {
  return `
    <g>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18.2" fill="#0f172a" fill-opacity="0.76" stroke="#ffffff" stroke-opacity="0.12" />
      ${fitText(label, x + 28, y + 42, { color: "#94a3b8", fontSize: 24, fontWeight: 700, maxWidth: width - 56, letterSpacing: 1 })}
      ${fitText(value, x + 28, y + 86, { fontSize: 36, fontWeight: 900, maxWidth: width - 56 })}
    </g>
  `;
}

function flightTitle(data: FlightShareData): string {
  const aircraft = clampText(data.displayInfo.aircraft, "Voo");
  const route = data.displayInfo.fromTo !== "-" ? ` · ${data.displayInfo.fromTo}` : "";
  return `${aircraft}${route}`;
}

function samplePoints(points: FlightPoint[], limit: number): FlightPoint[] {
  if (points.length <= limit) return points;
  const step = Math.ceil(points.length / limit);
  return points.filter((_, index) => index % step === 0 || index === points.length - 1);
}

function routePath(points: FlightPoint[], box: Box): string {
  if (points.length < 2) return "";
  const sampled = samplePoints(points, 320);
  const lats = sampled.map((point) => point.lat);
  const lons = sampled.map((point) => point.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const latSpan = maxLat - minLat || 0.0001;
  const lonSpan = maxLon - minLon || 0.0001;

  return sampled
    .map((point, index) => {
      const x = box.x + ((point.lon - minLon) / lonSpan) * box.w;
      const y = box.y + box.h - ((point.lat - minLat) / latSpan) * box.h;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function projectOsm(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const scale = 256 * 2 ** zoom;
  const safeLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const sinLat = Math.sin((safeLat * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
}

function chooseOsmZoom(points: Array<{ lat: number; lon: number }>, targetWidth: number, targetHeight: number): number {
  for (let zoom = 18; zoom >= 3; zoom--) {
    const projected = points.map((point) => projectOsm(point.lat, point.lon, zoom));
    const width = Math.max(...projected.map((point) => point.x)) - Math.min(...projected.map((point) => point.x));
    const height = Math.max(...projected.map((point) => point.y)) - Math.min(...projected.map((point) => point.y));
    if (width <= targetWidth && height <= targetHeight) return zoom;
  }
  return 3;
}

async function imageUrlToDataUrl(url: string): Promise<string | null> {
  try {
    const headers =
      typeof window === "undefined"
        ? {
          "accept": "image/avif,image/webp,image/png,image/*;q=0.8",
          "referer": "https://app.epeac.com.br/",
          "user-agent": "EPEAC Flight Review Bot/1.0 (https://app.epeac.com.br)",
        }
        : undefined;
    const response = await fetch(url, { mode: "cors", headers });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("image/")) return null;
    const blob = await response.blob();
    if (blob.size < 200 || blob.size > 750_000) return null;
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function buildRouteMap(points: FlightPoint[]): Promise<FlightShareRouteMap | null> {
  if (points.length < 2) return null;
  // Formato paisagem alinhado às figurinhas de mapa (1080×720).
  const width = 1080;
  const height = 720;
  const padding = 40;
  const sampled = samplePoints(points, 900);
  const zoom = chooseOsmZoom(sampled, width - padding * 2, height - padding * 2);
  const projected = sampled.map((point) => projectOsm(point.lat, point.lon, zoom));
  const minX = Math.min(...projected.map((point) => point.x));
  const maxX = Math.max(...projected.map((point) => point.x));
  const minY = Math.min(...projected.map((point) => point.y));
  const maxY = Math.max(...projected.map((point) => point.y));
  const routeW = Math.max(maxX - minX, 1);
  const routeH = Math.max(maxY - minY, 1);
  // Overzoom contínuo entre níveis OSM: aproxima o máximo sem cortar a rota.
  const scale = Math.min(
    (width - padding * 2) / routeW,
    (height - padding * 2) / routeH,
  );
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const leftWorld = centerX - width / (2 * scale);
  const topWorld = centerY - height / (2 * scale);
  const tileSize = 256 * scale;
  const maxTile = 2 ** zoom;
  const tileMinX = Math.floor(leftWorld / 256);
  const tileMaxX = Math.floor((leftWorld + width / scale) / 256);
  const tileMinY = Math.max(0, Math.floor(topWorld / 256));
  const tileMaxY = Math.min(maxTile - 1, Math.floor((topWorld + height / scale) / 256));
  const tiles: FlightShareMapTile[] = [];

  for (let tileX = tileMinX; tileX <= tileMaxX; tileX++) {
    for (let tileY = tileMinY; tileY <= tileMaxY; tileY++) {
      const wrappedX = ((tileX % maxTile) + maxTile) % maxTile;
      const subdomain = ["a", "b", "c"][Math.abs(tileX + tileY) % 3] ?? "a";
      const tileUrl = `https://${subdomain}.tile.openstreetmap.org/${zoom}/${wrappedX}/${tileY}.png`;
      const href = await imageUrlToDataUrl(tileUrl);
      if (!href) continue;
      tiles.push({
        href,
        x: tileX * 256 * scale - leftWorld * scale,
        y: tileY * 256 * scale - topWorld * scale,
      });
    }
  }

  return {
    width,
    height,
    tileSize,
    tiles,
    routePoints: projected.map((point) => ({
      x: (point.x - leftWorld) * scale,
      y: (point.y - topWorld) * scale,
    })),
  };
}

function routePointsInBox(data: FlightShareData, box: Box): Array<{ x: number; y: number }> {
  const map = data.routeMap;
  if (map && map.routePoints.length >= 2) {
    const scaleX = box.w / map.width;
    const scaleY = box.h / map.height;
    return map.routePoints.map((point) => ({
      x: box.x + point.x * scaleX,
      y: box.y + point.y * scaleY,
    }));
  }

  if (data.points.length < 2) return [];
  const sampled = samplePoints(data.points, 320);
  const lats = sampled.map((point) => point.lat);
  const lons = sampled.map((point) => point.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const latSpan = maxLat - minLat || 0.0001;
  const lonSpan = maxLon - minLon || 0.0001;
  return sampled.map((point) => ({
    x: box.x + ((point.lon - minLon) / lonSpan) * box.w,
    y: box.y + box.h - ((point.lat - minLat) / latSpan) * box.h,
  }));
}

function routePathFromMap(map: FlightShareRouteMap | null, box: Box): string {
  if (!map || map.routePoints.length < 2) return "";
  const scaleX = box.w / map.width;
  const scaleY = box.h / map.height;
  return map.routePoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${(box.x + point.x * scaleX).toFixed(1)} ${(box.y + point.y * scaleY).toFixed(1)}`)
    .join(" ");
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function routeProgressColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  // Verde (#22c55e) → azul (#3b82f6) → vermelho (#ef4444)
  const stops = [
    { t: 0, r: 0x22, g: 0xc5, b: 0x5e },
    { t: 0.5, r: 0x3b, g: 0x82, b: 0xf6 },
    { t: 1, r: 0xef, g: 0x44, b: 0x44 },
  ];
  const endIndex = stops.findIndex((stop) => stop.t >= clamped);
  const next = stops[endIndex < 0 ? stops.length - 1 : endIndex];
  const prev = stops[Math.max(0, (endIndex < 0 ? stops.length - 1 : endIndex) - 1)];
  const span = next.t - prev.t || 1;
  const local = (clamped - prev.t) / span;
  const r = Math.round(lerp(prev.r, next.r, local));
  const g = Math.round(lerp(prev.g, next.g, local));
  const b = Math.round(lerp(prev.b, next.b, local));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/** Traçado com cor por progresso (verde→azul→vermelho). Mais confiável que linearGradient em stroke. */
function routeGradientStroke(data: FlightShareData, box: Box, strokeWidth = 14): string {
  const points = routePointsInBox(data, box);
  if (points.length < 2) return "";

  const maxSegments = 120;
  const step = Math.max(1, Math.ceil((points.length - 1) / maxSegments));
  const parts: string[] = [];
  for (let i = 0; i < points.length - 1; i += step) {
    const nextIndex = Math.min(points.length - 1, i + step);
    const a = points[i];
    const b = points[nextIndex];
    const t = i / (points.length - 1);
    const color = routeProgressColor(t);
    parts.push(
      `<path d="M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />`,
    );
  }
  return parts.join("\n");
}

function routeAirportCodes(data: FlightShareData): [string, string] {
  const legs = data.meta?.legs.filter((leg) => leg.dep || leg.arr) ?? [];
  const dep = legs.find((leg) => leg.dep)?.dep;
  const arr = [...legs].reverse().find((leg) => leg.arr)?.arr;
  if (dep || arr) return [clampText(dep, "DEP").toUpperCase(), clampText(arr, "ARR").toUpperCase()];

  const parts = data.displayInfo.fromTo
    .split(/\s*(?:->|→|\/| - | – )\s*/)
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
  return [parts[0] || "DEP", parts[parts.length - 1] || "ARR"];
}

function routeEndpointPositions(data: FlightShareData, box: Box): Array<{ x: number; y: number }> {
  const map = data.routeMap;
  if (map && map.routePoints.length >= 2) {
    const scaleX = box.w / map.width;
    const scaleY = box.h / map.height;
    const first = map.routePoints[0];
    const last = map.routePoints[map.routePoints.length - 1];
    return [
      { x: box.x + first.x * scaleX, y: box.y + first.y * scaleY },
      { x: box.x + last.x * scaleX, y: box.y + last.y * scaleY },
    ];
  }

  if (data.points.length < 2) return [];
  const sampled = samplePoints(data.points, 320);
  const lats = sampled.map((point) => point.lat);
  const lons = sampled.map((point) => point.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const latSpan = maxLat - minLat || 0.0001;
  const lonSpan = maxLon - minLon || 0.0001;
  const positionFor = (point: FlightPoint) => ({
    x: box.x + ((point.lon - minLon) / lonSpan) * box.w,
    y: box.y + box.h - ((point.lat - minLat) / latSpan) * box.h,
  });
  return [positionFor(sampled[0]), positionFor(sampled[sampled.length - 1])];
}

function routeEndpointMarkers(data: FlightShareData, box: Box): string {
  const positions = routeEndpointPositions(data, box);
  if (positions.length < 2) return "";
  const [depCode, arrCode] = routeAirportCodes(data);
  return positions.map((position, index) => {
    const code = index === 0 ? depCode : arrCode;
    const labelWidth = Math.max(74, code.length * 23 + 34);
    const labelX = clampNumber(position.x, box.x + labelWidth / 2 + 14, box.x + box.w - labelWidth / 2 - 14);
    const labelY = clampNumber(position.y - 44, box.y + 30, box.y + box.h - 38);
    const markerX = clampNumber(position.x, box.x + 18, box.x + box.w - 18);
    const markerY = clampNumber(position.y, box.y + 18, box.y + box.h - 18);
    return `
      <g>
        <circle cx="${markerX.toFixed(1)}" cy="${markerY.toFixed(1)}" r="18" fill="#020617" fill-opacity="0.82" stroke="#ffffff" stroke-width="5" />
        <circle cx="${markerX.toFixed(1)}" cy="${markerY.toFixed(1)}" r="8" fill="url(#gfvAccent)" />
        <rect x="${(labelX - labelWidth / 2).toFixed(1)}" y="${(labelY - 28).toFixed(1)}" width="${labelWidth}" height="42" rx="13.65" fill="#020617" fill-opacity="0.86" stroke="#ffffff" stroke-opacity="0.28" />
        ${fitText(code, labelX, labelY + 2, { fontSize: 25, fontWeight: 900, maxWidth: labelWidth - 22, anchor: "middle" })}
      </g>
    `;
  }).join("");
}

type RouteMapLayerOptions = {
  showEndpoints?: boolean;
  showFrame?: boolean;
  /** Raio do clip; 0 = mapa sem arredondamento (full-bleed). */
  radius?: number;
};

function routeMapLayer(
  data: FlightShareData,
  box: Box,
  includeTiles: boolean,
  options: RouteMapLayerOptions = {},
): string {
  const showEndpoints = options.showEndpoints ?? true;
  const showFrame = options.showFrame ?? true;
  const radius = options.radius ?? 33.8;
  const map = data.routeMap;
  const route = routePathFromMap(map, box) || routePath(data.points, box);
  const track = routeGradientStroke(data, box, 14);
  const clipId = `gfvMapClip${Math.round(box.x)}${Math.round(box.y)}${Math.round(box.w)}${Math.round(box.h)}`;
  const tiles = includeTiles && map?.tiles.length
    ? map.tiles.map((tile) => {
      const scaleX = box.w / map.width;
      const scaleY = box.h / map.height;
      const tileSize = map.tileSize ?? 256;
      return `<image href="${escapeXml(tile.href)}" x="${(box.x + tile.x * scaleX).toFixed(1)}" y="${(box.y + tile.y * scaleY).toFixed(1)}" width="${(tileSize * scaleX).toFixed(1)}" height="${(tileSize * scaleY).toFixed(1)}" preserveAspectRatio="none" />`;
    }).join("")
    : "";
  const clipRect = radius > 0
    ? `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="${radius}" />`
    : `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" />`;

  return `
    <defs>
      <clipPath id="${clipId}">
        ${clipRect}
      </clipPath>
    </defs>
    <g clip-path="url(#${clipId})">
      <rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" ${radius > 0 ? `rx="${radius}"` : ""} fill="${includeTiles ? "#e5e7eb" : "#0f172a"}" fill-opacity="${includeTiles ? "0.96" : "0.32"}" />
      ${tiles}
      ${!includeTiles || !tiles ? Array.from({ length: 8 }, (_, index) => `<line x1="${box.x + index * (box.w / 7)}" y1="${box.y}" x2="${box.x + index * (box.w / 7)}" y2="${box.y + box.h}" stroke="#ffffff" stroke-opacity="0.12" />`).join("") : ""}
      ${!includeTiles || !tiles ? Array.from({ length: 7 }, (_, index) => `<line x1="${box.x}" y1="${box.y + index * (box.h / 6)}" x2="${box.x + box.w}" y2="${box.y + index * (box.h / 6)}" stroke="#ffffff" stroke-opacity="0.12" />`).join("") : ""}
      ${track || (route ? `<path d="${route}" fill="none" stroke="#3b82f6" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" />` : "")}
      ${route && showEndpoints ? routeEndpointMarkers(data, box) : ""}
      ${route ? "" : `<text x="${box.x + box.w / 2}" y="${box.y + box.h / 2}" fill="#cbd5e1" font-size="34" font-weight="700" text-anchor="middle">Rota indisponível</text>`}
      ${showFrame ? `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" ${radius > 0 ? `rx="${radius}"` : ""} fill="none" stroke="#ffffff" stroke-opacity="0.26" stroke-width="2" />` : ""}
    </g>
  `;
}

function samplesFromChart(chartData: ChartRow[], keys: string[]): Sample[] {
  const samples: Sample[] = [];
  for (const row of chartData) {
    const y = keys.map((key) => row[key]).find((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (typeof y === "number") samples.push({ x: row.x, y });
  }
  return samples;
}

function samplesFromPoints(points: FlightPoint[], key: "altitudeFt" | "speedKt"): Sample[] {
  return points
    .map((point, index) => {
      if (key === "altitudeFt" && point.altM !== null) return { x: point.t ?? index, y: point.altM / 0.3048 };
      if (key === "speedKt" && point.speedMs !== null) return { x: point.t ?? index, y: point.speedMs / 0.514444 };
      return null;
    })
    .filter((sample): sample is Sample => sample !== null);
}

function chartPath(samples: Sample[], box: Box): string {
  if (samples.length < 2) return "";
  const sampled = samples.length > 260 ? samples.filter((_, index) => index % Math.ceil(samples.length / 260) === 0) : samples;
  const xs = sampled.map((sample) => sample.x);
  const ys = sampled.map((sample) => sample.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const xSpan = maxX - minX || 1;
  const ySpan = maxY - minY || 1;

  return sampled
    .map((sample, index) => {
      const x = box.x + ((sample.x - minX) / xSpan) * box.w;
      const y = box.y + box.h - ((sample.y - minY) / ySpan) * box.h;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function chartAreaPath(samples: Sample[], box: Box): string {
  const line = chartPath(samples, box);
  if (!line) return "";
  return `${line} L ${box.x + box.w} ${box.y + box.h} L ${box.x} ${box.y + box.h} Z`;
}

function maxSeriesValue(chartData: ChartRow[], keys: string[]): number | null {
  const values: number[] = [];
  for (const row of chartData) {
    for (const key of keys) {
      const value = row[key];
      if (typeof value === "number" && Number.isFinite(value)) values.push(value);
    }
  }
  return values.length > 0 ? Math.max(...values) : null;
}

function summarySticker(data: FlightShareData, options: StickerBuildOptions = {}): FlightShareSticker {
  const showBackground = options.showBackground ?? true;
  const title = flightTitle(data);
  const distance = formatDistanceNmKm(data.summary.distanceM, data.displayInfo.totalMiles);
  const altMax = formatMetricAlt(data.summary, data.chartData);
  const speedMax = formatMetricSpeed(data.summary, data.chartData);
  const width = 1080;
  const height = 560;
  const pad = 48;
  const body = `
    <g>
      ${fullBleedBg(showBackground, width, height)}
      ${fitText(title, pad, 88, { fontSize: 44, fontWeight: 900, maxWidth: 680 })}
      ${smallBrand(data, width - 300, 36)}
      <rect x="${pad}" y="118" width="${width - pad * 2}" height="3" rx="1.3" fill="url(#gfvAccent)" />
      ${metricBlock("Tempo", data.durationDisplay, pad, 160, 460, 130)}
      ${metricBlock("Distância", distance, pad + 492, 160, 460, 130)}
      ${metricBlock("Alt. máxima", altMax, pad, 320, 460, 130)}
      ${metricBlock("Vel. máxima", speedMax, pad + 492, 320, 460, 130)}
    </g>
  `;

  return createSticker("summary", "Resumo do voo", "Métricas principais do voo.", data, body, width, height);
}

function routeSticker(data: FlightShareData, options: StickerBuildOptions = {}): FlightShareSticker {
  const showBackground = options.showBackground ?? true;
  const width = 1080;
  const height = 780;
  const pad = 40;
  const box = { x: pad, y: 120, w: width - pad * 2, h: 480 };
  const body = `
    <g>
      ${fullBleedBg(showBackground, width, height)}
      ${fitText("Rota do voo", pad, 58, { fontSize: 40, fontWeight: 900, maxWidth: 560 })}
      ${fitText(flightTitle(data), pad, 96, { color: "#cbd5e1", fontSize: 24, fontWeight: 700, maxWidth: 560 })}
      ${smallBrand(data, width - 300, 28)}
      ${routeMapLayer(data, box, true, { radius: 20.8 })}
      ${metricMini("Distância", formatDistanceShort(data.summary.distanceM, data.displayInfo.totalMiles), pad + 20, 660)}
      ${metricMini("Tempo", data.durationDisplay, 380, 660)}
      ${metricMini("Pousos", String(data.displayInfo.landings || "-"), 720, 660)}
    </g>
  `;

  return createSticker("route", "Rota + métricas", "Trilha GPS com tempo, distância e pousos.", data, body, width, height);
}

function cleanMapLogoOverlay(data: FlightShareData, box: Box): string {
  const href = logoHref(data);
  if (!href) return "";
  const logoW = 220;
  const logoH = 72;
  const pad = 28;
  return `<image href="${escapeXml(href)}" x="${box.x + box.w - logoW - pad}" y="${box.y + pad}" width="${logoW}" height="${logoH}" preserveAspectRatio="xMaxYMid meet" />`;
}

function mapOverlayMetricCard(label: string, value: string, x: number, y: number, width: number, height: number): string {
  return `
    <g>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18.2" fill="#0f172a" fill-opacity="0.8" stroke="#ffffff" stroke-opacity="0.16" />
      ${fitText(label, x + width / 2, y + 44, { color: "#94a3b8", fontSize: 24, fontWeight: 800, maxWidth: width - 40, anchor: "middle", letterSpacing: 1 })}
      ${fitText(value, x + width / 2, y + 96, { fontSize: 40, fontWeight: 900, maxWidth: width - 40, anchor: "middle" })}
    </g>
  `;
}

function mapSticker(data: FlightShareData, _options: StickerBuildOptions = {}): FlightShareSticker {
  const width = 1080;
  const height = 720;
  const box = { x: 0, y: 0, w: width, h: height };
  const body = `
    <g>
      ${routeMapLayer(data, box, true, { showEndpoints: true, showFrame: false, radius: 0 })}
      ${cleanMapLogoOverlay(data, box)}
    </g>
  `;

  return createSticker("map", "Mapa", "Só o mapa e o traçado do voo.", data, body, width, height);
}

function mapStatsSticker(data: FlightShareData, _options: StickerBuildOptions = {}): FlightShareSticker {
  const width = 1080;
  const height = 720;
  const box = { x: 0, y: 0, w: width, h: height };
  const cardW = 460;
  const cardH = 140;
  const gap = 28;
  const totalW = cardW * 2 + gap;
  const startX = (width - totalW) / 2;
  const cardY = height - cardH - 36;
  const body = `
    <g>
      ${routeMapLayer(data, box, true, { showEndpoints: true, showFrame: false, radius: 0 })}
      ${cleanMapLogoOverlay(data, box)}
      ${mapOverlayMetricCard("Tempo", data.durationDisplay, startX, cardY, cardW, cardH)}
      ${mapOverlayMetricCard(
        "Distância",
        formatDistanceShort(data.summary.distanceM, data.displayInfo.totalMiles),
        startX + cardW + gap,
        cardY,
        cardW,
        cardH,
      )}
    </g>
  `;

  return createSticker("mapStats", "Mapa + métricas", "Mapa limpo com tempo e distância.", data, body, width, height);
}

function legDistance(value: string): string {
  const clean = value.trim();
  if (!clean) return "-";
  const n = Number(clean.replace(",", ".").replace(/[^\d.-]/g, ""));
  if (Number.isFinite(n) && n > 0) return `${n.toFixed(1)} NM`;
  return clean;
}

function legTime(value: string): string {
  return value.trim() || "-";
}

function legRows(data: FlightShareData, x: number, y: number, width: number): string {
  const legs = data.meta?.legs.filter((leg) => leg.dep || leg.arr) ?? [];
  if (legs.length === 0) {
    return `<text x="${x + width / 2}" y="${y + 80}" fill="#cbd5e1" font-size="28" font-weight="700" text-anchor="middle">Pernas não informadas na ficha.</text>`;
  }
  return legs.slice(0, 6).map((leg, index) => {
    const rowY = y + index * 92;
    const lineY = rowY + 52;
    const dep = clampText(leg.dep, "DEP").toUpperCase();
    const arr = clampText(leg.arr, "ARR").toUpperCase();
    const detail = `${legTime(leg.flightTime)} · ${legDistance(leg.distance)}`;
    return `
      <g>
        ${fitText(detail, x + width / 2, rowY + 28, { color: "#f8fafc", fontSize: 28, fontWeight: 900, maxWidth: width - 200, anchor: "middle" })}
        <rect x="${x + 110}" y="${lineY - 5}" width="${width - 220}" height="10" rx="3.9" fill="url(#gfvAccent)" />
        <circle cx="${x + 110}" cy="${lineY}" r="8" fill="#f8fafc" />
        <circle cx="${x + width - 110}" cy="${lineY}" r="8" fill="#f8fafc" />
        ${fitText(dep, x, lineY + 36, { fontSize: 30, fontWeight: 900, maxWidth: 220 })}
        ${fitText(arr, x + width, lineY + 36, { fontSize: 30, fontWeight: 900, maxWidth: 220, anchor: "end" })}
      </g>
    `;
  }).join("");
}

function legsContentMetrics(data: FlightShareData) {
  const legs = data.meta?.legs.filter((leg) => leg.dep || leg.arr) ?? [];
  const visibleLegs = Math.max(1, Math.min(legs.length || 1, 6));
  const rowsHeight = visibleLegs * 92;
  const rowsBoxHeight = Math.max(180, rowsHeight + 48);
  const height = 120 + rowsBoxHeight + 48;
  return { rowsBoxHeight, height };
}

function legsSticker(data: FlightShareData, options: StickerBuildOptions = {}): FlightShareSticker {
  const showBackground = options.showBackground ?? true;
  const layout = legsContentMetrics(data);
  const width = 1080;
  const height = layout.height;
  const pad = 48;
  const body = `
    <g>
      ${fullBleedBg(showBackground, width, height)}
      ${fitText("Pernas do voo", pad, 64, { fontSize: 40, fontWeight: 900, maxWidth: 560 })}
      ${smallBrand(data, width - 300, 28)}
      ${legRows(data, pad + 24, 120, width - pad * 2 - 48)}
    </g>
  `;
  return createSticker("legs", "Pernas do voo", "Uma linha para cada perna com tempo e distância.", data, body, width, height);
}

function altitudeSticker(data: FlightShareData, options: StickerBuildOptions = {}): FlightShareSticker {
  const showBackground = options.showBackground ?? true;
  const samples = samplesFromChart(data.chartData, ["gpsAltFt", "baroAltFt", "pressAltFt"]);
  const fallbackSamples = samples.length >= 2 ? samples : samplesFromPoints(data.points, "altitudeFt");
  const width = 1080;
  const height = 700;
  const pad = 48;
  const box = { x: pad, y: 200, w: width - pad * 2, h: 300 };
  const linePath = chartPath(fallbackSamples, box);
  const areaPath = chartAreaPath(fallbackSamples, box);
  const altMax = formatMetricAlt(data.summary, data.chartData);
  const body = `
    <g>
      ${fullBleedBg(showBackground, width, height)}
      ${fitText("ALTIMETRIA", pad, 56, { color: "#94a3b8", fontSize: 24, fontWeight: 900, maxWidth: 420, letterSpacing: 3 })}
      ${fitText(altMax, pad, 118, { fontSize: 60, fontWeight: 900, maxWidth: 520 })}
      ${fitText("Altitude máxima", pad, 158, { color: "#cbd5e1", fontSize: 24, fontWeight: 700, maxWidth: 520 })}
      ${smallBrand(data, width - 300, 28)}
      <path d="${areaPath}" fill="url(#gfvSoft)" />
      <path d="${linePath}" fill="none" stroke="url(#gfvAccent)" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" filter="url(#gfvGlow)" />
      ${linePath ? "" : `<text x="${width / 2}" y="360" fill="#cbd5e1" font-size="30" font-weight="700" text-anchor="middle">Altimetria indisponível</text>`}
      <line x1="${pad}" y1="${box.y + box.h}" x2="${width - pad}" y2="${box.y + box.h}" stroke="#ffffff" stroke-opacity="0.22" stroke-width="2" />
      ${metricBlock("Tempo de voo", data.durationDisplay, pad, height - 160, 460, 110)}
      ${metricBlock("Distância", formatDistanceShort(data.summary.distanceM, data.displayInfo.totalMiles), pad + 492, height - 160, 460, 110)}
    </g>
  `;

  return createSticker("altitude", "Altitude", "Gráfico de altimetria em fundo transparente.", data, body, width, height);
}

function speedSticker(data: FlightShareData, options: StickerBuildOptions = {}): FlightShareSticker {
  const showBackground = options.showBackground ?? true;
  const samples = samplesFromChart(data.chartData, ["iasKt", "gsKt", "tasKt"]);
  const fallbackSamples = samples.length >= 2 ? samples : samplesFromPoints(data.points, "speedKt");
  const width = 1080;
  const height = 700;
  const pad = 48;
  const box = { x: pad, y: 200, w: width - pad * 2, h: 300 };
  const linePath = chartPath(fallbackSamples, box);
  const areaPath = chartAreaPath(fallbackSamples, box);
  const maxSpeed = formatMetricSpeed(data.summary, data.chartData);
  const avgSpeed = data.summary.speedAvgMs !== null ? formatSpeedKt(data.summary.speedAvgMs) : formatKt(maxSeriesValue(data.chartData, ["iasKt", "gsKt"]));
  const body = `
    <g>
      ${fullBleedBg(showBackground, width, height)}
      ${fitText("VELOCIDADE", pad, 56, { color: "#94a3b8", fontSize: 24, fontWeight: 900, maxWidth: 420, letterSpacing: 3 })}
      ${fitText(maxSpeed, pad, 118, { fontSize: 60, fontWeight: 900, maxWidth: 520 })}
      ${fitText("máxima registrada", pad, 158, { color: "#cbd5e1", fontSize: 24, fontWeight: 700, maxWidth: 520 })}
      ${smallBrand(data, width - 300, 28)}
      <path d="${areaPath}" fill="url(#gfvSoft)" />
      <path d="${linePath}" fill="none" stroke="url(#gfvAccent)" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" filter="url(#gfvGlow)" />
      ${linePath ? "" : `<text x="${width / 2}" y="360" fill="#cbd5e1" font-size="30" font-weight="700" text-anchor="middle">Velocidade indisponível</text>`}
      ${metricBlock("Vel. média", avgSpeed, pad, height - 160, 460, 110)}
      ${metricBlock("Tempo", data.durationDisplay, pad + 492, height - 160, 460, 110)}
    </g>
  `;

  return createSticker("speed", "Velocidade", "Gráfico de velocidade e destaques.", data, body, width, height);
}

function compactMetric(label: string, value: string, x: number, y: number): string {
  return `
    <g>
      <rect x="${x}" y="${y}" width="228" height="108" rx="16.9" fill="#0f172a" fill-opacity="0.74" stroke="#ffffff" stroke-opacity="0.12" />
      ${fitText(label, x + 22, y + 40, { color: "#94a3b8", fontSize: 22, fontWeight: 800, maxWidth: 184, letterSpacing: 0.8 })}
      ${fitText(value, x + 22, y + 80, { fontSize: 32, fontWeight: 900, maxWidth: 184 })}
    </g>
  `;
}

function miniChart(title: string, samples: Sample[], box: Box): string {
  const linePath = chartPath(samples, box);
  const areaPath = chartAreaPath(samples, box);
  return `
    <g>
      <rect x="${box.x - 16}" y="${box.y - 58}" width="${box.w + 32}" height="${box.h + 86}" rx="20.8" fill="#0f172a" fill-opacity="0.74" stroke="#ffffff" stroke-opacity="0.12" />
      ${fitText(title, box.x, box.y - 22, { color: "#cbd5e1", fontSize: 24, fontWeight: 900, maxWidth: box.w })}
      <path d="${areaPath}" fill="url(#gfvSoft)" />
      <path d="${linePath}" fill="none" stroke="url(#gfvAccent)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />
      ${linePath ? "" : `<text x="${box.x + box.w / 2}" y="${box.y + box.h / 2}" fill="#94a3b8" font-size="24" font-weight="700" text-anchor="middle">Sem dados</text>`}
    </g>
  `;
}

function customMetricItems(data: FlightShareData, options: CustomStickerOptions): Array<{ label: string; value: string }> {
  const metrics: Array<{ label: string; value: string }> = [];
  if (options.showDistance) metrics.push({ label: "Distância", value: formatDistanceShort(data.summary.distanceM, data.displayInfo.totalMiles) });
  if (options.showTime) metrics.push({ label: "Tempo", value: data.durationDisplay });
  if (options.showAltitude) metrics.push({ label: "Alt. max", value: formatMetricAlt(data.summary, data.chartData) });
  if (options.showSpeed) metrics.push({ label: "Vel. max", value: formatMetricSpeed(data.summary, data.chartData) });
  if (options.showAircraft) metrics.push({ label: "Aeronave", value: clampText(data.displayInfo.aircraft, "-") });
  if (options.showDate) metrics.push({ label: "Data", value: formatDatePt(data.displayInfo.flightDateIso) });
  if (options.showStudent) metrics.push({ label: "Aluno", value: clampText(data.displayInfo.studentName, "-") });
  return metrics.slice(0, 9);
}

export function buildCustomFlightShareSticker(data: FlightShareData, options: CustomStickerOptions): FlightShareSticker {
  const merged: CustomStickerOptions = { ...DEFAULT_CUSTOM_STICKER_OPTIONS, ...options };
  const showBackground = merged.showBackground;
  const title = merged.title.trim();
  const customLegsLayout = legsContentMetrics(data);
  const selectedChartCount = Number(merged.showAltitudeChart) + Number(merged.showSpeedChart);
  const hasVisualRoute = merged.routeMode === "map" || merged.routeMode === "clean" || merged.routeMode === "legs";
  const metricLimit = !hasVisualRoute
    ? (selectedChartCount > 0 ? 6 : 8)
    : (selectedChartCount > 0 ? 4 : 6);
  const metrics = customMetricItems(data, merged).slice(0, metricLimit);
  const width = 1080;
  const pad = 40;
  const headerTop = 36;
  const titleLine = title
    ? fitText(title, pad, headerTop + 48, { fontSize: 40, fontWeight: 900, maxWidth: 640 })
    : "";
  const subtitleY = title ? headerTop + 92 : headerTop + 48;
  const headerBottom = title ? headerTop + 120 : headerTop + 76;
  const routeY = hasVisualRoute ? headerBottom + 16 : headerBottom;
  const routeHeight = merged.routeMode === "legs"
    ? customLegsLayout.rowsBoxHeight
    : 340;
  const routeBox = { x: pad, y: routeY, w: width - pad * 2, h: routeHeight };
  const routeBottom = hasVisualRoute ? routeY + routeHeight : headerBottom;
  const metricStartY = routeBottom + (hasVisualRoute ? 28 : 20);
  const metricGrid = metrics.map((metric, index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    return compactMetric(metric.label, metric.value, pad + col * 250, metricStartY + row * 120);
  }).join("");
  let chartY = metricStartY + Math.ceil(Math.max(metrics.length, 1) / 4) * 120 + (metrics.length ? 28 : 0);
  if (metrics.length === 0) chartY = metricStartY;
  const chartParts: string[] = [];
  if (merged.showAltitudeChart) {
    const samples = samplesFromChart(data.chartData, ["gpsAltFt", "baroAltFt", "pressAltFt"]);
    chartParts.push(miniChart("Altimetria", samples.length >= 2 ? samples : samplesFromPoints(data.points, "altitudeFt"), { x: pad + 16, y: chartY, w: width - pad * 2 - 32, h: 140 }));
    chartY += 210;
  }
  if (merged.showSpeedChart) {
    const samples = samplesFromChart(data.chartData, ["iasKt", "gsKt", "tasKt"]);
    chartParts.push(miniChart("Velocidade", samples.length >= 2 ? samples : samplesFromPoints(data.points, "speedKt"), { x: pad + 16, y: chartY, w: width - pad * 2 - 32, h: 140 }));
    chartY += 210;
  }

  const routeLayer = merged.routeMode === "hidden"
    ? ""
    : merged.routeMode === "legs"
      ? `${legRows(data, pad + 24, routeY + 24, width - pad * 2 - 48)}`
      : routeMapLayer(data, routeBox, merged.routeMode === "map", { radius: 16 });

  const height = Math.min(960, Math.max(
    320,
    (chartParts.length > 0 ? chartY : (metrics.length > 0 ? metricStartY + Math.ceil(metrics.length / 4) * 120 : routeBottom)) + 40,
  ));

  const body = `
    <g>
      ${fullBleedBg(showBackground, width, height)}
      ${smallBrand(data, width - 300, 24)}
      ${titleLine}
      ${fitText(flightTitle(data), pad, subtitleY, { color: "#cbd5e1", fontSize: 24, fontWeight: 700, maxWidth: 640 })}
      ${routeLayer}
      ${metricGrid || (!hasVisualRoute && chartParts.length === 0 ? fitText("Escolha uma rota, métrica ou gráfico para aparecer aqui.", pad, metricStartY + 40, { color: "#cbd5e1", fontSize: 24, fontWeight: 700, maxWidth: 900 }) : "")}
      ${chartParts.join("")}
    </g>
  `;

  return createSticker("custom", "Personalizada", "Figurinha montada pelo aluno.", data, body, width, height);
}

function metricMini(label: string, value: string, x: number, y: number): string {
  return `
    <g>
      ${fitText(label, x, y, { color: "#94a3b8", fontSize: 22, fontWeight: 800, maxWidth: 220, letterSpacing: 1 })}
      ${fitText(value, x, y + 48, { fontSize: 36, fontWeight: 900, maxWidth: 220 })}
    </g>
  `;
}

function createSticker(
  id: FlightShareStickerId,
  title: string,
  description: string,
  data: FlightShareData,
  body: string,
  width = STICKER_WIDTH,
  height = STICKER_HEIGHT,
): FlightShareSticker {
  const fileBase = slugify(`${data.displayInfo.aircraft}-${id}-${data.displayInfo.flightDateIso ?? data.flightId}`);
  return {
    id,
    title,
    description,
    fileName: `${fileBase}.png`,
    width,
    height,
    svg: svgShell(data, body, width, height),
  };
}

export function buildFlightShareStickers(data: FlightShareData, options: StickerBuildOptions = {}): FlightShareSticker[] {
  return [
    summarySticker(data, options),
    routeSticker(data, options),
    mapSticker(data, options),
    mapStatsSticker(data, options),
    legsSticker(data, options),
    altitudeSticker(data, options),
    speedSticker(data, options),
  ];
}

export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export async function svgToPngBlob(svg: string, width = STICKER_WIDTH, height = STICKER_HEIGHT): Promise<Blob> {
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const image = new Image();
    image.decoding = "async";
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Não foi possível gerar a imagem da figurinha."));
    });
    image.src = url;
    await loaded;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas indisponível neste navegador.");
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Não foi possível exportar PNG."));
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function stickerToPngFile(sticker: FlightShareSticker): Promise<File> {
  const blob = await svgToPngBlob(sticker.svg, sticker.width, sticker.height);
  return new File([blob], sticker.fileName, { type: "image/png" });
}
