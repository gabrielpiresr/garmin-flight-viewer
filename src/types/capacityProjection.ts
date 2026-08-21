export type CalendarMode = "weekday" | "weekend" | "mixed";
export type IntensityLevel = "low" | "medium" | "high";
export type CourseHalf = "first" | "second";
export type RatedCourseCode = "PP" | "PC" | "INVA";
export type CourseCode = RatedCourseCode | "HOBBY";
export type VerdictKind = "yes" | "tight" | "no";
export type Bucket = "weekday" | "weekend";

export type HoursLookupHalf = Record<CourseHalf, number>;
export type HoursLookupIntensity = Record<IntensityLevel, HoursLookupHalf>;
export type HoursLookupTable = Record<CalendarMode, HoursLookupIntensity>;

export type IntakeTemplate = {
  course: CourseCode;
  calendar: CalendarMode;
  intensity: IntensityLevel;
};

export type CapacityProjectionSettings = {
  abandonmentDays: number;
  lookbackDays: number;
  horizonMonths: number;
  decisionHorizonMonths: number;
  slackPercent: number;
  weekendShareHigh: number;
  weekendShareLow: number;
  intensityLowMaxHoursPerMonth: number;
  intensityHighMinHoursPerMonth: number;
  weekdayAvgHoursPerDay: number;
  weekendAvgHoursPerDay: number;
  courseHours: Record<RatedCourseCode, number>;
  conversionPpToPc: number;
  conversionPcToInva: number;
  hoursLookup: HoursLookupTable;
  hoursLookupSource: "suggested" | "custom";
  intakeTemplate: IntakeTemplate;
  excludedCrmStatusNames: string[];
};

export type CapacityStudentOverride = {
  id: string;
  studentUserId: string;
  calendarMode: CalendarMode | null;
  intensity: IntensityLevel | null;
  courseCode: CourseCode | "NONE" | null;
  hoursAdjustment: number;
  excluded: boolean;
  pausedUntil: string | null;
  notes: string;
};

export type CapacityStudentInput = {
  userId: string;
  name: string;
  email: string;
  isActive: boolean;
  daysSinceLastFlight: number | null;
  lastFlightAt: string | null;
  flownHours: number;
  courseFlownHours?: number;
  trackId?: string | null;
  windowWeekdayHours: number;
  windowWeekendHours: number;
  windowHours: number;
  trackName: string | null;
  trackStatus: string | null;
  courseCode: CourseCode | null;
  crmStatusName: string | null;
};

export type CapacityMaintenanceItem = {
  code: string;
  title: string;
  intervalHours: number;
  downtimeDays: number | null;
};

export type CapacityAircraftInput = {
  id: string;
  registration: string;
  type: "aviao" | "simulador" | "ground";
  active: boolean;
  currentHours: number | null;
  maintenanceItems: CapacityMaintenanceItem[];
  groundedNow: boolean;
  groundedReason: string | null;
  groundedDaysFromToday: number;
};

export type CapacityMonthActual = {
  month: string;
  weekdayHours: number;
  weekendHours: number;
};

export type HypotheticalIntake = {
  count: number;
  calendar: CalendarMode;
  intensity: IntensityLevel;
  course: CourseCode;
  startMonth: string;
};

export type TraceLine = {
  label: string;
  formula?: string;
  value: string;
};

export type TraceBlock = {
  title: string;
  summary: string;
  lines: TraceLine[];
  forecast?: Array<{
    month: string;
    label: string;
    hours: number;
    remainingAfter: number | null;
    course: string | null;
    event: string | null;
  }>;
  finishLabel?: string | null;
};

export const CALENDAR_MODES: CalendarMode[] = ["weekday", "weekend", "mixed"];
export const INTENSITY_LEVELS: IntensityLevel[] = ["low", "medium", "high"];
export const COURSE_HALVES: CourseHalf[] = ["first", "second"];
export const RATED_COURSE_CODES: RatedCourseCode[] = ["PP", "PC", "INVA"];
export const COURSE_CODES: CourseCode[] = ["PP", "PC", "INVA", "HOBBY"];

