import type { AiswebFrequency } from "../types/aisweb";
import { lookupAiswebIcao } from "./aiswebDb";

/**
 * AFIS / Rádio de aeródromo (ROTAER). Quando o AD tem rádio e NÃO está
 * dentro de FIZ/CTR/TMA, geramos círculo SFC–FL145 / 27 NM.
 */
const AFIS_RADIO_RE = /^(AFIS|R[AÁ]DIO|RADIO)$/i;
const AFIS_CALLSIGN_RE = /\b(AFIS|R[AÁ]DIO|RADIO)\b/i;

export type AfisAdEnrichment = {
  hasAfisRadio: boolean;
  /** Ex.: "130.100 MHz" */
  frequency: string | null;
  /** Frequências do serviço Rádio/AFIS (sem filtrar 121.5). */
  frequenciesMhz: string[];
  /** Tipo ROTAER (ex.: Rádio). */
  service: string | null;
  /** Callsign ROTAER (ex.: DOURADOS). */
  callsign: string | null;
  updatedAt: number;
};

const memory = new Map<string, AfisAdEnrichment>();
const inflight = new Map<string, Promise<AfisAdEnrichment | null>>();
const STORAGE_KEY = "garmin-afis-ad-enrich-v2";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function loadStorage(): void {
  if (typeof window === "undefined" || memory.size > 0) return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, AfisAdEnrichment>;
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
    const obj: Record<string, AfisAdEnrichment> = {};
    for (const [icao, value] of memory.entries()) obj[icao] = value;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // ignore quota
  }
}

function primaryMhzList(freqs: string[]): string[] {
  return (freqs || [])
    .map((f) => String(f || "").trim())
    .filter(Boolean)
    .filter((f) => !/^121\.5/i.test(f.replace(",", ".")));
}

/** Entrada ROTAER de AFIS / Rádio (não TWR/APP). Exige freq operacional além de 121.5. */
export function findAfisRadioFrequency(
  frequencies: AiswebFrequency[] | null | undefined,
): AiswebFrequency | null {
  const list = frequencies || [];
  const candidates = [
    ...list.filter((f) => f.frequenciesMhz?.length && AFIS_RADIO_RE.test(String(f.service || "").trim())),
    ...list.filter(
      (f) =>
        f.frequenciesMhz?.length &&
        (AFIS_CALLSIGN_RE.test(f.callsign || "") || AFIS_CALLSIGN_RE.test(f.service || "")),
    ),
  ];
  for (const c of candidates) {
    if (primaryMhzList(c.frequenciesMhz).length) return c;
  }
  return null;
}

export function formatAfisRadioMhz(freq: AiswebFrequency): string {
  const primary = primaryMhzList(freq.frequenciesMhz);
  const mhz = primary.length ? primary : freq.frequenciesMhz;
  return `${mhz.join(" · ")} MHz`;
}

export function getCachedAfisAd(icao: string): AfisAdEnrichment | null {
  loadStorage();
  const code = icao.trim().toUpperCase();
  if (!code) return null;
  return memory.get(code) ?? null;
}

export async function enrichAfisAdFromAisweb(icao: string): Promise<AfisAdEnrichment | null> {
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
      const radio = findAfisRadioFrequency(airport.rotaer?.frequencies);
      const next: AfisAdEnrichment = {
        hasAfisRadio: Boolean(radio),
        frequency: radio ? formatAfisRadioMhz(radio) : null,
        frequenciesMhz: radio ? primaryMhzList(radio.frequenciesMhz) : [],
        service: radio?.service ? String(radio.service).trim() || null : null,
        callsign: radio?.callsign ? String(radio.callsign).trim() || null : null,
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

/** Enriquece em lote com concorrência limitada (camada AFIS no mapa). */
export async function enrichAfisAdBatch(
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
      const code = unique[idx++]!;
      await enrichAfisAdFromAisweb(code);
      options?.onProgress?.();
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}
