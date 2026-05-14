import { functions, ADMIN_USERS_FUNCTION_ID } from "./appwrite";
import type { UserRole } from "./rbac";
import type { InstructorPreferenceLevel, SchedulePeriod } from "../types/schedule";
import type { AvailabilityType } from "../types/planning";
import type { AdminDashboardData, AdminDashboardParams } from "../types/adminDashboard";
import type { AdminFlightReportPage } from "../types/adminFlightReports";
import type { AdminStudentsProgressData, AdminStudentsProgressParams } from "../types/adminStudents";
import type { AdminUserDetail, AdminUsersPage, AdminUserSummary } from "../types/adminUsers";
import type { StudentCreditInput } from "../types/credits";
import type { StudentTrainingTrack } from "../types/trainingTrack";

type AdminUsersResponse = {
  users?: AdminUserSummary[];
  user?: AdminUserDetail;
  flights?: AdminFlightReportPage["flights"];
  dashboard?: AdminDashboardData;
  studentsProgress?: AdminStudentsProgressData;
  trainingTracks?: StudentTrainingTrack[];
  total?: number;
  limit?: number;
  offset?: number;
  message?: string;
};

function parseResponse(body: string | undefined): AdminUsersResponse {
  if (!body) return {};
  try {
    return JSON.parse(body) as AdminUsersResponse;
  } catch {
    return {};
  }
}

async function executeAdminUsers(payload: Record<string, unknown>): Promise<AdminUsersResponse> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    throw new Error("Função de usuários não configurada. Defina VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID.");
  }

  const execution = await functions.createExecution(ADMIN_USERS_FUNCTION_ID, JSON.stringify(payload), false);
  const response = parseResponse(execution.responseBody);
  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    throw new Error(response.message || "Falha ao executar função de usuários.");
  }
  return response;
}

export async function listAdminUserSummaries(params: {
  search: string;
  limit: number;
  offset: number;
}): Promise<AdminUsersPage> {
  const response = await executeAdminUsers({ action: "listSummaries", ...params });
  return {
    users: response.users ?? [],
    total: response.total ?? response.users?.length ?? 0,
    limit: response.limit ?? params.limit,
    offset: response.offset ?? params.offset,
  };
}

export async function getAdminUserDetail(userId: string): Promise<AdminUserDetail> {
  const response = await executeAdminUsers({ action: "getDetail", userId });
  if (!response.user) throw new Error(response.message || "Usuário não retornado pela função.");
  return response.user;
}

export async function listAdminFlightReports(): Promise<AdminFlightReportPage> {
  const response = await executeAdminUsers({ action: "listFlightReports" });
  return { flights: response.flights ?? [] };
}

export async function getAdminDashboardSummary(params: AdminDashboardParams): Promise<AdminDashboardData> {
  const response = await executeAdminUsers({ action: "getDashboardSummary", ...params });
  if (!response.dashboard) throw new Error(response.message || "Dashboard não retornado pela função.");
  return response.dashboard;
}

export async function getAdminStudentsProgress(params: AdminStudentsProgressParams): Promise<AdminStudentsProgressData> {
  const response = await executeAdminUsers({ action: "getStudentsProgress", ...params });
  if (!response.studentsProgress) throw new Error(response.message || "Painel de alunos não retornado pela função.");
  return response.studentsProgress;
}

export async function updateAdminUserRole(userId: string, role: UserRole): Promise<AdminUserDetail> {
  const response = await executeAdminUsers({ action: "updateRole", userId, role });
  if (!response.user) throw new Error(response.message || "Usuário não retornado pela função.");
  return response.user;
}

export async function updateAdminUserInstructorPreferences(
  user: AdminUserSummary | AdminUserDetail,
  payload: {
    preferenceLevel: InstructorPreferenceLevel;
    availability: Array<{
      dayOfWeek: number;
      period: SchedulePeriod;
      availabilityType: AvailabilityType;
    }>;
  },
): Promise<AdminUserDetail> {
  const response = await executeAdminUsers({
    action: "updateInstructorPreferences",
    userId: user.userId,
    preferenceLevel: payload.preferenceLevel,
    availability: payload.availability,
  });
  if (!response.user) {
    throw new Error(
      response.message ||
        "A função admin-users está desatualizada. Faça o deploy da função para salvar preferências de instrutor.",
    );
  }
  return response.user;
}

export async function assignAdminUserTrainingTrack(
  userId: string,
  trackId: string,
  isPrimary = false,
): Promise<AdminUserDetail> {
  const response = await executeAdminUsers({ action: "assignStudentTrainingTrack", userId, trackId, isPrimary });
  if (!response.user) throw new Error(response.message || "Usuário não retornado pela função.");
  return response.user;
}

export async function setAdminUserPrimaryTrainingTrack(userId: string, trackId: string): Promise<AdminUserDetail> {
  const response = await executeAdminUsers({ action: "setPrimaryStudentTrainingTrack", userId, trackId });
  if (!response.user) throw new Error(response.message || "Usuário não retornado pela função.");
  return response.user;
}

export async function removeAdminUserTrainingTrack(userId: string, assignmentId: string): Promise<AdminUserDetail> {
  const response = await executeAdminUsers({ action: "removeStudentTrainingTrack", userId, assignmentId });
  if (!response.user) throw new Error(response.message || "Usuário não retornado pela função.");
  return response.user;
}

export async function createAdminUserCredit(input: StudentCreditInput): Promise<void> {
  await executeAdminUsers({ action: "createCredit", credit: input });
}

export async function updateAdminUserCredit(creditId: string, input: StudentCreditInput): Promise<void> {
  await executeAdminUsers({ action: "updateCredit", creditId, credit: input });
}

export async function deleteAdminUserCredit(creditId: string, userId: string): Promise<void> {
  await executeAdminUsers({ action: "deleteCredit", creditId, userId });
}

export async function listAdminUsers(search: string): Promise<AdminUserSummary[]> {
  const page = await listAdminUserSummaries({ search, limit: 25, offset: 0 });
  return page.users;
}
