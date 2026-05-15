import { SLOT_HOURS } from "../types/admin";
import type { FlightScheduleRules } from "../types/schoolRules";
import { DEFAULT_FLIGHT_SCHEDULE_RULES } from "../types/schoolRules";

export const NIGHT_SLOT_VALUE = "__night__";

export type ScheduleHourOption = {
  value: string;
  label: string;
  isNight: boolean;
  startHour: number;
};

export function buildScheduleHourOptions(
  rules: FlightScheduleRules = DEFAULT_FLIGHT_SCHEDULE_RULES,
): ScheduleHourOption[] {
  const options: ScheduleHourOption[] = SLOT_HOURS.map((hour) => ({
    value: String(hour),
    label: `${hour}h`,
    isNight: false,
    startHour: hour,
  }));
  if (rules.allowNightFlights) {
    const nightHour = rules.nightFlightStartHour;
    options.push({
      value: NIGHT_SLOT_VALUE,
      label: `Noturna (${String(nightHour).padStart(2, "0")}:00)`,
      isNight: true,
      startHour: nightHour,
    });
  }
  return options;
}

export function hourSelectValue(isNight: boolean | undefined, startHour: number): string {
  return isNight ? NIGHT_SLOT_VALUE : String(startHour);
}

export function parseHourSelectValue(
  value: string,
  rules: FlightScheduleRules = DEFAULT_FLIGHT_SCHEDULE_RULES,
): { startHour: number; isNight: boolean } {
  if (value === NIGHT_SLOT_VALUE) {
    return { startHour: rules.nightFlightStartHour, isNight: true };
  }
  return { startHour: Number(value), isNight: false };
}