export const CALENDAR_LABELS: Record<CalendarMode, string> = {
  weekday: "Dia de semana",
  weekend: "Final de semana",
  mixed: "Misto",
};

export const INTENSITY_LABELS: Record<IntensityLevel, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};

export const HALF_LABELS: Record<CourseHalf, string> = {
  first: "1ª metade",
  second: "2ª metade",
};

export const COURSE_LABELS: Record<CourseCode, string> = {
  PP: "Piloto Privado",
  PC: "Piloto Comercial",
  INVA: "INVA",
  HOBBY: "Hobbie",
};

export const VERDICT_LABELS: Record<VerdictKind, string> = {
  yes: "SIM",
  tight: "APERTADO",
  no: "NÃO",
};

export const DEFAULT_HOURS_LOOKUP: HoursLookupTable = {
  weekday: {
    low: { first: 4, second: 6 },
    medium: { first: 8, second: 10 },
    high: { first: 12, second: 14 },
  },
  weekend: {
    low: { first: 3, second: 4 },
    medium: { first: 6, second: 8 },
    high: { first: 10, second: 12 },
  },
  mixed: {
    low: { first: 4, second: 5 },
    medium: { first: 7, second: 9 },
    high: { first: 11, second: 13 },
  },
};

export const DEFAULT_CAPACITY_PROJECTION_SETTINGS: CapacityProjectionSettings = {
  abandonmentDays: 30,
  lookbackDays: 90,
  horizonMonths: 12,
  decisionHorizonMonths: 6,
  slackPercent: 10,
  weekendShareHigh: 0.7,
  weekendShareLow: 0.3,
  intensityLowMaxHoursPerMonth: 5,
  intensityHighMinHoursPerMonth: 10,
  weekdayAvgHoursPerDay: 5,
  weekendAvgHoursPerDay: 5,
  courseHours: { PP: 42, PC: 110, INVA: 15 },
  conversionPpToPc: 0.7,
  conversionPcToInva: 0.4,
  hoursLookup: DEFAULT_HOURS_LOOKUP,
  hoursLookupSource: "suggested",
  intakeTemplate: { course: "PP", calendar: "weekend", intensity: "medium" },
  excludedCrmStatusNames: ["Desistente", "Concluído", "Pausado"],
};

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function asCalendar(value: unknown, fallback: CalendarMode): CalendarMode {
  return CALENDAR_MODES.includes(value as CalendarMode) ? (value as CalendarMode) : fallback;
}

function asIntensity(value: unknown, fallback: IntensityLevel): IntensityLevel {
  return INTENSITY_LEVELS.includes(value as IntensityLevel) ? (value as IntensityLevel) : fallback;
}

function asRatedCourse(value: unknown, fallback: RatedCourseCode): RatedCourseCode {
  return RATED_COURSE_CODES.includes(value as RatedCourseCode) ? (value as RatedCourseCode) : fallback;
}

function asHalfHours(raw: unknown, fallback: HoursLookupHalf): HoursLookupHalf {
  const source = raw && typeof raw === "object" ? (raw as HoursLookupHalf) : fallback;
  return {
    first: clampNumber(source.first, 0, 80, fallback.first),
    second: clampNumber(source.second, 0, 80, fallback.second),
  };
}

function asLookupTable(raw: unknown): HoursLookupTable {
  const source = raw && typeof raw === "object" ? (raw as HoursLookupTable) : DEFAULT_HOURS_LOOKUP;
  const table = {} as HoursLookupTable;
  for (const calendar of CALENDAR_MODES) {
    const intensitySource = source[calendar] ?? DEFAULT_HOURS_LOOKUP[calendar];
    table[calendar] = {} as HoursLookupIntensity;
    for (const intensity of INTENSITY_LEVELS) {
      table[calendar][intensity] = asHalfHours(
        intensitySource?.[intensity],
        DEFAULT_HOURS_LOOKUP[calendar][intensity],
      );
    }
  }
  return table;
}

export function lookupMonthlyHours(
  table: HoursLookupTable,
  calendar: CalendarMode,
  intensity: IntensityLevel,
  half: CourseHalf,
): number {
  return table[calendar][intensity][half];
}

