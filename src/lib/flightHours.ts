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

function clockDiffMinutes(start: string | null | undefined, end: string | null | undefined): number | null {
  const startMinutes = parseClockMinutes(start);
  const endMinutes = parseClockMinutes(end);
  if (startMinutes === null || endMinutes === null) return null;
  const diff = endMinutes >= startMinutes ? endMinutes - startMinutes : endMinutes + 24 * 60 - startMinutes;
  return diff > 0 ? diff : null;
}

export function flightLegBlockMinutesFromMeta(meta: FlightRecordMeta | null | undefined): number | null {
  const legs = Array.isArray(meta?.legs) ? meta.legs : [];
  let total = 0;
  let found = false;
  for (const leg of legs) {
    const minutes = clockDiffMinutes(leg.engineStart, leg.engineCut);
    if (minutes === null) continue;
    total += minutes;
    found = true;
  }
  return found && total > 0 ? total : null;
}

export function flightBlockMinutesFromMeta(meta: FlightRecordMeta | null | undefined): number | null {
  return flightLegBlockMinutesFromMeta(meta) ?? clockDiffMinutes(meta?.header.departureTimeUtc, meta?.header.engineCutoffTimeUtc);
}

export function flightAircraftHours(
  flight: SavedFlightListItem,
  meta?: FlightRecordMeta | null,
): number {
  if (typeof flight.block_time_minutes === "number" && flight.block_time_minutes > 0) {
    return flight.block_time_minutes / 60;
  }

  const blockMinutes = flightBlockMinutesFromMeta(meta);
  if (blockMinutes !== null) return blockMinutes / 60;

  if (typeof flight.total_flight_minutes === "number" && flight.total_flight_minutes > 0) {
    return flight.total_flight_minutes / 60;
  }

  if (typeof flight.duration_sec === "number" && flight.duration_sec > 0) {
    return flight.duration_sec / 3600;
  }

  return 0;
}
