import { buildFlightDisplayInfo, type FlightDisplayInfo } from "./flightDisplay";
import { decodeFlightRecord, type FlightRecordMeta } from "./flightRecordCodec";
import { getSavedFlight } from "./flightsDb";
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

export type FlightShareStickerId = "summary" | "route" | "legs" | "altitude" | "speed" | "custom";

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
  tiles: FlightShareMapTile[];
  routePoints: Array<{ x: number; y: number }>;
};

export type FlightShareData = {
  flightId: string;
  sourceFileName: string;
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

export async function loadFlightShareData(flightId: string): Promise<FlightShareData> {
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
  const durationSec =
    chartDurationSec(chartData, parsed?.hasChartTime ?? false) ??
    summary.durationSec ??
    flight.data.duration_sec ??
    (displayInfo.totalFlightMinutes > 0 ? displayInfo.totalFlightMinutes * 60 : null);

  logBrandDebug("flight share data ready", {
    flightId,
    sourceFileName: flight.data.source_filename,
    points: points.length,
    chartRows: chartData.length,
    hasRouteMap: Boolean(routeMap),
    brand: summarizeBrand(brand),
  });

  return {
    flightId,
    sourceFileName: flight.data.source_filename,
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

function svgShell(data: FlightShareData, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${STICKER_WIDTH}" height="${STICKER_HEIGHT}" viewBox="0 0 ${STICKER_WIDTH} ${STICKER_HEIGHT}">
    ${baseDefs(data)}
    ${body}
  </svg>`;
}

function brandMark(data: FlightShareData, x: number, y: number, width = 360): string {
  const href = logoHref(data);
  if (href) {
    return `
      <g>
        <image href="${escapeXml(href)}" x="${x}" y="${y}" width="${width}" height="116" preserveAspectRatio="xMinYMid meet" />
      </g>
    `;
  }
  return "";
}

function smallBrand(data: FlightShareData, x: number, y: number): string {
  const href = logoHref(data);
  if (href) {
    return `<image href="${escapeXml(href)}" x="${x}" y="${y}" width="260" height="82" preserveAspectRatio="xMinYMid meet" />`;
  }
  return "";
}

function outerCard(showBackground: boolean, x: number, y: number, width: number, height: number, opacity = 0.43): string {
  if (!showBackground) return "";
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="41.6" fill="#020617" fill-opacity="${opacity}" stroke="#ffffff" stroke-opacity="0.14" />`;
}

function innerCard(showBackground: boolean, x: number, y: number, width: number, height: number, radius = 31.2, opacity = 0.74): string {
  if (!showBackground) return "";
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="#0f172a" fill-opacity="${opacity}" stroke="#ffffff" stroke-opacity="0.12" />`;
}

function metricBlock(label: string, value: string, x: number, y: number, width = 395): string {
  return `
    <g>
      <rect x="${x}" y="${y}" width="${width}" height="160" rx="22.1" fill="#0f172a" fill-opacity="0.76" stroke="#ffffff" stroke-opacity="0.12" />
      ${fitText(label, x + 34, y + 58, { color: "#94a3b8", fontSize: 28, fontWeight: 700, maxWidth: width - 68, letterSpacing: 1.2 })}
      ${fitText(value, x + 34, y + 116, { fontSize: 44, fontWeight: 900, maxWidth: width - 68 })}
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
  for (let zoom = 16; zoom >= 3; zoom--) {
    const projected = points.map((point) => projectOsm(point.lat, point.lon, zoom));
    const width = Math.max(...projected.map((point) => point.x)) - Math.min(...projected.map((point) => point.x));
    const height = Math.max(...projected.map((point) => point.y)) - Math.min(...projected.map((point) => point.y));
    if (width <= targetWidth && height <= targetHeight) return zoom;
  }
  return 3;
}

async function imageUrlToDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) return null;
    const blob = await response.blob();
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
  const width = 848;
  const height = 842;
  const padding = 56;
  const sampled = samplePoints(points, 900);
  const zoom = chooseOsmZoom(sampled, width - padding * 2, height - padding * 2);
  const projected = sampled.map((point) => projectOsm(point.lat, point.lon, zoom));
  const minX = Math.min(...projected.map((point) => point.x));
  const maxX = Math.max(...projected.map((point) => point.x));
  const minY = Math.min(...projected.map((point) => point.y));
  const maxY = Math.max(...projected.map((point) => point.y));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const left = centerX - width / 2;
  const top = centerY - height / 2;
  const maxTile = 2 ** zoom;
  const tileMinX = Math.floor(left / 256);
  const tileMaxX = Math.floor((left + width) / 256);
  const tileMinY = Math.max(0, Math.floor(top / 256));
  const tileMaxY = Math.min(maxTile - 1, Math.floor((top + height) / 256));
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
        x: tileX * 256 - left,
        y: tileY * 256 - top,
      });
    }
  }

  return {
    width,
    height,
    tiles,
    routePoints: projected.map((point) => ({ x: point.x - left, y: point.y - top })),
  };
}

