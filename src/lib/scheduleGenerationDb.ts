import { Query } from "appwrite";
import { decodeFlightRecord } from "./flightRecordCodec";
import {
  databases,
  isAppwriteConfigured,
  OP_WEEKS_COL_ID,
  SCHOOL_ID,
  WEEKLY_PLANS_COL_ID,
} from "./appwrite";
import { listAircrafts } from "./aircraftDb";
import { getProfile, listAssignableInstructors, listAssignableStudents } from "./rbac";
import { getSavedFlight, listSavedFlights } from "./flightsDb";
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
  availability: { dayOfWeek: number; period: "morning" | "afternoon"; availabilityType: "available" | "preferred" }[];
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

function getWeekMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
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

function isFutureWeek(weekStart: string): boolean {
  const todayIso = new Date().toISOString().slice(0, 10);
  return weekStart > todayIso;
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

function parseSlotStates(json: string | null | undefined): Record<string, SlotState> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json) as Record<string, SlotState>;
    return parsed;
  } catch {
    return {};
  }
}

function makeFallbackWeeks(): ScheduleWeekOption[] {
  const monday = getWeekMonday(new Date());
  const weeks: ScheduleWeekOption[] = [];
  for (let i = -1; i < 8; i += 1) {
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
      isFuture: isFutureWeek(weekStart),
    });
  }
  return weeks;
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


function parseDemandMarker(metaText: string | undefined): string | null {
  if (!metaText) return null;
  const marker = metaText
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("demand:"));
  if (!marker) return null;
  return marker.slice("demand:".length).trim() || null;
}

function getScheduleDemandId(meta: NonNullable<ReturnType<typeof decodeFlightRecord>["meta"]>, weekStart: string): string | null {
  if (meta.schedule?.weekStart === weekStart && meta.schedule.demandId) return meta.schedule.demandId;
  if (!meta.preFlight.objectiveMd.includes(`week:${weekStart}`)) return null;
  return parseDemandMarker(meta.preFlight.objectiveMd);
}

function parseDurationFromFlightTime(flightTime: string | undefined): number {
  if (!flightTime) return 1;
  const [hh, mm] = flightTime.split(":");
  const hours = Number(hh);
  const minutes = Number(mm);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 1;
  return Math.max(0.5, hours + minutes / 60);
}

async function listExistingGeneratedFlights(
  weekStart: string,
  viewer: { userId: string; role: UserRole },
): Promise<ExistingScheduledFlight[]> {
  const { data } = await listSavedFlights(viewer);
  if (!data || data.length === 0) return [];
  const candidateRows = data.filter((row) =>
    row.source_filename.startsWith(`${AUTO_SOURCE_PREFIX}${weekStart}`) ||
    row.source_filename.startsWith(`${MANUAL_SOURCE_PREFIX}${weekStart}`),
  );
  if (candidateRows.length === 0) return [];

  const out: ExistingScheduledFlight[] = [];
  for (const row of candidateRows) {
    const full = await getSavedFlight(row.id);
    if (!full.data) continue;
    const decoded = decodeFlightRecord(full.data.csv_text);
    const meta = decoded.meta;
    if (!meta) continue;

    const demandId = getScheduleDemandId(meta, weekStart);
    if (!demandId) continue;

    const durationHours =
      (typeof row.duration_sec === "number" && row.duration_sec > 0 ? row.duration_sec / 3600 : null) ??
      parseDurationFromFlightTime(meta.legs[0]?.flightTime);

    out.push({
      id: row.id,
      demandId,
      studentId: meta.header.studentUserId,
      instructorId: full.data.instructor_user_id ?? row.instructor_user_id ?? null,
      instructorLabel: meta.header.instructorName ?? null,
      instructorAnac: meta.header.instructorAnac ?? null,
      aircraftRegistration: row.aircraft_ident,
      date: meta.header.date,
      startTime: meta.header.startTime ?? "06:00",
      durationHours,
      name: row.name,
      sourceFilename: row.source_filename,
    });
  }
  return out;
}

