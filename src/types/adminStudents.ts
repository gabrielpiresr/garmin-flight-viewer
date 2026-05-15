import type { AdminUserFlight, AdminUserPlannedFlight, AdminUserProfileSummary } from "./adminUsers";
import type { StudentTrainingTrack } from "./trainingTrack";

export type AdminStudentAgendaBucketKey = "yesterday" | "today" | "tomorrow" | "week";

export type AdminStudentProgressStatus = "active" | "watch" | "inactive" | "noFlights";

export type AdminStudentAgendaBucket = {
  key: AdminStudentAgendaBucketKey;
  label: string;
  students: number;
  flights: number;
  hours: number;
};

export type AdminStudentProgressRow = {
  userId: string;
  email: string;
  name: string;
  profile: AdminUserProfileSummary;
  status: AdminStudentProgressStatus;
  daysSinceLastFlight: number | null;
  executed: {
    count: number;
    hours: number;
    landings: number;
    navigationHours?: number;
    ifrHours?: number;
    nightHours?: number;
    navigationDistanceNm?: number;
    lastFlightAt: string | null;
  };
  planned: {
    count: number;
    hours: number;
    nextFlightAt: string | null;
  };
  intentions: {
    count: number;
    requestedFlights: number;
    requestedHours: number;
    latestWeekStart: string | null;
  };
  trainingProgress: {
    assignmentId: string | null;
    trackId: string | null;
    trackName: string;
    status: string;
    completedMissions: number;
    totalMissions: number;
    percentComplete: number;
  };
  trainingTracks: StudentTrainingTrack[];
  alertCounts: {
    risco: number;
    atencao: number;
    leve: number;
  };
  agenda: Record<AdminStudentAgendaBucketKey, { flights: number; hours: number }>;
  recentExecutedFlights: AdminUserFlight[];
  upcomingFlights: AdminUserFlight[];
  futureIntentions: AdminUserPlannedFlight[];
};

export type AdminStudentsProgressData = {
  generatedAt: string;
  today: string;
  inactiveDays: number;
  summary: {
    totalStudents: number;
    activeStudents: number;
    watchStudents: number;
    inactiveStudents: number;
    studentsWithoutFlights: number;
    totalHours: number;
    totalExecutedFlights: number;
    totalPlannedFlights: number;
  };
  buckets: Record<AdminStudentAgendaBucketKey, AdminStudentAgendaBucket>;
  students: AdminStudentProgressRow[];
};

export type AdminStudentsProgressParams = {
  today: string;
  inactiveDays: number;
};
