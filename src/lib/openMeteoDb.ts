/** Open-Meteo Forecast API — nuvens por nível de pressão ao longo da rota 3D. */

export const OPEN_METEO_ATTRIBUTION = "Open-Meteo (CC BY 4.0)";

/** Níveis no envelope VFR de instrução (~360 ft a ~10 000 ft). */
export const OPEN_METEO_PRESSURE_LEVELS = [1000, 975, 950, 925, 900, 850, 800, 700] as const;

export type OpenMeteoPressureHpa = (typeof OPEN_METEO_PRESSURE_LEVELS)[number];

export type OpenMeteoCloudLevel = {
  hPa: OpenMeteoPressureHpa;
  heightFt: number;
  coverPct: number;
};

export type OpenMeteoRoutePoint = {
  lat: number;
  lng: number;
  time: string;
  precipitation: number;
  weatherCode: number;
  levels: OpenMeteoCloudLevel[];
};

type CacheEntry = {
  at: number;
  points: OpenMeteoRoutePoint[];
};

const CACHE_MS = 30 * 60 * 1000;
const cache = new Map<string, CacheEntry>();
const FT_TO_M = 0.3048;

/** Altitude padrão (m MSL) se o modelo não mandar geopotential_height. */
const FALLBACK_HEIGHT_M: Record<OpenMeteoPressureHpa, number> = {
  1000: 110,
  975: 320,
  950: 500,
  925: 800,
  900: 1000,
  850: 1500,
  800: 1900,
  700: 3000,
};

type OpenMeteoHourly = {
  time?: string[];
  precipitation?: number[];
  weather_code?: number[];
  [key: string]: number[] | string[] | undefined;
};

type OpenMeteoLocation = {
  latitude?: number;
  longitude?: number;
  hourly?: OpenMeteoHourly;
};

function apiBase(): string {
  const raw = String(import.meta.env.VITE_OPEN_METEO_API_URL || "https://api.open-meteo.com").trim();
  return raw.replace(/\/+$/, "") || "https://api.open-meteo.com";
}

function apiKey(): string {
  return String(import.meta.env.VITE_OPEN_METEO_API_KEY || "").trim();
}

function roundCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

function cacheKey(points: Array<{ lat: number; lng: number }>): string {
  const hour = new Date().toISOString().slice(0, 13);
  return `plv1|${points.map((p) => `${roundCoord(p.lat)},${roundCoord(p.lng)}`).join("|")}@${hour}`;
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pickHourIndex(times: string[]): number {
  if (!times.length) return 0;
  const now = Date.now();
  let best = 0;
  for (let i = 0; i < times.length; i++) {
    const t = Date.parse(times[i]!);
    if (!Number.isFinite(t)) continue;
    if (t <= now) best = i;
    else break;
  }
  return best;
}

function hourlyVars(): string {
  const levels = OPEN_METEO_PRESSURE_LEVELS.flatMap((hPa) => [
    `cloud_cover_${hPa}hPa`,
    `geopotential_height_${hPa}hPa`,
  ]);
  return [...levels, "precipitation", "weather_code"].join(",");
}

function parseLevels(hourly: OpenMeteoHourly, hourIdx: number): OpenMeteoCloudLevel[] {
  const levels: OpenMeteoCloudLevel[] = [];
  for (const hPa of OPEN_METEO_PRESSURE_LEVELS) {
    const coverRaw = hourly[`cloud_cover_${hPa}hPa`];
    const heightRaw = hourly[`geopotential_height_${hPa}hPa`];
    const cover = Array.isArray(coverRaw) ? num(coverRaw[hourIdx], Number.NaN) : Number.NaN;
    if (!Number.isFinite(cover)) continue;
    const heightM = Array.isArray(heightRaw) ? num(heightRaw[hourIdx], Number.NaN) : Number.NaN;
    const meters = Number.isFinite(heightM) && heightM > 0 ? heightM : FALLBACK_HEIGHT_M[hPa];
    levels.push({
      hPa,
      heightFt: meters / FT_TO_M,
      coverPct: Math.max(0, Math.min(100, cover)),
    });
  }
  return levels;
}

function parseLocation(raw: OpenMeteoLocation, fallback: { lat: number; lng: number }): OpenMeteoRoutePoint | null {
  const hourly = raw.hourly;
  const times = hourly?.time ?? [];
  if (!hourly || !times.length) return null;
  const i = pickHourIndex(times);
  return {
    lat: num(raw.latitude, fallback.lat),
    lng: num(raw.longitude, fallback.lng),
    time: times[i] || new Date().toISOString(),
    precipitation: Math.max(0, num(hourly.precipitation?.[i])),
    weatherCode: Math.round(num(hourly.weather_code?.[i])),
    levels: parseLevels(hourly, i),
  };
}

export async function fetchOpenMeteoRouteForecast(
  points: Array<{ lat: number; lng: number }>,
  options?: { signal?: AbortSignal },
): Promise<OpenMeteoRoutePoint[]> {
  const clean = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)).slice(0, 48);
  if (!clean.length) return [];

  const key = cacheKey(clean);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.points;

  const url = new URL(`${apiBase()}/v1/forecast`);
  url.searchParams.set("latitude", clean.map((p) => p.lat.toFixed(4)).join(","));
  url.searchParams.set("longitude", clean.map((p) => p.lng.toFixed(4)).join(","));
  url.searchParams.set("hourly", hourlyVars());
  url.searchParams.set("forecast_hours", "6");
  url.searchParams.set("timezone", "UTC");
  const keyParam = apiKey();
  if (keyParam) url.searchParams.set("apikey", keyParam);

  const response = await fetch(url.toString(), { signal: options?.signal });
  if (!response.ok) {
    throw new Error(`Open-Meteo ${response.status}`);
  }
  const json = (await response.json()) as OpenMeteoLocation | OpenMeteoLocation[];
  const rows = Array.isArray(json) ? json : [json];
  const parsed: OpenMeteoRoutePoint[] = [];
  for (let i = 0; i < clean.length; i++) {
    const row = parseLocation(rows[i] ?? rows[0] ?? {}, clean[i]!);
    if (row) parsed.push({ ...row, lat: clean[i]!.lat, lng: clean[i]!.lng });
  }
  cache.set(key, { at: Date.now(), points: parsed });
  return parsed;
}
