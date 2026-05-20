import { Query } from "appwrite";
import {
  databases,
  isAppwriteConfigured,
  OP_WEEKS_COL_ID,
  SCHOOL_ID,
  WEEKLY_PLANS_COL_ID,
} from "./appwrite";
import { listAircrafts } from "./aircraftDb";
import { listAssignableInstructors, listStudentIdentitiesForSchedule } from "./rbac";
import { listAllSavedFlights, listScheduledFlightsForWeek, type SavedFlightListItem } from "./flightsDb";
import { getSchoolRules } from "./schoolRulesDb";
import type {
  AircraftWeekSupply,
  ExistingScheduledFlight,
  ScheduleWeekData,
  ScheduleWeekOption,
  StudentIdentity,
  StudentRequestDemand,
} from "../types/schedule";
import type { SlotState } from "../types/admin";
import type { UserRole } from "./rbac";
import { DEFAULT_SCHOOL_RULES } from "../types/schoolRules";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;
const schoolId = SCHOOL_ID ?? "escola_principal";

const AUTO_SOURCE_PREFIX = "auto-scale-";
const MANUAL_SOURCE_PREFIX = "manual-scale-";

type OpWeekDoc = {
  $id: string;
  week_start?: string;
  week_end?: string;
  aircraft_id?: string;
  schedule_closed_at?: string | null;
  daily_caps_json?: string | null;
  group_caps_json?: string | null;
  slots_json?: string | null;
};

type WeeklyPlanDoc = {
  $id: string;
  student_id?: string;
  week_start?: string;
  status?: string;
  items_json?: string | null;
};

type ParsedItem = {
  position: number;
  durationHours: number;
  flexibilityLevel: string;
  preferredAircraft: string | null;
  priorityLevel: number;
  notes: string | null;
  isNight?: boolean;
  availability: { dayOfWeek: number; period: "morning" | "afternoon" | "night"; availabilityType: "available" | "preferred" }[];
};

function isReady(): boolean {
  return Boolean(
    isAppwriteConfigured &&
      databases &&
      DB_ID &&
      OP_WEEKS_COL_ID &&
      WEEKLY_PLANS_COL_ID,
  );
}

function parsePlanItems(json: string | null | undefined): ParsedItem[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as ParsedItem[];
  } catch {
    return [];
  }
}

function isValidDemandItem(item: ParsedItem, minHours: number, maxHours: number): boolean {
  const duration = Number(item.durationHours);
  return (
    Number.isFinite(duration) &&
    duration >= minHours &&
    duration <= maxHours &&
    Math.abs(duration * 2 - Math.round(duration * 2)) <= 0.001 &&
    [1, 2, 3].includes(Number(item.priorityLevel)) &&
    ["low", "medium", "high"].includes(item.flexibilityLevel) &&
    Array.isArray(item.availability) &&
    item.availability.length > 0
  );
}

function getWeekMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Monday (ISO date) of the week that contains the given instant. */
export function getCurrentWeekStart(): string {
  return formatISO(getWeekMonday(new Date()));
}

export function pickDefaultScheduleWeek(weeks: ScheduleWeekOption[]): ScheduleWeekOption | null {
  if (weeks.length === 0) return null;
  const todayIso = new Date().toISOString().slice(0, 10);
  const currentMonday = getCurrentWeekStart();
  return (
    weeks.find((week) => week.weekStart === currentMonday) ??
    weeks.find((week) => week.weekStart <= todayIso && week.weekEnd >= todayIso) ??
    weeks[weeks.length - 1] ??
    null
  );
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function formatISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatWeekLabel(weekStart: string, weekEnd: string): string {
  const start = new Date(`${weekStart}T12:00:00`);
  const end = new Date(`${weekEnd}T12:00:00`);
  const dd = (d: Date) => d.getDate().toString().padStart(2, "0");
  const mm = (d: Date) => (d.getMonth() + 1).toString().padStart(2, "0");
  return `${dd(start)}/${mm(start)} - ${dd(end)}/${mm(end)} ${end.getFullYear()}`;
}

function isFutureWeek(weekStart: string, weekEnd?: string): boolean {
  const todayIso = new Date().toISOString().slice(0, 10);
  return (weekEnd || weekStart) >= todayIso;
}

function parseDailyCaps(json: string | null | undefined): Record<number, number> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json) as Record<string, number>;
    const caps: Record<number, number> = {};
    for (const [day, value] of Object.entries(parsed)) {
      caps[Number(day)] = Number(value);
    }
    return caps;
  } catch {
    return {};
  }
}

