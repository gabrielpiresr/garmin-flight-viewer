import type { AiswebFrequency } from "../types/aisweb";
import { lookupAiswebIcao } from "./aiswebDb";

/**
 * FCA dedicada publicada no ROTAER (sigla FCA) ou frequência A/A / UNICOM
 * usada como coordenação entre aeronaves. Não inclui TWR/APP/etc. nem o
 * fallback genérico 123.45 MHz quando nada foi publicado.
 */
const FCA_DEDICATED_RE = /FCA/i;
const AIR_AIR_RE = /UNICOM|A\s*\/\s*A|AIR[\s./-]*AIR|^AA$/i;

export type FcaAdEnrichment = {
  hasDedicated: boolean;
  /** Ex.: "122.850 MHz" — só quando hasDedicated. */
  frequency: string | null;
  updatedAt: number;
};

const memory = new Map<string, FcaAdEnrichment>();
const inflight = new Map<string, Promise<FcaAdEnrichment | null>>();
const STORAGE_KEY = "garmin-fca-ad-enrich-v1";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function loadStorage(): void {
  if (typeof window === "undefined" || memory.size > 0) return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, FcaAdEnrichment>;
    for (const [icao, value] of Object.entries(parsed)) {
      if (value && typeof value === "object") memory.set(icao, value);
    }
  } catch {
    // ignore
  }
}

function persistStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const obj: Record<string, FcaAdEnrichment> = {};
    for (const [icao, value] of memory.entries()) obj[icao] = value;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // ignore quota
  }
}

/** Entrada ROTAER que caracteriza frequência dedicada de FCA / A-A. */
export function findDedicatedFcaFrequency(
  frequencies: AiswebFrequency[] | null | undefined,
): AiswebFrequency | null {
  const list = frequencies || [];
  const fca = list.find(
    (f) =>
      f.frequenciesMhz?.length &&
      (FCA_DEDICATED_RE.test(f.service) || FCA_DEDICATED_RE.test(f.callsign || "")),
  );
  if (fca) return fca;
  const airAir = list.find(
    (f) => f.frequenciesMhz?.length && AIR_AIR_RE.test(f.service),
  );
  return airAir || null;
}

export function formatDedicatedFcaMhz(freq: AiswebFrequency): string {
  return `${freq.frequenciesMhz.join(" · ")} MHz`;
}

export function getCachedFcaAd(icao: string): FcaAdEnrichment | null {
  loadStorage();
  const code = icao.trim().toUpperCase();
  if (!code) return null;
  return memory.get(code) ?? null;
}

export async function enrichFcaAdFromAisweb(icao: string): Promise<FcaAdEnrichment | null> {
  loadStorage();
  const code = icao.trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(code)) return null;
  const hit = memory.get(code);
  if (hit && Date.now() - hit.updatedAt < TTL_MS) return hit;
  const pending = inflight.get(code);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const airport = await lookupAiswebIcao(code);
      const dedicated = findDedicatedFcaFrequency(airport.rotaer?.frequencies);
      const next: FcaAdEnrichment = {
        hasDedicated: Boolean(dedicated),
        frequency: dedicated ? formatDedicatedFcaMhz(dedicated) : null,
        updatedAt: Date.now(),
      };
      memory.set(code, next);
      persistStorage();
      return next;
    } catch {
      return null;
    } finally {
      inflight.delete(code);
    }
  })();

  inflight.set(code, promise);
  return promise;
}

/** Enriquece em lote com concorrência limitada (camada FCA AD no mapa). */
export async function enrichFcaAdBatch(
  icaos: string[],
  options?: { concurrency?: number; onProgress?: () => void },
): Promise<void> {
  const concurrency = Math.max(1, Math.min(4, options?.concurrency ?? 3));
  const unique = [
    ...new Set(icaos.map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z0-9]{4}$/.test(c))),
  ];
  let idx = 0;
  async function worker() {
    while (idx < unique.length) {
      const i = idx++;
      const code = unique[i]!;
      await enrichFcaAdFromAisweb(code);
      options?.onProgress?.();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, () => worker()));
}
