import { Query } from "appwrite";
import {
  CAPACITY_STUDENT_PROFILES_COL_ID,
  DEFAULT_SCHOOL_ID,
  ID,
  Permission,
  Role,
  databases,
  isAppwriteConfigured,
} from "./appwrite";
import { getSchoolRules, saveSchoolRules } from "./schoolRulesDb";
import {
  normalizeCapacityProjectionSettings,
  type CalendarMode,
  type CapacityProjectionSettings,
  type CapacityStudentOverride,
  type CourseCode,
  type IntensityLevel,
} from "../types/capacityProjection";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

type OverrideDoc = {
  $id: string;
  student_user_id?: string;
  calendar_mode?: string | null;
  intensity?: string | null;
  course_code?: string | null;
  hours_adjustment?: number | null;
  excluded?: boolean;
  paused_until?: string | null;
  notes?: string;
};

function isReady(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && CAPACITY_STUDENT_PROFILES_COL_ID);
}

function asCalendar(value: string | null | undefined): CalendarMode | null {
  return value === "weekday" || value === "weekend" || value === "mixed" ? value : null;
}

function asIntensity(value: string | null | undefined): IntensityLevel | null {
  return value === "low" || value === "medium" || value === "high" ? value : null;
}

function asCourse(value: string | null | undefined): CourseCode | "NONE" | null {
  return value === "PP" || value === "PC" || value === "INVA" || value === "HOBBY" || value === "NONE" ? value : null;
}

function toOverride(doc: OverrideDoc): CapacityStudentOverride {
  return {
    id: doc.$id,
    studentUserId: doc.student_user_id || "",
    calendarMode: asCalendar(doc.calendar_mode),
    intensity: asIntensity(doc.intensity),
    courseCode: asCourse(doc.course_code),
    hoursAdjustment: Number.isFinite(Number(doc.hours_adjustment)) ? Number(doc.hours_adjustment) : 0,
    excluded: Boolean(doc.excluded),
    pausedUntil: doc.paused_until ? String(doc.paused_until).slice(0, 10) : null,
    notes: doc.notes || "",
  };
}

export async function listCapacityStudentOverrides(): Promise<CapacityStudentOverride[]> {
  if (!isReady() || !databases || !DB_ID || !CAPACITY_STUDENT_PROFILES_COL_ID) return [];
  try {
    const rows: CapacityStudentOverride[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 20; page += 1) {
      const result = await databases.listDocuments(DB_ID, CAPACITY_STUDENT_PROFILES_COL_ID, [
        Query.equal("school_id", [DEFAULT_SCHOOL_ID]),
        Query.limit(100),
        ...(cursor ? [Query.cursorAfter(cursor)] : []),
      ]);
      rows.push(...result.documents.map((doc) => toOverride(doc as unknown as OverrideDoc)));
      if (result.documents.length < 100) break;
      cursor = result.documents[result.documents.length - 1]?.$id;
      if (!cursor) break;
    }
    return rows;
  } catch {
    return [];
  }
}

export async function saveCapacityStudentOverride(input: {
  studentUserId: string;
  calendarMode: CalendarMode | null;
  intensity: IntensityLevel | null;
  courseCode: CourseCode | "NONE" | null;
  hoursAdjustment?: number;
  excluded: boolean;
  pausedUntil: string | null;
  notes?: string;
}): Promise<CapacityStudentOverride | null> {
  if (!isReady() || !databases || !DB_ID || !CAPACITY_STUDENT_PROFILES_COL_ID) return null;
  const payload = {
    school_id: DEFAULT_SCHOOL_ID,
    student_user_id: input.studentUserId,
    calendar_mode: input.calendarMode,
    intensity: input.intensity,
    course_code: input.courseCode,
    hours_adjustment: Number.isFinite(input.hoursAdjustment) ? Number(input.hoursAdjustment) : 0,
    excluded: input.excluded,
    paused_until: input.pausedUntil,
    notes: input.notes ?? "",
  };
  const existing = await databases.listDocuments(DB_ID, CAPACITY_STUDENT_PROFILES_COL_ID, [
    Query.equal("student_user_id", [input.studentUserId]),
    Query.limit(1),
  ]).catch(() => ({ documents: [] as Array<{ $id: string }> }));
  const current = existing.documents[0];
  const perms = [
    Permission.read(Role.label("admin")),
    Permission.update(Role.label("admin")),
    Permission.delete(Role.label("admin")),
  ];
  try {
    const doc = current
      ? await databases.updateDocument(DB_ID, CAPACITY_STUDENT_PROFILES_COL_ID, current.$id, payload)
      : await databases.createDocument(DB_ID, CAPACITY_STUDENT_PROFILES_COL_ID, ID.unique(), payload, perms);
    return toOverride(doc as unknown as OverrideDoc);
  } catch {
    const { hours_adjustment: _ignored, ...withoutAdjustment } = payload;
    const doc = current
      ? await databases.updateDocument(DB_ID, CAPACITY_STUDENT_PROFILES_COL_ID, current.$id, withoutAdjustment)
      : await databases.createDocument(DB_ID, CAPACITY_STUDENT_PROFILES_COL_ID, ID.unique(), withoutAdjustment, perms);
    return { ...toOverride(doc as unknown as OverrideDoc), hoursAdjustment: Number(input.hoursAdjustment) || 0 };
  }
}

export async function clearCapacityStudentOverride(studentUserId: string): Promise<void> {
  if (!isReady() || !databases || !DB_ID || !CAPACITY_STUDENT_PROFILES_COL_ID) return;
  const existing = await databases.listDocuments(DB_ID, CAPACITY_STUDENT_PROFILES_COL_ID, [
    Query.equal("student_user_id", [studentUserId]),
    Query.limit(1),
  ]).catch(() => ({ documents: [] as Array<{ $id: string }> }));
  const current = existing.documents[0];
  if (current) await databases.deleteDocument(DB_ID, CAPACITY_STUDENT_PROFILES_COL_ID, current.$id);
}

export async function saveCapacityProjectionSettings(settings: CapacityProjectionSettings): Promise<CapacityProjectionSettings> {
  const rules = await getSchoolRules();
  const saved = await saveSchoolRules({ ...rules, capacityProjection: settings });
  return saved.capacityProjection;
}

export function settingsFromRules(
  rules: { capacityProjection?: CapacityProjectionSettings; schedule?: { maintenanceAvgHoursPerDay?: number } } | null,
): CapacityProjectionSettings {
  return normalizeCapacityProjectionSettings(rules?.capacityProjection, rules?.schedule?.maintenanceAvgHoursPerDay);
}
