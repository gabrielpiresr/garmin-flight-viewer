import Papa from "papaparse";
import type { FlightPoint } from "../types/flight";
import {
  TELEMETRY_PANELS,
  TELEMETRY_SERIES,
  type ChartRow,
  panelHasData,
} from "./telemetryCharts";

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
    const n = normHeader(h);
    if (/^utc\s*time/.test(n)) return h;
  }
  return undefined;
}

function findDateColumn(headers: string[]): string | undefined {
  return (
    findColumn(headers, [/^date\s*\(yyyy/i, /^lcl\s*date$/i, /^local\s*date$/i, /^utc\s*date$/i]) ??
    findColumn(headers, [/^date$/i])
  );
}

/** Cada coluna do CSV é atribuída a no máximo uma série (ordem de `TELEMETRY_SERIES`). */
function resolveTelemetryColumns(headers: string[]): Map<string, string> {
  const used = new Set<string>();
  const map = new Map<string, string>();
  const byNorm = headers.map((h) => ({ raw: h, n: normHeader(h) }));
  for (const def of TELEMETRY_SERIES) {
    for (const { raw, n } of byNorm) {
      if (used.has(raw)) continue;
      if (def.patterns.some((re) => re.test(n))) {
        map.set(def.key, raw);
        used.add(raw);
        break;
      }
    }
  }
  return map;
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

function guessAltIsFeet(colName: string, samples: number[]): boolean {
  const n = normHeader(colName);
  if (/ft|feet|pés|pés?/.test(n)) return true;
  if (/m|meter|metros?/.test(n) && !/min|max|tim/.test(n)) return false;
  // Heurística: valores típicos de voo em pés (ex.: 1500–35000)
  if (samples.length >= 5) {
    const max = Math.max(...samples.map(Math.abs));
    if (max > 800 && max < 60000) return true;
  }
  return false;
}

/** Converte velocidades comuns para m/s. */
function parseSpeedToMs(value: number, colName: string): number | null {
  const n = normHeader(colName);
  if (/kt|kts|knot/.test(n)) return value * 0.514444;
  if (/mph/.test(n)) return value * 0.44704;
  if (/km\/h|kmph|kmh/.test(n)) return value / 3.6;
  if (/m\/s|mps/.test(n)) return value;
  // Garmin frequentemente usa m/s em atividades; CSV de aviação pode ser kt
  if (value > 60 && value < 500) return value * 0.514444;
  return value;
}

function normalizeHeading(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = ((value % 360) + 360) % 360;
  return Number.isFinite(normalized) ? normalized : null;
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

/**
 * Junta data (YYYY-MM-DD) e hora (HH:MM:SS[.fração]) num instante.
 * Não usa só a data: isso gerava o mesmo X em todas as linhas e “colapsava” os gráficos.
 */
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

/** Preenche instantes ausentes (linhas com data/hora vazia) por interpolação entre vizinhos. */
function fillMissingInstants(instants: (number | null)[]): number[] {
  const n = instants.length;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    if (instants[i] != null) {
      out[i] = instants[i]!;
      continue;
    }
    let p = i - 1;
    while (p >= 0 && instants[p] == null) p--;
    let q = i + 1;
    while (q < n && instants[q] == null) q++;
    if (p >= 0 && q < n) {
      const frac = (i - p) / (q - p);
      out[i] = instants[p]! + (instants[q]! - instants[p]!) * frac;
    } else if (p >= 0) {
      out[i] = instants[p]! + (i - p) * 1000;
    } else if (q < n) {
      out[i] = instants[q]! - (q - i) * 1000;
    } else {
      out[i] = i * 1000;
    }
  }
  return out;
}

function parseRowInstant(
  row: Record<string, unknown>,
  dateForInstant: string | undefined,
  timeForInstant: string | undefined,
  colLclDate: string | undefined,
  colLclTime: string | undefined,
  colTime: string | undefined,
): number | null {
  if (dateForInstant && timeForInstant) {
    return parseLocalDateAndTime(row[dateForInstant], row[timeForInstant]);
  }
  if (colLclDate && colLclTime) {
    return parseLocalDateAndTime(row[colLclDate], row[colLclTime]);
  }
  if (colTime) {
    return parseTimeToMs(row[colTime], colTime);
  }
  return null;
}

/**
 * Eixo X = ms desde o primeiro instante (nunca mistura índice 0..N com epoch).
 * Instantes em falta são interpolados para não colapsar tudo num único X.
 */
function buildChartTimeAxis(
  instants: (number | null)[],
  metaLines: string[],
): {
  xs: number[];
  hasChartTime: boolean;
  chartTimeBaseMs: number | null;
  /** Ms absolutos por linha (útil para ponto GPS quando a célula veio vazia); null se eixo for só índice. */
  wallClockMs: number[] | null;
} {
  const n = instants.length;
  if (n === 0) return { xs: [], hasChartTime: false, chartTimeBaseMs: null, wallClockMs: null };

  const validN = instants.filter((t) => t != null).length;
  if (validN === 0) {
    metaLines.push("Gráficos: eixo X = amostra # (nenhuma data/hora válida nas linhas).");
    return {
      xs: Array.from({ length: n }, (_, i) => i),
      hasChartTime: false,
      chartTimeBaseMs: null,
      wallClockMs: null,
    };
  }

  let filled: number[];
  if (validN < n) {
    filled = fillMissingInstants(instants);
    metaLines.push(
      "Gráficos: algumas linhas sem data/hora completa — instantes interpolados para manter o eixo do tempo contínuo.",
    );
  } else {
    filled = instants.map((t) => t!);
  }

  const t0 = Math.min(...filled);
  const xs = filled.map((t) => t - t0);
  const u = new Set(xs).size;
  const span = Math.max(...xs) - Math.min(...xs);

  if (u < 2 || span === 0) {
    metaLines.push(
      "Gráficos: eixo X = amostra # (todos os instantes coincidem ou o arquivo não varia o relógio entre linhas).",
    );
    return {
      xs: Array.from({ length: n }, (_, i) => i),
      hasChartTime: false,
      chartTimeBaseMs: null,
      wallClockMs: null,
    };
  }

  return { xs, hasChartTime: true, chartTimeBaseMs: t0, wallClockMs: filled };
}

/**
 * Exportações Garmin de aviação costumam ter linhas de metadado (#…), descrição de formato e só
 * depois a linha de cabeçalho com `Lcl Date`, `Lcl Time`, etc.
 */
function clipToDataHeader(text: string): { csv: string; headerLineIndex: number } {
  const lines = text.split(/\r?\n/);

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
    if (tryLine(i, true)) {
      return { csv: lines.slice(i).join("\n"), headerLineIndex: i };
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (tryLine(i, false)) {
      return { csv: lines.slice(i).join("\n"), headerLineIndex: i };
    }
  }

  return { csv: text.replace(/^\uFEFF/, ""), headerLineIndex: 0 };
}

export type ParseResult = {
  points: FlightPoint[];
  chartData: ChartRow[];
  hasChartTime: boolean;
  /** Epoch ms do primeiro ponto; somar a `row.x` para horário absoluto nos ticks/tooltip. */
  chartTimeBaseMs: number | null;
  /** Colunas CSV resolvidas por chave de telemetria (para depuração). */
  telemetryColumns: Record<string, string>;
  warnings: string[];
  metaLines: string[];
  /** Matrícula da aeronave extraída dos metadados do arquivo, se disponível. */
  aircraftIdent: string | null;
};

function extractAircraftIdent(text: string): string | null {
  const lines = text.split(/\r?\n/).slice(0, 30);
  for (const line of lines) {
    const m =
      line.match(/aircraft[_\s]ident[^,=]*[,=]\s*([A-Z0-9\-]+)/i) ??
      line.match(/acft[_\s]?id[^,=]*[,=]\s*([A-Z0-9\-]+)/i);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

export function parseGarminCsv(text: string): ParseResult {
  const warnings: string[] = [];
  const metaLines: string[] = [];
  const aircraftIdent = extractAircraftIdent(text);

  const normalized = text.replace(/^\uFEFF/, "");
  const { csv: clipped } = clipToDataHeader(normalized);

  const parsed = Papa.parse<Record<string, unknown>>(clipped, {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors.length) {
    const msg = parsed.errors.slice(0, 3).map((e) => e.message).join("; ");
    warnings.push(`Avisos do parser CSV: ${msg}`);
  }

  const rows = parsed.data.filter((r) => Object.keys(r).some((k) => String(r[k] ?? "").trim() !== ""));
  if (rows.length === 0) {
    warnings.push("Nenhuma linha de dados encontrada após o cabeçalho.");
    return {
      points: [],
      chartData: [],
      hasChartTime: false,
      chartTimeBaseMs: null,
      telemetryColumns: {},
      warnings,
      metaLines,
      aircraftIdent,
    };
  }

  const headers = Object.keys(rows[0]!);
  const colLat =
    findColumn(headers, [/^latitude/i, /^lat\s*\(/i]) ??
    findColumn(headers, [/^lat(itude)?$/, /^position\s*lat/, /^gps\s*lat/, /^(nm|deg)\s*lat/, /^lat$/i]);
  const colLon =
    findColumn(headers, [/^longitude/i, /^lon\s*\(/i]) ??
    findColumn(headers, [/^lon(g(itude)?)?$/, /^position\s*(lon|long)/, /^gps\s*(lon|long)/, /^(nm|deg)\s*(lon|long)/, /^lon$/i, /lng$/i]);
  const colGpsAlt = findColumn(headers, [/^gps\s*altitude/i]);
  const colBaroAlt = findColumn(headers, [/^baro\s*altitude/i]);
  const colPressAlt = findColumn(headers, [/^pressure\s*altitude/i]);
  const colAlt =
    colGpsAlt ??
    colBaroAlt ??
    colPressAlt ??
    findColumn(headers, [/alt(itude)?/, /^elev(ation)?$/, /^height$/]);
  const colGpsSpd = findColumn(headers, [/^gps\s*ground\s*speed/i]);
  const colSpd =
    colGpsSpd ??
    findColumn(headers, [/ground\s*speed/, /grnd\s*spd/, /gnd\s*spd/, /^speed$/, /velocity/]);

  const colDate = findDateColumn(headers);
  const colLocalTime = findLocalTimeColumn(headers);
  const colUtcTime = findUtcTimeColumn(headers);
  const colLclDate =
    findColumn(headers, [/^lcl\s*date$/i, /^local\s*date$/i]) ?? findColumn(headers, [/^utc\s*date$/i]);
  const colLclTime =
    findColumn(headers, [/^lcl\s*time$/i, /^local\s*time$/i]) ?? findColumn(headers, [/^utc\s*time$/i]);
  const colTime =
    findColumn(headers, [/^timestamp$/, /^time$/, /date\s*&\s*time/, /^datetime$/, /^elapsed/]);

  const dateForInstant = colDate ?? colLclDate;
  const timeForInstant = colLocalTime ?? colLclTime ?? colUtcTime;

  const telemetryResolved = resolveTelemetryColumns(headers);
  const telemetryColumns = Object.fromEntries(telemetryResolved);

  if (colLat) metaLines.push(`Latitude: “${colLat}”`);
  if (colLon) metaLines.push(`Longitude: “${colLon}”`);
  if (colAlt) metaLines.push(`Altitude (mapa/resumo): “${colAlt}”`);
  if (colSpd) metaLines.push(`Velocidade solo: “${colSpd}”`);
  if (dateForInstant && timeForInstant) {
    metaLines.push(`Instante: “${dateForInstant}” + “${timeForInstant}”`);
  } else if (colTime) {
    metaLines.push(`Tempo: “${colTime}”`);
  }
  const seriesCount = telemetryResolved.size;
  if (seriesCount > 0) {
    metaLines.push(`Telemetria: ${seriesCount} série(s) mapeada(s) a partir das colunas do arquivo.`);
  }

  if (!colLat || !colLon) {
    warnings.push(
      "Não encontrei colunas claras de latitude/longitude. Confira se o CSV tem cabeçalhos (linha 1) com nomes como Latitude/Longitude.",
    );
    return {
      points: [],
      chartData: [],
      hasChartTime: false,
      chartTimeBaseMs: null,
      telemetryColumns,
      warnings,
      metaLines,
      aircraftIdent,
    };
  }

  const altSamples: number[] = [];
  if (colAlt) {
    for (let i = 0; i < Math.min(40, rows.length); i++) {
      const v = parseNumberCell(rows[i]![colAlt]);
      if (v !== null) altSamples.push(v);
    }
  }
  const altFeet = colAlt ? guessAltIsFeet(colAlt, altSamples) : false;

  const instants = rows.map((row) =>
    parseRowInstant(row, dateForInstant, timeForInstant, colLclDate, colLclTime, colTime),
  );
  const { xs, hasChartTime, chartTimeBaseMs, wallClockMs } = buildChartTimeAxis(instants, metaLines);

  const points: FlightPoint[] = [];
  const chartData: ChartRow[] = [];

  rows.forEach((row, idx) => {
    const rowChart: ChartRow = { x: xs[idx] ?? idx };
    for (const [key, csvCol] of telemetryResolved) {
      rowChart[key] = parseNumberCell(row[csvCol]);
    }
    chartData.push(rowChart);

    const lat = parseNumberCell(row[colLat!]);
    const lon = parseNumberCell(row[colLon!]);
    if (lat === null || lon === null) return;
    if (lat === 0 && lon === 0) return;

    let altM: number | null = null;
    if (colAlt) {
      const a = parseNumberCell(row[colAlt]);
      if (a !== null) altM = altFeet ? a * 0.3048 : a;
    }

    let speedMs: number | null = null;
    if (colSpd) {
      const s = parseNumberCell(row[colSpd]);
      if (s !== null) speedMs = parseSpeedToMs(s, colSpd);
    }

    const tRaw = instants[idx] ?? null;
    const t = tRaw ?? wallClockMs?.[idx] ?? null;
    const trackDeg = normalizeHeading(rowChart.trackDeg);
    const hdgMag = normalizeHeading(rowChart.hdgMag);
    points.push({ lat, lon, headingDeg: trackDeg ?? hdgMag, altM, speedMs, t });
  });

  if (points.length < 2) {
    warnings.push("Poucos pontos GPS válidos. Verifique separadores (; vs ,) e formato numérico.");
  }

  if (telemetryResolved.size > 0) {
    const activePanels = TELEMETRY_PANELS.filter((p) => panelHasData(p, chartData, telemetryResolved));
    if (activePanels.length === 0) {
      warnings.push("Há colunas de telemetria reconhecidas, mas os valores parecem vazios ou inválidos.");
    }
  }

  if (colAlt && altFeet) metaLines.push("Altitude interpretada como pés → convertida para metros nas estatísticas.");
  else if (colAlt) metaLines.push("Altitude interpretada em metros (ajuste manual se estiver incorreto).");

  return { points, chartData, hasChartTime, chartTimeBaseMs, telemetryColumns, warnings, metaLines, aircraftIdent };
}
