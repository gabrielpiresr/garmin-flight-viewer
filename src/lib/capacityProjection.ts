import { effectiveDowntimeDays } from "./maintenanceRiskProjection.ts";
import {
  CALENDAR_LABELS,
  CALENDAR_MODES,
  COURSE_HALVES,
  COURSE_LABELS,
  DEFAULT_HOURS_LOOKUP,
  HALF_LABELS,
  isRatedCourse,
  INTENSITY_LABELS,
  INTENSITY_LEVELS,
  lookupMonthlyHours,
  projectionCourseCode,
  type Bucket,
  type CalendarMode,
  type CapacityAircraftInput,
  type CapacityMonthActual,
  type CapacityProjectionSettings,
  type CapacityStudentInput,
  type CapacityStudentOverride,
  type CourseCode,
  type CourseHalf,
  type HoursLookupTable,
  type HypotheticalIntake,
  type IntensityLevel,
  type RatedCourseCode,
  type TraceBlock,
  type TraceLine,
  type VerdictKind,
} from "../types/capacityProjection.ts";

export type StudentExclusionReason =
  | "inactive"
  | "abandoned"
  | "crm"
  | "track"
  | "override-excluded"
  | "paused"
  | "no-course";

export type ClassifiedStudent = {
  input: CapacityStudentInput;
  included: boolean;
  exclusionReason: StudentExclusionReason | null;
  exclusionLabel: string | null;
  suggestedCalendar: CalendarMode;
  suggestedIntensity: IntensityLevel;
  suggestedCourse: CourseCode | null;
  calendar: CalendarMode;
  intensity: IntensityLevel;
  course: CourseCode | null;
  half: CourseHalf;
  overridden: boolean;
  weekendShare: number;
  weekdayShare: number;
  hoursPerMonthWindow: number;
  remainingHours: number | null;
  rawRemainingHours: number | null;
  hoursAdjustment: number;
  monthlyRate: number;
  lookupCell: string;
  weight: number;
  virtual: boolean;
  sourceUserId: string | null;
  startMonth: string | null;
  flownForCourse: number;
  forecast: StudentMonthForecast[];
  finishMonth: string | null;
  finishLabel: string | null;
};

export type StudentMonthForecast = {
  month: string;
  label: string;
  hours: number;
  remainingAfter: number | null;
  course: CourseCode | null;
  event: string | null;
};

export type AircraftDayRow = {
  date: string;
  month: string;
  weekend: boolean;
  hours: number;
  grounded: boolean;
  theoreticalHours: number;
  maintenanceCode?: string;
  maintenanceTitle?: string;
  weekendExtended?: boolean;
};

export type AircraftMonthSupply = {
  month: string;
  weekdayHours: number;
  weekendHours: number;
  weekdayDays: number;
  weekendDays: number;
  groundedWeekdayDays: number;
  groundedWeekendDays: number;
  maintenances: Array<{ code: string; title: string; days: number; count: number }>;
  events: AircraftMaintenanceEvent[];
};

export type AircraftMaintenanceEvent = {
  code: string;
  title: string;
  intervalHours: number;
  hitDate: string;
  hitHours: number;
  shopDays: number;
  extraWeekendDays: number;
  days: number;
};

export type AircraftProjection = {
  aircraft: CapacityAircraftInput;
  days: AircraftDayRow[];
  months: AircraftMonthSupply[];
  events: AircraftMaintenanceEvent[];
  trace: TraceBlock;
};

export type MonthBucketDemandLine = {
  studentUserId: string;
  name: string;
  hours: number;
  cell: string;
  virtual: boolean;
  weight: number;
};

export type MonthProjection = {
  month: string;
  label: string;
  isCurrent: boolean;
  remainingFraction: number;
  supply: { weekday: number; weekend: number };
  demand: { weekday: number; weekend: number };
  balance: { weekday: number; weekend: number };
  slack: { weekday: number; weekend: number };
  actual: CapacityMonthActual | null;
  aircraft: AircraftMonthSupplyRollup[];
  demandLines: { weekday: MonthBucketDemandLine[]; weekend: MonthBucketDemandLine[] };
  finishedNames: string[];
  conversions: string[];
  trace: TraceBlock;
};

export type AircraftMonthSupplyRollup = AircraftMonthSupply & {
  registration: string;
};

export type CapacityVerdict = {
  kind: VerdictKind;
  headline: string;
  bottleneck: string | null;
  weekdayFit: number;
  weekendFit: number;
  mixedFit: number;
  trace: TraceBlock;
};

export type CapacityProjectionResult = {
  generatedAt: string;
  today: string;
  settings: CapacityProjectionSettings;
  students: ClassifiedStudent[];
  aircraft: AircraftProjection[];
  months: MonthProjection[];
  verdict: CapacityVerdict;
};

export type BuildCapacityProjectionParams = {
  today: string;
  settings: CapacityProjectionSettings;
  students: CapacityStudentInput[];
  aircraft: CapacityAircraftInput[];
  overrides?: CapacityStudentOverride[];
  actuals?: CapacityMonthActual[];
  hypothetical?: HypotheticalIntake | null;
};

