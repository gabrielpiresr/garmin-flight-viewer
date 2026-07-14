import type { FlightDisplayInfo } from "./flightDisplay";
import { isFutureFlight } from "./flightDisplay";
import type { SavedFlightListItem } from "./flightsDb";

export function isScheduledFlightStatus(item: SavedFlightListItem, info?: FlightDisplayInfo): boolean {
  return ["Pendente", "Confirmado", "Previsto"].includes(item.flight_status) && isFutureFlight(item, info);
}

export function isFlightEvaluationEligible(item: SavedFlightListItem, info?: FlightDisplayInfo): boolean {
  if (["Cancelado", "Pendente", "Previsto"].includes(item.flight_status)) return false;
  if (isFutureFlight(item, info)) return false;
  return true;
}
