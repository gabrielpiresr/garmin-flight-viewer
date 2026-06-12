import { SLOT_HOURS } from "../types/admin";
import type { FlightScheduleRules } from "../types/schoolRules";
import { DEFAULT_FLIGHT_SCHEDULE_RULES } from "../types/schoolRules";
import {
  SCHEDULE_DAY_END_MINUTE,
  SCHEDULE_GRID_ORIGIN_MINUTE,
  SCHEDULE_SLOT_STEP_MINUTES,
  minutesToScheduleHHMM,
  parseScheduleTimeToMinutes,
} from "./scheduleTimeGrid";

export const NIGHT_SLOT_VALUE = "__night__";

export type ScheduleHourOption = {
  value: string;
  label: string;
  isNight: boolean;
  startHour: number;
  startMinute: number;
};

export function buildScheduleHourOptions(
  rules: FlightScheduleRules = DEFAULT_FLIGHT_SCHEDULE_RULES,
  /** Passo da listagem em minutos — admin/instrutor usam metade do slot (ex.: 30 → 15). */
  stepMinutes: number = SCHEDULE_SLOT_STEP_MINUTES,
): ScheduleHourOption[] {
  const options: ScheduleHourOption[] = [];
  const step = Math.max(5, Math.round(stepMinutes));
  const lastStart = SCHEDULE_DAY_END_MINUTE - step;

  for (let minute = SCHEDULE_GRID_ORIGIN_MINUTE; minute <= lastStart; minute += step) {
    const hour = Math.floor(minute / 60);
    if (!(SLOT_HOURS as readonly number[]).includes(hour)) continue;
    options.push({
      value: minutesToScheduleHHMM(minute),
      label: minutesToScheduleHHMM(minute),
      isNight: false,
      startHour: minute / 60,
      startMinute: minute,
    });
  }

  if (rules.allowNightFlights) {
    const nightHour = rules.nightFlightStartHour;
    const nightMinute = nightHour * 60;
    options.push({
      value: NIGHT_SLOT_VALUE,
      label: `Noturna (${minutesToScheduleHHMM(nightMinute)})`,
      isNight: true,
      startHour: nightHour,
      startMinute: nightMinute,
    });
  }
  return options;
}

export function hourSelectValue(isNight: boolean | undefined, startTime: string, startHour?: number): string {
  if (isNight) return NIGHT_SLOT_VALUE;
  if (startTime.includes(":")) return startTime;
  const minute = Math.round((startHour ?? 6) * 60);
  return minutesToScheduleHHMM(minute);
}

export function parseHourSelectValue(
  value: string,
  rules: FlightScheduleRules = DEFAULT_FLIGHT_SCHEDULE_RULES,
): { startHour: number; startMinute: number; startTime: string; isNight: boolean } {
  if (value === NIGHT_SLOT_VALUE) {
    const startMinute = rules.nightFlightStartHour * 60;
    return {
      startHour: rules.nightFlightStartHour,
      startMinute,
      startTime: minutesToScheduleHHMM(startMinute),
      isNight: true,
    };
  }
  const startMinute = parseScheduleTimeToMinutes(value);
  return {
    startHour: startMinute / 60,
    startMinute,
    startTime: minutesToScheduleHHMM(startMinute),
    isNight: false,
  };
}
