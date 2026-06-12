import type { PilotLicense, PilotMedical, PilotRating, ProfileDocumentAttachments, UserRole } from "../lib/rbac";
import type { AvailabilityType } from "./planning";
import type { InstructorPreferenceLevel, SchedulePeriod } from "./schedule";
import type { WeeklyFlightPlanStatus } from "./planning";
import type { StudentTrainingTrack, TrainingSelectionSnapshot } from "./trainingTrack";

export type AdminUserFlight = {
  id: string;
  createdAt: string;
  updatedAt: string;
  sourceFilename: string;
  aircraftIdent: string | null;
  durationSec: number | null;
  flightDate: string | null;
  startTime: string | null;
  route: string;
  landings: number;
  distanceNm: number;
  navigationHours?: number;
  ifrHours?: number;
  nightHours?: number;
  navigationDistanceNm?: number;
  studentName: string;
  studentAnac: string;
  instructorName: string;
  instructorAnac: string;
  scheduleWeekStart: string | null;
  scheduleDemandId: string | null;
  trainingTrackId: string | null;
  trainingStageId: string | null;
  trainingMissionId: string | null;
  trainingMissionIds?: string[];
  trainingSnapshot: TrainingSelectionSnapshot | null;
  studentUserId: string | null;
  instructorUserId: string | null;
};

export type AdminUserPlanItem = {
  position: number;
  durationHours: number;
  flexibilityLevel: string;
  preferredAircraft: string | null;
  priorityLevel: number;
  notes: string | null;
  availability: Array<{
    dayOfWeek: number;
    period: string;
    availabilityType: string;
  }>;
};

export type AdminUserPlannedFlight = {
  id: string;
  weekStart: string;
  status: WeeklyFlightPlanStatus;
  requestedFlightsCount: number;
  totalHours: number;
  updatedAt: string;
  items: AdminUserPlanItem[];
};

export type AdminUserProfileSummary = {
  docId: string | null;
  isActive: boolean;
  fullName: string;
  nickname: string;
  cpf: string;
  phone: string;
  anacCode: string;
  sagaUserId: string;
  anacSyncStatus: string;
  anacLastSyncAt: string;
  instructorPreferenceLevel: InstructorPreferenceLevel;
  instructorAvailability: Array<{
    dayOfWeek: number;
    period: SchedulePeriod;
    availabilityType: AvailabilityType;
  }>;
};

export type AdminUserProfileDetail = AdminUserProfileSummary & {
  birthDate: string;
  weightKg: number | null;
  heightCm: number | null;
  anacRatings: PilotRating[];
  anacLicenses: PilotLicense[];
  anacMedical: PilotMedical;
  anacPhotoFileId: string;
  anacSyncError: string;
  documents?: ProfileDocumentAttachments;
  rg?: string;
  rgOrgaoExpedidor?: string;
  rgDataEmissao?: string;
  endereco?: string;
  cep?: string;
  cidade?: string;
  uf?: string;
  nacionalidade?: string;
  estadoCivil?: string;
  sexo?: string;
  naturalidade?: string;
  filiacaoPai?: string;
  filiacaoMae?: string;
  escolaridade?: string;
  escolaridadePeriodo?: string;
  escolaridadeCurso?: string;
  alergiasMedicamentos?: string;
  emergenciaNome?: string;
  emergenciaParentesco?: string;
  emergenciaEndereco?: string;
  emergenciaTelefone?: string;
};

export type AdminExecutedMetrics = {
  count: number;
  hours: number;
  landings: number;
  navigationHours?: number;
  ifrHours?: number;
  nightHours?: number;
  navigationDistanceNm?: number;
  lastFlightAt: string | null;
};

export type AdminPlannedMetrics = {
  count: number;
  hours: number;
  nextFlightAt: string | null;
};

export type AdminIntentionsMetrics = {
  count: number;
  requestedFlights: number;
  requestedHours: number;
  latestWeekStart: string | null;
};

export type AdminUserSummary = {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  customRoleSlug?: string | null;
  labels: string[];
  emailVerification: boolean;
  createdAt: string;
  profile: AdminUserProfileSummary;
  executed: AdminExecutedMetrics;
  planned: AdminPlannedMetrics;
  intentions: AdminIntentionsMetrics;
  trainingTracks?: StudentTrainingTrack[];
};

export type AdminUserDetail = Omit<AdminUserSummary, "profile"> & {
  referralSource?: string | null;
  profile: AdminUserProfileDetail;
  executedFlights: AdminUserFlight[];
  plannedFlights: AdminUserFlight[];
  futureIntentions: AdminUserPlannedFlight[];
  flights: AdminUserFlight[];
  trainingTracks: StudentTrainingTrack[];
};

export type AdminUsersPage = {
  users: AdminUserSummary[];
  total: number;
  limit: number;
  offset: number;
};

export type AdminUserRecord = AdminUserDetail;
