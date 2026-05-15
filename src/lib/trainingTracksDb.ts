import { Query } from "appwrite";
import {
  databases,
  ID,
  isAppwriteConfigured,
  SCHOOL_ID,
  STUDENT_TRACKS_COL_ID,
  TRAINING_TRACKS_COL_ID,
} from "./appwrite";
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
const DEFAULT_SCHOOL_ID = SCHOOL_ID ?? "escola_principal";

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
          ? stage.missions.map((mission, missionIndex) => ({
              id: asString(mission.id) || `mission-${stageIndex + 1}-${missionIndex + 1}`,
              name: asString(mission.name) || `Missão ${missionIndex + 1}`,
              durationMinutes: typeof mission.durationMinutes === "number" ? mission.durationMinutes : 60,
              type: normalizeType(mission.type),
              maneuvers: Array.isArray(mission.maneuvers)
                ? mission.maneuvers.map((item) => asString(item)).filter(Boolean)
                : [],
              maneuverSectionId: asString(mission.maneuverSectionId) || null,
              maneuverSectionIds: Array.from(
                new Set([
                  ...asStringArray(mission.maneuverSectionIds),
                  asString(mission.maneuverSectionId),
                ].filter(Boolean)),
              ),
              order: typeof mission.order === "number" ? mission.order : missionIndex + 1,
            }))
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
    if (input.isPrimary) await setPrimaryStudentTrainingTrack(input.studentUserId, input.trackId, schoolId);
    if (existing.documents[0]) {
      await databases.updateDocument(DB_ID, STUDENT_TRACKS_COL_ID, existing.documents[0].$id, {
        status: input.status ?? "active",
        is_primary: Boolean(input.isPrimary),
        updated_at: now,
      });
    } else {
      await databases.createDocument(DB_ID, STUDENT_TRACKS_COL_ID, ID.unique(), {
        school_id: schoolId,
        student_user_id: input.studentUserId,
        track_id: input.trackId,
        status: input.status ?? "active",
        is_primary: Boolean(input.isPrimary),
        assigned_at: now,
        updated_at: now,
      });
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