function routePathFromMap(map: FlightShareRouteMap | null, box: Box): string {
  if (!map || map.routePoints.length < 2) return "";
  const scaleX = box.w / map.width;
  const scaleY = box.h / map.height;
  return map.routePoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${(box.x + point.x * scaleX).toFixed(1)} ${(box.y + point.y * scaleY).toFixed(1)}`)
    .join(" ");
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

function routeMapLayer(data: FlightShareData, box: Box, includeTiles: boolean): string {
  const map = data.routeMap;
  const route = routePathFromMap(map, box) || routePath(data.points, box);
  const clipId = `gfvMapClip${Math.round(box.x)}${Math.round(box.y)}${Math.round(box.w)}${Math.round(box.h)}`;
  const tiles = includeTiles && map?.tiles.length
    ? map.tiles.map((tile) => {
      const scaleX = box.w / map.width;
      const scaleY = box.h / map.height;
      return `<image href="${escapeXml(tile.href)}" x="${(box.x + tile.x * scaleX).toFixed(1)}" y="${(box.y + tile.y * scaleY).toFixed(1)}" width="${(256 * scaleX).toFixed(1)}" height="${(256 * scaleY).toFixed(1)}" preserveAspectRatio="none" />`;
    }).join("")
    : "";

  return `
    <defs>
      <clipPath id="${clipId}">
        <rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="33.8" />
      </clipPath>
    </defs>
    <g clip-path="url(#${clipId})">
      <rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="33.8" fill="${includeTiles ? "#e5e7eb" : "#0f172a"}" fill-opacity="${includeTiles ? "0.96" : "0.32"}" />
      ${tiles}
      ${!includeTiles || !tiles ? Array.from({ length: 8 }, (_, index) => `<line x1="${box.x + index * (box.w / 7)}" y1="${box.y}" x2="${box.x + index * (box.w / 7)}" y2="${box.y + box.h}" stroke="#ffffff" stroke-opacity="0.12" />`).join("") : ""}
      ${!includeTiles || !tiles ? Array.from({ length: 7 }, (_, index) => `<line x1="${box.x}" y1="${box.y + index * (box.h / 6)}" x2="${box.x + box.w}" y2="${box.y + index * (box.h / 6)}" stroke="#ffffff" stroke-opacity="0.12" />`).join("") : ""}
      <path d="${route}" fill="none" stroke="#ffffff" stroke-opacity="0.86" stroke-width="24" stroke-linecap="round" stroke-linejoin="round" />
      <path d="${route}" fill="none" stroke="url(#gfvAccent)" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" filter="url(#gfvGlow)" />
      ${route ? routeEndpointMarkers(data, box) : ""}
      ${route ? "" : `<text x="${box.x + box.w / 2}" y="${box.y + box.h / 2}" fill="#cbd5e1" font-size="34" font-weight="700" text-anchor="middle">Rota indisponível</text>`}
      <rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="33.8" fill="none" stroke="#ffffff" stroke-opacity="0.26" stroke-width="2" />
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
  const body = `
    <g filter="url(#gfvShadow)">
      ${outerCard(showBackground, 86, 360, 908, 980, 0.48)}
      ${innerCard(showBackground, 128, 402, 824, 896, 33.8, 0.72)}
      ${brandMark(data, 176, 468, 380)}
      ${fitText(title, 176, 648, { fontSize: 58, fontWeight: 900, maxWidth: 728 })}
      <rect x="176" y="724" width="728" height="4" rx="1.3" fill="url(#gfvAccent)" />
      ${metricBlock("Tempo", data.durationDisplay, 176, 806)}
      ${metricBlock("Distância", distance, 508, 806)}
      ${metricBlock("Alt. máxima", altMax, 176, 1014)}
      ${metricBlock("Vel. máxima", speedMax, 508, 1014)}
    </g>
  `;

  return createSticker("summary", "Resumo do voo", "Métricas principais do voo.", data, body);
}

function routeSticker(data: FlightShareData, options: StickerBuildOptions = {}): FlightShareSticker {
  const showBackground = options.showBackground ?? true;
  const box = { x: 116, y: 390, w: 848, h: 590 };
  const body = `
    <g filter="url(#gfvShadow)">
      ${outerCard(showBackground, 86, 142, 908, 1128, 0.34)}
      ${fitText("Rota do voo", 132, 258, { fontSize: 58, fontWeight: 900, maxWidth: 520 })}
      ${fitText(flightTitle(data), 132, 316, { color: "#cbd5e1", fontSize: 32, fontWeight: 700, maxWidth: 520 })}
      ${smallBrand(data, 688, 220)}
      ${routeMapLayer(data, box, true)}
      <rect x="132" y="1024" width="816" height="184" rx="27.3" fill="#0f172a" fill-opacity="0.78" stroke="#ffffff" stroke-opacity="0.13" />
      ${metricMini("Distância", formatDistanceShort(data.summary.distanceM, data.displayInfo.totalMiles), 176, 1092)}
      ${metricMini("Tempo", data.durationDisplay, 420, 1092)}
      ${metricMini("Pousos", String(data.displayInfo.landings || "-"), 664, 1092)}
    </g>
  `;

  return createSticker("route", "Rota + métricas", "Trilha GPS com tempo, distância e pousos.", data, body);
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
    return `<text x="${x + width / 2}" y="${y + 120}" fill="#cbd5e1" font-size="32" font-weight="700" text-anchor="middle">Pernas não informadas na ficha.</text>`;
  }
  return legs.slice(0, 7).map((leg, index) => {
    const rowY = y + index * 124;
    const lineY = rowY + 70;
    const dep = clampText(leg.dep, "DEP").toUpperCase();
    const arr = clampText(leg.arr, "ARR").toUpperCase();
    const detail = `${legTime(leg.flightTime)} · ${legDistance(leg.distance)}`;
    return `
      <g>
        ${fitText(detail, x + width / 2, rowY + 36, { color: "#f8fafc", fontSize: 34, fontWeight: 900, maxWidth: width - 220, anchor: "middle" })}
        <rect x="${x + 122}" y="${lineY - 6}" width="${width - 244}" height="12" rx="3.9" fill="url(#gfvAccent)" />
        <circle cx="${x + 122}" cy="${lineY}" r="10" fill="#f8fafc" />
        <circle cx="${x + width - 122}" cy="${lineY}" r="10" fill="#f8fafc" />
        ${fitText(dep, x, lineY + 48, { fontSize: 38, fontWeight: 900, maxWidth: 240 })}
        ${fitText(arr, x + width, lineY + 48, { fontSize: 38, fontWeight: 900, maxWidth: 240, anchor: "end" })}
      </g>
    `;
  }).join("");
}