export async function getScheduleWeekOptions(filters?: {
  onlyFuture?: boolean;
  excludeClosed?: boolean;
}): Promise<ScheduleWeekOption[]> {
  if (!isReady() || !databases || !DB_ID || !OP_WEEKS_COL_ID) return makeFallbackWeeks();

  const [weeksRes, submittedPlansRes] = await Promise.all([
    databases.listDocuments(DB_ID, OP_WEEKS_COL_ID, [Query.orderDesc("week_start"), Query.limit(200)]),
    databases.listDocuments(DB_ID, WEEKLY_PLANS_COL_ID!, [
      Query.equal("status", ["submitted"]),
      Query.orderDesc("week_start"),
      Query.limit(200),
    ]),
  ]);

  const map = new Map<string, ScheduleWeekOption>();
  for (const doc of weeksRes.documents as unknown as OpWeekDoc[]) {
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
      isFuture: isFutureWeek(weekStart),
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

  for (const doc of submittedPlansRes.documents as unknown as WeeklyPlanDoc[]) {
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
      isFuture: isFutureWeek(weekStart),
    });
  }

  const weeks = [...map.values()]
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .filter((week) => (filters?.onlyFuture ? week.isFuture : true))
    .filter((week) => (filters?.excludeClosed ? !week.isClosed : true));

  if (weeks.length > 0) return weeks;
  if (filters?.onlyFuture || filters?.excludeClosed) return [];
  return makeFallbackWeeks();
}

export async function getScheduleWeekData(params: {
  weekStart: string;
  actorUserId: string;
  actorRole: UserRole;
}): Promise<ScheduleWeekData> {
  const weeks = await getScheduleWeekOptions();
  const pickedWeek = weeks.find((week) => week.weekStart === params.weekStart);
  if (!pickedWeek) {
    throw new Error("Semana inválida.");
  }

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

  const [aircrafts, studentsOptions, instructors, opWeeksRes, planDocs, existingGeneratedFlights] = await Promise.all([
    listAircrafts(schoolId),
    listAssignableStudents(params.actorUserId, params.actorRole),
    listAssignableInstructors(params.actorRole),
    databases.listDocuments(DB_ID, OP_WEEKS_COL_ID, [
      Query.equal("week_start", [params.weekStart]),
      Query.limit(200),
    ]),
    listPlansByWeek(params.weekStart),
    listExistingGeneratedFlights(params.weekStart, { userId: params.actorUserId, role: params.actorRole }),
  ]);

  const aircraftMap = new Map(aircrafts.map((aircraft) => [aircraft.id, aircraft]));
  const studentsMap = new Map(studentsOptions.map((student) => [student.userId, student.email]));
  const uniqueStudentIds = [
    ...new Set(
      [
        ...studentsOptions.map((student) => student.userId),
        ...planDocs.map((plan) => plan.student_id ?? ""),
      ].filter((id) => id.length > 0),
    ),
  ];
  const profilePairs = await Promise.all(
    uniqueStudentIds.map(async (studentId) => {
      const profile = await getProfile(studentId);
      return [studentId, profile.data] as const;
    }),
  );
  const profileMap = new Map(profilePairs);
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
      slotStates: parseSlotStates(doc.slots_json),
    };
  });

  const demands: StudentRequestDemand[] = [];
  for (const plan of planDocs) {
    const studentId = plan.student_id ?? "";
    const profile = profileMap.get(studentId);
    const studentLabel =
      profile?.fullName?.trim() ||
      studentsMap.get(studentId) ||
      studentId;
    const parsedItems = parsePlanItems(plan.items_json);
    for (const item of parsedItems) {
      demands.push({
        demandId: `${plan.$id}-${item.position}`,
        studentId,
        studentLabel,
        weekStart: params.weekStart,
        durationHours: item.durationHours ?? 1,
        priorityLevel: (item.priorityLevel ?? 2) as 1 | 2 | 3,
        flexibilityLevel: (item.flexibilityLevel ?? "medium") as "low" | "medium" | "high",
        preferredModelId: item.preferredAircraft ?? null,
        availability: item.availability.map((a) => ({
          dayOfWeek: a.dayOfWeek,
          period: a.period,
          availabilityType: a.availabilityType,
        })),
        notes: item.notes ?? null,
      });
    }
  }

  const students: StudentIdentity[] = uniqueStudentIds
    .filter((studentId) => studentId.length > 0)
    .map((studentId) => ({
      userId: studentId,
      label:
        profileMap.get(studentId)?.fullName?.trim() ||
        studentsMap.get(studentId) ||
        studentId,
      email: profileMap.get(studentId)?.email || studentsMap.get(studentId) || null,
      anacCode: profileMap.get(studentId)?.anacCode || null,
      weightKg: profileMap.get(studentId)?.weightKg ?? null,
      heightCm: profileMap.get(studentId)?.heightCm ?? null,
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
