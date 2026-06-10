import { Query } from "appwrite";
import {
  databases,
  functions,
  ID,
  isAppwriteConfigured,
  DEFAULT_SCHOOL_ID,
  ADMIN_USERS_FUNCTION_ID,
  Permission,
  Role,
  STUDENT_TRACKS_COL_ID,
  TRAINING_TRACKS_COL_ID,
} from "./appwrite";
import { filterClientSidePermissions } from "./appwriteClientPermissions";
import type {
  StudentTrainingTrack,
  StudentTrainingTrackStatus,
  TrainingMission,
  TrainingMissionType,
  TrainingSelectionSnapshot,
  TrainingStage,
  TrainingTrack,
  TrainingTrackInput,
} from "../types/trainingTrack";

const DB_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID as string | undefined;

function configured(): boolean {
  return Boolean(isAppwriteConfigured && databases && DB_ID && TRAINING_TRACKS_COL_ID);
}

function assignmentsConfigured(): boolean {
  return Boolean(configured() && STUDENT_TRACKS_COL_ID);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => asString(item)).filter(Boolean) : [];
}

function parseStages(value: unknown): TrainingStage[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as TrainingStage[];
    if (!Array.isArray(parsed)) return [];
    const normalizeType = (type: unknown): TrainingMissionType => (type === "SL" || type === "PIC" ? type : "DC");
    return parsed
      .map((stage, stageIndex) => ({
        id: asString(stage.id) || `stage-${stageIndex + 1}`,
        name: asString(stage.name) || `Etapa ${stageIndex + 1}`,
        order: typeof stage.order === "number" ? stage.order : stageIndex + 1,
        missions: Array.isArray(stage.missions)
          ? stage.missions.map((mission, missionIndex) => {
              const maneuverSectionIds = Array.from(
                new Set([
                  ...asStringArray(mission.maneuverSectionIds),
                  // Support reading legacy docs that still have the singular field
                  asString((mission as Record<string, unknown>).maneuverSectionId),
                ].filter(Boolean)),
              );
              return {
                id: asString(mission.id) || `mission-${stageIndex + 1}-${missionIndex + 1}`,
                name: asString(mission.name) || `Missão ${missionIndex + 1}`,
                durationMinutes: typeof mission.durationMinutes === "number" ? mission.durationMinutes : 60,
                type: normalizeType(mission.type),
                maneuvers: Array.isArray(mission.maneuvers)
                  ? mission.maneuvers.map((item) => asString(item)).filter(Boolean)
                  : [],
                maneuverSectionIds,
                primaryManeuverSectionIds: asStringArray(mission.primaryManeuverSectionIds).filter((id) =>
                  maneuverSectionIds.includes(id),
                ),
                order: typeof mission.order === "number" ? mission.order : missionIndex + 1,
              };
            })
          : [],
      }))
      .sort((a, b) => a.order - b.order)
      .map((stage) => ({ ...stage, missions: stage.missions.sort((a, b) => a.order - b.order) }));
  } catch {
    return [];
  }
}

export function summarizeStages(stages: TrainingStage[]): { missionCount: number; totalMinutes: number } {
  let missionCount = 0;
  let totalMinutes = 0;
  for (const stage of stages) {
    for (const mission of stage.missions) {
      missionCount += 1;
      totalMinutes += Math.max(0, Math.round(mission.durationMinutes || 0));
    }
  }
  return { missionCount, totalMinutes };
}

function toTrack(doc: Record<string, unknown>): TrainingTrack {
  const stages = parseStages(doc.stages_json);
  const summary = summarizeStages(stages);
  return {
    id: doc.$id as string,
    schoolId: asString(doc.school_id) || DEFAULT_SCHOOL_ID,
    name: asString(doc.name),
    isDefault: Boolean(doc.is_default),
    isActive: Boolean(doc.is_active),
    stages,
    missionCount: typeof doc.mission_count === "number" ? doc.mission_count : summary.missionCount,
    totalMinutes: typeof doc.total_minutes === "number" ? doc.total_minutes : summary.totalMinutes,
    updatedAt: asString(doc.updated_at) || asString(doc.$updatedAt),
    createdAt: asString(doc.$createdAt),
  };
}

function toTrackPayload(input: TrainingTrackInput): Record<string, unknown> {
  const summary = summarizeStages(input.stages);
  return {
    school_id: input.schoolId || DEFAULT_SCHOOL_ID,
    name: input.name,
    is_default: input.isDefault,
    is_active: input.isActive,
    stages_json: JSON.stringify(input.stages),
    mission_count: summary.missionCount,
    total_minutes: summary.totalMinutes,
    updated_at: new Date().toISOString(),
  };
}