function legsContentMetrics(data: FlightShareData) {
  const legs = data.meta?.legs.filter((leg) => leg.dep || leg.arr) ?? [];
  const visibleLegs = Math.max(1, Math.min(legs.length || 1, 7));
  const rowsHeight = visibleLegs * 124;
  const rowsBoxHeight = Math.max(240, rowsHeight + 96);
  const outerHeight = 430 + rowsBoxHeight + 70 - 142;
  return { rowsBoxHeight, outerHeight };
}

function legsSticker(data: FlightShareData, options: StickerBuildOptions = {}): FlightShareSticker {
  const showBackground = options.showBackground ?? true;
  const layout = legsContentMetrics(data);
  const body = `
    <g filter="url(#gfvShadow)">
      ${outerCard(showBackground, 86, 142, 908, layout.outerHeight, 0.46)}
      ${brandMark(data, 132, 220, 360)}
      ${innerCard(showBackground, 122, 430, 836, layout.rowsBoxHeight, 31.2, 0.74)}
      ${legRows(data, 166, 490, 748)}
    </g>
  `;
  return createSticker("legs", "Pernas do voo", "Uma linha para cada perna com tempo e distância.", data, body);
}

function altitudeSticker(data: FlightShareData, options: StickerBuildOptions = {}): FlightShareSticker {
  const showBackground = options.showBackground ?? true;
  const samples = samplesFromChart(data.chartData, ["gpsAltFt", "baroAltFt", "pressAltFt"]);
  const fallbackSamples = samples.length >= 2 ? samples : samplesFromPoints(data.points, "altitudeFt");
  const box = { x: 134, y: 642, w: 812, h: 420 };
  const linePath = chartPath(fallbackSamples, box);
  const areaPath = chartAreaPath(fallbackSamples, box);
  const altMax = formatMetricAlt(data.summary, data.chartData);
  const body = `
    <g filter="url(#gfvShadow)">
      ${outerCard(showBackground, 86, 250, 908, 1280, 0.42)}
      ${fitText("ALTIMETRIA", 136, 376, { color: "#94a3b8", fontSize: 30, fontWeight: 900, maxWidth: 760, letterSpacing: 4 })}
      ${fitText(altMax, 136, 470, { fontSize: 86, fontWeight: 900, maxWidth: 760 })}
      ${fitText("Altitude máxima no voo", 142, 532, { color: "#cbd5e1", fontSize: 34, fontWeight: 700, maxWidth: 760 })}
      <rect x="116" y="590" width="848" height="542" rx="31.2" fill="#0f172a" fill-opacity="0.72" />
      <path d="${areaPath}" fill="url(#gfvSoft)" />
      <path d="${linePath}" fill="none" stroke="url(#gfvAccent)" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" filter="url(#gfvGlow)" />
      ${linePath ? "" : `<text x="540" y="870" fill="#cbd5e1" font-size="34" font-weight="700" text-anchor="middle">Altimetria indisponível</text>`}
      <line x1="134" y1="${box.y + box.h}" x2="946" y2="${box.y + box.h}" stroke="#ffffff" stroke-opacity="0.22" stroke-width="3" />
      ${metricBlock("Tempo de voo", data.durationDisplay, 136, 1188, 380)}
      ${metricBlock("Distância", formatDistanceShort(data.summary.distanceM, data.displayInfo.totalMiles), 564, 1188, 380)}
      ${smallBrand(data, 136, 1408)}
    </g>
  `;

  return createSticker("altitude", "Altitude", "Gráfico de altimetria em fundo transparente.", data, body);
}

