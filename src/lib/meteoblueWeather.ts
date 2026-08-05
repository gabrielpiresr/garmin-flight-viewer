import type {
  DayWeatherSummary,
  HourWeatherSlot,
  MeteoblueForecastBundle,
  MeteoblueRawForecast,
} from "../types/meteoblue";

/** Pictocodes Meteoblue 1–17 (iday). */
const PICTOCODE_LABELS: Record<number, string> = {
  1: "Céu limpo",
  2: "Principalmente limpo",
  3: "Parcialmente nublado",
  4: "Nublado",
  5: "Névoa",
  6: "Chuva fraca",
  7: "Chuva",
  8: "Chuva forte",
  9: "Chuva com trovoada",
  10: "Chuva mista",
  11: "Neve fraca",
  12: "Neve",
  13: "Neve forte",
  14: "Chuva congelante",
  15: "Chuva congelante forte",
  16: "Trovoadas",
  17: "Neblina",
};

export function pictocodeLabel(code: number | null | undefined): string {
  if (code == null || !Number.isFinite(code)) return "Sem dados";
  return PICTOCODE_LABELS[Math.round(code)] ?? `Código ${Math.round(code)}`;
}

/** Família visual para ícones SVG simples. */
export type WeatherIconKind =
  | "clear"
  | "mostlyClear"
  | "partlyCloudy"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "heavyRain"
  | "thunder"
  | "snow"
  | "sleet";

export function pictocodeKind(code: number | null | undefined): WeatherIconKind {
  const n = Math.round(Number(code) || 0);
  switch (n) {
    case 1:
      return "clear";
    case 2:
      return "mostlyClear";
    case 3:
      return "partlyCloudy";
    case 4:
      return "cloudy";
    case 5:
    case 17:
      return "fog";
    case 6:
      return "drizzle";
    case 7:
    case 10:
      return "rain";
    case 8:
    case 14:
    case 15:
      return "heavyRain";
    case 9:
    case 16:
      return "thunder";
    case 11:
    case 12:
    case 13:
      return "snow";
    default:
      return "partlyCloudy";
  }
}

function localDateIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Datas com previsão exibível: hoje … hoje+5 (6 dias). */
export function forecastDateWindow(now = new Date()): { startIso: string; endIso: string; dates: string[] } {
  const dates: string[] = [];
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  for (let i = 0; i < 6; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(localDateIso(d));
  }
  return { startIso: dates[0]!, endIso: dates[dates.length - 1]!, dates };
}