function round1(value: number): number {
  return Number(value.toFixed(1));
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

export function formatHours(value: number): string {
  return `${round1(value)}h`;
}

export function addDaysIso(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function monthKey(isoDate: string): string {
  return String(isoDate).slice(0, 7);
}

export function monthLabel(month: string): string {
  const [year, mon] = month.split("-");
  const date = new Date(Number(year), Number(mon) - 1, 1);
  const label = date.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
  return label.replace(".", "");
}

export function isWeekendIso(isoDate: string): boolean {
  const day = new Date(`${isoDate}T12:00:00`).getDay();
  return day === 0 || day === 6;
}

export function daysInMonth(month: string): number {
  const [year, mon] = month.split("-").map(Number);
  return new Date(year, mon, 0).getDate();
}

export function monthStart(month: string): string {
  return `${month}-01`;
}

export function monthEnd(month: string): string {
  const last = daysInMonth(month);
  return `${month}-${String(last).padStart(2, "0")}`;
}

export function addMonths(month: string, count: number): string {
  const [year, mon] = month.split("-").map(Number);
  const date = new Date(year, mon - 1 + count, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function classifyCalendar(weekendShare: number, settings: CapacityProjectionSettings): CalendarMode {
  if (weekendShare >= settings.weekendShareHigh) return "weekend";
  if (weekendShare <= settings.weekendShareLow) return "weekday";
  return "mixed";
}

export function classifyIntensity(hoursPerMonth: number, settings: CapacityProjectionSettings): IntensityLevel {
  if (hoursPerMonth <= settings.intensityLowMaxHoursPerMonth) return "low";
  if (hoursPerMonth >= settings.intensityHighMinHoursPerMonth) return "high";
  return "medium";
}

export function classifyHalf(flownHours: number, courseHours: number): CourseHalf {
  if (!(courseHours > 0)) return "first";
  return flownHours / courseHours >= 0.5 ? "second" : "first";
}

export function hoursPerMonthFromWindow(windowHours: number, lookbackDays: number): number {
  const days = Math.max(1, lookbackDays);
  return windowHours * 30 / days;
}

export type CourseHoursFlight = {
  hours: number;
  trackId: string | null;
  trackName: string | null;
};

/** Horas do curso atual: não mistura PP na conta do PC. */
export function resolveCourseFlownHours(params: {
  careerHours: number;
  currentCourse: CourseCode | null;
  currentTrackId: string | null;
  flights: CourseHoursFlight[];
}): number {
  const career = Math.max(0, params.careerHours);
  if (!params.currentCourse || params.currentCourse === "HOBBY") return round1(career);
  let current = 0;
  let other = 0;
  for (const flight of params.flights) {
    if (!(flight.hours > 0)) continue;
    const flightCourse = projectionCourseCode(flight.trackName);
    const onCurrentTrack = Boolean(params.currentTrackId && flight.trackId && flight.trackId === params.currentTrackId);
    const onCurrentCourse = flightCourse === params.currentCourse;
    const onOtherCourse = Boolean(flightCourse && flightCourse !== params.currentCourse);
    if (onCurrentTrack || onCurrentCourse) current += flight.hours;
    else if (onOtherCourse) other += flight.hours;
  }
  if (current > 0.05) return round1(current);
  if (other > 0.05) return round1(Math.max(0, career - other));
  return round1(career);
}

function crmExcluded(name: string | null, settings: CapacityProjectionSettings): boolean {
  if (!name) return false;
  const haystack = normalizeName(name);
  return settings.excludedCrmStatusNames.some((item) => haystack.includes(normalizeName(item)));
}

function nextCourse(course: CourseCode | null): RatedCourseCode | null {
  if (course === "PP") return "PC";
  if (course === "PC") return "INVA";
  return null;
}

function conversionRate(course: CourseCode | null, settings: CapacityProjectionSettings): number {
  if (course === "PP") return settings.conversionPpToPc;
  if (course === "PC") return settings.conversionPcToInva;
  return 0;
}

function splitHours(total: number, calendar: CalendarMode, weekdayShare: number): { weekday: number; weekend: number } {
  if (calendar === "weekday") return { weekday: total, weekend: 0 };
  if (calendar === "weekend") return { weekday: 0, weekend: total };
  const weekday = total * weekdayShare;
  return { weekday, weekend: total - weekday };
}

function lookupCellLabel(calendar: CalendarMode, intensity: IntensityLevel, half: CourseHalf, hours: number): string {
  return `${CALENDAR_LABELS[calendar]} × ${INTENSITY_LABELS[intensity]} × ${HALF_LABELS[half]} = ${formatHours(hours)}`;
}

export function suggestHoursLookup(students: ClassifiedStudent[]): HoursLookupTable {
  const table = JSON.parse(JSON.stringify(DEFAULT_HOURS_LOOKUP)) as HoursLookupTable;
  for (const calendar of CALENDAR_MODES) {
    for (const intensity of INTENSITY_LEVELS) {
      for (const half of COURSE_HALVES) {
        const sample = students.filter(
          (student) =>
            student.included
            && !student.virtual
            && student.calendar === calendar
            && student.intensity === intensity
            && student.half === half
            && student.hoursPerMonthWindow > 0,
        );
        if (sample.length >= 2) {
          const avg = sample.reduce((sum, student) => sum + student.hoursPerMonthWindow, 0) / sample.length;
          table[calendar][intensity][half] = round1(avg);
        }
      }
    }
  }
  return table;
}

export function suggestIntensityBands(hoursPerMonth: number[]): { lowMax: number; highMin: number } {
  const values = hoursPerMonth.filter((value) => value > 0).sort((a, b) => a - b);
  if (values.length < 3) {
    return { lowMax: 5, highMin: 10 };
  }
  const tertile = (index: number) => values[Math.min(values.length - 1, Math.floor(values.length * index))];
  const lowMax = round1(Math.max(1, tertile(1 / 3)));
  const highMin = round1(Math.max(lowMax + 0.5, tertile(2 / 3)));
  return { lowMax, highMin };
}

function overrideFor(studentUserId: string, overrides: CapacityStudentOverride[]): CapacityStudentOverride | undefined {
  return overrides.find((item) => item.studentUserId === studentUserId);
}

export function classifyStudents(
  students: CapacityStudentInput[],
  settings: CapacityProjectionSettings,
  overrides: CapacityStudentOverride[],
  today: string,
): ClassifiedStudent[] {
  return students.map((input) => classifyOneStudent(input, settings, overrideFor(input.userId, overrides), today));
}

function classifyOneStudent(
  input: CapacityStudentInput,
  settings: CapacityProjectionSettings,
  override: CapacityStudentOverride | undefined,
  today: string,
  extras?: Partial<ClassifiedStudent>,
): ClassifiedStudent {
  const weekendShare = input.windowHours > 0 ? input.windowWeekendHours / input.windowHours : 0.5;
  const hoursPerMonthWindow = hoursPerMonthFromWindow(input.windowHours, settings.lookbackDays);
  const suggestedCourse = input.courseCode ?? projectionCourseCode(input.trackName);
  const suggestedCalendar = classifyCalendar(weekendShare, settings);
  const suggestedIntensity = classifyIntensity(hoursPerMonthWindow, settings);
  const course = override?.courseCode === "NONE" ? null : (override?.courseCode ?? suggestedCourse);
  const calendar = override?.calendarMode ?? suggestedCalendar;
  const intensity = override?.intensity ?? suggestedIntensity;
  const hoursAdjustment = Number.isFinite(override?.hoursAdjustment) ? Number(override?.hoursAdjustment) : 0;
  const courseTotal = isRatedCourse(course) ? settings.courseHours[course] : null;
  const flownForCourse = Number.isFinite(input.courseFlownHours) ? Number(input.courseFlownHours) : input.flownHours;
  const rawRemainingHours = courseTotal == null ? null : round1(courseTotal - flownForCourse);
  const remainingHours = rawRemainingHours == null ? null : Math.max(0, round1(rawRemainingHours + hoursAdjustment));
  const half = courseTotal == null ? "first" : classifyHalf(flownForCourse, courseTotal);
  const monthlyRate = lookupMonthlyHours(settings.hoursLookup, calendar, intensity, half);
  const weekdayShare = calendar === "mixed" ? (input.windowHours > 0 ? input.windowWeekdayHours / input.windowHours : 0.5) : calendar === "weekday" ? 1 : 0;

  let exclusionReason: StudentExclusionReason | null = null;
  let exclusionLabel: string | null = null;
  if (override?.excluded) {
    exclusionReason = "override-excluded";
    exclusionLabel = "Fora da projeção (ajuste manual)";
  } else if (override?.pausedUntil && override.pausedUntil >= today) {
    exclusionReason = "paused";
    exclusionLabel = `Pausado até ${override.pausedUntil}`;
  } else if (!input.isActive) {
    exclusionReason = "inactive";
    exclusionLabel = "Perfil inativo";
  } else if (crmExcluded(input.crmStatusName, settings)) {
    exclusionReason = "crm";
    exclusionLabel = `CRM ${input.crmStatusName}`;
  } else if (input.trackStatus === "completed" || input.trackStatus === "paused") {
    exclusionReason = "track";
    exclusionLabel = input.trackStatus === "completed" ? "Trilha concluída" : "Trilha pausada";
  } else if (input.daysSinceLastFlight != null && input.daysSinceLastFlight >= settings.abandonmentDays) {
    exclusionReason = "abandoned";
    exclusionLabel = `${input.daysSinceLastFlight} dias sem voar (corte = ${settings.abandonmentDays})`;
  } else if (!course) {
    exclusionReason = "no-course";
    exclusionLabel = "Sem curso — defina PP, PC, INVA ou Hobbie";
  }

  return {
    input,
    included: exclusionReason == null,
    exclusionReason,
    exclusionLabel,
    suggestedCalendar,
    suggestedIntensity,
    suggestedCourse,
    calendar,
    intensity,
    course,
    half,
    overridden: Boolean(override?.calendarMode || override?.intensity || override?.courseCode || hoursAdjustment),
    weekendShare,
    weekdayShare,
    hoursPerMonthWindow,
    remainingHours,
    rawRemainingHours,
    hoursAdjustment,
    monthlyRate,
    lookupCell: lookupCellLabel(calendar, intensity, half, monthlyRate),
    weight: 1,
    virtual: false,
    sourceUserId: null,
    startMonth: null,
    flownForCourse,
    forecast: [],
    finishMonth: null,
    finishLabel: null,
    ...extras,
  };
}

function nextDueHours(currentHours: number, intervalHours: number): number {
  if (!(intervalHours > 0)) return Number.POSITIVE_INFINITY;
  return (Math.floor(currentHours / intervalHours) + 1) * intervalHours;
}

/** 50H no marco da 100H/200H entra na inspeção maior — não gera parada extra. */
export function isCoveredByLargerInspection(
  dueHours: number,
  intervalHours: number,
  items: Array<{ intervalHours: number }>,
): boolean {
  return items.some((item) =>
    item.intervalHours > intervalHours
    && item.intervalHours % intervalHours === 0
    && Math.abs(dueHours % item.intervalHours) < 1e-6,
  );
}

function formatMaintenanceSummary(events: AircraftMaintenanceEvent[]): string {
  if (!events.length) return "";
  const byCode = new Map<string, { count: number; days: number }>();
  for (const event of events) {
    const current = byCode.get(event.code) ?? { count: 0, days: 0 };
    current.count += 1;
    current.days += event.days;
    byCode.set(event.code, current);
  }
  return [...byCode.entries()]
    .map(([code, item]) => `${code} ${item.count}× (${item.days}d)`)
    .join(", ");
}

export function projectAircraftSupply(
  aircraft: CapacityAircraftInput,
  settings: CapacityProjectionSettings,
  today: string,
  dayCount: number,
): AircraftProjection {
  const items = aircraft.maintenanceItems
    .filter((item) => item.intervalHours > 0 && (item.downtimeDays ?? 0) > 0)
    .map((item) => ({ ...item, downtimeDays: Math.max(1, Math.round(item.downtimeDays as number)) }))
    .sort((a, b) => b.intervalHours - a.intervalHours);

  const days: AircraftDayRow[] = [];
  const events: AircraftMaintenanceEvent[] = [];
  let hours = Number.isFinite(aircraft.currentHours) ? Number(aircraft.currentHours) : 0;
  let groundedRemaining = aircraft.groundedNow ? Math.max(1, aircraft.groundedDaysFromToday || 1) : 0;
  let activeItem = aircraft.groundedNow
    ? { code: "OS", title: aircraft.groundedReason || "OS aberta", intervalHours: 0, downtimeDays: groundedRemaining }
    : null;
  let weekendExtended = false;
  let activeEvent: AircraftMaintenanceEvent | null = aircraft.groundedNow
    ? {
        code: "OS",
        title: aircraft.groundedReason || "OS aberta",
        intervalHours: 0,
        hitDate: today,
        hitHours: round1(hours),
        shopDays: groundedRemaining,
        extraWeekendDays: 0,
        days: 0,
      }
    : null;

  for (let offset = 0; offset < dayCount; offset += 1) {
    const date = addDaysIso(today, offset);
    const weekend = isWeekendIso(date);
    const rate = weekend ? settings.weekendAvgHoursPerDay : settings.weekdayAvgHoursPerDay;
    if (groundedRemaining > 0 && activeItem) {
      days.push({
        date,
        month: monthKey(date),
        weekend,
        hours: 0,
        grounded: true,
        theoreticalHours: round1(hours),
        maintenanceCode: activeItem.code,
        maintenanceTitle: activeItem.title,
        weekendExtended: weekendExtended || undefined,
      });
      if (activeEvent) activeEvent.days += 1;
      groundedRemaining -= 1;
      if (groundedRemaining === 0) {
        if (activeEvent) events.push(activeEvent);
        activeEvent = null;
        activeItem = null;
        weekendExtended = false;
      }
      continue;
    }

    if (!(rate > 0) || aircraft.currentHours == null) {
      days.push({ date, month: monthKey(date), weekend, hours: 0, grounded: false, theoreticalHours: round1(hours) });
      continue;
    }

    const hoursBefore = hours;
    hours = Number((hours + rate).toFixed(4));
    const crossed = items
      .map((item) => ({ item, due: nextDueHours(hoursBefore, item.intervalHours) }))
      .filter(({ due }) => hoursBefore < due - 1e-9 && hours + 1e-9 >= due)
      .filter(({ item, due }) => !isCoveredByLargerInspection(due, item.intervalHours, items))
      .sort((a, b) => b.item.intervalHours - a.item.intervalHours)[0];

    if (crossed) {
      const shopDays = crossed.item.downtimeDays;
      const downtime = effectiveDowntimeDays(date, shopDays);
      weekendExtended = downtime > shopDays;
      groundedRemaining = downtime;
      activeItem = crossed.item;
      activeEvent = {
        code: crossed.item.code,
        title: crossed.item.title,
        intervalHours: crossed.item.intervalHours,
        hitDate: date,
        hitHours: round1(crossed.due),
        shopDays,
        extraWeekendDays: Math.max(0, downtime - shopDays),
        days: 0,
      };
      days.push({
        date,
        month: monthKey(date),
        weekend,
        hours: rate,
        grounded: false,
        theoreticalHours: round1(hours),
        maintenanceCode: crossed.item.code,
        maintenanceTitle: crossed.item.title,
        weekendExtended: weekendExtended || undefined,
      });
      continue;
    }

    days.push({ date, month: monthKey(date), weekend, hours: rate, grounded: false, theoreticalHours: round1(hours) });
  }

  if (activeEvent && activeEvent.days > 0) events.push(activeEvent);

  const months = rollupAircraftMonths(days, events);
  const totalHours = days.reduce((sum, day) => sum + day.hours, 0);
  const groundedDays = days.filter((day) => day.grounded).length;
  const trace: TraceBlock = {
    title: aircraft.registration,
    summary: `${formatHours(totalHours)} projetadas em ${dayCount} dias; ${groundedDays} dia(s) parado(s); ${events.length} inspeção(ões).`,
    lines: [
      { label: "TTAF atual", value: aircraft.currentHours == null ? "sem horas" : formatHours(aircraft.currentHours) },
      { label: "Taxa dia de semana", formula: "média configurada", value: `${settings.weekdayAvgHoursPerDay}h/dia` },
      { label: "Taxa FDS", formula: "média configurada", value: `${settings.weekendAvgHoursPerDay}h/dia` },
      { label: "Parado agora", value: aircraft.groundedNow ? (aircraft.groundedReason || "sim") : "não" },
      {
        label: "Inspeções no horizonte",
        formula: "50h no marco de 100h/200h entra na maior e não conta de novo",
        value: events.length ? formatMaintenanceSummary(events) : "nenhuma",
      },
    ],
  };

  return { aircraft, days, months, events, trace };
}

function rollupAircraftMonths(days: AircraftDayRow[], events: AircraftMaintenanceEvent[]): AircraftMonthSupply[] {
  const byMonth = new Map<string, AircraftMonthSupply>();
  for (const day of days) {
    const current = byMonth.get(day.month) ?? {
      month: day.month,
      weekdayHours: 0,
      weekendHours: 0,
      weekdayDays: 0,
      weekendDays: 0,
      groundedWeekdayDays: 0,
      groundedWeekendDays: 0,
      maintenances: [],
      events: [],
    };
    if (day.weekend) {
      current.weekendDays += 1;
      current.weekendHours += day.hours;
      if (day.grounded) current.groundedWeekendDays += 1;
    } else {
      current.weekdayDays += 1;
      current.weekdayHours += day.hours;
      if (day.grounded) current.groundedWeekdayDays += 1;
    }
    byMonth.set(day.month, current);
  }
  for (const event of events) {
    const month = monthKey(event.hitDate);
    const current = byMonth.get(month);
    if (!current) continue;
    current.events.push(event);
    const existing = current.maintenances.find((item) => item.code === event.code);
    if (existing) {
      existing.days += event.days;
      existing.count += 1;
    } else {
      current.maintenances.push({ code: event.code, title: event.title, days: event.days, count: 1 });
    }
  }
  return [...byMonth.values()].map((item) => ({
    ...item,
    weekdayHours: round1(item.weekdayHours),
    weekendHours: round1(item.weekendHours),
  }));
}

type DemandActor = {
  id: string;
  name: string;
  calendar: CalendarMode;
  intensity: IntensityLevel;
  course: CourseCode | null;
  flownHours: number;
  remainingHours: number | null;
  weekdayShare: number;
  weight: number;
  virtual: boolean;
  sourceUserId: string | null;
  startMonth: string | null;
  includedFrom: string;
};

function actorFromStudent(student: ClassifiedStudent, startMonth: string): DemandActor {
  return {
    id: student.input.userId,
    name: student.input.name || student.input.email || student.input.userId,
    calendar: student.calendar,
    intensity: student.intensity,
    course: student.course,
    flownHours: student.flownForCourse,
    remainingHours: student.remainingHours,
    weekdayShare: student.weekdayShare,
    weight: student.weight,
    virtual: student.virtual,
    sourceUserId: student.sourceUserId,
    startMonth: student.startMonth,
    includedFrom: startMonth,
  };
}

function monthFraction(month: string, today: string): number {
  if (month !== monthKey(today)) return 1;
  const end = monthEnd(month);
  const remainingDays = Math.max(1, Math.round((new Date(`${end}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86400000) + 1);
  return remainingDays / daysInMonth(month);
}

export function buildCapacityProjection(params: BuildCapacityProjectionParams): CapacityProjectionResult {
  const today = params.today;
  const settings = params.settings;
  const start = monthKey(today);
  const months = Array.from({ length: settings.horizonMonths }, (_, index) => addMonths(start, index));
  const lastDate = monthEnd(months[months.length - 1] ?? start);
  const dayCount = Math.max(1, Math.round((new Date(`${lastDate}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86400000) + 1);

  const classified = classifyStudents(params.students, settings, params.overrides ?? [], today);
  const aircraftProjections = params.aircraft
    .filter((item) => item.active && item.type === "aviao")
    .map((item) => projectAircraftSupply(item, settings, today, dayCount));

  const actors: DemandActor[] = classified
    .filter((student) => student.included)
    .map((student) => actorFromStudent(student, start));

  if (params.hypothetical && params.hypothetical.count > 0) {
    const hypoMonth = params.hypothetical.startMonth || start;
    for (let index = 0; index < params.hypothetical.count; index += 1) {
      const course = params.hypothetical.course;
      actors.push({
        id: `hypo-${index + 1}`,
        name: `Matrícula hipotética ${index + 1}`,
        calendar: params.hypothetical.calendar,
        intensity: params.hypothetical.intensity,
        course,
        flownHours: 0,
        remainingHours: isRatedCourse(course) ? settings.courseHours[course] : null,
        weekdayShare: params.hypothetical.calendar === "weekday" ? 1 : params.hypothetical.calendar === "weekend" ? 0 : 0.5,
        weight: 1,
        virtual: true,
        sourceUserId: null,
        startMonth: hypoMonth,
        includedFrom: hypoMonth,
      });
    }
  }

  const monthRows: MonthProjection[] = [];
  const liveActors = actors.map((actor) => ({ ...actor }));
  const forecastByActor = new Map<string, StudentMonthForecast[]>();

  function pushForecast(actorId: string, row: StudentMonthForecast) {
    const owner = actorId;
    const list = forecastByActor.get(owner) ?? [];
    list.push(row);
    forecastByActor.set(owner, list);
  }

  for (const month of months) {
    const fraction = monthFraction(month, today);
    const supply = { weekday: 0, weekend: 0 };
    const aircraft: AircraftMonthSupplyRollup[] = [];
    for (const projection of aircraftProjections) {
      const row = projection.months.find((item) => item.month === month);
      if (!row) continue;
      supply.weekday += row.weekdayHours;
      supply.weekend += row.weekendHours;
      aircraft.push({ ...row, registration: projection.aircraft.registration });
    }

    const demand = { weekday: 0, weekend: 0 };
    const demandLines: MonthProjection["demandLines"] = { weekday: [], weekend: [] };
    const finishedNames: string[] = [];
    const conversions: string[] = [];
    const spawned: DemandActor[] = [];

    for (const actor of liveActors) {
      if (actor.startMonth && actor.startMonth > month) continue;
      if (actor.remainingHours != null && actor.remainingHours <= 0.05) continue;
      const courseTotal = isRatedCourse(actor.course) ? settings.courseHours[actor.course] : null;
      const half = courseTotal == null ? "first" : classifyHalf(actor.flownHours, courseTotal);
      const rate = lookupMonthlyHours(settings.hoursLookup, actor.calendar, actor.intensity, half) * actor.weight * fraction;
      const consume = actor.remainingHours == null ? rate : Math.min(rate, actor.remainingHours);
      if (consume <= 0) continue;
      const split = splitHours(consume, actor.calendar, actor.weekdayShare);
      demand.weekday += split.weekday;
      demand.weekend += split.weekend;
      const cell = lookupCellLabel(actor.calendar, actor.intensity, half, lookupMonthlyHours(settings.hoursLookup, actor.calendar, actor.intensity, half));
      if (split.weekday > 0.05) {
        demandLines.weekday.push({
          studentUserId: actor.id,
          name: actor.name,
          hours: round1(split.weekday),
          cell,
          virtual: actor.virtual,
          weight: actor.weight,
        });
      }
      if (split.weekend > 0.05) {
        demandLines.weekend.push({
          studentUserId: actor.id,
          name: actor.name,
          hours: round1(split.weekend),
          cell,
          virtual: actor.virtual,
          weight: actor.weight,
        });
      }
      actor.flownHours += consume / Math.max(actor.weight, 0.0001);
      let event: string | null = actor.virtual && actor.startMonth === month && actor.course
        ? `Inicia ${COURSE_LABELS[actor.course]}`
        : null;
      if (actor.remainingHours != null) {
        actor.remainingHours = Math.max(0, actor.remainingHours - consume);
        if (actor.remainingHours <= 0.05) {
          finishedNames.push(actor.name);
          event = actor.course ? `Termina ${COURSE_LABELS[actor.course]}` : "Termina o curso";
          const next = nextCourse(actor.course);
          const ratePct = conversionRate(actor.course, settings);
          if (next && ratePct > 0) {
            const nextMonth = addMonths(month, 1);
            spawned.push({
              id: `conv-${actor.id}-${next}-${nextMonth}`,
              name: `${actor.name} → ${COURSE_LABELS[next]} (${Math.round(ratePct * 100)}%)`,
              calendar: actor.calendar,
              intensity: "medium",
              course: next,
              flownHours: 0,
              remainingHours: settings.courseHours[next] * ratePct,
              weekdayShare: actor.weekdayShare,
              weight: ratePct,
              virtual: true,
              sourceUserId: actor.sourceUserId ?? actor.id,
              startMonth: nextMonth,
              includedFrom: nextMonth,
            });
            conversions.push(`${actor.name} converte ${Math.round(ratePct * 100)}% para ${COURSE_LABELS[next]} em ${monthLabel(nextMonth)}`);
            event = `${event} · converte ${Math.round(ratePct * 100)}% para ${COURSE_LABELS[next]}`;
          }
        }
      }
      pushForecast(actor.sourceUserId || actor.id, {
        month,
        label: monthLabel(month),
        hours: round1(consume),
        remainingAfter: actor.remainingHours == null ? null : round1(actor.remainingHours),
        course: actor.course,
        event,
      });
    }
    liveActors.push(...spawned);

    const actual = params.actuals?.find((item) => item.month === month) ?? null;
    const balance = {
      weekday: round1(supply.weekday - demand.weekday),
      weekend: round1(supply.weekend - demand.weekend),
    };
    const slack = {
      weekday: round1(supply.weekday * (settings.slackPercent / 100)),
      weekend: round1(supply.weekend * (settings.slackPercent / 100)),
    };
    const topWeekday = [...demandLines.weekday].sort((a, b) => b.hours - a.hours);
    const topWeekend = [...demandLines.weekend].sort((a, b) => b.hours - a.hours);
    const aircraftFormulas = aircraft.map((item) => {
      const parts = [
        `${item.registration}: semana ${item.weekdayDays - item.groundedWeekdayDays}d × ${settings.weekdayAvgHoursPerDay}h`,
        `FDS ${item.weekendDays - item.groundedWeekendDays}d × ${settings.weekendAvgHoursPerDay}h`,
      ];
      const maintenance = formatMaintenanceSummary(item.events);
      if (maintenance) parts.push(`parada ${maintenance}`);
      return {
        label: item.registration,
        formula: parts.join(" · "),
        value: `${formatHours(item.weekdayHours + item.weekendHours)} (${formatHours(item.weekdayHours)} + ${formatHours(item.weekendHours)} FDS)`,
      };
    });

    monthRows.push({
      month,
      label: monthLabel(month),
      isCurrent: month === start,
      remainingFraction: round2(fraction),
      supply: { weekday: round1(supply.weekday), weekend: round1(supply.weekend) },
      demand: { weekday: round1(demand.weekday), weekend: round1(demand.weekend) },
      balance,
      slack,
      actual,
      aircraft,
      demandLines: { weekday: topWeekday, weekend: topWeekend },
      finishedNames,
      conversions,
      trace: {
        title: monthLabel(month),
        summary: `Saldo semana ${formatHours(balance.weekday)} · FDS ${formatHours(balance.weekend)}`,
        lines: [
          { label: "Oferta total", formula: "semana + FDS", value: formatHours(supply.weekday + supply.weekend) },
          { label: "Oferta semana", formula: "soma dos aviões (dias úteis × taxa − paradas)", value: formatHours(supply.weekday) },
          { label: "Oferta FDS", formula: "soma dos aviões (sáb/dom × taxa − paradas)", value: formatHours(supply.weekend) },
          { label: "Demanda total", formula: "semana + FDS", value: formatHours(demand.weekday + demand.weekend) },
          { label: "Demanda semana", formula: "soma dos alunos na célula da tabela", value: formatHours(demand.weekday) },
          { label: "Demanda FDS", formula: "soma dos alunos na célula da tabela", value: formatHours(demand.weekend) },
          { label: "Saldo", formula: "oferta − demanda", value: `${formatHours(round1((supply.weekday + supply.weekend) - (demand.weekday + demand.weekend)))} · semana ${formatHours(balance.weekday)} · FDS ${formatHours(balance.weekend)}` },
          { label: "Folga mínima", formula: `${settings.slackPercent}% da oferta`, value: `${formatHours(slack.weekday)} / ${formatHours(slack.weekend)} FDS` },
          ...(actual
            ? [{ label: "Realizado no mês", formula: "horas voadas de fato", value: `${formatHours(actual.weekdayHours)} / ${formatHours(actual.weekendHours)} FDS` }]
            : []),
          ...(fraction < 1
            ? [{ label: "Mês corrente", formula: "proporcional aos dias que ainda restam", value: `${Math.round(fraction * 100)}% do mês` }]
            : []),
          ...aircraftFormulas,
          ...(finishedNames.length ? [{ label: "Terminam neste mês", value: finishedNames.slice(0, 8).join(", ") }] : []),
          ...(conversions.length ? [{ label: "Conversões", value: conversions.slice(0, 6).join(" · ") }] : []),
        ],
      },
    });
  }

  for (const student of classified) {
    const forecast = forecastByActor.get(student.input.userId) ?? [];
    student.forecast = forecast;
    const finish = forecast.find((row) => row.event?.startsWith("Termina"));
    student.finishMonth = finish?.month ?? null;
    student.finishLabel = finish
      ? `${finish.event} em ${finish.label}`
      : student.included && student.remainingHours == null
        ? "Hobbie / sem data de término"
        : null;
  }

  const verdict = buildVerdict(monthRows, settings, start);
  return {
    generatedAt: new Date().toISOString(),
    today,
    settings,
    students: classified,
    aircraft: aircraftProjections,
    months: monthRows,
    verdict,
  };
}

function intakeHours(settings: CapacityProjectionSettings, calendar: CalendarMode): { weekday: number; weekend: number } {
  const rate = lookupMonthlyHours(settings.hoursLookup, calendar, settings.intakeTemplate.intensity, "first");
  return splitHours(rate, calendar, calendar === "mixed" ? 0.5 : calendar === "weekday" ? 1 : 0);
}

function countFit(months: MonthProjection[], settings: CapacityProjectionSettings, calendar: CalendarMode): number {
  const hours = intakeHours(settings, calendar);
  const horizon = months.slice(0, settings.decisionHorizonMonths);
  if (!horizon.length) return 0;
  let maxFit = 99;
  for (const month of horizon) {
    if (hours.weekday > 0) {
      const room = month.balance.weekday - month.slack.weekday;
      maxFit = Math.min(maxFit, Math.floor(Math.max(0, room) / hours.weekday));
    }
    if (hours.weekend > 0) {
      const room = month.balance.weekend - month.slack.weekend;
      maxFit = Math.min(maxFit, Math.floor(Math.max(0, room) / hours.weekend));
    }
  }
  return Math.max(0, maxFit);
}

function buildVerdict(months: MonthProjection[], settings: CapacityProjectionSettings, startMonth: string): CapacityVerdict {
  const horizon = months.slice(0, settings.decisionHorizonMonths);
  const weekdayFit = countFit(months, settings, "weekday");
  const weekendFit = countFit(months, settings, "weekend");
  const mixedFit = countFit(months, settings, "mixed");
  const templateFit = countFit(months, settings, settings.intakeTemplate.calendar);

  let kind: VerdictKind = "yes";
  let bottleneck: string | null = null;
  const negative = horizon.find((month) => month.balance.weekday < 0 || month.balance.weekend < 0);
  const tight = horizon.find((month) =>
    month.balance.weekday < month.slack.weekday || month.balance.weekend < month.slack.weekend,
  );

  if (negative) {
    kind = "no";
    const bucket: Bucket = negative.balance.weekend < 0 ? "weekend" : "weekday";
    const hours = bucket === "weekend" ? negative.balance.weekend : negative.balance.weekday;
    bottleneck = `${negative.label} ${bucket === "weekend" ? "FDS" : "semana"} ${formatHours(hours)}`;
  } else if (tight || templateFit < 1) {
    kind = "tight";
    if (tight) {
      const bucket: Bucket = tight.balance.weekend < tight.slack.weekend ? "weekend" : "weekday";
      bottleneck = `${tight.label} ${bucket === "weekend" ? "FDS" : "semana"} abaixo da folga`;
    } else {
      bottleneck = "Não cabe 1 aluno-tipo com a folga configurada";
    }
  }

  const firstHorizon = horizon[0];
  const intake = intakeHours(settings, settings.intakeTemplate.calendar);
  const limiting = [...horizon].sort((a, b) => {
    const aMin = Math.min(
      intake.weekday > 0 ? a.balance.weekday : Infinity,
      intake.weekend > 0 ? a.balance.weekend : Infinity,
    );
    const bMin = Math.min(
      intake.weekday > 0 ? b.balance.weekday : Infinity,
      intake.weekend > 0 ? b.balance.weekend : Infinity,
    );
    return aMin - bMin;
  })[0];

  const headline = kind === "yes"
    ? `Sim: cabem cerca de ${weekendFit} aluno(s) de FDS e ${weekdayFit} de semana.`
    : kind === "tight"
      ? `Apertado: o gargalo é ${bottleneck ?? "a folga"}.`
      : `Não: ${bottleneck ?? "há mês negativo no horizonte"}.`;

  const lines: TraceLine[] = [
    { label: "Horizonte da decisão", value: `${settings.decisionHorizonMonths} meses a partir de ${monthLabel(startMonth)}` },
    { label: "Folga", formula: "% da oferta que não deve ser preenchida", value: `${settings.slackPercent}%` },
    {
      label: "Aluno-tipo",
      formula: lookupCellLabel(settings.intakeTemplate.calendar, settings.intakeTemplate.intensity, "first", lookupMonthlyHours(settings.hoursLookup, settings.intakeTemplate.calendar, settings.intakeTemplate.intensity, "first")),
      value: `${COURSE_LABELS[settings.intakeTemplate.course]} · ${CALENDAR_LABELS[settings.intakeTemplate.calendar]}`,
    },
    { label: "Consumo do aluno-tipo", value: `${formatHours(intake.weekday)} semana / ${formatHours(intake.weekend)} FDS` },
    { label: "Cabem (semana)", formula: "menor saldo semana − folga, dividido pelo consumo", value: String(weekdayFit) },
    { label: "Cabem (FDS)", formula: "menor saldo FDS − folga, dividido pelo consumo", value: String(weekendFit) },
    { label: "Cabem (misto)", value: String(mixedFit) },
  ];
  if (firstHorizon) {
    lines.push({
      label: `${firstHorizon.label} (mês atual)`,
      formula: "oferta − demanda",
      value: `semana ${formatHours(firstHorizon.balance.weekday)} · FDS ${formatHours(firstHorizon.balance.weekend)}`,
    });
  }
  if (limiting) {
    lines.push({
      label: "Mês mais apertado",
      formula: "menor saldo do horizonte",
      value: `${limiting.label}: semana ${formatHours(limiting.balance.weekday)} · FDS ${formatHours(limiting.balance.weekend)}`,
    });
  }
  if (negative) {
    const bucket = negative.balance.weekend < 0 ? "FDS" : "semana";
    const supply = bucket === "FDS" ? negative.supply.weekend : negative.supply.weekday;
    const demand = bucket === "FDS" ? negative.demand.weekend : negative.demand.weekday;
    lines.push({
      label: "Conta do não",
      formula: `${bucket} em ${negative.label} = oferta − demanda`,
      value: `${formatHours(supply)} − ${formatHours(demand)} = ${formatHours(supply - demand)}`,
    });
  }

  return {
    kind,
    headline,
    bottleneck,
    weekdayFit,
    weekendFit,
    mixedFit,
    trace: {
      title: kind === "yes" ? "SIM" : kind === "tight" ? "APERTADO" : "NÃO",
      summary: headline,
      lines,
    },
  };
}

export function monthStudentHours(month: MonthProjection): MonthStudentHourRow[] {
  const byId = new Map<string, MonthStudentHourRow>();
  const add = (line: MonthBucketDemandLine, bucket: "weekday" | "weekend") => {
    const current = byId.get(line.studentUserId);
    if (current) {
      if (bucket === "weekday") current.weekdayHours += line.hours;
      else current.weekendHours += line.hours;
      current.hours = round1(current.weekdayHours + current.weekendHours);
      return;
    }
    byId.set(line.studentUserId, {
      studentUserId: line.studentUserId,
      name: line.name,
      hours: line.hours,
      weekdayHours: bucket === "weekday" ? line.hours : 0,
      weekendHours: bucket === "weekend" ? line.hours : 0,
      cell: line.cell,
      virtual: line.virtual,
    });
  };
  for (const line of month.demandLines.weekday) add(line, "weekday");
  for (const line of month.demandLines.weekend) add(line, "weekend");
  return [...byId.values()].sort((a, b) => b.hours - a.hours);
}

export type MonthStudentHourRow = {
  studentUserId: string;
  name: string;
  hours: number;
  weekdayHours: number;
  weekendHours: number;
  cell: string;
  virtual: boolean;
};

export function studentTrace(student: ClassifiedStudent, settings: CapacityProjectionSettings): TraceBlock {
  const input = student.input;
  const weekendPct = Math.round(student.weekendShare * 100);
  const lines: TraceLine[] = [
    { label: "Janela", formula: `${settings.lookbackDays} dias`, value: `${formatHours(input.windowWeekdayHours)} semana / ${formatHours(input.windowWeekendHours)} FDS` },
    { label: "Share FDS", formula: "horas FDS ÷ horas totais da janela", value: `${weekendPct}% → ${CALENDAR_LABELS[student.suggestedCalendar]}` },
    { label: "Intensidade sugerida", formula: `horas/mês = janela × 30 / ${settings.lookbackDays}`, value: `${formatHours(student.hoursPerMonthWindow)} → ${INTENSITY_LABELS[student.suggestedIntensity]}` },
    { label: "Curso", value: student.course ? COURSE_LABELS[student.course] : "sem curso" },
    { label: "Horas da carreira", value: formatHours(input.flownHours) },
    { label: "Horas neste curso", formula: "só a trilha atual (PP não conta no PC)", value: formatHours(student.flownForCourse) },
    { label: "Carga do curso", value: isRatedCourse(student.course) ? formatHours(settings.courseHours[student.course]) : student.course === "HOBBY" ? "Hobbie (sem carga)" : "—" },
    { label: "Restante bruto", value: student.rawRemainingHours == null ? "—" : formatHours(student.rawRemainingHours) },
    { label: "Ajuste de horas", formula: "soma ou subtrai do restante", value: `${student.hoursAdjustment > 0 ? "+" : ""}${formatHours(student.hoursAdjustment)}` },
    { label: "Restante na projeção", value: student.remainingHours == null ? (student.course === "HOBBY" ? "sem teto" : "sem carga") : formatHours(student.remainingHours) },
    ...(student.finishLabel ? [{ label: "Previsão de formação", value: student.finishLabel }] : []),
    { label: "Metade", value: HALF_LABELS[student.half] },
    { label: "Célula usada", value: student.lookupCell },
    { label: "Perfil efetivo", value: student.overridden ? "ajuste manual" : "sugestão automática" },
  ];
  if (student.exclusionLabel) {
    lines.unshift({ label: "Fora da projeção", value: student.exclusionLabel });
  }
  if (input.daysSinceLastFlight != null) {
    lines.push({ label: "Dias sem voar", formula: `corte de abandono = ${settings.abandonmentDays}`, value: String(input.daysSinceLastFlight) });
  }
  return {
    title: input.name || input.email,
    summary: student.included
      ? `${CALENDAR_LABELS[student.calendar]} · ${INTENSITY_LABELS[student.intensity]} · ${student.lookupCell}`
      : student.exclusionLabel || "Fora da projeção",
    lines,
    forecast: student.forecast,
    finishLabel: student.finishLabel,
  };
}

export function aircraftMonthTrace(projection: AircraftProjection, month: string, settings: CapacityProjectionSettings): TraceBlock {
  const row = projection.months.find((item) => item.month === month);
  const days = projection.days.filter((day) => day.month === month);
  const grounded = days.filter((day) => day.grounded);
  const lines: TraceLine[] = [
    { label: "Taxa semana", value: `${settings.weekdayAvgHoursPerDay}h/dia` },
    { label: "Taxa FDS", value: `${settings.weekendAvgHoursPerDay}h/dia` },
  ];
  if (row) {
    lines.push(
      { label: "Dias de semana voando", formula: `${row.weekdayDays} − ${row.groundedWeekdayDays} parado(s)`, value: `${row.weekdayDays - row.groundedWeekdayDays}d → ${formatHours(row.weekdayHours)}` },
      { label: "Dias de FDS voando", formula: `${row.weekendDays} − ${row.groundedWeekendDays} parado(s)`, value: `${row.weekendDays - row.groundedWeekendDays}d → ${formatHours(row.weekendHours)}` },
    );
    for (const event of row.events) {
      const extra = event.extraWeekendDays > 0 ? ` + ${event.extraWeekendDays}d FDS sem equipe` : "";
      lines.push({
        label: `${event.code} · ${event.hitDate}`,
        formula: `venceu em ${formatHours(event.hitHours)} · ${event.shopDays}d de oficina${extra}`,
        value: `${event.days} dia(s) parado(s) · 1 inspeção`,
      });
    }
  }
  const extended = grounded.find((day) => day.weekendExtended);
  if (extended) {
    lines.push({ label: "Domingo/sábado de oficina", formula: "effectiveDowntimeDays alonga +1", value: `parada em ${extended.date}` });
  }
  return {
    title: `${projection.aircraft.registration} · ${monthLabel(month)}`,
    summary: row ? `${formatHours(row.weekdayHours + row.weekendHours)} · ${row.groundedWeekdayDays + row.groundedWeekendDays}d parado` : "sem dados",
    lines,
  };
}