async function clearOtherDefaults(trackId: string | null, schoolId: string) {
  if (!databases || !DB_ID || !TRAINING_TRACKS_COL_ID) return;
  const res = await databases.listDocuments(DB_ID, TRAINING_TRACKS_COL_ID, [
    Query.equal("school_id", [schoolId]),
    Query.equal("is_default", [true]),
    Query.limit(100),
  ]);
  await Promise.all(
    res.documents
      .filter((doc) => doc.$id !== trackId)
      .map((doc) => databases!.updateDocument(DB_ID!, TRAINING_TRACKS_COL_ID!, doc.$id, { is_default: false })),
  );
}

export async function listTrainingTracks(options?: {
  includeInactive?: boolean;
  schoolId?: string;
}): Promise<{ data: TrainingTrack[]; error: Error | null }> {
  if (!configured() || !databases || !DB_ID || !TRAINING_TRACKS_COL_ID) return { data: [], error: null };
  try {
    const schoolId = options?.schoolId ?? DEFAULT_SCHOOL_ID;
    const queries = [Query.equal("school_id", [schoolId]), Query.orderAsc("name"), Query.limit(100)];
    if (!options?.includeInactive) queries.splice(1, 0, Query.equal("is_active", [true]));
    const res = await databases.listDocuments(DB_ID, TRAINING_TRACKS_COL_ID, queries);
    const data = res.documents.map((doc) => toTrack(doc as Record<string, unknown>));
    return {
      data: data.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name, "pt-BR")),
      error: null,
    };
  } catch (error) {
    return { data: [], error: error as Error };
  }
}

