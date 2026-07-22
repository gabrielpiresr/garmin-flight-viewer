import Papa from "papaparse";

export const MAX_TELEMETRY_CSV_FILES = 4;

export type TelemetryCsvSource = {
  name: string;
  text: string;
};

export type TelemetryCsvFileMeta = {
  name: string;
  charCount: number;
  rowCount: number;
  startMs: number | null;
  endMs: number | null;
};

export type TelemetryCsvGap = {
  afterName: string;
  beforeName: string;
  startMs: number;
  endMs: number;
  durationSec: number;
};

export type MergedTelemetryCsv = {
  csv: string;
  files: TelemetryCsvFileMeta[];
  gaps: TelemetryCsvGap[];
  totalGapSec: number;
  sourceFileName: string;
};

type ParsedCsvFile = {
  source: TelemetryCsvSource;
  headers: string[];
  rows: Record<string, unknown>[];
  timedRows: Array<{
    row: Record<string, unknown>;
    instantMs: number | null;
    fileIndex: number;
    rowIndex: number;
  }>;
  startMs: number | null;
  endMs: number | null;
};

function normHeader(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ");
}

function findColumn(headers: string[], patterns: RegExp[]): string | undefined {
  const byNorm = headers.map((h) => ({ raw: h, n: normHeader(h) }));
  for (const { raw, n } of byNorm) {
    for (const re of patterns) {
      if (re.test(n)) return raw;
    }
  }
  return undefined;
}

function findLocalTimeColumn(headers: string[]): string | undefined {
  for (const h of headers) {
    const n = normHeader(h);
    if (/^utc/.test(n)) continue;
    if (/^time\s*\(/.test(n) || n === "time") return h;
  }
  return findColumn(headers, [/^lcl\s*time$/i, /^local\s*time$/i]);
}

function findUtcTimeColumn(headers: string[]): string | undefined {
  for (const h of headers) {
    if (/^utc\s*time/.test(normHeader(h))) return h;
  }
  return undefined;
}

function findDateColumn(headers: string[]): string | undefined {
  return (
    findColumn(headers, [/^date\s*\(yyyy/i, /^lcl\s*date\b/i, /^local\s*date\b/i, /^utc\s*date\b/i]) ??
    findColumn(headers, [/^date$/i])
  );
}

function parseNumberCell(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = String(value).trim();
  if (!s) return null;
  const cleaned = s.replace(/"/g, "").replace(/\s/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseTimeToMs(value: unknown, colName: string): number | null {
  const n = normHeader(colName);
  const s = String(value ?? "").trim();
  if (!s) return null;

  const num = parseNumberCell(value);
  if (num !== null && !s.includes(":") && !s.includes("-") && !s.includes("/")) {
    if (/sec|elapsed|time\s*\(s\)/.test(n)) return num * 1000;
    if (num > 1e12) return num;
    if (num > 1e9 && num < 1e12) return num * 1000;
    if (num > 1e5 && num < 1e9) return num * 1000;
  }

  const d = Date.parse(s);
  if (!Number.isNaN(d)) return d;

  const m = s.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2]);
    const sec = Number(m[3]);
    if ([h, min, sec].every((x) => Number.isFinite(x))) {
      return ((h * 60 + min) * 60 + sec) * 1000;
    }
  }
  return null;
}

function parseLocalDateAndTime(dateVal: unknown, timeVal: unknown): number | null {
  const dateStr = String(dateVal ?? "").trim();
  const timeStr = String(timeVal ?? "").trim();
  if (!dateStr || !timeStr) return null;

  const iso = `${dateStr}T${timeStr}`;
  let ms = Date.parse(iso);
  if (!Number.isNaN(ms)) return ms;
  ms = Date.parse(`${dateStr} ${timeStr}`);
  if (!Number.isNaN(ms)) return ms;

  const tm = timeStr.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?/);
  if (!tm) return null;
  const dayMs = Date.parse(`${dateStr}T00:00:00`);
  if (Number.isNaN(dayMs)) return null;
  const h = Number(tm[1]);
  const mi = Number(tm[2]);
  const s = Number(tm[3]);
  const frac = tm[4] ? Number(`0.${tm[4]}`) : 0;
  if (![h, mi, s].every((x) => Number.isFinite(x))) return null;
  return dayMs + ((h * 60 + mi) * 60 + s + frac) * 1000;
}

function clipToDataHeader(text: string): { csv: string; headerLineIndex: number } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);

  const tryLine = (i: number, strict: boolean): boolean => {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes(",")) return false;
    if (trimmed.startsWith("#")) return false;

    const cells = Papa.parse(line, { delimiter: ",", quoteChar: '"', header: false });
    const row = (cells.data[0] as string[] | undefined) ?? [];
    const joined = row.join(",").toLowerCase();

    if (strict) {
      return (
        /lcl\s*date/i.test(joined) ||
        (/date/i.test(joined) && /latitude/i.test(joined) && /longitude/i.test(joined)) ||
        (/latitude/i.test(joined) && /longitude/i.test(joined)) ||
        (/utc\s*date/i.test(joined) && /utc\s*time/i.test(joined))
      );
    }
    return true;
  };

  for (let i = 0; i < lines.length; i++) {
    if (tryLine(i, true)) return { csv: lines.slice(i).join("\n"), headerLineIndex: i };
  }
  for (let i = 0; i < lines.length; i++) {
    if (tryLine(i, false)) return { csv: lines.slice(i).join("\n"), headerLineIndex: i };
  }
  return { csv: text.replace(/^\uFEFF/, ""), headerLineIndex: 0 };
}

