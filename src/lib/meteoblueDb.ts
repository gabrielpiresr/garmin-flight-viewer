import { ADMIN_USERS_FUNCTION_ID, functions } from "./appwrite";
import { parseMeteoblueForecast } from "./meteoblueWeather";
import type { MeteoblueForecastBundle, MeteoblueRawForecast } from "../types/meteoblue";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const CACHE_KEY_PREFIX = "meteoblue-forecast-v3:";

type CacheEnvelope = {
  fetchedAt: string;
  lat: number;
  lon: number;
  asl: number;
  icao?: string | null;
  raw: MeteoblueRawForecast;
};

type FunctionResponse = {
  message?: string;
  forecast?: MeteoblueRawForecast;
  lat?: number;
  lon?: number;
  asl?: number;
  icao?: string | null;
  fetchedAt?: string;
};

function cacheKey(lat: number, lon: number): string {
  return `${CACHE_KEY_PREFIX}${lat.toFixed(4)}:${lon.toFixed(4)}`;
}

function readCache(key: string): CacheEnvelope | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope;
    if (!parsed?.fetchedAt || !parsed.raw) return null;
    const age = Date.now() - new Date(parsed.fetchedAt).getTime();
    if (!Number.isFinite(age) || age < 0 || age > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(key: string, envelope: CacheEnvelope): void {
  try {
    localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // quota / private mode — ignore
  }
}

async function fetchFromFunction(): Promise<FunctionResponse> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    throw new Error("Função administrativa não configurada.");
  }
  const execution = await functions.createExecution(
    ADMIN_USERS_FUNCTION_ID,
    JSON.stringify({ action: "getMeteoblueForecast" }),
    false,
  );
  let response: FunctionResponse = {};
  try {
    response = execution.responseBody ? (JSON.parse(execution.responseBody) as FunctionResponse) : {};
  } catch {
    response = {};
  }
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || "Falha ao buscar previsão Meteoblue.");
  }
  return response;
}

let inflight: Promise<MeteoblueForecastBundle> | null = null;

/**
 * Previsão Meteoblue com cache local de 12h.
 * Coordenadas vêm da function (ICAO da escola / env).
 */
export async function getMeteoblueForecast(options?: { force?: boolean }): Promise<MeteoblueForecastBundle> {
  if (!options?.force && inflight) return inflight;

  const run = (async () => {
    if (!options?.force) {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key?.startsWith(CACHE_KEY_PREFIX)) continue;
          const cached = readCache(key);
          if (cached) {
            return parseMeteoblueForecast(cached.raw, {
              lat: cached.lat,
              lon: cached.lon,
              asl: cached.asl,
              icao: cached.icao,
              fetchedAt: cached.fetchedAt,
            });
          }
        }
      } catch {
        // ignore
      }
    }

    const response = await fetchFromFunction();
    if (!response.forecast) {
      throw new Error(response.message || "Previsão Meteoblue não retornada.");
    }
    const lat = Number(response.lat);
    const lon = Number(response.lon);
    const asl = Number(response.asl);
    const icao = response.icao ? String(response.icao).toUpperCase() : null;
    const fetchedAt = response.fetchedAt || new Date().toISOString();
    const envelope: CacheEnvelope = {
      fetchedAt,
      lat: Number.isFinite(lat) ? lat : 0,
      lon: Number.isFinite(lon) ? lon : 0,
      asl: Number.isFinite(asl) ? asl : 0,
      icao,
      raw: response.forecast,
    };
    writeCache(cacheKey(envelope.lat, envelope.lon), envelope);
    return parseMeteoblueForecast(envelope.raw, {
      lat: envelope.lat,
      lon: envelope.lon,
      asl: envelope.asl,
      icao: envelope.icao,
      fetchedAt: envelope.fetchedAt,
    });
  })();

  inflight = run.finally(() => {
    inflight = null;
  });
  return inflight;
}

export const METEOBLUE_SHOW_WEATHER_KEY = "schedule:showWeather";

export function readShowWeatherPref(defaultValue = true): boolean {
  try {
    const raw = localStorage.getItem(METEOBLUE_SHOW_WEATHER_KEY);
    if (raw == null) return defaultValue;
    return raw === "1" || raw === "true";
  } catch {
    return defaultValue;
  }
}

export function writeShowWeatherPref(value: boolean): void {
  try {
    localStorage.setItem(METEOBLUE_SHOW_WEATHER_KEY, value ? "1" : "0");
  } catch {
    // ignore
  }
}