function parseGroupCaps(json: string | null | undefined): Array<{ maxHours: number; days: number[] }> {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as Array<{ maxHours: number; days: number[] }>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((cap) => ({
        maxHours: Number(cap.maxHours),
        days: Array.isArray(cap.days) ? cap.days.map(Number).filter((day) => Number.isInteger(day)) : [],
      }))
      .filter((cap) => Number.isFinite(cap.maxHours) && cap.maxHours >= 0 && cap.days.length > 0);
  } catch {
    return [];
  }
}

function parseSlotStates(json: string | null | undefined): Record<string, SlotState> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json) as Record<string, SlotState>;
    return parsed;
  } catch {
    return {};
  }
}

/** Same window as WeeklyConfigTab: 2 past weeks + current + 9 ahead (12 total). */
export const SCHEDULE_PICKER_WEEKS_BEFORE = 2;
export const SCHEDULE_PICKER_WEEKS_AHEAD = 9;

/** Fixed week list for schedule/disponibilidade pickers (not limited to DB rows). */
export function generateScheduleWeekPickerOptions(): ScheduleWeekOption[] {
  const monday = getWeekMonday(new Date());
  const weeks: ScheduleWeekOption[] = [];
  for (let i = -SCHEDULE_PICKER_WEEKS_BEFORE; i < SCHEDULE_PICKER_WEEKS_AHEAD + 1; i += 1) {
    const start = addDays(monday, i * 7);
    const end = addDays(start, 6);
    const weekStart = formatISO(start);
    const weekEnd = formatISO(end);
    weeks.push({
      weekStart,
      weekEnd,
      label: formatWeekLabel(weekStart, weekEnd),
      isClosed: false,
      scheduleClosedAt: null,
      isFuture: isFutureWeek(weekStart, weekEnd),
    });
  }
  return weeks;
}

function makeFallbackWeeks(): ScheduleWeekOption[] {
  return generateScheduleWeekPickerOptions();
}

async function loadWeekClosedMetadata(): Promise<
  Map<string, { isClosed: boolean; scheduleClosedAt: string | null }>
> {
  const map = new Map<string, { isClosed: boolean; scheduleClosedAt: string | null }>();
  if (!isReady() || !databases || !DB_ID || !OP_WEEKS_COL_ID) return map;

  const result = await databases
    .listDocuments(DB_ID, OP_WEEKS_COL_ID, [Query.orderDesc("week_start"), Query.limit(200)])
    .catch(() => null);
  if (!result) return map;

  for (const doc of result.documents as unknown as OpWeekDoc[]) {
    const weekStart = doc.week_start ?? "";
    if (!weekStart) continue;
    const scheduleClosedAt = doc.schedule_closed_at ?? null;
    const existing = map.get(weekStart);
    if (!existing) {
      map.set(weekStart, { isClosed: Boolean(scheduleClosedAt), scheduleClosedAt });
      continue;
    }
    map.set(weekStart, {
      isClosed: existing.isClosed || Boolean(scheduleClosedAt),
      scheduleClosedAt: existing.scheduleClosedAt ?? scheduleClosedAt,
    });
  }
  return map;
}

