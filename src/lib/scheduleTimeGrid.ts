import { SLOT_HOURS } from "../types/admin";

/** Primeiro minuto exibido na grade diurna (06:00). */
export const SCHEDULE_GRID_ORIGIN_MINUTE = 6 * 60;

/** Passo da grade e das durações fracionárias (30 min). */
export const SCHEDULE_SLOT_STEP_MINUTES = 30;

/** Fim operacional do dia diurno (18:00 exclusivo). */
export const SCHEDULE_DAY_END_MINUTE = (Math.max(...SLOT_HOURS) + 1) * 60;

export function minutesToScheduleHHMM(totalMinutes: number): string {
  const hh = Math.floor(totalMinutes / 60);
  const mm = Math.round(totalMinutes % 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function parseScheduleTimeToMinutes(time: string): number {
  const [hh, mm] = time.split(":").map(Number);
  return (Number.isFinite(hh) ? hh : 0) * 60 + (Number.isFinite(mm) ? mm : 0);
}

export function suggestionStartMinute(row: { startTime: string; startHour: number }): number {
  if (row.startTime.includes(":")) {
    return parseScheduleTimeToMinutes(row.startTime);
  }
  return Math.round(row.startHour * 60);
}

export function suggestionEndMinute(row: { startTime: string; startHour: number; durationHours: number }): number {
  return suggestionStartMinute(row) + Math.round(row.durationHours * 60);
}

/** Horários de início possíveis (de 30 em 30 min) que cabem a duração no dia. */
export function buildDiurnalStartMinutes(durationMinutes: number): number[] {
  const safeDuration = Math.max(SCHEDULE_SLOT_STEP_MINUTES, Math.round(durationMinutes));
  const lastStart = SCHEDULE_DAY_END_MINUTE - safeDuration;
  const out: number[] = [];
  for (let minute = SCHEDULE_GRID_ORIGIN_MINUTE; minute <= lastStart; minute += SCHEDULE_SLOT_STEP_MINUTES) {
    out.push(minute);
  }
  return out;
}

/** Horas inteiras da matriz operacional cobertas pelo intervalo [início, fim). */
export function hoursOverlappingInterval(startMinute: number, endMinute: number): number[] {
  const hours: number[] = [];
  const startH = Math.floor(startMinute / 60);
  const endH = Math.floor((endMinute - 1) / 60);
  for (let hour = startH; hour <= endH; hour += 1) {
    if ((SLOT_HOURS as readonly number[]).includes(hour)) {
      hours.push(hour);
    }
  }
  return hours;
}

export function integerHoursAreContiguous(hours: number[]): boolean {
  if (hours.length <= 1) return true;
  for (let index = 1; index < hours.length; index += 1) {
    if (hours[index] !== hours[index - 1]! + 1) return false;
  }
  return true;
}

export function calendarTopPx(startMinute: number, rowHeightPerHour: number): number {
  return ((startMinute - SCHEDULE_GRID_ORIGIN_MINUTE) / 60) * rowHeightPerHour;
}

export function snapPointerToStartMinute(clientY: number, boardTop: number, rowHeightPerHour: number): number {
  const minutesFromOrigin = Math.max(0, ((clientY - boardTop) / rowHeightPerHour) * 60);
  const snapped = Math.round(minutesFromOrigin / SCHEDULE_SLOT_STEP_MINUTES) * SCHEDULE_SLOT_STEP_MINUTES;
  const maxStart = SCHEDULE_DAY_END_MINUTE - SCHEDULE_SLOT_STEP_MINUTES;
  return SCHEDULE_GRID_ORIGIN_MINUTE + Math.min(snapped, maxStart - SCHEDULE_GRID_ORIGIN_MINUTE);
}

export function startMinuteToSortHour(startMinute: number): number {
  return startMinute / 60;
}
