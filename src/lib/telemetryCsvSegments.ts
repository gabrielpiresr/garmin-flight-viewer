import Papa from "papaparse";
import type { TelemetryCsvSource } from "./telemetryCsvMerge";

export const SEGMENTED_TELEMETRY_AIRCRAFT = "PS-DZA";
export const TELEMETRY_SEGMENT_GAP_MS = 60_000;

export type TelemetryCsvSegment = TelemetryCsvSource & {
  id: string;
  sourceName: string;
  rowCount: number;
  startMs: number;
  endMs: number;
  durationSec: number;
  dateLabel: string;
  startZuluLabel: string;
  endZuluLabel: string;
  startLocalLabel: string;
  endLocalLabel: string;
};

type TimedRow = {
  row: Record<string, unknown>;
  rowIndex: number;
  instantMs: number;
  localDate: string | null;
  localTime: string | null;
  utcDate: string | null;
  utcTime: string | null;
};

type TimeColumns = {
  date?: string;
  localDate?: string;
  localTime?: string;
  utcDate?: string;
  utcTime?: string;
  genericTime?: string;
};

function normHeader(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ");
}

function findColumn(headers: string[], patterns: RegExp[]): string | undefined {
  const byNorm = headers.map((raw) => ({ raw, normalized: normHeader(raw) }));
  for (const { raw, normalized } of byNorm) {
    for (const pattern of patterns) {
      if (pattern.test(normalized)) return raw;
    }
  }
  return undefined;
}

