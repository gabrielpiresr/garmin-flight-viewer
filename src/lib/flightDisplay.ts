import { decodeFlightRecord } from "./flightRecordCodec";
import { flightBlockMinutesFromMeta } from "./flightHours";
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
  weightBalanceFilled: boolean;
  trainingMissionName: string;
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

function firstLegEngineStart(meta: ReturnType<typeof decodeFlightRecord>["meta"]): string {
  return meta?.legs.find((leg) => leg.engineStart?.trim())?.engineStart?.trim() || "";
}

function lastLegEngineCut(meta: ReturnType<typeof decodeFlightRecord>["meta"]): string {
  return [...(meta?.legs ?? [])].reverse().find((leg) => leg.engineCut?.trim())?.engineCut?.trim() || "";
}

function parseMiles(value: string): number {
  const raw = (value ?? "").trim();
  if (!raw) return 0;
  const n = Number(raw.replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function missionLabelFromSnapshotJson(snapshotJsonRaw: string | null | undefined): string {
  if (!snapshotJsonRaw) return "";
  try {
    const parsed = JSON.parse(snapshotJsonRaw) as {
      missionName?: string;
      snapshots?: Array<{ missionName?: string }>;
    };
    const missionNames = Array.from(
      new Set([
        ...(Array.isArray(parsed?.snapshots) ? parsed.snapshots.map((snapshot) => String(snapshot?.missionName ?? "").trim()) : []),
        String(parsed?.missionName ?? "").trim(),
      ].filter(Boolean)),
    );
    return missionNames.join(", ");
  } catch {
    return "";
  }
}

function missionLabelFromMeta(meta: ReturnType<typeof decodeFlightRecord>["meta"]): string {
  const names = Array.from(
    new Set([
      ...(meta?.training?.snapshots ?? []).map((snapshot) => String(snapshot?.missionName ?? "").trim()),
      String(meta?.training?.snapshot?.missionName ?? "").trim(),
    ].filter(Boolean)),
  );
  return names.join(", ");
}

function instructorNameFromMeta(meta: ReturnType<typeof decodeFlightRecord>["meta"]): string {
  const direct = String(meta?.header?.instructorName ?? "").trim();
  if (direct) return direct;
  const label = String(meta?.header?.instructorUserId ?? "").trim();
  return label;
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
  if (isFutureFlight(item, info)) return false;
  const status = item.flight_status ?? "";
  if (["Pendente", "Confirmado", "Previsto"].includes(status)) return false;
  const totalFlightMinutes =
    info?.totalFlightMinutes ??
    (typeof item.duration_sec === "number" && item.duration_sec > 0 ? Math.round(item.duration_sec / 60) : 0);
  if (totalFlightMinutes <= 0) return false;
  const landings = info?.landings ?? item.landings ?? 0;
  return landings > 0 || status === "Realizado";
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
  // Prefer block time (departure → engine cutoff) stored as materialized field.
  // Fall back to leg-sum minutes, then to GPS duration_sec.
  const blockMinutesMat =
    typeof item.block_time_minutes === "number" && item.block_time_minutes > 0
      ? item.block_time_minutes
      : null;
  const materializedMinutes =
    blockMinutesMat ??
    (typeof item.total_flight_minutes === "number" && item.total_flight_minutes > 0
      ? item.total_flight_minutes
      : null);
  const fallbackMinutes =
    materializedMinutes ??
    (typeof item.duration_sec === "number" && item.duration_sec > 0 ? Math.round(item.duration_sec / 60) : 0);
  const defaultInfo: FlightDisplayInfo = {
    flightDateIso: item.flight_date ?? (item.created_at ?? "").slice(0, 10) ?? null,
    startTime: item.start_time ?? "",
    endTime: addMinutesToTime(item.start_time ?? "", fallbackMinutes),
    studentName: fallback?.studentName || "—",
    studentAnac: fallback?.studentAnac || "—",
    instructorName: fallback?.instructorName || "",
    instructorAnac: fallback?.instructorAnac || "",
    aircraft: item.aircraft_ident ?? "—",
    fromTo: item.from_to || "—",
    landings: item.landings ?? 0,
    totalFlight: formatMinutes(fallbackMinutes),
    totalFlightMinutes: fallbackMinutes,
    totalMiles: typeof item.total_miles === "number" ? item.total_miles.toFixed(1) : "0.0",
    telemetryOk: item.telemetry_present ?? false,
    instructorSuggestionMd: item.instructor_suggestion_md ?? "",
    studentSuggestionMd: item.student_suggestion_md ?? "",
    weightBalanceFilled: item.weight_balance_complete ?? false,
    trainingMissionName: missionLabelFromSnapshotJson(item.training_snapshot_json) || "—",
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
  const legsSumMinutes = meta.legs.reduce((acc, leg) => acc + parseDurationToMinutes(leg.flightTime), 0);
  // Prefer block time (departure → engine cutoff from CSV header) over sum of leg times.
  // Block time is the authoritative duration for billing and display.
  const blockMinutes = flightBlockMinutesFromMeta(meta);
  const totalFlightMinutes = blockMinutes ?? legsSumMinutes;
  const durationMin =
    typeof item.duration_sec === "number" && item.duration_sec > 0
      ? Math.round(item.duration_sec / 60)
      : totalFlightMinutes;
  const totalMiles = meta.legs.reduce((acc, leg) => acc + parseMiles(leg.distance), 0);

  return {
    flightDateIso: meta.header.date || defaultInfo.flightDateIso,
    startTime: firstLegEngineStart(meta) || meta.header.startTime || meta.header.departureTimeUtc || "",
    endTime: lastLegEngineCut(meta) || addMinutesToTime(meta.header.startTime || meta.header.departureTimeUtc || "", durationMin),
    studentName: meta.header.studentName || fallback?.studentName || meta.header.studentLabel || "—",
    studentAnac: meta.header.studentAnac || fallback?.studentAnac || "—",
    instructorName: instructorNameFromMeta(meta) || fallback?.instructorName || "",
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
    weightBalanceFilled: Boolean(
      meta.weightBalance &&
        meta.weightBalance.inputs.occupantsWeightKg !== null &&
        meta.weightBalance.inputs.baggageWeightKg !== null &&
        meta.weightBalance.inputs.rampFuel.value !== null &&
        meta.weightBalance.inputs.taxiFuel.value !== null &&
        meta.weightBalance.inputs.tripFuel.value !== null &&
        meta.weightBalance.results.isComplete,
    ),
    trainingMissionName: missionLabelFromMeta(meta) || defaultInfo.trainingMissionName || "—",
  };
}

export function shortName(name: string | null | undefined, fallback = "—"): string {
  if (!name) return fallback;
  return name.trim().split(/\s+/).slice(0, 2).join(" ");
}
