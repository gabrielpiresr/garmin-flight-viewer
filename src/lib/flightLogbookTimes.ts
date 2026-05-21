/** Utilitários HH:MM — ficha em horário local; diário ANAC converte para UTC. */

import { flightLocalMs } from "./telemetryLogFilename";

export function parseTimeToMinutes(value: string): number | null {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return null;
  return h * 60 + m;
}

export function formatMinutesAsTime(totalMinutes: number): string {
  const safe = ((Math.round(totalMinutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function addMinutesToTimeUtc(time: string, minutes: number): string {
  const base = parseTimeToMinutes(time);
  if (base === null) return "";
  return formatMinutesAsTime(base + minutes);
}

export function subtractMinutesFromTimeUtc(time: string, minutes: number): string {
  return addMinutesToTimeUtc(time, -minutes);
}

export type ComputedFlightEventTimes = {
  departureTimeUtc: string;
  engineCutoffTimeUtc: string;
  takeoffTimeUtc: string;
  landingTimeUtc: string;
  blockMinutes: number;
  flightMinutes: number;
  marginMinutes: number;
};

/** Voo previsto: só exige partida e corte (corte > partida), sem tempo nas pernas. */
export function computeScheduledBlockTimes(params: {
  departureTimeUtc: string;
  engineCutoffTimeUtc: string;
}): Pick<ComputedFlightEventTimes, "departureTimeUtc" | "engineCutoffTimeUtc" | "blockMinutes"> & {
  flightMinutes: number;
  marginMinutes: number;
  takeoffTimeUtc?: string;
  landingTimeUtc?: string;
} | { error: string } {
  const depMin = parseTimeToMinutes(params.departureTimeUtc);
  const cutoffMin = parseTimeToMinutes(params.engineCutoffTimeUtc);

  if (depMin === null || cutoffMin === null) {
    return { error: "Informe horário de partida e corte dos motores no formato HH:MM." };
  }

  if (cutoffMin <= depMin) {
    return {
      error:
        "O horário de corte deve ser posterior à partida no mesmo dia (ex.: partida 06:00 → corte 07:00 ou depois).",
    };
  }

  return {
    departureTimeUtc: formatMinutesAsTime(depMin),
    engineCutoffTimeUtc: formatMinutesAsTime(cutoffMin),
    blockMinutes: cutoffMin - depMin,
    flightMinutes: 0,
    marginMinutes: 0,
  };
}

export function computeFlightEventTimes(params: {
  departureTimeUtc: string;
  engineCutoffTimeUtc: string;
  totalFlightMinutes: number;
}): ComputedFlightEventTimes | { error: string } {
  const depMin = parseTimeToMinutes(params.departureTimeUtc);
  const cutoffMin = parseTimeToMinutes(params.engineCutoffTimeUtc);
  const flightMin = Math.max(0, Math.round(params.totalFlightMinutes));

  if (depMin === null || cutoffMin === null) {
    return { error: "Informe horário de partida e corte dos motores no formato HH:MM." };
  }

  if (cutoffMin <= depMin) {
    return {
      error:
        "O horário de corte deve ser posterior à partida no mesmo dia (ex.: partida 06:00 → corte 07:00 ou depois).",
    };
  }

  const blockMinutes = cutoffMin - depMin;

  if (flightMin <= 0) {
    return { error: "Informe o tempo de voo nas pernas antes de calcular decolagem e pouso." };
  }

  if (blockMinutes < flightMin) {
    const minCutoff = formatMinutesAsTime(depMin + flightMin);
    return {
      error: `O intervalo partida→corte (${blockMinutes} min) deve ser pelo menos o tempo total de voo (${flightMin} min). Ex.: corte às ${minCutoff} ou depois.`,
    };
  }

  const marginMinutes = (blockMinutes - flightMin) / 2;
  const takeoffMin = depMin + marginMinutes;
  const landingMin = takeoffMin + flightMin;

  return {
    departureTimeUtc: formatMinutesAsTime(depMin),
    engineCutoffTimeUtc: formatMinutesAsTime(cutoffMin),
    takeoffTimeUtc: formatMinutesAsTime(takeoffMin),
    landingTimeUtc: formatMinutesAsTime(landingMin),
    blockMinutes,
    flightMinutes: flightMin,
    marginMinutes,
  };
}

/** Apresentação = 30 min antes da partida (mesmo fuso do horário informado). */
export function crewPresentationTimeUtc(departureTimeUtc: string): string {
  return subtractMinutesFromTimeUtc(departureTimeUtc, 30);
}

/** Converte HH:MM local (America/Sao_Paulo) na data do voo para HH:MM UTC (diário ANAC). */
export function localTimeToUtcHhMm(flightDateIso: string, localHhMm: string): string {
  const local = String(localHhMm || "").trim();
  if (!local || local === "—") return "—";
  const date = String(flightDateIso || "").trim().slice(0, 10);
  if (!date) return local;
  const ms = flightLocalMs(date, local);
  if (ms == null) return local;
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function minutesToDecimalHours(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0";
  const hours = minutes / 60;
  return hours.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
