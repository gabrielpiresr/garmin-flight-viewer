import type { FlightScheduleRules } from "../types/schoolRules";
import type { PublicBlockedSlot, PublicScheduleAircraft, PublicScheduleFlight } from "./scheduleBookingDb";

export function normalizeScheduleAircraftIdent(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isWaitlistAircraftIdent(rules: FlightScheduleRules, registration: string): boolean {
  const target = normalizeScheduleAircraftIdent(registration);
  return (rules.studentWaitlistAircraftIdents ?? []).some(
    (ident) => normalizeScheduleAircraftIdent(ident) === target,
  );
}

/** Mesma regra do schedule-booking: oculta aeronaves da escala do aluno (exceto lista de espera). */
export function isAircraftHiddenFromStudent(rules: FlightScheduleRules, registration: string): boolean {
  if (isWaitlistAircraftIdent(rules, registration)) return false;
  const target = normalizeScheduleAircraftIdent(registration);
  return (rules.studentHiddenAircraftIdents ?? []).some(
    (ident) => normalizeScheduleAircraftIdent(ident) === target,
  );
}

export function filterScheduleBundleForStudentView<
  T extends {
    rules: FlightScheduleRules;
    aircrafts: PublicScheduleAircraft[];
    flights: PublicScheduleFlight[];
    blockedSlots: PublicBlockedSlot[];
  },
>(bundle: T): T {
  const hidden = (registration: string) => isAircraftHiddenFromStudent(bundle.rules, registration);
  return {
    ...bundle,
    aircrafts: bundle.aircrafts.filter((aircraft) => !hidden(aircraft.registration)),
    flights: bundle.flights.filter((flight) => !hidden(flight.aircraftIdent)),
    blockedSlots: bundle.blockedSlots.filter((slot) => !hidden(slot.aircraftRegistration)),
  };
}
