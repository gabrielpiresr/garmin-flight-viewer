import { minutesToScheduleHHMM, parseScheduleTimeToMinutes } from "./scheduleTimeGrid";

export type SagaDateTimeParts = { date: string; time: string };

/** Extrai data e hora (HH:MM) de um timestamp SAGA (ISO ou "YYYY-MM-DD HH:MM"). */
export function sagaDirectDateTimeParts(value: string): SagaDateTimeParts {
  const match = (value || "").match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  if (match) return { date: match[1]!, time: match[2]! };
  return { date: (value || "").slice(0, 10), time: "" };
}

export function addIsoDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export type SagaDaySegment = {
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
};

function segmentEndClock(endMinute: number): string {
  if (endMinute >= 1440) return "23:59";
  return minutesToScheduleHHMM(endMinute);
}

/**
 * Divide um evento SAGA em trechos por dia civil.
 * Ex.: 24/07 08:00 → 26/07 18:00 vira 3 segmentos (24, 25 e 26).
 */
export function sagaEventDaySegments(
  startRaw: string,
  endRaw: string,
  fallbackStart = "",
  fallbackEnd = "",
): SagaDaySegment[] {
  const start = sagaDirectDateTimeParts(startRaw || fallbackStart);
  const end = sagaDirectDateTimeParts(endRaw || fallbackEnd);
  if (!start.date || !start.time) return [];

  const endDate = end.date && end.date >= start.date ? end.date : start.date;
  const endMinute = end.time ? parseScheduleTimeToMinutes(end.time) : parseScheduleTimeToMinutes(start.time) + 60;
  const startMinute = parseScheduleTimeToMinutes(start.time);

  const segments: SagaDaySegment[] = [];
  let current = start.date;
  while (current <= endDate) {
    const isFirst = current === start.date;
    const isLast = current === endDate;
    const segStart = isFirst ? startMinute : 0;
    let segEnd = isLast ? endMinute : 1440;
    if (isFirst && isLast && segEnd <= segStart) segEnd = segStart + 60;
    const durationMinutes = Math.max(1, segEnd - segStart);
    segments.push({
      date: current,
      startTime: minutesToScheduleHHMM(segStart),
      endTime: segmentEndClock(segEnd),
      durationMinutes,
    });
    if (current === endDate) break;
    current = addIsoDays(current, 1);
  }
  return segments;
}

/** true quando o evento cruza o intervalo [rangeStart, rangeEnd] (inclusive). */
export function sagaEventOverlapsRange(
  startRaw: string,
  endRaw: string,
  rangeStart: string,
  rangeEnd: string,
  fallbackStart = "",
  fallbackEnd = "",
): boolean {
  const start = sagaDirectDateTimeParts(startRaw || fallbackStart);
  const end = sagaDirectDateTimeParts(endRaw || fallbackEnd);
  if (!start.date) return false;
  const eventEndDate = end.date && end.date >= start.date ? end.date : start.date;
  return start.date <= rangeEnd && eventEndDate >= rangeStart;
}