/** Picker options for Escala / Disponibilidades: full date range + closed flags from DB. */
export async function getScheduleWeekPickerOptions(): Promise<ScheduleWeekOption[]> {
  const base = generateScheduleWeekPickerOptions();
  const closedByStart = await loadWeekClosedMetadata();
  if (closedByStart.size === 0) return base;

  return base.map((week) => {
    const meta = closedByStart.get(week.weekStart);
    if (!meta) return week;
    return {
      ...week,
      isClosed: meta.isClosed,
      scheduleClosedAt: meta.scheduleClosedAt,
    };
  });
}

async function listPlansByWeek(weekStart: string): Promise<WeeklyPlanDoc[]> {
  if (!databases || !DB_ID || !WEEKLY_PLANS_COL_ID) return [];
  const res = await databases.listDocuments(DB_ID, WEEKLY_PLANS_COL_ID, [
    Query.equal("week_start", [weekStart]),
    Query.equal("status", ["submitted"]),
    Query.limit(200),
  ]);
  return res.documents as unknown as WeeklyPlanDoc[];
}


function resolveScheduleDemandId(row: SavedFlightListItem): string {
  if (row.schedule_demand_id) return row.schedule_demand_id;
  if (row.source_filename.startsWith(MANUAL_SOURCE_PREFIX)) return `manual-${row.id}`;
  return `legacy-${row.id}`;
}

function savedFlightToScheduledFlight(row: SavedFlightListItem): ExistingScheduledFlight | null {
  const studentId = row.student_user_id;
  const date = row.flight_date;
  if (!studentId || !date) return null;

  const durationHours =
    typeof row.duration_sec === "number" && row.duration_sec > 0 ? row.duration_sec / 3600 : 1;

  return {
    id: row.id,
    demandId: resolveScheduleDemandId(row),
    studentId,
    instructorId: row.instructor_user_id,
    instructorLabel: null,
    instructorAnac: null,
    aircraftRegistration: row.aircraft_ident,
    date,
    startTime: row.start_time?.trim() || "06:00",
    durationHours,
    isNight: row.is_night ?? false,
    sourceFilename: row.source_filename,
  };
}

async function listExistingGeneratedFlights(
  weekStart: string,
  viewer: { userId: string; role: UserRole },
): Promise<ExistingScheduledFlight[]> {
  let rows: SavedFlightListItem[] = [];
  const listed = await listScheduledFlightsForWeek(weekStart);
  if (listed.error) throw listed.error;
  rows = listed.data;

  if (rows.length === 0) {
    const { data } = await listAllSavedFlights(viewer);
    rows = (data ?? []).filter(
      (row) =>
        row.source_filename.startsWith(`${AUTO_SOURCE_PREFIX}${weekStart}`) ||
        row.source_filename.startsWith(`${MANUAL_SOURCE_PREFIX}${weekStart}`),
    );
  }

  const out: ExistingScheduledFlight[] = [];
  for (const row of rows) {
    const mapped = savedFlightToScheduledFlight(row);
    if (mapped) out.push(mapped);
  }
  return out;
}

