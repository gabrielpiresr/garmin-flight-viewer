import { lookupAiswebIcao } from "./aiswebDb";
import type { AiswebRotaer } from "../types/aisweb";
import { AVGAS_RE, JET_RE, NIGHT_OPS_RE } from "./aerodromeFilterPatterns";

export type AerodromeOpsEnrichment = {
  nightOps: boolean;
  hasAvgas: boolean;
  hasJet: boolean;
  source: "aisweb";
  updatedAt: number;
};

const memory = new Map<string, AerodromeOpsEnrichment>();
const inflight = new Map<string, Promise<AerodromeOpsEnrichment | null>>();
const STORAGE_KEY = "garmin-ad-ops-enrich-v2";

function loadStorage(): void {
  if (typeof window === "undefined" || memory.size > 0) return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, AerodromeOpsEnrichment>;
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
    const obj: Record<string, AerodromeOpsEnrichment> = {};
    for (const [icao, value] of memory.entries()) obj[icao] = value;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // ignore quota
  }
}

function nightFromRotaer(rotaer: AiswebRotaer | null | undefined): boolean {
  if (!rotaer) return false;
  const parts: string[] = [];
  if (rotaer.typeOpr) parts.push(rotaer.typeOpr);
  if (rotaer.workingHours?.text) parts.push(rotaer.workingHours.text);
  for (const s of rotaer.workingHours?.schedules || []) {
    parts.push(`${s.begin || ""}-${s.end || ""}`);
  }
  for (const rwy of rotaer.runways || []) {
    for (const light of rwy.lights || []) {
      parts.push(light.code, light.description || "");
    }
    for (const thr of rwy.thresholds || []) {
      for (const light of thr.lights || []) {
        parts.push(light.code, light.description || "");
      }
    }
  }
  const blob = parts.join(" ");
  if (NIGHT_OPS_RE.test(blob)) return true;
  // Luzes de pista / aproximação = capacidade noturna operacional típica
  const hasLights = (rotaer.runways || []).some(
    (rwy) => (rwy.lights?.length || 0) > 0 || (rwy.thresholds || []).some((t) => (t.lights?.length || 0) > 0),
  );
  return hasLights;
}

function fuelFromRotaer(rotaer: AiswebRotaer | null | undefined): { avgas: boolean; jet: boolean } {
  const fuel = rotaer?.fuel;
  // Inclui hours: ROTAER costuma juntar "PF · TF · 0900-…" no texto exibido.
  const blob = [
    (fuel?.types || []).join(" "),
    fuel?.text || "",
    fuel?.category || "",
    fuel?.hours || "",
  ].join(" ");
  return {
    avgas: AVGAS_RE.test(blob),
    jet: JET_RE.test(blob),
  };
}

export function getCachedAerodromeOps(icao: string): AerodromeOpsEnrichment | null {
  loadStorage();
  const code = icao.trim().toUpperCase();
  if (!code) return null;
  return memory.get(code) ?? null;
}

export async function enrichAerodromeOpsFromAisweb(icao: string): Promise<AerodromeOpsEnrichment | null> {
  loadStorage();
  const code = icao.trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(code)) return null;
  const hit = memory.get(code);
  // Reusa por 7 dias
  if (hit && Date.now() - hit.updatedAt < 7 * 24 * 60 * 60 * 1000) return hit;
  const pending = inflight.get(code);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const airport = await lookupAiswebIcao(code);
      const fuel = fuelFromRotaer(airport.rotaer);
      const next: AerodromeOpsEnrichment = {
        nightOps: nightFromRotaer(airport.rotaer),
        hasAvgas: fuel.avgas,
        hasJet: fuel.jet,
        source: "aisweb",
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

/** Enriquece em lote com concorrência limitada (para filtros do mapa). */
export async function enrichAerodromeOpsBatch(
  icaos: string[],
  options?: { concurrency?: number; onProgress?: () => void },
): Promise<void> {
  const concurrency = Math.max(1, Math.min(4, options?.concurrency ?? 3));
  const unique = [...new Set(icaos.map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z0-9]{4}$/.test(c)))];
  let idx = 0;
  async function worker() {
    while (idx < unique.length) {
      const i = idx++;
      const code = unique[i]!;
      await enrichAerodromeOpsFromAisweb(code);
      options?.onProgress?.();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, () => worker()));
}
