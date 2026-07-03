import type { StudentCreditModelSummary } from "../types/credits";

/** Sábado/domingo — mesma convenção de `dayOfWeek` em schedule-booking. */
export function isWeekendDate(iso: string): boolean {
  const day = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

/** Saldo aplicável ao agendar um voo na data informada (pools do extrato). */
export function availableHoursForDate(summary: StudentCreditModelSummary, dateIso: string): number {
  if (isWeekendDate(dateIso)) {
    return summary.anyDayAvailableHours ?? summary.availableHours;
  }
  return (summary.weekdayOnlyAvailableHours ?? 0) + (summary.anyDayAvailableHours ?? summary.availableHours);
}

type FutureFlightReservation = {
  flightDate: string;
  hours: number;
};

/** Desconta voos futuros dos pools — mesma regra de freeBalanceForDate em schedule-booking. */
export function freeBalanceForDateFromPools(
  pools: {
    weekdayOnlyAvailableHours?: number;
    anyDayAvailableHours?: number;
    availableHours?: number;
  },
  flightDate: string,
  futureFlights: FutureFlightReservation[],
): {
  freeHours: number;
  weekdayOnlyRemaining: number;
  anyDayRemaining: number;
} {
  let availWk = pools.weekdayOnlyAvailableHours ?? 0;
  let rawAny = pools.anyDayAvailableHours ?? pools.availableHours ?? 0;
  for (const flight of futureFlights) {
    const hrs = Math.max(0, flight.hours);
    if (isWeekendDate(flight.flightDate)) {
      rawAny -= hrs;
    } else {
      const overflow = Math.max(0, hrs - availWk);
      availWk = Math.max(0, availWk - hrs);
      rawAny -= overflow;
    }
  }
  const weekdayOnlyRemaining = Math.max(0, availWk);
  const anyDayRemaining = rawAny;
  const freeHours = isWeekendDate(flightDate) ? anyDayRemaining : weekdayOnlyRemaining + anyDayRemaining;
  return { freeHours, weekdayOnlyRemaining, anyDayRemaining };
}

/** Desconta voos futuros dos pools — mesma regra de freeBalanceForDate em schedule-booking. */
export function freeBalanceForDateFromSummary(
  summary: StudentCreditModelSummary,
  flightDate: string,
  futureFlights: FutureFlightReservation[],
): {
  freeHours: number;
  weekdayOnlyRemaining: number;
  anyDayRemaining: number;
} {
  return freeBalanceForDateFromPools(summary, flightDate, futureFlights);
}
