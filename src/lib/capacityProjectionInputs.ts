import { listAllSavedFlights, type SavedFlightListItem } from "./flightsDb";
import { getAdminStudentsProgress, type CapacityProjectionInputs } from "./adminUsersDb";
import { isWeekendIso, resolveCourseFlownHours } from "./capacityProjection";
import { listStudentCrmProfiles } from "./studentAutomationsDb";
import { projectionCourseCode, type CapacityMonthActual, type CapacityStudentInput } from "../types/capacityProjection";

function shiftIso(today: string, days: number): string {
  const date = new Date(`${today}T12:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function flightHours(flight: SavedFlightListItem): number {
  if ((flight.duration_sec || 0) > 0) return (flight.duration_sec || 0) / 3600;
  if ((flight.total_flight_minutes || 0) > 0) return (flight.total_flight_minutes || 0) / 60;
  if ((flight.block_time_minutes || 0) > 0) return (flight.block_time_minutes || 0) / 60;
  return 0;
}

function isExecutedFlight(flight: SavedFlightListItem, today: string): boolean {
  if (flight.flight_status === "Cancelado" || flight.flight_status === "Previsto") return false;
  const date = (flight.flight_date || "").slice(0, 10);
  if (!date || date > today) return false;
  return flightHours(flight) > 0;
}

function round1(value: number): number {
  return Number(value.toFixed(1));
}

function snapshotTrackName(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { trackName?: string };
    return parsed?.trackName || null;
  } catch {
    return null;
  }
}

function flightsByStudent(flights: SavedFlightListItem[], today: string) {
  const byStudent = new Map<string, Array<{ hours: number; trackId: string | null; trackName: string | null }>>();
  for (const flight of flights) {
    if (!isExecutedFlight(flight, today)) continue;
    const studentId = flight.student_user_id;
    if (!studentId) continue;
    const list = byStudent.get(studentId) ?? [];
    list.push({
      hours: flightHours(flight),
      trackId: flight.training_track_id,
      trackName: snapshotTrackName(flight.training_snapshot_json),
    });
    byStudent.set(studentId, list);
  }
  return byStudent;
}

export function applyCourseFlownHours(
  students: CapacityStudentInput[],
  flights: SavedFlightListItem[],
  today: string,
): CapacityStudentInput[] {
  const byStudent = flightsByStudent(flights, today);
  return students.map((student) => {
    const course = student.courseCode ?? projectionCourseCode(student.trackName);
    return {
      ...student,
      trackId: student.trackId ?? null,
      courseFlownHours: resolveCourseFlownHours({
        careerHours: student.flownHours,
        currentCourse: course,
        currentTrackId: student.trackId ?? null,
        flights: byStudent.get(student.userId) ?? [],
      }),
    };
  });
}

/** Monta o payload da aba Projeções sem a ação nova da função, para teste local. */
export async function loadCapacityProjectionInputsFallback(params: {
  today: string;
  lookbackDays: number;
}): Promise<CapacityProjectionInputs> {
  const today = params.today.slice(0, 10);
  const lookbackDays = Math.min(365, Math.max(30, Math.round(params.lookbackDays || 90)));
  const windowStart = shiftIso(today, -lookbackDays);
  const monthStart = shiftIso(today, -370);

  const [progress, flightsResult, crmProfiles] = await Promise.all([
    getAdminStudentsProgress({ today, inactiveDays: 365 }),
    listAllSavedFlights({ userId: "admin", role: "admin" }, { pageSize: 100, maxItems: 4000 }),
    listStudentCrmProfiles().catch(() => []),
  ]);

  if (flightsResult.error) {
    throw flightsResult.error;
  }

  const crmByStudent = new Map(crmProfiles.map((profile) => [profile.studentUserId, profile.statusName]));
  const weekdayByStudent = new Map<string, number>();
  const weekendByStudent = new Map<string, number>();
  const actualByMonth = new Map<string, CapacityMonthActual>();

  for (const flight of flightsResult.data ?? []) {
    if (!isExecutedFlight(flight, today)) continue;
    const date = (flight.flight_date || "").slice(0, 10);
    const hours = flightHours(flight);
    const weekend = isWeekendIso(date);
    if (date >= monthStart && date <= today) {
      const month = date.slice(0, 7);
      const bucket = actualByMonth.get(month) || { month, weekdayHours: 0, weekendHours: 0 };
      if (weekend) bucket.weekendHours += hours;
      else bucket.weekdayHours += hours;
      actualByMonth.set(month, bucket);
    }
    const studentId = flight.student_user_id;
    if (!studentId || date < windowStart || date > today) continue;
    if (weekend) weekendByStudent.set(studentId, (weekendByStudent.get(studentId) || 0) + hours);
    else weekdayByStudent.set(studentId, (weekdayByStudent.get(studentId) || 0) + hours);
  }

  const students: CapacityStudentInput[] = progress.students.map((row) => {
    const weekday = weekdayByStudent.get(row.userId) || 0;
    const weekend = weekendByStudent.get(row.userId) || 0;
    return {
      userId: row.userId,
      name: row.name,
      email: row.email,
      isActive: row.profile?.isActive !== false,
      daysSinceLastFlight: row.daysSinceLastFlight,
      lastFlightAt: row.executed.lastFlightAt,
      flownHours: round1(row.executed.hours),
      trackId: row.trainingProgress.trackId || null,
      windowWeekdayHours: round1(weekday),
      windowWeekendHours: round1(weekend),
      windowHours: round1(weekday + weekend),
      trackName: row.trainingProgress.trackName || null,
      trackStatus: row.trainingProgress.status || null,
      courseCode: projectionCourseCode(row.trainingProgress.trackName),
      crmStatusName: crmByStudent.get(row.userId) || null,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    today,
    lookbackDays,
    students: applyCourseFlownHours(students, flightsResult.data ?? [], today),
    actuals: [...actualByMonth.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((item) => ({
        month: item.month,
        weekdayHours: round1(item.weekdayHours),
        weekendHours: round1(item.weekendHours),
      })),
  };
}