function speedSticker(data: FlightShareData, options: StickerBuildOptions = {}): FlightShareSticker {
  const showBackground = options.showBackground ?? true;
  const samples = samplesFromChart(data.chartData, ["iasKt", "gsKt", "tasKt"]);
  const fallbackSamples = samples.length >= 2 ? samples : samplesFromPoints(data.points, "speedKt");
  const box = { x: 132, y: 626, w: 816, h: 430 };
  const linePath = chartPath(fallbackSamples, box);
  const areaPath = chartAreaPath(fallbackSamples, box);
  const maxSpeed = formatMetricSpeed(data.summary, data.chartData);
  const avgSpeed = data.summary.speedAvgMs !== null ? formatSpeedKt(data.summary.speedAvgMs) : formatKt(maxSeriesValue(data.chartData, ["iasKt", "gsKt"]));
  const body = `
    <g filter="url(#gfvShadow)">
      ${outerCard(showBackground, 86, 210, 908, 1360, 0.4)}
      <circle cx="540" cy="424" r="204" fill="url(#gfvSoft)" />
      ${fitText("VELOCIDADE", 540, 350, { color: "#94a3b8", fontSize: 30, fontWeight: 900, maxWidth: 700, anchor: "middle", letterSpacing: 4 })}
      ${fitText(maxSpeed, 540, 468, { fontSize: 104, fontWeight: 900, maxWidth: 700, anchor: "middle" })}
      ${fitText("máxima registrada", 540, 530, { color: "#cbd5e1", fontSize: 34, fontWeight: 700, maxWidth: 700, anchor: "middle" })}
      <rect x="106" y="584" width="868" height="536" rx="35.1" fill="#0f172a" fill-opacity="0.72" />
      <path d="${areaPath}" fill="url(#gfvSoft)" />
      <path d="${linePath}" fill="none" stroke="url(#gfvAccent)" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" filter="url(#gfvGlow)" />
      ${linePath ? "" : `<text x="540" y="850" fill="#cbd5e1" font-size="34" font-weight="700" text-anchor="middle">Velocidade indisponível</text>`}
      ${metricBlock("Vel. média", avgSpeed, 136, 1188, 380)}
      ${metricBlock("Tempo", data.durationDisplay, 564, 1188, 380)}
      ${smallBrand(data, 136, 1418)}
    </g>
  `;

  return createSticker("speed", "Velocidade", "Gráfico de velocidade e destaques.", data, body);
}