function parseRowInstant(row: Record<string, unknown>, headers: string[]): number | null {
  const colDate = findDateColumn(headers);
  const colLocalTime = findLocalTimeColumn(headers);
  const colUtcTime = findUtcTimeColumn(headers);
  const colLclDate =
    findColumn(headers, [/^lcl\s*date\b/i, /^local\s*date\b/i]) ?? findColumn(headers, [/^utc\s*date\b/i]);
  const colLclTime =
    findColumn(headers, [/^lcl\s*time\b/i, /^local\s*time\b/i]) ?? findColumn(headers, [/^utc\s*time\b/i]);
  const colTime = findColumn(headers, [/^timestamp$/, /^time$/, /date\s*&\s*time/, /^datetime$/, /^elapsed/]);

  const dateForInstant = colDate ?? colLclDate;
  const timeForInstant = colLocalTime ?? colLclTime ?? colUtcTime;
  if (dateForInstant && timeForInstant) return parseLocalDateAndTime(row[dateForInstant], row[timeForInstant]);
  if (colLclDate && colLclTime) return parseLocalDateAndTime(row[colLclDate], row[colLclTime]);
  if (colTime) return parseTimeToMs(row[colTime], colTime);
  return null;
}

function parseCsvFile(source: TelemetryCsvSource, fileIndex: number): ParsedCsvFile {
  const { csv } = clipToDataHeader(source.text);
  const parsed = Papa.parse<Record<string, unknown>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
    transformHeader: (h) => h.trim(),
  });
  const rows = parsed.data.filter((r) => Object.keys(r).some((k) => String(r[k] ?? "").trim() !== ""));
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  const timedRows = rows.map((row, rowIndex) => ({
    row,
    instantMs: parseRowInstant(row, headers),
    fileIndex,
    rowIndex,
  }));
  const instants = timedRows.map((row) => row.instantMs).filter((ms): ms is number => ms !== null);
  return {
    source,
    headers,
    rows,
    timedRows,
    startMs: instants.length ? Math.min(...instants) : null,
    endMs: instants.length ? Math.max(...instants) : null,
  };
}

function buildSourceFileName(files: TelemetryCsvSource[]): string {
  if (files.length === 0) return "telemetria.csv";
  if (files.length === 1) return files[0]!.name || "telemetria.csv";
  const firstName = files[0]!.name || "telemetria.csv";
  const baseName = firstName.replace(/\.[^.\\/]+$/, "").trim() || "telemetria";
  return `${baseName}-merge-${files.length}-csvs.csv`;
}

export function mergeTelemetryCsvFiles(sources: TelemetryCsvSource[]): MergedTelemetryCsv {
  const files = sources.filter((source) => source.text.trim());
  if (files.length === 0) {
    return { csv: "", files: [], gaps: [], totalGapSec: 0, sourceFileName: "telemetria.csv" };
  }
  if (files.length > MAX_TELEMETRY_CSV_FILES) {
    throw new Error(`Selecione no máximo ${MAX_TELEMETRY_CSV_FILES} CSVs por voo.`);
  }

  const parsedFiles = files.map(parseCsvFile);
  if (parsedFiles.some((file) => file.rows.length === 0)) {
    throw new Error("Um dos CSVs selecionados não tem linhas de dados após o cabeçalho.");
  }
  if (parsedFiles.length > 1 && parsedFiles.some((file) => file.startMs === null || file.endMs === null)) {
    throw new Error("Para juntar múltiplos CSVs, todos precisam ter data/hora válida nas linhas.");
  }

  const orderedFiles = [...parsedFiles].sort((a, b) => {
    const aStart = a.startMs ?? Number.MAX_SAFE_INTEGER;
    const bStart = b.startMs ?? Number.MAX_SAFE_INTEGER;
    return aStart - bStart;
  });
  const fields: string[] = [];
  for (const file of orderedFiles) {
    for (const header of file.headers) {
      if (!fields.includes(header)) fields.push(header);
    }
  }

  const sortedRows = parsedFiles
    .flatMap((file) => file.timedRows)
    .sort((a, b) => {
      const aInstant = a.instantMs ?? (parsedFiles[a.fileIndex]?.startMs ?? 0) + a.rowIndex;
      const bInstant = b.instantMs ?? (parsedFiles[b.fileIndex]?.startMs ?? 0) + b.rowIndex;
      if (aInstant !== bInstant) return aInstant - bInstant;
      if (a.fileIndex !== b.fileIndex) return a.fileIndex - b.fileIndex;
      return a.rowIndex - b.rowIndex;
    })
    .map(({ row }) => row);

  const gaps: TelemetryCsvGap[] = [];
  for (let i = 1; i < orderedFiles.length; i++) {
    const previous = orderedFiles[i - 1]!;
    const current = orderedFiles[i]!;
    if (previous.endMs === null || current.startMs === null) continue;
    const durationSec = Math.max(0, (current.startMs - previous.endMs) / 1000);
    gaps.push({
      afterName: previous.source.name,
      beforeName: current.source.name,
      startMs: previous.endMs,
      endMs: current.startMs,
      durationSec,
    });
  }

  const csv = Papa.unparse({ fields, data: sortedRows }, { newline: "\n" });
  return {
    csv,
    files: orderedFiles.map((file) => ({
      name: file.source.name,
      charCount: file.source.text.length,
      rowCount: file.rows.length,
      startMs: file.startMs,
      endMs: file.endMs,
    })),
    gaps,
    totalGapSec: gaps.reduce((acc, gap) => acc + gap.durationSec, 0),
    sourceFileName: buildSourceFileName(orderedFiles.map((file) => file.source)),
  };
}
