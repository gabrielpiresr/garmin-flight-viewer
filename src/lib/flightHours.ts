import type { FlightRecordMeta } from "./flightRecordCodec";
import type { SavedFlightListItem } from "./flightsDb";

function parseClockMinutes(value: string | null | undefined): number | null {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function flightBlockMinutesFromMeta(meta: FlightRecordMeta | null | undefined): number | null {
  const departureMinutes = parseClockMinutes(meta?.header.departureTimeUtc);
  const cutoffMinutes = parseClockMinutes(meta?.header.engineCutoffTimeUtc);
  if (departureMinutes === null || cutoffMinutes === null || cutoffMinutes <= departureMinutes) return null;
  return cutoffMinutes - departureMinutes;
}

export function flightAircraftHours(
  _flight: SavedFlightListItem,
  meta?: FlightRecordMeta | null,
): number {
  const blockMinutes = flightBlockMinutesFromMeta(meta);
  if (blockMinutes !== null) return blockMinutes / 60;
  return 0;
}