export async function getScheduleWeekOptions(filters?: {
  onlyFuture?: boolean;
  excludeClosed?: boolean;
}): Promise<ScheduleWeekOption[]> {
  if (!isReady() || !databases || !DB_ID || !OP_WEEKS_COL_ID) return makeFallbackWeeks();

  const [weeksResult, submittedPlansResult] = await Promise.allSettled([
    databases.listDocuments(DB_ID, OP_WEEKS_COL_ID, [Query.orderDesc("week_start"), Query.limit(200)]),
    databases.listDocuments(DB_ID, WEEKLY_PLANS_COL_ID!, [
      Query.equal("status", ["submitted"]),
      Query.orderDesc("week_start"),
      Query.limit(200),
    ]),
  ]);

  const opWeekDocs =
    weeksResult.status === "fulfilled"
      ? (weeksResult.value.documents as unknown as OpWeekDoc[])
      : [];
  const submittedPlanDocs =
    submittedPlansResult.status === "fulfilled"
      ? (submittedPlansResult.value.documents as unknown as WeeklyPlanDoc[])
      : [];

  const map = new Map<string, ScheduleWeekOption>();
  for (const doc of opWeekDocs) {
    const weekStart = doc.week_start ?? "";
    const weekEnd = doc.week_end ?? "";
    if (!weekStart || !weekEnd) continue;
    const existing = map.get(weekStart);
    const scheduleClosedAt = doc.schedule_closed_at ?? existing?.scheduleClosedAt ?? null;
    const next: ScheduleWeekOption = {
      weekStart,
      weekEnd,
      label: formatWeekLabel(weekStart, weekEnd),
      isClosed: Boolean(scheduleClosedAt),
      scheduleClosedAt,
      isFuture: isFutureWeek(weekStart, weekEnd),
    };
    if (!existing) {
      map.set(weekStart, next);
      continue;
    }
    map.set(weekStart, {
      ...existing,
      weekEnd: next.weekEnd,
      label: next.label,
      isClosed: existing.isClosed || next.isClosed,
      scheduleClosedAt: existing.scheduleClosedAt ?? next.scheduleClosedAt,
      isFuture: next.isFuture,
    });
  }

  for (const doc of submittedPlanDocs) {
    const weekStart = doc.week_start ?? "";
    if (!weekStart) continue;
    if (map.has(weekStart)) continue;
    const start = new Date(`${weekStart}T12:00:00`);
    const end = addDays(start, 6);
    const weekEnd = formatISO(end);
    map.set(weekStart, {
      weekStart,
      weekEnd,
      label: formatWeekLabel(weekStart, weekEnd),
      isClosed: false,
      scheduleClosedAt: null,
      isFuture: isFutureWeek(weekStart, weekEnd),
    });
  }

  const allWeeks = [...map.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  const weeks = allWeeks
    .filter((week) => (filters?.onlyFuture ? week.isFuture : true))
    .filter((week) => (filters?.excludeClosed ? !week.isClosed : true));

  if (weeks.length > 0) return weeks;
  if (allWeeks.length > 0) return allWeeks;
  return makeFallbackWeeks();
}

export type ScheduleWeekDataScope = "full" | "flights-only";

function buildWeekOptionFromStart(weekStart: string): ScheduleWeekOption {
  const start = new Date(`${weekStart}T12:00:00`);
  const end = addDays(start, 6);
  const weekEnd = formatISO(end);
  return {
    weekStart,
    weekEnd,
    label: formatWeekLabel(weekStart, weekEnd),
    isClosed: false,
    scheduleClosedAt: null,
    isFuture: isFutureWeek(weekStart, weekEnd),
  };
}

export async function getScheduleWeekData(params: {
  weekStart: string;
  actorUserId: string;
  actorRole: UserRole;
  scope?: ScheduleWeekDataScope;
  week?: ScheduleWeekOption;
}): Promise<ScheduleWeekData> {
  const scope = params.scope ?? "full";
  const pickedWeek =
    params.week ??
    (await getScheduleWeekOptions()).find((week) => week.weekStart === params.weekStart) ??
    buildWeekOptionFromStart(params.weekStart);

  if (!isReady() || !databases || !DB_ID || !OP_WEEKS_COL_ID) {
    return {
      week: pickedWeek,
      supplies: [],
      demands: [],
      students: [],
      instructors: [],
      existingGeneratedFlights: [],
    };
  }

  const loadPlans = scope === "full";
  const [rules, aircrafts, studentIdentities, instructors, opWeeksRes, planDocs, existingGeneratedFlights] =
    await Promise.all([
      getSchoolRules().catch(() => DEFAULT_SCHOOL_RULES),
      listAircrafts(schoolId),
      listStudentIdentitiesForSchedule(params.actorUserId),
      listAssignableInstructors(params.actorRole),
      databases.listDocuments(DB_ID, OP_WEEKS_COL_ID, [
        Query.equal("week_start", [params.weekStart]),
        Query.limit(200),
      ]),
      loadPlans ? listPlansByWeek(params.weekStart) : Promise.resolve([] as WeeklyPlanDoc[]),
      listExistingGeneratedFlights(params.weekStart, { userId: params.actorUserId, role: params.actorRole }),
    ]);

  const aircraftMap = new Map(aircrafts.map((aircraft) => [aircraft.id, aircraft]));
  const identityByUserId = new Map(studentIdentities.map((student) => [student.userId, student]));

  for (const flight of existingGeneratedFlights) {
    if (!identityByUserId.has(flight.studentId)) {
      identityByUserId.set(flight.studentId, {
        userId: flight.studentId,
        label: flight.studentId,
        email: null,
        anacCode: null,
        weightKg: null,
        heightCm: null,
      });
    }
  }

  for (const plan of planDocs) {
    const studentId = plan.student_id ?? "";
    if (studentId && !identityByUserId.has(studentId)) {
      identityByUserId.set(studentId, {
        userId: studentId,
        label: studentId,
        email: null,
        anacCode: null,
        weightKg: null,
        heightCm: null,
      });
    }
  }

  const supplies: AircraftWeekSupply[] = (opWeeksRes.documents as unknown as OpWeekDoc[]).map((doc) => {
    const registration =
      aircraftMap.get(doc.aircraft_id ?? "")?.registration ??
      aircraftMap.get(doc.aircraft_id ?? "")?.nickname ??
      "Aeronave";

    return {
      aircraftId: doc.aircraft_id ?? "",
      aircraftModelId: aircraftMap.get(doc.aircraft_id ?? "")?.model_id ?? "",
      aircraftRegistration: registration,
      aircraftImageUrl: aircraftMap.get(doc.aircraft_id ?? "")?.image_url ?? null,
      dailyCaps: parseDailyCaps(doc.daily_caps_json),
      groupCaps: parseGroupCaps(doc.group_caps_json),
      slotStates: parseSlotStates(doc.slots_json),
    };
  });

  const demands: StudentRequestDemand[] = [];
  if (loadPlans) {
    for (const plan of planDocs) {
      const studentId = plan.student_id ?? "";
      const identity = identityByUserId.get(studentId);
      const studentLabel = identity?.label || studentId;
      const parsedItems = parsePlanItems(plan.items_json);
      for (const item of parsedItems.filter((entry) =>
        isValidDemandItem(entry, rules.schedule.minRequestHours, rules.schedule.maxRequestHours),
      )) {
        demands.push({
          demandId: `${plan.$id}-${item.position}`,
          studentId,
          studentLabel,
          weekStart: params.weekStart,
          durationHours: item.durationHours ?? 1,
          priorityLevel: (item.priorityLevel ?? 2) as 1 | 2 | 3,
          flexibilityLevel: (item.flexibilityLevel ?? "medium") as "low" | "medium" | "high",
          preferredModelId: item.preferredAircraft ?? null,
          isNight: item.isNight ?? false,
          availability: item.availability.map((a) => ({
            dayOfWeek: a.dayOfWeek,
            period: a.period,
            availabilityType: a.availabilityType,
          })),
          notes: item.notes ?? null,
        });
      }
    }
  }

  const students: StudentIdentity[] = [...identityByUserId.values()].map((identity) => ({
    userId: identity.userId,
    label: identity.label,
    email: identity.email,
    anacCode: identity.anacCode,
    weightKg: identity.weightKg,
    heightCm: identity.heightCm,
  }));

  return {
    week: pickedWeek,
    supplies,
    demands,
    students,
    instructors,
    existingGeneratedFlights,
  };
}

export { AUTO_SOURCE_PREFIX, MANUAL_SOURCE_PREFIX };
