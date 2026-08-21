import type { PublicBlockedSlot, PublicScheduleFlight } from "./scheduleBookingDb";
import type { FlightScheduleRules } from "../types/schoolRules";

export const FIRST_FLIGHT_MINUTES = 60;
export const GROUND_SCHOOL_MINUTES = 90;

export type RegistrationSlot = {
  startTime: string;
  presentationTime: string;
  cutoffTime: string;
  endTime: string;
  groundStartTime: string;
  groundEndTime: string;
  aircraftIdent: string;
  aircraftIdents: string[];
};

type OccupiedInterval = { start: number; end: number };

const DEFAULT_SLOT_RULES = {
  slotMinutes: 30,
  bufferBeforeMinutes: 30,
  bufferAfterMinutes: 15,
  scheduleStartTime: "06:00",
  nightFlightStartHour: 18,
  allowNightFlights: false,
  nightBookingWeekdays: [] as number[],
};

function onlyDigitsIdent(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function timeToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToTime(value: number): string {
  const safe = Math.max(0, Math.min(23 * 60 + 59, Math.round(value)));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function slotRules(rules?: Partial<FlightScheduleRules> | null) {
  return {
    slotMinutes: rules?.slotMinutes || DEFAULT_SLOT_RULES.slotMinutes,
    bufferBeforeMinutes: rules?.bufferBeforeMinutes ?? DEFAULT_SLOT_RULES.bufferBeforeMinutes,
    bufferAfterMinutes: rules?.bufferAfterMinutes ?? DEFAULT_SLOT_RULES.bufferAfterMinutes,
    scheduleStartTime: rules?.scheduleStartTime || DEFAULT_SLOT_RULES.scheduleStartTime,
    nightFlightStartHour: rules?.nightFlightStartHour ?? DEFAULT_SLOT_RULES.nightFlightStartHour,
    allowNightFlights: rules?.allowNightFlights === true,
    nightBookingWeekdays: Array.isArray(rules?.nightBookingWeekdays) ? rules.nightBookingWeekdays : [],
  };
}

function dayOfWeek(date: string) {
  return new Date(`${date}T12:00:00`).getDay();
}

function occupiedIntervals(
  flights: PublicScheduleFlight[],
  registration: string,
  date: string,
): OccupiedInterval[] {
  const ident = onlyDigitsIdent(registration);
  return flights
    .filter((flight) => {
      if (flight.flightDate !== date) return false;
      if (/cancel/i.test(flight.status || "")) return false;
      return onlyDigitsIdent(flight.aircraftIdent) === ident;
    })
    .map((flight) => {
      const start = timeToMinutes(flight.presentationTime || flight.startTime);
      const end = timeToMinutes(
        flight.endTime || flight.cutoffTime || minutesToTime(start + Math.max(flight.durationMinutes || 0, 60)),
      );
      return { start, end: Math.max(end, start + 1) };
    });
}

function blockedIntervals(blockedSlots: PublicBlockedSlot[], registration: string, date: string): OccupiedInterval[] {
  const ident = onlyDigitsIdent(registration);
  const weekday = dayOfWeek(date);
  return blockedSlots
    .filter((slot) => onlyDigitsIdent(slot.aircraftRegistration) === ident && slot.dayOfWeek === weekday)
    .map((slot) => ({
      start: Math.round(slot.startHour * 60),
      end: Math.round(slot.endHour * 60),
    }));
}

function overlaps(intervals: OccupiedInterval[], start: number, end: number) {
  return intervals.some((interval) => interval.start < end && interval.end > start);
}

export function buildRegistrationSlots(input: {
  date: string;
  aircraftIdent: string;
  flights: PublicScheduleFlight[];
  blockedSlots?: PublicBlockedSlot[];
  groundRegistration?: string | null;
  rules?: Partial<FlightScheduleRules> | null;
}): RegistrationSlot[] {
  const rules = slotRules(input.rules);
  const step = 30;
  const nightStart = Math.round(rules.nightFlightStartHour * 60);
  const scheduleStart = timeToMinutes(rules.scheduleStartTime);
  const aircraftBusy = [
    ...occupiedIntervals(input.flights, input.aircraftIdent, input.date),
    ...blockedIntervals(input.blockedSlots ?? [], input.aircraftIdent, input.date),
  ];
  const groundBusy = input.groundRegistration
    ? [
        ...occupiedIntervals(input.flights, input.groundRegistration, input.date),
        ...blockedIntervals(input.blockedSlots ?? [], input.groundRegistration, input.date),
      ]
    : [];

  let startMin = scheduleStart;
  const remainder = startMin % step;
  if (remainder !== 0) startMin += step - remainder;

  const slots: RegistrationSlot[] = [];
  for (; startMin < nightStart; startMin += step) {
    const presentation = startMin - rules.bufferBeforeMinutes;
    const cutoff = startMin + FIRST_FLIGHT_MINUTES;
    const end = cutoff + rules.bufferAfterMinutes;
    const groundStart = presentation - GROUND_SCHOOL_MINUTES;
    const groundEnd = presentation - 1;
    if (groundStart < scheduleStart) continue;
    if (presentation < 0 || end >= 24 * 60) continue;
    if (startMin + FIRST_FLIGHT_MINUTES > nightStart) continue;
    if (overlaps(aircraftBusy, presentation, end)) continue;
    if (groundBusy.length && overlaps(groundBusy, groundStart, presentation)) continue;
    slots.push({
      startTime: minutesToTime(startMin),
      presentationTime: minutesToTime(presentation),
      cutoffTime: minutesToTime(cutoff),
      endTime: minutesToTime(end),
      groundStartTime: minutesToTime(groundStart),
      groundEndTime: minutesToTime(groundEnd),
      aircraftIdent: input.aircraftIdent,
      aircraftIdents: [input.aircraftIdent],
    });
  }
  return slots;
}

export function buildMergedRegistrationSlots(input: {
  date: string;
  aircraftIdents: string[];
  flights: PublicScheduleFlight[];
  blockedSlots?: PublicBlockedSlot[];
  groundRegistration?: string | null;
  rules?: Partial<FlightScheduleRules> | null;
}): RegistrationSlot[] {
  const byStart = new Map<string, RegistrationSlot>();
  for (const aircraftIdent of input.aircraftIdents) {
    const slots = buildRegistrationSlots({ ...input, aircraftIdent });
    for (const slot of slots) {
      const existing = byStart.get(slot.startTime);
      if (existing) {
        if (!existing.aircraftIdents.includes(aircraftIdent)) {
          existing.aircraftIdents.push(aircraftIdent);
        }
        continue;
      }
      byStart.set(slot.startTime, slot);
    }
  }
  return [...byStart.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export function formatRegistrationDayLabel(date: string): string {
  const weekdays = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  const [year, month, day] = date.split("-");
  const weekday = weekdays[new Date(`${date}T12:00:00`).getDay()] ?? "";
  return `${day}/${month}/${year} — ${weekday}`;
}
