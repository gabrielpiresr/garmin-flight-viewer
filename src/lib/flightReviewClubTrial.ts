import type { SavedFlightListItem } from "./flightsDb";

type TrialFlight = Pick<SavedFlightListItem, "id" | "created_at" | "flight_date" | "start_time" | "telemetry_present">;

export function flightReviewClubSortMs(flight: Pick<SavedFlightListItem, "created_at" | "flight_date" | "start_time">): number {
  const date = flight.flight_date || flight.created_at?.slice(0, 10) || "";
  const time = flight.start_time || "00:00";
  const parsed = date ? Date.parse(`${date}T${time}`) : 0;
  if (Number.isFinite(parsed)) return parsed;
  return Date.parse(date) || Date.parse(flight.created_at || "") || 0;
}

export function buildFlightReviewClubTrialIndexMap<T extends TrialFlight>(
  flights: T[],
  isEligibleFlight: (flight: T) => boolean = () => true,
): Map<string, number> {
  const trialFlights = flights
    .filter((flight) => flight.telemetry_present === true && isEligibleFlight(flight))
    .sort((a, b) => flightReviewClubSortMs(a) - flightReviewClubSortMs(b));

  return new Map(trialFlights.map((flight, index) => [flight.id, index]));
}

export function isFlightReviewClubTrialIndex(index: number | null | undefined, trialFlightCount: number): boolean {
  return index !== null && index !== undefined && trialFlightCount > 0 && index < trialFlightCount;
}