function compactMetric(label: string, value: string, x: number, y: number): string {
  return `
    <g>
      <rect x="${x}" y="${y}" width="246" height="132" rx="19.5" fill="#0f172a" fill-opacity="0.74" stroke="#ffffff" stroke-opacity="0.12" />
      ${fitText(label, x + 26, y + 48, { color: "#94a3b8", fontSize: 24, fontWeight: 800, maxWidth: 194, letterSpacing: 0.8 })}
      ${fitText(value, x + 26, y + 98, { fontSize: 38, fontWeight: 900, maxWidth: 194 })}
    </g>
  `;
}

function miniChart(title: string, samples: Sample[], box: Box): string {
  const linePath = chartPath(samples, box);
  const areaPath = chartAreaPath(samples, box);
  return `
    <g>
      <rect x="${box.x - 18}" y="${box.y - 76}" width="${box.w + 36}" height="${box.h + 112}" rx="23.4" fill="#0f172a" fill-opacity="0.74" stroke="#ffffff" stroke-opacity="0.12" />
      ${fitText(title, box.x, box.y - 28, { color: "#cbd5e1", fontSize: 29, fontWeight: 900, maxWidth: box.w })}
      <path d="${areaPath}" fill="url(#gfvSoft)" />
      <path d="${linePath}" fill="none" stroke="url(#gfvAccent)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" />
      ${linePath ? "" : `<text x="${box.x + box.w / 2}" y="${box.y + box.h / 2}" fill="#94a3b8" font-size="26" font-weight="700" text-anchor="middle">Sem dados</text>`}
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
    ? (selectedChartCount > 0 ? 6 : 9)
    : (selectedChartCount > 0 ? 3 : 6);
  const metrics = customMetricItems(data, merged).slice(0, metricLimit);
  const titleLine = title
    ? fitText(title, 132, 366, { fontSize: 56, fontWeight: 900, maxWidth: 816 })
    : "";
  const subtitleY = title ? 426 : 366;
  const headerBottom = title ? 470 : 410;
  const routeY = hasVisualRoute ? headerBottom + 42 : headerBottom;
  const routeHeight = merged.routeMode === "legs"
    ? customLegsLayout.rowsBoxHeight
    : 420;
  const routeBox = { x: 116, y: routeY, w: 848, h: routeHeight };
  const routeBottom = hasVisualRoute ? routeY + routeHeight : headerBottom;
  const metricStartY = routeBottom + (hasVisualRoute ? 86 : 74);
  const metricGrid = metrics.map((metric, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    return compactMetric(metric.label, metric.value, 132 + col * 272, metricStartY + row * 150);
  }).join("");
  let chartY = metricStartY + Math.ceil(metrics.length / 3) * 150 + 110;
  if (metrics.length === 0) chartY = metricStartY;
  const chartParts: string[] = [];
  if (merged.showAltitudeChart) {
    const samples = samplesFromChart(data.chartData, ["gpsAltFt", "baroAltFt", "pressAltFt"]);
    chartParts.push(miniChart("Altimetria", samples.length >= 2 ? samples : samplesFromPoints(data.points, "altitudeFt"), { x: 150, y: chartY, w: 780, h: 190 }));
    chartY += 310;
  }
  if (merged.showSpeedChart && chartY < 1570) {
    const samples = samplesFromChart(data.chartData, ["iasKt", "gsKt", "tasKt"]);
    chartParts.push(miniChart("Velocidade", samples.length >= 2 ? samples : samplesFromPoints(data.points, "speedKt"), { x: 150, y: chartY, w: 780, h: 190 }));
    chartY += 310;
  }

  const routeLayer = merged.routeMode === "hidden"
    ? ""
    : merged.routeMode === "legs"
      ? `${innerCard(showBackground, 116, routeY, 848, routeHeight, 33.8, 0.68)}
        ${legRows(data, 164, routeY + 60, 752)}`
      : routeMapLayer(data, routeBox, merged.routeMode === "map");
  const contentBottom = Math.min(
    1760,
    Math.max(
      headerBottom + 180,
      hasVisualRoute ? routeBottom : headerBottom,
      metrics.length > 0 ? metricStartY + Math.ceil(metrics.length / 3) * 150 : 0,
      chartParts.length > 0 ? chartY - 120 : 0,
    ) + 90,
  );
  const outerHeight = Math.max(520, contentBottom - 142);

  const body = `
    <g filter="url(#gfvShadow)" clip-path="url(#gfvStickerSafe)">
      ${outerCard(showBackground, 86, 142, 908, outerHeight, 0.43)}
      ${brandMark(data, 132, 212, 360)}
      ${titleLine}
      ${fitText(flightTitle(data), 132, subtitleY, { color: "#cbd5e1", fontSize: 30, fontWeight: 700, maxWidth: 816 })}
      ${routeLayer}
      ${metricGrid || (!hasVisualRoute && chartParts.length === 0 ? fitText("Escolha uma rota, métrica ou gráfico para aparecer aqui.", 132, metricStartY + 64, { color: "#cbd5e1", fontSize: 30, fontWeight: 700, maxWidth: 816 }) : "")}
      ${chartParts.join("")}
    </g>
  `;

  return createSticker("custom", "Personalizada", "Figurinha montada pelo aluno.", data, body);
}

function metricMini(label: string, value: string, x: number, y: number): string {
  return `
    <g>
      ${fitText(label, x, y, { color: "#94a3b8", fontSize: 25, fontWeight: 800, maxWidth: 206, letterSpacing: 1 })}
      ${fitText(value, x, y + 62, { fontSize: 43, fontWeight: 900, maxWidth: 206 })}
    </g>
  `;
}

function createSticker(
  id: FlightShareStickerId,
  title: string,
  description: string,
  data: FlightShareData,
  body: string,
): FlightShareSticker {
  const fileBase = slugify(`${data.displayInfo.aircraft}-${id}-${data.displayInfo.flightDateIso ?? data.flightId}`);
  return {
    id,
    title,
    description,
    fileName: `${fileBase}.png`,
    width: STICKER_WIDTH,
    height: STICKER_HEIGHT,
    svg: svgShell(data, body),
  };
}

export function buildFlightShareStickers(data: FlightShareData, options: StickerBuildOptions = {}): FlightShareSticker[] {
  return [
    summarySticker(data, options),
    routeSticker(data, options),
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