export function cloneHoursLookup(table: HoursLookupTable): HoursLookupTable {
  return asLookupTable(table);
}

export function normalizeCapacityProjectionSettings(
  input: unknown,
  fallbackAvgHoursPerDay?: number,
): CapacityProjectionSettings {
  const raw = rawObject(input) ? (input as Partial<CapacityProjectionSettings>) : {};
  const avgFallback = Number.isFinite(Number(fallbackAvgHoursPerDay)) && Number(fallbackAvgHoursPerDay) > 0
    ? Number(fallbackAvgHoursPerDay)
    : DEFAULT_CAPACITY_PROJECTION_SETTINGS.weekdayAvgHoursPerDay;
  const excluded = Array.isArray(raw.excludedCrmStatusNames)
    ? raw.excludedCrmStatusNames.map((name) => String(name).trim()).filter(Boolean).slice(0, 20)
    : DEFAULT_CAPACITY_PROJECTION_SETTINGS.excludedCrmStatusNames;
  const courseHoursRaw = (raw.courseHours && typeof raw.courseHours === "object"
    ? raw.courseHours
    : {}) as Partial<Record<RatedCourseCode, number>>;
  return {
    abandonmentDays: Math.round(clampNumber(raw.abandonmentDays, 7, 365, 30)),
    lookbackDays: Math.round(clampNumber(raw.lookbackDays, 30, 365, 90)),
    horizonMonths: Math.round(clampNumber(raw.horizonMonths, 3, 24, 12)),
    decisionHorizonMonths: Math.round(clampNumber(raw.decisionHorizonMonths, 1, 12, 6)),
    slackPercent: clampNumber(raw.slackPercent, 0, 50, 10),
    weekendShareHigh: clampNumber(raw.weekendShareHigh, 0.5, 1, 0.7),
    weekendShareLow: clampNumber(raw.weekendShareLow, 0, 0.5, 0.3),
    intensityLowMaxHoursPerMonth: clampNumber(raw.intensityLowMaxHoursPerMonth, 0.5, 40, 5),
    intensityHighMinHoursPerMonth: clampNumber(raw.intensityHighMinHoursPerMonth, 1, 80, 10),
    weekdayAvgHoursPerDay: clampNumber(raw.weekdayAvgHoursPerDay, 0.25, 16, avgFallback),
    weekendAvgHoursPerDay: clampNumber(raw.weekendAvgHoursPerDay, 0.25, 16, avgFallback),
    courseHours: {
      PP: clampNumber(courseHoursRaw.PP, 5, 200, 42),
      PC: clampNumber(courseHoursRaw.PC, 5, 300, 110),
      INVA: clampNumber(courseHoursRaw.INVA, 1, 80, 15),
    },
    conversionPpToPc: clampNumber(raw.conversionPpToPc, 0, 1, 0.7),
    conversionPcToInva: clampNumber(raw.conversionPcToInva, 0, 1, 0.4),
    hoursLookup: asLookupTable(raw.hoursLookup),
    hoursLookupSource: raw.hoursLookupSource === "custom" ? "custom" : "suggested",
    intakeTemplate: {
      course: asRatedCourse(raw.intakeTemplate?.course, "PP"),
      calendar: asCalendar(raw.intakeTemplate?.calendar, "weekend"),
      intensity: asIntensity(raw.intakeTemplate?.intensity, "medium"),
    },
    excludedCrmStatusNames: excluded.length ? excluded : DEFAULT_CAPACITY_PROJECTION_SETTINGS.excludedCrmStatusNames,
  };
}

function rawObject(value: unknown): value is object {
  return Boolean(value) && typeof value === "object";
}

export function isRatedCourse(course: CourseCode | null | undefined): course is RatedCourseCode {
  return course === "PP" || course === "PC" || course === "INVA";
}

export function projectionCourseCode(value: string | null | undefined): CourseCode | null {
  const source = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (!source.trim()) return null;
  if (/\binv\b|instrutor|inva/.test(source)) return "INVA";
  if (/\bpc\b|piloto comercial|comercial/.test(source)) return "PC";
  if (/\bpp\b|piloto privado|privado/.test(source)) return "PP";
  return null;
}