export function isWithinForecastWindow(dateIso: string, now = new Date()): boolean {
  const { startIso, endIso } = forecastDateWindow(now);
  return dateIso >= startIso && dateIso <= endIso;
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function dateFromMeteoblueTime(time: string): string {
  // "2026-08-05" or "2026-08-05 14:00"
  return String(time || "").slice(0, 10);
}

function hourFromMeteoblueTime(time: string): number {
  const match = String(time || "").match(/(\d{2}):\d{2}/);
  return match ? Number(match[1]) : 0;
}

export function parseMeteoblueForecast(
  raw: MeteoblueRawForecast,
  meta: { lat: number; lon: number; asl: number; fetchedAt?: string; icao?: string | null },
  now = new Date(),
): MeteoblueForecastBundle {
  const { dates: allowed } = forecastDateWindow(now);
  const allowedSet = new Set(allowed);

  const dayData = raw.data_day;
  const days: DayWeatherSummary[] = [];

  // Precipitação do dia = soma das 24h (não só horário da escala).
  const precipByDate = new Map<string, number>();
  const precipProbByDate = new Map<string, number>();
  if (raw.data_1h?.time?.length) {
    const h = raw.data_1h;
    const hTimes = h.time ?? [];
    for (let i = 0; i < hTimes.length; i++) {
      const dateIso = dateFromMeteoblueTime(hTimes[i] || "");
      if (!allowedSet.has(dateIso)) continue;
      const p = num(h.precipitation?.[i]);
      if (p != null) precipByDate.set(dateIso, (precipByDate.get(dateIso) ?? 0) + p);
      const pr = num(h.precipitation_probability?.[i]);
      if (pr != null) precipProbByDate.set(dateIso, Math.max(precipProbByDate.get(dateIso) ?? 0, pr));
    }
  }

  if (dayData?.time?.length) {
    for (let i = 0; i < dayData.time.length; i++) {
      const dateIso = dateFromMeteoblueTime(dayData.time[i] || "");
      if (!allowedSet.has(dateIso)) continue;
      const pictocode = Math.round(num(dayData.pictocode?.[i]) ?? 3);
      const hourlyPrecip = precipByDate.get(dateIso);
      days.push({
        dateIso,
        pictocode,
        label: pictocodeLabel(pictocode),
        tempMaxC: num(dayData.temperature_max?.[i]),
        tempMinC: num(dayData.temperature_min?.[i]),
        windMaxKt: num(dayData.windspeed_max?.[i]),
        windDirDeg: num(dayData.winddirection?.[i]),
        precipMm: hourlyPrecip != null ? hourlyPrecip : num(dayData.precipitation?.[i]),
        precipProbPct: precipProbByDate.get(dateIso) ?? num(dayData.precipitation_probability?.[i]),
        humidityPct: num(dayData.relativehumidity_mean?.[i]),
        feltMaxC: num(dayData.felttemperature_max?.[i]),
        feltMinC: num(dayData.felttemperature_min?.[i]),
        uvIndex: num(dayData.uvindex?.[i]),
      });
    }
  }

  // Se basic-day não veio, agrega do horário.
  if (days.length === 0 && raw.data_1h?.time?.length) {
    const byDate = new Map<
      string,
      {
        temps: number[];
        winds: number[];
        dirs: number[];
        precip: number[];
        probs: number[];
        humidity: number[];
        felts: number[];
        pictos: number[];
        uvs: number[];
      }
    >();
    const h = raw.data_1h;
    const hTimes = h.time ?? [];
    for (let i = 0; i < hTimes.length; i++) {
      const dateIso = dateFromMeteoblueTime(hTimes[i] || "");
      if (!allowedSet.has(dateIso)) continue;
      let bucket = byDate.get(dateIso);
      if (!bucket) {
        bucket = { temps: [], winds: [], dirs: [], precip: [], probs: [], humidity: [], felts: [], pictos: [], uvs: [] };
        byDate.set(dateIso, bucket);
      }
      const t = num(h.temperature?.[i]);
      if (t != null) bucket.temps.push(t);
      const w = num(h.windspeed?.[i]);
      if (w != null) bucket.winds.push(w);
      const d = num(h.winddirection?.[i]);
      if (d != null) bucket.dirs.push(d);
      const p = num(h.precipitation?.[i]);
      if (p != null) bucket.precip.push(p);
      const pr = num(h.precipitation_probability?.[i]);
      if (pr != null) bucket.probs.push(pr);
      const rh = num(h.relativehumidity?.[i]);
      if (rh != null) bucket.humidity.push(rh);
      const f = num(h.felttemperature?.[i]);
      if (f != null) bucket.felts.push(f);
      const pc = num(h.pictocode?.[i]);
      if (pc != null) bucket.pictos.push(pc);
      const uv = num(h.uvindex?.[i]);
      if (uv != null) bucket.uvs.push(uv);
    }
    for (const dateIso of allowed) {
      const bucket = byDate.get(dateIso);
      if (!bucket || bucket.temps.length === 0) continue;
      // Pictocode diurno: moda das 9h–15h, senão moda geral.
      const middayPictos = bucket.pictos.filter((_, idx) => {
        // approximate: we don't store hours in aggregate — use mode of all
        void idx;
        return true;
      });
      const pictocode = Math.round(mode(middayPictos) ?? 3);
      days.push({
        dateIso,
        pictocode,
        label: pictocodeLabel(pictocode),
        tempMaxC: maxOf(bucket.temps),
        tempMinC: minOf(bucket.temps),
        windMaxKt: maxOf(bucket.winds),
        windDirDeg: bucket.dirs.length ? bucket.dirs[Math.floor(bucket.dirs.length / 2)]! : null,
        precipMm: sumOf(bucket.precip),
        precipProbPct: maxOf(bucket.probs),
        humidityPct: avgOf(bucket.humidity),
        feltMaxC: maxOf(bucket.felts),
        feltMinC: minOf(bucket.felts),
        uvIndex: maxOf(bucket.uvs),
      });
    }
  }

  const hours: HourWeatherSlot[] = [];
  const hData = raw.data_1h;
  if (hData?.time?.length) {
    // Agrupa em blocos de 3h: 0,3,6,9,12,15,18,21
    type Acc = {
      dateIso: string;
      hour: number;
      temps: number[];
      winds: number[];
      dirs: number[];
      precip: number[];
      probs: number[];
      humidity: number[];
      felts: number[];
      pictos: number[];
      daylight: number[];
    };
    const slots = new Map<string, Acc>();
    for (let i = 0; i < hData.time.length; i++) {
      const time = hData.time[i] || "";
      const dateIso = dateFromMeteoblueTime(time);
      if (!allowedSet.has(dateIso)) continue;
      const hour = hourFromMeteoblueTime(time);
      const slotHour = Math.floor(hour / 3) * 3;
      const key = `${dateIso}|${slotHour}`;
      let acc = slots.get(key);
      if (!acc) {
        acc = {
          dateIso,
          hour: slotHour,
          temps: [],
          winds: [],
          dirs: [],
          precip: [],
          probs: [],
          humidity: [],
          felts: [],
          pictos: [],
          daylight: [],
        };
        slots.set(key, acc);
      }
      const t = num(hData.temperature?.[i]);
      if (t != null) acc.temps.push(t);
      const w = num(hData.windspeed?.[i]);
      if (w != null) acc.winds.push(w);
      const d = num(hData.winddirection?.[i]);
      if (d != null) acc.dirs.push(d);
      const p = num(hData.precipitation?.[i]);
      if (p != null) acc.precip.push(p);
      const pr = num(hData.precipitation_probability?.[i]);
      if (pr != null) acc.probs.push(pr);
      const rh = num(hData.relativehumidity?.[i]);
      if (rh != null) acc.humidity.push(rh);
      const f = num(hData.felttemperature?.[i]);
      if (f != null) acc.felts.push(f);
      const pc = num(hData.pictocode?.[i]);
      if (pc != null) acc.pictos.push(pc);
      const dl = num(hData.isdaylight?.[i]);
      if (dl != null) acc.daylight.push(dl);
    }
    for (const acc of slots.values()) {
      const pictocode = Math.round(mode(acc.pictos) ?? 3);
      hours.push({
        dateIso: acc.dateIso,
        hour: acc.hour,
        timeLabel: `${String(acc.hour).padStart(2, "0")}h`,
        pictocode,
        label: pictocodeLabel(pictocode),
        tempC: avgOf(acc.temps),
        windKt: maxOf(acc.winds),
        windDirDeg: acc.dirs.length ? acc.dirs[Math.floor(acc.dirs.length / 2)]! : null,
        precipMm: sumOf(acc.precip),
        precipProbPct: maxOf(acc.probs),
        humidityPct: avgOf(acc.humidity),
        feltC: avgOf(acc.felts),
        isDaylight: (avgOf(acc.daylight) ?? 1) >= 0.5,
      });
    }
    hours.sort((a, b) => (a.dateIso === b.dateIso ? a.hour - b.hour : a.dateIso.localeCompare(b.dateIso)));
  }

  return {
    fetchedAt: meta.fetchedAt || new Date().toISOString(),
    lat: meta.lat,
    lon: meta.lon,
    asl: meta.asl,
    icao: meta.icao ?? null,
    days,
    hours,
  };
}

function maxOf(arr: number[]): number | null {
  if (!arr.length) return null;
  return Math.max(...arr);
}

function minOf(arr: number[]): number | null {
  if (!arr.length) return null;
  return Math.min(...arr);
}

function sumOf(arr: number[]): number | null {
  if (!arr.length) return null;
  return arr.reduce((s, n) => s + n, 0);
}

function avgOf(arr: number[]): number | null {
  if (!arr.length) return null;
  return arr.reduce((s, n) => s + n, 0) / arr.length;
}

function mode(arr: number[]): number | null {
  if (!arr.length) return null;
  const counts = new Map<number, number>();
  let best = arr[0]!;
  let bestCount = 0;
  for (const v of arr) {
    const c = (counts.get(v) || 0) + 1;
    counts.set(v, c);
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

export function daySummaryByDate(bundle: MeteoblueForecastBundle | null): Map<string, DayWeatherSummary> {
  const map = new Map<string, DayWeatherSummary>();
  if (!bundle) return map;
  for (const day of bundle.days) map.set(day.dateIso, day);
  return map;
}

export function hourSlotsByDate(bundle: MeteoblueForecastBundle | null): Map<string, HourWeatherSlot[]> {
  const map = new Map<string, HourWeatherSlot[]>();
  if (!bundle) return map;
  for (const slot of bundle.hours) {
    const list = map.get(slot.dateIso) ?? [];
    list.push(slot);
    map.set(slot.dateIso, list);
  }
  return map;
}

export function formatTemp(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${Math.round(v)}°`;
}

export function formatWindKt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${Math.round(v)} kt`;
}

export function formatPrecipMm(v: number | null | undefined, compact = false): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v < 0.05) return compact ? "0mm" : "0 mm";
  if (v < 10) return compact ? `${v.toFixed(1)}mm` : `${v.toFixed(1)} mm`;
  return compact ? `${Math.round(v)}mm` : `${Math.round(v)} mm`;
}

export function formatWindCompact(v: number | null | undefined, dirDeg?: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const dir = windDirLabel(dirDeg);
  return dir ? `${Math.round(v)} kt ${dir}` : `${Math.round(v)} kt`;
}

export function windDirLabel(deg: number | null | undefined): string {
  if (deg == null || !Number.isFinite(deg)) return "";
  const dirs = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return dirs[idx] ?? "";
}

export function dayWeatherTooltip(day: DayWeatherSummary): string {
  const parts = [
    day.label,
    `Máx ${formatTemp(day.tempMaxC)} · Mín ${formatTemp(day.tempMinC)}`,
    `Vento máx ${formatWindKt(day.windMaxKt)}${day.windDirDeg != null ? ` ${windDirLabel(day.windDirDeg)}` : ""}`,
    `Chuva ${formatPrecipMm(day.precipMm)}${day.precipProbPct != null ? ` (${Math.round(day.precipProbPct)}%)` : ""}`,
  ];
  if (day.humidityPct != null) parts.push(`Umidade ${Math.round(day.humidityPct)}%`);
  if (day.feltMaxC != null || day.feltMinC != null) {
    parts.push(`Sensação ${formatTemp(day.feltMaxC)} / ${formatTemp(day.feltMinC)}`);
  }
  if (day.uvIndex != null) parts.push(`UV ${Math.round(day.uvIndex)}`);
  return parts.join("\n");
}

export function hourWeatherTooltip(slot: HourWeatherSlot): string {
  const parts = [
    `${slot.timeLabel} · ${slot.label}`,
    `Temp ${formatTemp(slot.tempC)}`,
    `Vento ${formatWindKt(slot.windKt)}${slot.windDirDeg != null ? ` ${windDirLabel(slot.windDirDeg)}` : ""}`,
    `Chuva ${formatPrecipMm(slot.precipMm)}${slot.precipProbPct != null ? ` (${Math.round(slot.precipProbPct)}%)` : ""}`,
  ];
  if (slot.humidityPct != null) parts.push(`Umidade ${Math.round(slot.humidityPct)}%`);
  if (slot.feltC != null) parts.push(`Sensação ${formatTemp(slot.feltC)}`);
  return parts.join("\n");
}