function findColumns(headers: string[]): TimeColumns {
  const localDate = findColumn(headers, [/^lcl\s*date\b/i, /^local\s*date\b/i]);
  const localTime = findColumn(headers, [/^lcl\s*time\b/i, /^local\s*time\b/i]);
  const utcDate = findColumn(headers, [/^utc\s*date\b/i]);
  const utcTime = findColumn(headers, [/^utc\s*time\b/i]);
  const date =
    findColumn(headers, [/^date\s*\(yyyy/i, /^date$/i]) ?? localDate ?? utcDate;
  const genericTime = findColumn(headers, [/^timestamp$/, /^time$/, /date\s*&\s*time/, /^datetime$/, /^elapsed/]);
  return { date, localDate, localTime, utcDate, utcTime, genericTime };
}

function cleanCell(value: unknown): string {
  return String(value ?? "").trim();
}

function parseNumberCell(value: unknown): number | null {
  const raw = cleanCell(value);
  if (!raw) return null;
  const parsed = Number(raw.replace(/"/g, "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDateTimeMs(dateValue: unknown, timeValue: unknown, utc: boolean): number | null {
  const date = cleanCell(dateValue);
  const time = cleanCell(timeValue);
  if (!date || !time) return null;

  const suffix = utc ? "Z" : "";
  const iso = `${date}T${time}${suffix}`;
  let parsed = Date.parse(iso);
  if (!Number.isNaN(parsed)) return parsed;

  parsed = Date.parse(`${date} ${time}${utc ? " UTC" : ""}`);
  if (!Number.isNaN(parsed)) return parsed;

  const dayMs = Date.parse(`${date}T00:00:00${suffix}`);
  const match = time.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?/);
  if (Number.isNaN(dayMs) || !match) return null;

  const h = Number(match[1]);
  const m = Number(match[2]);
  const s = Number(match[3]);
  const frac = match[4] ? Number(`0.${match[4]}`) : 0;
  if (![h, m, s].every(Number.isFinite)) return null;
  return dayMs + ((h * 60 + m) * 60 + s + frac) * 1000;
}

function parseTimeToMs(value: unknown, colName: string): number | null {
  const header = normHeader(colName);
  const raw = cleanCell(value);
  if (!raw) return null;

  const numeric = parseNumberCell(value);
  if (numeric !== null && !raw.includes(":") && !raw.includes("-") && !raw.includes("/")) {
    if (/sec|elapsed|time\s*\(s\)/.test(header)) return numeric * 1000;
    if (numeric > 1e12) return numeric;
    if (numeric > 1e9 && numeric < 1e12) return numeric * 1000;
    if (numeric > 1e5 && numeric < 1e9) return numeric * 1000;
  }

  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return parsed;

  const match = raw.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  const s = Number(match[3]);
  if (![h, m, s].every(Number.isFinite)) return null;
  return ((h * 60 + m) * 60 + s) * 1000;
}

function parseRowInstant(row: Record<string, unknown>, columns: TimeColumns): number | null {
  if (columns.utcTime) {
    const utcDate = columns.utcDate ?? columns.date;
    if (utcDate) {
      const ms = parseDateTimeMs(row[utcDate], row[columns.utcTime], true);
      if (ms !== null) return ms;
    }
  }

  if (columns.localTime) {
    const localDate = columns.localDate ?? columns.date;
    if (localDate) {
      const ms = parseDateTimeMs(row[localDate], row[columns.localTime], false);
      if (ms !== null) return ms;
    }
  }

  if (columns.genericTime) return parseTimeToMs(row[columns.genericTime], columns.genericTime);
  return null;
}

function clipToDataHeader(text: string): string {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);

  const tryLine = (index: number, strict: boolean): boolean => {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes(",") || trimmed.startsWith("#")) return false;
    const cells = Papa.parse(line, { delimiter: ",", quoteChar: '"', header: false });
    const row = (cells.data[0] as string[] | undefined) ?? [];
    const joined = row.join(",").toLowerCase();
    if (!strict) return true;
    return (
      /lcl\s*date/i.test(joined) ||
      (/date/i.test(joined) && /latitude/i.test(joined) && /longitude/i.test(joined)) ||
      (/latitude/i.test(joined) && /longitude/i.test(joined)) ||
      (/utc\s*date/i.test(joined) && /utc\s*time/i.test(joined))
    );
  };

  for (let i = 0; i < lines.length; i++) {
    if (tryLine(i, true)) return lines.slice(i).join("\n");
  }
  for (let i = 0; i < lines.length; i++) {
    if (tryLine(i, false)) return lines.slice(i).join("\n");
  }
  return text.replace(/^\uFEFF/, "");
}

function looksLikeRepeatedHeader(row: Record<string, unknown>, headers: string[]): boolean {
  let matches = 0;
  for (const header of headers) {
    if (normHeader(cleanCell(row[header])) === normHeader(header)) matches += 1;
  }
  return matches >= Math.min(3, headers.length);
}

function formatDateLabel(ms: number): string {
  return new Date(ms).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function formatCsvDateLabel(value: string | null, fallbackMs: number): string {
  if (!value) return formatDateLabel(fallbackMs);
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return value;
}

function normalizeTimeLabel(value: string | null): string {
  if (!value) return "--:--:--";
  const match = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return value;
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}:${match[3] ?? "00"}`;
}

function formatUtcTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
  });
}

function formatLocalTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function buildSegmentName(sourceName: string, startMs: number, index: number): string {
  const base = sourceName.replace(/\.[^.\\/]+$/, "").trim() || "telemetria";
  const stamp = new Date(startMs).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${base}-voo-${index + 1}-${stamp}.csv`;
}

function durationSec(startMs: number, endMs: number): number {
  return Math.max(0, Math.round((endMs - startMs) / 1000));
}

export function formatSegmentDuration(totalSec: number): string {
  const safe = Math.max(0, Math.round(totalSec));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function isSegmentedTelemetryAircraft(aircraftIdent: string | null | undefined): boolean {
  return String(aircraftIdent ?? "").trim().toUpperCase() === SEGMENTED_TELEMETRY_AIRCRAFT;
}

export function findSegmentedTelemetryFlights(source: TelemetryCsvSource): TelemetryCsvSegment[] {
  const csv = clipToDataHeader(source.text);
  const parsed = Papa.parse<Record<string, unknown>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
    transformHeader: (header) => header.trim(),
  });
  const rows = parsed.data.filter((row) => Object.keys(row).some((key) => cleanCell(row[key]) !== ""));
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  if (!headers.length) return [];

  const columns = findColumns(headers);
  const timedRows = rows
    .filter((row) => !looksLikeRepeatedHeader(row, headers))
    .map((row, rowIndex): TimedRow | null => {
      const instantMs = parseRowInstant(row, columns);
      if (instantMs === null) return null;
      return {
        row,
        rowIndex,
        instantMs,
        localDate: columns.localDate ? cleanCell(row[columns.localDate]) : columns.date ? cleanCell(row[columns.date]) : null,
        localTime: columns.localTime ? cleanCell(row[columns.localTime]) : null,
        utcDate: columns.utcDate ? cleanCell(row[columns.utcDate]) : columns.date ? cleanCell(row[columns.date]) : null,
        utcTime: columns.utcTime ? cleanCell(row[columns.utcTime]) : null,
      };
    })
    .filter((row): row is TimedRow => row !== null)
    .sort((a, b) => {
      if (a.instantMs !== b.instantMs) return a.instantMs - b.instantMs;
      return a.rowIndex - b.rowIndex;
    });

  if (!timedRows.length) return [];

  const groups: TimedRow[][] = [];
  let current: TimedRow[] = [];
  for (const row of timedRows) {
    const previous = current[current.length - 1];
    if (previous && row.instantMs - previous.instantMs > TELEMETRY_SEGMENT_GAP_MS) {
      groups.push(current);
      current = [];
    }
    current.push(row);
  }
  if (current.length) groups.push(current);

  return groups
    .map((group, index) => {
      const first = group[0]!;
      const last = group[group.length - 1]!;
      const text = Papa.unparse({ fields: headers, data: group.map((item) => item.row) }, { newline: "\n" });
      const segmentDurationSec = durationSec(first.instantMs, last.instantMs);
      return {
        id: `${source.name}-${first.instantMs}-${last.instantMs}-${index}`,
        sourceName: source.name,
        name: buildSegmentName(source.name, first.instantMs, index),
        text,
        rowCount: group.length,
        startMs: first.instantMs,
        endMs: last.instantMs,
        durationSec: segmentDurationSec,
        dateLabel: formatCsvDateLabel(first.localDate ?? first.utcDate, first.instantMs),
        startZuluLabel: first.utcTime ? normalizeTimeLabel(first.utcTime) : formatUtcTime(first.instantMs),
        endZuluLabel: last.utcTime ? normalizeTimeLabel(last.utcTime) : formatUtcTime(last.instantMs),
        startLocalLabel: first.localTime ? normalizeTimeLabel(first.localTime) : formatLocalTime(first.instantMs),
        endLocalLabel: last.localTime ? normalizeTimeLabel(last.localTime) : formatLocalTime(last.instantMs),
      };
    })
    .sort((a, b) => b.startMs - a.startMs);
}
