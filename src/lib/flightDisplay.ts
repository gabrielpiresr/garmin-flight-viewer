import { decodeFlightRecord } from "./flightRecordCodec";
import type { SavedFlightListItem } from "./flightsDb";

export type FlightDisplayInfo = {
  flightDateIso: string | null;
  startTime: string;
  endTime: string;
  studentName: string;
  studentAnac: string;
  instructorName: string;
  instructorAnac: string;
  aircraft: string;
  fromTo: string;
  landings: number;
  totalFlight: string;
  totalFlightMinutes: number;
  totalMiles: string;
  telemetryOk: boolean;
  instructorSuggestionMd: string;
  studentSuggestionMd: string;
};

export function parseDurationToMinutes(value: string): number {
  const raw = (value ?? "").trim();
  if (!raw) return 0;
  const hhmm = raw.match(/^(\d{1,2}):(\d{1,2})$/);
  if (hhmm) return Number(hhmm[1] ?? "0") * 60 + Number(hhmm[2] ?? "0");
  const asDecimal = Number(raw.replace(",", "."));
  return Number.isFinite(asDecimal) && asDecimal > 0 ? Math.round(asDecimal * 60) : 0;
}

export function formatMinutes(min: number): string {
  const safe = Math.max(0, Math.round(min));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function addMinutesToTime(startTime: string, minutes: number): string {
  const match = startTime.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match || minutes <= 0) return "";
  const h = Number(match[1] ?? "0");
  const m = Number(match[2] ?? "0");
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  const total = (h * 60 + m + Math.round(minutes)) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function parseMiles(value: string): number {
  const raw = (value ?? "").trim();
  if (!raw) return 0;
  const n = Number(raw.replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function getDateBase(item: SavedFlightListItem, info?: Pick<FlightDisplayInfo, "flightDateIso">): Date {
  const iso = info?.flightDateIso ?? item.flight_date;
  if (iso) return new Date(`${iso}T12:00:00`);
  return new Date(item.created_at);
}

export function getFlightDateTimeMs(item: SavedFlightListItem, info?: FlightDisplayInfo): number {
  const iso = info?.flightDateIso ?? item.flight_date ?? (item.created_at ?? "").slice(0, 10);
  const time = info?.startTime || item.start_time || "23:59";
  const date = new Date(`${iso}T${time.length === 5 ? time : "23:59"}:00`);
  const fallback = getDateBase(item, info).getTime();
  return Number.isNaN(date.getTime()) ? fallback : date.getTime();
}

export function isFutureFlight(item: SavedFlightListItem, info?: FlightDisplayInfo): boolean {
  return getFlightDateTimeMs(item, info) > Date.now();
}

export function isCompletedFlight(item: SavedFlightListItem, info?: FlightDisplayInfo): boolean {
  const totalFlightMinutes =
    info?.totalFlightMinutes ??
    (typeof item.duration_sec === "number" && item.duration_sec > 0 ? Math.round(item.duration_sec / 60) : 0);
  return totalFlightMinutes > 0 && (info?.landings ?? 0) > 0;
}

export function buildFlightDisplayInfo(
  item: SavedFlightListItem,
  csvText: string | null,
  fallback?: {
    studentName?: string;
    studentAnac?: string;
    instructorName?: string;
    instructorAnac?: string;
  },
): FlightDisplayInfo {
  const defaultInfo: FlightDisplayInfo = {
    flightDateIso: item.flight_date ?? (item.created_at ?? "").slice(0, 10) ?? null,
    startTime: item.start_time ?? "",
    endTime: "",
    studentName: fallback?.studentName || "—",
    studentAnac: fallback?.studentAnac || "—",
    instructorName: fallback?.instructorName || "",
    instructorAnac: fallback?.instructorAnac || "",
    aircraft: item.aircraft_ident ?? "—",
    fromTo: "—",
    landings: 0,
    totalFlight: "00:00",
    totalFlightMinutes: typeof item.duration_sec === "number" && item.duration_sec > 0 ? Math.round(item.duration_sec / 60) : 0,
    totalMiles: "0.0",
    telemetryOk: false,
    instructorSuggestionMd: "",
    studentSuggestionMd: "",
  };

  if (!csvText) return defaultInfo;
  const decoded = decodeFlightRecord(csvText);
  const meta = decoded.meta;
  if (!meta) {
    return { ...defaultInfo, telemetryOk: decoded.telemetryCsv.trim().length > 0 };
  }

  const airports: string[] = [];
  for (const leg of meta.legs) {
    const dep = (leg.dep ?? "").trim().toUpperCase();
    const arr = (leg.arr ?? "").trim().toUpperCase();
    if (dep && airports[airports.length - 1] !== dep) airports.push(dep);
    if (arr && airports[airports.length - 1] !== arr) airports.push(arr);
  }
  const landings = meta.legs.reduce((acc, leg) => acc + Math.max(0, Math.round(leg.landings || 0)), 0);
  const totalFlightMinutes = meta.legs.reduce((acc, leg) => acc + parseDurationToMinutes(leg.flightTime), 0);
  const durationMin =
    typeof item.duration_sec === "number" && item.duration_sec > 0
      ? Math.round(item.duration_sec / 60)
      : totalFlightMinutes;
  const totalMiles = meta.legs.reduce((acc, leg) => acc + parseMiles(leg.distance), 0);

  return {
    flightDateIso: meta.header.date || defaultInfo.flightDateIso,
    startTime: meta.header.startTime || "",
    endTime: addMinutesToTime(meta.header.startTime || "", durationMin),
    studentName: meta.header.studentName || fallback?.studentName || meta.header.studentLabel || "—",
    studentAnac: meta.header.studentAnac || fallback?.studentAnac || "—",
    instructorName: meta.header.instructorName || fallback?.instructorName || "",
    instructorAnac: meta.header.instructorAnac || fallback?.instructorAnac || "",
    aircraft: meta.header.aircraft || item.aircraft_ident || "—",
    fromTo: airports.length > 0 ? airports.join(" -> ") : "—",
    landings,
    totalFlight: formatMinutes(totalFlightMinutes),
    totalFlightMinutes,
    totalMiles: totalMiles.toFixed(1),
    telemetryOk: decoded.telemetryCsv.trim().length > 0,
    instructorSuggestionMd: meta.preFlight.instructorSuggestionMd ?? "",
    studentSuggestionMd: meta.preFlight.studentSuggestionMd ?? "",
  };
}