export async function createTrainingTrack(input: TrainingTrackInput): Promise<{ data: TrainingTrack | null; error: Error | null }> {
  if (!configured() || !databases || !DB_ID || !TRAINING_TRACKS_COL_ID) {
    return { data: null, error: new Error("Coleção de trilhas não configurada.") };
  }
  try {
    if (input.isDefault) await clearOtherDefaults(null, input.schoolId || DEFAULT_SCHOOL_ID);
    const doc = await databases.createDocument(DB_ID, TRAINING_TRACKS_COL_ID, ID.unique(), toTrackPayload(input));
    return { data: toTrack(doc as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

export async function updateTrainingTrack(
  trackId: string,
  input: TrainingTrackInput,
): Promise<{ data: TrainingTrack | null; error: Error | null }> {
  if (!configured() || !databases || !DB_ID || !TRAINING_TRACKS_COL_ID) {
    return { data: null, error: new Error("Coleção de trilhas não configurada.") };
  }
  try {
    if (input.isDefault) await clearOtherDefaults(trackId, input.schoolId || DEFAULT_SCHOOL_ID);
    const doc = await databases.updateDocument(DB_ID, TRAINING_TRACKS_COL_ID, trackId, toTrackPayload(input));
    return { data: toTrack(doc as unknown as Record<string, unknown>), error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
}

function toAssignment(doc: Record<string, unknown>, track: TrainingTrack | null): StudentTrainingTrack {
  const status = asString(doc.status);
  return {
    id: doc.$id as string,
    schoolId: asString(doc.school_id) || DEFAULT_SCHOOL_ID,
    studentUserId: asString(doc.student_user_id),
    trackId: asString(doc.track_id),
    status: status === "completed" || status === "paused" ? status : "active",
    isPrimary: Boolean(doc.is_primary),
    isFlightReviewClubMember: Boolean(doc.is_flight_review_club_member),
    assignedAt: asString(doc.assigned_at),
    updatedAt: asString(doc.updated_at) || asString(doc.$updatedAt),
    track,
  };
}

export async function listStudentTrainingTracks(
  studentUserId: string,
  schoolId = DEFAULT_SCHOOL_ID,
): Promise<{ data: StudentTrainingTrack[]; error: Error | null }> {
  if (!assignmentsConfigured() || !databases || !DB_ID || !STUDENT_TRACKS_COL_ID) return { data: [], error: null };
  try {
    const [assignmentsRes, tracksRes] = await Promise.all([
      databases.listDocuments(DB_ID, STUDENT_TRACKS_COL_ID, [
        Query.equal("school_id", [schoolId]),
        Query.equal("student_user_id", [studentUserId]),
        Query.limit(100),
      ]),
      listTrainingTracks({ includeInactive: true, schoolId }),
    ]);
    const tracksById = new Map((tracksRes.data ?? []).map((track) => [track.id, track]));
    return {
      data: assignmentsRes.documents
        .map((doc) => toAssignment(doc as Record<string, unknown>, tracksById.get(asString(doc.track_id)) ?? null))
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || (a.track?.name ?? "").localeCompare(b.track?.name ?? "", "pt-BR")),
      error: tracksRes.error,
    };
  } catch (error) {
    return { data: [], error: error as Error };
  }
}

export function findTrainingMission(
  track: TrainingTrack | null | undefined,
  missionId: string,
): { stage: TrainingStage; mission: TrainingMission } | null {
  if (!track || !missionId) return null;
  for (const stage of track.stages) {
    const mission = stage.missions.find((row) => row.id === missionId);
    if (mission) return { stage, mission };
  }
  return null;
}

export function buildTrainingSnapshot(
  track: TrainingTrack | null | undefined,
  missionId: string,
): TrainingSelectionSnapshot | null {
  const found = findTrainingMission(track, missionId);
  if (!track || !found) return null;
  return {
    trackId: track.id,
    trackName: track.name,
    stageId: found.stage.id,
    stageName: found.stage.name,
    missionId: found.mission.id,
    missionName: found.mission.name,
    missionType: found.mission.type,
    durationMinutes: found.mission.durationMinutes,
    maneuvers: found.mission.maneuvers,
    maneuverSectionIds: found.mission.maneuverSectionIds ?? [],
    primaryManeuverSectionIds: found.mission.primaryManeuverSectionIds ?? [],
  };
}

/**
 * Lê o training_snapshot_json de um voo, aceitando tanto o formato legado
 * (um único snapshot) quanto o formato com `snapshots` embutido (multi-missão).
 * Retorna a lista de snapshots (primário primeiro), sem duplicar missionId.
 */
export function parseTrainingSnapshotsJson(raw: string | null | undefined): TrainingSelectionSnapshot[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as
      | (TrainingSelectionSnapshot & { snapshots?: TrainingSelectionSnapshot[] })
      | null;
    if (!parsed || typeof parsed !== "object") return [];
    const candidates = [parsed, ...(Array.isArray(parsed.snapshots) ? parsed.snapshots : [])];
    const byMission = new Map<string, TrainingSelectionSnapshot>();
    for (const candidate of candidates) {
      const missionId = String(candidate?.missionId ?? "").trim();
      if (!missionId || byMission.has(missionId)) continue;
      byMission.set(missionId, candidate);
    }
    return [...byMission.values()];
  } catch {
    return [];
  }
}

/**
 * Serializa a seleção de treinamento para o training_snapshot_json do voo.
 * Mantém o snapshot primário na raiz (compatível com leitores legados) e,
 * quando há mais de uma missão, embute a lista completa em `snapshots`.
 */
export function serializeTrainingSnapshotJson(
  primary: TrainingSelectionSnapshot | null | undefined,
  snapshots?: TrainingSelectionSnapshot[] | null,
): string | null {
  const list = (snapshots ?? []).filter((snapshot) => String(snapshot?.missionId ?? "").trim());
  const root = primary ?? list[0] ?? null;
  if (!root) return null;
  const extras = list.filter((snapshot) => snapshot.missionId !== root.missionId);
  if (extras.length === 0) return JSON.stringify(root);
  return JSON.stringify({ ...root, snapshots: [root, ...extras] });
}

const VALID_STATUS_TRANSITIONS: Record<StudentTrainingTrackStatus, StudentTrainingTrackStatus[]> = {
  active: ["paused", "completed"],
  paused: ["active", "completed"],
  completed: ["active"], // completed → paused is semantically invalid
};

function validateStatusTransition(from: StudentTrainingTrackStatus, to: StudentTrainingTrackStatus): void {
  if (!VALID_STATUS_TRANSITIONS[from].includes(to)) {
    throw new Error(`Transição de status inválida: "${from}" → "${to}".`);
  }
}

const DEFAULT_TRACK_NAME = "Programa PP - Cronograma PDF";

export async function getDefaultTrainingTrackId(schoolId = DEFAULT_SCHOOL_ID): Promise<string | null> {
  if (!configured() || !databases || !DB_ID || !TRAINING_TRACKS_COL_ID) return null;

  const querySets = [
    [Query.equal("school_id", [schoolId]), Query.equal("is_default", [true]), Query.equal("is_active", [true])],
    [Query.equal("is_default", [true]), Query.equal("is_active", [true])],
    [Query.equal("school_id", [schoolId]), Query.equal("name", [DEFAULT_TRACK_NAME])],
    [Query.equal("name", [DEFAULT_TRACK_NAME])],
    [Query.equal("school_id", [schoolId]), Query.equal("is_active", [true]), Query.orderAsc("name")],
    [Query.equal("is_active", [true]), Query.orderAsc("name")],
  ];

  for (const queries of querySets) {
    try {
      const res = await databases.listDocuments(DB_ID, TRAINING_TRACKS_COL_ID, [...queries, Query.limit(1)]);
      if (res.documents[0]) return res.documents[0].$id as string;
    } catch {
      // tenta próxima combinação
    }
  }

  return null;
}

function studentTrackDocumentPermissions(studentUserId: string): string[] {
  return filterClientSidePermissions(
    [Permission.read(Role.user(studentUserId)), Permission.read(Role.users())],
    studentUserId,
    "aluno",
  );
}

type EnsureDefaultTrackResult = {
  error: Error | null;
  assigned: boolean;
  trackId: string | null;
};

function parseFunctionTrackBody(responseBody: string | undefined): {
  assigned?: boolean;
  alreadyAssigned?: boolean;
  trackId?: string | null;
  message?: string;
} {
  if (!responseBody) return {};
  try {
    return JSON.parse(responseBody) as ReturnType<typeof parseFunctionTrackBody>;
  } catch {
    return {};
  }
}

async function assignDefaultTrackViaFunction(studentUserId: string): Promise<EnsureDefaultTrackResult> {
  if (!functions || !ADMIN_USERS_FUNCTION_ID) {
    return {
      error: new Error("Função admin-users não configurada (VITE_APPWRITE_ADMIN_USERS_FUNCTION_ID)."),
      assigned: false,
      trackId: null,
    };
  }

  const execution = await functions.createExecution(
    ADMIN_USERS_FUNCTION_ID,
    JSON.stringify({ action: "ensureDefaultStudentTrack", userId: studentUserId }),
    false,
  );
  const body = parseFunctionTrackBody(execution.responseBody);
  const message = body.message ?? "";

  if (execution.status === "failed" || execution.responseStatusCode >= 400) {
    return {
      error: new Error(message || "Falha ao atribuir trilha padrão via função."),
      assigned: false,
      trackId: null,
    };
  }

  if (body.alreadyAssigned || body.assigned) {
    return {
      error: null,
      assigned: Boolean(body.assigned),
      trackId: body.trackId ?? null,
    };
  }

  if (message) {
    return { error: new Error(message), assigned: false, trackId: body.trackId ?? null };
  }

  return { error: null, assigned: false, trackId: null };
}

async function assignDefaultTrackViaClient(
  studentUserId: string,
  schoolId: string,
): Promise<EnsureDefaultTrackResult> {
  const trackId = await getDefaultTrainingTrackId(schoolId);
  if (!trackId) {
    return {
      error: new Error("Nenhuma trilha padrão ativa encontrada na escola."),
      assigned: false,
      trackId: null,
    };
  }

  const result = await assignStudentTrainingTrack({
    studentUserId,
    trackId,
    isPrimary: true,
    schoolId,
  });
  if (result.error) return { error: result.error, assigned: false, trackId: null };
  return { error: null, assigned: true, trackId };
}

/**
 * Atribui a trilha padrão ao aluno se ainda não tiver nenhuma.
 * 1) Função admin-users (API key — não depende de leitura de training_tracks no browser).
 * 2) Fallback: create direto em student_training_tracks (requer create para users na coleção).
 */
export async function ensureDefaultStudentTrainingTrack(
  studentUserId: string,
  schoolId = DEFAULT_SCHOOL_ID,
): Promise<EnsureDefaultTrackResult> {
  if (!studentUserId) return { error: null, assigned: false, trackId: null };
  if (!assignmentsConfigured()) return { error: null, assigned: false, trackId: null };

  const existing = await listStudentTrainingTracks(studentUserId, schoolId);
  if (existing.error) return { error: existing.error, assigned: false, trackId: null };
  if ((existing.data ?? []).length > 0) {
    const primary = existing.data?.find((row) => row.isPrimary) ?? existing.data?.[0];
    return { error: null, assigned: false, trackId: primary?.trackId ?? null };
  }

  const viaFunction = await assignDefaultTrackViaFunction(studentUserId);
  if (!viaFunction.error && (viaFunction.assigned || viaFunction.trackId)) {
    return viaFunction;
  }

  const viaClient = await assignDefaultTrackViaClient(studentUserId, schoolId);
  if (!viaClient.error && viaClient.assigned) {
    return viaClient;
  }

  return {
    error: viaClient.error ?? viaFunction.error ?? new Error("Não foi possível atribuir a trilha padrão."),
    assigned: false,
    trackId: null,
  };
}

export async function assignStudentTrainingTrack(input: {
  schoolId?: string;
  studentUserId: string;
  trackId: string;
  isPrimary?: boolean;
  status?: StudentTrainingTrackStatus;
}): Promise<{ error: Error | null }> {
  if (!assignmentsConfigured() || !databases || !DB_ID || !STUDENT_TRACKS_COL_ID) {
    return { error: new Error("Coleção de trilhas do aluno não configurada.") };
  }
  try {
    const schoolId = input.schoolId ?? DEFAULT_SCHOOL_ID;
    const existing = await databases.listDocuments(DB_ID, STUDENT_TRACKS_COL_ID, [
      Query.equal("school_id", [schoolId]),
      Query.equal("student_user_id", [input.studentUserId]),
      Query.equal("track_id", [input.trackId]),
      Query.limit(1),
    ]);
    const now = new Date().toISOString();
    const newStatus = input.status ?? "active";

    if (existing.documents[0]) {
      const currentStatus = toAssignment(existing.documents[0] as Record<string, unknown>, null).status;
      validateStatusTransition(currentStatus, newStatus);
    }

    // Always call setPrimaryStudentTrainingTrack when touching is_primary to prevent duplicates
    if (input.isPrimary) await setPrimaryStudentTrainingTrack(input.studentUserId, input.trackId, schoolId);

    if (existing.documents[0]) {
      await databases.updateDocument(DB_ID, STUDENT_TRACKS_COL_ID, existing.documents[0].$id, {
        status: newStatus,
        is_primary: Boolean(input.isPrimary),
        updated_at: now,
      });
    } else {
      await databases.createDocument(
        DB_ID,
        STUDENT_TRACKS_COL_ID,
        ID.unique(),
        {
          school_id: schoolId,
          student_user_id: input.studentUserId,
          track_id: input.trackId,
          status: newStatus,
          is_primary: Boolean(input.isPrimary),
          assigned_at: now,
          updated_at: now,
        },
        studentTrackDocumentPermissions(input.studentUserId),
      );
    }
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function setPrimaryStudentTrainingTrack(
  studentUserId: string,
  trackId: string,
  schoolId = DEFAULT_SCHOOL_ID,
): Promise<{ error: Error | null }> {
  if (!assignmentsConfigured() || !databases || !DB_ID || !STUDENT_TRACKS_COL_ID) return { error: null };
  try {
    const res = await databases.listDocuments(DB_ID, STUDENT_TRACKS_COL_ID, [
      Query.equal("school_id", [schoolId]),
      Query.equal("student_user_id", [studentUserId]),
      Query.limit(100),
    ]);
    const now = new Date().toISOString();
    await Promise.all(
      res.documents.map((doc) =>
        databases!.updateDocument(DB_ID!, STUDENT_TRACKS_COL_ID!, doc.$id, {
          is_primary: doc.track_id === trackId,
          updated_at: now,
        }),
      ),
    );
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function removeStudentTrainingTrack(assignmentId: string): Promise<{ error: Error | null }> {
  if (!assignmentsConfigured() || !databases || !DB_ID || !STUDENT_TRACKS_COL_ID) return { error: null };
  try {
    await databases.deleteDocument(DB_ID, STUDENT_TRACKS_COL_ID, assignmentId);
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function setFlightReviewClubMembership(
  assignmentId: string,
  isMember: boolean,
): Promise<{ error: Error | null }> {
  if (!assignmentsConfigured() || !databases || !DB_ID || !STUDENT_TRACKS_COL_ID) {
    return { error: new Error("Coleção de trilhas do aluno não configurada.") };
  }
  try {
    await databases.updateDocument(DB_ID, STUDENT_TRACKS_COL_ID, assignmentId, {
      is_flight_review_club_member: isMember,
      updated_at: new Date().toISOString(),
    });
    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}
